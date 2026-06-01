type ThumbnailStripFollowControllerDeps = {
  thumbnailStepPx: number
  getImageCount: () => number
  onComplete: (index: number) => void
  prefersReducedMotion?: () => boolean
  requestAnimationFrame?: typeof requestAnimationFrame
  cancelAnimationFrame?: typeof cancelAnimationFrame
}

type ThumbnailStripFollowRequest = {
  strip: HTMLElement
  index: number
  behavior: ScrollBehavior
  thumbnailWidthPx?: number
}

const FOLLOW_DURATION_MS = 320
const DEFAULT_THUMBNAIL_WIDTH_PX = 56

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max))
}

function easeOutCubic(progress: number): number {
  return 1 - Math.pow(1 - progress, 3)
}

function getPrefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export class MobileThumbnailStripFollowController {
  private frameId = 0
  private animationToken = 0

  constructor(private readonly deps: ThumbnailStripFollowControllerDeps) {}

  isAnimating(): boolean {
    return this.frameId !== 0
  }

  start(request: ThumbnailStripFollowRequest): boolean {
    const imageCount = this.deps.getImageCount()
    if (imageCount <= 0) {
      return false
    }

    this.cancel()

    const targetIndex = clamp(request.index, 0, imageCount - 1)
    const targetLeft = this.getTargetScrollLeft(request.strip, targetIndex, request.thumbnailWidthPx)
    const startLeft = request.strip.scrollLeft
    const distance = targetLeft - startLeft

    if (
      request.behavior !== 'smooth' ||
      Math.abs(distance) < 1 ||
      (this.deps.prefersReducedMotion ?? getPrefersReducedMotion)()
    ) {
      this.setScrollLeft(request.strip, targetLeft)
      this.complete(targetIndex)
      return true
    }

    const requestFrame = this.deps.requestAnimationFrame ?? requestAnimationFrame
    const token = ++this.animationToken
    let startedAt: number | null = null

    const tick = (timestamp: number) => {
      if (this.animationToken !== token) {
        return
      }

      startedAt ??= timestamp
      const progress = clamp((timestamp - startedAt) / FOLLOW_DURATION_MS, 0, 1)
      const easedProgress = easeOutCubic(progress)
      this.setScrollLeft(request.strip, startLeft + distance * easedProgress)

      if (progress < 1) {
        this.frameId = requestFrame(tick)
        return
      }

      this.setScrollLeft(request.strip, targetLeft)
      this.frameId = 0
      this.complete(targetIndex)
    }

    this.frameId = requestFrame(tick)
    return true
  }

  cancel(): void {
    if (!this.frameId) {
      return
    }

    const cancelFrame = this.deps.cancelAnimationFrame ?? cancelAnimationFrame
    cancelFrame(this.frameId)
    this.frameId = 0
    this.animationToken += 1
  }

  teardown(): void {
    this.cancel()
  }

  private complete(targetIndex: number): void {
    this.deps.onComplete(targetIndex)
  }

  private setScrollLeft(strip: HTMLElement, scrollLeft: number): void {
    strip.scrollLeft = scrollLeft
  }

  private getTargetScrollLeft(strip: HTMLElement, index: number, thumbnailWidthPx?: number): number {
    const viewportWidth = this.getViewportWidth(strip)
    const thumbnailWidth = Math.max(1, thumbnailWidthPx ?? DEFAULT_THUMBNAIL_WIDTH_PX)
    const fallbackScrollWidth = this.deps.getImageCount() * this.deps.thumbnailStepPx
    const scrollWidth = Math.max(strip.scrollWidth, fallbackScrollWidth)
    const maxScrollLeft = Math.max(0, scrollWidth - viewportWidth)
    const targetLeft = index * this.deps.thumbnailStepPx - (viewportWidth - thumbnailWidth) / 2

    return clamp(targetLeft, 0, maxScrollLeft)
  }

  private getViewportWidth(strip: HTMLElement): number {
    return Math.max(1, strip.clientWidth || this.deps.thumbnailStepPx)
  }
}
