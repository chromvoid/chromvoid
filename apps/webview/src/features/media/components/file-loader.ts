import {getAppContext} from 'root/shared/services/app-context'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {
  getRuntimeMediaProbeState,
  loopbackHttpProbeAllows,
  mobileNativeVideoProbeAllows,
  peekVideoDecodeSupport,
  probeVideoDecodeSupport,
  type VideoDecodeProbeResult,
} from 'root/core/runtime/runtime-media-probes'
import {runtimeModeModel} from 'root/core/runtime/runtime-mode.model'
import {
  notifyAndroidNativeVideoLifecycleEnd,
  notifyAndroidNativeVideoLifecycleStart,
} from 'root/features/media/models/android-native-video-lifecycle'
import {
  isPlayableAudioMediaFile,
  isPlayableVideoMediaFile,
  isVideoFile,
  resolveFileFormat,
  resolveMediaPlaybackKind,
} from 'root/utils/file-format-registry'
import type {FileMediaInfo} from 'root/core/catalog/media-info'
import type {
  PreparedMediaStreamSource,
  PreparedVideoDelivery,
  PreparedVideoSource,
  PreparedPreviewFileSource,
  PreviewCachePurgeReason,
} from 'root/core/transport/transport'
import {
  createImageDisplaySourceDebugPayload,
  formatImageGalleryDebugError,
  getImageGalleryDebugDurationMs,
  getImageGalleryDebugTime,
  logImageGalleryDebug,
  warnImageGalleryDebug,
} from './image-gallery-debug'
import {
  createMseVideoSourceDescriptor,
  isMseVideoSourceSelectable,
  type MseVideoSourceDescriptor,
} from 'root/features/media/models/mse-video-source-controller'
import {
  cancelImageDisplaySchedulerJobs,
  getDefaultImageDisplayJobPriority,
  getImageDisplaySchedulerDebugSnapshot,
  scheduleImageDisplayJob,
  type ImageDisplaySchedulerJobType,
} from './image-display-scheduler'
import {cancelImageDerivativePrewarmJobs} from './image-derivative-prewarm'
import {
  FileLoadError,
  isDerivativeUnavailableError,
  isMediaBlobFallbackLimitError,
  loadTextFileById,
  saveTextFileById,
  type FileLoadErrorDetails,
  type FileTextLoadOptions,
  type FileTextLoadResult,
  type FileTextSaveOptions,
} from 'root/features/file-manager/services/text-file-io'

export {
  FileLoadError,
  isDerivativeUnavailableError,
  isMediaBlobFallbackLimitError,
  loadTextFileById,
  saveTextFileById,
  type FileLoadErrorDetails,
  type FileTextLoadOptions,
  type FileTextLoadResult,
  type FileTextSaveOptions,
}

export type FileBlobLoadResult = {
  blob: Blob
  url: string
  size: number
  mimeType: string
}

export type FileSourceLoadResult = {
  kind:
    | 'blob'
    | PreparedVideoSource['kind']
    | 'media-stream'
    | PreparedPreviewFileSource['kind']
  url: string
  fallbackUrl?: string
  delivery?: PreparedMediaStreamSource['delivery'] | PreparedVideoDelivery['delivery']
  streamId?: string
  sourceToken?: string
  token?: string
  nativeSourceToken?: string
  provider?: PreparedVideoSource['provider']
  mse?: MseVideoSourceDescriptor
  mediaSourceGeneration?: number
  transportSessionGeneration?: number
  appForegroundEpoch?: number
  size: number
  mimeType: string
  sourceRevision?: number
  blob?: Blob
  release(): void | Promise<void>
}

export type FileBlobLoadOptions = {
  signal?: AbortSignal
  mimeType?: string | null
  lastModified?: number
  sourceSize?: number | null
  variant?: 'raw' | 'preview-image' | 'thumbnail-image'
  derivativeFallback?: 'raw' | 'none'
  preparedSourcePolicy?: 'auto' | 'skip'
  cachePolicy?: 'default' | 'refresh'
  displayJobType?: ImageDisplaySchedulerJobType
  displayJobPriority?: number
  displayJobIntentId?: string
  materializationPriority?: number
  /**
   * Deprecated no-op kept for older call sites while Android video migrates to
   * generic video-source/native-video delivery.
   */
  allowAndroidNativeVideo?: boolean
  mediaInfo?: FileMediaInfo | null
}

export type VideoSourceAttemptDebug = {
  nodeId: number
  fileName: string
  mimeType: string | null
  sourceSize: number | null
  runtimePlatform: string
  transportKind: string
  coreMode: 'local' | 'switching' | 'remote'
  selectedPath:
    | 'desktop-media-stream'
    | 'video-source'
    | 'native-video'
    | 'blob'
    | 'fallback-limited'
    | 'unsupported'
    | 'provider-unavailable'
}

export const MAX_MEDIA_BLOB_FALLBACK_BYTES = 64 * 1024 * 1024
export const MAX_ANDROID_AUDIO_BLOB_FALLBACK_BYTES = 8 * 1024 * 1024
const MAX_BLOB_CACHE = 20
const MAX_BLOB_CACHE_BYTES = 48 * 1024 * 1024
const MAX_SINGLE_BLOB_CACHE_BYTES = 8 * 1024 * 1024
const DERIVATIVE_BLOB_CACHE_FORMAT = 'derivative-v6'
const PREPARED_SOURCE_LOADABILITY_TIMEOUT_MS = 1500
const blobCache = new Map<string, Blob>()
const derivativeNegativeCache = new Map<string, DerivativeNegativeCacheEntry>()
const activePreparedSources = new Map<string, {release: () => Promise<void>}>()
let blobCacheBytes = 0
type FileBlobVariant = NonNullable<FileBlobLoadOptions['variant']>
type FileBlobDerivativeFallback = NonNullable<FileBlobLoadOptions['derivativeFallback']>
type DerivativeDisplayVariant = Extract<FileBlobVariant, 'preview-image' | 'thumbnail-image'>
type DerivativeNegativeCacheCode = 'PREVIEW_DECODE' | 'DERIVATIVE_UNAVAILABLE'
type DerivativeNegativeCacheEntry = {
  code: DerivativeNegativeCacheCode
  message: string | null
  firstFailedAt: number
}
type PreparedSourceLoadability = 'unknown' | 'supported' | 'unsupported'
let preparedSourceLoadability: PreparedSourceLoadability = 'unknown'

class PreparedSourceLoadabilityError extends Error {
  constructor(readonly url: string) {
    super('PREPARED_SOURCE_UNLOADABLE')
    this.name = 'PreparedSourceLoadabilityError'
  }
}

