import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {css} from 'lit'

import {runtimeCapabilitiesAtom} from 'root/core/runtime/runtime-capabilities'
import {ANDROID_MEDIA_SESSION_CONTROL_EVENT} from 'root/features/media/models/android-media-session-events'
import {mediaPlaybackModel} from 'root/features/media/models/media-playback.model'
import {MEDIA_STREAM_LOADABILITY_TIMEOUT_MS} from 'root/features/media/models/media-stream-loadability'

export {MEDIA_STREAM_LOADABILITY_TIMEOUT_MS}

export class MediaPlaybackHost extends ReatomLitElement {
  static elementName = 'media-playback-host'

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
  }

  static styles = css`
    :host {
      display: none;
    }
  `

  private appliedSourceUrl: string | null = null
  private appliedSeekRequestId = 0
  private traceSeq = 0
  private loadabilityStreamId: string | null = null
  private loadabilityTimeout: ReturnType<typeof setTimeout> | undefined

  connectedCallback(): void {
    super.connectedCallback()
    globalThis.addEventListener(ANDROID_MEDIA_SESSION_CONTROL_EVENT, this)
  }

  disconnectedCallback(): void {
    globalThis.removeEventListener(ANDROID_MEDIA_SESSION_CONTROL_EVENT, this)
    this.clearLoadabilityWatchdog()
    const audio = this.getAudioElement()
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    this.appliedSourceUrl = null
    this.appliedSeekRequestId = 0
    super.disconnectedCallback()
  }

  handleEvent(event: Event): void {
    if (event.type === ANDROID_MEDIA_SESSION_CONTROL_EVENT) {
      this.syncAudioElement()
    }
  }

  protected updated(changedProperties: Map<string, unknown>): void {
    super.updated(changedProperties)
    this.syncAudioElement()
  }

  private getAudioElement(): HTMLAudioElement | null {
    return this.renderRoot.querySelector('audio')
  }

  private syncAudioElement(): void {
    const audio = this.getAudioElement()
    if (!audio) return

    const sessionKind = mediaPlaybackModel.sessionKind()
    const sourceUrl = mediaPlaybackModel.sourceUrl()
    const driverKind = mediaPlaybackModel.driverKind()
    const intent = mediaPlaybackModel.playbackIntent()
    this.trace('syncAudioElement', {
      intent,
      sessionKind,
      driverKind,
      sourceChanged: this.appliedSourceUrl !== sourceUrl,
      hasSourceUrl: sourceUrl !== null,
      audioPaused: audio.paused,
      readyState: audio.readyState,
    })

    if (driverKind === 'android-media3' || driverKind === 'ios-avplayer') {
      this.clearAudioElement(audio, 'native_audio_driver')
      return
    }

    if (sessionKind === 'none' || !sourceUrl) {
      this.clearLoadabilityWatchdog()
      this.appliedSourceUrl = null
      this.appliedSeekRequestId = 0
      if (audio.getAttribute('src')) {
        this.trace('audioSourceCleared', {
          reason: 'no_session_or_source',
          audioPaused: audio.paused,
          readyState: audio.readyState,
        })
        audio.pause()
        audio.removeAttribute('src')
        audio.load()
      }
      return
    }

    if (this.appliedSourceUrl !== sourceUrl) {
      this.clearLoadabilityWatchdog()
      this.appliedSourceUrl = sourceUrl
      this.appliedSeekRequestId = 0
      this.trace('audioSourceLoaded', {
        sourceKind: mediaPlaybackModel.sourceKind(),
        readyState: audio.readyState,
      })
      audio.src = sourceUrl
      audio.load()
      this.startLoadabilityWatchdogIfNeeded()
    }

    this.syncSeekRequest(audio)

    if (intent === 'play') {
      this.trace('audioPlayRequested', {
        audioPaused: audio.paused,
        readyState: audio.readyState,
      })
      void audio.play().catch((error) => {
        this.trace('audioPlayFailed', {
          errorName: error instanceof Error ? error.name : typeof error,
        })
        console.warn('[media-playback] audio play failed', error)
        mediaPlaybackModel.requestPause()
      })
      return
    }

    this.trace('audioPauseRequested', {
      audioPaused: audio.paused,
      readyState: audio.readyState,
    })
    audio.pause()
  }

  private clearAudioElement(audio: HTMLAudioElement, reason: string): void {
    this.clearLoadabilityWatchdog()
    this.appliedSourceUrl = null
    this.appliedSeekRequestId = 0
    if (!audio.getAttribute('src')) return

    this.trace('audioSourceCleared', {
      reason,
      audioPaused: audio.paused,
      readyState: audio.readyState,
    })
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
  }

  private syncSeekRequest(audio: HTMLAudioElement): void {
    const request = mediaPlaybackModel.seekRequest()
    if (!request || request.id === this.appliedSeekRequestId || !Number.isFinite(request.time)) return
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return

    const targetTime = Math.min(audio.duration, Math.max(0, request.time))

    if (Math.abs(audio.currentTime - targetTime) > 0.05) {
      try {
        audio.currentTime = targetTime
      } catch (error) {
        console.warn('[media-playback] audio seek failed', error)
        return
      }
    }

    this.appliedSeekRequestId = request.id
    mediaPlaybackModel.handleMediaTimeUpdate(
      audio.currentTime,
      Number.isFinite(audio.duration) ? audio.duration : null,
    )
  }

  private startLoadabilityWatchdogIfNeeded(): void {
    if (mediaPlaybackModel.sourceKind() !== 'media-stream') return

    const streamId = mediaPlaybackModel.sourceStreamId()
    if (!streamId) return

    this.loadabilityStreamId = streamId
    this.loadabilityTimeout = setTimeout(() => {
      const activeStreamId = this.loadabilityStreamId
      this.clearLoadabilityWatchdog()
      if (activeStreamId) {
        mediaPlaybackModel.handleNativeStreamLoadabilityFailure(activeStreamId)
      }
    }, MEDIA_STREAM_LOADABILITY_TIMEOUT_MS)
  }

  private clearLoadabilityWatchdog(): void {
    if (this.loadabilityTimeout !== undefined) {
      clearTimeout(this.loadabilityTimeout)
      this.loadabilityTimeout = undefined
    }
    this.loadabilityStreamId = null
  }

  private handlePlay() {
    this.trace('audioEventPlay', {
      audioPaused: this.getAudioElement()?.paused ?? null,
      readyState: this.getAudioElement()?.readyState ?? null,
    })
    mediaPlaybackModel.handleMediaPlay()
  }

  private handlePause() {
    this.trace('audioEventPause', {
      audioPaused: this.getAudioElement()?.paused ?? null,
      readyState: this.getAudioElement()?.readyState ?? null,
    })
    mediaPlaybackModel.handleMediaPause()
  }

  private handleWaiting() {
    this.trace('audioEventWaiting', {
      audioPaused: this.getAudioElement()?.paused ?? null,
      readyState: this.getAudioElement()?.readyState ?? null,
    })
    mediaPlaybackModel.handleMediaWaiting()
  }

  private handleCanPlay() {
    this.trace('audioEventCanPlay', {
      audioPaused: this.getAudioElement()?.paused ?? null,
      readyState: this.getAudioElement()?.readyState ?? null,
    })
    this.clearLoadabilityWatchdog()
    mediaPlaybackModel.handleMediaCanPlay()
  }

  private handleLoadedMetadata() {
    this.clearLoadabilityWatchdog()
    this.handleTimeUpdate()
  }

  private handleTimeUpdate() {
    const audio = this.getAudioElement()
    if (!audio) return

    mediaPlaybackModel.handleMediaTimeUpdate(
      audio.currentTime,
      Number.isFinite(audio.duration) ? audio.duration : null,
    )
    this.syncSeekRequest(audio)
  }

  private handleEnded() {
    void mediaPlaybackModel.handleTrackEnded()
  }

  private handleError() {
    this.trace('audioEventError', {
      audioPaused: this.getAudioElement()?.paused ?? null,
      readyState: this.getAudioElement()?.readyState ?? null,
    })
    mediaPlaybackModel.handleMediaError()
  }

  private trace(event: string, meta: Record<string, unknown> = {}): void {
    const capabilities = runtimeCapabilitiesAtom()
    if (capabilities.platform !== 'android' || !capabilities.mobile) return

    const track = mediaPlaybackModel.currentTrack()
    console.debug('[media-playback-host]', {
      seq: ++this.traceSeq,
      event,
      sessionKind: mediaPlaybackModel.sessionKind(),
      trackId: track?.id ?? null,
      playbackState: mediaPlaybackModel.playbackState(),
      playbackIntent: mediaPlaybackModel.playbackIntent(),
      loadingState: mediaPlaybackModel.loadingState(),
      ...meta,
    })
  }

  protected render() {
    mediaPlaybackModel.sessionKind()
    mediaPlaybackModel.driverKind()
    mediaPlaybackModel.sourceUrl()
    mediaPlaybackModel.sourceKind()
    mediaPlaybackModel.sourceStreamId()
    mediaPlaybackModel.playbackIntent()
    mediaPlaybackModel.seekRequest()
    mediaPlaybackModel.duration()

    return html`
      <audio
        preload="metadata"
        @play=${this.handlePlay}
        @pause=${this.handlePause}
        @waiting=${this.handleWaiting}
        @canplay=${this.handleCanPlay}
        @loadedmetadata=${this.handleLoadedMetadata}
        @timeupdate=${this.handleTimeUpdate}
        @durationchange=${this.handleTimeUpdate}
        @ended=${this.handleEnded}
        @error=${this.handleError}
      ></audio>
    `
  }
}

MediaPlaybackHost.define()
