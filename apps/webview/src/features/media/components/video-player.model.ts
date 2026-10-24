import {atom, wrap} from '@reatom/core'

import {runtimeModeModel} from 'root/core/runtime/runtime-mode.model'
import type {MediaStreamErrorEvent} from 'root/core/transport/transport'
import {i18n} from 'root/i18n'
import {getMediaStreamLoadabilityTimeoutMs} from 'root/features/media/models/media-stream-loadability'
import {
  registerInFlightMediaStreamLoad,
  registerMediaStreamOwner,
  type MediaStreamLifecycleReleaseContext,
  type MediaStreamLifecycleReleaseReason,
  type MediaStreamOwner,
} from 'root/features/media/models/media-stream-owner-registry'
import {areFileMediaInfosEquivalent} from 'root/features/media/models/media-info-identity'
import {
  MseVideoSourceController,
  isMseVideoSourceAbortError,
} from 'root/features/media/models/mse-video-source-controller'
import {
  emitMediaTelemetry,
  type MediaTelemetryEventName,
} from 'root/features/media/models/media-telemetry'
import {claimVideoSourceHandoff} from 'root/features/media/models/video-source-handoff'
import {writeAndroidUnlockDebug} from 'root/shared/services/android-unlock-debug'
import {isMediaBlobFallbackLimitError, loadFileSourceById, type FileSourceLoadResult} from './file-loader'
import type {FileMediaInfo} from 'root/core/catalog/media-info'
import {
  failedVideoSourceState,
  idleVideoSourceState,
  loadingVideoSourceState,
  readyVideoSourceState,
  videoSourceStateFromLoadError,
  videoSourceStateFromMediaStreamErrorCode,
  type VideoSourceFailureReason,
  type VideoSourceState,
} from 'root/features/media/models/video-source-state'

export type VideoPlayerSourceKind =
  | 'none'
  | 'blob'
  | 'video-source'
  | 'media-stream'
export type VideoPlayerSourceDelivery =
  | 'custom-scheme'
  | 'loopback-http'
  | 'mse'
  | 'native-video'
  | null
type NativeStreamFailureReason = 'element-error' | 'loadability-timeout' | 'range-required'

/**
 * SPEC-231: startup is model-driven. Playback starts once this many seconds are
 * buffered ahead of the playhead (or once the file is fully buffered), instead
 * of waiting for the browser's own HAVE_ENOUGH_DATA / autoplay heuristics.
 */
export const VIDEO_STARTUP_BUFFER_SECONDS = 4

const MEDIA_ERR_DECODE = 3
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4
const HAVE_FUTURE_DATA = 3

type VideoPlaybackQualityLike = {
  droppedVideoFrames?: number
  totalVideoFrames?: number
  corruptedVideoFrames?: number
}
export type VideoPlayerFileInput = {
  fileId: number
  fileName: string
  mimeType?: string | null
  mediaInfo?: FileMediaInfo | null
  lastModified?: number
  sourceSize?: number | null
}

export type VideoPlayerModelCallbacks = {
}

function formatVideoDebugPayload(payload: Record<string, unknown>): string {
  try {
    return JSON.stringify(payload)
  } catch {
    return String(payload)
  }
}

function formatVideoDebugError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const message = error.message.replace(/\s+/g, ' ').trim()
    return {
      errorName: error.name || 'Error',
      errorMessage: message && !message.includes('/') && !message.includes('\\') ? message.slice(0, 240) : null,
    }
  }

  return {
    errorName: 'NonError',
    errorType: typeof error,
  }
}

