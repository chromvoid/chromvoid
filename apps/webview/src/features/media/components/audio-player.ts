import {html, ReatomLitElement, watch} from '@chromvoid/uikit/reatom-lit'
import type {CVSliderEventDetail} from '@chromvoid/uikit/components/cv-slider'
import {nothing} from 'lit'

import {mediaPlaybackModel} from 'root/features/media/models/media-playback.model'
import {i18n} from 'root/i18n'
import {AdaptiveModalSurface} from 'root/shared/ui/adaptive-modal-surface'
import {audioPlayerStyles} from './audio-player.styles'

export class AudioPlayer extends ReatomLitElement {
  static elementName = 'audio-player'

  static define() {
    AdaptiveModalSurface.define()
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
  }

  static styles = audioPlayerStyles

  private emitClose(event?: Event): void {
    event?.stopPropagation()
    this.dispatchEvent(new CustomEvent('close', {bubbles: true, composed: true}))
  }

  private handlePrevious(): void {
    void mediaPlaybackModel.previousTrack()
  }

  private handleNext(): void {
    void mediaPlaybackModel.nextTrack()
  }

  private handlePlayPause(): void {
    mediaPlaybackModel.togglePlayPause()
  }

  private getSeekEventValue(e: Event): number | null {
    const value = (e as CustomEvent<Partial<CVSliderEventDetail>>).detail?.value
    return typeof value === 'number' && Number.isFinite(value) ? value : null
  }

  private handleSeekInput(e: Event): void {
    const value = this.getSeekEventValue(e)
    if (value == null) return
    mediaPlaybackModel.previewSeek(value)
  }

  private handleSeekChange(e: Event): void {
    const value = this.getSeekEventValue(e)
    if (value == null) return
    mediaPlaybackModel.commitSeek(value)
  }

  private handleStop(e: Event): void {
    e.stopPropagation()
    this.emitClose()
    void mediaPlaybackModel.stopSession()
  }

  private handleOpenExternal(): void {
    this.emitAction('open-external')
  }

  private handleDownload(): void {
    this.emitAction('download')
  }

  private handleSelectTrack(e: Event): void {
    const index = Number((e.currentTarget as HTMLElement | null)?.dataset['index'])
    if (!Number.isFinite(index)) return
    void mediaPlaybackModel.selectTrack(index)
  }

  private emitAction(action: 'open-external' | 'download'): void {
    const current = mediaPlaybackModel.currentTrack()
    if (!current) return
    this.dispatchEvent(
      new CustomEvent('action', {
        detail: {action, fileId: current.id},
        bubbles: true,
        composed: true,
      }),
    )
  }

  private renderNativePreparingStatus() {
    return html`
      <div class="native-preparing-status" role="status" aria-live="polite">
        <div class="native-preparing-icon" aria-hidden="true">
          <cv-icon name="loader" size="s"></cv-icon>
        </div>
        <div class="native-preparing-copy">
          <div class="native-preparing-title">${i18n('media:android-audio-preparing-title' as any)}</div>
          <div class="native-preparing-detail">${i18n('media:android-audio-preparing-copy' as any)}</div>
        </div>
      </div>
    `
  }

  private renderWaveformSeek(duration: number | null, canSeek: boolean) {
    const bars = mediaPlaybackModel.waveformDisplayBars()
    const preparing = mediaPlaybackModel.nativeAudioPreparing()

    return html`
      <div class="waveform-seek" data-preparing=${String(preparing)} data-seekable=${String(canSeek)}>
        <div class="waveform-grid" aria-hidden="true">
          ${bars.map(
            (bar) => html`
              <span
                class="waveform-column"
                data-index=${String(bar.index)}
                data-band=${bar.band}
                data-level=${String(bar.level)}
                data-emphasis=${bar.emphasis}
                data-played=${String(bar.isPlayed)}
                data-playhead-near=${String(bar.isNearPlayhead)}
              >
                <span class="waveform-bar"></span>
              </span>
            `,
          )}
        </div>
        <cv-slider
          class="seek-slider waveform-slider"
          .min=${0}
          .max=${duration ?? 0}
          .step=${0.1}
          .value=${watch(mediaPlaybackModel.displayCurrentTime)}
          ?disabled=${!canSeek}
          @cv-input=${this.handleSeekInput}
          @cv-change=${this.handleSeekChange}
          aria-label=${i18n('media:seek' as any)}
        ></cv-slider>
      </div>
    `
  }

  private renderFallbackLimited() {
    const panel = mediaPlaybackModel.fallbackPanelState()
    return html`
      <div class="fallback-limited">
        <div class="fallback-icon" aria-hidden="true">
          <cv-icon name="file-music" size="m"></cv-icon>
        </div>
        <div class="fallback-copy-block">
          <div class="fallback-title">${i18n(panel.titleKey as any)}</div>
          <div class="fallback-copy">${i18n(panel.copyKey as any)}</div>
        </div>
        <div class="fallback-actions">
          <cv-button
            unstyled
            class="fallback-button"
            type="button"
            data-action="open-external"
            @click=${this.handleOpenExternal}
          >
            <cv-icon slot="prefix" name="box-arrow-up-right" size="s"></cv-icon>
            <span>${i18n('action:open-external' as any)}</span>
          </cv-button>
          <cv-button
            unstyled
            class="fallback-button"
            type="button"
            data-action="download"
            @click=${this.handleDownload}
          >
            <cv-icon slot="prefix" name="download" size="s"></cv-icon>
            <span>${i18n('action:download' as any)}</span>
          </cv-button>
        </div>
      </div>
    `
  }

