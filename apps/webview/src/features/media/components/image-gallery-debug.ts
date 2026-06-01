import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'

const DEBUG_STORAGE_KEY = 'chromvoid:image-gallery-debug'

export type ImageGalleryDebugMeta = Record<string, unknown>

export type ImageDisplaySourceDebugPayload = {
  nodeId: number | null
  variant: string | null
  sourceKind: string | null
  sourceMimeType: string | null
  outputMimeType: string | null
  sourceRevision: number | null
  storageVersion: number | null
  requestIntent: string | null
  schedulerPriority: number | null
  releaseReason: string | null
}

export function createImageDisplaySourceDebugPayload(
  payload: Partial<ImageDisplaySourceDebugPayload> = {},
): ImageDisplaySourceDebugPayload {
  return {
    nodeId: payload.nodeId ?? null,
    variant: payload.variant ?? null,
    sourceKind: payload.sourceKind ?? null,
    sourceMimeType: payload.sourceMimeType ?? null,
    outputMimeType: payload.outputMimeType ?? null,
    sourceRevision: payload.sourceRevision ?? null,
    storageVersion: payload.storageVersion ?? null,
    requestIntent: payload.requestIntent ?? null,
    schedulerPriority: payload.schedulerPriority ?? null,
    releaseReason: payload.releaseReason ?? null,
  }
}

const SAFE_DEBUG_TOKEN_RE = /^[A-Za-z0-9_.:-]{1,80}$/
const SAFE_DEBUG_MESSAGE_RE = /^[A-Za-z0-9 _.,:;()[\]=+'"$-]{1,240}$/
const SAFE_DEBUG_MESSAGE_PREFIX_RE =
  /^(Android image preview decoder|Image derivative|Image preview payload|Image exceeds derivative|Failed to encode|Cannot encode)/

function getStableDebugToken(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const token = value.trim()
  return SAFE_DEBUG_TOKEN_RE.test(token) ? token : null
}

function getStableDebugCode(error: Error): string | null {
  const explicitCode = getStableDebugToken((error as {code?: unknown}).code)
  if (explicitCode) {
    return explicitCode
  }

  const match = error.message.match(/\(([A-Z0-9_:-]{2,80})\)$/)
  return getStableDebugToken(match?.[1])
}

function getStableDebugMessage(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const message = value.replace(/\s+/g, ' ').trim()
  if (!message || message.includes('/') || message.includes('\\')) {
    return null
  }
  if (!SAFE_DEBUG_MESSAGE_PREFIX_RE.test(message) || !SAFE_DEBUG_MESSAGE_RE.test(message)) {
    return null
  }

  return message.length > 240 ? message.slice(0, 240) : message
}

function readDebugOverride(): string | null {
  try {
    if (typeof localStorage === 'undefined') {
      return null
    }

    return localStorage.getItem(DEBUG_STORAGE_KEY)
  } catch {
    return null
  }
}

function isAndroidUserAgent(): boolean {
  try {
    return typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)
  } catch {
    return false
  }
}

function isUnitTestRuntime(): boolean {
  return (
    typeof process !== 'undefined' &&
    (process.env['VITEST'] === 'true' || process.env['NODE_ENV'] === 'test')
  )
}

export function isImageGalleryDebugEnabled(): boolean {
  const override = readDebugOverride()
  if (override === '0' || override === 'false') {
    return false
  }
  if (override === '1' || override === 'true') {
    return true
  }
  if (isUnitTestRuntime()) {
    return false
  }

  const capabilities = getRuntimeCapabilities()
  return capabilities.platform === 'android' || capabilities.mobile || isAndroidUserAgent()
}

export function getImageGalleryDebugTime(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

export function getImageGalleryDebugDurationMs(startedAt: number): number {
  return Math.round(getImageGalleryDebugTime() - startedAt)
}

export function formatImageGalleryDebugError(error: unknown): ImageGalleryDebugMeta {
  if (error instanceof Error) {
    const meta: ImageGalleryDebugMeta = {
      errorName: getStableDebugToken(error.name) ?? 'Error',
    }
    const code = getStableDebugCode(error)
    if (code) {
      meta['code'] = code
    }
    const message = getStableDebugMessage(error.message)
    if (message) {
      meta['errorMessage'] = message
    }
    return meta
  }

  return {
    errorName: 'NonError',
    errorType: typeof error,
  }
}

function formatImageGalleryDebugMetaForLogcat(meta: ImageGalleryDebugMeta): string {
  try {
    return JSON.stringify(meta)
  } catch {
    return '[unserializable-debug-meta]'
  }
}

export function logImageGalleryDebug(
  scope: string,
  event: string,
  meta?: ImageGalleryDebugMeta,
): void {
  if (!isImageGalleryDebugEnabled()) {
    return
  }

  const message = `[debug][image-gallery][${scope}] ${event}`
  if (meta) {
    console.info(message, meta, formatImageGalleryDebugMetaForLogcat(meta))
    return
  }

  console.info(message)
}

export function warnImageGalleryDebug(
  scope: string,
  event: string,
  meta?: ImageGalleryDebugMeta,
): void {
  if (!isImageGalleryDebugEnabled()) {
    return
  }

  const message = `[debug][image-gallery][${scope}] ${event}`
  if (meta) {
    console.warn(message, meta, formatImageGalleryDebugMetaForLogcat(meta))
    return
  }

  console.warn(message)
}