export class VideoPlayerModel implements MediaStreamOwner {
  readonly videoUrl = atom<string | null>(null, 'videoPlayer.videoUrl')
  readonly loading = atom(true, 'videoPlayer.loading')
  readonly fallbackLimited = atom(false, 'videoPlayer.fallbackLimited')
  readonly errorMessage = atom('', 'videoPlayer.errorMessage')
  readonly sourceKind = atom<VideoPlayerSourceKind>('none', 'videoPlayer.sourceKind')
  readonly sourceDelivery = atom<VideoPlayerSourceDelivery>(null, 'videoPlayer.sourceDelivery')
  readonly sourceStreamId = atom<string | null>(null, 'videoPlayer.sourceStreamId')
  readonly sourceState = atom<VideoSourceState>(idleVideoSourceState(), 'videoPlayer.sourceState')

  private abortController: AbortController | null = null
  private loadabilityTimer: ReturnType<typeof setTimeout> | null = null
  private currentSource: FileSourceLoadResult | null = null
  private mseController: MseVideoSourceController | null = null
  private pendingMsePlaybackPositionSeconds: number | null = null
  private mseBufferingPlaybackPosition = false
  private unregisterStreamOwner: (() => void) | undefined
  private telemetryTimer: ReturnType<typeof setInterval> | null = null
  private telemetryElement: HTMLVideoElement | null = null
  private telemetryEventLastAt = new Map<string, number>()
  private lastDroppedVideoFrames = 0
  private startupPlayRequested = false
  private startupCanPlayObserved = false
  private startupBufferSeconds = VIDEO_STARTUP_BUFFER_SECONDS
  private firstFrameReported = false
  private loadSessionId = 0
  private fileId = 0
  private fileName = ''
  private mimeType: string | null = null
  private mediaInfo: FileMediaInfo | null = null
  private lastModified: number | undefined
  private sourceSize: number | null = null

  constructor(private readonly callbacks: VideoPlayerModelCallbacks = {}) {}

  setFile(input: VideoPlayerFileInput) {
    const mimeType = input.mimeType ?? null
    const mediaInfo = input.mediaInfo ?? null
    const lastModified = input.lastModified
    const sourceSize = input.sourceSize ?? null
    // Allow retrying a failed load with identical inputs (W15); otherwise a
    // structurally identical setFile (e.g. a catalog refresh rebuilding node
    // objects with the same content, W7) must not restart playback.
    const retryAfterFailure = this.sourceState().state === 'failed'
    if (
      !retryAfterFailure &&
      this.fileId === input.fileId &&
      this.fileName === input.fileName &&
      this.mimeType === mimeType &&
      areFileMediaInfosEquivalent(this.mediaInfo, mediaInfo) &&
      this.lastModified === lastModified &&
      this.sourceSize === sourceSize
    ) {
      return
    }

    this.fileId = input.fileId
    this.fileName = input.fileName
    this.mimeType = mimeType
    this.mediaInfo = mediaInfo
    this.lastModified = lastModified
    this.sourceSize = sourceSize
    void this.loadVideo()
  }

  cleanup() {
    this.invalidateCurrentLoad()
    this.fileId = 0
    this.fileName = ''
    this.mimeType = null
    this.mediaInfo = null
    this.lastModified = undefined
    this.sourceSize = null
    this.loading.set(true)
    this.fallbackLimited.set(false)
    this.errorMessage.set('')
  }

