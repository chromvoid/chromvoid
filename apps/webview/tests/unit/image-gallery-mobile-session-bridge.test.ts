import {describe, expect, it, vi} from 'vitest'

import {MobileGallerySessionBridge} from '../../src/features/media/components/image-gallery-mobile/image-gallery-mobile-session-bridge'
import type {GalleryPanelSnapshot} from '../../src/features/media/components/image-gallery-v2/gallery.types'

function snapshot(imageIndex: number | null, src: string | null): GalleryPanelSnapshot {
  return {
    role: 'current',
    imageIndex,
    imageId: imageIndex == null ? null : imageIndex + 1,
    src,
    loading: false,
    error: null,
  }
}

describe('mobile gallery session bridge', () => {
  it('suppresses synchronous initial and same-key callbacks before filling changed open state', () => {
    let snapshots = [snapshot(0, 'a')]
    let open = true
    const fill = vi.fn()
    let listener: ((snapshots: readonly GalleryPanelSnapshot[]) => void) | null = null
    const bridge = new MobileGallerySessionBridge({
      getOpen: () => open,
      getImageCount: () => 1,
      getSnapshots: () => snapshots,
      subscribeSnapshots: (nextListener) => {
        listener = nextListener
        nextListener(snapshots)
        return vi.fn()
      },
      fillEmptyTrackSlotsIfIdle: fill,
    })

    bridge.connect()
    listener?.(snapshots)

    expect(fill).not.toHaveBeenCalled()

    open = false
    snapshots = [snapshot(0, 'b')]
    listener?.(snapshots)

    expect(fill).not.toHaveBeenCalled()

    open = true
    snapshots = [snapshot(0, 'c')]
    listener?.(snapshots)

    expect(fill).toHaveBeenCalledTimes(1)
  })

  it('unsubscribes and ignores later callbacks after disconnect', () => {
    let snapshots = [snapshot(0, 'a')]
    const fill = vi.fn()
    const unsubscribe = vi.fn()
    let listener: ((snapshots: readonly GalleryPanelSnapshot[]) => void) | null = null
    const bridge = new MobileGallerySessionBridge({
      getOpen: () => true,
      getImageCount: () => 1,
      getSnapshots: () => snapshots,
      subscribeSnapshots: (nextListener) => {
        listener = nextListener
        return unsubscribe
      },
      fillEmptyTrackSlotsIfIdle: fill,
    })

    bridge.connect()
    bridge.disconnect()
    snapshots = [snapshot(1, 'b')]
    listener?.(snapshots)

    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(fill).not.toHaveBeenCalled()
  })
})
