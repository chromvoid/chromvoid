import {computed} from '@reatom/core'
import {ImageGallerySessionModel} from './gallery-session.model'
import type {
  GalleryDisplayWindowSnapshot,
  GalleryImage,
  GalleryPanelSnapshot,
  GalleryResourceDebugSnapshot,
  GalleryThumbnailVirtualWindow,
} from './gallery.types'

export type MobileGalleryTrackSlotSnapshot = {
  imageIndex: number
  imageId: number | null
  src: string | null
  loading: boolean
  error?: string | null
}

type NavigationDirection = -1 | 0 | 1
type NavigateOptions = {
  syncThumbnailCenter?: boolean
}

function toDirection(delta: number): NavigationDirection {
  if (delta > 0) return 1
  if (delta < 0) return -1
  return 0
}

function toPanelRole(index: number, currentIndex: number): GalleryPanelSnapshot['role'] {
  if (index < currentIndex) return 'previous'
  if (index > currentIndex) return 'next'
  return 'current'
}

export class ImageGalleryViewerModel {
  readonly session = new ImageGallerySessionModel()
  readonly currentImageUrl = computed(
    () => this.session.currentPanel().src,
    'media.imageGallery.currentImageUrl',
  )
  readonly currentImageError = computed(
    () => this.session.currentPanel().error,
    'media.imageGallery.currentImageError',
  )
  readonly loading = computed(() => this.session.currentPanel().loading, 'media.imageGallery.loading')
  readonly loadingImageIds = this.session.loadingImageIds

  setImages(images: GalleryImage[], currentIndex: number) {
    this.session.setImages(images, currentIndex)
  }

  open(images: GalleryImage[], currentIndex: number) {
    this.session.open(images, currentIndex)
  }

  syncImages(images: GalleryImage[], currentIndex: number) {
    this.session.syncImages(images, currentIndex)
  }

  async loadCurrentImage() {
    await this.session.loadCurrent()
  }

  preloadAdjacentImages() {
    this.session.primeDirectionalNeighbor(this.session.lastDirection())
  }

  navigate(index: number, options?: NavigateOptions) {
    this.session.navigate(index, options)
  }

  isImageLoading(index: number): boolean {
    const image = this.session.images()[index]
    if (!image) return false
    return this.loadingImageIds().includes(image.id)
  }

  primeImage(index: number) {
    const currentIndex = this.session.currentIndex()
    const image = this.session.images()[index]
    if (!image) return

    if (index === currentIndex) {
      void this.session.loadCurrent()
      return
    }

    const direction = toDirection(index - currentIndex)
    if (Math.abs(index - currentIndex) === 1 && direction !== 0) {
      this.session.primeDirectionalNeighbor(direction)
      return
    }

    this.session.primeThumbnailWindow(index, 0)
  }

  primeThumbnailWindow(centerIndex: number, visibleRadius: number) {
    this.session.primeThumbnailWindow(centerIndex, visibleRadius)
  }

  primeThumbnailVirtualWindow(centerIndex: number) {
    this.session.primeThumbnailVirtualWindow(centerIndex)
  }

  setThumbnailViewportMetrics(metrics: {viewportWidth: number; thumbnailStepPx: number}) {
    this.session.setThumbnailViewportMetrics(metrics)
  }

  setThumbnailScrollCenterIndex(index: number) {
    this.session.setThumbnailScrollCenterIndex(index)
  }

  setThumbnailProgrammaticScrollCenterIndex(index: number) {
    this.session.setThumbnailProgrammaticScrollCenterIndex(index)
  }

  getThumbnailVirtualWindow(): GalleryThumbnailVirtualWindow {
    return this.session.getThumbnailVirtualWindow()
  }

  getDisplayWindowSnapshot(): GalleryDisplayWindowSnapshot {
    return this.session.getDisplayWindowSnapshot()
  }

  peekThumbnailStripUrl(index: number): string | null {
    return this.session.getThumbnailSnapshot(index).src
  }

  peekVisiblePanelUrl(index: number): string | null {
    const currentIndex = this.session.currentIndex()
    return this.session.getPanelSnapshot(index, toPanelRole(index, currentIndex)).src
  }

  captureVisibleTrackSlot(index: number): MobileGalleryTrackSlotSnapshot | null {
    const currentIndex = this.session.currentIndex()
    const snapshot = this.session.getPanelSnapshot(index, toPanelRole(index, currentIndex))
    if (snapshot.imageIndex === null) {
      return null
    }

    return {
      imageIndex: snapshot.imageIndex,
      imageId: snapshot.imageId,
      src: snapshot.src,
      loading: snapshot.loading,
      ...(snapshot.error ? {error: snapshot.error} : {}),
    }
  }

  handleImageRenderError(imageId: number | null, sourceUrl: string | null) {
    this.session.handleImageRenderError(imageId, sourceUrl)
  }

  handleThumbnailRenderError(imageId: number | null, sourceUrl: string | null) {
    this.session.handleThumbnailRenderError(imageId, sourceUrl)
  }

  getDebugSnapshot(): GalleryResourceDebugSnapshot {
    return this.session.getDebugSnapshot()
  }

  close() {
    this.session.close()
  }
}
