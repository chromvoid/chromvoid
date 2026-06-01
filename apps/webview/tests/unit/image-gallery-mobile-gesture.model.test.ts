import {describe, expect, it} from 'vitest'

import {
  ImageGalleryMobileGestureModel,
  type GalleryRect,
  type GalleryTouchPoint,
} from '../../src/features/media/components/image-gallery-mobile/image-gallery-mobile-gesture.model'
import {
  ImageGalleryMobileTrackModel,
  type MobileGalleryTrackSlotSnapshot,
} from '../../src/features/media/components/image-gallery-mobile/image-gallery-mobile-track.model'

const RECT: GalleryRect = {
  left: 0,
  top: 0,
  width: 240,
  height: 360,
}
const IMAGE_TRANSITION = 'transform 0.18s ease-out'

function point(clientX: number, clientY: number): GalleryTouchPoint {
  return {clientX, clientY}
}

function trackSnapshot(index: number): MobileGalleryTrackSlotSnapshot | null {
  if (index < 0 || index > 9) {
    return null
  }

  return {
    imageIndex: index,
    imageId: index + 1,
    src: `slot:${index}`,
    loading: false,
    error: null,
  }
}

function createHarness() {
  const trackModel = new ImageGalleryMobileTrackModel()
  trackModel.setup(5, 2, trackSnapshot)

  let gestureModel: ImageGalleryMobileGestureModel | null = null
  const getGestureModel = () => {
    if (!gestureModel) {
      throw new Error('Gesture model was used before initialization')
    }
    return gestureModel
  }

  gestureModel = new ImageGalleryMobileGestureModel({
    getImageCount: () => trackModel.state.imageCount(),
    getDisplayIndex: () => trackModel.state.displayIndex(),
    getActiveSettleDirection: () => trackModel.state.activeSettleDirection(),
    lockTrackSlots: () => trackModel.lockTrackSlots(),
    refreshUnlockedSlots: () =>
      trackModel.refreshUnlockedSlots(getGestureModel().state.gestureState() === 'idle'),
    beginTrackSettling: (direction) => trackModel.beginSettling(direction),
    finishTrackSettling: () => trackModel.finishSettling(),
    enqueueDirection: (direction, wasSettling) => trackModel.enqueueDirection(direction, wasSettling),
    getPrimeTargetsForDirection: (direction, isDirectDrag) =>
      trackModel.getPrimeTargetsForDirection(direction, isDirectDrag),
    commitDirectNavigation: (index) => {
      const targetIndex = trackModel.commitDirectNavigation(
        index,
        getGestureModel().computed.hasPendingLocalNavigation(),
      )
      if (targetIndex !== null) {
        getGestureModel().resetZoomState()
        getGestureModel().showChrome()
      }
      return targetIndex
    },
  })

  return {
    gestureModel,
    trackModel,
  }
}

describe('image-gallery-v2/mobile-gallery-gesture.model', () => {
  it('finishes a no-op settle without changing display index or queued direction', () => {
    const {gestureModel, trackModel} = createHarness()

    trackModel.enqueueDirection(1, true)
    gestureModel.beginSettling(0)

    expect(trackModel.state.displayIndex()).toBe(2)
    expect(trackModel.state.queuedDirection()).toBe(1)
    expect(gestureModel.finishSettling()).toEqual({committedIndex: null, nextDirection: 0})
    expect(trackModel.state.displayIndex()).toBe(2)
    expect(trackModel.state.queuedDirection()).toBe(1)
    expect(gestureModel.state.gestureState()).toBe('idle')
  })

  it('toggles zoom on a direct double tap without changing the track index', () => {
    const {gestureModel, trackModel} = createHarness()

    expect(gestureModel.registerTap(point(120, 180), 0, RECT)).toBe('single')
    expect(gestureModel.registerTap(point(124, 182), 80, RECT)).toBe('double')
    expect(gestureModel.state.zoomScale()).toBeGreaterThan(1)
    expect(gestureModel.computed.dynamicStyles().imageTransition).toBe(IMAGE_TRANSITION)
    expect(trackModel.state.displayIndex()).toBe(2)

    expect(gestureModel.registerTap(point(120, 180), 400, RECT)).toBe('single')
    expect(gestureModel.registerTap(point(124, 182), 480, RECT)).toBe('double')
    expect(gestureModel.state.zoomScale()).toBe(1)
    expect(gestureModel.computed.dynamicStyles().imageTransition).toBe(IMAGE_TRANSITION)
    expect(trackModel.state.displayIndex()).toBe(2)
  })

  it('disables image transition only during a live pinch gesture', () => {
    const {gestureModel} = createHarness()

    expect(gestureModel.computed.dynamicStyles().imageTransition).toBe(IMAGE_TRANSITION)

    expect(gestureModel.beginTouch([point(100, 180), point(140, 180)], 0).mode).toBe('pinch')
    expect(gestureModel.computed.dynamicStyles().imageTransition).toBe('none')

    gestureModel.moveTouch([point(80, 180), point(160, 180)], RECT)

    expect(gestureModel.state.zoomScale()).toBeCloseTo(2)
    expect(gestureModel.computed.dynamicStyles().imageTransition).toBe('none')

    expect(gestureModel.endTouch(null, 40)).toMatchObject({
      close: false,
      scheduleTap: null,
      startSettle: null,
    })
    expect(gestureModel.state.zoomScale()).toBeCloseTo(2)
    expect(gestureModel.computed.dynamicStyles().imageTransition).toBe(IMAGE_TRANSITION)
  })

  it('disables image transition only while panning a zoomed image', () => {
    const {gestureModel} = createHarness()

    expect(gestureModel.registerTap(point(120, 180), 0, RECT)).toBe('single')
    expect(gestureModel.registerTap(point(124, 182), 80, RECT)).toBe('double')
    expect(gestureModel.computed.dynamicStyles().imageTransition).toBe(IMAGE_TRANSITION)

    expect(gestureModel.beginTouch([point(120, 180)], 100).mode).toBe('pan')
    expect(gestureModel.computed.dynamicStyles().imageTransition).toBe('none')

    gestureModel.moveTouch([point(140, 190)], RECT)

    expect(gestureModel.computed.dynamicStyles().imageTransition).toBe('none')

    expect(gestureModel.endTouch(point(140, 190), 140)).toMatchObject({
      close: false,
      scheduleTap: null,
      startSettle: null,
    })
    expect(gestureModel.computed.dynamicStyles().imageTransition).toBe(IMAGE_TRANSITION)
  })
})
