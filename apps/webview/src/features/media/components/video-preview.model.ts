import {i18n} from 'root/i18n'
import {atom, wrap} from '@reatom/core'
import {
  isMockTransport,
  isMediaBlobFallbackLimitError,
  loadFileSourceById,
  type FileSourceLoadResult,
} from './file-loader'
import {isPlayableVideoMediaFile} from 'root/utils/file-format-registry'
import type {FileMediaInfo} from 'root/core/catalog/media-info'
import {runtimeModeModel} from 'root/core/runtime/runtime-mode.model'
import type {AndroidVideoPlayerEvent, MediaStreamErrorEvent} from 'root/core/transport/transport'
import {getMediaStreamLoadabilityTimeoutMs} from 'root/features/media/models/media-stream-loadability'
import {
  registerInFlightMediaStreamLoad,
  registerMediaStreamOwner,
  type AndroidVideoSourceIdentity,
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
  consumeHandedOffVideoSourceRelease,
  isHandoffSafeVideoSource,
  offerVideoSourceHandoff,
  revokeVideoSourceHandoff,
} from 'root/features/media/models/video-source-handoff'
import {
  failedVideoSourceState,
  idleVideoSourceState,
  loadingVideoSourceState,
  readyVideoSourceState,
  videoSourceStateFromLoadError,
  videoSourceStateFromNativeErrorCode,
  type VideoSourceFailureReason,
  type VideoSourceState,
} from 'root/features/media/models/video-source-state'

export type LoadingState = 'idle' | 'loading' | 'loaded' | 'fallback-limited' | 'error'
export type VideoSourceKind = 'none' | 'blob' | 'video-source' | 'media-stream'
export type VideoSourceDelivery =
  | 'custom-scheme'
  | 'loopback-http'
  | 'mse'
  | 'native-video'
  | null
type NativeStreamFailureReason = 'element-error' | 'loadability-timeout' | 'range-required'

const MEDIA_ERR_DECODE = 3
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4

export type VideoPreviewSourceMetadata = {
  mimeType?: string | null
  mediaInfo?: FileMediaInfo | null
  lastModified?: number
  sourceSize?: number | null
}

export class VideoPreviewModel implements MediaStreamOwner {
  readonly loadingState = atom<LoadingState>('idle', 'videoPreview.loadingState')
  readonly videoUrl = atom<string | null>(null, 'videoPreview.videoUrl')
  readonly errorMessage = atom('', 'videoPreview.errorMessage')
  readonly playable = atom(false, 'videoPreview.playable')
  readonly sourceKind = atom<VideoSourceKind>('none', 'videoPreview.sourceKind')
  readonly sourceDelivery = atom<VideoSourceDelivery>(null, 'videoPreview.sourceDelivery')
  readonly sourceStreamId = atom<string | null>(null, 'videoPreview.sourceStreamId')
  readonly sourceState = atom<VideoSourceState>(idleVideoSourceState(), 'videoPreview.sourceState')

  private abortController: AbortController | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private loadabilityTimer: ReturnType<typeof setTimeout> | null = null
  private currentSource: FileSourceLoadResult | null = null
  private mseController: MseVideoSourceController | null = null
  private pendingMsePlaybackPositionSeconds: number | null = null
  private mseBufferingPlaybackPosition = false
  private unregisterStreamOwner: (() => void) | undefined
  private loadSessionId = 0
  private retryCount = 0
  private readonly maxRetries = 2

  private fileId = 0
  private fileName = ''
  private mimeType: string | null = null
  private mediaInfo: FileMediaInfo | null = null
  private lastModified: number | undefined
  private sourceSize: number | null = null

  setFile(fileId: number, fileName: string, metadata: VideoPreviewSourceMetadata = {}) {
    const mimeType = metadata.mimeType ?? null
    const mediaInfo = metadata.mediaInfo ?? null
    const lastModified = metadata.lastModified
    const sourceSize = metadata.sourceSize ?? null
    // Structural mediaInfo comparison: catalog refreshes rebuild node objects,
    // and an identity check here would restart playback for unchanged content.
    if (
      this.fileId === fileId &&
      this.fileName === fileName &&
      this.mimeType === mimeType &&
      areFileMediaInfosEquivalent(this.mediaInfo, mediaInfo) &&
      this.lastModified === lastModified &&
      this.sourceSize === sourceSize
    ) {
      return
    }
    this.cleanup()
    this.fileId = fileId
    this.fileName = fileName
    this.mimeType = mimeType
    this.mediaInfo = mediaInfo
    this.lastModified = lastModified
    this.sourceSize = sourceSize
    this.playable.set(isPlayableVideoMediaFile({name: fileName, mimeType, mediaInfo}))

    if (this.playable()) {
      void this.loadVideo()
    } else {
      this.loadingState.set('error')
      this.sourceState.set({state: 'unsupported', reason: 'unsupported-container'})
      this.errorMessage.set(i18n('media:video-format-unsupported' as any))
    }
  }

