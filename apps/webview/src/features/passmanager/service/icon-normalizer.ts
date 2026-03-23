const MAX_ICON_DIMENSION = 128
const MAX_ICON_BYTES = 64 * 1024

const BACKEND_MIME_TYPES = new Set(['image/png', 'image/webp', 'image/svg+xml', 'image/x-icon'])
const WEBP_QUALITIES = [0.9, 0.82, 0.74, 0.66, 0.58, 0.5]

export type NormalizedIconPayload = {
  contentBase64: string
  mimeType: string
  width: number
  height: number
  bytes: number
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