  async loadVideo() {
    if (!this.fileId || !this.fileName) return

    const sessionId = this.beginLoadAttempt()
    this.loading.set(true)
    this.fallbackLimited.set(false)
    this.errorMessage.set('')
    this.sourceState.set(loadingVideoSourceState())
    this.trace('loadRequested')

    // SPEC-231 follow-up: reuse the preview tile's live prepared source for
    // the same node/revision instead of preparing a second one. The claim
    // atomically transfers release responsibility to this model.
    const handoffSource = claimVideoSourceHandoff({
      nodeId: this.fileId,
      lastModified: this.lastModified,
    })
    if (handoffSource) {
      this.trace('sourceResolved', {...this.sourceDebugMeta(handoffSource), handoff: true})
      this.attachSource(handoffSource)
      this.loading.set(false)
      return
    }

    const controller = new AbortController()
    this.abortController = controller
    // Lifecycle releases (vault lock, background, transport loss) must be able
    // to cancel a prepare that is still in flight, before an owner exists.
    const unregisterInFlightLoad = registerInFlightMediaStreamLoad(controller, {
      owner: this,
      nodeId: this.fileId,
    })

    try {
      const source = await wrap(
        loadFileSourceById(this.fileId, this.fileName, {
          signal: controller.signal,
          variant: 'raw',
          mimeType: this.mimeType,
          mediaInfo: this.mediaInfo,
          lastModified: this.lastModified,
          sourceSize: this.sourceSize,
        }),
      )

      if (!this.isCurrentSession(sessionId) || controller.signal.aborted) {
        // A lifecycle release aborted this load while the backend prepare was
        // already resolving; release the freshly created stream instead of
        // attaching it post-lock.
        this.releaseSource(source)
        return
      }

      this.trace('sourceResolved', this.sourceDebugMeta(source))
      this.attachSource(source)
      this.loading.set(false)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      console.error('Failed to load video:', error)
      if (!this.isCurrentSession(sessionId)) return
      this.trace('loadFailed', formatVideoDebugError(error))
      this.loading.set(false)
      const sourceState = videoSourceStateFromLoadError(error)
      this.sourceState.set(sourceState)
      if (isMediaBlobFallbackLimitError(error)) {
        this.fallbackLimited.set(true)
        this.errorMessage.set(i18n('media:fallback-limited-title' as any))
        return
      }
      this.errorMessage.set(i18n('media:video-load-failed' as any))
    } finally {
      unregisterInFlightLoad()
      if (this.abortController === controller) {
        this.abortController = null
      }
    }
  }

  handleVideoElementReady(video?: HTMLVideoElement) {
    if (video) {
      this.startPlaybackTelemetry(video)
      this.ensureMseBufferedNearPlayback(video)
      this.maybeStartStartupPlayback(video, 'elementReady')
    }
    this.trace('elementReady', {
      sourceKind: this.sourceKind(),
      sourceDelivery: this.currentSourceDelivery(),
      hasStreamId: Boolean(this.sourceStreamId()),
      ...(video ? this.videoTelemetryPayload(video) : {}),
    })
    this.clearLoadabilityTimer()
  }

  handleVideoElementError(video?: HTMLVideoElement) {
    const mediaErrorCode = video?.error?.code ?? null
    this.trace('elementError', {
      mediaErrorCode,
      sourceKind: this.sourceKind(),
      sourceDelivery: this.currentSourceDelivery(),
      hasStreamId: Boolean(this.sourceStreamId()),
      ...(video ? this.videoTelemetryPayload(video) : {}),
    })

    // Decode / unsupported-source errors are file-scoped: they must fail only
    // this file with the typed unsupported state and never quarantine the
    // native media stream stack for the runtime session. Only network-class
    // errors (or errors without a code) go through the loadability path.
    if (mediaErrorCode === MEDIA_ERR_DECODE || mediaErrorCode === MEDIA_ERR_SRC_NOT_SUPPORTED) {
      this.failCurrentSourceUnsupported()
      return
    }

    const streamId = this.sourceStreamId()
    if ((this.sourceKind() === 'media-stream' || this.sourceKind() === 'video-source') && streamId) {
      this.handleNativeStreamLoadabilityFailure(streamId, 'element-error')
      return
    }

    this.failCurrentSource()
    this.releaseCurrentSource()
  }

