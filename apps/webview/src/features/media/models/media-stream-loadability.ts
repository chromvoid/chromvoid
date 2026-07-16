import {runtimeModeModel} from 'root/core/runtime/runtime-mode.model'

export const MEDIA_STREAM_LOADABILITY_TIMEOUT_MS = 3000
export const REMOTE_MEDIA_STREAM_LOADABILITY_TIMEOUT_MS = 12000

export function getMediaStreamLoadabilityTimeoutMs(): number {
  return runtimeModeModel.remoteCoreMode()
    ? REMOTE_MEDIA_STREAM_LOADABILITY_TIMEOUT_MS
    : MEDIA_STREAM_LOADABILITY_TIMEOUT_MS
}
