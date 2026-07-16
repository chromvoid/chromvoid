import type {
  AndroidVideoPlayerEvent,
  MediaStreamErrorCode,
  MediaStreamErrorEvent,
  TransportEventHandler,
  TransportLike,
} from 'root/core/transport/transport'

export type MediaStreamLifecycleReleaseReason =
  | 'source-replaced'
  | 'vault-lock'
  | 'background'
  | 'transport-disconnected'
  | 'session-end'
  | 'source-invalidated'
  | 'unsupported'
  | 'playback-error'
  | 'user-closed'
  | 'source-starved'
  | 'budget-exceeded'

export type MediaStreamLifecycleReleaseContext = {
  nodeId?: number
}

export type AndroidVideoSourceIdentity = {
  mediaSourceGeneration?: number
  sourceRevision?: number
  transportSessionGeneration?: number
  appForegroundEpoch?: number
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
  'playing',
  'paused',
  'buffering',
  'idle',
  'ended',
  'error',
  'released',
])

type MediaStreamOwnerRecord = {
  owner: MediaStreamOwner
  androidVideoIdentity?: AndroidVideoSourceIdentity
}

export type InFlightMediaStreamLoadMeta = {
  owner?: MediaStreamOwner
  nodeId?: number
}

type InFlightMediaStreamLoadRecord = InFlightMediaStreamLoadMeta & {
  controller: AbortController
}

const owners = new Map<string, MediaStreamOwnerRecord>()
const inFlightLoads = new Set<InFlightMediaStreamLoadRecord>()

/**
 * Registers an in-flight source load (before its stream owner exists) so
 * lifecycle releases (vault lock, background, transport loss) can abort a
 * prepare that has not resolved yet. Returns an unregister callback that the
 * loader must invoke once the load settles.
 */
export function registerInFlightMediaStreamLoad(
  controller: AbortController,
  meta: InFlightMediaStreamLoadMeta = {},
): () => void {
  const record: InFlightMediaStreamLoadRecord = {controller, ...meta}
  inFlightLoads.add(record)
  return () => {
    inFlightLoads.delete(record)
  }
}

function isFiniteNumberOrNullish(value: unknown): value is number | null | undefined {
  return value == null || (typeof value === 'number' && Number.isFinite(value))
}

function androidVideoEventNativeSourceToken(payload: Partial<AndroidVideoPlayerEvent>): string | null {
  const record = payload as Partial<AndroidVideoPlayerEvent> & {native_source_token?: unknown}
  const token = record.nativeSourceToken ?? record.native_source_token ?? record.token
  return typeof token === 'string' && token.length > 0 ? token : null
}

function normalizedAndroidVideoPlayerEvent(payload: unknown): AndroidVideoPlayerEvent | null {
  if (!payload || typeof payload !== 'object') return null

  const event = payload as Partial<AndroidVideoPlayerEvent>
  const nativeSourceToken = androidVideoEventNativeSourceToken(event)
  if (
    !nativeSourceToken ||
    typeof event.event !== 'string' ||
    !ANDROID_VIDEO_PLAYER_EVENTS.has(event.event as AndroidVideoPlayerEvent['event']) ||
    !isFiniteNumberOrNullish(event.positionMs) ||
    !isFiniteNumberOrNullish(event.durationMs) ||
    !isFiniteNumberOrNullish(event.mediaSourceGeneration) ||
    !isFiniteNumberOrNullish(event.sourceRevision) ||
    !isFiniteNumberOrNullish(event.transportSessionGeneration) ||
    !isFiniteNumberOrNullish(event.appForegroundEpoch) ||
    (event.error !== undefined && typeof event.error !== 'string')
  ) {
    return null
  }

  return {
    ...event,
    nativeSourceToken,
    token: event.token ?? nativeSourceToken,
    event: event.event as AndroidVideoPlayerEvent['event'],
  }
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
  return normalizedAndroidVideoPlayerEvent(payload) !== null
}

