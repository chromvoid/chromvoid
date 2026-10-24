import type {NativeAudioPlayerEvent} from 'root/core/transport/transport'
import type {ResolvedAudioTrack} from 'root/app/navigation/navigation.types'

import {redactNativeSessionId, resolveTrackSourceRevision, type AudioPlaybackDriverKind} from './audio-playback-driver'
import {writeAndroidUnlockDebug} from 'root/shared/services/android-unlock-debug'
import type {MediaPlaybackIntent, MediaPlaybackLoadingState, MediaPlaybackState} from './media-playback.model'

const NATIVE_AUDIO_EVENTS = new Set<NativeAudioPlayerEvent['event']>([
  'state',
  'error',
  'ended',
  'released',
])
const NATIVE_AUDIO_PLAYBACK_STATES = new Set<NonNullable<NativeAudioPlayerEvent['playbackState']>>([
  'preparing',
  'paused',
  'playing',
  'buffering',
  'stopped',
  'error',
])
const NATIVE_AUDIO_PLAYBACK_INTENTS = new Set<NonNullable<NativeAudioPlayerEvent['playbackIntent']>>([
  'play',
  'pause',
  'stop',
])
const NATIVE_AUDIO_LOADING_STATES = new Set<NonNullable<NativeAudioPlayerEvent['loadingState']>>([
  'idle',
  'loading',
  'loaded',
  'error',
])

export type NativeAudioFallbackReason = 'native_start_failed' | 'native_command_timeout'

function isFiniteNumberOrUndefined(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value))
}

export function isNativeAudioPlayerEvent(payload: unknown): payload is NativeAudioPlayerEvent {
  if (!payload || typeof payload !== 'object') return false

  const event = payload as Partial<NativeAudioPlayerEvent>
  const legacyEvent = event as Partial<NativeAudioPlayerEvent> & {bins?: unknown; rms?: unknown}
  const eventName = event.event as NativeAudioPlayerEvent['event']
  return (
    typeof event.event === 'string' &&
    NATIVE_AUDIO_EVENTS.has(eventName) &&
    typeof event.nativeSessionId === 'string' &&
    event.nativeSessionId.length > 0 &&
    isFiniteNumberOrUndefined(event.trackId) &&
    isFiniteNumberOrUndefined(event.sourceRevision) &&
    isFiniteNumberOrUndefined(event.index) &&
    (event.playbackState === undefined || NATIVE_AUDIO_PLAYBACK_STATES.has(event.playbackState)) &&
    (event.playbackIntent === undefined || NATIVE_AUDIO_PLAYBACK_INTENTS.has(event.playbackIntent)) &&
    (event.loadingState === undefined || NATIVE_AUDIO_LOADING_STATES.has(event.loadingState)) &&
    isFiniteNumberOrUndefined(event.positionMs) &&
    isFiniteNumberOrUndefined(event.durationMs) &&
    (event.hasPrevious === undefined || typeof event.hasPrevious === 'boolean') &&
    (event.hasNext === undefined || typeof event.hasNext === 'boolean') &&
    (event.canSeek === undefined || typeof event.canSeek === 'boolean') &&
    (event.code === undefined || typeof event.code === 'string') &&
    (event.reason === undefined || typeof event.reason === 'string') &&
    (event.recoverable === undefined || typeof event.recoverable === 'boolean') &&
    legacyEvent.bins === undefined &&
    legacyEvent.rms === undefined
  )
}

export function mapNativePlaybackState(
  state: NonNullable<NativeAudioPlayerEvent['playbackState']>,
): 'stopped' | 'playing' | 'paused' | 'buffering' | 'error' {
  if (state === 'preparing') return 'buffering'
  return state
}

export function nativeAudioEventTraceMeta(event: NativeAudioPlayerEvent): Record<string, unknown> {
  return {
    audioEvent: event.event,
    nativeSessionId: redactNativeSessionId(event.nativeSessionId),
    trackId: event.trackId ?? null,
    sourceRevision: event.sourceRevision ?? null,
    index: event.index ?? null,
    playbackState: event.playbackState ?? null,
    playbackIntent: event.playbackIntent ?? null,
    loadingState: event.loadingState ?? null,
    reason: event.reason ?? null,
    positionMs: event.positionMs ?? null,
    durationMs: event.durationMs ?? null,
    code: event.code ?? null,
  }
}

export function formatNativeTracePayload(payload: Record<string, unknown>): string {
  try {
    return JSON.stringify(payload)
  } catch {
    return String(payload)
  }
}

export function elapsedSince(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt)
}

export type NativeAudioSessionReconcilerHost = {
  driverKind(): AudioPlaybackDriverKind
  nativeSessionId(): string | null
  tracks(): ResolvedAudioTrack[]
  currentIndex(): number
  currentTrack(): ResolvedAudioTrack | null
  sessionKind(): 'none' | 'audio'
  playbackIntent(): MediaPlaybackIntent
  playbackState(): MediaPlaybackState
  loadingState(): MediaPlaybackLoadingState
  setCurrentIndex(index: number): void
  setLoadingState(state: MediaPlaybackLoadingState): void
  setPlaybackState(state: MediaPlaybackState): void
  setPlaybackIntent(intent: MediaPlaybackIntent): void
  setCurrentTime(seconds: number): void
  setDuration(seconds: number | null): void
  clearPlaybackIssue(): void
  clearSeekPreview(): void
  clearSeekRequest(): void
  failNativeAudioSession(event: NativeAudioPlayerEvent): Promise<void>
  handleNativeAudioReleased(event: NativeAudioPlayerEvent): void
  handleTrackEnded(): Promise<void>
}

