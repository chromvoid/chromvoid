import {describe, expect, it, vi} from 'vitest'

import {MobileGalleryTrackCoordinator} from '../../src/features/media/components/image-gallery-mobile/image-gallery-mobile-track-coordinator'
import type {SwipeDirection} from '../../src/features/media/components/image-gallery-mobile/image-gallery-mobile.model'

function createCoordinator(options?: {
  finish?: {committedIndex: number | null; nextDirection: SwipeDirection}
  gestureState?: string
}) {
  const finish = options?.finish ?? {committedIndex: 3, nextDirection: 0 as SwipeDirection}
  const trackAnimation = {
    startSettle: vi.fn(),
    resetPosition: vi.fn(),
    forceLayout: vi.fn(),
    playEdgeNudge: vi.fn(),
    teardown: vi.fn(),
  }
  const mobileModel = {
    state: {
      gestureState: vi.fn(() => options?.gestureState ?? 'idle'),
    },
    finishSettling: vi.fn(() => finish),
    beginSettling: vi.fn(),
  }
  const deps = {
    mobileModel: mobileModel as any,
    trackAnimation: trackAnimation as any,
    getTrackHost: vi.fn(() => ({updateComplete: Promise.resolve()})),
    navigate: vi.fn(),
    emitNavigate: vi.fn(),
    primeNavigationStrip: vi.fn(),
    refreshTrackSlots: vi.fn(),
    startThumbnailFollow: vi.fn(),
    log: vi.fn(),
  }
  const coordinator = new MobileGalleryTrackCoordinator(deps)
  return {coordinator, deps, trackAnimation, mobileModel}
}

describe('mobile gallery track coordinator', () => {
  it('commits settle navigation and queues track reset after render', async () => {
    const {coordinator, deps, trackAnimation} = createCoordinator({
      finish: {committedIndex: 3, nextDirection: 0},
    })

    coordinator.startSettle(1)
    const finish = trackAnimation.startSettle.mock.calls[0]?.[1] as () => void
    finish()

    expect(deps.startThumbnailFollow).toHaveBeenCalledTimes(1)
    expect(deps.navigate).toHaveBeenCalledWith(3)
    expect(deps.emitNavigate).toHaveBeenCalledWith(3)
    expect(deps.primeNavigationStrip).toHaveBeenCalledTimes(1)

    await coordinator.flushAfterRender()

    expect(trackAnimation.resetPosition).toHaveBeenCalledTimes(1)
    expect(deps.refreshTrackSlots).toHaveBeenCalledTimes(1)
  })

  it('starts a queued settle after the committed reset renders', async () => {
    const {coordinator, trackAnimation, mobileModel} = createCoordinator({
      finish: {committedIndex: 1, nextDirection: 1},
    })

    coordinator.startSettle(1)
    const finish = trackAnimation.startSettle.mock.calls[0]?.[1] as () => void
    finish()
    await coordinator.flushAfterRender()

    expect(trackAnimation.forceLayout).toHaveBeenCalledTimes(1)
    expect(mobileModel.beginSettling).toHaveBeenCalledWith(1)
    expect(trackAnimation.startSettle).toHaveBeenCalledTimes(2)
  })

  it('resets the track for a no-op settle without emitting navigation', () => {
    const {coordinator, deps, trackAnimation} = createCoordinator({
      finish: {committedIndex: null, nextDirection: 0},
    })

    coordinator.startSettle(0)
    const finish = trackAnimation.startSettle.mock.calls[0]?.[1] as () => void
    finish()

    expect(trackAnimation.resetPosition).toHaveBeenCalledTimes(1)
    expect(deps.navigate).not.toHaveBeenCalled()
    expect(deps.emitNavigate).not.toHaveBeenCalled()
  })

  it('plays edge nudge only while idle and starts a no-op settle from the animation callback', () => {
    const {coordinator, trackAnimation, mobileModel} = createCoordinator({gestureState: 'idle'})

    coordinator.playEdgeNudge(-1)
    const onSettleStart = trackAnimation.playEdgeNudge.mock.calls[0]?.[1] as () => void
    onSettleStart()

    expect(mobileModel.beginSettling).toHaveBeenCalledWith(0)
    expect(trackAnimation.startSettle).toHaveBeenCalledWith(0, expect.any(Function))
  })
})
