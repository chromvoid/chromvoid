import {describe, expect, it, vi} from 'vitest'

import {getMobileGalleryPhotoMetadataKey} from '../../src/features/media/components/image-gallery-mobile/image-gallery-mobile-metadata'
import {
  ImageGalleryMobileModel,
  type GalleryRect,
  type GalleryTouchPoint,
  type MobileGalleryTrackSlotSnapshot,
} from '../../src/features/media/components/image-gallery-mobile/image-gallery-mobile.model'
import type {MobileGalleryImageMeta} from '../../src/features/media/components/image-gallery-mobile/image-gallery-mobile.types'

const RECT: GalleryRect = {
  left: 0,
  top: 0,
  width: 240,
  height: 360,
}

function point(clientX: number, clientY: number): GalleryTouchPoint {
  return {clientX, clientY}
}

function swipe(model: ImageGalleryMobileModel, startX: number, endX: number, currentTime = 0) {
  model.beginTouch([point(startX, 24)], currentTime)
  model.moveTouch([point(endX, 24)], RECT)
  return model.endTouch(point(endX, 24), RECT, currentTime + 40)
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

function imageMeta(id: number, lastModified = 1000): MobileGalleryImageMeta {
  return {
    id,
    name: `${id}.jpg`,
    mimeType: 'image/jpeg',
    size: 1024,
    lastModified,
  }
}

describe('image-gallery-v2/mobile-gallery.model', () => {
  it('derives loader visibility in model-owned track slot state', () => {
    const loadingSnapshot = (index: number): MobileGalleryTrackSlotSnapshot | null => {
      if (index < 0 || index > 4) return null

      return {
        imageIndex: index,
        imageId: index + 1,
        src: null,
        loading: true,
        error: null,
      }
    }

    const model = new ImageGalleryMobileModel()
    model.setup(5, 2, loadingSnapshot)

    expect(model.computed.trackSlots()).toMatchObject([
      {role: 'previous', loading: true, loaderVisible: false},
      {role: 'current', loading: true, loaderVisible: true},
      {role: 'next', loading: true, loaderVisible: false},
    ])
  })

  it('sets up stable mobile slot ids and rebuilds them for direct navigation', () => {
    const model = new ImageGalleryMobileModel()
    model.setup(5, 2, trackSnapshot)

    expect(model.computed.trackSlots().map((slot) => slot.slotId)).toEqual(['left', 'center', 'right'])
    expect(model.computed.trackSlots().map((slot) => slot.role)).toEqual(['previous', 'current', 'next'])
    expect(model.computed.trackSlots().map((slot) => slot.src)).toEqual(['slot:1', 'slot:2', 'slot:3'])

    expect(model.commitDirectNavigation(4)).toBe(4)
    expect(model.computed.trackSlots().map((slot) => slot.slotId)).toEqual(['left', 'center', 'right'])
    expect(model.computed.trackSlots().map((slot) => slot.role)).toEqual(['previous', 'current', 'next'])
    expect(model.computed.trackSlots().map((slot) => slot.src)).toEqual(['slot:3', 'slot:4', null])
    expect(model.state.pendingRouteSyncIndices()).toEqual([4])
  })

  it('locks slots during drag and keeps their src stable while session assets change', () => {
    let useFreshSnapshots = false
    const mutableSnapshot = (index: number): MobileGalleryTrackSlotSnapshot | null => {
      const snapshot = trackSnapshot(index)
      if (!snapshot) return null

      return {
        ...snapshot,
        src: `${useFreshSnapshots ? 'fresh' : 'slot'}:${index}`,
      }
    }

    const model = new ImageGalleryMobileModel()
    model.setup(5, 2, mutableSnapshot)

    expect(model.beginTouch([point(120, 24)], 0).mode).toBe('drag')
    expect(model.computed.trackSlots().every((slot) => slot.locked)).toBe(true)

    useFreshSnapshots = true
    model.refreshUnlockedSlots()

    expect(model.computed.trackSlots().map((slot) => slot.src)).toEqual(['slot:1', 'slot:2', 'slot:3'])
  })

  it('rotates locked slots so the incoming neighbor becomes current before offscreen rebinding', () => {
    let useFreshSnapshots = false
    const mutableSnapshot = (index: number): MobileGalleryTrackSlotSnapshot | null => {
      const snapshot = trackSnapshot(index)
      if (!snapshot) return null

      return {
        ...snapshot,
        src: `${useFreshSnapshots ? 'fresh' : 'slot'}:${index}`,
      }
    }

    const model = new ImageGalleryMobileModel()
    model.setup(5, 1, mutableSnapshot)

    const before = model.computed.trackSlots()
    const incoming = before[2]
    expect(incoming?.slotId).toBe('right')
    expect(incoming?.src).toBe('slot:2')

    useFreshSnapshots = true
    expect(swipe(model, 120, 24).startSettle).toBe(1)
    expect(model.finishSettling()).toEqual({committedIndex: 2, nextDirection: 0})

    const rotated = model.computed.trackSlots()
    expect(rotated.map((slot) => slot.slotId)).toEqual(['center', 'right', 'left'])
    expect(rotated.map((slot) => slot.role)).toEqual(['previous', 'current', 'next'])
    expect(rotated[1]).toMatchObject({
      slotId: 'right',
      imageIndex: 2,
      src: 'slot:2',
      locked: true,
    })
    expect(rotated[2]).toMatchObject({
      slotId: 'left',
      imageIndex: 3,
      src: 'slot:0',
      locked: true,
    })

    model.refreshUnlockedSlots()

    const refreshed = model.computed.trackSlots()
    expect(refreshed[1]).toMatchObject({
      slotId: 'right',
      imageIndex: 2,
      src: 'slot:2',
      locked: true,
    })
    expect(refreshed[2]).toMatchObject({
      slotId: 'left',
      imageIndex: 3,
      src: 'fresh:3',
      locked: false,
    })
  })

  it('hydrates the promoted current slot when its preview loaded during a drag', () => {
    let targetLoaded = false
    const mutableSnapshot = (index: number): MobileGalleryTrackSlotSnapshot | null => {
      const snapshot = trackSnapshot(index)
      if (!snapshot) return null
      if (index !== 2) return snapshot

      return {
        ...snapshot,
        src: targetLoaded ? 'loaded:2' : null,
        loading: !targetLoaded,
      }
    }

    const model = new ImageGalleryMobileModel()
    model.setup(5, 1, mutableSnapshot)

    expect(model.computed.trackSlots()[2]).toMatchObject({
      role: 'next',
      imageIndex: 2,
      src: null,
      loading: true,
      loaderVisible: false,
    })

    expect(swipe(model, 120, 24).startSettle).toBe(1)
    targetLoaded = true
    expect(model.finishSettling()).toEqual({committedIndex: 2, nextDirection: 0})

    const currentSlot = model.computed.trackSlots().find((slot) => slot.role === 'current')
    expect(currentSlot).toMatchObject({
      imageIndex: 2,
      imageId: 3,
      src: 'loaded:2',
      loading: false,
      loaderVisible: false,
      locked: true,
    })
  })

  it('queues one future direction during settling and consumes route sync acknowledgements in order', () => {
    const model = new ImageGalleryMobileModel()
    model.setup(5, 0, trackSnapshot)

    expect(swipe(model, 120, 24).startSettle).toBe(1)
    swipe(model, 120, 24, 80)

    expect(model.state.queuedDirection()).toBe(1)
    const firstSettle = model.finishSettling()
    expect(firstSettle).toEqual({committedIndex: 1, nextDirection: 1})
    expect(model.state.gestureState()).toBe('idle')
    model.refreshUnlockedSlots()
    expect(model.computed.trackSlots()[2]).toMatchObject({
      role: 'next',
      imageIndex: 2,
      src: 'slot:2',
      locked: false,
    })

    model.beginSettling(firstSettle.nextDirection)
    expect(model.finishSettling()).toEqual({committedIndex: 2, nextDirection: 0})
    model.refreshUnlockedSlots()

    expect(model.state.displayIndex()).toBe(2)
    expect(model.state.pendingRouteSyncIndices()).toEqual([1, 2])
    expect(model.syncFromProps(5, 1, trackSnapshot)).toBe('keep-local')
    expect(model.state.pendingRouteSyncIndices()).toEqual([2])
    expect(model.syncFromProps(5, 2, trackSnapshot)).toBe('keep-local')
    expect(model.state.pendingRouteSyncIndices()).toEqual([])
  })

  it('does not replace consumed direct-navigation thumbnail follow with auto on route acknowledgement', () => {
    const model = new ImageGalleryMobileModel()
    model.setup(5, 1, trackSnapshot)

    expect(model.consumeThumbnailFollowRequest()).toEqual({index: 1, mode: 'auto'})
    expect(model.commitDirectNavigation(3)).toBe(3)
    expect(model.consumeThumbnailFollowRequest()).toEqual({index: 3, mode: 'smooth'})

    expect(model.syncFromProps(5, 3, trackSnapshot)).toBe('keep-local')
    expect(model.state.pendingRouteSyncIndices()).toEqual([])
    expect(model.state.thumbnailFollowRequest()).toBeNull()
  })

  it('does not replace consumed swipe thumbnail follow with auto on route acknowledgement', () => {
    const model = new ImageGalleryMobileModel()
    model.setup(5, 1, trackSnapshot)

    expect(model.consumeThumbnailFollowRequest()).toEqual({index: 1, mode: 'auto'})
    expect(swipe(model, 120, 24).startSettle).toBe(1)
    expect(model.finishSettling()).toEqual({committedIndex: 2, nextDirection: 0})
    expect(model.consumeThumbnailFollowRequest()).toEqual({index: 2, mode: 'smooth'})

    expect(model.syncFromProps(5, 2, trackSnapshot)).toBe('keep-local')
    expect(model.state.pendingRouteSyncIndices()).toEqual([])
    expect(model.state.thumbnailFollowRequest()).toBeNull()
  })

  it('external route sync resets local gesture state and rebuilds slots', () => {
    const model = new ImageGalleryMobileModel()
    model.setup(5, 1, trackSnapshot)

    expect(swipe(model, 120, 24).startSettle).toBe(1)
    expect(model.syncFromProps(5, 4, trackSnapshot)).toBe('external-sync')

    expect(model.state.displayIndex()).toBe(4)
    expect(model.state.gestureState()).toBe('idle')
    expect(model.state.activeSettleDirection()).toBe(0)
    expect(model.state.queuedDirection()).toBe(0)
    expect(model.computed.trackSlots().map((slot) => slot.src)).toEqual(['slot:3', 'slot:4', null])
  })

  it('refreshes a failed rendered slot from the model snapshot', () => {
    let failedImageId: number | null = null
    const snapshot = (index: number): MobileGalleryTrackSlotSnapshot | null => {
      const base = trackSnapshot(index)
      if (!base) return null
      if (base.imageId !== failedImageId) return base

      return {
        ...base,
        src: null,
        error: 'Unable to display image',
      }
    }
    const model = new ImageGalleryMobileModel()
    model.setup(5, 2, snapshot)

    failedImageId = 3
    model.handleImageRenderError(3)

    expect(model.computed.trackSlots()[1]).toMatchObject({
      imageId: 3,
      src: null,
      error: 'Unable to display image',
      locked: false,
    })
  })

  it('tracks zoom, dismiss, chrome, info sheet, and thumbnail follow state without DOM state', () => {
    const model = new ImageGalleryMobileModel()
    model.setup(5, 2, trackSnapshot)

    expect(model.state.thumbnailFollowRequest()).toEqual({index: 2, mode: 'auto'})
    expect(model.consumeThumbnailFollowRequest()).toEqual({index: 2, mode: 'auto'})
    expect(model.state.thumbnailFollowRequest()).toBeNull()

    model.toggleChrome()
    expect(model.state.chromeVisible()).toBe(false)

    model.openInfoSheet()
    expect(model.state.infoSheetOpen()).toBe(true)
    expect(model.state.chromeVisible()).toBe(true)

    expect(model.closeInfoSheet()).toBe(true)
    expect(model.state.infoSheetOpen()).toBe(false)

    model.openInfoSheet()
    expect(model.handleBack()).toBe('close-info-sheet')
    expect(model.state.infoSheetOpen()).toBe(false)
    expect(model.handleBack()).toBe('close-viewer')

    expect(model.registerTap(point(120, 80), 0, RECT)).toBe('single')
    expect(model.registerTap(point(124, 82), 80, RECT)).toBe('double')
    expect(model.state.zoomScale()).toBeGreaterThan(1)
    expect(model.state.displayIndex()).toBe(2)

    expect(model.registerTap(point(120, 80), 400, RECT)).toBe('single')
    expect(model.registerTap(point(124, 82), 480, RECT)).toBe('double')
    expect(model.state.zoomScale()).toBe(1)

    model.beginTouch([point(120, 48)], 600)
    model.moveTouch([point(132, 220)], RECT)
    expect(model.state.gestureState()).toBe('dismissing')
    expect(model.state.dismissOffsetY()).toBeGreaterThan(0)

    expect(model.cancelTouch()).toEqual({startSettle: null})
    expect(model.state.gestureState()).toBe('idle')
    expect(model.state.dismissOffsetY()).toBe(0)
  })

  it('loads photo metadata when the info sheet opens, reloads on explicit open, and skips passive repeats', async () => {
    const image = imageMeta(7)
    const loader = vi.fn(async (input: MobileGalleryImageMeta) => ({
      imageKey: getMobileGalleryPhotoMetadataKey(input),
      metadata: {
        width: 4000,
        height: 3000,
        cameraModel: 'EOS R6',
      },
    }))
    const model = new ImageGalleryMobileModel(loader)

    model.openInfoSheet(image)

    expect(model.state.infoSheetOpen()).toBe(true)
    expect(model.state.photoMetadataLoading()).toBe(true)
    await Promise.resolve()

    expect(model.state.photoMetadataLoading()).toBe(false)
    expect(model.state.photoMetadata()).toMatchObject({width: 4000, height: 3000, cameraModel: 'EOS R6'})
    expect(model.state.photoMetadataError()).toBeNull()

    model.loadInfoSheetMetadata(image)
    expect(loader).toHaveBeenCalledTimes(1)

    model.closeInfoSheet()
    model.openInfoSheet(image)
    expect(model.state.photoMetadataLoading()).toBe(true)
    await Promise.resolve()

    expect(model.state.photoMetadataLoading()).toBe(false)
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('ignores stale photo metadata when the selected image changes before the first load resolves', async () => {
    const first = imageMeta(1, 1000)
    const second = imageMeta(2, 2000)
    const resolves: Array<(value: {imageKey: string; metadata: {width: number}}) => void> = []
    const loader = vi.fn(
      (input: MobileGalleryImageMeta) =>
        new Promise<{imageKey: string; metadata: {width: number}}>((resolve) => {
          void input
          resolves.push(resolve)
        }),
    )
    const model = new ImageGalleryMobileModel(loader)

    model.openInfoSheet(first)
    model.openInfoSheet(second)
    resolves[0]?.({
      imageKey: getMobileGalleryPhotoMetadataKey(first),
      metadata: {width: 111},
    })
    await Promise.resolve()

    expect(model.state.photoMetadata()).toBeNull()
    expect(model.state.photoMetadataLoading()).toBe(true)

    resolves[1]?.({
      imageKey: getMobileGalleryPhotoMetadataKey(second),
      metadata: {width: 222},
    })
    await Promise.resolve()

    expect(model.state.photoMetadata()).toMatchObject({width: 222})
    expect(model.state.photoMetadataLoading()).toBe(false)
  })

  it('stores photo metadata errors as sheet state and clears them on teardown', async () => {
    const model = new ImageGalleryMobileModel(async (input) => {
      throw new Error(`failed ${input.id}`)
    })

    model.openInfoSheet(imageMeta(3))
    await Promise.resolve()
    await Promise.resolve()

    expect(model.state.photoMetadataLoading()).toBe(false)
    expect(model.state.photoMetadata()).toBeNull()
    expect(model.state.photoMetadataError()).toBe('failed 3')

    model.teardown()

    expect(model.state.photoMetadataError()).toBeNull()
    expect(model.state.photoMetadataImageKey()).toBe('')
  })

  it('zooms continuously during a two-finger pinch gesture', () => {
    const model = new ImageGalleryMobileModel()
    model.setup(5, 2, trackSnapshot)

    expect(model.beginTouch([point(100, 180), point(140, 180)], 0).mode).toBe('pinch')

    const firstMove = model.moveTouch([point(80, 180), point(160, 180)], RECT)

    expect(firstMove).toMatchObject({
      preventDefault: true,
      clearLongPress: true,
      clearSingleTap: true,
      shouldSyncDragTrack: false,
    })
    expect(model.state.zoomScale()).toBeCloseTo(2)
    expect(model.state.zoomX()).toBeCloseTo(0)
    expect(model.state.zoomY()).toBeCloseTo(0)

    model.moveTouch([point(60, 180), point(180, 180)], RECT)

    expect(model.state.zoomScale()).toBeCloseTo(3)
    expect(model.endTouch(null, RECT, 40)).toMatchObject({
      close: false,
      scheduleTap: null,
      startSettle: null,
    })
    expect(model.state.gestureState()).toBe('idle')
    expect(model.state.zoomScale()).toBeCloseTo(3)
  })

  it('switches from one-finger drag to pinch without keeping drag track offset', () => {
    const model = new ImageGalleryMobileModel()
    model.setup(5, 2, trackSnapshot)

    model.beginTouch([point(120, 180)], 0)
    expect(model.moveTouch([point(60, 180)], RECT).shouldSyncDragTrack).toBe(true)
    expect(model.state.dragOffsetX()).toBeLessThan(0)

    const pinchStart = model.moveTouch([point(60, 180), point(180, 180)], RECT)

    expect(pinchStart.resetDragTrack).toBe(true)
    expect(model.state.dragOffsetX()).toBe(0)

    model.moveTouch([point(40, 180), point(200, 180)], RECT)

    expect(model.state.zoomScale()).toBeCloseTo(4 / 3)
  })
})