export class NativeAudioSessionReconciler {
  private lastStateNativeSessionId: string | null = null

  constructor(private readonly host: NativeAudioSessionReconcilerHost) {}

  handlePlayerEvent(payload: unknown): void {
    if (!isNativeAudioPlayerEvent(payload)) {
      this.trace('eventIgnored', {reason: 'malformed'})
      return
    }

    const event = payload
    if (this.host.driverKind() !== 'ios-avplayer') {
      this.trace('eventIgnored', {
        reason: 'driver_inactive',
        ...nativeAudioEventTraceMeta(event),
      })
      return
    }
    if (event.nativeSessionId !== this.host.nativeSessionId()) {
      this.trace('eventIgnored', {
        reason: 'stale_session',
        expectedNativeSessionId: redactNativeSessionId(this.host.nativeSessionId()),
        ...nativeAudioEventTraceMeta(event),
      })
      return
    }

    if (event.event === 'released') {
      this.trace('eventReleased', nativeAudioEventTraceMeta(event))
      this.host.handleNativeAudioReleased(event)
      return
    }

    if (event.event === 'error') {
      if (!this.matchesTrackEvent(event, {allowMissingTrackIdentity: true})) {
        this.trace('eventIgnored', {
          reason: 'track_identity_mismatch',
          ...nativeAudioEventTraceMeta(event),
        })
        return
      }
      this.resetStateEventTracking()
      this.trace('eventError', nativeAudioEventTraceMeta(event))
      void this.host.failNativeAudioSession(event)
      return
    }

    if (!this.matchesTrackEvent(event)) {
      this.trace('eventIgnored', {
        reason: 'track_identity_mismatch',
        ...nativeAudioEventTraceMeta(event),
      })
      return
    }

    if (event.event === 'ended') {
      this.trace('eventEnded', nativeAudioEventTraceMeta(event))
      void this.host.handleTrackEnded()
      return
    }

    this.trace('eventApplied', nativeAudioEventTraceMeta(event))
    this.lastStateNativeSessionId = event.nativeSessionId
    this.applyStateEvent(event)
  }

  resetStateEventTracking(): void {
    this.lastStateNativeSessionId = null
  }

  trace(event: string, meta: Record<string, unknown> = {}): void {
    const payload = {
      driverKind: this.host.driverKind(),
      nativeSessionId: redactNativeSessionId(this.host.nativeSessionId()),
      currentIndex: this.host.currentIndex(),
      playbackState: this.host.playbackState(),
      playbackIntent: this.host.playbackIntent(),
      loadingState: this.host.loadingState(),
      ...meta,
    }
    writeAndroidUnlockDebug('media-playback/native-audio', event, payload)
    console.info(
      '[media-playback][native-audio]',
      formatNativeTracePayload({
        event,
        ...payload,
      }),
    )
  }

  private applyStateEvent(event: NativeAudioPlayerEvent): void {
    const previousPlaybackIntent = this.host.playbackIntent()
    const previousPlaybackState = this.host.playbackState()
    const index = this.resolveEventIndex(event)
    if (index !== null && index !== this.host.currentIndex()) {
      this.host.setCurrentIndex(index)
      this.host.clearSeekPreview()
      this.host.clearSeekRequest()
    }

    if (event.loadingState) {
      this.host.setLoadingState(event.loadingState)
    }
    if (event.loadingState === 'loaded') {
      this.host.clearPlaybackIssue()
    }
    if (event.playbackState) {
      this.host.setPlaybackState(mapNativePlaybackState(event.playbackState))
    }
    if (event.playbackIntent) {
      this.host.setPlaybackIntent(event.playbackIntent === 'play' ? 'play' : 'pause')
    }
    if (
      (event.playbackIntent === 'play' && previousPlaybackIntent !== 'play') ||
      (event.playbackState === 'playing' && previousPlaybackState !== 'playing')
    ) {
      this.trace('nativePlayObserved', {
        previousPlaybackIntent,
        previousPlaybackState,
        ...nativeAudioEventTraceMeta(event),
      })
    }
    if (typeof event.positionMs === 'number') {
      this.host.setCurrentTime(Math.max(0, event.positionMs / 1_000))
    }
    if (typeof event.durationMs === 'number') {
      this.host.setDuration(event.durationMs > 0 ? event.durationMs / 1_000 : null)
    }
  }

  private matchesTrackEvent(
    event: NativeAudioPlayerEvent,
    options: {allowMissingTrackIdentity?: boolean} = {},
  ): boolean {
    if (
      options.allowMissingTrackIdentity &&
      event.trackId === undefined &&
      event.sourceRevision === undefined
    ) {
      return true
    }

    const index = this.resolveEventIndex(event)
    if (index === null) return false

    const track = this.host.tracks()[index]
    if (!track) return false
    if (event.trackId !== undefined && event.trackId !== track.id) return false

    const sourceRevision = resolveTrackSourceRevision(track)
    if (event.sourceRevision !== undefined && sourceRevision !== event.sourceRevision) return false

    return true
  }

  private resolveEventIndex(event: NativeAudioPlayerEvent): number | null {
    const tracks = this.host.tracks()
    const eventIndex =
      typeof event.index === 'number' && Number.isFinite(event.index)
        ? Math.floor(event.index)
        : this.host.currentIndex()
    if (eventIndex < 0 || eventIndex >= tracks.length) return null
    return eventIndex
  }
}