  handleVideoPlaybackEvent(eventName: string, video: HTMLVideoElement): void {
    this.startPlaybackTelemetry(video)
    this.ensureMseBufferedNearPlayback(video)
    this.maybeStartStartupPlayback(video, eventName)

    if (eventName === 'playing' && !this.firstFrameReported) {
      this.firstFrameReported = true
      this.startupPlayRequested = true
      this.trace('firstFrame', {
        sourceKind: this.sourceKind(),
        sourceDelivery: this.currentSourceDelivery(),
        ...this.videoTelemetryPayload(video),
      })
    }

    const now = Date.now()
    // play/pause state traces are exempt from throttling so rapid toggles are
    // not lost; progress/timeupdate stay coarse.
    const throttleMs =
      eventName === 'timeupdate' || eventName === 'progress'
        ? 1000
        : eventName === 'playing' || eventName === 'pause'
          ? 0
          : 250
    if (throttleMs > 0) {
      const lastAt = this.telemetryEventLastAt.get(eventName) ?? 0
      if (now - lastAt < throttleMs) return
      this.telemetryEventLastAt.set(eventName, now)
    }

    this.trace('playbackEvent', {
      eventName,
      sourceKind: this.sourceKind(),
      sourceDelivery: this.currentSourceDelivery(),
      ...this.videoTelemetryPayload(video),
    })
  }

  handleNativeStreamError(event: MediaStreamErrorEvent): void {
    if (!event.streamId || event.streamId !== this.sourceStreamId()) return

    if (event.code === 'ERR_MEDIA_RANGE_REQUIRED') {
      this.handleNativeStreamLoadabilityFailure(event.streamId, 'range-required')
      return
    }

    this.failCurrentSource(sourceFailureReason(videoSourceStateFromMediaStreamErrorCode(event.code)))
  }

  handleNativeStreamLoadabilityFailure(
    streamId: string,
    reason: NativeStreamFailureReason = 'range-required',
  ): void {
    if (!streamId || streamId !== this.sourceStreamId()) return
    this.trace('streamLoadabilityFailure', {
      reason,
      sourceKind: this.sourceKind(),
      remoteCoreMode: runtimeModeModel.remoteCoreMode(),
      hasStreamId: true,
    })

    if (runtimeModeModel.remoteCoreMode()) {
      if (reason === 'loadability-timeout') return
      this.failCurrentSource()
      return
    }

    if (this.sourceKind() === 'video-source' && reason === 'loadability-timeout') {
      this.trace('sourceStarved', {
        reason,
        sourceKind: this.sourceKind(),
        sourceDelivery: this.sourceDelivery(),
        hasStreamId: true,
      })
      this.failCurrentSource('source-starved')
      return
    }

    runtimeModeModel.disableNativeMediaStreamForRuntimeSession()
    void this.reloadVideoAfterNativeFallback()
  }

  releaseNativeStreamForLifecycle(
    _reason: MediaStreamLifecycleReleaseReason,
    context: MediaStreamLifecycleReleaseContext = {},
  ): void {
    if (context.nodeId !== undefined && context.nodeId !== this.fileId) return
    if (
      this.sourceKind() !== 'media-stream' &&
      this.sourceKind() !== 'video-source'
    ) {
      return
    }

    this.failCurrentSource()
  }

  private async reloadVideoAfterNativeFallback() {
    await this.loadVideo()
  }

  private failCurrentSource(reason: VideoSourceFailureReason = 'playback-backend-failure') {
    this.invalidateCurrentLoad()
    this.loading.set(false)
    this.fallbackLimited.set(false)
    this.sourceState.set(failedVideoSourceState(reason))
    this.errorMessage.set(i18n('media:video-load-failed' as any))
  }

  private failCurrentSourceUnsupported(reason: VideoSourceFailureReason = 'unsupported-codec') {
    this.invalidateCurrentLoad()
    this.loading.set(false)
    this.fallbackLimited.set(false)
    this.sourceState.set({state: 'unsupported', reason})
    this.errorMessage.set(i18n('media:video-load-failed' as any))
  }

