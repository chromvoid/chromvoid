const MAX_ICON_DIMENSION = 128
const MAX_ICON_BYTES = 64 * 1024
const MIN_VISIBLE_ALPHA = 16
const MIN_BACKGROUND_CONTRAST = 3
const HEX_PREFIX = String.fromCharCode(35)

const BACKEND_MIME_TYPES = new Set(['image/png', 'image/webp', 'image/svg+xml', 'image/x-icon'])
const WEBP_QUALITIES = [0.9, 0.82, 0.74, 0.66, 0.58, 0.5]

export type NormalizedIconPayload = {
  contentBase64: string
  mimeType: string
  width: number
  height: number
  bytes: number
  backgroundColor?: string
}

export async function normalizeIconFromFile(file: File): Promise<NormalizedIconPayload> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  return normalizeIconBytes(bytes, file.type)
}

export async function normalizeIconFromBase64(
  contentBase64: string,
  mimeType?: string,
): Promise<NormalizedIconPayload> {
  return normalizeIconBytes(base64ToBytes(contentBase64), mimeType)
}

export async function deriveIconBackgroundColorFromBase64(
  contentBase64: string,
  mimeType?: string,
): Promise<string | undefined> {
  const bytes = base64ToBytes(contentBase64)
  const requestedMime = normalizeMime(mimeType)
  const detectedMime = sniffMime(bytes)
  const sourceMime =
    requestedMime ?? detectedMime ?? (typeof mimeType === 'string' ? mimeType : 'application/octet-stream')
  if (sourceMime === 'image/svg+xml') return undefined
  const decoded = await tryDecodeImage(bytes, sourceMime)
  if (!decoded) return undefined

  try {
    return resolveIconBackgroundColor(decoded.image, decoded.width, decoded.height)
  } finally {
    decoded.release()
  }
}

async function normalizeIconBytes(bytes: Uint8Array, mimeType?: string): Promise<NormalizedIconPayload> {
  if (bytes.length === 0) {
    throw new Error('Icon payload is empty')
  }

  const requestedMime = normalizeMime(mimeType)
  const detectedMime = sniffMime(bytes)
  const sourceMime = requestedMime ?? detectedMime

  const decodeCandidateMime =
    sourceMime ?? (typeof mimeType === 'string' ? mimeType : 'application/octet-stream')
  const decoded = await tryDecodeImage(bytes, decodeCandidateMime)
  if (decoded) {
    try {
      const width = decoded.width
      const height = decoded.height
      const scale = Math.min(1, MAX_ICON_DIMENSION / width, MAX_ICON_DIMENSION / height)
      const targetWidth = Math.max(1, Math.round(width * scale))
      const targetHeight = Math.max(1, Math.round(height * scale))
      const backgroundColor =
        sourceMime === 'image/svg+xml' ? undefined : resolveIconBackgroundColor(decoded.image, width, height)

      if (
        width <= MAX_ICON_DIMENSION &&
        height <= MAX_ICON_DIMENSION &&
        bytes.length <= MAX_ICON_BYTES &&
        sourceMime !== undefined &&
        BACKEND_MIME_TYPES.has(sourceMime)
      ) {
        return {
          contentBase64: bytesToBase64(bytes),
          mimeType: sourceMime,
          width,
          height,
          bytes: bytes.length,
          backgroundColor,
        }
      }

      const normalized = await rasterize(decoded.image, targetWidth, targetHeight)
      if (!normalized) {
        throw new Error('Failed to normalize icon image')
      }

      if (normalized.bytes.length > MAX_ICON_BYTES) {
        throw new Error('Icon payload exceeds 64 KiB after normalization')
      }

      return {
        contentBase64: bytesToBase64(normalized.bytes),
        mimeType: normalized.mimeType,
        width: targetWidth,
        height: targetHeight,
        bytes: normalized.bytes.length,
        backgroundColor,
      }
    } finally {
      decoded.release()
    }
  }

  if (!sourceMime || !BACKEND_MIME_TYPES.has(sourceMime)) {
    throw new Error('Unsupported icon format')
  }

  if (bytes.length > MAX_ICON_BYTES) {
    throw new Error('Icon payload exceeds 64 KiB')
  }

  return {
    contentBase64: bytesToBase64(bytes),
    mimeType: sourceMime,
    width: 0,
    height: 0,
    bytes: bytes.length,
  }
}