function getPreparedSourceSchedulerDebugPayload(): Record<string, number> {
  const snapshot = getImageDisplaySchedulerDebugSnapshot()
  return {
    schedulerActiveCount: snapshot.activeCount,
    schedulerQueuedCount: snapshot.queuedCount,
    schedulerPreparedSourceActiveCount: snapshot.activeByType['prepared-source'],
    schedulerPreparedSourceQueuedCount: snapshot.queuedByType['prepared-source'],
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const start = bytes.byteOffset
  const end = bytes.byteOffset + bytes.byteLength
  const sliced = bytes.buffer.slice(start, end)
  return sliced as ArrayBuffer
}

function getBlobCacheKey(
  fileId: number,
  variant: FileBlobVariant,
  lastModified?: number,
  derivativeFallback?: FileBlobDerivativeFallback,
): string {
  const fallbackPart =
    variant === 'preview-image' || variant === 'thumbnail-image'
      ? `:${DERIVATIVE_BLOB_CACHE_FORMAT}:${derivativeFallback ?? 'raw'}`
      : ''
  return `${variant}${fallbackPart}:${fileId}:${lastModified ?? 0}`
}

function cacheDelete(key: string) {
  const existing = blobCache.get(key)
  if (!existing) return

  blobCacheBytes -= existing.size
  blobCache.delete(key)
}

function isDerivativeDisplayVariant(variant: FileBlobVariant): variant is DerivativeDisplayVariant {
  return variant === 'preview-image' || variant === 'thumbnail-image'
}

function getDerivativeNegativeCacheKey(
  fileId: number,
  variant: DerivativeDisplayVariant,
  lastModified: number | undefined,
  derivativeFallback: FileBlobDerivativeFallback,
): string {
  return getBlobCacheKey(fileId, variant, lastModified, derivativeFallback)
}

function getNegativeCacheMessage(error: unknown): string | null {
  const formatted = formatImageGalleryDebugError(error)
  const message = formatted['errorMessage']
  return typeof message === 'string' ? message : null
}

function getStableErrorCode(error: unknown): string | null {
  if (!(error instanceof Error)) {
    return null
  }

  const explicitCode = (error as {code?: unknown}).code
  if (typeof explicitCode === 'string' && explicitCode.trim()) {
    return explicitCode.trim()
  }

  const match = error.message.match(/\(([A-Z0-9_:-]{2,80})\)$/)
  return match?.[1] ?? null
}

function isAudioArtworkDerivativeRequest(
  fileName: string,
  mimeType: string | null | undefined,
  mediaInfo?: FileMediaInfo | null,
): boolean {
  return isPlayableAudioMediaFile(mediaFormatInput(fileName, mimeType, mediaInfo))
}

function isExpectedAudioArtworkUnavailableError(error: unknown): boolean {
  const code = getStableErrorCode(error)
  if (code === 'UNSUPPORTED' || code === 'DERIVATIVE_UNAVAILABLE') {
    return true
  }

  return error instanceof Error && error.message.includes('Embedded audio artwork is unavailable')
}

function classifyDerivativeFailure(
  error: unknown,
  fileName: string,
  mimeType: string | null | undefined,
  mediaInfo?: FileMediaInfo | null,
): DerivativeNegativeCacheCode | null {
  if (isAbortError(error)) {
    return null
  }

  const code = getStableErrorCode(error)
  if (code === 'DERIVATIVE_UNAVAILABLE') {
    return 'DERIVATIVE_UNAVAILABLE'
  }

  if (code === 'PREVIEW_DECODE') {
    return 'PREVIEW_DECODE'
  }

  if (error instanceof Error && error.message.includes('PREVIEW_DECODE')) {
    return 'PREVIEW_DECODE'
  }

  if (
    isAudioArtworkDerivativeRequest(fileName, mimeType, mediaInfo) &&
    isExpectedAudioArtworkUnavailableError(error)
  ) {
    return 'DERIVATIVE_UNAVAILABLE'
  }

  return null
}

function rememberDerivativeNegativeCache(
  fileId: number,
  variant: DerivativeDisplayVariant,
  derivativeFallback: FileBlobDerivativeFallback,
  lastModified: number | undefined,
  code: DerivativeNegativeCacheCode,
  error: unknown,
): void {
  derivativeNegativeCache.set(
    getDerivativeNegativeCacheKey(fileId, variant, lastModified, derivativeFallback),
    {
      code,
      message: getNegativeCacheMessage(error),
      firstFailedAt: getImageGalleryDebugTime(),
    },
  )
}

function clearDerivativeNegativeCache(
  fileId: number,
  variant: FileBlobVariant,
  derivativeFallback: FileBlobDerivativeFallback,
  lastModified: number | undefined,
): void {
  if (!isDerivativeDisplayVariant(variant)) {
    return
  }

  derivativeNegativeCache.delete(
    getDerivativeNegativeCacheKey(fileId, variant, lastModified, derivativeFallback),
  )
}

function getDerivativeNegativeCacheEntry(
  fileId: number,
  variant: DerivativeDisplayVariant,
  derivativeFallback: FileBlobDerivativeFallback,
  lastModified: number | undefined,
): DerivativeNegativeCacheEntry | null {
  return (
    derivativeNegativeCache.get(
      getDerivativeNegativeCacheKey(fileId, variant, lastModified, derivativeFallback),
    ) ?? null
  )
}

function cachePut(
  fileId: number,
  variant: FileBlobVariant,
  blob: Blob,
  lastModified?: number,
  derivativeFallback?: FileBlobDerivativeFallback,
) {
  const cacheKey = getBlobCacheKey(fileId, variant, lastModified, derivativeFallback)
  cacheDelete(cacheKey)
  derivativeNegativeCache.delete(cacheKey)

  if (blob.size > MAX_SINGLE_BLOB_CACHE_BYTES) {
    return
  }

  blobCache.set(cacheKey, blob)
  blobCacheBytes += blob.size
  while (blobCache.size > MAX_BLOB_CACHE || blobCacheBytes > MAX_BLOB_CACHE_BYTES) {
    const oldest = blobCache.keys().next().value
    if (oldest !== undefined) {
      cacheDelete(oldest)
    } else {
      break
    }
  }
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }
}

function toOptionalSourceSize(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null
  }

  return Math.floor(value)
}

function getAuthoritativeSourceSize(fileId: number, options?: FileBlobLoadOptions): number | null {
  const optionSize = toOptionalSourceSize(options?.sourceSize)
  if (optionSize !== null) {
    return optionSize
  }

  try {
    const catalog = getAppContext().catalog as {
      catalog?: {getNode?: (id: number) => {size?: unknown} | undefined}
    }
    return toOptionalSourceSize(catalog.catalog?.getNode?.(fileId)?.size)
  } catch {
    return null
  }
}

function getCoreModeDebugLabel(): VideoSourceAttemptDebug['coreMode'] {
  const mode = runtimeModeModel.coreMode()
  if (mode === 'local' || mode === 'switching') {
    return mode
  }

  return 'remote'
}

function getDebugFileName(fileName: string): string {
  return fileName.split(/[\\/]/).pop()?.slice(0, 240) ?? ''
}

function createVideoSourceAttemptDebug(payload: {
  fileId: number
  fileName: string
  mimeType: string | null
  sourceSize: number | null
  transportKind: string
  selectedPath: VideoSourceAttemptDebug['selectedPath']
}): VideoSourceAttemptDebug {
  return {
    nodeId: payload.fileId,
    fileName: getDebugFileName(payload.fileName),
    mimeType: payload.mimeType,
    sourceSize: payload.sourceSize,
    runtimePlatform: getRuntimeCapabilities().platform,
    transportKind: payload.transportKind,
    coreMode: getCoreModeDebugLabel(),
    selectedPath: payload.selectedPath,
  }
}

function logVideoSourceAttempt(
  fileId: number,
  fileName: string,
  mimeType: string,
  variant: FileBlobVariant,
  transportKind: string,
  selectedPath: VideoSourceAttemptDebug['selectedPath'],
  sourceSize: number | null,
): void {
  if (variant !== 'raw' || !isVideoFile(fileName, mimeType)) {
    return
  }

  const meta = {
    ...createImageDisplaySourceDebugPayload({
      nodeId: fileId,
      variant,
      sourceKind: 'video-source-attempt',
      sourceMimeType: mimeType,
      requestIntent: variant,
    }),
    ...createVideoSourceAttemptDebug({
      fileId,
      fileName,
      mimeType,
      sourceSize,
      transportKind,
      selectedPath,
    }),
  }

  if (selectedPath === 'fallback-limited' || selectedPath === 'unsupported') {
    warnImageGalleryDebug('file-loader', 'video-source.attempt', meta)
    return
  }

  logImageGalleryDebug('file-loader', 'video-source.attempt', meta)
}

function mediaFormatInput(
  fileName: string,
  mimeType: string | null | undefined,
  mediaInfo?: FileMediaInfo | null,
) {
  return {name: fileName, mimeType, mediaInfo}
}

function targetVideoPlatform(): boolean {
  const platform = getRuntimeCapabilities().platform
  return platform === 'android' || platform === 'macos'
}

function isTargetRawVideoRequest(
  transportKind: string,
  fileName: string,
  mimeType: string,
  variant: FileBlobVariant,
  mediaInfo?: FileMediaInfo | null,
): boolean {
  return (
    transportKind === 'tauri' &&
    variant === 'raw' &&
    targetVideoPlatform() &&
    isPlayableVideoMediaFile(mediaFormatInput(fileName, mimeType, mediaInfo))
  )
}

function effectiveMediaMimeType(fileName: string, options?: FileBlobLoadOptions): string {
  return (
    options?.mediaInfo?.playbackMimeType?.trim() ||
    options?.mimeType?.trim() ||
    resolveFileFormat({
      name: fileName,
      mimeType: options?.mimeType,
      mediaInfo: options?.mediaInfo,
    }).mimeType
  )
}

function isPlayableRawMediaFile(
  fileName: string,
  mimeType: string,
  mediaInfo?: FileMediaInfo | null,
): boolean {
  const input = mediaFormatInput(fileName, mimeType, mediaInfo)
  return isPlayableVideoMediaFile(input) || isPlayableAudioMediaFile(input)
}

