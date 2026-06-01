import type {AndroidAudioPlayerEvent} from 'root/core/transport/transport'
import type {ResolvedAudioTrack} from 'root/app/navigation/navigation.types'

import {
  redactAndroidNativeSessionId,
  resolveAndroidTrackSourceRevision,
} from './android-media3-playback-driver'
import type {AudioPlaybackDriverKind} from './audio-playback-driver'
import {writeAndroidUnlockDebug} from 'root/shared/services/android-unlock-debug'
import type {
  MediaPlaybackIntent,
  MediaPlaybackLoadingState,
  MediaPlaybackState,
} from './media-playback.model'

export const ANDROID_MEDIA3_START_ACK_TIMEOUT_MS = 2_500
export const ANDROID_MEDIA3_PLAYBACK_READY_TIMEOUT_MS = 5_000

const ANDROID_AUDIO_EVENTS = new Set<AndroidAudioPlayerEvent['event']>([
  'state',
  'error',
  'ended',
  'released',
])
const ANDROID_AUDIO_PLAYBACK_STATES = new Set<NonNullable<AndroidAudioPlayerEvent['playbackState']>>([
  'preparing',
  'paused',
  'playing',
  'buffering',
  'stopped',
  'error',
])
const ANDROID_AUDIO_PLAYBACK_INTENTS = new Set<NonNullable<AndroidAudioPlayerEvent['playbackIntent']>>([
  'play',
  'pause',
  'stop',
])
const ANDROID_AUDIO_LOADING_STATES = new Set<NonNullable<AndroidAudioPlayerEvent['loadingState']>>([
  'idle',
  'loading',
  'loaded',
  'error',
])

export type AndroidAudioFallbackReason =
  | 'native_start_no_event'
  | 'native_playback_not_ready'
  | 'native_start_failed'
  | 'native_command_timeout'

function isFiniteNumberOrUndefined(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value))
}