  /**
   * SPEC-231 model-driven startup: calls video.play() exactly once per load
   * session when either the buffered-ahead window reaches the startup budget or
   * the element reported readiness for a file that is (nearly) fully buffered.
   * `canplaythrough` remains telemetry-only.
   */
  private maybeStartStartupPlayback(video: HTMLVideoElement, eventName: string) {
    if (this.startupPlayRequested) return
    if (this.sourceKind() === 'none') return
    if (this.sourceDelivery() === 'native-video') return
    if (!video.paused) {
      this.startupPlayRequested = true
      return
    }

    if (eventName === 'canplay' || video.readyState >= HAVE_FUTURE_DATA) {
      this.startupCanPlayObserved = true
    }

    const bufferedRanges = this.serializeBufferedRanges(video)
    const bufferedAheadMs = this.bufferedAheadMs(video, bufferedRanges) ?? 0
    const bufferedAheadSeconds = bufferedAheadMs / 1000
    const durationSeconds = Number.isFinite(video.duration) ? video.duration : null
    const remainingSeconds =
      durationSeconds !== null ? Math.max(0, durationSeconds - video.currentTime) : null
    const fullyBuffered = remainingSeconds !== null && bufferedAheadSeconds >= remainingSeconds - 0.1
    const shortFile = durationSeconds !== null && durationSeconds <= this.startupBufferSeconds
    const startupBudgetReached = bufferedAheadSeconds >= this.startupBufferSeconds
    const readyAndFullyBuffered = this.startupCanPlayObserved && (fullyBuffered || shortFile)
    if (!startupBudgetReached && !readyAndFullyBuffered) return

    this.startupPlayRequested = true
    const sessionId = this.loadSessionId
    this.trace('startupPlayRequested', {
      eventName,
      bufferedAheadMs,
      startupBufferSeconds: this.startupBufferSeconds,
      readyState: video.readyState,
      startupBudgetReached,
      readyAndFullyBuffered,
    })

    let playResult: Promise<void> | undefined
    try {
      playResult = video.play() ?? undefined
    } catch (error) {
      this.handleStartupPlayRejection(sessionId, error)
      return
    }
    if (playResult && typeof playResult.catch === 'function') {
      playResult.catch(
        wrap((error: unknown) => {
          this.handleStartupPlayRejection(sessionId, error)
        }),
      )
    }
  }

  private handleStartupPlayRejection(sessionId: number, error: unknown) {
    if (!this.isCurrentSession(sessionId)) return
    // Autoplay-policy rejections are not load errors: the player stays in the
    // regular paused UI state and the user can start playback manually.
    this.trace('startupPlayRejected', formatVideoDebugError(error))
  }

  private attachSource(source: FileSourceLoadResult) {
    this.releaseCurrentSource()
    this.fallbackLimited.set(false)
    this.currentSource = source
    const streamId =
      source.kind === 'media-stream' || source.kind === 'video-source'
        ? source.streamId ?? null
        : null
    const nativeVideoToken = this.nativeVideoToken(source)
    // Native media-stream errors are dispatched by event.streamId, so every
    // non-native delivery must register under streamId (native-video events are
    // dispatched by nativeSourceToken). Mirrors video-preview.model.ts.
    const ownerId =
      source.kind === 'media-stream' || source.kind === 'video-source'
        ? source.delivery === 'native-video'
          ? nativeVideoToken
          : streamId
        : null

    const sourceKind: VideoPlayerSourceKind =
      source.kind === 'video-source'
        ? 'video-source'
        : source.kind === 'media-stream'
          ? 'media-stream'
          : 'blob'
    const sourceDelivery: VideoPlayerSourceDelivery =
      source.kind === 'media-stream' || source.kind === 'video-source'
        ? source.delivery ?? 'custom-scheme'
        : null
    this.sourceKind.set(sourceKind)
    this.sourceDelivery.set(sourceDelivery)
    this.sourceStreamId.set(streamId)
    this.sourceState.set(readyVideoSourceState({
      sourceKind,
      delivery: sourceDelivery,
      provider: source.provider ?? null,
    }))

    if (ownerId) {
      this.unregisterStreamOwner = registerMediaStreamOwner(ownerId, this)
    }

    if (
      (source.kind === 'media-stream' || source.kind === 'video-source') &&
      streamId &&
      sourceDelivery !== 'native-video' &&
      sourceDelivery !== 'mse'
    ) {
      this.startLoadabilityTimer(streamId)
    }

    if (sourceDelivery === 'mse' && source.mse) {
      this.startupBufferSeconds = source.mse.startupBufferSeconds
      const controller = new MseVideoSourceController(source.mse)
      this.mseController = controller
      const sessionId = this.loadSessionId
      void controller.start().catch(wrap((error) => {
        this.handleMseControllerError(controller, sessionId, error)
      }))
      this.videoUrl.set(controller.url)
      return
    }

    this.videoUrl.set(sourceDelivery === 'native-video' ? null : source.url)
  }