function getMediaBlobFallbackLimitBytes(
  fileName: string,
  mimeType: string,
  mediaInfo?: FileMediaInfo | null,
): number {
  const capabilities = getRuntimeCapabilities()
  if (
    capabilities.platform === 'android' &&
    capabilities.mobile &&
    isPlayableAudioMediaFile(mediaFormatInput(fileName, mimeType, mediaInfo))
  ) {
    return MAX_ANDROID_AUDIO_BLOB_FALLBACK_BYTES
  }

  return MAX_MEDIA_BLOB_FALLBACK_BYTES
}

function assertMediaBlobFallbackAllowed(
  fileId: number,
  fileName: string,
  mimeType: string,
  variant: FileBlobVariant,
  options?: FileBlobLoadOptions,
  transportKind = 'unknown',
): void {
  if (variant !== 'raw') {
    return
  }

  const input = mediaFormatInput(fileName, mimeType, options?.mediaInfo)
  const playbackKind = resolveMediaPlaybackKind(input)
  if (transportKind === 'tauri' && playbackKind === 'video' && targetVideoPlatform()) {
    const sourceSize = getAuthoritativeSourceSize(fileId, options)
    logVideoSourceAttempt(
      fileId,
      fileName,
      mimeType,
      variant,
      transportKind,
      'provider-unavailable',
      sourceSize,
    )
    throw createVideoSourceLoadError('MEDIA_VIDEO_PROVIDER_UNAVAILABLE', 'provider-unavailable', {
      sourceSize,
      fallbackLimitBytes: MAX_MEDIA_BLOB_FALLBACK_BYTES,
    })
  }
  if (transportKind === 'tauri' && playbackKind === 'video') {
    const sourceSize = getAuthoritativeSourceSize(fileId, options)
    logVideoSourceAttempt(
      fileId,
      fileName,
      mimeType,
      variant,
      transportKind,
      'fallback-limited',
      sourceSize,
    )
    throw createMediaBlobFallbackLimitError(
      `MEDIA_BLOB_FALLBACK_LIMIT:video-source-required:${MAX_MEDIA_BLOB_FALLBACK_BYTES}`,
      sourceSize,
      MAX_MEDIA_BLOB_FALLBACK_BYTES,
      'video-source-required',
    )
  }
  if (
    playbackKind !== 'audio' &&
    isVideoFile(fileName, mimeType) &&
    !isPlayableVideoMediaFile(input)
  ) {
    const sourceSize = getAuthoritativeSourceSize(fileId, options)
    logVideoSourceAttempt(fileId, fileName, mimeType, variant, transportKind, 'unsupported', sourceSize)
    if (transportKind === 'tauri' && targetVideoPlatform()) {
      throw createVideoSourceLoadError('MEDIA_VIDEO_UNSUPPORTED', 'unsupported', {
        sourceSize,
        fallbackLimitBytes: MAX_MEDIA_BLOB_FALLBACK_BYTES,
      })
    }
    throw createMediaBlobFallbackLimitError(
      `MEDIA_BLOB_FALLBACK_LIMIT:unsupported:${MAX_MEDIA_BLOB_FALLBACK_BYTES}`,
      sourceSize,
      MAX_MEDIA_BLOB_FALLBACK_BYTES,
      'unsupported',
    )
  }

  if (!isPlayableRawMediaFile(fileName, mimeType, options?.mediaInfo)) {
    return
  }

  const fallbackLimitBytes = getMediaBlobFallbackLimitBytes(fileName, mimeType, options?.mediaInfo)
  const sourceSize = getAuthoritativeSourceSize(fileId, options)
  if (runtimeModeModel.remoteCoreMode()) {
    logVideoSourceAttempt(
      fileId,
      fileName,
      mimeType,
      variant,
      transportKind,
      'fallback-limited',
      sourceSize,
    )
    throw createMediaBlobFallbackLimitError(
      `MEDIA_BLOB_FALLBACK_LIMIT:remote-stream-required:${fallbackLimitBytes}`,
      sourceSize,
      fallbackLimitBytes,
      'remote-media-stream-required',
    )
  }

  if (sourceSize !== null && sourceSize <= fallbackLimitBytes) {
    logVideoSourceAttempt(fileId, fileName, mimeType, variant, transportKind, 'blob', sourceSize)
    return
  }

  logVideoSourceAttempt(
    fileId,
    fileName,
    mimeType,
    variant,
    transportKind,
    'fallback-limited',
    sourceSize,
  )

  throw createMediaBlobFallbackLimitError(
    `MEDIA_BLOB_FALLBACK_LIMIT:${sourceSize ?? 'unknown'}:${fallbackLimitBytes}`,
    sourceSize,
    fallbackLimitBytes,
    'source-size-limit',
  )
}

function isAbortError(error: unknown): error is DOMException {
  return error instanceof DOMException && error.name === 'AbortError'
}

function shouldProbePreparedSourceLoadability(source: PreparedPreviewFileSource): boolean {
  return (
    getRuntimeCapabilities().mobile &&
    source.kind === 'asset-file' &&
    preparedSourceLoadability === 'unknown'
  )
}

function shouldSkipPreparedSourceForRuntime(): boolean {
  return getRuntimeCapabilities().mobile && preparedSourceLoadability === 'unsupported'
}

function shouldUsePreparedSourceForRequest(
  fileName: string,
  mimeType: string,
  variant: FileBlobVariant,
  mediaInfo?: FileMediaInfo | null,
): boolean {
  return variant !== 'raw' || resolveMediaPlaybackKind(mediaFormatInput(fileName, mimeType, mediaInfo)) === null
}

function shouldUseMediaStreamForRequest(
  transportKind: string,
  fileName: string,
  mimeType: string,
  variant: FileBlobVariant,
  mediaInfo?: FileMediaInfo | null,
): boolean {
  if (isTargetRawVideoRequest(transportKind, fileName, mimeType, variant, mediaInfo)) {
    return false
  }

  return (
    variant === 'raw' &&
    resolveMediaPlaybackKind(mediaFormatInput(fileName, mimeType, mediaInfo)) !== null &&
    runtimeModeModel.canUseMediaStreamSource({transportKind})
  )
}

function shouldUseVideoSourceForRequest(
  transportKind: string,
  fileName: string,
  mimeType: string,
  variant: FileBlobVariant,
  mediaInfo?: FileMediaInfo | null,
): boolean {
  if (transportKind !== 'tauri' || variant !== 'raw') return false
  if (!isPlayableVideoMediaFile(mediaFormatInput(fileName, mimeType, mediaInfo))) return false

  const capabilities = getRuntimeCapabilities()
  if (capabilities.mobile) {
    return runtimeModeModel.canUseMobileNativeVideoSource({transportKind})
  }

  return runtimeModeModel.canUseHttpVideoSource({transportKind})
}

function throwIfVideoDecodeUnsupported(
  fileId: number,
  fileName: string,
  mimeType: string,
  decodeSupport: VideoDecodeProbeResult,
  options?: FileBlobLoadOptions,
): void {
  if (decodeSupport.supported) {
    return
  }
  const sourceSize = getAuthoritativeSourceSize(fileId, options)
  logVideoSourceAttempt(
    fileId,
    fileName,
    mimeType,
    options?.variant ?? 'raw',
    'tauri',
    'unsupported',
    sourceSize,
  )
  throw createVideoSourceLoadError(
    'MEDIA_VIDEO_UNSUPPORTED',
    decodeSupport.reason ?? 'unsupported-codec',
    {sourceSize, fallbackLimitBytes: MAX_MEDIA_BLOB_FALLBACK_BYTES},
  )
}

function assertVideoSourceRuntimeProbeSupport(
  fileId: number,
  fileName: string,
  mimeType: string,
  options?: FileBlobLoadOptions,
): void {
  const sourceSize = getAuthoritativeSourceSize(fileId, options)
  const mediaProbes = getRuntimeMediaProbeState()
  const capabilities = getRuntimeCapabilities()
  if (capabilities.desktop && !loopbackHttpProbeAllows(mediaProbes)) {
    logVideoSourceAttempt(
      fileId,
      fileName,
      mimeType,
      options?.variant ?? 'raw',
      'tauri',
      'provider-unavailable',
      sourceSize,
    )
    throw createVideoSourceLoadError('MEDIA_VIDEO_PROVIDER_UNAVAILABLE', 'loopback-http-probe-unavailable', {
      sourceSize,
      fallbackLimitBytes: MAX_MEDIA_BLOB_FALLBACK_BYTES,
    })
  }

  if (capabilities.mobile && !mobileNativeVideoProbeAllows(mediaProbes)) {
    logVideoSourceAttempt(
      fileId,
      fileName,
      mimeType,
      options?.variant ?? 'raw',
      'tauri',
      'provider-unavailable',
      sourceSize,
    )
    throw createVideoSourceLoadError('MEDIA_VIDEO_PROVIDER_UNAVAILABLE', 'native-video-probe-unavailable', {
      sourceSize,
      fallbackLimitBytes: MAX_MEDIA_BLOB_FALLBACK_BYTES,
    })
  }
}

