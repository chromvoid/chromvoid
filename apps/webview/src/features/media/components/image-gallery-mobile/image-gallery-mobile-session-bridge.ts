import type {GalleryPanelSnapshot} from '../image-gallery-v2/gallery.types'

export type MobileGallerySessionBridgeDeps = {
  getOpen: () => boolean
  getImageCount: () => number
  getSnapshots: () => readonly GalleryPanelSnapshot[]
  subscribeSnapshots: (listener: (snapshots: readonly GalleryPanelSnapshot[]) => void) => () => void
  fillEmptyTrackSlotsIfIdle: () => void
}

export class MobileGallerySessionBridge {
  private unsubscribe: (() => void) | null = null
  private lastPanelSnapshotKey = ''
  private connected = false

  constructor(private readonly deps: MobileGallerySessionBridgeDeps) {}

  connect(): void {
    if (this.unsubscribe) {
      return
    }

    this.lastPanelSnapshotKey = this.getPanelSnapshotKey(this.deps.getSnapshots())
    this.connected = true
    this.unsubscribe = this.deps.subscribeSnapshots((snapshots) => {
      if (!this.connected) {
        return
      }
      const nextKey = this.getPanelSnapshotKey(snapshots)
      if (nextKey === this.lastPanelSnapshotKey) {
        return
      }
      this.lastPanelSnapshotKey = nextKey

      if (!this.deps.getOpen() || this.deps.getImageCount() === 0) {
        return
      }

      this.deps.fillEmptyTrackSlotsIfIdle()
    })
  }

  disconnect(): void {
    this.connected = false
    this.unsubscribe?.()
    this.unsubscribe = null
    this.lastPanelSnapshotKey = ''
  }

  private getPanelSnapshotKey(snapshots: readonly GalleryPanelSnapshot[]): string {
    return snapshots
      .map((snapshot) =>
        [
          snapshot.imageIndex ?? '',
          snapshot.imageId ?? '',
          snapshot.src ?? '',
          snapshot.loading ? '1' : '0',
          snapshot.error ?? '',
        ].join(':'),
      )
      .join('|')
  }
}
