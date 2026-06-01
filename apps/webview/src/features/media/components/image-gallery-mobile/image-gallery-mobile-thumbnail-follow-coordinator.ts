import type {ImageGalleryMobileModel} from './image-gallery-mobile.model'

export type MobileGalleryThumbnailFollowHost = {
  updateComplete: Promise<unknown>
  scrollThumbnailIntoView(index: number, behavior: ScrollBehavior): boolean
}

export type MobileGalleryThumbnailFollowCoordinatorDeps = {
  mobileModel: ImageGalleryMobileModel
  getHost: () => MobileGalleryThumbnailFollowHost | null
  log: (event: string, meta?: Record<string, unknown>) => void
}

export class MobileGalleryThumbnailFollowCoordinator {
  private flushing = false
  private version = 0

  constructor(private readonly deps: MobileGalleryThumbnailFollowCoordinatorDeps) {}

  start(logFailure = false): boolean {
    const strip = this.deps.getHost()
    const request = this.deps.mobileModel.getPendingThumbnailStripFollow()
    if (!strip || !request) {
      return false
    }

    if (!strip.scrollThumbnailIntoView(request.index, request.behavior)) {
      if (logFailure) {
        this.deps.log('thumbnail-follow.failed', {
          index: request.index,
          behavior: request.behavior,
        })
      }
      return false
    }

    this.deps.mobileModel.consumePendingThumbnailStripFollow()
    this.deps.log('thumbnail-follow.done', {
      index: request.index,
      behavior: request.behavior,
    })
    return true
  }

  async flushAfterRender(): Promise<void> {
    if (this.flushing) {
      return
    }

    const strip = this.deps.getHost()
    const request = this.deps.mobileModel.getPendingThumbnailStripFollow()
    if (!strip || !request) {
      return
    }

    const version = this.version
    this.flushing = true

    try {
      await strip.updateComplete
      await Promise.resolve()
      if (version !== this.version) {
        return
      }

      if (!this.deps.mobileModel.getPendingThumbnailStripFollow()) {
        return
      }

      this.start(true)
    } finally {
      if (version === this.version) {
        this.flushing = false
      }
    }
  }

  teardown(): void {
    this.version += 1
    this.flushing = false
  }
}
