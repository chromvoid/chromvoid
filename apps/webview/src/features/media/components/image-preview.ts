import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {css, nothing} from 'lit'
import {i18n} from 'root/i18n'
import {ImagePreviewModel, type ImageDimensions} from './image-preview.model'
import {mediaPreviewStyles} from './media-preview.styles'
import {motionPrimitiveStyles, skeletonShimmerStyles} from 'root/shared/ui/shared-styles'

export class ImagePreview extends ReatomLitElement {
  static define() {
    if (!customElements.get('image-preview')) {
      customElements.define('image-preview', this)
    }
  }

  static get properties() {
    return {
      fileId: {type: Number},
      fileName: {type: String},
      mimeType: {type: String},
      lastModified: {type: Number, attribute: 'last-modified'},
    }
  }

  declare fileId: number
  declare fileName: string
  declare mimeType?: string
  declare lastModified?: number

  private model = new ImagePreviewModel()

  constructor() {
    super()
    this.fileId = 0
    this.fileName = ''
    this.mimeType = undefined
    this.lastModified = undefined
  }

  static styles = [
    motionPrimitiveStyles,
    skeletonShimmerStyles,
    mediaPreviewStyles,
    css`
      :host {
        display: contents;
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
    `,
  ]

  connectedCallback() {
    super.connectedCallback()
    this.model.setFile(this.fileId, this.fileName, this.mimeType, this.lastModified)
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
      changedProperties.has('lastModified')
    ) {
      this.model.setFile(this.fileId, this.fileName, this.mimeType, this.lastModified)
    }
  }

  private handleImageLoad(e: Event) {
    const img = e.currentTarget as HTMLImageElement
    const dims: ImageDimensions = {
      width: img.naturalWidth,
      height: img.naturalHeight,
    }
    if (!this.model.handleImageLoad(img.currentSrc || img.src, dims)) {
      return
    }

    this.dispatchEvent(
      new CustomEvent('dimensions-loaded', {
        detail: dims,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private handleImageError(e: Event) {
    const img = e.currentTarget as HTMLImageElement
    this.model.handleImageRenderError(img.currentSrc || img.src)
  }

  private handleRetry() {
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
                    <cv-button unstyled class="retry-button" @click=${this.handleRetry}>
                      ${i18n('button:retry' as any)}
                    </cv-button>
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
