import {state} from '@statx/core'
import {loadImageByFileId} from './image-loader'

export type GalleryImage = {
  id: number
  name: string
}

export class ImageGalleryModel {
  readonly currentImageUrl = state<string | null>(null)
  readonly loading = state(false)

  private preloadedUrls = new Map<number, string>()
  private missingIds = new Set<number>()
  private abortController: AbortController | null = null
  private images: GalleryImage[] = []
  private currentIndex = 0

  setImages(images: GalleryImage[], currentIndex: number) {
    this.images = images
    this.currentIndex = currentIndex
  }

  async loadCurrentImage() {
    const currentImage = this.images[this.currentIndex]
    if (!currentImage) return

    // If the node was deleted or is otherwise missing, avoid repeated download attempts.
    if (this.missingIds.has(currentImage.id)) {
      this.currentImageUrl.set(null)
      this.loading.set(false)
      return
    }

    // Check if already preloaded
    const preloaded = this.preloadedUrls.get(currentImage.id)
    if (preloaded) {
      this.currentImageUrl.set(preloaded)
      return
    }

    this.loading.set(true)
    this.abortController = new AbortController()

    try {
      const {url} = await loadImageByFileId(currentImage.id, currentImage.name, {
        signal: this.abortController.signal,
      })

      this.currentImageUrl.set(url)
      this.loading.set(false)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }

      const msg = error instanceof Error ? error.message : String(error)
      if (msg.includes('NODE_NOT_FOUND') || msg.includes('Node not found')) {
        // User deleted the file or catalog changed while the gallery was open.
        // Treat this as a normal state transition, not an app error.
        this.missingIds.add(currentImage.id)
        this.currentImageUrl.set(null)
        this.loading.set(false)
        return
      }

      console.error('Failed to load image:', error)
      this.loading.set(false)
    }
  }

  private preloadTimer: ReturnType<typeof setTimeout> | null = null

  preloadAdjacentImages() {
    // Delay preloading to let the current image load first and avoid
    // competing for network/CPU on the main thread.
    if (this.preloadTimer) {
      clearTimeout(this.preloadTimer)
    }
    this.preloadTimer = setTimeout(() => {
      this.preloadTimer = null
      this.doPreloadAdjacent()
    }, 300)
  }

  private doPreloadAdjacent() {
    const prevIndex = this.currentIndex - 1
    const nextIndex = this.currentIndex + 1

    // Preload next first (more likely navigation direction)
    if (nextIndex < this.images.length) {
      const nextImage = this.images[nextIndex]
      if (nextImage && !this.preloadedUrls.has(nextImage.id)) {
        this.preloadImage(nextImage)
      }
    }

    // Preload previous
    if (prevIndex >= 0) {
      const prevImage = this.images[prevIndex]
      if (prevImage && !this.preloadedUrls.has(prevImage.id)) {
        this.preloadImage(prevImage)
      }
    }
  }

  private async preloadImage(image: GalleryImage) {
    if (this.missingIds.has(image.id)) return
    try {
      const {url} = await loadImageByFileId(image.id, image.name)
      this.preloadedUrls.set(image.id, url)
    } catch {
      // Silent fail for preloading
    }
  }

  peekCachedUrl(index: number): string | null {
    const image = this.images[index]
    if (!image) return null
    return this.preloadedUrls.get(image.id) ?? null
  }

  navigate(index: number) {
    if (index < 0 || index >= this.images.length) return
    this.currentIndex = index
    this.loadCurrentImage()
    this.preloadAdjacentImages()
  }

  cleanup() {
    if (this.preloadTimer) {
      clearTimeout(this.preloadTimer)
      this.preloadTimer = null
    }

    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }

    const url = this.currentImageUrl()
    if (url) {
      URL.revokeObjectURL(url)
      this.currentImageUrl.set(null)
    }

    this.preloadedUrls.forEach(url => URL.revokeObjectURL(url))
    this.preloadedUrls.clear()
    this.missingIds.clear()
  }
}
