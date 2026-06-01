import type {MediaStreamErrorEvent} from 'root/core/transport/transport'
import {
  isMediaBlobFallbackLimitError,
  loadAudioSourceById,
  type FileSourceLoadResult,
} from 'root/features/media/components/file-loader'
import {
  registerMediaStreamOwner,
  type MediaStreamOwner,
  type MediaStreamLifecycleReleaseContext,
  type MediaStreamLifecycleReleaseReason,
} from './media-stream-owner-registry'
import type {ResolvedAudioTrack} from 'root/app/navigation/navigation.types'
import type {
  MediaPlaybackIntent,
  MediaPlaybackIssue,
  MediaPlaybackLoadingState,
  MediaPlaybackSourceKind,
  MediaPlaybackState,
} from './media-playback.model'
import type {AudioPlaybackDriver, AudioSessionInput} from './audio-playback-driver'

type WebAudioElementPlaybackDriverHost = MediaStreamOwner & {
  currentTrack(): ResolvedAudioTrack | null
  sessionKind(): 'none' | 'audio'
  playbackIntent(): MediaPlaybackIntent
  loadingState(): MediaPlaybackLoadingState
  sourceStreamId(): string | null
  setSourceState(state: {url: string | null; kind: MediaPlaybackSourceKind; streamId: string | null}): void
  setLoadingState(state: MediaPlaybackLoadingState): void
  setPlaybackState(state: MediaPlaybackState): void
  setPlaybackIntent(intent: MediaPlaybackIntent): void
  setPlaybackIssue(issue: MediaPlaybackIssue | null): void
  clearSeekRequest(): void
  markNativeStreamingUnsupportedForRuntime(): void
}

export class WebAudioElementPlaybackDriver implements AudioPlaybackDriver, MediaStreamOwner {
  readonly kind = 'web-audio-element'

  private activeSource: FileSourceLoadResult | null = null
  private unregisterStreamOwner: (() => void) | undefined
  private loadAbort: AbortController | null = null
  private loadGeneration = 0

  constructor(private readonly host: WebAudioElementPlaybackDriverHost) {}

  async startSession(_input: AudioSessionInput): Promise<void> {
    await this.loadCurrentTrackSource()
  }

  async play(): Promise<void> {
    if (this.host.loadingState() === 'idle' || this.host.loadingState() === 'error') {
      await this.loadCurrentTrackSource()
    }
  }

  async pause(): Promise<void> {}

  async stop(): Promise<void> {
    this.loadGeneration++
    this.loadAbort?.abort()
    this.loadAbort = null
    await this.releaseActiveSource()
  }

  async seekTo(_seconds: number): Promise<void> {}

  async selectTrack(_index: number): Promise<void> {
    await this.loadCurrentTrackSource()
  }

  async nextTrack(): Promise<void> {
    await this.loadCurrentTrackSource()
  }

  async previousTrack(): Promise<void> {
    await this.loadCurrentTrackSource()
  }

  handleNativeStreamError(event: MediaStreamErrorEvent): void {
    if (!event.streamId || event.streamId !== this.host.sourceStreamId()) return

    if (event.code === 'ERR_MEDIA_RANGE_REQUIRED') {
      this.host.markNativeStreamingUnsupportedForRuntime()
      void this.reloadCurrentTrackAfterNativeFallback()
      return
    }

    void this.failCurrentSource()
  }

  handleNativeStreamLoadabilityFailure(streamId: string): void {
    if (!streamId || streamId !== this.host.sourceStreamId()) return

    this.host.markNativeStreamingUnsupportedForRuntime()
    void this.reloadCurrentTrackAfterNativeFallback()
  }

  async releaseNativeStreamForLifecycle(
    _reason: MediaStreamLifecycleReleaseReason,
    context: MediaStreamLifecycleReleaseContext = {},
  ): Promise<void> {
    const currentTrack = this.host.currentTrack()
    if (context.nodeId !== undefined && currentTrack?.id !== context.nodeId) return

    await this.stop()
    this.host.setLoadingState('idle')
    this.host.setPlaybackState(this.host.sessionKind() === 'audio' && currentTrack ? 'paused' : 'stopped')
    this.host.setPlaybackIntent('pause')
    this.host.clearSeekRequest()
  }

