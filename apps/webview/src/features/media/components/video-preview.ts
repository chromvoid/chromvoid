import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {css, nothing} from 'lit'
import {i18n} from 'root/i18n'
import {VideoPreviewModel} from './video-preview.model'
import {motionPrimitiveStyles, skeletonShimmerStyles} from 'root/shared/ui/shared-styles'
import type {FileMediaInfo} from 'root/core/catalog/media-info'

export class VideoPreview extends ReatomLitElement {
  static define() {
    if (!customElements.get('video-preview')) {
      customElements.define('video-preview', this)
    }
  }

  static get properties() {
    return {
      fileId: {type: Number},
      fileName: {type: String},
      mimeType: {type: String},
      mediaInfo: {attribute: false},
      lastModified: {type: Number},
      sourceSize: {type: Number},
    }
  }

  declare fileId: number
  declare fileName: string
  declare mimeType?: string
  declare mediaInfo?: FileMediaInfo | null
  declare lastModified?: number
  declare sourceSize?: number

  private model = new VideoPreviewModel()

  constructor() {
    super()
    this.fileId = 0
    this.fileName = ''
  }

  static styles = [
    motionPrimitiveStyles,
    skeletonShimmerStyles,
    css`
      :host {
        display: contents;
      }

      .preview-container {
        width: 100%;
        height: 250px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--cv-radius-m);
        overflow: hidden;
        background: var(--cv-color-surface-secondary);
        position: relative;
      }

      .preview-video {
        width: 100%;
        height: 100%;
        object-fit: contain;
        cursor: pointer;
        border-radius: var(--cv-radius-m);
      }

      .skeleton {
        width: 100%;
        height: 100%;
        background: linear-gradient(
          90deg,
          var(--cv-color-surface) 0%,
          var(--cv-color-surface-secondary) 50%,
          var(--cv-color-surface) 100%
        );
      }

      .error-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--app-spacing-3);
        padding: var(--app-spacing-4);
        color: var(--cv-color-text-muted);
        text-align: center;
      }

      .error-message {
        font-size: var(--cv-font-size-sm);
      }

      .retry-button {
        padding: var(--app-spacing-2) var(--app-spacing-3);
        background: var(--cv-color-surface-tertiary);
        border: 1px solid var(--cv-color-border);
        border-radius: var(--cv-radius-s);
        cursor: pointer;
        font-size: var(--cv-font-size-sm);
        color: var(--cv-color-text);
        transition: background 0.2s;
      }

      .retry-button:hover {
        background: var(--cv-color-surface-secondary);
      }

      .fallback-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: var(--app-spacing-2);
      }

      .fallback-button {
        display: inline-flex;
        align-items: center;
        gap: var(--app-spacing-2);
        min-height: 36px;
        padding: 0 var(--app-spacing-3);
        border: 1px solid var(--cv-color-border);
        border-radius: var(--cv-radius-s);
        background: var(--cv-color-surface-tertiary);
        color: var(--cv-color-text);
        cursor: pointer;
        font-size: var(--cv-font-size-sm);
      }

      .fallback-button:hover {
        background: var(--cv-color-surface-secondary);
      }
    `,
  ]

  connectedCallback() {
    super.connectedCallback()
    this.syncModelFile()
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this.model.cleanup()
  }

  updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties)
    if (
      changedProperties.has('fileId') ||
      changedProperties.has('fileName') ||
      changedProperties.has('mimeType') ||
      changedProperties.has('mediaInfo') ||
      changedProperties.has('lastModified') ||
      changedProperties.has('sourceSize')
    ) {
      this.syncModelFile()
    }
  }

  private syncModelFile() {
    this.model.setFile(this.fileId, this.fileName, {
      mimeType: this.mimeType ?? null,
      mediaInfo: this.mediaInfo ?? null,
      lastModified: this.lastModified,
      sourceSize: this.sourceSize,
    })
  }

  private handleVideoElementReady() {
    this.model.handleVideoElementReady()
  }

  private handleVideoElementError() {
    this.model.handleVideoElementError()
  }

  private handleRetry() {
    this.model.retry()
  }

  private handleOpenExternal() {
    this.dispatchFallbackAction('open-external')
  }

  private handleDownload() {
    this.dispatchFallbackAction('download')
  }

  private dispatchFallbackAction(action: 'open-external' | 'download') {
    if (!this.fileId) return
    this.dispatchEvent(
      new CustomEvent('action', {
        detail: {action, fileId: this.fileId},
        bubbles: true,
        composed: true,
      }),
    )
  }

  private handleClick() {
    if (!this.model.playable()) return
    this.dispatchEvent(
      new CustomEvent('open-video', {
        bubbles: true,
        composed: true,
      }),
    )
  }

  protected render() {
    const loadingState = this.model.loadingState()
    const videoUrl = this.model.videoUrl()
    const errorMessage = this.model.errorMessage()
    const playable = this.model.playable()

    return html`
      <div class="preview-container">
        ${loadingState === 'loading'
          ? html`<div class="skeleton"></div>`
          : loadingState === 'loaded' && videoUrl && playable
            ? html`
                <video
                  class="preview-video"
                  src=${videoUrl}
                  controls
                  preload="metadata"
                  playsinline
                  @loadedmetadata=${this.handleVideoElementReady}
                  @canplay=${this.handleVideoElementReady}
                  @error=${this.handleVideoElementError}
                  @click=${this.handleClick}
                ></video>
              `
            : loadingState === 'error'
              ? html`
                  <div class="error-state">
                    <cv-icon name="file-earmark-play" size="l"></cv-icon>
                    <div class="error-message">${errorMessage}</div>
                    ${playable
                      ? html`<cv-button unstyled class="retry-button" @click=${this.handleRetry}>
                          ${i18n('button:retry' as any)}
                        </cv-button>`
                      : nothing}
                  </div>
                `
              : loadingState === 'fallback-limited'
                ? html`
                    <div class="error-state">
                      <cv-icon name="file-earmark-play" size="l"></cv-icon>
                      <div class="error-message">${i18n('media:fallback-limited-copy' as any)}</div>
                      <div class="fallback-actions">
                        <cv-button unstyled class="fallback-button" @click=${this.handleOpenExternal}>
                          <cv-icon slot="prefix" name="box-arrow-up-right" size="s"></cv-icon>
                          <span>${i18n('action:open-external' as any)}</span>
                        </cv-button>
                        <cv-button unstyled class="fallback-button" @click=${this.handleDownload}>
                          <cv-icon slot="prefix" name="download" size="s"></cv-icon>
                          <span>${i18n('action:download' as any)}</span>
                        </cv-button>
                      </div>
                    </div>
                  `
              : nothing}
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'video-preview': VideoPreview
  }
}