async function probePreparedSourceLoadability(url: string, signal?: AbortSignal): Promise<boolean> {
  throwIfAborted(signal)

  if (typeof Image === 'undefined') {
    return false
  }

  return await new Promise<boolean>((resolve, reject) => {
    const image = new Image()
    let settled = false
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const cleanup = () => {
      image.onload = null
      image.onerror = null
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId)
      }
      signal?.removeEventListener('abort', handleAbort)
    }

    const finish = (result: boolean) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(result)
    }

    const handleAbort = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(new DOMException('Aborted', 'AbortError'))
    }

    image.onload = () => finish(true)
    image.onerror = () => finish(false)
    timeoutId = setTimeout(() => finish(false), PREPARED_SOURCE_LOADABILITY_TIMEOUT_MS)
    signal?.addEventListener('abort', handleAbort, {once: true})
    image.decoding = 'async'
    image.src = url
  })
}

function trackPreparedSource(
  fileId: number,
  variant: FileBlobVariant,
  source: PreparedPreviewFileSource,
  releasePreviewFile: ((source: PreparedPreviewFileSource) => Promise<void>) | undefined,
): () => Promise<void> {
  let released = false
  const release = async () => {
    if (released) return
    released = true
    activePreparedSources.delete(source.previewId)
    logImageGalleryDebug('file-loader', 'prepared-source.release', {
      ...createImageDisplaySourceDebugPayload({
        nodeId: fileId,
        variant,
        sourceKind: source.kind,
        outputMimeType: source.mimeType,
        releaseReason: 'release',
      }),
      size: source.size,
      activePreparedSourceCount: activePreparedSources.size,
    })
    await releasePreviewFile?.(source)
  }

  activePreparedSources.set(source.previewId, {release})
  return release
}

function trackMediaStreamSource(
  fileId: number,
  variant: FileBlobVariant,
  source: PreparedMediaStreamSource,
  releaseMediaStream: ((source: PreparedMediaStreamSource) => Promise<void>) | undefined,
): () => Promise<void> {
  let released = false
  return async () => {
    if (released) return
    released = true
    logImageGalleryDebug('file-loader', 'media-stream.release', {
      ...createImageDisplaySourceDebugPayload({
        nodeId: fileId,
        variant,
        sourceKind: 'media-stream',
        outputMimeType: source.mimeType,
        sourceRevision: source.sourceRevision,
        releaseReason: 'release',
      }),
      streamIdPresent: Boolean(source.streamId),
      delivery: source.delivery ?? 'custom-scheme',
      size: source.size,
    })
    await releaseMediaStream?.(source)
  }
}

function selectedVideoDelivery(
  source: PreparedVideoSource,
  mediaInfo?: FileMediaInfo | null,
): PreparedVideoDelivery | null {
  const capabilities = getRuntimeCapabilities()
  if (capabilities.mobile) {
    if (!runtimeModeModel.canUseMobileNativeVideoSource({transportKind: 'tauri'})) return null
    return source.deliveries.find(isMobileNativeVideoDelivery) ?? null
  }

  if (capabilities.desktop) {
    const nativeDelivery = runtimeModeModel.canUseDesktopNativeVideoSource({transportKind: 'tauri'})
      ? source.deliveries.find(isDesktopNativeVideoDelivery)
      : null
    if (nativeDelivery) return nativeDelivery

    const mseDelivery = source.deliveries.find(isDesktopMseDelivery)
    if (mseDelivery && isMseDeliverySelectable(mseDelivery, source.mimeType, mediaInfo)) return mseDelivery

    if (!runtimeModeModel.canUseHttpVideoSource({transportKind: 'tauri'})) return null
    return source.deliveries.find(isDesktopLoopbackHttpDelivery) ?? null
  }

  return null
}

function isDesktopLoopbackHttpDelivery(delivery: PreparedVideoDelivery): boolean {
  return delivery.delivery === 'loopback-http' && delivery.platform === 'desktop'
}

function isDesktopMseDelivery(delivery: PreparedVideoDelivery): boolean {
  return delivery.delivery === 'mse' && delivery.platform === 'desktop'
}

function isDesktopNativeVideoDelivery(delivery: PreparedVideoDelivery): boolean {
  return delivery.delivery === 'native-video' && delivery.platform === 'desktop'
}

function isMobileNativeVideoDelivery(delivery: PreparedVideoDelivery): boolean {
  return delivery.delivery === 'native-video' && delivery.platform === 'mobile'
}

function isMseDeliverySelectable(
  delivery: PreparedVideoDelivery,
  mimeType: string,
  mediaInfo?: FileMediaInfo | null,
): boolean {
  return (
    runtimeModeModel.canUseMseVideoPlayback({transportKind: 'tauri'}) &&
    isMseVideoSourceSelectable({delivery, mimeType, mediaInfo})
  )
}

function trackVideoSource(
  fileId: number,
  variant: FileBlobVariant,
  source: PreparedVideoSource,
  releaseMediaSource: ((source: PreparedVideoSource) => Promise<void>) | undefined,
  delivery: PreparedVideoDelivery,
): () => Promise<void> {
  let released = false
  return async () => {
    if (released) return
    released = true
    logImageGalleryDebug('file-loader', 'video-source.release', {
      ...createImageDisplaySourceDebugPayload({
        nodeId: fileId,
        variant,
        sourceKind: 'video-source',
        outputMimeType: source.mimeType,
        sourceRevision: source.sourceRevision,
        releaseReason: 'release',
      }),
      streamId: source.streamId,
      delivery: delivery.delivery,
      provider: source.provider,
      sourceTokenPresent: Boolean(source.sourceToken),
      nativeSourceTokenPresent:
        delivery.delivery === 'native-video' && Boolean(delivery.nativeSourceToken),
      mediaSourceGeneration: source.mediaSourceGeneration,
      transportSessionGeneration: source.transportSessionGeneration ?? null,
      size: source.size,
    })
    try {
      await releaseMediaSource?.(source)
    } finally {
      if (delivery.delivery === 'native-video') {
        notifyAndroidNativeVideoLifecycleEnd()
      }
    }
  }
}

export async function releaseActivePreparedFileSources(): Promise<void> {
  const releases = Array.from(activePreparedSources.values(), ({release}) => release())
  await Promise.allSettled(releases)
}

export async function cancelPreparedFileSourceWorkForLockIntent(
  reason: PreviewCachePurgeReason = 'vault-lock',
): Promise<void> {
  logImageGalleryDebug('file-loader', 'prepared-source.lock-intent-cancel-start', {
    ...createImageDisplaySourceDebugPayload({
      sourceKind: 'prepared-source',
      releaseReason: reason,
    }),
    activePreparedSourceCount: activePreparedSources.size,
  })
  cancelImageDerivativePrewarmJobs()
  cancelImageDisplaySchedulerJobs()
  await releaseActivePreparedFileSources()
  logImageGalleryDebug('file-loader', 'prepared-source.lock-intent-cancel-done', {
    ...createImageDisplaySourceDebugPayload({
      sourceKind: 'prepared-source',
      releaseReason: reason,
    }),
    activePreparedSourceCount: activePreparedSources.size,
  })
}

export async function purgePreparedFileSources(reason: PreviewCachePurgeReason): Promise<void> {
  const {ws} = getAppContext()
  logImageGalleryDebug('file-loader', 'prepared-source.purge-start', {
    ...createImageDisplaySourceDebugPayload({
      sourceKind: 'prepared-source',
      releaseReason: reason,
    }),
    reason,
    activePreparedSourceCount: activePreparedSources.size,
  })
  await cancelPreparedFileSourceWorkForLockIntent(reason)
  await ws.purgePreviewSources?.(reason)
  logImageGalleryDebug('file-loader', 'prepared-source.purge-done', {
    ...createImageDisplaySourceDebugPayload({
      sourceKind: 'prepared-source',
      releaseReason: reason,
    }),
    reason,
    activePreparedSourceCount: activePreparedSources.size,
  })
}

