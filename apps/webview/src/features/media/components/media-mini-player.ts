import {html, ReatomLitElement, watch} from '@chromvoid/uikit/reatom-lit'
import {CVMenuButton} from '@chromvoid/uikit/components/cv-menu-button'
import {CVMenuItem} from '@chromvoid/uikit/components/cv-menu-item'
import {CVSlider, type CVSliderEventDetail} from '@chromvoid/uikit/components/cv-slider'
import {nothing} from 'lit'

import {mediaPlaybackModel} from 'root/features/media/models/media-playback.model'
import {i18n} from 'root/i18n'
import {AudioArtworkPreview} from './audio-artwork-preview'
import {mediaMiniPlayerStyles} from './media-mini-player.styles'

type MediaMiniPlayerVariant = 'statusbar' | 'mobile'

export class MediaMiniPlayer extends ReatomLitElement {
  static elementName = 'media-mini-player'

  static define() {
    AudioArtworkPreview.define()
    CVMenuButton.define()
    CVMenuItem.define()
    CVSlider.define()
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
  }

  static properties = {
    variant: {type: String, reflect: true},
  }

  declare variant: MediaMiniPlayerVariant

  static styles = mediaMiniPlayerStyles

  constructor() {
    super()
    this.variant = 'statusbar'
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.addEventListener('click', this.handleOpenPlayer)
  }

  override disconnectedCallback(): void {
    this.removeEventListener('click', this.handleOpenPlayer)
    super.disconnectedCallback()
  }

  private handleOpenPlayer() {
    mediaPlaybackModel.openFullPlayer()
  }

  private handleOpenPlayerClick(e: Event) {
    e.stopPropagation()
    mediaPlaybackModel.openFullPlayer()
  }

  private handleTogglePlayback(e: Event) {
    e.stopPropagation()
    mediaPlaybackModel.togglePlayPause()
  }

  private handleControlEvent(e: Event) {
    e.stopPropagation()
  }

  private getSeekEventValue(e: Event): number | null {
    const value = (e as CustomEvent<Partial<CVSliderEventDetail>>).detail?.value
    return typeof value === 'number' && Number.isFinite(value) ? value : null
  }

  private handleSeekInput(e: Event) {
    e.stopPropagation()
    const value = this.getSeekEventValue(e)
    if (value == null) return
    mediaPlaybackModel.previewSeek(value)
  }

  private handleSeekChange(e: Event) {
    e.stopPropagation()
    const value = this.getSeekEventValue(e)
    if (value == null) return
    mediaPlaybackModel.commitSeek(value)
  }

  private handleMenuChange(e: Event) {
    e.stopPropagation()
    const menu = e.currentTarget as CVMenuButton
    const action = (e as CustomEvent<{value: string | null}>).detail?.value
    menu.value = ''

    if (action === 'open-player') {
      mediaPlaybackModel.openFullPlayer()
      return
    }

    if (action === 'stop') {
      void mediaPlaybackModel.stopSession()
    }
  }

  private getStatusLabel(): string {
    if (mediaPlaybackModel.loadingState() === 'error' || mediaPlaybackModel.playbackState() === 'error') {
      return i18n('media:playback-failed' as any)
    }

    if (mediaPlaybackModel.nativeAudioPreparingStatusVisible()) {
      return i18n('media:audio-preparing-short' as any)
    }

    return mediaPlaybackModel.positionLabel()
  }

  private renderFallbackArtwork() {
    return html`
      <span slot="fallback" class="media-mini-fallback-tile" aria-hidden="true">
        <cv-icon class="media-mini-fallback-icon" name="audio-lines" size="m"></cv-icon>
      </span>
    `
  }

  private renderProgress(duration: number | null, canSeek: boolean) {
    return html`
      <cv-slider
        class="media-mini-progress"
        .min=${0}
        .max=${duration ?? 0}
        .step=${0.1}
        .value=${canSeek ? watch(mediaPlaybackModel.displayCurrentTime) : 0}
        ?disabled=${!canSeek}
        @pointerdown=${this.handleControlEvent}
        @click=${this.handleControlEvent}
        @cv-input=${this.handleSeekInput}
        @cv-change=${this.handleSeekChange}
        aria-label=${i18n('media:playback-position' as any)}
      ></cv-slider>
    `
  }

  private renderMenu() {
    return html`
      <cv-menu-button
        class="media-mini-menu"
        size="medium"
        variant="ghost"
        close-on-select
        aria-label=${i18n('media:current-track-actions' as any)}
        @click=${this.handleControlEvent}
        @cv-input=${this.handleControlEvent}
        @cv-change=${this.handleMenuChange}
      >
        <cv-icon name="three-dots-vertical" size="s"></cv-icon>
        <cv-menu-item slot="menu" value="open-player">${i18n('media:open-player' as any)}</cv-menu-item>
        <cv-menu-item slot="menu" value="stop">${i18n('media:stop' as any)}</cv-menu-item>
      </cv-menu-button>
    `
  }

  protected render() {
    if (!mediaPlaybackModel.miniControlsVisible()) return nothing

    const track = mediaPlaybackModel.currentTrack()
    if (!track) return nothing

    const variant = this.variant === 'mobile' ? 'mobile' : 'statusbar'
    const playing = mediaPlaybackModel.isPlaying()
    const duration = mediaPlaybackModel.duration()
    const canSeek = mediaPlaybackModel.canSeek()
    const error = mediaPlaybackModel.loadingState() === 'error' || mediaPlaybackModel.playbackState() === 'error'
    const statusLabel = this.getStatusLabel()

    return html`
      <div class="media-mini media-mini--${variant}" data-playing=${String(playing)} data-error=${String(error)}>
        <span class="media-mini-accent" aria-hidden="true"></span>
        <cv-button unstyled
          class="media-mini-open"
          type="button"
          @click=${this.handleOpenPlayerClick}
          aria-label=${i18n('media:open-player' as any)}
        >
          <audio-artwork-preview
            slot="prefix"
            class="media-mini-artwork"
            .fileId=${track.id}
            .fileName=${track.name}
            .mimeType=${track.mimeType}
            .lastModified=${track.lastModified}
            .sourceSize=${track.size}
            .sourceRevision=${track.sourceRevision}
            .loadEnabled=${mediaPlaybackModel.audioArtworkLoadAllowed()}
            variant="thumbnail-image"
            fallback-icon="audio-lines"
          >
            ${this.renderFallbackArtwork()}
          </audio-artwork-preview>
          <span class="media-mini-copy">
            <span class="media-mini-title" title=${track.name}>${track.name}</span>
            <span class="media-mini-time" data-error=${String(error)}>${statusLabel}</span>
          </span>
        </cv-button>

        ${this.renderProgress(duration, canSeek)}

        <div class="media-mini-controls">
          <cv-button unstyled
            class="media-mini-button primary"
            type="button"
            @click=${this.handleTogglePlayback}
            aria-label=${playing ? i18n('media:pause' as any) : i18n('media:play' as any)}
          >
            <cv-icon size="m" name=${playing ? 'pause' : 'play'}></cv-icon>
          </cv-button>
          ${this.renderMenu()}
        </div>
      </div>
    `
  }
}

MediaMiniPlayer.define()
