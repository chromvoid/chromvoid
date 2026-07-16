import {writeAndroidUnlockDebug} from 'root/shared/services/android-unlock-debug'

export type MediaTelemetryEventName =
  | 'media.source.prepare.start'
  | 'media.source.prepare.ready'
  | 'media.source.prepare.error'
  | 'media.source.starved'
  | 'media.delivery.selected'
  | 'media.playback.metadata'
  | 'media.playback.first_frame'
  | 'media.playback.playing'
  | 'media.playback.paused'
  | 'media.playback.buffering'
  | 'media.playback.stall'
  | 'media.playback.dropped_frames'
  | 'media.playback.error'
  | 'media.playback.release'
  | 'media.source.release'

const SENSITIVE_FIELD_PATTERN = /(^|_)?(token|url|path|filename|name)($|_)?/i

export function emitMediaTelemetry(
  event: MediaTelemetryEventName,
  payload: Record<string, unknown> = {},
): void {
  const redactedPayload = redactMediaTelemetryPayload(payload)
  writeAndroidUnlockDebug('media-telemetry', event, redactedPayload)
  console.info('[media-telemetry]', JSON.stringify({event, ...redactedPayload}))
}

export function redactMediaTelemetryPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const redacted: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(payload)) {
    if (isSensitiveStringField(key, value)) {
      redacted[key] = '[redacted]'
      continue
    }
    redacted[key] = redactValue(value)
  }
  return redacted
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item))
  }
  if (!value || typeof value !== 'object') {
    return value
  }
  return redactMediaTelemetryPayload(value as Record<string, unknown>)
}

function isSensitiveStringField(key: string, value: unknown): boolean {
  if (key === 'eventName') {
    return false
  }
  return typeof value === 'string' && SENSITIVE_FIELD_PATTERN.test(key)
}