export function getActivePreparedFileSourceCountForTests(): number {
  return activePreparedSources.size
}

export function resetPreparedSourceLoadabilityForTests(): void {
  preparedSourceLoadability = 'unknown'
}

export function resetDerivativeNegativeCacheForTests(): void {
  derivativeNegativeCache.clear()
}

function createDerivativeLoadError(
  variant: DerivativeDisplayVariant,
  details: FileLoadErrorDetails = {},
) {
  return new FileLoadError('DERIVATIVE_UNAVAILABLE', `DERIVATIVE_UNAVAILABLE:${variant}`, {
    variant,
    reason: 'derivative-unavailable',
    ...details,
  })
}

function createMediaBlobFallbackLimitError(
  message: string,
  sourceSize: number | null,
  fallbackLimitBytes: number,
  reason: string,
) {
  return new FileLoadError('MEDIA_BLOB_FALLBACK_LIMIT', message, {
    sourceSize,
    fallbackLimitBytes,
    reason,
  })
}

function createVideoSourceLoadError(
  code:
    | 'MEDIA_VIDEO_SOURCE_FAILED'
    | 'MEDIA_VIDEO_UNSUPPORTED'
    | 'MEDIA_VIDEO_METADATA_NOT_STREAMABLE'
    | 'MEDIA_VIDEO_PROVIDER_UNAVAILABLE'
    | 'MEDIA_SOURCE_STARVED',
  reason: string,
  details: Omit<FileLoadErrorDetails, 'reason'> = {},
) {
  return new FileLoadError(code, code, {
    ...details,
    reason,
  })
}

function createVideoSourceLoadErrorFromError(error: unknown): FileLoadError {
  if (error instanceof FileLoadError) {
    return error
  }

  const stableCode = getStableErrorCode(error)
  if (stableCode === 'ERR_MEDIA_SOURCE_STARVED' || stableCode === 'MEDIA_SOURCE_STARVED') {
    return createVideoSourceLoadError('MEDIA_SOURCE_STARVED', 'source-starved')
  }
  if (stableCode === 'ERR_MEDIA_UNSUPPORTED' || stableCode === 'MEDIA_VIDEO_UNSUPPORTED') {
    return createVideoSourceLoadError('MEDIA_VIDEO_UNSUPPORTED', 'unsupported')
  }
  if (
    stableCode === 'ERR_MEDIA_METADATA_NOT_STREAMABLE' ||
    stableCode === 'MEDIA_VIDEO_METADATA_NOT_STREAMABLE'
  ) {
    return createVideoSourceLoadError('MEDIA_VIDEO_METADATA_NOT_STREAMABLE', 'metadata-not-streamable')
  }
  if (
    stableCode === 'ERR_MEDIA_PROVIDER_UNAVAILABLE' ||
    stableCode === 'MEDIA_VIDEO_PROVIDER_UNAVAILABLE'
  ) {
    return createVideoSourceLoadError('MEDIA_VIDEO_PROVIDER_UNAVAILABLE', 'provider-unavailable')
  }

  return createVideoSourceLoadError('MEDIA_VIDEO_SOURCE_FAILED', 'backend-failed')
}

function releaseFileSourceResult(source: FileSourceLoadResult): void {
  try {
    void Promise.resolve(source.release()).catch((error) => {
      console.warn('[file-loader] failed to release canceled scheduled source', error)
    })
  } catch (error) {
    console.warn('[file-loader] failed to release canceled scheduled source', error)
  }
}

async function loadDerivativeBlob(
  fileId: number,
  fileName: string,
  mimeType: string | null | undefined,
  variant: Extract<FileBlobVariant, 'preview-image' | 'thumbnail-image'>,
  fallback: FileBlobDerivativeFallback,
  lastModified?: number,
  signal?: AbortSignal,
  cachePolicy: NonNullable<FileBlobLoadOptions['cachePolicy']> = 'default',
): Promise<FileBlobLoadResult | null> {
  const {ws} = getAppContext()

  if (ws.kind !== 'tauri') {
    return null
  }

  const operation =
    variant === 'thumbnail-image'
      ? typeof ws.thumbnailImage === 'function'
        ? ws.thumbnailImage.bind(ws)
        : null
      : typeof ws.previewImage === 'function'
        ? ws.previewImage.bind(ws)
        : null

  if (!operation) {
    return null
  }

  const startedAt = getImageGalleryDebugTime()
  logImageGalleryDebug('file-loader', 'derivative.start', {
    ...createImageDisplaySourceDebugPayload({
      nodeId: fileId,
      variant,
      sourceKind: 'derivative',
      sourceMimeType: mimeType ?? null,
      requestIntent: variant,
    }),
    fallback,
  })

  try {
    throwIfAborted(signal)
    const preview = await operation(fileId, {
      fileName,
      mimeType,
      lastModified: lastModified ?? null,
      ...(cachePolicy === 'refresh' ? {refreshDerivativeCache: true} : {}),
    })
    throwIfAborted(signal)

    const blob = new Blob([toArrayBuffer(preview.bytes)], {type: preview.mimeType})
    cachePut(fileId, variant, blob, lastModified, fallback)

    logImageGalleryDebug('file-loader', 'derivative.done', {
      ...createImageDisplaySourceDebugPayload({
        nodeId: fileId,
        variant,
        sourceKind: 'derivative',
        sourceMimeType: mimeType ?? null,
        outputMimeType: preview.mimeType,
        requestIntent: variant,
      }),
      fallback,
      size: preview.bytes.byteLength,
      dtMs: getImageGalleryDebugDurationMs(startedAt),
    })

    return {
      blob,
      url: URL.createObjectURL(blob),
      size: preview.bytes.byteLength,
      mimeType: preview.mimeType,
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      logImageGalleryDebug('file-loader', 'derivative.abort', {
        ...createImageDisplaySourceDebugPayload({
          nodeId: fileId,
          variant,
          sourceKind: 'derivative',
          sourceMimeType: mimeType ?? null,
          requestIntent: variant,
          releaseReason: 'abort',
        }),
        fallback,
        dtMs: getImageGalleryDebugDurationMs(startedAt),
      })
      throw error
    }
    if (fallback === 'none') {
      const classifiedFailure = classifyDerivativeFailure(error, fileName, mimeType)
      const negativeCacheCode = classifiedFailure ?? 'DERIVATIVE_UNAVAILABLE'
      const logDerivativeUnavailable =
        classifiedFailure === 'DERIVATIVE_UNAVAILABLE' ? logImageGalleryDebug : warnImageGalleryDebug
      logDerivativeUnavailable('file-loader', 'derivative.error', {
        ...createImageDisplaySourceDebugPayload({
          nodeId: fileId,
          variant,
          sourceKind: 'derivative',
          sourceMimeType: mimeType ?? null,
          requestIntent: variant,
        }),
        fallback,
        dtMs: getImageGalleryDebugDurationMs(startedAt),
        error: formatImageGalleryDebugError(error),
      })
      rememberDerivativeNegativeCache(
        fileId,
        variant,
        fallback,
        lastModified,
        negativeCacheCode,
        error,
      )
      throw createDerivativeLoadError(variant, {reason: negativeCacheCode})
    }
    console.warn(`[file-loader] ${variant} fallback to raw`, error)
    warnImageGalleryDebug('file-loader', 'derivative.fallback-to-raw', {
      ...createImageDisplaySourceDebugPayload({
        nodeId: fileId,
        variant,
        sourceKind: 'derivative',
        sourceMimeType: mimeType ?? null,
        requestIntent: variant,
      }),
      fallback,
      dtMs: getImageGalleryDebugDurationMs(startedAt),
      error: formatImageGalleryDebugError(error),
    })
    return null
  }
}