  cleanup() {
    this.invalidateCurrentLoad({resetRetryCount: true})
    this.fileId = 0
    this.fileName = ''
    this.mimeType = null
    this.mediaInfo = null
    this.lastModified = undefined
    this.sourceSize = null
    this.videoUrl.set(null)
    this.sourceKind.set('none')
    this.sourceDelivery.set(null)
    this.sourceStreamId.set(null)
    this.sourceState.set(idleVideoSourceState())
    this.loadingState.set('idle')
    this.errorMessage.set('')
    this.playable.set(false)
  }

  async loadVideo() {
    const sessionId = this.beginLoadAttempt({resetRetryCount: true})
    await this.loadVideoForSession(sessionId)
  }

  setError(message: string) {
    this.invalidateCurrentLoad({resetRetryCount: false})
    this.loadingState.set('error')
    this.errorMessage.set(message)
  }

  retry() {
    if (!this.playable()) {
      return
    }

    void this.loadVideo()
  }

  handleVideoElementReady(video?: HTMLVideoElement) {
    this.clearLoadabilityTimer()
    if (video) {
      this.ensureMseBufferedNearPlayback(video)
    }
  }

  handleVideoElementError(video?: HTMLVideoElement) {
    // Decode / unsupported-source errors are file-scoped: fail only this file
    // with the typed unsupported state and never quarantine the native media
    // stream stack for the runtime session. Only network-class errors (or
    // errors without a code) go through the loadability path.
    const mediaErrorCode = video?.error?.code ?? null
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

  handleNativeStreamError(event: MediaStreamErrorEvent): void {
    if (!event.streamId || event.streamId !== this.sourceStreamId()) return

    if (event.code === 'ERR_MEDIA_RANGE_REQUIRED') {
      this.handleNativeStreamLoadabilityFailure(event.streamId, 'range-required')
      return
    }

    this.failCurrentSource()
  }

  handleAndroidVideoPlayerEvent(event: AndroidVideoPlayerEvent): void {
    const source = this.currentSource
    const eventToken = event.nativeSourceToken ?? event.token
    if (!source || this.nativeVideoToken(source) !== eventToken) return

    if (event.event === 'error') {
      this.failCurrentSource(sourceFailureReason(videoSourceStateFromNativeErrorCode(event.error)))
      return
    }

    if (event.event === 'released') {
      this.invalidateCurrentLoad({resetRetryCount: false})
    }
  }

  handleVideoPlaybackEvent(video: HTMLVideoElement): void {
    this.ensureMseBufferedNearPlayback(video)
  }

  handleNativeStreamLoadabilityFailure(
    streamId: string,
    reason: NativeStreamFailureReason = 'range-required',
  ): void {
    if (!streamId || streamId !== this.sourceStreamId()) return

    if (runtimeModeModel.remoteCoreMode()) {
      if (reason === 'loadability-timeout') return
      this.failCurrentSource()
      return
    }

    if (this.sourceKind() === 'video-source' && reason === 'loadability-timeout') {
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

  private async loadVideoForSession(sessionId: number) {
    if (!this.fileId) {
      return
    }

    if (isMockTransport()) {
      if (!this.isCurrentSession(sessionId)) {
        return
      }
      this.loadingState.set('error')
      this.errorMessage.set(i18n('media:preview-desktop-only' as any))
      return
    }

    this.loadingState.set('loading')
    this.sourceState.set(loadingVideoSourceState())
    this.errorMessage.set('')
    const controller = new AbortController()
    this.abortController = controller
    // Lifecycle releases (vault lock, background, transport loss) must be able
    // to cancel a prepare that is still in flight, before an owner exists.
    const unregisterInFlightLoad = registerInFlightMediaStreamLoad(controller, {
      owner: this,
      nodeId: this.fileId,
    })
    const fileId = this.fileId
    const fileName = this.fileName

    try {
      const source = await wrap(
        loadFileSourceById(fileId, fileName, {
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

      this.attachSource(source)
      this.loadingState.set('loaded')
      this.retryCount = 0
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }

      if (!this.isCurrentSession(sessionId)) {
        return
      }

      console.error('Failed to load video:', error)

      if (isMediaBlobFallbackLimitError(error)) {
        this.loadingState.set('fallback-limited')
        this.sourceState.set(videoSourceStateFromLoadError(error))
        this.errorMessage.set(i18n('media:fallback-limited-title' as any))
        return
      }

      const errorMsg = error instanceof Error ? error.message : String(error)
      if (errorMsg.includes('File bytes not found')) {
        this.loadingState.set('error')
        this.sourceState.set({state: 'failed', reason: 'provider-unavailable'})
        this.errorMessage.set(i18n('media:preview-desktop-only' as any))
        return
      }

      if (this.retryCount < this.maxRetries) {
        this.scheduleRetry(sessionId)
        return
      }

      this.loadingState.set('error')
      this.sourceState.set(videoSourceStateFromLoadError(error))
      this.errorMessage.set(i18n('media:video-load-failed' as any))
    } finally {
      unregisterInFlightLoad()
      if (this.abortController === controller) {
        this.abortController = null
      }
    }
  }

  private async reloadVideoAfterNativeFallback() {
    const sessionId = this.beginLoadAttempt({resetRetryCount: false})
    await this.loadVideoForSession(sessionId)
  }

  private failCurrentSource(reason: VideoSourceFailureReason = 'playback-backend-failure') {
    this.invalidateCurrentLoad({resetRetryCount: false})
    this.loadingState.set('error')
    this.sourceState.set(failedVideoSourceState(reason))
    this.errorMessage.set(i18n('media:video-load-failed' as any))
  }

  private failCurrentSourceUnsupported(reason: VideoSourceFailureReason = 'unsupported-codec') {
    this.invalidateCurrentLoad({resetRetryCount: false})
    this.loadingState.set('error')
    this.sourceState.set({state: 'unsupported', reason})
    this.errorMessage.set(i18n('media:video-load-failed' as any))
  }

  private attachSource(source: FileSourceLoadResult) {
    this.releaseCurrentSource()
    this.currentSource = source
    const streamId =
      source.kind === 'media-stream' || source.kind === 'video-source'
        ? source.streamId ?? null
        : null
    const nativeVideoToken = this.nativeVideoToken(source)
    const ownerId =
      source.kind === 'media-stream'
        ? streamId
        : source.kind === 'video-source'
          ? source.delivery === 'native-video'
            ? nativeVideoToken
            : streamId
          : null
    const sourceKind: VideoSourceKind =
      source.kind === 'video-source'
        ? 'video-source'
        : source.kind === 'media-stream'
          ? 'media-stream'
          : 'blob'
    const sourceDelivery: VideoSourceDelivery =
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
      this.unregisterStreamOwner = registerMediaStreamOwner(
        ownerId,
        this,
        this.androidVideoSourceIdentity(source),
      )
    }

    if (isHandoffSafeVideoSource(source)) {
      // Let the full player take over this prepared source for the same node
      // instead of preparing a second one on its open critical path.
      offerVideoSourceHandoff({nodeId: this.fileId, lastModified: this.lastModified}, source)
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

  private scheduleRetry(sessionId: number) {
    this.retryCount++
    const delay = 1000 * this.retryCount
    this.clearRetryTimer()
    this.retryTimer = setTimeout(wrap(() => {
      this.retryTimer = null
      if (!this.isCurrentSession(sessionId)) {
        return
      }

      const nextSessionId = this.beginLoadAttempt({resetRetryCount: false})
      void this.loadVideoForSession(nextSessionId)
    }), delay)
  }

  private beginLoadAttempt(options: {resetRetryCount: boolean}): number {
    this.invalidateCurrentLoad(options)
    return this.loadSessionId
  }

  private invalidateCurrentLoad(options: {resetRetryCount: boolean}) {
    this.loadSessionId += 1
    this.clearRetryTimer()
    this.clearLoadabilityTimer()
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
    if (options.resetRetryCount) {
      this.retryCount = 0
    }
  }

  private clearRetryTimer() {
    if (!this.retryTimer) {
      return
    }

    clearTimeout(this.retryTimer)
    this.retryTimer = null
  }

  private clearLoadabilityTimer() {
    if (!this.loadabilityTimer) {
      return
    }

    clearTimeout(this.loadabilityTimer)
    this.loadabilityTimer = null
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
    if (consumeHandedOffVideoSourceRelease(source)) {
      // The full player claimed this source; release responsibility moved with
      // it, so releasing here would tear the stream down under the new owner.
      return
    }
    revokeVideoSourceHandoff(source)
    try {
      void Promise.resolve(source.release()).catch((error) => {
        console.warn('Failed to release video preview source:', error)
      })
    } catch (error) {
      console.warn('Failed to release video preview source:', error)
    }
  }

  private nativeVideoToken(source: FileSourceLoadResult): string | null {
    if (source.kind === 'video-source' && source.delivery === 'native-video') {
      return source.nativeSourceToken ?? source.sourceToken ?? null
    }
    return null
  }

  private androidVideoSourceIdentity(source: FileSourceLoadResult): AndroidVideoSourceIdentity | undefined {
    if (
      source.kind !== 'video-source' ||
      source.delivery !== 'native-video' ||
      source.mediaSourceGeneration == null ||
      source.sourceRevision == null
    ) {
      return undefined
    }
    return {
      mediaSourceGeneration: source.mediaSourceGeneration,
      sourceRevision: source.sourceRevision,
      transportSessionGeneration: source.transportSessionGeneration,
      appForegroundEpoch: source.appForegroundEpoch,
    }
  }
}

function sourceFailureReason(state: VideoSourceState): VideoSourceFailureReason {
  return 'reason' in state ? state.reason : 'playback-backend-failure'
}