  private async reloadCurrentTrackAfterNativeFallback(): Promise<void> {
    await this.releaseActiveSource()
    await this.loadCurrentTrackSource()
  }

  private async failCurrentSource(): Promise<void> {
    await this.releaseActiveSource()
    this.host.setSourceState({url: null, kind: 'none', streamId: null})
    this.host.setLoadingState('error')
    this.host.setPlaybackState('error')
    this.host.setPlaybackIntent('pause')
    this.host.clearSeekRequest()
  }

  private async loadCurrentTrackSource(): Promise<void> {
    const track = this.host.currentTrack()
    if (!track || this.host.sessionKind() !== 'audio') return

    const generation = ++this.loadGeneration
    this.loadAbort?.abort()
    const abort = new AbortController()
    this.loadAbort = abort

    await this.releaseActiveSource()
    if (generation !== this.loadGeneration || abort.signal.aborted) return

    this.host.setSourceState({url: null, kind: 'none', streamId: null})
    this.host.clearSeekRequest()
    this.host.setLoadingState('loading')
    this.host.setPlaybackState(this.host.playbackIntent() === 'play' ? 'buffering' : 'paused')

    try {
      const source = await loadAudioSourceById(track.id, track.name, {
        signal: abort.signal,
        mimeType: track.mimeType ?? null,
        mediaInfo: track.mediaInfo ?? null,
        lastModified: track.lastModified,
        sourceSize: track.size,
      })
      if (generation !== this.loadGeneration || abort.signal.aborted) {
        await Promise.resolve(source.release()).catch((error) => {
          console.warn('[media-playback] failed to release superseded source', error)
        })
        return
      }

      this.activeSource = source
      this.host.setSourceState({
        url: source.url,
        kind: source.kind === 'media-stream' ? 'media-stream' : 'blob',
        streamId: source.streamId ?? null,
      })
      this.host.setLoadingState('loaded')
      this.host.setPlaybackState(this.host.playbackIntent() === 'play' ? 'buffering' : 'paused')
      this.host.setPlaybackIssue(null)

      if (source.kind === 'media-stream' && source.streamId) {
        this.unregisterStreamOwner = registerMediaStreamOwner(source.streamId, this.host)
      }
    } catch (error) {
      if (generation !== this.loadGeneration || abort.signal.aborted) return
      if (error instanceof DOMException && error.name === 'AbortError') return

      this.host.setSourceState({url: null, kind: 'none', streamId: null})
      this.host.clearSeekRequest()
      if (isMediaBlobFallbackLimitError(error)) {
        this.host.setLoadingState('fallback-limited')
        this.host.setPlaybackState('paused')
        this.host.setPlaybackIntent('pause')
        this.host.setPlaybackIssue({
          kind: 'blob-fallback-limited',
          trackId: track.id,
          sourceRevision:
            typeof track.sourceRevision === 'number' && Number.isFinite(track.sourceRevision)
              ? track.sourceRevision
              : null,
          sourceSize:
            typeof error.details.sourceSize === 'number' && Number.isFinite(error.details.sourceSize)
              ? error.details.sourceSize
              : typeof track.size === 'number' && Number.isFinite(track.size)
                ? track.size
                : null,
          fallbackLimitBytes:
            typeof error.details.fallbackLimitBytes === 'number' &&
            Number.isFinite(error.details.fallbackLimitBytes)
              ? error.details.fallbackLimitBytes
              : null,
        })
        return
      }

      this.host.setLoadingState('error')
      this.host.setPlaybackState('error')
      this.host.setPlaybackIntent('pause')
    }
  }

  private async releaseActiveSource(): Promise<void> {
    this.unregisterStreamOwner?.()
    this.unregisterStreamOwner = undefined

    const source = this.activeSource
    this.activeSource = null
    this.host.setSourceState({url: null, kind: 'none', streamId: null})

    if (!source) return

    await Promise.resolve(source.release()).catch((error) => {
      console.warn('[media-playback] failed to release source', error)
    })
  }
}
