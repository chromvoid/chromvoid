import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {css} from 'lit'

import {mediaPlaybackModel} from 'root/features/media/models/media-playback.model'
import {
  getMediaStreamLoadabilityTimeoutMs,
  MEDIA_STREAM_LOADABILITY_TIMEOUT_MS,
  REMOTE_MEDIA_STREAM_LOADABILITY_TIMEOUT_MS,
} from 'root/features/media/models/media-stream-loadability'

export {MEDIA_STREAM_LOADABILITY_TIMEOUT_MS, REMOTE_MEDIA_STREAM_LOADABILITY_TIMEOUT_MS}

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
  private loadabilityStreamId: string | null = null
  private loadabilityTimeout: ReturnType<typeof setTimeout> | undefined

  disconnectedCallback(): void {
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

    if (driverKind === 'ios-avplayer') {
      this.clearAudioElement(audio)
      return
    }

    if (sessionKind === 'none' || !sourceUrl) {
      this.clearLoadabilityWatchdog()
      this.appliedSourceUrl = null
      this.appliedSeekRequestId = 0
      if (audio.getAttribute('src')) {
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
      audio.src = sourceUrl
      audio.load()
      this.startLoadabilityWatchdogIfNeeded()
    }

    this.syncSeekRequest(audio)

    if (intent === 'play') {
      // Only issue play() when the element is actually paused; re-issuing it on
      // every Lit update while playback is running is redundant churn.
      if (!audio.paused) return
      void audio.play().catch((error) => {
        console.warn('[media-playback] audio play failed', error)
        mediaPlaybackModel.requestPause()
      })
      return
    }

    audio.pause()
  }

  private clearAudioElement(audio: HTMLAudioElement): void {
    this.clearLoadabilityWatchdog()
    this.appliedSourceUrl = null
    this.appliedSeekRequestId = 0
    if (!audio.getAttribute('src')) return

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
    }, getMediaStreamLoadabilityTimeoutMs())
  }

  private clearLoadabilityWatchdog(): void {
    if (this.loadabilityTimeout !== undefined) {
      clearTimeout(this.loadabilityTimeout)
      this.loadabilityTimeout = undefined
    }
    this.loadabilityStreamId = null
  }

  private handlePlay() {
    mediaPlaybackModel.handleMediaPlay()
  }

  private handlePause() {
    mediaPlaybackModel.handleMediaPause()
  }

  private handleWaiting() {
    mediaPlaybackModel.handleMediaWaiting()
  }

  private handleCanPlay() {
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
    // The error handler already routes to the loadability fallback; clear the
    // watchdog so it cannot fire a second, duplicate fallback afterwards.
    this.clearLoadabilityWatchdog()
    mediaPlaybackModel.handleMediaError()
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
