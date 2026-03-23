import {XLitElement} from '@statx/lit'
import {html, css, nothing} from 'lit'
import {i18n} from 'root/i18n'
import {ImagePreviewModel, type ImageDimensions} from './image-preview.model'
import {motionPrimitiveStyles, skeletonShimmerStyles} from 'root/shared/ui/shared-styles'

export class ImagePreview extends XLitElement {
  static define() {
    if (!customElements.get('image-preview')) {
      customElements.define('image-preview', this)
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

  private model = new ImagePreviewModel()

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

      .preview-image {
        width: 100%;
        height: 100%;
        object-fit: contain;
        cursor: pointer;
        transition: opacity 0.2s;
      }

      .preview-image:hover {
        opacity: 0.9;
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

  private handleImageLoad = (e: Event) => {
    const img = e.target as HTMLImageElement
    const dims: ImageDimensions = {
      width: img.naturalWidth,
      height: img.naturalHeight,
    }
    this.model.setDimensions(dims)

    this.dispatchEvent(
      new CustomEvent('dimensions-loaded', {
        detail: dims,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private handleImageError = () => {
    this.model.setError(i18n('media:image-display-failed' as any))
  }

  private handleRetry = () => {
    this.model.retry()
  }

  protected render() {
    const loadingState = this.model.loadingState()
    const imageUrl = this.model.imageUrl()
    const errorMessage = this.model.errorMessage()

    return html`
      <div class="preview-container">
        ${loadingState === 'loading'
          ? html`<div class="skeleton"></div>`
          : loadingState === 'loaded' && imageUrl
            ? html`
                <img
                  class="preview-image"
                  src=${imageUrl}
                  alt=${this.fileName}
                  decoding="async"
                  loading="lazy"
                  @load=${this.handleImageLoad}
                  @error=${this.handleImageError}
                />
              `
            : loadingState === 'error'
              ? html`
                  <div class="error-state">
                    <cv-icon name="file-earmark-image" size="l"></cv-icon>
                    <div class="error-message">${errorMessage}</div>
                    <button class="retry-button" @click=${this.handleRetry}>
                      ${i18n('button:retry' as any)}
                    </button>
                  </div>
                `
              : nothing}
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'image-preview': ImagePreview
  }
}
