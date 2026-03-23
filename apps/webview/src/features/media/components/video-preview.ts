import {XLitElement} from '@statx/lit'
import {html, css, nothing} from 'lit'
import {i18n} from 'root/i18n'
import {VideoPreviewModel} from './video-preview.model'
import {motionPrimitiveStyles, skeletonShimmerStyles} from 'root/shared/ui/shared-styles'

export class VideoPreview extends XLitElement {
  static define() {
    if (!customElements.get('video-preview')) {
      customElements.define('video-preview', this)
    }
  }

  static get properties() {
    return {
      fileId: {type: Number},
      fileName: {type: String},
    }
  }

  declare fileId: number
  declare fileName: string

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
    `,
  ]

  connectedCallback() {
    super.connectedCallback()
    this.model.setFile(this.fileId, this.fileName)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this.model.cleanup()
  }

  updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties)
    if (changedProperties.has('fileId') || changedProperties.has('fileName')) {
      this.model.setFile(this.fileId, this.fileName)
    }
  }

  private handleVideoError = () => {
    this.model.setError(i18n('media:video-play-failed' as any))
  }

  private handleRetry = () => {
    this.model.retry()
  }

  private handleClick = () => {
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
                  @error=${this.handleVideoError}
                  @click=${this.handleClick}
                ></video>
              `
            : loadingState === 'error'
              ? html`
                  <div class="error-state">
                    <cv-icon name="file-earmark-play" size="l"></cv-icon>
                    <div class="error-message">${errorMessage}</div>
                    ${playable
                      ? html`<button class="retry-button" @click=${this.handleRetry}>
                          ${i18n('button:retry' as any)}
                        </button>`
                      : nothing}
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
