import type {MediaStreamErrorCode} from 'root/core/transport/transport'
import type {FileLoadError, FileLoadErrorDetails} from 'root/features/file-manager/services/text-file-io'

export type VideoSourceFailureReason =
  | 'unsupported-codec'
  | 'unsupported-container'
  | 'metadata-not-streamable'
  | 'source-starved'
  | 'provider-unavailable'
  | 'stale-source'
  | 'playback-backend-failure'
  | 'fallback-limited'
  | 'load-failed'

export type VideoSourceState =
  | {state: 'idle'}
  | {state: 'loading'}
  | {state: 'ready'; sourceKind: string; delivery?: string | null; provider?: string | null}
  | {state: 'fallback-limited'; reason: VideoSourceFailureReason}
  | {state: 'unsupported'; reason: VideoSourceFailureReason}
  | {state: 'failed'; reason: VideoSourceFailureReason}

type CodedErrorLike = {
  code?: unknown
  details?: Partial<FileLoadErrorDetails> | null
  message?: unknown
}

export const idleVideoSourceState = (): VideoSourceState => ({state: 'idle'})
export const loadingVideoSourceState = (): VideoSourceState => ({state: 'loading'})

export function readyVideoSourceState(input: {
  sourceKind: string
  delivery?: string | null
  provider?: string | null
}): VideoSourceState {
  return {
    state: 'ready',
    sourceKind: input.sourceKind,
    delivery: input.delivery ?? null,
    provider: input.provider ?? null,
  }
}

export function failedVideoSourceState(reason: VideoSourceFailureReason): VideoSourceState {
  return {state: 'failed', reason}
}

export function videoSourceStateFromLoadError(error: unknown): VideoSourceState {
  const code = loadErrorCode(error)
  const reason = loadErrorReason(error)

  if (code === 'MEDIA_BLOB_FALLBACK_LIMIT') {
    return {state: 'fallback-limited', reason: 'fallback-limited'}
  }
  if (code === 'MEDIA_VIDEO_UNSUPPORTED') {
    return {state: 'unsupported', reason: unsupportedReason(reason)}
  }
  if (code === 'unsupported-mime') {
    return {state: 'unsupported', reason: 'unsupported-codec'}
  }
  if (code === 'MEDIA_VIDEO_METADATA_NOT_STREAMABLE') {
    return {state: 'unsupported', reason: 'metadata-not-streamable'}
  }
  if (code === 'missing-segment-metadata') {
    return {state: 'unsupported', reason: 'metadata-not-streamable'}
  }
  if (code === 'MEDIA_VIDEO_PROVIDER_UNAVAILABLE') {
    return {state: 'failed', reason: 'provider-unavailable'}
  }
  if (code === 'MEDIA_SOURCE_STARVED') {
    return {state: 'failed', reason: 'source-starved'}
  }
  if (code === 'source-starved') {
    return {state: 'failed', reason: 'source-starved'}
  }

  return videoSourceStateFromNativeErrorCode(code)
}

export function videoSourceStateFromNativeErrorCode(code: string | null | undefined): VideoSourceState {
  switch (code) {
    case 'ERR_MEDIA_STREAM_STALE':
    case 'ERR_NATIVE_VIDEO_SOURCE_STALE':
      return {state: 'failed', reason: 'stale-source'}
    case 'ERR_MEDIA_PROVIDER_UNAVAILABLE':
    case 'ERR_NATIVE_VIDEO_PROVIDER_UNAVAILABLE':
      return {state: 'failed', reason: 'provider-unavailable'}
    case 'ERR_MEDIA_SOURCE_STARVED':
    case 'ERR_NATIVE_VIDEO_PROVIDER_TIMEOUT':
      return {state: 'failed', reason: 'source-starved'}
    case 'ERR_MEDIA_UNSUPPORTED':
    case 'ERR_NATIVE_VIDEO_UNSUPPORTED':
      return {state: 'unsupported', reason: 'unsupported-codec'}
    case 'ERR_MEDIA_METADATA_NOT_STREAMABLE':
      return {state: 'unsupported', reason: 'metadata-not-streamable'}
    default:
      return {state: 'failed', reason: 'playback-backend-failure'}
  }
}

export function videoSourceStateFromMediaStreamErrorCode(code: MediaStreamErrorCode): VideoSourceState {
  switch (code) {
    case 'ERR_MEDIA_STREAM_STALE':
    case 'ERR_MEDIA_STREAM_NOT_FOUND':
      return {state: 'failed', reason: 'stale-source'}
    case 'ERR_MEDIA_SOURCE_LOAD_FAILED':
    case 'ERR_MEDIA_RANGE_READ_FAILED':
    case 'ERR_MEDIA_RANGE_INVALID':
    case 'ERR_MEDIA_RANGE_REQUIRED':
    case 'ERR_MEDIA_STREAM_LOCKED':
      return {state: 'failed', reason: 'playback-backend-failure'}
    case 'ERR_MEDIA_UNSUPPORTED':
      return {state: 'unsupported', reason: 'unsupported-codec'}
  }
}

function loadErrorCode(error: unknown): string {
  const coded = error as CodedErrorLike
  if (typeof coded?.code === 'string' && coded.code) {
    return coded.code
  }
  return error instanceof Error ? error.message : String(error)
}

function loadErrorReason(error: unknown): string | null {
  const details = (error as FileLoadError | CodedErrorLike | null | undefined)?.details
  const reason = details?.reason
  return typeof reason === 'string' && reason ? reason : null
}

function unsupportedReason(reason: string | null): VideoSourceFailureReason {
  if (reason === 'unsupported-codec' || reason === 'unsupported-container') {
    return reason
  }
  return 'unsupported-container'
}