  protected render() {
    const current = mediaPlaybackModel.currentTrack()
    const queueRows = mediaPlaybackModel.queueRows()
    const fullPlayerOpen = mediaPlaybackModel.fullPlayerOpen()
    const playing = mediaPlaybackModel.isPlaying()
    const fallbackLimited = mediaPlaybackModel.loadingState() === 'fallback-limited'
    const nativeAudioPreparingStatusVisible = mediaPlaybackModel.nativeAudioPreparingStatusVisible()
    const duration = mediaPlaybackModel.duration()
    const canSeek = mediaPlaybackModel.canSeek()

    if (!fullPlayerOpen || mediaPlaybackModel.sessionKind() !== 'audio' || !current) {
      return nothing
    }

    return html`
      <adaptive-modal-surface
        class="player-surface"
        open
        no-header
        .ariaLabel=${i18n('media:audio-player' as any)}
        @close=${this.emitClose}
      >
        <section class="player-sheet" data-playing=${String(playing)}>
          <header class="sheet-header">
            <div class="track-headline">
              <div class="track-meta">
                <div class="track-eyebrow">${i18n('media:now-playing' as any)}</div>
                <div class="track-title" title=${current.name}>${mediaPlaybackModel.currentTrackTitle()}</div>
                <div class="track-file" title=${current.name}>
                  ${mediaPlaybackModel.currentTrackFileName()}
                </div>
              </div>
            </div>
            <cv-button
              unstyled
              class="icon-button quiet"
              type="button"
              @click=${this.emitClose}
              aria-label=${i18n('button:close' as any)}
            >
              <cv-icon name="x" size="m"></cv-icon>
            </cv-button>
          </header>

          ${fallbackLimited
            ? this.renderFallbackLimited()
            : html`
                ${nativeAudioPreparingStatusVisible ? this.renderNativePreparingStatus() : nothing}

                <div class="seek-control">
                  <div class="seek-labels" aria-hidden="true">
                    <span>${mediaPlaybackModel.currentPositionLabel}</span>
                    <span>${mediaPlaybackModel.durationLabel}</span>
                  </div>
                  ${this.renderWaveformSeek(duration, canSeek)}
                </div>

                <div class="controls">
                  <cv-button
                    unstyled
                    class="icon-button secondary"
                    type="button"
                    ?disabled=${!mediaPlaybackModel.hasPrevious()}
                    @click=${this.handlePrevious}
                    aria-label=${i18n('media:previous-track' as any)}
                  >
                    <cv-icon name="chevron-left" size="m"></cv-icon>
                  </cv-button>
                  <cv-button
                    unstyled
                    class="icon-button primary"
                    type="button"
                    @click=${this.handlePlayPause}
                    aria-label=${playing ? i18n('media:pause' as any) : i18n('media:play' as any)}
                  >
                    <cv-icon name=${playing ? 'pause' : 'play'} size="m"></cv-icon>
                  </cv-button>
                  <cv-button
                    unstyled
                    class="icon-button secondary"
                    type="button"
                    ?disabled=${!mediaPlaybackModel.hasNext()}
                    @click=${this.handleNext}
                    aria-label=${i18n('media:next-track' as any)}
                  >
                    <cv-icon name="chevron-right" size="m"></cv-icon>
                  </cv-button>
                  <cv-button
                    unstyled
                    class="icon-button stop"
                    type="button"
                    @click=${this.handleStop}
                    aria-label=${i18n('media:stop' as any)}
                  >
                    <cv-icon name="square" size="m"></cv-icon>
                  </cv-button>
                </div>
              `}

          <section class="queue" aria-label=${i18n('media:audio-queue' as any)}>
            <div class="queue-header">
              <span>${i18n('media:audio-queue' as any)}</span>
              <span class="queue-count">${mediaPlaybackModel.queueCount()}</span>
            </div>
            <div class="queue-list">
              ${queueRows.map(
                (row) => html`
                  <cv-button
                    unstyled
                    class="queue-row ${row.isCurrent ? 'active' : ''}"
                    type="button"
                    data-index=${String(row.index)}
                    @click=${this.handleSelectTrack}
                    aria-current=${row.isCurrent ? 'true' : 'false'}
                  >
                    <span slot="prefix" class="queue-prefix">
                      <span class="queue-equalizer" aria-hidden="true">
                        <span></span>
                        <span></span>
                        <span></span>
                      </span>
                      <span class="queue-index">${String(row.index + 1).padStart(2, '0')}</span>
                    </span>
                    <span class="queue-name" title=${row.fileName}>${row.title}</span>
                    <span slot="suffix" class="queue-duration">${row.durationLabel}</span>
                  </cv-button>
                `,
              )}
            </div>
          </section>
        </section>
      </adaptive-modal-surface>
    `
  }
}

AudioPlayer.define()
