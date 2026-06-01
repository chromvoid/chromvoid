import {afterEach, describe, expect, it, vi} from 'vitest'

import {MobileTrackAnimationController} from '../../src/features/media/components/image-gallery-mobile/image-gallery-mobile-track-animation-controller'

describe('mobile track animation controller', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('syncs drag transform through requestAnimationFrame', () => {
    const track = document.createElement('div')
    const controller = new MobileTrackAnimationController()
    controller.setTrackResolver(() => track)
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })

    controller.syncDrag(24)

    expect(track.style.transform).toBe('translateX(calc(-33.333% + 24px))')
  })

  it('starts settle, finishes on transitionend, and clears the fallback timer', () => {
    vi.useFakeTimers()
    const track = document.createElement('div')
    const controller = new MobileTrackAnimationController()
    const onFinish = vi.fn()
    controller.setTrackResolver(() => track)

    controller.startSettle(1, onFinish)

    expect(track.classList.contains('settling')).toBe(true)
    expect(track.style.transform).toBe('translateX(-66.666%)')

    track.dispatchEvent(new Event('transitionend'))
    expect(onFinish).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(350)
    expect(onFinish).toHaveBeenCalledTimes(1)
  })

  it('teardown cancels pending settle fallback', () => {
    vi.useFakeTimers()
    const track = document.createElement('div')
    const controller = new MobileTrackAnimationController()
    const onFinish = vi.fn()
    controller.setTrackResolver(() => track)

    controller.startSettle(1, onFinish)
    controller.teardown()
    vi.advanceTimersByTime(350)

    expect(onFinish).not.toHaveBeenCalled()
  })
})