export function isAndroidAudioPlayerEvent(payload: unknown): payload is AndroidAudioPlayerEvent {
  if (!payload || typeof payload !== 'object') return false

  const event = payload as Partial<AndroidAudioPlayerEvent>
  const legacyEvent = event as Partial<AndroidAudioPlayerEvent> & {bins?: unknown; rms?: unknown}
  const eventName = event.event as AndroidAudioPlayerEvent['event']
  return (
    typeof event.event === 'string' &&
    ANDROID_AUDIO_EVENTS.has(eventName) &&
    typeof event.nativeSessionId === 'string' &&
    event.nativeSessionId.length > 0 &&
    isFiniteNumberOrUndefined(event.trackId) &&
    isFiniteNumberOrUndefined(event.sourceRevision) &&
    isFiniteNumberOrUndefined(event.index) &&
    (event.playbackState === undefined || ANDROID_AUDIO_PLAYBACK_STATES.has(event.playbackState)) &&
    (event.playbackIntent === undefined || ANDROID_AUDIO_PLAYBACK_INTENTS.has(event.playbackIntent)) &&
    (event.loadingState === undefined || ANDROID_AUDIO_LOADING_STATES.has(event.loadingState)) &&
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
  state: NonNullable<AndroidAudioPlayerEvent['playbackState']>,
): 'stopped' | 'playing' | 'paused' | 'buffering' | 'error' {
  if (state === 'preparing') return 'buffering'
  return state
}

export function androidAudioEventTraceMeta(event: AndroidAudioPlayerEvent): Record<string, unknown> {
  return {
    audioEvent: event.event,
    nativeSessionId: redactAndroidNativeSessionId(event.nativeSessionId),
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

export function formatAndroidTracePayload(payload: Record<string, unknown>): string {
  try {
    return JSON.stringify(payload)
  } catch {
    return String(payload)
  }
}

export function elapsedSince(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt)
}

export type AndroidAudioSessionReconcilerHost = {
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
  fallbackAndroidAudioToWeb(nativeSessionId: string, reason: AndroidAudioFallbackReason): Promise<void>
  failAndroidAudioSession(event: AndroidAudioPlayerEvent): Promise<void>
  handleAndroidAudioReleased(event: AndroidAudioPlayerEvent): void
  handleTrackEnded(): Promise<void>
}

export class AndroidAudioSessionReconciler {
  private androidStartAckTimeout: ReturnType<typeof setTimeout> | null = null
  private androidStartAckNativeSessionId: string | null = null
  private androidPlaybackReadyTimeout: ReturnType<typeof setTimeout> | null = null
  private androidPlaybackReadyNativeSessionId: string | null = null
  private lastAndroidStateNativeSessionId: string | null = null

  constructor(private readonly host: AndroidAudioSessionReconcilerHost) {}

  handlePlayerEvent(payload: unknown): void {
    if (!isAndroidAudioPlayerEvent(payload)) {
      this.trace('eventIgnored', {reason: 'malformed'})
      return
    }

    const event = payload
    if (this.host.driverKind() !== 'android-media3' && this.host.driverKind() !== 'ios-avplayer') {
      this.trace('eventIgnored', {
        reason: 'driver_inactive',
        ...androidAudioEventTraceMeta(event),
      })
      return
    }
    if (event.nativeSessionId !== this.host.nativeSessionId()) {
      this.trace('eventIgnored', {
        reason: 'stale_session',
        expectedNativeSessionId: redactAndroidNativeSessionId(this.host.nativeSessionId()),
        ...androidAudioEventTraceMeta(event),
      })
      return
    }

    if (event.event === 'released') {
      this.clearNativeWatchdogs()
      this.trace('eventReleased', androidAudioEventTraceMeta(event))
      this.host.handleAndroidAudioReleased(event)
      return
    }

    if (event.event === 'error') {
      if (!this.matchesTrackEvent(event, {allowMissingTrackIdentity: true})) {
        this.trace('eventIgnored', {
          reason: 'track_identity_mismatch',
          ...androidAudioEventTraceMeta(event),
        })
        return
      }
      this.clearNativeWatchdogs()
      this.resetStateEventTracking()
      this.trace('eventError', androidAudioEventTraceMeta(event))
      void this.host.failAndroidAudioSession(event)
      return
    }

    if (!this.matchesTrackEvent(event)) {
      this.trace('eventIgnored', {
        reason: 'track_identity_mismatch',
        ...androidAudioEventTraceMeta(event),
      })
      return
    }

    if (event.event === 'ended') {
      this.clearNativeWatchdogs()
      this.trace('eventEnded', androidAudioEventTraceMeta(event))
      void this.host.handleTrackEnded()
      return
    }

    this.trace('eventApplied', androidAudioEventTraceMeta(event))
    this.lastAndroidStateNativeSessionId = event.nativeSessionId
    this.applyStateEvent(event)
    this.reconcileWatchdogsAfterState(event)
  }

  hasReceivedState(nativeSessionId: string): boolean {
    return this.lastAndroidStateNativeSessionId === nativeSessionId
  }

  resetStateEventTracking(): void {
    this.lastAndroidStateNativeSessionId = null
  }

  startStartAckWatchdog(nativeSessionId: string): void {
    this.clearStartAckWatchdog()
    this.androidStartAckNativeSessionId = nativeSessionId
    this.trace('startAckWatchdogStarted', {
      expectedNativeSessionId: redactAndroidNativeSessionId(nativeSessionId),
      timeoutMs: ANDROID_MEDIA3_START_ACK_TIMEOUT_MS,
    })
    this.androidStartAckTimeout = setTimeout(() => {
      this.androidStartAckTimeout = null
      if (this.androidStartAckNativeSessionId !== nativeSessionId) return
      this.androidStartAckNativeSessionId = null
      void this.host.fallbackAndroidAudioToWeb(nativeSessionId, 'native_start_no_event')
    }, ANDROID_MEDIA3_START_ACK_TIMEOUT_MS)
  }

  startPlaybackReadyWatchdogIfNeeded(): void {
    const nativeSessionId = this.host.nativeSessionId()
    if (
      this.host.driverKind() !== 'android-media3' ||
      !nativeSessionId ||
      this.host.playbackIntent() !== 'play' ||
      this.host.playbackState() === 'playing'
    ) {
      return
    }

    this.clearPlaybackReadyWatchdog()
    this.androidPlaybackReadyNativeSessionId = nativeSessionId
    this.androidPlaybackReadyTimeout = setTimeout(() => {
      this.androidPlaybackReadyTimeout = null
      if (this.androidPlaybackReadyNativeSessionId !== nativeSessionId) return
      this.androidPlaybackReadyNativeSessionId = null
      void this.host.fallbackAndroidAudioToWeb(nativeSessionId, 'native_playback_not_ready')
    }, ANDROID_MEDIA3_PLAYBACK_READY_TIMEOUT_MS)
  }

  clearPlaybackReadyWatchdog(): void {
    if (this.androidPlaybackReadyTimeout !== null) {
      clearTimeout(this.androidPlaybackReadyTimeout)
      this.androidPlaybackReadyTimeout = null
    }
    this.androidPlaybackReadyNativeSessionId = null
  }

  clearNativeWatchdogs(): void {
    this.clearStartAckWatchdog()
    this.clearPlaybackReadyWatchdog()
  }

  trace(event: string, meta: Record<string, unknown> = {}): void {
    const payload = {
      driverKind: this.host.driverKind(),
      nativeSessionId: redactAndroidNativeSessionId(this.host.nativeSessionId()),
      currentIndex: this.host.currentIndex(),
      playbackState: this.host.playbackState(),
      playbackIntent: this.host.playbackIntent(),
      loadingState: this.host.loadingState(),
      ...meta,
    }
    writeAndroidUnlockDebug('media-playback/android-audio', event, payload)
    console.info(
      '[media-playback][android-audio]',
      formatAndroidTracePayload({
        event,
        ...payload,
      }),
    )
  }

  private clearStartAckWatchdog(): void {
    if (this.androidStartAckTimeout !== null) {
      clearTimeout(this.androidStartAckTimeout)
      this.androidStartAckTimeout = null
    }
    this.androidStartAckNativeSessionId = null
  }

  private reconcileWatchdogsAfterState(event: AndroidAudioPlayerEvent): void {
    if (this.androidStartAckNativeSessionId === event.nativeSessionId) {
      this.trace('startAckReceived', androidAudioEventTraceMeta(event))
    }
    this.clearStartAckWatchdog()

    if (event.playbackState === 'playing') {
      this.clearPlaybackReadyWatchdog()
      return
    }

    if (event.playbackIntent === 'pause' || this.host.playbackIntent() !== 'play') {
      this.clearPlaybackReadyWatchdog()
      return
    }

    this.startPlaybackReadyWatchdogIfNeeded()
  }

  private applyStateEvent(event: AndroidAudioPlayerEvent): void {
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
        ...androidAudioEventTraceMeta(event),
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
    event: AndroidAudioPlayerEvent,
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

    const sourceRevision = resolveAndroidTrackSourceRevision(track)
    if (event.sourceRevision !== undefined && sourceRevision !== event.sourceRevision) return false

    return true
  }

  private resolveEventIndex(event: AndroidAudioPlayerEvent): number | null {
    const tracks = this.host.tracks()
    const eventIndex =
      typeof event.index === 'number' && Number.isFinite(event.index)
        ? Math.floor(event.index)
        : this.host.currentIndex()
    if (eventIndex < 0 || eventIndex >= tracks.length) return null
    return eventIndex
  }
}