  private startLoadabilityTimer(streamId: string) {
    this.clearLoadabilityTimer()
    this.loadabilityTimer = setTimeout(wrap(() => {
      this.loadabilityTimer = null
      this.handleNativeStreamLoadabilityFailure(streamId, 'loadability-timeout')
    }), getMediaStreamLoadabilityTimeoutMs())
  }

  private beginLoadAttempt(): number {
    this.invalidateCurrentLoad()
    return this.loadSessionId
  }

  private invalidateCurrentLoad() {
    this.loadSessionId += 1
    this.startupPlayRequested = false
    this.startupCanPlayObserved = false
    this.startupBufferSeconds = VIDEO_STARTUP_BUFFER_SECONDS
    this.firstFrameReported = false
    this.clearLoadabilityTimer()
    this.stopPlaybackTelemetry()
    this.releaseCurrentSource()
    this.videoUrl.set(null)
    this.sourceKind.set('none')
    this.sourceDelivery.set(null)
    this.sourceStreamId.set(null)
    this.sourceState.set(idleVideoSourceState())

    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
  }

  private clearLoadabilityTimer() {
    if (!this.loadabilityTimer) {
      return
    }

    clearTimeout(this.loadabilityTimer)
    this.loadabilityTimer = null
  }

  private startPlaybackTelemetry(video: HTMLVideoElement) {
    if (this.telemetryElement === video && this.telemetryTimer) {
      return
    }

    this.stopPlaybackTelemetry()
    this.telemetryElement = video
    const sessionId = this.loadSessionId
    this.samplePlaybackTelemetry(video, 'start')
    this.telemetryTimer = setInterval(wrap(() => {
      if (!this.isCurrentSession(sessionId) || this.telemetryElement !== video) {
        this.stopPlaybackTelemetry()
        return
      }
      this.samplePlaybackTelemetry(video, 'sample')
    }), 1000)
  }

  private stopPlaybackTelemetry() {
    if (this.telemetryTimer) {
      clearInterval(this.telemetryTimer)
      this.telemetryTimer = null
    }
    this.telemetryElement = null
    this.telemetryEventLastAt.clear()
    this.lastDroppedVideoFrames = 0
  }

  private samplePlaybackTelemetry(video: HTMLVideoElement, sampleReason: string) {
    const payload = this.videoTelemetryPayload(video)
    // dropped_frames is emitted on a positive delta between samples, not on
    // every sample once the cumulative count is > 0.
    const droppedVideoFrames = payload['droppedVideoFrames']
    const droppedVideoFramesDelta =
      typeof droppedVideoFrames === 'number'
        ? Math.max(0, droppedVideoFrames - this.lastDroppedVideoFrames)
        : null
    if (typeof droppedVideoFrames === 'number') {
      this.lastDroppedVideoFrames = droppedVideoFrames
    }
    this.trace('playbackTelemetry', {
      sampleReason,
      sourceKind: this.sourceKind(),
      sourceDelivery: this.currentSourceDelivery(),
      droppedVideoFramesDelta,
      ...payload,
    })
  }

