import {describe, expect, it} from 'vitest'

import {
  ImageGalleryMobileTrackModel,
  type MobileGalleryTrackSlotSnapshot,
} from '../../src/features/media/components/image-gallery-mobile/image-gallery-mobile-track.model'

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

describe('image-gallery-v2/mobile-gallery.track-model', () => {
  it('does not duplicate pending route sync for same display index and repeated acknowledgements', () => {
    const model = new ImageGalleryMobileTrackModel()
    model.setup(5, 2, trackSnapshot)

    expect(model.commitDirectNavigation(2, false)).toBeNull()
    expect(model.state.pendingRouteSyncIndices()).toEqual([])

    expect(model.commitDirectNavigation(3, false)).toBe(3)
    expect(model.state.pendingRouteSyncIndices()).toEqual([3])
    expect(model.commitDirectNavigation(3, false)).toBeNull()
    expect(model.state.pendingRouteSyncIndices()).toEqual([3])

    expect(model.syncFromProps(5, 3, trackSnapshot, true)).toMatchObject({
      mode: 'keep-local',
      acknowledgedLocalSync: true,
    })
    expect(model.state.pendingRouteSyncIndices()).toEqual([])

    expect(model.syncFromProps(5, 3, trackSnapshot, false)).toMatchObject({
      mode: 'external-sync',
      acknowledgedLocalSync: false,
    })
    expect(model.state.pendingRouteSyncIndices()).toEqual([])
  })

  it('keeps locked slot snapshots stable while the track interaction is active', () => {
    let useFreshSnapshots = false
    const mutableSnapshot = (index: number): MobileGalleryTrackSlotSnapshot | null => {
      const snapshot = trackSnapshot(index)
      if (!snapshot) return null

      return {
        ...snapshot,
        src: `${useFreshSnapshots ? 'fresh' : 'slot'}:${index}`,
      }
    }

    const model = new ImageGalleryMobileTrackModel()
    model.setup(5, 2, mutableSnapshot)
    model.lockTrackSlots()

    useFreshSnapshots = true
    model.refreshUnlockedSlots(false)

    expect(model.computed.trackSlots().map((slot) => slot.src)).toEqual(['slot:1', 'slot:2', 'slot:3'])
  })

  it('rotates the incoming neighbor into the current slot before refreshing offscreen targets', () => {
    let useFreshSnapshots = false
    const mutableSnapshot = (index: number): MobileGalleryTrackSlotSnapshot | null => {
      const snapshot = trackSnapshot(index)
      if (!snapshot) return null

      return {
        ...snapshot,
        src: `${useFreshSnapshots ? 'fresh' : 'slot'}:${index}`,
      }
    }

    const model = new ImageGalleryMobileTrackModel()
    model.setup(5, 1, mutableSnapshot)

    const before = model.computed.trackSlots()
    expect(before[2]).toMatchObject({
      slotId: 'right',
      role: 'next',
      imageIndex: 2,
      src: 'slot:2',
    })

    useFreshSnapshots = true
    model.beginSettling(1)
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

    model.refreshUnlockedSlots()

    expect(model.computed.trackSlots()[2]).toMatchObject({
      slotId: 'left',
      imageIndex: 3,
      src: 'fresh:3',
      locked: false,
    })
  })
})
