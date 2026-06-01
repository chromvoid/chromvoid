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
import type {MediaStreamErrorEvent} from 'root/core/transport/transport'
import {MEDIA_STREAM_LOADABILITY_TIMEOUT_MS} from 'root/features/media/models/media-stream-loadability'
import {
  registerMediaStreamOwner,
  type MediaStreamLifecycleReleaseContext,
  type MediaStreamLifecycleReleaseReason,
  type MediaStreamOwner,
} from 'root/features/media/models/media-stream-owner-registry'

export type LoadingState = 'idle' | 'loading' | 'loaded' | 'fallback-limited' | 'error'
export type VideoSourceKind = 'none' | 'blob' | 'media-stream' | 'android-native-video'

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
  readonly sourceStreamId = atom<string | null>(null, 'videoPreview.sourceStreamId')

  private abortController: AbortController | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private loadabilityTimer: ReturnType<typeof setTimeout> | null = null
  private currentSource: FileSourceLoadResult | null = null
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
    if (
      this.fileId === fileId &&
      this.fileName === fileName &&
      this.mimeType === mimeType &&
      this.mediaInfo === mediaInfo &&
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
    this.sourceStreamId.set(null)
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

  handleVideoElementReady() {
    this.clearLoadabilityTimer()
  }

  handleVideoElementError() {
    const streamId = this.sourceStreamId()
    if (this.sourceKind() === 'media-stream' && streamId) {
      this.handleNativeStreamLoadabilityFailure(streamId)
      return
    }

    this.failCurrentSource()
  }

  handleNativeStreamError(event: MediaStreamErrorEvent): void {
    if (!event.streamId || event.streamId !== this.sourceStreamId()) return

    if (event.code === 'ERR_MEDIA_RANGE_REQUIRED') {
      this.handleNativeStreamLoadabilityFailure(event.streamId)
      return
    }

    this.failCurrentSource()
  }

  handleNativeStreamLoadabilityFailure(streamId: string): void {
    if (!streamId || streamId !== this.sourceStreamId()) return

    runtimeModeModel.disableNativeMediaStreamForRuntimeSession()
    void this.reloadVideoAfterNativeFallback()
  }

  releaseNativeStreamForLifecycle(
    _reason: MediaStreamLifecycleReleaseReason,
    context: MediaStreamLifecycleReleaseContext = {},
  ): void {
    if (context.nodeId !== undefined && context.nodeId !== this.fileId) return
    if (this.sourceKind() !== 'media-stream') return

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
    this.errorMessage.set('')
    const controller = new AbortController()
    this.abortController = controller
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

      if (!this.isCurrentSession(sessionId)) {
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
        this.errorMessage.set(i18n('media:fallback-limited-title' as any))
        return
      }

      const errorMsg = error instanceof Error ? error.message : String(error)
      if (errorMsg.includes('File bytes not found')) {
        this.loadingState.set('error')
        this.errorMessage.set(i18n('media:preview-desktop-only' as any))
        return
      }

      if (this.retryCount < this.maxRetries) {
        this.scheduleRetry(sessionId)
        return
      }

      this.loadingState.set('error')
      this.errorMessage.set(i18n('media:video-load-failed' as any))
    } finally {
      if (this.abortController === controller) {
        this.abortController = null
      }
    }
  }

  private async reloadVideoAfterNativeFallback() {
    const sessionId = this.beginLoadAttempt({resetRetryCount: false})
    await this.loadVideoForSession(sessionId)
  }

  private failCurrentSource() {
    this.invalidateCurrentLoad({resetRetryCount: false})
    this.loadingState.set('error')
    this.errorMessage.set(i18n('media:video-load-failed' as any))
  }

  private attachSource(source: FileSourceLoadResult) {
    this.releaseCurrentSource()
    this.currentSource = source
    const streamId = source.kind === 'media-stream' ? source.streamId ?? null : null

    this.sourceKind.set(
      source.kind === 'media-stream'
        ? 'media-stream'
        : source.kind === 'android-native-video'
          ? 'android-native-video'
          : 'blob',
    )
    this.sourceStreamId.set(streamId)

    if (source.kind === 'media-stream' && streamId) {
      this.unregisterStreamOwner = registerMediaStreamOwner(streamId, this)
      this.startLoadabilityTimer(streamId)
    }

    this.videoUrl.set(source.kind === 'android-native-video' ? null : source.url)
  }

  private startLoadabilityTimer(streamId: string) {
    this.clearLoadabilityTimer()
    this.loadabilityTimer = setTimeout(() => {
      this.loadabilityTimer = null
      this.handleNativeStreamLoadabilityFailure(streamId)
    }, MEDIA_STREAM_LOADABILITY_TIMEOUT_MS)
  }

  private scheduleRetry(sessionId: number) {
    this.retryCount++
    const delay = 1000 * this.retryCount
    this.clearRetryTimer()
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      if (!this.isCurrentSession(sessionId)) {
        return
      }

      const nextSessionId = this.beginLoadAttempt({resetRetryCount: false})
      void this.loadVideoForSession(nextSessionId)
    }, delay)
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
    this.sourceStreamId.set(null)
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
    this.unregisterStreamOwner?.()
    this.unregisterStreamOwner = undefined

    const source = this.currentSource
    if (!source) {
      return
    }

    this.currentSource = null
    this.releaseSource(source)
  }

  private releaseSource(source: FileSourceLoadResult) {
    try {
      void Promise.resolve(source.release()).catch((error) => {
        console.warn('Failed to release video preview source:', error)
      })
    } catch (error) {
      console.warn('Failed to release video preview source:', error)
    }
  }
}