export function pickIconBackgroundColorFromPixels(
  pixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): string | undefined {
  if (width <= 0 || height <= 0 || pixels.length < width * height * 4) {
    return undefined
  }

  let red = 0
  let green = 0
  let blue = 0
  let weight = 0

  for (let offset = 0; offset < width * height * 4; offset += 4) {
    const alpha = pixels[offset + 3] ?? 255
    if (alpha < MIN_VISIBLE_ALPHA) continue

    const pixelWeight = alpha / 255
    red += (pixels[offset] ?? 0) * pixelWeight
    green += (pixels[offset + 1] ?? 0) * pixelWeight
    blue += (pixels[offset + 2] ?? 0) * pixelWeight
    weight += pixelWeight
  }

  if (weight <= 0) return undefined

  const source = {
    r: Math.round(red / weight),
    g: Math.round(green / weight),
    b: Math.round(blue / weight),
  }
  const sourceLuminance = relativeLuminance(source)
  const hsl = rgbToHsl(source.r, source.g, source.b)
  const saturation = clamp(hsl.s * 0.38, 0.16, 0.42)
  const darkBackground = sourceLuminance > 0.45
  let lightness = darkBackground ? 0.14 : 0.86

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = hslToRgb(hsl.h, saturation, lightness)
    if (contrastRatio(sourceLuminance, relativeLuminance(candidate)) >= MIN_BACKGROUND_CONTRAST) {
      return rgbToHex(candidate)
    }
    lightness = darkBackground ? Math.max(0.04, lightness - 0.03) : Math.min(0.96, lightness + 0.03)
  }

  return rgbToHex(darkBackground ? {r: 18, g: 22, b: 26} : {r: 238, g: 242, b: 246})
}

function resolveIconBackgroundColor(
  image: CanvasImageSource,
  width: number,
  height: number,
): string | undefined {
  const canvas = createCanvas(width, height)
  if (!canvas) return undefined

  const context = canvas.getContext('2d')
  if (!context) return undefined

  try {
    context.clearRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)
    return pickIconBackgroundColorFromPixels(context.getImageData(0, 0, width, height).data, width, height)
  } catch {
    return undefined
  }
}

function relativeLuminance(color: {r: number; g: number; b: number}): number {
  const r = linearizeSrgb(color.r)
  const g = linearizeSrgb(color.g)
  const b = linearizeSrgb(color.b)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function linearizeSrgb(value: number): number {
  const channel = clamp(value / 255, 0, 1)
  if (channel <= 0.03928) return channel / 12.92
  return ((channel + 0.055) / 1.055) ** 2.4
}

function contrastRatio(left: number, right: number): number {
  const lighter = Math.max(left, right)
  const darker = Math.min(left, right)
  return (lighter + 0.05) / (darker + 0.05)
}

function rgbToHsl(r: number, g: number, b: number): {h: number; s: number; l: number} {
  const red = clamp(r / 255, 0, 1)
  const green = clamp(g / 255, 0, 1)
  const blue = clamp(b / 255, 0, 1)
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min
  const lightness = (max + min) / 2

  if (delta === 0) {
    return {h: 0, s: 0, l: lightness}
  }

  const saturation = delta / (1 - Math.abs(2 * lightness - 1))
  let hue = 0
  if (max === red) {
    hue = ((green - blue) / delta) % 6
  } else if (max === green) {
    hue = (blue - red) / delta + 2
  } else {
    hue = (red - green) / delta + 4
  }

  return {h: (hue * 60 + 360) % 360, s: saturation, l: lightness}
}

function hslToRgb(h: number, s: number, l: number): {r: number; g: number; b: number} {
  const chroma = (1 - Math.abs(2 * l - 1)) * s
  const hue = h / 60
  const x = chroma * (1 - Math.abs((hue % 2) - 1))
  const match = l - chroma / 2
  let red = 0
  let green = 0
  let blue = 0

  if (hue >= 0 && hue < 1) {
    red = chroma
    green = x
  } else if (hue >= 1 && hue < 2) {
    red = x
    green = chroma
  } else if (hue >= 2 && hue < 3) {
    green = chroma
    blue = x
  } else if (hue >= 3 && hue < 4) {
    green = x
    blue = chroma
  } else if (hue >= 4 && hue < 5) {
    red = x
    blue = chroma
  } else {
    red = chroma
    blue = x
  }

  return {
    r: Math.round((red + match) * 255),
    g: Math.round((green + match) * 255),
    b: Math.round((blue + match) * 255),
  }
}

function rgbToHex(color: {r: number; g: number; b: number}): string {
  return `${HEX_PREFIX}${hexChannel(color.r)}${hexChannel(color.g)}${hexChannel(color.b)}`
}

function hexChannel(value: number): string {
  return clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

type DecodedImage = {
  width: number
  height: number
  image: CanvasImageSource
  release: () => void
}

async function tryDecodeImage(bytes: Uint8Array, mimeType: string): Promise<DecodedImage | undefined> {
  const blob = new Blob([toArrayBuffer(bytes)], {type: mimeType})

  if (typeof globalThis.createImageBitmap === 'function') {
    try {
      const bitmap = await globalThis.createImageBitmap(blob)
      return {
        width: bitmap.width,
        height: bitmap.height,
        image: bitmap,
        release: () => bitmap.close(),
      }
    } catch {}
  }

  if (
    typeof Image === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return undefined
  }

  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) {
    return undefined
  }

  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const width = img.naturalWidth || img.width || 0
      const height = img.naturalHeight || img.height || 0
      URL.revokeObjectURL(url)
      if (width <= 0 || height <= 0) {
        resolve(undefined)
        return
      }
      resolve({
        width,
        height,
        image: img,
        release: () => {},
      })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(undefined)
    }
    img.src = url
  })
}

