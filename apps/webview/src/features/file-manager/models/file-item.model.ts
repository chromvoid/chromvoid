import {atom, computed, wrap} from '@reatom/core'

import {tryGetAppContext} from 'root/shared/services/app-context'
import type {FileItemData, ViewMode} from 'root/shared/contracts/file-manager'
import {
  fileThumbnailStore,
  getFileThumbnailKey,
  isFileThumbnailCandidate,
  type FileThumbnailLease,
} from './file-thumbnail-cache.model'

export type SwipeState = 'idle' | 'tracking' | 'open-left' | 'open-right'
type SwipeDirection = 'horizontal' | 'vertical' | null

export interface SwipeMoveResult {
  offset: number
  preventDefault: boolean
}

export interface SwipeFinishResult {
  state: SwipeState
  offset: number
  emitSwipeOpen: boolean
}

export class FileItemModel {
  readonly isTouchDragging = atom(false)
  readonly swipeOffsetX = atom(0)
  readonly swipeState = atom<SwipeState>('idle')
  private readonly thumbnailKey = atom('', 'file.item.thumbnailKey')
  readonly thumbnailUrl = computed(
    () => fileThumbnailStore.read(this.thumbnailKey()).url,
    'file.item.thumbnailUrl',
  )

  private longPressTimer?: ReturnType<typeof setTimeout>
  private swipeStartX = 0
  private swipeStartY = 0
  private swipeBaseOffset = 0
  private swipeDirection: SwipeDirection = null
  private thumbnailTargetItem: FileItemData | null = null
  private thumbnailLease: FileThumbnailLease | null = null
  private thumbnailRenderRecoveryAttempted = false

  static readonly SWIPE_ACTION_WIDTH = 64
  static readonly SWIPE_SNAP_THRESHOLD = 28
  static readonly SWIPE_DRAG_FACTOR = 0.84
  private static readonly SWIPE_MOVE_GUARD = 10
  private static readonly LONG_PRESS_DELAY_MS = 500

  get isSwipeOpen() {
    return this.swipeState() === 'open-left' || this.swipeState() === 'open-right'
  }

  get isTracking() {
    return this.swipeState() === 'tracking'
  }

  setTouchDragging(value: boolean) {
    this.isTouchDragging.set(value)
  }

  setThumbnailTarget(item: FileItemData | undefined, viewMode: ViewMode) {
    const nextKey = item && this.shouldLoadThumbnail(item, viewMode) ? getFileThumbnailKey(item) : ''
    if (this.thumbnailKey() === nextKey) {
      if (item && nextKey) void fileThumbnailStore.ensure(item)
      return
    }

    if (this.thumbnailLease) fileThumbnailStore.release(this.thumbnailLease)
    this.thumbnailLease = null
    this.thumbnailKey.set('')
    this.thumbnailTargetItem = item ?? null
    this.thumbnailRenderRecoveryAttempted = false

    if (!item || !nextKey) {
      return
    }

    if (!tryGetAppContext()) {
      return
    }

    this.thumbnailLease = fileThumbnailStore.retain(item)
    this.thumbnailKey.set(this.thumbnailLease.key)
    void fileThumbnailStore.ensure(item)
  }

  handleThumbnailRenderError(sourceUrl: string | null) {
    const item = this.thumbnailTargetItem
    const targetKey = this.thumbnailKey()
    if (!sourceUrl || this.thumbnailUrl() !== sourceUrl || !item || !targetKey) {
      return
    }

    fileThumbnailStore.invalidate(item, sourceUrl)

    if (this.thumbnailRenderRecoveryAttempted || !tryGetAppContext()) {
      return
    }

    this.thumbnailRenderRecoveryAttempted = true
    void fileThumbnailStore.ensure(item, {
      displayJobIntentId: `file-item-thumbnail:${targetKey}:blob-retry`,
      preparedSourcePolicy: 'skip',
    })
  }

  clearLongPressTimer() {
    if (!this.longPressTimer) return
    clearTimeout(this.longPressTimer)
    this.longPressTimer = undefined
  }

