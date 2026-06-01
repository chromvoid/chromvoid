import {describe, expect, it, vi} from 'vitest'

import {MobileGalleryThumbnailFollowCoordinator} from '../../src/features/media/components/image-gallery-mobile/image-gallery-mobile-thumbnail-follow-coordinator'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return {promise, resolve}
}

describe('mobile gallery thumbnail follow coordinator', () => {
  it('consumes the pending request only after a successful scroll retry', async () => {
    const consume = vi.fn()
    const scrollThumbnailIntoView = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true)
    const mobileModel = {
      getPendingThumbnailStripFollow: vi.fn(() => ({index: 4, behavior: 'smooth' as ScrollBehavior})),
      consumePendingThumbnailStripFollow: consume,
    }
    const coordinator = new MobileGalleryThumbnailFollowCoordinator({
      mobileModel: mobileModel as any,
      getHost: () => ({
        updateComplete: Promise.resolve(),
        scrollThumbnailIntoView,
      }),
      log: vi.fn(),
    })

    expect(coordinator.start()).toBe(false)
    expect(consume).not.toHaveBeenCalled()

    await coordinator.flushAfterRender()

    expect(scrollThumbnailIntoView).toHaveBeenCalledTimes(2)
    expect(consume).toHaveBeenCalledTimes(1)
  })

  it('does not retry after teardown while an update is pending', async () => {
    const update = deferred<void>()
    const scrollThumbnailIntoView = vi.fn()
    const mobileModel = {
      getPendingThumbnailStripFollow: vi.fn(() => ({index: 2, behavior: 'auto' as ScrollBehavior})),
      consumePendingThumbnailStripFollow: vi.fn(),
    }
    const coordinator = new MobileGalleryThumbnailFollowCoordinator({
      mobileModel: mobileModel as any,
      getHost: () => ({
        updateComplete: update.promise,
        scrollThumbnailIntoView,
      }),
      log: vi.fn(),
    })

    const flush = coordinator.flushAfterRender()
    coordinator.teardown()
    update.resolve()
    await flush

    expect(scrollThumbnailIntoView).not.toHaveBeenCalled()
    expect(mobileModel.consumePendingThumbnailStripFollow).not.toHaveBeenCalled()
  })
})
