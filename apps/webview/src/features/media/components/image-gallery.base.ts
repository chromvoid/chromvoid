import {XLitElement} from '@statx/lit'
import {ImageGalleryModel, type GalleryImage} from './image-gallery.model'

export {type GalleryImage} from './image-gallery.model'

export class ImageGalleryBase extends XLitElement {
  static get properties() {
    return {
      images: {type: Array},
      currentIndex: {type: Number},
      open: {type: Boolean},
    }
  }

  declare images: GalleryImage[]
  declare currentIndex: number
  declare open: boolean

  protected model = new ImageGalleryModel()
  protected previousFocus: HTMLElement | null = null

  constructor() {
    super()
    this.images = []
    this.currentIndex = 0
    this.open = false
  }

  connectedCallback() {
    super.connectedCallback()
    if (this.open) {
      this.onSetup()
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this.onTeardown()
  }

  updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties)
    if (changedProperties.has('open')) {
      if (this.open) {
        this.onSetup()
      } else {
        this.onTeardown()
      }
    }

    if ((changedProperties.has('currentIndex') || changedProperties.has('images')) && this.open) {
      this.onImagesUpdated()
    }
  }

  protected onSetup() {
    document.body.style.overflow = 'hidden'
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    this.model.setImages(this.images, this.currentIndex)
    this.model.loadCurrentImage()
    this.model.preloadAdjacentImages()
  }

  protected onTeardown() {
    document.body.style.overflow = ''
    this.model.cleanup()

    if (this.previousFocus && typeof this.previousFocus.focus === 'function') {
      try {
        this.previousFocus.focus()
      } catch {}
    }
    this.previousFocus = null
  }

  protected onImagesUpdated() {
    this.model.setImages(this.images, this.currentIndex)
    this.model.loadCurrentImage()
    this.model.preloadAdjacentImages()
  }

  protected close() {
    this.dispatchEvent(new CustomEvent('close', {bubbles: true, composed: true}))
  }

  protected emitNavigate(index: number) {
    const direction = index > this.currentIndex ? 'forward' : 'backward'
    this.dispatchEvent(
      new CustomEvent('navigate', {
        detail: {index, direction},
        bubbles: true,
        composed: true,
      }),
    )
  }
}