export function registerMediaStreamOwner(
  streamId: string,
  owner: MediaStreamOwner,
  androidVideoIdentity?: AndroidVideoSourceIdentity,
): () => void {
  const previous = owners.get(streamId)
  if (previous && previous.owner !== owner) {
    console.warn('[media-stream] replacing active owner for streamId', {streamId})
  }

  owners.set(streamId, {owner, androidVideoIdentity})

  let registered = true
  return () => {
    if (!registered) return
    registered = false
    unregisterMediaStreamOwner(streamId, owner)
  }
}

export function unregisterMediaStreamOwner(streamId: string, owner: MediaStreamOwner): void {
  if (owners.get(streamId)?.owner !== owner) return
  owners.delete(streamId)
}

export function dispatchMediaStreamError(event: MediaStreamErrorEvent): void {
  const record = owners.get(event.streamId)
  if (!record) {
    console.debug('[media-stream] ignoring event for inactive streamId', {
      streamId: event.streamId,
      code: event.code,
    })
    return
  }

  record.owner.handleNativeStreamError(event)
}

export function dispatchAndroidVideoPlayerEvent(event: AndroidVideoPlayerEvent): void {
  const normalizedEvent = normalizedAndroidVideoPlayerEvent(event)
  if (!normalizedEvent) return

  const record = owners.get(normalizedEvent.nativeSourceToken ?? normalizedEvent.token ?? '')
  if (!record) {
    console.debug('[media-stream] ignoring Android video event for inactive token', {
      token: normalizedEvent.nativeSourceToken ?? normalizedEvent.token,
      event: normalizedEvent.event,
    })
    return
  }
  if (!androidVideoIdentityMatches(record.androidVideoIdentity, normalizedEvent)) {
    console.debug('[media-stream] ignoring stale Android video event identity', {
      token: normalizedEvent.nativeSourceToken ?? normalizedEvent.token,
      event: normalizedEvent.event,
      mediaSourceGeneration: normalizedEvent.mediaSourceGeneration,
      sourceRevision: normalizedEvent.sourceRevision,
      transportSessionGeneration: normalizedEvent.transportSessionGeneration,
      appForegroundEpoch: normalizedEvent.appForegroundEpoch,
    })
    return
  }

  record.owner.handleAndroidVideoPlayerEvent?.(normalizedEvent)
}

function androidVideoIdentityMatches(
  expected: AndroidVideoSourceIdentity | undefined,
  event: AndroidVideoPlayerEvent,
): boolean {
  if (!expected) return true
  return (
    identityFieldMatches(expected.mediaSourceGeneration, event.mediaSourceGeneration) &&
    identityFieldMatches(expected.sourceRevision, event.sourceRevision) &&
    identityFieldMatches(expected.transportSessionGeneration, event.transportSessionGeneration) &&
    identityFieldMatches(expected.appForegroundEpoch, event.appForegroundEpoch)
  )
}

function identityFieldMatches(expected: number | undefined, actual: number | undefined): boolean {
  return expected === undefined || expected === actual
}

export async function releaseAllMediaStreamOwnersForLifecycle(
  reason: MediaStreamLifecycleReleaseReason,
  context?: MediaStreamLifecycleReleaseContext,
  options: MediaStreamLifecycleReleaseOptions = {},
): Promise<void> {
  for (const load of Array.from(inFlightLoads)) {
    if (options.excludeOwner && load.owner === options.excludeOwner) continue
    if (
      context?.nodeId !== undefined &&
      load.nodeId !== undefined &&
      load.nodeId !== context.nodeId
    ) {
      continue
    }
    load.controller.abort()
  }

  const activeOwners = Array.from(new Set(Array.from(owners.values()).map((record) => record.owner))).filter(
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
    const event = normalizedAndroidVideoPlayerEvent(payload)
    if (!event) {
      console.debug('[media-stream] ignoring malformed Android video event')
      return
    }

    dispatchAndroidVideoPlayerEvent(event)
  }

  ws.on('android-video-player:event', androidVideoHandler)
  return () => {
    ws.off('media-stream:error', handler)
    ws.off('android-video-player:event', androidVideoHandler)
  }
}

export function resetMediaStreamOwnerRegistryForTests(): void {
  owners.clear()
  inFlightLoads.clear()
}

export function getMediaStreamOwnerCountForTests(): number {
  return owners.size
}

export function getInFlightMediaStreamLoadCountForTests(): number {
  return inFlightLoads.size
}
