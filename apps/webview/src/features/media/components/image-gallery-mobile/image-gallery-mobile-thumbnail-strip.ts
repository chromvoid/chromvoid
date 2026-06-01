import {nothing} from 'lit'
import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {getLang, i18n} from 'root/i18n'
import type {ImageGalleryViewerModel} from '../image-gallery-v2/gallery-viewer.model'
import type {ImageGalleryMobileModel} from './image-gallery-mobile.model'
import {imageGalleryMobileThumbnailStripStyles} from './image-gallery-mobile.styles'
import {MobileThumbnailStripFollowController} from './image-gallery-mobile-thumbnail-strip-scroll-controller'
import type {MobileGalleryImageMeta} from './image-gallery-mobile.types'

const THUMBNAIL_STEP_PX = 64

export class ImageGalleryMobileThumbnailStrip extends ReatomLitElement {
  static elementName = 'image-gallery-mobile-thumbnail-strip'

  static get properties() {
    return {
      images: {attribute: false},
      galleryModel: {attribute: false},
      mobileModel: {attribute: false},
    }
  }

  static styles = imageGalleryMobileThumbnailStripStyles

  declare images: MobileGalleryImageMeta[]
  declare galleryModel: ImageGalleryViewerModel | null
  declare mobileModel: ImageGalleryMobileModel | null
  private readonly thumbnailFollowScroll: MobileThumbnailStripFollowController

  constructor() {
    super()
    this.images = []
    this.galleryModel = null
    this.mobileModel = null
    this.thumbnailFollowScroll = new MobileThumbnailStripFollowController({
      thumbnailStepPx: THUMBNAIL_STEP_PX,
      getImageCount: () => this.images.length,
      onComplete: (index) => {
        this.galleryModel?.setThumbnailProgrammaticScrollCenterIndex(index)
        this.galleryModel?.primeThumbnailVirtualWindow(index)
      },
    })
  }

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  override connectedCallback() {
    super.connectedCallback()
    this.syncViewportMetrics()
  }

  override disconnectedCallback() {
    this.thumbnailFollowScroll.teardown()
    super.disconnectedCallback()
  }

  override updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties)
    if (changedProperties.has('galleryModel')) {
      this.thumbnailFollowScroll.cancel()
      this.syncViewportMetrics()
    }
    this.syncVirtualSpacerProperties()
  }

  scrollThumbnailIntoView(index: number, behavior: ScrollBehavior) {
    const strip = this.renderRoot.querySelector<HTMLElement>('.thumbnail-strip')
    const requestedThumb = this.renderRoot.querySelector<HTMLElement>(`.thumb-button[data-index="${index}"]`)
    if (!strip || !Number.isInteger(index)) {
      return false
    }

    return this.thumbnailFollowScroll.start({
      strip,
      index,
      behavior,
      thumbnailWidthPx: requestedThumb?.clientWidth || undefined,
    })
  }

  private handleStripUserInput() {
    this.thumbnailFollowScroll.cancel()
  }

  private handleThumbnailClick(event: MouseEvent) {
    const button = (event.currentTarget as HTMLElement | null)?.closest<HTMLElement>('.thumb-button')
    const index = Number(button?.dataset['index'])
    if (!Number.isInteger(index)) {
      return
    }

    this.dispatchEvent(
      new CustomEvent('thumbnail-select', {
        detail: {index},
        bubbles: true,
        composed: true,
      }),
    )
  }

  private handleThumbnailImageError(event: Event) {
    const image = event.currentTarget as HTMLImageElement
    const imageId = Number(image.dataset['imageId'])
    this.galleryModel?.handleThumbnailRenderError(
      Number.isFinite(imageId) ? imageId : null,
      image.currentSrc || image.src,
    )
  }

  private handleStripScroll(event: Event) {
    const strip = event.currentTarget as HTMLElement | null
    if (!strip || !this.galleryModel) {
      return
    }

    this.galleryModel.setThumbnailViewportMetrics({
      viewportWidth: strip.clientWidth,
      thumbnailStepPx: THUMBNAIL_STEP_PX,
    })
    const viewportWidth = strip.clientWidth || THUMBNAIL_STEP_PX
    const centerIndex = Math.floor((strip.scrollLeft + viewportWidth / 2) / THUMBNAIL_STEP_PX)

    if (!this.thumbnailFollowScroll.isAnimating()) {
      this.galleryModel.setThumbnailScrollCenterIndex(centerIndex)
    }
  }

  private syncViewportMetrics() {
    if (!this.galleryModel) {
      return
    }

    const strip = this.renderRoot.querySelector<HTMLElement>('.thumbnail-strip')
    this.galleryModel.setThumbnailViewportMetrics({
      viewportWidth: strip?.clientWidth || THUMBNAIL_STEP_PX,
      thumbnailStepPx: THUMBNAIL_STEP_PX,
    })
  }

  private syncVirtualSpacerProperties() {
    const virtualWindow = this.galleryModel?.getThumbnailVirtualWindow()
    this.style.setProperty(
      '--thumbnail-before-spacer',
      `${(virtualWindow?.beforeCount ?? 0) * (virtualWindow?.thumbnailStepPx ?? THUMBNAIL_STEP_PX)}px`,
    )
    this.style.setProperty(
      '--thumbnail-after-spacer',
      `${(virtualWindow?.afterCount ?? 0) * (virtualWindow?.thumbnailStepPx ?? THUMBNAIL_STEP_PX)}px`,
    )
  }

  protected override render() {
    if (!this.galleryModel || !this.mobileModel) {
      return nothing
    }

    const displayIndex = this.mobileModel.state.displayIndex()
    const virtualWindow = this.galleryModel.getThumbnailVirtualWindow()
    this.galleryModel.loadingImageIds()

    return html`
      <div
        class="thumbnail-strip"
        role="tablist"
        aria-label=${i18n('media:image-viewer' as any)}
        @pointerdown=${this.handleStripUserInput}
        @touchstart=${this.handleStripUserInput}
        @wheel=${this.handleStripUserInput}
        @scroll=${this.handleStripScroll}
      >
        ${virtualWindow.indices.map((index) => {
          const image = this.images[index]
          if (!image) {
            return nothing
          }
          const cachedUrl = this.galleryModel?.peekThumbnailStripUrl(index)
          return html`
            <cv-button unstyled
              data-index=${String(index)}
              class="thumb-button ${index === displayIndex ? 'active' : ''}"
              @click=${this.handleThumbnailClick}
              role="tab"
              aria-selected=${String(index === displayIndex)}
              aria-posinset=${String(index + 1)}
              aria-setsize=${String(this.images.length)}
              aria-label=${String(image.name || index + 1)}
              lang=${getLang()}
            >
              ${cachedUrl
                ? html`<img
                    src=${cachedUrl}
                    alt=""
                    aria-hidden="true"
                    data-image-id=${String(image.id)}
                    decoding="async"
                    @error=${this.handleThumbnailImageError}
                  />`
                : html`<div class="thumb-placeholder">${index + 1}</div>`}
            </cv-button>
          `
        })}
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'image-gallery-mobile-thumbnail-strip': ImageGalleryMobileThumbnailStrip
  }
}
