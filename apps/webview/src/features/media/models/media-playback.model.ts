import {atom, computed, wrap} from '@reatom/core'

import {runtimeModeModel} from 'root/core/runtime/runtime-mode.model'
import {runtimeCapabilitiesAtom} from 'root/core/runtime/runtime-capabilities'
import {subscribeToSignalChanges} from 'root/shared/services/subscribed-signal'
import {
  type MediaStreamOwner,
  type MediaStreamLifecycleReleaseContext,
  type MediaStreamLifecycleReleaseReason,
} from './media-stream-owner-registry'
import type {
  AndroidAudioPlayerEvent,
  AndroidAudioPreparedTrack,
  MediaStreamErrorEvent,
  NativeAudioPlayerEvent,
  NativeAudioPreparedTrack,
  TransportLike,
} from 'root/core/transport/transport'
import type {ResolvedAudioTrack} from 'root/app/navigation/navigation.types'
import {
  AndroidMedia3PlaybackDriver,
  canUseAndroidMedia3PlaybackForTracks,
  disableAndroidMedia3PlaybackForRuntimeSession,
  isAndroidMedia3CommandTimeoutError,
  redactAndroidNativeSessionId,
  resolveAndroidTrackSourceRevision,
} from './android-media3-playback-driver'
import {
  IosAvPlayerPlaybackDriver,
  canUseIosAvPlayerPlaybackForTracks,
  disableIosAvPlayerPlaybackForRuntimeSession,
} from './ios-avplayer-playback-driver'
import {
  ANDROID_MEDIA3_PLAYBACK_READY_TIMEOUT_MS,
  ANDROID_MEDIA3_START_ACK_TIMEOUT_MS,
  AndroidAudioSessionReconciler,
  elapsedSince,
  isAndroidAudioPlayerEvent,
  type AndroidAudioFallbackReason,
} from './android-audio-session-reconciler'
import type {AudioPlaybackDriver, AudioPlaybackDriverKind, AudioSessionInput} from './audio-playback-driver'
import {WebAudioElementPlaybackDriver} from './web-audio-element-playback-driver'
import {tryGetAppContext} from 'root/shared/services/app-context'
import {MAX_ANDROID_AUDIO_BLOB_FALLBACK_BYTES} from 'root/features/media/components/file-loader'

export type {ResolvedAudioTrack}
export {
  ANDROID_MEDIA3_PLAYBACK_READY_TIMEOUT_MS,
  ANDROID_MEDIA3_START_ACK_TIMEOUT_MS,
  isAndroidAudioPlayerEvent,
}

export type MediaPlaybackLoadingState = 'idle' | 'loading' | 'loaded' | 'fallback-limited' | 'error'
export type MediaPlaybackState = 'stopped' | 'playing' | 'paused' | 'buffering' | 'error'
export type MediaPlaybackIntent = 'play' | 'pause'
export type MediaPlaybackSourceKind = 'none' | 'blob' | 'media-stream' | 'android-media3' | 'ios-avplayer'
export type MediaPlaybackIssueKind =
  | 'android-native-not-ready'
  | 'android-native-error'
  | 'android-native-service-stopped'
  | 'blob-fallback-limited'
  | 'derivative-unavailable'
export type MediaPlaybackIssue = {
  readonly kind: MediaPlaybackIssueKind
  readonly trackId: number | null
  readonly sourceRevision: number | null
  readonly sourceSize: number | null
  readonly fallbackLimitBytes: number | null
  readonly nativeReason?: AndroidAudioFallbackReason
  readonly nativeCode?: string | null
}
export type MediaPlaybackFallbackPanelState = {
  readonly titleKey: string
  readonly copyKey: string
}
export type MediaPlaybackWaveformDisplayBar = {
  readonly index: number
  readonly level: number
  readonly band: 'low' | 'mid' | 'high'
  readonly emphasis: 'soft' | 'normal' | 'peak'
  readonly isPlayed: boolean
  readonly isNearPlayhead: boolean
}
export type MediaPlaybackQueueRow = {
  readonly index: number
  readonly id: number
  readonly title: string
  readonly fileName: string
  readonly durationLabel: string
  readonly isCurrent: boolean
}
const AUDIO_SESSION_STOP_SLOW_TRACE_MS = 1_200
const AUDIO_SESSION_DRIVER_START_SLOW_TRACE_MS = 1_500
export const ANDROID_NATIVE_AUDIO_PREPARING_STATUS_DELAY_MS = 500
const SEEK_PREVIEW_SETTLE_EPSILON_SECONDS = 0.35
const PLAYBACK_UI_CLOCK_FALLBACK_FRAME_MS = 16
const AUDIO_FILE_EXTENSION_PATTERN = /\.(aac|aif|aiff|alac|flac|m4a|mp3|ogg|opus|wav|weba)$/i
const NON_QUARANTINE_NATIVE_AUDIO_CODES = new Set([
  'ERR_NATIVE_AUDIO_VAULT_LOCKED',
  'ERR_NATIVE_AUDIO_SOURCE_STALE',
  'ERR_NATIVE_AUDIO_SESSION_STALE',
])
const ANDROID_AUDIO_WAIT_WITHOUT_WEB_FALLBACK_REASONS = new Set<AndroidAudioFallbackReason>([
  'native_start_no_event',
  'native_playback_not_ready',
])
export const MEDIA_PLAYBACK_WAVEFORM_LEVEL_COUNT = 12
const MEDIA_PLAYBACK_WAVEFORM_BASE_SHAPE = [
  2, 3, 2, 4, 5, 4, 6, 8, 7, 9, 11, 8, 6, 4, 5, 7, 10, 12, 9, 7, 5, 4, 3, 5, 8, 10, 7, 6, 4, 3, 2, 3, 4, 6, 8,
  7, 5, 6, 9, 11, 12, 9, 7, 5, 4, 6, 8, 10, 7, 5, 3, 4, 6, 8, 7, 5, 4, 3, 5, 4, 3, 2, 3, 2, 4, 5, 7, 9, 8, 6,
  5, 4, 6, 8, 11, 10, 7, 5, 4, 3, 4, 5, 7, 6, 5, 4, 3, 3, 4, 6, 5, 4, 3, 2, 2, 1,
] as const
export const MEDIA_PLAYBACK_WAVEFORM_BAR_COUNT = MEDIA_PLAYBACK_WAVEFORM_BASE_SHAPE.length
const LOW_WAVEFORM_BAR_END = Math.floor(MEDIA_PLAYBACK_WAVEFORM_BAR_COUNT / 3)
const HIGH_WAVEFORM_BAR_START = Math.floor(MEDIA_PLAYBACK_WAVEFORM_BAR_COUNT * 0.75)

export interface MediaPlaybackSeekRequest {
  readonly id: number
  readonly time: number
}

export interface MediaPlaybackStartAudioSessionOptions {
  readonly autoplay?: boolean
  readonly showFullPlayer?: boolean
}

function clampTrackIndex(tracks: ResolvedAudioTrack[], index: number): number {
  if (tracks.length === 0) return 0
  if (!Number.isFinite(index)) return 0
  return Math.min(tracks.length - 1, Math.max(0, Math.floor(index)))
}

function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(safeSeconds / 60)
  const rest = safeSeconds % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

function formatAudioTrackTitle(name: string): string {
  const trimmed = name.trim()
  const title = trimmed.replace(AUDIO_FILE_EXTENSION_PATTERN, '')
  return title || trimmed || name
}

function normalizePlaybackDuration(seconds: number | null | undefined): number | null {
  return seconds != null && Number.isFinite(seconds) && seconds > 0 ? seconds : null
}

function trackDurationCacheKey(track: ResolvedAudioTrack): string {
  return [track.id, track.sourceRevision ?? '', track.lastModified ?? '', track.size ?? ''].join(':')
}

