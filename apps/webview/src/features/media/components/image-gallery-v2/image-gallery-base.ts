import {ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {ImageGalleryViewerModel} from './gallery-viewer.model'
import type {GalleryCloseReason, GalleryImage, ImageViewerAction} from './gallery.types'

export type {
  GalleryActionDetail,
  GalleryCloseDetail,
  GalleryCloseReason,
  GalleryImage,
  GalleryNavigateDetail,
  ImageViewerAction,
} from './gallery.types'

export class ImageGalleryBase extends ReatomLitElement {
  static get properties() {
    return {
      images: {type: Array},
      currentIndex: {type: Number},
      open: {type: Boolean},
      sharePending: {type: Boolean, attribute: 'share-pending'},
    }
  }

  declare images: GalleryImage[]
  declare currentIndex: number
  declare open: boolean
  declare sharePending: boolean

  protected model = new ImageGalleryViewerModel()
  private gallerySetupActive = false

  constructor() {
    super()
    this.images = []
    this.currentIndex = 0
    this.open = false
    this.sharePending = false
  }

  connectedCallback() {
    super.connectedCallback()
    if (this.open) {
      this.ensureGallerySetup()
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this.ensureGalleryTeardown()
  }

  updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties)
    let openingThisUpdate = false

    if (changedProperties.has('open')) {
      if (this.open) {
        openingThisUpdate = true
        this.ensureGallerySetup()
      } else {
        this.ensureGalleryTeardown()
      }
    }

    if (
      !openingThisUpdate &&
      this.gallerySetupActive &&
      (changedProperties.has('currentIndex') || changedProperties.has('images'))
    ) {
      this.onImagesUpdated()
    }
  }

  private ensureGallerySetup(): boolean {
    if (this.gallerySetupActive) {
      return false
    }

    this.model.open(this.images, this.currentIndex)
    this.gallerySetupActive = true
    this.afterGallerySetup()
    return true
  }

  private ensureGalleryTeardown(): boolean {
    if (!this.gallerySetupActive) {
      return false
    }

    this.beforeGalleryTeardown()
    this.model.close()
    this.gallerySetupActive = false
    return true
  }

  protected afterGallerySetup() {}

  protected beforeGalleryTeardown() {}

  protected onImagesUpdated() {
    this.model.syncImages(this.images, this.currentIndex)
  }

  protected close(reason: GalleryCloseReason = 'control') {
    this.dispatchEvent(new CustomEvent('close', {detail: {reason}, bubbles: true, composed: true}))
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

  protected emitAction(action: ImageViewerAction, fileId: number) {
    this.dispatchEvent(
      new CustomEvent('action', {
        detail: {action, fileId},
        bubbles: true,
        composed: true,
      }),
    )
  }
}