  private videoTelemetryPayload(video: HTMLVideoElement): Record<string, unknown> {
    const playbackQuality =
      typeof video.getVideoPlaybackQuality === 'function'
        ? (video.getVideoPlaybackQuality() as VideoPlaybackQualityLike)
        : null
    const bufferedRanges = this.serializeBufferedRanges(video)
    return {
      currentTimeMs: Number.isFinite(video.currentTime) ? Math.round(video.currentTime * 1000) : null,
      durationMs: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : null,
      readyState: video.readyState,
      networkState: video.networkState,
      paused: video.paused,
      bufferedAheadMs: this.bufferedAheadMs(video, bufferedRanges),
      bufferedRanges,
      droppedVideoFrames: playbackQuality?.droppedVideoFrames ?? null,
      totalVideoFrames: playbackQuality?.totalVideoFrames ?? null,
      corruptedVideoFrames: playbackQuality?.corruptedVideoFrames ?? null,
    }
  }

  private serializeBufferedRanges(video: HTMLVideoElement): Array<{startMs: number; endMs: number}> {
    const ranges: Array<{startMs: number; endMs: number}> = []
    const buffered = video.buffered
    for (let index = 0; index < buffered.length; index += 1) {
      try {
        ranges.push({
          startMs: Math.round(buffered.start(index) * 1000),
          endMs: Math.round(buffered.end(index) * 1000),
        })
      } catch {
        break
      }
    }
    return ranges
  }

  private bufferedAheadMs(
    video: HTMLVideoElement,
    bufferedRanges: Array<{startMs: number; endMs: number}>,
  ): number | null {
    if (!Number.isFinite(video.currentTime)) return null
    const currentMs = Math.round(video.currentTime * 1000)
    const range = bufferedRanges.find((candidate) => candidate.startMs <= currentMs && candidate.endMs >= currentMs)
    return range ? Math.max(0, range.endMs - currentMs) : 0
  }

  private isCurrentSession(sessionId: number): boolean {
    return sessionId === this.loadSessionId
  }

  private releaseCurrentSource() {
    this.releaseMseController()
    this.unregisterStreamOwner?.()
    this.unregisterStreamOwner = undefined

    const source = this.currentSource
    if (!source) {
      return
    }

    this.currentSource = null
    this.trace('sourceReleased', this.sourceDebugMeta(source))
    this.releaseSource(source)
  }

  private releaseMseController() {
    this.pendingMsePlaybackPositionSeconds = null
    this.mseBufferingPlaybackPosition = false
    this.mseController?.release()
    this.mseController = null
  }

  private ensureMseBufferedNearPlayback(video: HTMLVideoElement) {
    const controller = this.mseController
    if (!controller || this.sourceDelivery() !== 'mse') return
    if (!Number.isFinite(video.currentTime) || video.currentTime < 0) return

    this.pendingMsePlaybackPositionSeconds = video.currentTime
    if (this.mseBufferingPlaybackPosition) return

    this.mseBufferingPlaybackPosition = true
    const sessionId = this.loadSessionId
    void this.flushMsePlaybackBuffer(controller, sessionId)
  }

  private async flushMsePlaybackBuffer(
    controller: MseVideoSourceController,
    sessionId: number,
  ) {
    try {
      while (
        this.pendingMsePlaybackPositionSeconds !== null &&
        this.isCurrentSession(sessionId) &&
        this.mseController === controller
      ) {
        const currentTimeSeconds = this.pendingMsePlaybackPositionSeconds
        this.pendingMsePlaybackPositionSeconds = null
        await controller.ensureBufferedForPlaybackPosition(currentTimeSeconds)
      }
    } catch (error) {
      this.handleMseControllerError(controller, sessionId, error)
    } finally {
      if (this.mseController === controller) {
        this.mseBufferingPlaybackPosition = false
      }
    }
  }

  private handleMseControllerError(
    controller: MseVideoSourceController,
    sessionId: number,
    error: unknown,
  ) {
    if (!this.isCurrentSession(sessionId) || this.mseController !== controller) return
    if (isMseVideoSourceAbortError(error)) return
    this.failCurrentSource(sourceFailureReason(videoSourceStateFromLoadError(error)))
  }

