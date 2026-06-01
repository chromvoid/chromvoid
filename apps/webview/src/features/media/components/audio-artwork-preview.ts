import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {css} from 'lit'

import {
  AudioArtworkPreviewModel,
  type AudioArtworkVariant,
} from './audio-artwork-preview.model'

export class AudioArtworkPreview extends ReatomLitElement {
  static elementName = 'audio-artwork-preview'

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
  }

  static get properties() {
    return {
      fileId: {type: Number},
      fileName: {type: String},
      mimeType: {type: String},
      lastModified: {type: Number, attribute: 'last-modified'},
      sourceSize: {type: Number, attribute: 'source-size'},
      sourceRevision: {type: Number, attribute: 'source-revision'},
      variant: {type: String, reflect: true},
      fallbackIcon: {type: String, attribute: 'fallback-icon'},
      loadEnabled: {type: Boolean, attribute: 'load-enabled'},
    }
  }

  declare fileId: number
  declare fileName: string
  declare mimeType?: string
  declare lastModified?: number
  declare sourceSize?: number
  declare sourceRevision?: number
  declare variant: AudioArtworkVariant
  declare fallbackIcon: string
  declare loadEnabled: boolean

  private model = new AudioArtworkPreviewModel()

  constructor() {
    super()
    this.fileId = 0
    this.fileName = ''
    this.mimeType = undefined
    this.lastModified = undefined
    this.sourceSize = undefined
    this.sourceRevision = undefined
    this.variant = 'preview-image'
    this.fallbackIcon = 'music-note-beamed'
    this.loadEnabled = true
  }

  static styles = css`
    :host {
      display: block;
      inline-size: 100%;
      block-size: 100%;
      min-inline-size: 0;
      min-block-size: 0;
      contain: content;
    }

    .artwork-shell {
      box-sizing: border-box;
      inline-size: 100%;
      block-size: 100%;
      min-block-size: inherit;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border: 1px solid var(--cv-color-border-soft);
      border-radius: var(--cv-radius-2);
      background: var(--cv-color-surface-secondary-glass);
      color: var(--cv-color-primary);
    }

    slot[name='fallback'] {
      display: contents;
    }

    :host([variant='preview-image']) .artwork-shell {
      border-radius: var(--cv-radius-3);
      box-shadow:
        inset 0 0 0 1px var(--cv-alpha-white-6),
        var(--cv-shadow-2);
    }

    .artwork-image {
      inline-size: 100%;
      block-size: 100%;
      object-fit: cover;
      display: block;
    }

    .fallback-icon {
      opacity: 0.9;
    }
  `

  connectedCallback() {
    super.connectedCallback()
    this.syncTarget()
  }

  disconnectedCallback() {
    this.model.cleanup()
    super.disconnectedCallback()
  }

  updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties)
    if (
      changedProperties.has('fileId') ||
      changedProperties.has('fileName') ||
      changedProperties.has('mimeType') ||
      changedProperties.has('lastModified') ||
      changedProperties.has('sourceSize') ||
      changedProperties.has('sourceRevision') ||
      changedProperties.has('variant') ||
      changedProperties.has('loadEnabled')
    ) {
      this.syncTarget()
    }
  }

  private syncTarget() {
    this.model.setTarget({
      fileId: this.fileId,
      fileName: this.fileName,
      mimeType: this.mimeType,
      lastModified: this.lastModified,
      sourceSize: this.sourceSize,
      sourceRevision: this.sourceRevision,
      variant: this.variant,
      loadEnabled: this.loadEnabled,
    })
  }

  private handleImageError(e: Event) {
    const image = e.currentTarget as HTMLImageElement
    this.model.handleImageRenderError(image.currentSrc || image.src)
  }

  protected render() {
    const artworkUrl = this.model.artworkUrl()
    const loadingState = this.model.loadingState()

    return html`
      ${artworkUrl
        ? html`
            <div class="artwork-shell" data-state=${loadingState} aria-hidden="true">
              <img
                class="artwork-image"
                src=${artworkUrl}
                alt=""
                decoding="async"
                loading="lazy"
                @error=${this.handleImageError}
              />
            </div>
          `
        : html`
            <slot name="fallback">
              <div class="artwork-shell" data-state=${loadingState} aria-hidden="true">
                <cv-icon class="fallback-icon" name=${this.fallbackIcon} size="m"></cv-icon>
              </div>
            </slot>
          `}
    `
  }
}

AudioArtworkPreview.define()

declare global {
  interface HTMLElementTagNameMap {
    'audio-artwork-preview': AudioArtworkPreview
  }
}
