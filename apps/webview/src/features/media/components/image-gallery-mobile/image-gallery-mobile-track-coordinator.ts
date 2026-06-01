import type {ImageGalleryMobileModel, SwipeDirection} from './image-gallery-mobile.model'
import type {MobileTrackAnimationController} from './image-gallery-mobile-track-animation-controller'

export type MobileGalleryTrackHost = {
  updateComplete: Promise<unknown>
}

export type MobileGalleryTrackCoordinatorDeps = {
  mobileModel: ImageGalleryMobileModel
  trackAnimation: MobileTrackAnimationController
  getTrackHost: () => MobileGalleryTrackHost | null
  navigate: (index: number) => void
  emitNavigate: (index: number) => void
  primeNavigationStrip: () => void
  refreshTrackSlots: () => void
  startThumbnailFollow: () => boolean
  log: (event: string, meta?: Record<string, unknown>) => void
}

export class MobileGalleryTrackCoordinator {
  private pendingTrackResetAfterCommit = false
  private pendingQueuedSettleDirection: SwipeDirection = 0
  private flushingTrackResetAfterCommit = false
  private version = 0

  constructor(private readonly deps: MobileGalleryTrackCoordinatorDeps) {}

  startSettle(direction: SwipeDirection): void {
    this.deps.log('settle.start', {direction})
    this.deps.trackAnimation.startSettle(direction, () => this.finishSettle())
  }

  finishSettle(): void {
    const {committedIndex, nextDirection} = this.deps.mobileModel.finishSettling()
    this.deps.log('settle.finish', {committedIndex, nextDirection})
    if (committedIndex !== null) {
      this.deps.startThumbnailFollow()
      this.deps.navigate(committedIndex)
      this.deps.emitNavigate(committedIndex)
      this.deps.primeNavigationStrip()
      this.queueResetAfterCommit(nextDirection)
      return
    }

    this.deps.trackAnimation.resetPosition()

    if (nextDirection !== 0) {
      this.startSettle(nextDirection)
    }
  }

  queueResetAfterCommit(nextDirection: SwipeDirection): void {
    this.pendingTrackResetAfterCommit = true
    this.pendingQueuedSettleDirection = nextDirection
  }

  async flushAfterRender(): Promise<void> {
    if (!this.pendingTrackResetAfterCommit || this.flushingTrackResetAfterCommit) {
      return
    }

    const version = this.version
    this.flushingTrackResetAfterCommit = true
    this.pendingTrackResetAfterCommit = false
    const nextDirection = this.pendingQueuedSettleDirection
    this.pendingQueuedSettleDirection = 0
    this.deps.log('track-reset.flush-start', {nextDirection})

    try {
      await this.deps.getTrackHost()?.updateComplete
      if (version !== this.version) {
        return
      }

      this.deps.trackAnimation.resetPosition()

      if (nextDirection === 0) {
        this.deps.refreshTrackSlots()
        this.deps.log('track-reset.done', {nextDirection})
        return
      }

      this.deps.refreshTrackSlots()
      this.deps.trackAnimation.forceLayout()
      this.deps.mobileModel.beginSettling(nextDirection)
      this.startSettle(nextDirection)
      this.deps.log('track-reset.queue-settle', {nextDirection})
    } finally {
      if (version === this.version) {
        this.flushingTrackResetAfterCommit = false
      }
    }
  }

  playEdgeNudge(direction: SwipeDirection): void {
    if (direction === 0 || this.deps.mobileModel.state.gestureState() !== 'idle') {
      return
    }

    this.deps.trackAnimation.playEdgeNudge(direction, () => {
      this.deps.mobileModel.beginSettling(0)
      this.startSettle(0)
    })
  }

  teardown(): void {
    this.version += 1
    this.pendingTrackResetAfterCommit = false
    this.pendingQueuedSettleDirection = 0
    this.flushingTrackResetAfterCommit = false
    this.deps.trackAnimation.teardown()
  }
}