  private releaseSource(source: FileSourceLoadResult) {
    try {
      void Promise.resolve(source.release()).catch((error) => {
        console.warn('Failed to release video player source:', error)
      })
    } catch (error) {
      console.warn('Failed to release video player source:', error)
    }
  }

  private trace(event: string, meta: Record<string, unknown> = {}) {
    const payload = {
      fileId: this.fileId || null,
      mimeType: this.mimeType,
      mediaInfoKind: this.mediaInfo?.kind ?? null,
      sourceSize: this.sourceSize,
      ...meta,
    }
    writeAndroidUnlockDebug('media-playback/video', event, payload)
    for (const telemetryEvent of stableTelemetryEventsForVideoTrace(event, payload)) {
      emitMediaTelemetry(telemetryEvent, payload)
    }
    console.info(
      '[media-playback][video]',
      formatVideoDebugPayload({
        event,
        ...payload,
      }),
    )
  }

  private sourceDebugMeta(source: FileSourceLoadResult): Record<string, unknown> {
    return {
      sourceKind: source.kind,
      size: source.size,
      mimeType: source.mimeType,
      sourceRevision: source.sourceRevision ?? null,
      sourceDelivery:
        source.kind === 'media-stream' || source.kind === 'video-source'
          ? source.delivery ?? 'custom-scheme'
          : null,
      hasStreamId: Boolean(source.streamId),
      hasToken: Boolean(source.token || source.sourceToken || source.nativeSourceToken),
      provider: source.provider ?? null,
      mediaSourceGeneration: source.mediaSourceGeneration ?? null,
      transportSessionGeneration: source.transportSessionGeneration ?? null,
    }
  }

  private currentSourceDelivery(): string | null {
    return this.sourceDelivery()
  }

  private nativeVideoToken(source: FileSourceLoadResult): string | null {
    if (source.kind === 'video-source' && source.delivery === 'native-video') {
      return source.nativeSourceToken ?? source.sourceToken ?? null
    }
    return null
  }

}

function sourceFailureReason(state: VideoSourceState): VideoSourceFailureReason {
  return 'reason' in state ? state.reason : 'playback-backend-failure'
}

function stableTelemetryEventsForVideoTrace(
  event: string,
  payload: Record<string, unknown>,
): MediaTelemetryEventName[] {
  switch (event) {
    case 'loadRequested':
      return ['media.source.prepare.start']
    case 'sourceResolved':
      return ['media.source.prepare.ready', 'media.delivery.selected']
    case 'loadFailed':
      return ['media.source.prepare.error']
    case 'sourceStarved':
      return ['media.source.starved']
    case 'elementReady':
      return ['media.playback.metadata']
    case 'firstFrame':
      return ['media.playback.first_frame']
    case 'elementError':
      return ['media.playback.error']
    case 'playbackEvent':
      return playbackEventTelemetry(payload['eventName'])
    case 'playbackTelemetry':
      return droppedFrameTelemetry(payload)
    case 'sourceReleased':
      return ['media.source.release', 'media.playback.release']
    default:
      return []
  }
}

function playbackEventTelemetry(eventName: unknown): MediaTelemetryEventName[] {
  if (eventName === 'playing') {
    return ['media.playback.playing']
  }
  if (eventName === 'pause') {
    return ['media.playback.paused']
  }
  // `canplay` marks the END of buffering; it must not be counted as a
  // buffering event. Readiness milestones are covered by metadata/first_frame.
  if (eventName === 'waiting') {
    return ['media.playback.buffering']
  }
  if (eventName === 'stalled') {
    return ['media.playback.stall']
  }
  return []
}


function droppedFrameTelemetry(payload: Record<string, unknown>): MediaTelemetryEventName[] {
  const droppedVideoFramesDelta = payload['droppedVideoFramesDelta']
  return typeof droppedVideoFramesDelta === 'number' && droppedVideoFramesDelta > 0
    ? ['media.playback.dropped_frames']
    : []
}