async function rasterize(
  image: CanvasImageSource,
  width: number,
  height: number,
): Promise<{bytes: Uint8Array; mimeType: string} | undefined> {
  const canvas = createCanvas(width, height)
  if (!canvas) return undefined

  const context = canvas.getContext('2d')
  if (!context) return undefined

  context.clearRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)

  const candidates: Array<{bytes: Uint8Array; mimeType: string}> = []

  for (const quality of WEBP_QUALITIES) {
    const blob = await canvasToBlob(canvas, 'image/webp', quality)
    if (!blob || blob.size === 0) continue
    const bytes = new Uint8Array(await blob.arrayBuffer())
    candidates.push({bytes, mimeType: normalizeMime(blob.type) ?? 'image/webp'})
  }

  const pngBlob = await canvasToBlob(canvas, 'image/png')
  if (pngBlob && pngBlob.size > 0) {
    const bytes = new Uint8Array(await pngBlob.arrayBuffer())
    candidates.push({bytes, mimeType: 'image/png'})
  }

  if (candidates.length === 0) return undefined

  candidates.sort((a, b) => a.bytes.length - b.bytes.length)
  return candidates.find((item) => item.bytes.length <= MAX_ICON_BYTES) ?? candidates[0]
}

type CanvasLike = {
  width: number
  height: number
  getContext: (contextId: '2d') => CanvasRenderingContext2D | null
  toBlob?: (callback: BlobCallback, type?: string, quality?: number) => void
}

function createCanvas(width: number, height: number): CanvasLike | undefined {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return undefined
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

async function canvasToBlob(
  canvas: CanvasLike,
  mimeType: string,
  quality?: number,
): Promise<Blob | undefined> {
  const toBlob = canvas.toBlob
  if (typeof toBlob !== 'function') return undefined
  return new Promise((resolve) => {
    try {
      toBlob.call(canvas, (blob) => resolve(blob ?? undefined), mimeType, quality)
    } catch {
      resolve(undefined)
    }
  })
}

function normalizeMime(mimeType: string | undefined): string | undefined {
  if (!mimeType) return undefined
  const normalized = mimeType.trim().toLowerCase()
  if (!normalized) return undefined
  if (normalized === 'image/vnd.microsoft.icon') return 'image/x-icon'
  return normalized
}

function sniffMime(bytes: Uint8Array): string | undefined {
  if (bytes.length >= 8) {
    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    ) {
      return 'image/png'
    }
  }

  if (bytes.length >= 12) {
    if (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    ) {
      return 'image/webp'
    }
  }

  if (bytes.length >= 4) {
    if (bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x01 && bytes[3] === 0x00) {
      return 'image/x-icon'
    }
  }

  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return 'image/jpeg'
  }

  const head = new TextDecoder()
    .decode(bytes.slice(0, Math.min(bytes.length, 512)))
    .trimStart()
    .toLowerCase()
  if (head.startsWith('<svg') || head.startsWith('<?xml')) {
    return 'image/svg+xml'
  }

  return undefined
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0)
  }
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const start = bytes.byteOffset
  const end = bytes.byteOffset + bytes.byteLength
  const sliced = bytes.buffer.slice(start, end)
  return sliced as ArrayBuffer
}