function toPositiveFiniteSourceSize(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function shouldQuarantineAndroidNativeAudio(code: string | null | undefined): boolean {
  return !code || !NON_QUARANTINE_NATIVE_AUDIO_CODES.has(code)
}

function mapWaveformBarBand(index: number): MediaPlaybackWaveformDisplayBar['band'] {
  if (index < LOW_WAVEFORM_BAR_END) return 'low'
  return index < HIGH_WAVEFORM_BAR_START ? 'mid' : 'high'
}

function mapWaveformBarEmphasis(level: number): MediaPlaybackWaveformDisplayBar['emphasis'] {
  if (level >= MEDIA_PLAYBACK_WAVEFORM_LEVEL_COUNT - 1) return 'peak'
  return level <= 3 ? 'soft' : 'normal'
}

function hashWaveformSeed(input: string): number {
  let hash = 2166136261
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

function getWaveformSeed(track: ResolvedAudioTrack | null): string {
  if (!track) return ''
  return [track.id, track.name, track.sourceRevision ?? '', track.lastModified ?? '', track.size ?? ''].join(
    ':',
  )
}

function createTrackWaveformShape(track: ResolvedAudioTrack | null): readonly number[] {
  const seed = hashWaveformSeed(getWaveformSeed(track))

  return MEDIA_PLAYBACK_WAVEFORM_BASE_SHAPE.map((baseLevel, index) => {
    const mixed = hashWaveformSeed(`${seed}:${index}`)
    const variation = (mixed % 5) - 2
    const neighborPull = ((mixed >>> 5) % 3) - 1
    const level = baseLevel + variation + neighborPull
    return Math.min(MEDIA_PLAYBACK_WAVEFORM_LEVEL_COUNT, Math.max(1, level))
  })
}

class MediaPlaybackModel implements MediaStreamOwner {
  readonly sessionKind = atom<'none' | 'audio'>('none', 'mediaPlayback.sessionKind')
  readonly tracks = atom<ResolvedAudioTrack[]>([], 'mediaPlayback.tracks')
  readonly currentIndex = atom(0, 'mediaPlayback.currentIndex')
  readonly sourceUrl = atom<string | null>(null, 'mediaPlayback.sourceUrl')
  readonly sourceKind = atom<MediaPlaybackSourceKind>('none', 'mediaPlayback.sourceKind')
  readonly sourceStreamId = atom<string | null>(null, 'mediaPlayback.sourceStreamId')
  readonly driverKind = atom<AudioPlaybackDriverKind>('web-audio-element', 'mediaPlayback.driverKind')
  readonly nativeSessionId = atom<string | null>(null, 'mediaPlayback.nativeSessionId')
  readonly loadingState = atom<MediaPlaybackLoadingState>('idle', 'mediaPlayback.loadingState')
  readonly playbackState = atom<MediaPlaybackState>('stopped', 'mediaPlayback.playbackState')
  readonly playbackIntent = atom<MediaPlaybackIntent>('pause', 'mediaPlayback.playbackIntent')
  private readonly androidNativeAudioReadySeen = atom(false, 'mediaPlayback.androidNativeAudioReadySeen')
  private readonly nativeAudioPreparingStatusVisibleAtom = atom(
    false,
    'mediaPlayback.nativeAudioPreparingStatusVisible',
  )
  readonly currentTime = atom(0, 'mediaPlayback.currentTime')
  private readonly currentTimeObservedAtMs = atom(0, 'mediaPlayback.currentTimeObservedAtMs')
  private readonly playbackUiClockMs = atom(0, 'mediaPlayback.playbackUiClockMs')
  readonly duration = atom<number | null>(null, 'mediaPlayback.duration')
  readonly seekPreviewTime = atom<number | null>(null, 'mediaPlayback.seekPreviewTime')
  readonly seekRequest = atom<MediaPlaybackSeekRequest | null>(null, 'mediaPlayback.seekRequest')
  readonly fullPlayerOpen = atom(false, 'mediaPlayback.fullPlayerOpen')
  readonly playbackIssue = atom<MediaPlaybackIssue | null>(null, 'mediaPlayback.playbackIssue')
  private readonly trackDurationSeconds = atom<Record<string, number>>(
    {},
    'mediaPlayback.trackDurationSeconds',
  )

  readonly currentTrack = computed<ResolvedAudioTrack | null>(() => {
    const tracks = this.tracks()
    return tracks[this.currentIndex()] ?? null
  })

  readonly currentTrackTitle = computed<string>(() => {
    const current = this.currentTrack()
    return current ? formatAudioTrackTitle(current.name) : ''
  })
  readonly currentTrackFileName = computed<string>(() => this.currentTrack()?.name ?? '')
  readonly hasPrevious = computed<boolean>(() => this.currentIndex() > 0)
  readonly hasNext = computed<boolean>(() => this.currentIndex() < this.tracks().length - 1)
  readonly currentTrackId = computed<number | null>(() => this.currentTrack()?.id ?? null)
  readonly isPlaying = computed<boolean>(() => this.playbackIntent() === 'play')
  private readonly playbackTimelineActive = computed<boolean>(() => {
    const duration = this.duration()

    return (
      this.fullPlayerOpen() &&
      this.sessionKind() === 'audio' &&
      this.currentTrack() !== null &&
      this.loadingState() === 'loaded' &&
      this.playbackIntent() === 'play' &&
      this.playbackState() === 'playing' &&
      this.seekPreviewTime() === null &&
      duration !== null &&
      Number.isFinite(duration) &&
      duration > 0
    )
  }, 'mediaPlayback.playbackTimelineActive')
  readonly displayCurrentTime = computed<number>(() => {
    const previewTime = this.seekPreviewTime()
    let time = previewTime ?? this.currentTime()
    if (previewTime === null && this.playbackTimelineActive()) {
      const elapsedSeconds = Math.max(0, this.playbackUiClockMs() - this.currentTimeObservedAtMs()) / 1000
      time += elapsedSeconds
    }

    const duration = this.duration()
    if (duration !== null && Number.isFinite(duration) && duration > 0) {
      return Math.min(duration, Math.max(0, time))
    }

    return Math.max(0, time)
  })
  readonly currentPositionLabel = computed<string>(() => formatDuration(this.displayCurrentTime()))
  readonly durationLabel = computed<string>(() => {
    const duration = this.duration()
    return duration == null ? '--:--' : formatDuration(duration)
  })
  readonly progressValue = computed<number>(() => {
    if (this.sessionKind() !== 'audio' || this.currentTrack() === null) return 0
    if (this.loadingState() === 'fallback-limited') return 0
    const duration = this.duration()
    if (duration == null || !Number.isFinite(duration) || duration <= 0) return 0
    return Math.min(1, Math.max(0, this.displayCurrentTime() / duration))
  })
  readonly queueCount = computed<number>(() => this.tracks().length)
  readonly miniControlsVisible = computed<boolean>(
    () => this.sessionKind() === 'audio' && this.currentTrack() !== null,
  )
  readonly androidNativeAudioActive = computed<boolean>(
    () => this.driverKind() === 'android-media3' && this.nativeSessionId() !== null,
  )
  readonly nativeAudioActive = computed<boolean>(
    () =>
      (this.driverKind() === 'android-media3' || this.driverKind() === 'ios-avplayer') &&
      this.nativeSessionId() !== null,
  )
  readonly nativeAudioPreparing = computed<boolean>(
    () =>
      this.sessionKind() === 'audio' &&
      this.currentTrack() !== null &&
      (this.driverKind() === 'android-media3' || this.driverKind() === 'ios-avplayer') &&
      !this.androidNativeAudioReadySeen() &&
      this.playbackIntent() === 'play' &&
      (this.loadingState() === 'loading' || this.playbackState() === 'buffering'),
  )
  readonly nativeAudioPreparingStatusVisible = computed<boolean>(
    () => this.nativeAudioPreparingStatusVisibleAtom() && this.nativeAudioPreparing(),
    'mediaPlayback.nativeAudioPreparingStatusVisible.computed',
  )
  readonly canSeek = computed<boolean>(() => {
    const duration = this.duration()
    return (
      this.sessionKind() === 'audio' &&
      this.currentTrack() !== null &&
      duration !== null &&
      Number.isFinite(duration) &&
      duration > 0 &&
      this.loadingState() === 'loaded'
    )
  })
  readonly positionLabel = computed<string>(() => {
    const duration = this.duration()
    const position = formatDuration(this.displayCurrentTime())
    return duration == null ? position : `${position} / ${formatDuration(duration)}`
  })
  readonly audioArtworkLoadAllowed = computed<boolean>(
    () => this.sessionKind() === 'audio' && this.currentTrack() !== null && this.loadingState() === 'loaded',
  )
  readonly fallbackPanelState = computed<MediaPlaybackFallbackPanelState>(() => {
    const issue = this.playbackIssue()
    if (issue?.kind === 'android-native-not-ready') {
      return {
        titleKey: 'media:native-playback-unavailable-title',
        copyKey: 'media:android-native-not-ready-fallback-copy',
      }
    }

    return {
      titleKey: 'media:fallback-limited-title',
      copyKey: 'media:fallback-limited-copy',
    }
  })
  readonly waveformDisplayBars = computed<MediaPlaybackWaveformDisplayBar[]>(() => {
    const progress = this.progressValue()
    const shape = createTrackWaveformShape(this.currentTrack())
    const count = shape.length
    const playedBarCount = Math.floor(progress * count)
    const playheadIndex = Math.min(count - 1, Math.max(0, Math.floor(progress * count)))

    return shape.map((level, index): MediaPlaybackWaveformDisplayBar => {
      return {
        index,
        level,
        band: mapWaveformBarBand(index),
        emphasis: mapWaveformBarEmphasis(level),
        isPlayed: index < playedBarCount,
        isNearPlayhead: count > 0 && Math.abs(index - playheadIndex) <= 1,
      }
    })
  })
  readonly queueRows = computed<MediaPlaybackQueueRow[]>(() => {
    const tracks = this.tracks()
    const currentIndex = this.currentIndex()
    const currentDuration = normalizePlaybackDuration(this.duration())
    const cachedDurations = this.trackDurationSeconds()

    return tracks.map((track, index): MediaPlaybackQueueRow => {
      const cachedDuration = cachedDurations[trackDurationCacheKey(track)] ?? null
      const duration = index === currentIndex ? (currentDuration ?? cachedDuration) : cachedDuration

      return {
        index,
        id: track.id,
        title: formatAudioTrackTitle(track.name),
        fileName: track.name,
        durationLabel: duration === null ? '--:--' : formatDuration(duration),
        isCurrent: index === currentIndex,
      }
    })
  })

  private readonly driverHost = {
    currentTrack: () => this.currentTrack(),
    sessionKind: () => this.sessionKind(),
    playbackIntent: () => this.playbackIntent(),
    loadingState: () => this.loadingState(),
    sourceStreamId: () => this.sourceStreamId(),
    setDriverKind: (kind: AudioPlaybackDriverKind) => this.driverKind.set(kind),
    setNativeSessionId: (nativeSessionId: string | null) => this.nativeSessionId.set(nativeSessionId),
    setSourceState: (state: {url: string | null; kind: MediaPlaybackSourceKind; streamId: string | null}) =>
      this.setSourceState(state),
    setLoadingState: (state: MediaPlaybackLoadingState) => this.setLoadingState(state),
    setPlaybackState: (state: MediaPlaybackState) => this.setPlaybackState(state),
    setPlaybackIntent: (intent: MediaPlaybackIntent) => this.setPlaybackIntent(intent),
    setPlaybackIssue: (issue: MediaPlaybackIssue | null) => this.playbackIssue.set(issue),
    clearSeekRequest: () => this.clearSeekRequest(),
    reconcileAndroidPreparedTracks: (tracks: AndroidAudioPreparedTrack[] | undefined) =>
      this.reconcileAndroidPreparedTracks(tracks),
    reconcileNativePreparedTracks: (tracks: NativeAudioPreparedTrack[] | undefined) =>
      this.reconcileAndroidPreparedTracks(tracks),
    markNativeStreamingUnsupportedForRuntime: () => this.markNativeStreamingUnsupportedForRuntime(),
    handleNativeStreamError: (event: MediaStreamErrorEvent) => this.handleNativeStreamError(event),
    releaseNativeStreamForLifecycle: (
      reason: MediaStreamLifecycleReleaseReason,
      context?: MediaStreamLifecycleReleaseContext,
    ) => this.releaseNativeStreamForLifecycle(reason, context),
  }
  private readonly androidAudioReconciler = new AndroidAudioSessionReconciler({
    driverKind: () => this.driverKind(),
    nativeSessionId: () => this.nativeSessionId(),
    tracks: () => this.tracks(),
    currentIndex: () => this.currentIndex(),
    currentTrack: () => this.currentTrack(),
    sessionKind: () => this.sessionKind(),
    playbackIntent: () => this.playbackIntent(),
    playbackState: () => this.playbackState(),
    loadingState: () => this.loadingState(),
    setCurrentIndex: (index: number) => this.currentIndex.set(index),
    setLoadingState: (state: MediaPlaybackLoadingState) => this.setLoadingState(state),
    setPlaybackState: (state: MediaPlaybackState) => this.setPlaybackState(state),
    setPlaybackIntent: (intent: MediaPlaybackIntent) => this.setPlaybackIntent(intent),
    setCurrentTime: (seconds: number) => this.setObservedCurrentTime(seconds),
    setDuration: (seconds: number | null) => this.setDuration(seconds),
    clearPlaybackIssue: () => this.playbackIssue.set(null),
    clearSeekPreview: () => this.seekPreviewTime.set(null),
    clearSeekRequest: () => this.clearSeekRequest(),
    fallbackAndroidAudioToWeb: (nativeSessionId: string, reason: AndroidAudioFallbackReason) =>
      this.fallbackAndroidAudioToWeb(nativeSessionId, reason),
    failAndroidAudioSession: (event: AndroidAudioPlayerEvent) => this.failAndroidAudioSession(event),
    handleAndroidAudioReleased: (event: AndroidAudioPlayerEvent) => this.handleAndroidAudioReleased(event),
    handleTrackEnded: () => this.handleTrackEnded(),
  })
  private readonly webAudioDriver = new WebAudioElementPlaybackDriver(this.driverHost)
  private readonly androidMedia3Driver = new AndroidMedia3PlaybackDriver(this.driverHost)
  private readonly iosAvPlayerDriver = new IosAvPlayerPlaybackDriver(this.driverHost)
  private activeDriver: AudioPlaybackDriver = this.webAudioDriver
  private seekRequestId = 0
  private audioSessionGeneration = 0
  private nativeAudioPreparingStatusTimer: ReturnType<typeof setTimeout> | null = null
  private playbackUiClockFrame: number | ReturnType<typeof setTimeout> | null = null

  constructor() {
    this.syncNativeAudioPreparingStatus(this.nativeAudioPreparing())
    subscribeToSignalChanges(this.nativeAudioPreparing, (preparing) =>
      this.syncNativeAudioPreparingStatus(preparing),
    )
    this.syncPlaybackUiClock(this.playbackTimelineActive())
    subscribeToSignalChanges(this.playbackTimelineActive, (active) =>
      this.syncPlaybackUiClock(active),
    )
  }

  private getNowMs(): number {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now()
  }

  private requestPlaybackUiClockFrame(
    callback: (time: number) => void,
  ): number | ReturnType<typeof setTimeout> {
    if (typeof requestAnimationFrame === 'function') {
      return requestAnimationFrame(callback)
    }

    return setTimeout(() => callback(this.getNowMs()), PLAYBACK_UI_CLOCK_FALLBACK_FRAME_MS)
  }

  private cancelPlaybackUiClockFrame(frame: number | ReturnType<typeof setTimeout>): void {
    if (typeof frame === 'number' && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(frame)
      return
    }

    clearTimeout(frame as ReturnType<typeof setTimeout>)
  }

  private syncPlaybackUiClock(active: boolean): void {
    if (!active) {
      this.cancelPlaybackUiClock()
      return
    }

    const now = this.getNowMs()
    this.currentTimeObservedAtMs.set(now)
    this.playbackUiClockMs.set(now)
    this.schedulePlaybackUiClock()
  }

  private schedulePlaybackUiClock(): void {
    if (this.playbackUiClockFrame !== null) return

    this.playbackUiClockFrame = this.requestPlaybackUiClockFrame((time) => {
      this.playbackUiClockFrame = null
      if (!this.playbackTimelineActive()) return

      this.playbackUiClockMs.set(time)
      this.schedulePlaybackUiClock()
    })
  }

  private cancelPlaybackUiClock(): void {
    if (this.playbackUiClockFrame === null) return

    this.cancelPlaybackUiClockFrame(this.playbackUiClockFrame)
    this.playbackUiClockFrame = null
  }

  private syncPlaybackTimelineState(): void {
    this.syncPlaybackUiClock(this.playbackTimelineActive())
  }

  private setCurrentTimeAnchor(seconds: number): void {
    const now = this.getNowMs()
    this.currentTime.set(seconds)
    this.currentTimeObservedAtMs.set(now)
    this.playbackUiClockMs.set(now)
  }

  async startAudioSession(
    tracks: ResolvedAudioTrack[],
    index: number,
    options: MediaPlaybackStartAudioSessionOptions = {},
  ): Promise<void> {
    const generation = ++this.audioSessionGeneration
    const normalizedTracks = tracks.filter((track) => track && Number.isFinite(track.id) && track.name)
    const normalizedIndex = clampTrackIndex(normalizedTracks, index)
    const requestedTrack = normalizedTracks[normalizedIndex] ?? null
    const previousDriverKind = this.activeDriver.kind
    const previousNativeSessionId = this.nativeSessionId()
    const autoplay = options.autoplay ?? false
    const showFullPlayer = normalizedTracks.length > 0 && (options.showFullPlayer ?? true)

    this.traceAndroidAudio('sessionStartRequested', {
      generation,
      requestedIndex: normalizedIndex,
      requestedTrackId: requestedTrack?.id ?? null,
      requestedSourceRevision: requestedTrack ? resolveAndroidTrackSourceRevision(requestedTrack) : null,
      requestedTrackCount: normalizedTracks.length,
      previousSessionKind: this.sessionKind(),
      previousTrackId: this.currentTrackId(),
      previousDriverKind,
      previousNativeSessionId: redactAndroidNativeSessionId(previousNativeSessionId),
      fullPlayerOpen: this.fullPlayerOpen(),
    })

    this.clearAndroidNativeWatchdogs()
    this.resetAndroidNativeSessionTracking()
    const stopStartedAt = Date.now()
    const stopSlowTrace = setTimeout(() => {
      if (!this.isActiveAudioSessionGeneration(generation)) return
      this.traceAndroidAudio('sessionPreviousStopSlow', {
        generation,
        elapsedMs: elapsedSince(stopStartedAt),
        previousDriverKind,
        previousNativeSessionId: redactAndroidNativeSessionId(previousNativeSessionId),
      })
    }, AUDIO_SESSION_STOP_SLOW_TRACE_MS)
    try {
      await wrap(this.activeDriver.stop())
    } catch (error) {
      this.traceAndroidAudio('sessionPreviousStopFailed', {
        generation,
        elapsedMs: elapsedSince(stopStartedAt),
        previousDriverKind,
        error: error instanceof Error ? error.name : typeof error,
      })
      throw error
    } finally {
      clearTimeout(stopSlowTrace)
    }
    this.traceAndroidAudio('sessionPreviousStopped', {
      generation,
      elapsedMs: elapsedSince(stopStartedAt),
      previousDriverKind,
    })
    if (!this.isActiveAudioSessionGeneration(generation)) {
      this.traceAndroidAudio('sessionStartAborted', {
        generation,
        reason: 'generation_stale_after_stop',
        activeGeneration: this.audioSessionGeneration,
      })
      return
    }

    this.activeDriver = this.webAudioDriver
    this.driverKind.set('web-audio-element')
    this.nativeSessionId.set(null)
    this.sessionKind.set(normalizedTracks.length > 0 ? 'audio' : 'none')
    this.tracks.set(normalizedTracks)
    this.currentIndex.set(normalizedIndex)
    this.playbackIssue.set(null)
    this.androidNativeAudioReadySeen.set(false)
    this.playbackIntent.set(autoplay ? 'play' : 'pause')
    this.playbackState.set(normalizedTracks.length > 0 ? (autoplay ? 'buffering' : 'paused') : 'stopped')
    this.currentTime.set(0)
    this.duration.set(null)
    this.seekPreviewTime.set(null)
    this.clearSeekRequest()
    this.fullPlayerOpen.set(showFullPlayer)
    this.syncPlaybackTimelineState()
    this.traceAndroidAudio('sessionStateCommitted', {
      generation,
      requestedIndex: normalizedIndex,
      requestedTrackId: requestedTrack?.id ?? null,
      requestedTrackCount: normalizedTracks.length,
      sessionKind: this.sessionKind(),
      fullPlayerOpen: this.fullPlayerOpen(),
    })

    if (normalizedTracks.length === 0) {
      this.loadingState.set('idle')
      this.traceAndroidAudio('sessionStartSkipped', {
        generation,
        reason: 'no_tracks',
      })
      return
    }

    await this.startSelectedDriver(
      {
        tracks: normalizedTracks,
        index: normalizedIndex,
        autoplay,
      },
      generation,
    )
  }

  openFullPlayer(): void {
    if (this.sessionKind() === 'audio' && this.currentTrack()) {
      this.fullPlayerOpen.set(true)
      this.syncPlaybackTimelineState()
    }
  }

  minimizeFullPlayer(): void {
    this.cancelSeekPreview()
    this.fullPlayerOpen.set(false)
    this.syncPlaybackTimelineState()
  }

  async stopSession(): Promise<void> {
    const generation = ++this.audioSessionGeneration
    const previousDriverKind = this.activeDriver.kind
    const previousNativeSessionId = this.nativeSessionId()
    this.traceAndroidAudio('sessionStopRequested', {
      generation,
      previousSessionKind: this.sessionKind(),
      previousTrackId: this.currentTrackId(),
      previousDriverKind,
      previousNativeSessionId: redactAndroidNativeSessionId(previousNativeSessionId),
    })
    this.clearAndroidNativeWatchdogs()
    this.resetAndroidNativeSessionTracking()
    const stopStartedAt = Date.now()
    const stopSlowTrace = setTimeout(() => {
      if (!this.isActiveAudioSessionGeneration(generation)) return
      this.traceAndroidAudio('sessionStopSlow', {
        generation,
        elapsedMs: elapsedSince(stopStartedAt),
        previousDriverKind,
        previousNativeSessionId: redactAndroidNativeSessionId(previousNativeSessionId),
      })
    }, AUDIO_SESSION_STOP_SLOW_TRACE_MS)
    try {
      await wrap(this.activeDriver.stop())
    } catch (error) {
      this.traceAndroidAudio('sessionStopFailed', {
        generation,
        elapsedMs: elapsedSince(stopStartedAt),
        previousDriverKind,
        error: error instanceof Error ? error.name : typeof error,
      })
      throw error
    } finally {
      clearTimeout(stopSlowTrace)
    }
    this.traceAndroidAudio('sessionStopped', {
      generation,
      elapsedMs: elapsedSince(stopStartedAt),
      previousDriverKind,
    })
    if (!this.isActiveAudioSessionGeneration(generation)) {
      this.traceAndroidAudio('sessionStopAborted', {
        generation,
        reason: 'generation_stale_after_stop',
        activeGeneration: this.audioSessionGeneration,
      })
      return
    }

    this.activeDriver = this.webAudioDriver
    this.sessionKind.set('none')
    this.tracks.set([])
    this.currentIndex.set(0)
    this.driverKind.set('web-audio-element')
    this.nativeSessionId.set(null)
    this.sourceUrl.set(null)
    this.sourceKind.set('none')
    this.sourceStreamId.set(null)
    this.playbackIssue.set(null)
    this.androidNativeAudioReadySeen.set(false)
    this.loadingState.set('idle')
    this.playbackState.set('stopped')
    this.playbackIntent.set('pause')
    this.currentTime.set(0)
    this.duration.set(null)
    this.seekPreviewTime.set(null)
    this.clearSeekRequest()
    this.fullPlayerOpen.set(false)
    this.syncPlaybackTimelineState()
  }

  requestPlay(): void {
    this.traceAndroidAudio('requestPlay', {
      source: 'model',
      sessionKind: this.sessionKind(),
      trackId: this.currentTrackId(),
      driverKind: this.driverKind(),
      previousPlaybackIntent: this.playbackIntent(),
      previousPlaybackState: this.playbackState(),
      loadingState: this.loadingState(),
      nativeSessionId: redactAndroidNativeSessionId(this.nativeSessionId()),
    })
    if (!this.currentTrack()) return
    if (this.loadingState() === 'fallback-limited') return
    if (this.playbackIssue()) return
    this.playbackIntent.set('play')
    this.syncPlaybackTimelineState()
    this.startAndroidPlaybackReadyWatchdogIfNeeded()
    void this.activeDriver.play().catch((error) => this.handleDriverCommandFailure(error))
  }

  requestPause(): void {
    this.traceAndroidAudio('requestPause', {
      source: 'model',
      sessionKind: this.sessionKind(),
      trackId: this.currentTrackId(),
      driverKind: this.driverKind(),
      previousPlaybackIntent: this.playbackIntent(),
      previousPlaybackState: this.playbackState(),
      loadingState: this.loadingState(),
      nativeSessionId: redactAndroidNativeSessionId(this.nativeSessionId()),
    })
    this.clearAndroidPlaybackReadyWatchdog()
    this.playbackIntent.set('pause')
    if (this.playbackState() === 'playing' || this.playbackState() === 'buffering') {
      this.playbackState.set('paused')
    }
    this.syncPlaybackTimelineState()
    void this.activeDriver.pause().catch((error) => this.handleDriverCommandFailure(error))
  }

  togglePlayPause(): void {
    if (this.playbackIntent() === 'play') {
      this.requestPause()
      return
    }

    this.requestPlay()
  }

  previewSeek(seconds: number): void {
    const clamped = this.resolveSeekTime(seconds)
    if (clamped === null) return

    this.seekPreviewTime.set(clamped)
    this.syncPlaybackTimelineState()
  }

  commitSeek(seconds?: number): void {
    const target = seconds ?? this.seekPreviewTime()
    if (target === null || target === undefined) {
      this.seekPreviewTime.set(null)
      this.syncPlaybackTimelineState()
      return
    }

    const clamped = this.resolveSeekTime(target)
    if (clamped === null) {
      this.seekPreviewTime.set(null)
      this.syncPlaybackTimelineState()
      return
    }

    this.seekPreviewTime.set(clamped)
    this.applySeek(clamped)
  }

  cancelSeekPreview(): void {
    this.seekPreviewTime.set(null)
    this.syncPlaybackTimelineState()
  }

  seekTo(seconds: number): void {
    const clamped = this.resolveSeekTime(seconds)
    if (clamped === null) return

    this.seekPreviewTime.set(clamped)
    this.applySeek(clamped)
  }

  private resolveSeekTime(seconds: number): number | null {
    const duration = this.duration()
    if (
      this.sessionKind() !== 'audio' ||
      this.currentTrack() === null ||
      this.loadingState() !== 'loaded' ||
      duration === null ||
      duration <= 0 ||
      !Number.isFinite(duration) ||
      !Number.isFinite(seconds)
    ) {
      return null
    }

    return Math.min(duration, Math.max(0, seconds))
  }

  private applySeek(clamped: number): void {
    this.setCurrentTimeAnchor(clamped)
    this.seekRequest.set({id: ++this.seekRequestId, time: clamped})
    this.syncPlaybackTimelineState()
    void this.activeDriver.seekTo(clamped).catch((error) => this.handleDriverCommandFailure(error))
  }

  private setObservedCurrentTime(seconds: number): void {
    const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
    this.setCurrentTimeAnchor(safeSeconds)
    this.clearSettledSeekPreview(safeSeconds)
  }

  private setDuration(seconds: number | null): void {
    const duration = normalizePlaybackDuration(seconds)
    this.duration.set(duration)
    if (duration === null) return

    const current = this.currentTrack()
    if (!current) return

    const key = trackDurationCacheKey(current)
    const cachedDurations = this.trackDurationSeconds()
    if (cachedDurations[key] === duration) return

    this.trackDurationSeconds.set({...cachedDurations, [key]: duration})
  }

  private clearSettledSeekPreview(currentTime: number): void {
    const previewTime = this.seekPreviewTime()
    if (previewTime === null) return
    if (Math.abs(previewTime - currentTime) <= SEEK_PREVIEW_SETTLE_EPSILON_SECONDS) {
      this.seekPreviewTime.set(null)
      this.syncPlaybackTimelineState()
    }
  }

  async nextTrack(): Promise<void> {
    if (!this.hasNext()) return
    await this.selectTrack(this.currentIndex() + 1)
  }

  async previousTrack(): Promise<void> {
    if (!this.hasPrevious()) return
    await this.selectTrack(this.currentIndex() - 1)
  }

  async selectTrack(index: number): Promise<void> {
    const tracks = this.tracks()
    if (tracks.length === 0) return

    const nextIndex = clampTrackIndex(tracks, index)
    if (this.playbackIssue() && nextIndex !== this.currentIndex()) {
      await this.startAudioSession(tracks, nextIndex, {
        autoplay: this.playbackIntent() === 'play',
        showFullPlayer: this.fullPlayerOpen(),
      })
      return
    }

    const previousDriverKind = this.activeDriver.kind
    const previousNativeSessionId = this.nativeSessionId()
    this.currentIndex.set(nextIndex)
    this.currentTime.set(0)
    this.duration.set(null)
    this.seekPreviewTime.set(null)
    this.clearSeekRequest()
    this.playbackIssue.set(null)
    this.playbackState.set(this.playbackIntent() === 'play' ? 'buffering' : 'paused')
    this.syncPlaybackTimelineState()
    try {
      await wrap(this.activeDriver.selectTrack(nextIndex))
    } catch (error) {
      this.traceAndroidAudio('trackSelectFailed', {
        requestedIndex: nextIndex,
        previousDriverKind,
        previousNativeSessionId: redactAndroidNativeSessionId(previousNativeSessionId),
        error: error instanceof Error ? error.name : typeof error,
      })
      if (
        (previousDriverKind === 'android-media3' || previousDriverKind === 'ios-avplayer') &&
        previousNativeSessionId
      ) {
        this.traceAndroidAudio('trackSelectRestartSession', {
          requestedIndex: nextIndex,
          previousNativeSessionId: redactAndroidNativeSessionId(previousNativeSessionId),
          error: error instanceof Error ? error.name : typeof error,
          commandTimedOut: isAndroidMedia3CommandTimeoutError(error),
        })
        await this.startAudioSession(tracks, nextIndex, {
          autoplay: this.playbackIntent() === 'play',
          showFullPlayer: this.fullPlayerOpen(),
        })
        return
      }

      this.handleDriverCommandFailure(error)
      this.loadingState.set('error')
      this.playbackState.set('error')
      this.playbackIntent.set('pause')
      this.syncPlaybackTimelineState()
      return
    }
    this.startAndroidPlaybackReadyWatchdogIfNeeded()
  }

  async handleTrackEnded(): Promise<void> {
    if (this.hasNext()) {
      this.playbackIntent.set('play')
      await this.nextTrack()
      return
    }

    await this.stopSession()
  }

  handleMediaTimeUpdate(currentTime: number, duration: number | null): void {
    this.setObservedCurrentTime(currentTime)
    this.setDuration(duration)
  }

  handleMediaPlay(): void {
    this.traceAndroidAudio('mediaElementPlayObserved', {
      previousPlaybackIntent: this.playbackIntent(),
      previousPlaybackState: this.playbackState(),
      driverKind: this.driverKind(),
      sourceKind: this.sourceKind(),
      trackId: this.currentTrackId(),
    })
    this.playbackState.set('playing')
    this.playbackIntent.set('play')
    this.syncPlaybackTimelineState()
  }

  handleMediaPause(): void {
    this.traceAndroidAudio('mediaElementPauseObserved', {
      previousPlaybackIntent: this.playbackIntent(),
      previousPlaybackState: this.playbackState(),
      driverKind: this.driverKind(),
      sourceKind: this.sourceKind(),
      trackId: this.currentTrackId(),
    })
    if (this.playbackState() !== 'stopped') {
      this.playbackState.set('paused')
    }
    this.playbackIntent.set('pause')
    this.syncPlaybackTimelineState()
  }

  handleMediaWaiting(): void {
    if (this.sourceUrl()) {
      this.playbackState.set('buffering')
      this.syncPlaybackTimelineState()
    }
  }

  handleMediaCanPlay(): void {
    this.playbackIssue.set(null)
    this.loadingState.set('loaded')
    this.playbackState.set(this.playbackIntent() === 'play' ? 'playing' : 'paused')
    this.syncPlaybackTimelineState()
  }

  handleMediaError(): void {
    const streamId = this.sourceStreamId()
    if (this.sourceKind() === 'media-stream' && streamId) {
      this.handleNativeStreamLoadabilityFailure(streamId)
      return
    }

    this.loadingState.set('error')
    this.playbackState.set('error')
    this.syncPlaybackTimelineState()
  }

  handleNativeStreamError(event: MediaStreamErrorEvent): void {
    this.webAudioDriver.handleNativeStreamError(event)
  }

  handleNativeStreamLoadabilityFailure(streamId: string): void {
    this.webAudioDriver.handleNativeStreamLoadabilityFailure(streamId)
  }

  handleAndroidAudioPlayerEvent(payload: unknown): void {
    this.androidAudioReconciler.handlePlayerEvent(payload)
  }

  handleNativeAudioPlayerEvent(payload: unknown): void {
    this.androidAudioReconciler.handlePlayerEvent(payload as NativeAudioPlayerEvent)
  }

  async releaseSourceForLifecycle(
    reason: MediaStreamLifecycleReleaseReason,
    context: MediaStreamLifecycleReleaseContext = {},
  ): Promise<void> {
    const currentTrack = this.currentTrack()
    if (context.nodeId !== undefined && currentTrack?.id !== context.nodeId) return
    const generation = ++this.audioSessionGeneration

    this.traceAndroidAudio('sourceReleaseRequested', {
      reason,
      nodeId: context.nodeId ?? null,
      currentTrackId: currentTrack?.id ?? null,
    })
    this.clearAndroidNativeWatchdogs()
    this.resetAndroidNativeSessionTracking()
    await wrap(this.activeDriver.stop())
    if (!this.isActiveAudioSessionGeneration(generation)) return

    this.activeDriver = this.webAudioDriver
    this.driverKind.set('web-audio-element')
    this.nativeSessionId.set(null)
    this.playbackIssue.set(null)
    this.androidNativeAudioReadySeen.set(false)
    this.loadingState.set('idle')
    this.playbackState.set(this.sessionKind() === 'audio' && currentTrack ? 'paused' : 'stopped')
    this.playbackIntent.set('pause')
    this.currentTime.set(0)
    this.duration.set(null)
    this.seekPreviewTime.set(null)
    this.clearSeekRequest()
  }

  releaseNativeStreamForLifecycle(
    reason: MediaStreamLifecycleReleaseReason,
    context?: MediaStreamLifecycleReleaseContext,
  ): Promise<void> {
    return this.releaseSourceForLifecycle(reason, context)
  }

  markNativeStreamingUnsupportedForRuntime(): void {
    runtimeModeModel.disableNativeMediaStreamForRuntimeSession()
  }

  cleanup(): void {
    this.clearAndroidNativeWatchdogs()
    this.resetAndroidNativeSessionTracking()
    void this.stopSession()
  }

  mediaStreamLifecycleOwner(): MediaStreamOwner {
    return this.driverHost
  }

  private async startSelectedDriver(input: AudioSessionInput, generation: number): Promise<void> {
    const selectedDriver = this.selectAudioPlaybackDriver(input.tracks)
    this.activeDriver = selectedDriver
    this.driverKind.set(selectedDriver.kind)
    this.nativeSessionId.set(null)
    this.androidNativeAudioReadySeen.set(false)
    this.resetAndroidNativeSessionTracking()
    this.setSourceState({url: null, kind: 'none', streamId: null})
    const requestedTrack = input.tracks[input.index] ?? null
    const startedAt = Date.now()
    this.traceAndroidAudio('driverStartRequested', {
      generation,
      selectedDriverKind: selectedDriver.kind,
      requestedIndex: input.index,
      requestedTrackId: requestedTrack?.id ?? null,
      requestedSourceRevision: requestedTrack ? resolveAndroidTrackSourceRevision(requestedTrack) : null,
      trackCount: input.tracks.length,
      autoplay: input.autoplay,
    })
    const driverStartSlowTrace = setTimeout(() => {
      if (!this.isActiveAudioSessionGeneration(generation)) return
      this.traceAndroidAudio('driverStartSlow', {
        generation,
        elapsedMs: elapsedSince(startedAt),
        selectedDriverKind: selectedDriver.kind,
        requestedTrackId: requestedTrack?.id ?? null,
      })
    }, AUDIO_SESSION_DRIVER_START_SLOW_TRACE_MS)

    try {
      await wrap(selectedDriver.startSession(input))
      clearTimeout(driverStartSlowTrace)
      if (!this.isActiveAudioSessionGeneration(generation)) {
        this.traceAndroidAudio('driverStartAborted', {
          generation,
          reason: 'generation_stale_after_start',
          activeGeneration: this.audioSessionGeneration,
          selectedDriverKind: selectedDriver.kind,
          elapsedMs: elapsedSince(startedAt),
        })
        return
      }
      this.traceAndroidAudio('driverStartResolved', {
        generation,
        elapsedMs: elapsedSince(startedAt),
        selectedDriverKind: selectedDriver.kind,
        nativeSessionId: redactAndroidNativeSessionId(this.nativeSessionId()),
        sourceKind: this.sourceKind(),
        loadingState: this.loadingState(),
      })

      if (selectedDriver.kind === 'android-media3') {
        const nativeSessionId = this.nativeSessionId()
        if (nativeSessionId) {
          if (this.androidAudioReconciler.hasReceivedState(nativeSessionId)) {
            this.traceAndroidAudio('startAckAlreadyReceived', {
              expectedNativeSessionId: redactAndroidNativeSessionId(nativeSessionId),
            })
          } else {
            this.startAndroidStartAckWatchdog(nativeSessionId)
          }
        }
        this.startAndroidPlaybackReadyWatchdogIfNeeded()
      }
    } catch (error) {
      clearTimeout(driverStartSlowTrace)
      if (!this.isActiveAudioSessionGeneration(generation)) {
        this.traceAndroidAudio('driverStartAborted', {
          generation,
          reason: 'generation_stale_after_start_error',
          activeGeneration: this.audioSessionGeneration,
          selectedDriverKind: selectedDriver.kind,
          elapsedMs: elapsedSince(startedAt),
        })
        return
      }
      this.traceAndroidAudio('driverStartFailed', {
        generation,
        elapsedMs: elapsedSince(startedAt),
        selectedDriverKind: selectedDriver.kind,
        error: error instanceof Error ? error.name : typeof error,
      })
      if (selectedDriver.kind !== 'android-media3' && selectedDriver.kind !== 'ios-avplayer') {
        throw error
      }

      if (selectedDriver.kind === 'ios-avplayer') {
        disableIosAvPlayerPlaybackForRuntimeSession()
      } else {
        disableAndroidMedia3PlaybackForRuntimeSession()
      }
      const fallbackReason: AndroidAudioFallbackReason = isAndroidMedia3CommandTimeoutError(error)
        ? 'native_command_timeout'
        : 'native_start_failed'
      this.traceAndroidAudio('driverFallback', {
        reason: fallbackReason,
        error: error instanceof Error ? error.name : typeof error,
      })
      console.warn('[media-playback] Native audio start failed, falling back to Web audio', error)
      await wrap(selectedDriver.stop())
      if (!this.isActiveAudioSessionGeneration(generation)) return

      this.activeDriver = this.webAudioDriver
      this.driverKind.set('web-audio-element')
      this.nativeSessionId.set(null)
      this.androidNativeAudioReadySeen.set(false)
      this.resetAndroidNativeSessionTracking()
      await wrap(this.webAudioDriver.startSession(input))
    }
  }

  private isActiveAudioSessionGeneration(generation: number): boolean {
    return generation === this.audioSessionGeneration
  }

  private startAndroidStartAckWatchdog(nativeSessionId: string): void {
    this.androidAudioReconciler.startStartAckWatchdog(nativeSessionId)
  }

  private startAndroidPlaybackReadyWatchdogIfNeeded(): void {
    this.androidAudioReconciler.startPlaybackReadyWatchdogIfNeeded()
  }

  private clearAndroidPlaybackReadyWatchdog(): void {
    this.androidAudioReconciler.clearPlaybackReadyWatchdog()
  }

  private clearAndroidNativeWatchdogs(): void {
    this.androidAudioReconciler.clearNativeWatchdogs()
  }

  private resetAndroidNativeSessionTracking(): void {
    this.androidAudioReconciler.resetStateEventTracking()
  }

  private syncNativeAudioPreparingStatus(preparing: boolean): void {
    if (!preparing) {
      this.clearNativeAudioPreparingStatusTimer()
      if (this.nativeAudioPreparingStatusVisibleAtom()) {
        this.nativeAudioPreparingStatusVisibleAtom.set(false)
      }
      return
    }

    if (this.nativeAudioPreparingStatusVisibleAtom() || this.nativeAudioPreparingStatusTimer) return

    this.nativeAudioPreparingStatusTimer = setTimeout(() => {
      this.nativeAudioPreparingStatusTimer = null
      if (!this.nativeAudioPreparing()) return
      this.nativeAudioPreparingStatusVisibleAtom.set(true)
    }, ANDROID_NATIVE_AUDIO_PREPARING_STATUS_DELAY_MS)
  }

  private clearNativeAudioPreparingStatusTimer(): void {
    if (!this.nativeAudioPreparingStatusTimer) return

    clearTimeout(this.nativeAudioPreparingStatusTimer)
    this.nativeAudioPreparingStatusTimer = null
  }

  private createPlaybackIssue(
    kind: MediaPlaybackIssueKind,
    options: {
      track?: ResolvedAudioTrack | null
      fallbackLimitBytes?: number | null
      nativeReason?: AndroidAudioFallbackReason
      nativeCode?: string | null
    } = {},
  ): MediaPlaybackIssue {
    const track = options.track ?? this.currentTrack()
    return {
      kind,
      trackId: track?.id ?? null,
      sourceRevision: track ? resolveAndroidTrackSourceRevision(track) : null,
      sourceSize: toPositiveFiniteSourceSize(track?.size),
      fallbackLimitBytes: options.fallbackLimitBytes ?? null,
      nativeReason: options.nativeReason,
      nativeCode: options.nativeCode,
    }
  }

  private canUseAndroidAudioBlobFallback(track: ResolvedAudioTrack | null): boolean {
    const sourceSize = toPositiveFiniteSourceSize(track?.size)
    return sourceSize !== null && sourceSize <= MAX_ANDROID_AUDIO_BLOB_FALLBACK_BYTES
  }

  private applyAndroidNativeFallbackLimitedIssue(
    reason: AndroidAudioFallbackReason,
    track: ResolvedAudioTrack | null,
  ): void {
    this.activeDriver = this.webAudioDriver
    this.driverKind.set('web-audio-element')
    this.nativeSessionId.set(null)
    this.androidNativeAudioReadySeen.set(false)
    this.resetAndroidNativeSessionTracking()
    this.setSourceState({url: null, kind: 'none', streamId: null})
    this.loadingState.set('fallback-limited')
    this.playbackState.set('paused')
    this.playbackIntent.set('pause')
    this.currentTime.set(0)
    this.duration.set(null)
    this.seekPreviewTime.set(null)
    this.clearSeekRequest()
    this.playbackIssue.set(
      this.createPlaybackIssue(
        reason === 'native_playback_not_ready' || reason === 'native_start_no_event'
          ? 'android-native-not-ready'
          : 'android-native-error',
        {
          track,
          fallbackLimitBytes: MAX_ANDROID_AUDIO_BLOB_FALLBACK_BYTES,
          nativeReason: reason,
        },
      ),
    )
  }

  private async fallbackAndroidAudioToWeb(
    nativeSessionId: string,
    reason: AndroidAudioFallbackReason,
  ): Promise<void> {
    const driverKind = this.driverKind()
    if (
      (driverKind !== 'android-media3' && driverKind !== 'ios-avplayer') ||
      this.nativeSessionId() !== nativeSessionId
    ) return
    const generation = this.audioSessionGeneration

    const tracks = this.tracks()
    if (this.sessionKind() !== 'audio' || tracks.length === 0) return
    const fallbackTrack = tracks[clampTrackIndex(tracks, this.currentIndex())] ?? null
    const canUseWebFallback = this.canUseAndroidAudioBlobFallback(fallbackTrack)

    this.traceAndroidAudio('driverFallback', {
      reason,
      expectedNativeSessionId: redactAndroidNativeSessionId(nativeSessionId),
      canUseWebFallback,
      sourceSize: toPositiveFiniteSourceSize(fallbackTrack?.size),
      fallbackLimitBytes: MAX_ANDROID_AUDIO_BLOB_FALLBACK_BYTES,
    })
    console.warn(`[media-playback] Android native audio fallback: ${reason}`)

    if (!canUseWebFallback && ANDROID_AUDIO_WAIT_WITHOUT_WEB_FALLBACK_REASONS.has(reason)) {
      this.traceAndroidAudio('driverFallbackSkipped', {
        reason,
        skipReason: 'web_fallback_unavailable',
        expectedNativeSessionId: redactAndroidNativeSessionId(nativeSessionId),
        sourceSize: toPositiveFiniteSourceSize(fallbackTrack?.size),
        fallbackLimitBytes: MAX_ANDROID_AUDIO_BLOB_FALLBACK_BYTES,
      })
      return
    }

    this.clearAndroidNativeWatchdogs()
    this.resetAndroidNativeSessionTracking()
    await wrap((driverKind === 'ios-avplayer' ? this.iosAvPlayerDriver : this.androidMedia3Driver).stop())
    if (!this.isActiveAudioSessionGeneration(generation)) return
    if (this.driverKind() !== driverKind) return
    if (this.nativeSessionId() !== null && this.nativeSessionId() !== nativeSessionId) return
    if (this.sessionKind() !== 'audio' || this.tracks().length === 0) return
    if (!canUseWebFallback) {
      this.applyAndroidNativeFallbackLimitedIssue(reason, fallbackTrack)
      return
    }

    const fallbackTracks = this.tracks()
    this.activeDriver = this.webAudioDriver
    this.driverKind.set('web-audio-element')
    this.nativeSessionId.set(null)
    this.androidNativeAudioReadySeen.set(false)
    this.resetAndroidNativeSessionTracking()
    this.setSourceState({url: null, kind: 'none', streamId: null})
    this.playbackIssue.set(null)

    try {
      await wrap(
        this.webAudioDriver.startSession({
          tracks: fallbackTracks,
          index: clampTrackIndex(fallbackTracks, this.currentIndex()),
          autoplay: this.playbackIntent() === 'play',
        }),
      )
    } catch (error) {
      this.handleDriverCommandFailure(error)
    }
  }

  private selectAudioPlaybackDriver(tracks: ResolvedAudioTrack[]): AudioPlaybackDriver {
    const transport = tryGetAppContext()?.ws
    const iosFallbackReason = this.iosAvPlayerFallbackReason(tracks, transport)
    if (iosFallbackReason === null) {
      this.traceAndroidAudio('driverSelected', {
        driverKind: 'ios-avplayer',
        trackCount: tracks.length,
      })
      return this.iosAvPlayerDriver
    }

    const fallbackReason = this.androidMedia3FallbackReason(tracks, transport)
    if (fallbackReason === null) {
      this.traceAndroidAudio('driverSelected', {
        driverKind: 'android-media3',
        trackCount: tracks.length,
      })
      return this.androidMedia3Driver
    }

    this.traceAndroidAudio('driverSelected', {
      driverKind: 'web-audio-element',
      fallbackReason: runtimeCapabilitiesAtom().platform === 'ios' ? iosFallbackReason : fallbackReason,
      trackCount: tracks.length,
    })
    return this.webAudioDriver
  }

  private iosAvPlayerFallbackReason(
    tracks: ResolvedAudioTrack[],
    transport: TransportLike | undefined,
  ): string | null {
    if (runtimeCapabilitiesAtom().platform !== 'ios') return 'platform'
    if (transport?.kind !== 'tauri') return 'transport_unavailable'
    if (typeof transport.sendNativeAudioCommand !== 'function') return 'command_unavailable'
    if (!runtimeModeModel.canUseNativeAudioPlayback({transportKind: transport.kind})) {
      return 'runtime_gate'
    }
    if (!canUseIosAvPlayerPlaybackForTracks(tracks)) return 'track_metadata'
    return null
  }

  private androidMedia3FallbackReason(
    tracks: ResolvedAudioTrack[],
    transport: TransportLike | undefined,
  ): string | null {
    if (transport?.kind !== 'tauri') return 'transport_unavailable'
    if (typeof transport.sendAndroidAudioCommand !== 'function') return 'command_unavailable'
    if (!runtimeModeModel.canUseAndroidNativeAudio({transportKind: transport.kind})) {
      return 'runtime_gate'
    }
    if (!canUseAndroidMedia3PlaybackForTracks(tracks)) return 'track_metadata'
    return null
  }

  private traceAndroidAudio(event: string, meta: Record<string, unknown> = {}): void {
    this.androidAudioReconciler.trace(event, meta)
  }

  private setSourceState(state: {
    url: string | null
    kind: MediaPlaybackSourceKind
    streamId: string | null
  }): void {
    this.sourceUrl.set(state.url)
    this.sourceKind.set(state.kind)
    this.sourceStreamId.set(state.streamId)
  }

  private setLoadingState(state: MediaPlaybackLoadingState): void {
    this.loadingState.set(state)
    this.markAndroidNativeAudioReadyIfSettled()
    this.syncPlaybackTimelineState()
  }

  private setPlaybackIntent(intent: MediaPlaybackIntent): void {
    this.playbackIntent.set(intent)
    this.syncPlaybackTimelineState()
  }

  private setPlaybackState(state: MediaPlaybackState): void {
    this.playbackState.set(state)
    this.markAndroidNativeAudioReadyIfSettled()
    this.syncPlaybackTimelineState()
  }

  private markAndroidNativeAudioReadyIfSettled(): void {
    if (this.driverKind() !== 'android-media3' && this.driverKind() !== 'ios-avplayer') return
    if (this.loadingState() !== 'loaded' && this.playbackState() !== 'playing') return

    this.androidNativeAudioReadySeen.set(true)
  }

  reconcileAndroidPreparedTracks(preparedTracks: AndroidAudioPreparedTrack[] | undefined): void {
    if (!preparedTracks?.length) return

    const preparedByTrackId = new Map(preparedTracks.map((track) => [track.trackId, track]))
    const nextTracks = this.tracks().map((track) => {
      const prepared = preparedByTrackId.get(track.id)
      if (!prepared) return track

      return {
        ...track,
        mimeType: prepared.mimeType,
        size: prepared.size,
        sourceRevision: prepared.sourceRevision,
      }
    })
    this.tracks.set(nextTracks)
  }

  private handleDriverCommandFailure(error: unknown): void {
    console.warn('[media-playback] audio driver command failed', error)
  }

  private async failAndroidAudioSession(event: AndroidAudioPlayerEvent): Promise<void> {
    const nativeSessionId = this.nativeSessionId()
    if (event.nativeSessionId !== nativeSessionId) return
    const failedDriverKind = this.driverKind()
    if (failedDriverKind !== 'android-media3' && failedDriverKind !== 'ios-avplayer') return
    const generation = this.audioSessionGeneration
    const failedTrack = this.currentTrack()
    const fallbackTracks = this.tracks()
    const fallbackIndex = clampTrackIndex(fallbackTracks, this.currentIndex())
    const autoplay = this.playbackIntent() === 'play'
    const code = event.code ?? null
    const shouldQuarantine = shouldQuarantineAndroidNativeAudio(code)
    const canUseWebFallback = shouldQuarantine && this.canUseAndroidAudioBlobFallback(failedTrack)
    if (shouldQuarantine) {
      if (failedDriverKind === 'ios-avplayer') {
        disableIosAvPlayerPlaybackForRuntimeSession(code ?? 'ios_native_error')
      } else {
        disableAndroidMedia3PlaybackForRuntimeSession(code ?? 'android_native_error')
      }
    }

    await wrap(
      (failedDriverKind === 'ios-avplayer' ? this.iosAvPlayerDriver : this.androidMedia3Driver).stop(),
    )
    if (!this.isActiveAudioSessionGeneration(generation)) return
    if (this.driverKind() !== failedDriverKind) return
    if (this.nativeSessionId() !== null && this.nativeSessionId() !== nativeSessionId) return

    this.activeDriver = this.webAudioDriver
    this.driverKind.set('web-audio-element')
    this.nativeSessionId.set(null)
    this.androidNativeAudioReadySeen.set(false)
    this.resetAndroidNativeSessionTracking()
    this.setSourceState({url: null, kind: 'none', streamId: null})
    if (canUseWebFallback) {
      this.playbackIssue.set(null)
      try {
        await wrap(
          this.webAudioDriver.startSession({
            tracks: fallbackTracks,
            index: fallbackIndex,
            autoplay,
          }),
        )
      } catch (error) {
        this.handleDriverCommandFailure(error)
      }
      return
    }

    this.playbackIssue.set(
      this.createPlaybackIssue('android-native-error', {
        track: failedTrack,
        nativeCode: code,
      }),
    )
    this.loadingState.set('error')
    this.playbackState.set('error')
    this.playbackIntent.set('pause')
    this.seekPreviewTime.set(null)
    this.clearSeekRequest()
  }

  private handleAndroidAudioReleased(event: AndroidAudioPlayerEvent): void {
    if (event.nativeSessionId !== this.nativeSessionId()) return
    const releasedDriverKind = this.driverKind()
    if (releasedDriverKind !== 'android-media3' && releasedDriverKind !== 'ios-avplayer') return
    const track = this.currentTrack()
    const shouldRecordServiceIssue = event.reason === 'service_destroyed' && this.playbackIntent() === 'play'
    if (shouldRecordServiceIssue) {
      if (releasedDriverKind === 'ios-avplayer') {
        disableIosAvPlayerPlaybackForRuntimeSession('service_destroyed')
      } else {
        disableAndroidMedia3PlaybackForRuntimeSession('service_destroyed')
      }
    }

    this.clearAndroidNativeWatchdogs()
    this.resetAndroidNativeSessionTracking()
    this.activeDriver = this.webAudioDriver
    this.sessionKind.set('none')
    this.tracks.set([])
    this.currentIndex.set(0)
    this.driverKind.set('web-audio-element')
    this.nativeSessionId.set(null)
    this.androidNativeAudioReadySeen.set(false)
    this.setSourceState({url: null, kind: 'none', streamId: null})
    this.playbackIssue.set(
      shouldRecordServiceIssue ? this.createPlaybackIssue('android-native-service-stopped', {track}) : null,
    )
    this.loadingState.set('idle')
    this.playbackState.set('stopped')
    this.playbackIntent.set('pause')
    this.currentTime.set(0)
    this.duration.set(null)
    this.seekPreviewTime.set(null)
    this.clearSeekRequest()
    this.fullPlayerOpen.set(false)
  }

  private clearSeekRequest(): void {
    this.seekRequest.set(null)
  }
}

export const mediaPlaybackModel = new MediaPlaybackModel()