async function loadFileBlobForSourceFallback(
  fileId: number,
  fileName: string,
  options?: FileBlobLoadOptions,
): Promise<FileBlobLoadResult> {
  const variant = options?.variant ?? 'raw'
  const derivativeFallback = options?.derivativeFallback ?? 'raw'
  const lastModified = options?.lastModified
  const cachePolicy = options?.cachePolicy ?? 'default'
  const cacheKey = getBlobCacheKey(fileId, variant, lastModified, derivativeFallback)
  if (cachePolicy === 'refresh') {
    cacheDelete(cacheKey)
    if (isDerivativeDisplayVariant(variant)) {
      clearDerivativeNegativeCache(fileId, variant, derivativeFallback, lastModified)
    }
  }
  const cached = cachePolicy === 'refresh' ? undefined : blobCache.get(cacheKey)
  const mimeType = effectiveMediaMimeType(fileName, options)

  if (cached) {
    const url = URL.createObjectURL(cached)
    logImageGalleryDebug('file-loader', 'blob-cache.hit', {
      ...createImageDisplaySourceDebugPayload({
        nodeId: fileId,
        variant,
        sourceKind: 'blob-cache',
        sourceMimeType: mimeType,
        outputMimeType: cached.type || mimeType,
        requestIntent: variant,
      }),
      derivativeFallback,
      size: cached.size,
      cacheSize: blobCache.size,
      cacheBytes: blobCacheBytes,
    })
    return {blob: cached, url, size: cached.size, mimeType: cached.type || mimeType}
  }

  const {catalog, ws} = getAppContext()

  if (variant === 'preview-image' || variant === 'thumbnail-image') {
    if (derivativeFallback === 'none' && cachePolicy !== 'refresh') {
      const negativeEntry = getDerivativeNegativeCacheEntry(
        fileId,
        variant,
        derivativeFallback,
        lastModified,
      )
      if (negativeEntry) {
        logImageGalleryDebug('file-loader', 'derivative.negative-cache-hit', {
          ...createImageDisplaySourceDebugPayload({
            nodeId: fileId,
            variant,
            sourceKind: 'derivative-negative-cache',
            sourceMimeType: mimeType,
            requestIntent: variant,
          }),
          derivativeFallback,
          failureCode: negativeEntry.code,
          failureMessage: negativeEntry.message,
          failureAgeMs: Math.round(getImageGalleryDebugTime() - negativeEntry.firstFailedAt),
        })
        throw createDerivativeLoadError(variant)
      }
    }

    const derivative = await loadDerivativeBlob(
      fileId,
      fileName,
      options?.mimeType,
      variant,
      derivativeFallback,
      lastModified,
      options?.signal,
      cachePolicy,
    )
    if (derivative) {
      return derivative
    }
    if (derivativeFallback === 'none') {
      throw createDerivativeLoadError(variant)
    }
  }

  throwIfAborted(options?.signal)
  assertMediaBlobFallbackAllowed(fileId, fileName, mimeType, variant, options, ws.kind)
  const mediaFallbackLimitBytes = isPlayableRawMediaFile(fileName, mimeType, options?.mediaInfo)
    ? getMediaBlobFallbackLimitBytes(fileName, mimeType, options?.mediaInfo)
    : null
  const downloadStartedAt = getImageGalleryDebugTime()
  logImageGalleryDebug('file-loader', 'raw-download.start', {
    ...createImageDisplaySourceDebugPayload({
      nodeId: fileId,
      variant,
      sourceKind: 'raw-download',
      sourceMimeType: mimeType,
      requestIntent: variant,
    }),
    derivativeFallback,
  })
  const stream = await catalog.api.download(fileId)
  const chunks: Uint8Array[] = []
  let total = 0

  for await (const chunk of stream) {
    if (options?.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    const nextTotal = total + chunk.byteLength
    if (mediaFallbackLimitBytes !== null && nextTotal > mediaFallbackLimitBytes) {
      throw createMediaBlobFallbackLimitError(
        `MEDIA_BLOB_FALLBACK_LIMIT:${nextTotal}:${mediaFallbackLimitBytes}`,
        nextTotal,
        mediaFallbackLimitBytes,
        'streamed-size-limit',
      )
    }
    chunks.push(chunk)
    total = nextTotal
  }

  const blob = new Blob(chunks.map(toArrayBuffer), {type: mimeType})
  cachePut(fileId, variant, blob, lastModified, derivativeFallback)

  logImageGalleryDebug('file-loader', 'raw-download.done', {
    ...createImageDisplaySourceDebugPayload({
      nodeId: fileId,
      variant,
      sourceKind: 'raw-download',
      sourceMimeType: mimeType,
      outputMimeType: mimeType,
      requestIntent: variant,
    }),
    derivativeFallback,
    size: total,
    cacheSize: blobCache.size,
    cacheBytes: blobCacheBytes,
    dtMs: getImageGalleryDebugDurationMs(downloadStartedAt),
  })

  return {
    blob,
    url: URL.createObjectURL(blob),
    size: total,
    mimeType,
  }
}

export async function loadFileSourceById(
  fileId: number,
  fileName: string,
  options?: FileBlobLoadOptions,
): Promise<FileSourceLoadResult> {
  if (options?.displayJobType) {
    const {
      displayJobType,
      displayJobPriority,
      displayJobIntentId,
      materializationPriority: _materializationPriority,
      ...innerOptions
    } = options

    const resolvedDisplayJobPriority =
      displayJobPriority ?? getDefaultImageDisplayJobPriority(displayJobType)

    return await scheduleImageDisplayJob<FileSourceLoadResult>(
      {
        jobType: displayJobType,
        priority: resolvedDisplayJobPriority,
        intentId:
          displayJobIntentId ??
          `${displayJobType}:${fileId}:${options.variant ?? 'raw'}:${options.lastModified ?? 0}`,
        signal: options.signal,
        releaseResult: releaseFileSourceResult,
      },
      (signal) =>
        loadFileSourceById(fileId, fileName, {
          ...innerOptions,
          signal,
          materializationPriority: resolvedDisplayJobPriority,
        }),
    )
  }

  const variant = options?.variant ?? 'raw'
  const derivativeFallback = options?.derivativeFallback ?? 'raw'
  const preparedSourcePolicy = options?.preparedSourcePolicy ?? 'auto'
  const cachePolicy = options?.cachePolicy ?? 'default'
  const mimeType = effectiveMediaMimeType(fileName, options)
  const {ws} = getAppContext()

  if (isDerivativeDisplayVariant(variant) && derivativeFallback === 'none' && cachePolicy !== 'refresh') {
    const negativeEntry = getDerivativeNegativeCacheEntry(
      fileId,
      variant,
      derivativeFallback,
      options?.lastModified,
    )
    if (negativeEntry) {
      logImageGalleryDebug('file-loader', 'derivative.negative-cache-hit', {
        ...createImageDisplaySourceDebugPayload({
          nodeId: fileId,
          variant,
          sourceKind: 'derivative-negative-cache',
          sourceMimeType: mimeType,
          requestIntent: options?.displayJobIntentId ?? variant,
        }),
        derivativeFallback,
        failureCode: negativeEntry.code,
        failureMessage: negativeEntry.message,
        failureAgeMs: Math.round(getImageGalleryDebugTime() - negativeEntry.firstFailedAt),
      })
      throw createDerivativeLoadError(variant)
    }
  }

  const prepareMediaStream =
    ws.kind === 'tauri' &&
    shouldUseMediaStreamForRequest(ws.kind, fileName, mimeType, variant, options?.mediaInfo) &&
    typeof ws.prepareMediaStream === 'function' &&
    typeof ws.releaseMediaStream === 'function'
      ? ws.prepareMediaStream.bind(ws)
      : null

  const prepareMediaSource =
    ws.kind === 'tauri' &&
    shouldUseVideoSourceForRequest(ws.kind, fileName, mimeType, variant, options?.mediaInfo) &&
    typeof ws.prepareMediaSource === 'function' &&
    typeof ws.releaseMediaSource === 'function'
      ? ws.prepareMediaSource.bind(ws)
      : null

  if (prepareMediaSource) {
    const releaseMediaSource = ws.releaseMediaSource?.bind(ws)
    const videoSourceStartedAt = getImageGalleryDebugTime()
    let sourceAttachedToLifecycle = false
    let nativeLifecycleStarted = false
    const expectsNativeDelivery =
      getRuntimeCapabilities().platform === 'android' &&
      getRuntimeCapabilities().mobile &&
      runtimeModeModel.canUseNativeVideoPlayback({transportKind: ws.kind})
    const shouldProbeBrowserDecode = !expectsNativeDelivery
    const startNativeLifecycle = () => {
      if (expectsNativeDelivery && !nativeLifecycleStarted) {
        nativeLifecycleStarted = true
        notifyAndroidNativeVideoLifecycleStart()
      }
    }
    try {
      throwIfAborted(options?.signal)
      // MediaCapabilities describes the WebView decoder, not the platform
      // native decoder. It may reject a source (notably QuickTime on Android)
      // that Media3 can play, so it only gates browser-backed deliveries.
      const immediateDecodeSupport = shouldProbeBrowserDecode
        ? peekVideoDecodeSupport({
            mimeType,
            mediaInfo: options?.mediaInfo,
          })
        : null
      if (immediateDecodeSupport) {
        throwIfVideoDecodeUnsupported(fileId, fileName, mimeType, immediateDecodeSupport, options)
      }
      assertVideoSourceRuntimeProbeSupport(fileId, fileName, mimeType, options)
      startNativeLifecycle()
      logVideoSourceAttempt(
        fileId,
        fileName,
        mimeType,
        variant,
        ws.kind,
        'video-source',
        getAuthoritativeSourceSize(fileId, options),
      )
      logImageGalleryDebug('file-loader', 'video-source.start', {
        ...createImageDisplaySourceDebugPayload({
          nodeId: fileId,
          variant,
          sourceKind: 'video-source',
          sourceMimeType: mimeType,
          requestIntent: options?.displayJobIntentId ?? variant,
        }),
      })

      // The async decode probe only gates rejection, so it runs concurrently
      // with prepare_media_source instead of serializing the open path.
      const sourcePromise = prepareMediaSource({
        kind: 'video',
        nodeId: fileId,
        fileName,
        mimeType,
        lastModified: options?.lastModified ?? null,
      })
      if (shouldProbeBrowserDecode && !immediateDecodeSupport) {
        try {
          const decodeSupport = await probeVideoDecodeSupport({
            mimeType,
            mediaInfo: options?.mediaInfo,
            signal: options?.signal,
          })
          throwIfVideoDecodeUnsupported(fileId, fileName, mimeType, decodeSupport, options)
        } catch (probeError) {
          void sourcePromise
            .then((lateSource) => releaseMediaSource?.(lateSource))
            .catch(() => {})
          throw probeError
        }
      }
      const source = await sourcePromise
      const delivery = selectedVideoDelivery(source, options?.mediaInfo)
      if (!delivery) {
        await releaseMediaSource?.(source)
        throw createVideoSourceLoadError('MEDIA_VIDEO_PROVIDER_UNAVAILABLE', 'no-supported-delivery')
      }
      const mseDescriptor =
        delivery.delivery === 'mse'
          ? createMseVideoSourceDescriptor({
              delivery,
              mimeType: source.mimeType,
              mediaInfo: options?.mediaInfo,
            })
          : undefined
      if (delivery.delivery === 'mse' && !mseDescriptor) {
        await releaseMediaSource?.(source)
        throw createVideoSourceLoadError('MEDIA_VIDEO_METADATA_NOT_STREAMABLE', 'metadata-not-streamable')
      }

      if (options?.signal?.aborted) {
        try {
          await releaseMediaSource?.(source)
        } catch (releaseError) {
          console.warn('[file-loader] failed to release aborted video source', releaseError)
        }
        throw new DOMException('Aborted', 'AbortError')
      }

      const url =
        delivery.delivery === 'loopback-http'
          ? delivery.url
          : delivery.delivery === 'mse'
            ? (delivery.fetchUrl ?? '')
            : ''
      const nativeSourceToken =
        delivery.delivery === 'native-video' ? delivery.nativeSourceToken : undefined

      logImageGalleryDebug('file-loader', 'video-source.done', {
        ...createImageDisplaySourceDebugPayload({
          nodeId: fileId,
          variant,
          sourceKind: 'video-source',
          sourceMimeType: mimeType,
          outputMimeType: source.mimeType,
          sourceRevision: source.sourceRevision,
          requestIntent: options?.displayJobIntentId ?? variant,
        }),
        delivery: delivery.delivery,
        provider: source.provider,
        sourceTokenPresent: Boolean(source.sourceToken),
        nativeSourceTokenPresent: Boolean(nativeSourceToken),
        mediaSourceGeneration: source.mediaSourceGeneration,
        transportSessionGeneration: source.transportSessionGeneration ?? null,
        appForegroundEpoch: source.appForegroundEpoch,
        size: source.size,
        dtMs: getImageGalleryDebugDurationMs(videoSourceStartedAt),
      })

      sourceAttachedToLifecycle = delivery.delivery === 'native-video'
      return {
        kind: 'video-source',
        url,
        delivery: delivery.delivery,
        streamId: source.streamId,
        sourceToken: source.sourceToken,
        nativeSourceToken,
        provider: source.provider,
        mse: mseDescriptor ?? undefined,
        mediaSourceGeneration: source.mediaSourceGeneration,
        transportSessionGeneration: source.transportSessionGeneration,
        appForegroundEpoch: source.appForegroundEpoch,
        size: source.size,
        mimeType: source.mimeType,
        sourceRevision: source.sourceRevision,
        release: trackVideoSource(fileId, variant, source, releaseMediaSource, delivery),
      }
    } catch (error) {
      if (nativeLifecycleStarted && !sourceAttachedToLifecycle) {
        notifyAndroidNativeVideoLifecycleEnd()
      }
      if (isAbortError(error)) {
        throw error
      }
      warnImageGalleryDebug('file-loader', 'video-source.error', {
        ...createImageDisplaySourceDebugPayload({
          nodeId: fileId,
          variant,
          sourceKind: 'video-source',
          sourceMimeType: mimeType,
          requestIntent: options?.displayJobIntentId ?? variant,
        }),
        error: formatImageGalleryDebugError(error),
        dtMs: getImageGalleryDebugDurationMs(videoSourceStartedAt),
      })
      throw createVideoSourceLoadErrorFromError(error)
    }
  }

  if (prepareMediaStream) {
    const releaseMediaStream = ws.releaseMediaStream?.bind(ws)
    const mediaStreamStartedAt = getImageGalleryDebugTime()
    try {
      throwIfAborted(options?.signal)
      logVideoSourceAttempt(
        fileId,
        fileName,
        mimeType,
        variant,
        ws.kind,
        'desktop-media-stream',
        getAuthoritativeSourceSize(fileId, options),
      )
      logImageGalleryDebug('file-loader', 'media-stream.start', {
        ...createImageDisplaySourceDebugPayload({
          nodeId: fileId,
          variant,
          sourceKind: 'media-stream',
          sourceMimeType: mimeType,
          requestIntent: options?.displayJobIntentId ?? variant,
        }),
      })

      const source = await prepareMediaStream(fileId, {
        fileName,
        mimeType,
        lastModified: options?.lastModified ?? null,
      })

      if (options?.signal?.aborted) {
        try {
          await releaseMediaStream?.(source)
        } catch (releaseError) {
          console.warn('[file-loader] failed to release aborted media stream source', releaseError)
        }
        throw new DOMException('Aborted', 'AbortError')
      }

      logImageGalleryDebug('file-loader', 'media-stream.done', {
        ...createImageDisplaySourceDebugPayload({
          nodeId: fileId,
          variant,
          sourceKind: 'media-stream',
          sourceMimeType: mimeType,
          outputMimeType: source.mimeType,
          sourceRevision: source.sourceRevision,
          requestIntent: options?.displayJobIntentId ?? variant,
        }),
        streamId: source.streamId,
        delivery: source.delivery ?? 'custom-scheme',
        hasFallbackUrl: Boolean(source.fallbackUrl),
        size: source.size,
        dtMs: getImageGalleryDebugDurationMs(mediaStreamStartedAt),
      })

      return {
        kind: 'media-stream',
        url: source.url,
        fallbackUrl: source.fallbackUrl,
        delivery: source.delivery ?? 'custom-scheme',
        streamId: source.streamId,
        size: source.size,
        mimeType: source.mimeType,
        sourceRevision: source.sourceRevision,
        release: trackMediaStreamSource(fileId, variant, source, releaseMediaStream),
      }
    } catch (error) {
      if (isAbortError(error)) {
        throw error
      }
      console.warn(`[file-loader] ${variant} media stream fallback to blob`, error)
      warnImageGalleryDebug('file-loader', 'media-stream.fallback-to-blob', {
        ...createImageDisplaySourceDebugPayload({
          nodeId: fileId,
          variant,
          sourceKind: 'media-stream',
          sourceMimeType: mimeType,
          requestIntent: options?.displayJobIntentId ?? variant,
        }),
        error: formatImageGalleryDebugError(error),
        dtMs: getImageGalleryDebugDurationMs(mediaStreamStartedAt),
      })
    }
  }

  const preparePreviewFile =
    ws.kind === 'tauri' &&
    preparedSourcePolicy !== 'skip' &&
    !shouldSkipPreparedSourceForRuntime() &&
    shouldUsePreparedSourceForRequest(fileName, mimeType, variant, options?.mediaInfo) &&
    typeof ws.preparePreviewFile === 'function'
      ? ws.preparePreviewFile.bind(ws)
      : null

  if (preparePreviewFile) {
    const releasePreviewFile = ws.releasePreviewFile?.bind(ws)
    const preparedSourceStartedAt = getImageGalleryDebugTime()
    try {
      throwIfAborted(options?.signal)
      logImageGalleryDebug('file-loader', 'prepared-source.start', {
        ...createImageDisplaySourceDebugPayload({
          nodeId: fileId,
          variant,
          sourceKind: 'prepared-source',
          sourceMimeType: mimeType,
          requestIntent: options?.displayJobIntentId ?? variant,
          schedulerPriority:
            options?.materializationPriority ?? getDefaultImageDisplayJobPriority('prepared-source'),
        }),
        derivativeFallback,
        ...getPreparedSourceSchedulerDebugPayload(),
      })
      const source = await scheduleImageDisplayJob<PreparedPreviewFileSource>(
        {
          jobType: 'prepared-source',
          priority:
            options?.materializationPriority ?? getDefaultImageDisplayJobPriority('prepared-source'),
          intentId: `prepared:${fileId}:${variant}:${options?.lastModified ?? 0}`,
          signal: options?.signal,
          releaseResult: (preparedSource) => releasePreviewFile?.(preparedSource),
        },
        (signal) => {
          throwIfAborted(signal)
          return preparePreviewFile(fileId, {
            fileName,
            mimeType,
            lastModified: options?.lastModified ?? null,
            variant,
            ...(cachePolicy === 'refresh' ? {refreshDerivativeCache: true} : {}),
          })
        },
      )
      if (options?.signal?.aborted) {
        try {
          await releasePreviewFile?.(source)
        } catch (releaseError) {
          console.warn('[file-loader] failed to release aborted prepared source', releaseError)
        }
        throw new DOMException('Aborted', 'AbortError')
      }

      if (shouldProbePreparedSourceLoadability(source)) {
        const loadabilityStartedAt = getImageGalleryDebugTime()
        logImageGalleryDebug('file-loader', 'prepared-source.loadability-start', {
          ...createImageDisplaySourceDebugPayload({
            nodeId: fileId,
            variant,
            sourceKind: source.kind,
            sourceMimeType: mimeType,
            outputMimeType: source.mimeType,
            requestIntent: options?.displayJobIntentId ?? variant,
          }),
          size: source.size,
        })

        let loadable: boolean
        try {
          loadable = await probePreparedSourceLoadability(source.url, options?.signal)
          throwIfAborted(options?.signal)
        } catch (probeError) {
          if (isAbortError(probeError)) {
            try {
              await releasePreviewFile?.(source)
            } catch (releaseError) {
              console.warn('[file-loader] failed to release aborted prepared source probe', releaseError)
            }
          }
          throw probeError
        }

        if (!loadable) {
          preparedSourceLoadability = 'unsupported'
          try {
            await releasePreviewFile?.(source)
          } catch (releaseError) {
            console.warn('[file-loader] failed to release unloadable prepared source', releaseError)
          }
          warnImageGalleryDebug('file-loader', 'prepared-source.loadability-error', {
            ...createImageDisplaySourceDebugPayload({
              nodeId: fileId,
              variant,
              sourceKind: source.kind,
              sourceMimeType: mimeType,
              outputMimeType: source.mimeType,
              requestIntent: options?.displayJobIntentId ?? variant,
            }),
            size: source.size,
            dtMs: getImageGalleryDebugDurationMs(loadabilityStartedAt),
          })
          throw new PreparedSourceLoadabilityError(source.url)
        }

        preparedSourceLoadability = 'supported'
        logImageGalleryDebug('file-loader', 'prepared-source.loadability-done', {
          ...createImageDisplaySourceDebugPayload({
            nodeId: fileId,
            variant,
            sourceKind: source.kind,
            sourceMimeType: mimeType,
            outputMimeType: source.mimeType,
            requestIntent: options?.displayJobIntentId ?? variant,
          }),
          size: source.size,
          dtMs: getImageGalleryDebugDurationMs(loadabilityStartedAt),
        })
      }

      logImageGalleryDebug('file-loader', 'prepared-source.done', {
        ...createImageDisplaySourceDebugPayload({
          nodeId: fileId,
          variant,
          sourceKind: source.kind,
          sourceMimeType: mimeType,
          outputMimeType: source.mimeType,
          requestIntent: options?.displayJobIntentId ?? variant,
          schedulerPriority:
            options?.materializationPriority ?? getDefaultImageDisplayJobPriority('prepared-source'),
        }),
        size: source.size,
        dtMs: getImageGalleryDebugDurationMs(preparedSourceStartedAt),
        ...getPreparedSourceSchedulerDebugPayload(),
      })
      clearDerivativeNegativeCache(fileId, variant, derivativeFallback, options?.lastModified)

      return {
        kind: source.kind,
        url: source.url,
        size: source.size,
        mimeType: source.mimeType,
        release: trackPreparedSource(fileId, variant, source, releasePreviewFile),
      }
    } catch (error) {
      if (isAbortError(error)) {
        throw error
      }
      if (isDerivativeDisplayVariant(variant)) {
        const negativeCacheCode = classifyDerivativeFailure(
          error,
          fileName,
          mimeType,
          options?.mediaInfo,
        )
        if (negativeCacheCode && derivativeFallback === 'none') {
          rememberDerivativeNegativeCache(
            fileId,
            variant,
            derivativeFallback,
            options?.lastModified,
            negativeCacheCode,
            error,
          )
          const logDerivativeUnavailable =
            negativeCacheCode === 'DERIVATIVE_UNAVAILABLE' ? logImageGalleryDebug : warnImageGalleryDebug
          logDerivativeUnavailable('file-loader', 'prepared-source.derivative-unavailable', {
            ...createImageDisplaySourceDebugPayload({
              nodeId: fileId,
              variant,
              sourceKind: 'prepared-source',
              sourceMimeType: mimeType,
              requestIntent: options?.displayJobIntentId ?? variant,
            }),
            derivativeFallback,
            error: formatImageGalleryDebugError(error),
            dtMs: getImageGalleryDebugDurationMs(preparedSourceStartedAt),
          })
          throw createDerivativeLoadError(variant, {reason: negativeCacheCode})
        }
      }
      console.warn(`[file-loader] ${variant} prepared source fallback to blob`, error)
      warnImageGalleryDebug('file-loader', 'prepared-source.fallback-to-blob', {
        ...createImageDisplaySourceDebugPayload({
          nodeId: fileId,
          variant,
          sourceKind: 'prepared-source',
          sourceMimeType: mimeType,
          requestIntent: options?.displayJobIntentId ?? variant,
        }),
        derivativeFallback,
        error: formatImageGalleryDebugError(error),
        dtMs: getImageGalleryDebugDurationMs(preparedSourceStartedAt),
      })
    }
  }

  const blobResult = await loadFileBlobForSourceFallback(fileId, fileName, options)
  return {
    kind: 'blob',
    blob: blobResult.blob,
    url: blobResult.url,
    size: blobResult.size,
    mimeType: blobResult.mimeType,
    release: () => URL.revokeObjectURL(blobResult.url),
  }
}

export async function loadAudioSourceById(
  fileId: number,
  fileName: string,
  options?: Omit<FileBlobLoadOptions, 'variant'>,
): Promise<FileSourceLoadResult> {
  return loadFileSourceById(fileId, fileName, {
    ...options,
    variant: 'raw',
  })
}

export function invalidateFileBlobCache(fileId: number) {
  for (const key of [...blobCache.keys()]) {
    if (key.includes(`:${fileId}:`)) {
      cacheDelete(key)
    }
  }
  for (const key of [...derivativeNegativeCache.keys()]) {
    if (key.includes(`:${fileId}:`)) {
      derivativeNegativeCache.delete(key)
    }
  }
}

export function invalidateAllFileBlobCache() {
  blobCache.clear()
  derivativeNegativeCache.clear()
  blobCacheBytes = 0
}

export function isMockTransport(): boolean {
  const {ws} = getAppContext()
  return ws.kind === 'ws' && ws.constructor.name === 'MockTransport'
}
