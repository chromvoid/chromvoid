import {atom, wrap} from '@reatom/core'

import {runtimeModeModel} from 'root/core/runtime/runtime-mode.model'
import type {AndroidVideoPlayerEvent, MediaStreamErrorEvent} from 'root/core/transport/transport'
import {i18n} from 'root/i18n'
import {MEDIA_STREAM_LOADABILITY_TIMEOUT_MS} from 'root/features/media/models/media-stream-loadability'
import {
  registerMediaStreamOwner,
  type MediaStreamLifecycleReleaseContext,
  type MediaStreamLifecycleReleaseReason,
  type MediaStreamOwner,
} from 'root/features/media/models/media-stream-owner-registry'
import {isMediaBlobFallbackLimitError, loadFileSourceById, type FileSourceLoadResult} from './file-loader'
import type {FileMediaInfo} from 'root/core/catalog/media-info'

export type VideoPlayerSourceKind = 'none' | 'blob' | 'media-stream' | 'android-native-video'
export type VideoPlayerFileInput = {
  fileId: number
  fileName: string
  mimeType?: string | null
  mediaInfo?: FileMediaInfo | null
  lastModified?: number
  sourceSize?: number | null
}

export type VideoPlayerModelCallbacks = {
  onAndroidNativeVideoReleased?: () => void
}

export class VideoPlayerModel implements MediaStreamOwner {
  readonly videoUrl = atom<string | null>(null, 'videoPlayer.videoUrl')
  readonly loading = atom(true, 'videoPlayer.loading')
  readonly fallbackLimited = atom(false, 'videoPlayer.fallbackLimited')
  readonly errorMessage = atom('', 'videoPlayer.errorMessage')
  readonly sourceKind = atom<VideoPlayerSourceKind>('none', 'videoPlayer.sourceKind')
  readonly sourceStreamId = atom<string | null>(null, 'videoPlayer.sourceStreamId')

  private abortController: AbortController | null = null
  private loadabilityTimer: ReturnType<typeof setTimeout> | null = null
  private currentSource: FileSourceLoadResult | null = null
  private unregisterStreamOwner: (() => void) | undefined
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
    if (
      this.fileId === input.fileId &&
      this.fileName === input.fileName &&
      this.mimeType === mimeType &&
      this.mediaInfo === mediaInfo &&
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
    const controller = new AbortController()
    this.abortController = controller

    try {
      const source = await wrap(
        loadFileSourceById(this.fileId, this.fileName, {
          signal: controller.signal,
          variant: 'raw',
          mimeType: this.mimeType,
          mediaInfo: this.mediaInfo,
          lastModified: this.lastModified,
          sourceSize: this.sourceSize,
          allowAndroidNativeVideo: true,
        }),
      )

      if (!this.isCurrentSession(sessionId)) {
        this.releaseSource(source)
        return
      }

      this.attachSource(source)
      this.loading.set(false)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      console.error('Failed to load video:', error)
      if (!this.isCurrentSession(sessionId)) return
      this.loading.set(false)
      if (isMediaBlobFallbackLimitError(error)) {
        this.fallbackLimited.set(true)
        this.errorMessage.set(i18n('media:fallback-limited-title' as any))
        return
      }
      this.errorMessage.set(i18n('media:video-load-failed' as any))
    } finally {
      if (this.abortController === controller) {
        this.abortController = null
      }
    }
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

  handleAndroidVideoPlayerEvent(event: AndroidVideoPlayerEvent): void {
    const source = this.currentSource
    if (source?.kind !== 'android-native-video' || source.token !== event.token) return

    if (event.event === 'error') {
      this.failCurrentSource()
      return
    }

    if (event.event === 'released') {
      this.invalidateCurrentLoad()
      this.loading.set(false)
      this.callbacks.onAndroidNativeVideoReleased?.()
      return
    }

    this.loading.set(false)
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
    if (this.sourceKind() !== 'media-stream' && this.sourceKind() !== 'android-native-video') return

    this.failCurrentSource()
  }

  private async reloadVideoAfterNativeFallback() {
    await this.loadVideo()
  }

  private failCurrentSource() {
    this.invalidateCurrentLoad()
    this.loading.set(false)
    this.fallbackLimited.set(false)
    this.errorMessage.set(i18n('media:video-load-failed' as any))
  }

  private attachSource(source: FileSourceLoadResult) {
    this.releaseCurrentSource()
    this.fallbackLimited.set(false)
    this.currentSource = source
    const streamId = source.kind === 'media-stream' ? source.streamId ?? null : null
    const ownerId =
      source.kind === 'media-stream'
        ? streamId
        : source.kind === 'android-native-video'
          ? source.token
          : null

    this.sourceKind.set(
      source.kind === 'media-stream'
        ? 'media-stream'
        : source.kind === 'android-native-video'
          ? 'android-native-video'
          : 'blob',
    )
    this.sourceStreamId.set(streamId)

    if (ownerId) {
      this.unregisterStreamOwner = registerMediaStreamOwner(ownerId, this)
    }

    if (source.kind === 'media-stream' && streamId) {
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

  private beginLoadAttempt(): number {
    this.invalidateCurrentLoad()
    return this.loadSessionId
  }

  private invalidateCurrentLoad() {
    this.loadSessionId += 1
    this.clearLoadabilityTimer()
    this.releaseCurrentSource()
    this.videoUrl.set(null)
    this.sourceKind.set('none')
    this.sourceStreamId.set(null)

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
        console.warn('Failed to release video player source:', error)
      })
    } catch (error) {
      console.warn('Failed to release video player source:', error)
    }
  }
}
