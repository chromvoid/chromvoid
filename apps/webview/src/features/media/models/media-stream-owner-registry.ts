import type {
  AndroidVideoPlayerEvent,
  MediaStreamErrorCode,
  MediaStreamErrorEvent,
  TransportEventHandler,
  TransportLike,
} from 'root/core/transport/transport'

export type MediaStreamLifecycleReleaseReason =
  | 'vault-lock'
  | 'background'
  | 'session-end'
  | 'source-invalidated'

export type MediaStreamLifecycleReleaseContext = {
  nodeId?: number
}

export type MediaStreamOwner = {
  handleNativeStreamError(event: MediaStreamErrorEvent): void
  handleAndroidVideoPlayerEvent?(event: AndroidVideoPlayerEvent): void
  releaseNativeStreamForLifecycle?(
    reason: MediaStreamLifecycleReleaseReason,
    context?: MediaStreamLifecycleReleaseContext,
  ): void | Promise<void>
}

export type MediaStreamLifecycleReleaseOptions = {
  excludeOwner?: MediaStreamOwner
}

const MEDIA_STREAM_ERROR_CODES = new Set<MediaStreamErrorCode>([
  'ERR_MEDIA_STREAM_NOT_FOUND',
  'ERR_MEDIA_STREAM_LOCKED',
  'ERR_MEDIA_STREAM_STALE',
  'ERR_MEDIA_RANGE_INVALID',
  'ERR_MEDIA_RANGE_REQUIRED',
  'ERR_MEDIA_RANGE_READ_FAILED',
  'ERR_MEDIA_UNSUPPORTED',
  'ERR_MEDIA_SOURCE_LOAD_FAILED',
])
const ANDROID_VIDEO_PLAYER_EVENTS = new Set<AndroidVideoPlayerEvent['event']>([
  'started',
  'ready',
  'buffering',
  'idle',
  'ended',
  'error',
  'released',
])

const owners = new Map<string, MediaStreamOwner>()

function isFiniteNumberOrNullish(value: unknown): value is number | null | undefined {
  return value == null || (typeof value === 'number' && Number.isFinite(value))
}

export function isMediaStreamErrorEvent(payload: unknown): payload is MediaStreamErrorEvent {
  if (!payload || typeof payload !== 'object') return false

  const event = payload as Partial<MediaStreamErrorEvent>
  return (
    typeof event.streamId === 'string' &&
    event.streamId.length > 0 &&
    typeof event.code === 'string' &&
    MEDIA_STREAM_ERROR_CODES.has(event.code as MediaStreamErrorCode) &&
    isFiniteNumberOrNullish(event.httpStatus) &&
    isFiniteNumberOrNullish(event.nodeId) &&
    isFiniteNumberOrNullish(event.sourceRevision)
  )
}

export function isAndroidVideoPlayerEvent(payload: unknown): payload is AndroidVideoPlayerEvent {
  if (!payload || typeof payload !== 'object') return false

  const event = payload as Partial<AndroidVideoPlayerEvent>
  return (
    typeof event.token === 'string' &&
    event.token.length > 0 &&
    typeof event.event === 'string' &&
    ANDROID_VIDEO_PLAYER_EVENTS.has(event.event as AndroidVideoPlayerEvent['event']) &&
    isFiniteNumberOrNullish(event.positionMs) &&
    isFiniteNumberOrNullish(event.durationMs) &&
    (event.error === undefined || typeof event.error === 'string')
  )
}

export function registerMediaStreamOwner(streamId: string, owner: MediaStreamOwner): () => void {
  const previous = owners.get(streamId)
  if (previous && previous !== owner) {
    console.warn('[media-stream] replacing active owner for streamId', {streamId})
  }

  owners.set(streamId, owner)

  let registered = true
  return () => {
    if (!registered) return
    registered = false
    unregisterMediaStreamOwner(streamId, owner)
  }
}

export function unregisterMediaStreamOwner(streamId: string, owner: MediaStreamOwner): void {
  if (owners.get(streamId) !== owner) return
  owners.delete(streamId)
}

export function dispatchMediaStreamError(event: MediaStreamErrorEvent): void {
  const owner = owners.get(event.streamId)
  if (!owner) {
    console.debug('[media-stream] ignoring event for inactive streamId', {
      streamId: event.streamId,
      code: event.code,
    })
    return
  }

  owner.handleNativeStreamError(event)
}

export function dispatchAndroidVideoPlayerEvent(event: AndroidVideoPlayerEvent): void {
  const owner = owners.get(event.token)
  if (!owner) {
    console.debug('[media-stream] ignoring Android video event for inactive token', {
      token: event.token,
      event: event.event,
    })
    return
  }

  owner.handleAndroidVideoPlayerEvent?.(event)
}

export async function releaseAllMediaStreamOwnersForLifecycle(
  reason: MediaStreamLifecycleReleaseReason,
  context?: MediaStreamLifecycleReleaseContext,
  options: MediaStreamLifecycleReleaseOptions = {},
): Promise<void> {
  const activeOwners = Array.from(new Set(owners.values())).filter(
    (owner) => owner !== options.excludeOwner,
  )
  await Promise.allSettled(
    activeOwners.map(async (owner) => {
      await owner.releaseNativeStreamForLifecycle?.(reason, context)
    }),
  )
}

export function setupMediaStreamErrorDispatch(ws: TransportLike): () => void {
  const handler: TransportEventHandler = (_message, payload) => {
    if (!isMediaStreamErrorEvent(payload)) {
      console.debug('[media-stream] ignoring malformed native error event')
      return
    }

    dispatchMediaStreamError(payload)
  }

  ws.on('media-stream:error', handler)

  const androidVideoHandler: TransportEventHandler = (_message, payload) => {
    if (!isAndroidVideoPlayerEvent(payload)) {
      console.debug('[media-stream] ignoring malformed Android video event')
      return
    }

    dispatchAndroidVideoPlayerEvent(payload)
  }

  ws.on('android-video-player:event', androidVideoHandler)
  return () => {
    ws.off('media-stream:error', handler)
    ws.off('android-video-player:event', androidVideoHandler)
  }
}

export function resetMediaStreamOwnerRegistryForTests(): void {
  owners.clear()
}

export function getMediaStreamOwnerCountForTests(): number {
  return owners.size
}