  startTouch(event: TouchEvent, onLongPress?: (event: TouchEvent) => void) {
    const touch = event.touches[0]
    if (!touch) return

    this.swipeStartX = touch.clientX
    this.swipeStartY = touch.clientY
    this.swipeDirection = null
    this.swipeBaseOffset = this.swipeOffsetX()

    if (this.isSwipeOpen) return

    this.clearLongPressTimer()
    if (!onLongPress) {
      return
    }

    this.longPressTimer = setTimeout(
      wrap(() => {
        this.longPressTimer = undefined
        onLongPress(event)
      }),
      FileItemModel.LONG_PRESS_DELAY_MS,
    )
  }

  onTouchMove(event: TouchEvent, viewMode: ViewMode): SwipeMoveResult | null {
    const touch = event.touches[0]
    if (!touch) return null

    const dx = touch.clientX - this.swipeStartX
    const dy = touch.clientY - this.swipeStartY
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)

    if (
      this.swipeDirection === null &&
      (absDx > FileItemModel.SWIPE_MOVE_GUARD || absDy > FileItemModel.SWIPE_MOVE_GUARD)
    ) {
      this.swipeDirection = absDx > absDy ? 'horizontal' : 'vertical'

      if (this.swipeDirection === 'horizontal') {
        this.clearLongPressTimer()
        this.swipeBaseOffset = this.swipeOffsetX()
      }
    }

    if (
      this.longPressTimer &&
      (absDx > FileItemModel.SWIPE_MOVE_GUARD || absDy > FileItemModel.SWIPE_MOVE_GUARD)
    ) {
      this.clearLongPressTimer()
    }

    if (this.swipeDirection !== 'horizontal') return null
    if (viewMode !== 'list') return null

    this.swipeState.set('tracking')

    const W = FileItemModel.SWIPE_ACTION_WIDTH
    let offset = this.swipeBaseOffset + dx * FileItemModel.SWIPE_DRAG_FACTOR
    offset = Math.max(-W, Math.min(W, offset))
    this.swipeOffsetX.set(offset)

    return {offset, preventDefault: true}
  }

  onTouchEnd(): SwipeFinishResult | null {
    if (!this.isTracking) return null

    this.clearLongPressTimer()

    const W = FileItemModel.SWIPE_ACTION_WIDTH
    const T = FileItemModel.SWIPE_SNAP_THRESHOLD
    const offset = this.swipeOffsetX()

    if (offset < -T) {
      this.swipeOffsetX.set(-W)
      this.swipeState.set('open-left')
      return {state: 'open-left', offset: -W, emitSwipeOpen: true}
    }

    if (offset > T) {
      this.swipeOffsetX.set(W)
      this.swipeState.set('open-right')
      return {state: 'open-right', offset: W, emitSwipeOpen: true}
    }

    this.swipeOffsetX.set(0)
    this.swipeState.set('idle')
    this.swipeDirection = null
    return {state: 'idle', offset: 0, emitSwipeOpen: false}
  }

  closeSwipe(): boolean {
    if (this.swipeState() === 'idle') return false

    this.swipeOffsetX.set(0)
    this.swipeBaseOffset = 0
    this.swipeState.set('idle')
    this.swipeDirection = null
    return true
  }

  dispose() {
    this.clearLongPressTimer()
    if (this.thumbnailLease) fileThumbnailStore.release(this.thumbnailLease)
    this.thumbnailLease = null
    this.thumbnailKey.set('')
    this.thumbnailTargetItem = null
    this.thumbnailRenderRecoveryAttempted = false
    this.closeSwipe()
    this.isTouchDragging.set(false)
    this.swipeStartX = 0
    this.swipeStartY = 0
    this.swipeDirection = null
  }

  private shouldLoadThumbnail(item: FileItemData, viewMode: ViewMode): boolean {
    if (viewMode !== 'list' && viewMode !== 'grid') return false
    return isFileThumbnailCandidate(item)
  }
}
