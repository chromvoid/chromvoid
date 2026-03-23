import {state} from '@statx/core'

import type {ViewMode} from 'root/shared/contracts/file-manager'

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
  readonly isTouchDragging = state(false)
  readonly swipeOffsetX = state(0)
  readonly swipeState = state<SwipeState>('idle')

  private longPressTimer?: ReturnType<typeof setTimeout>
  private swipeStartX = 0
  private swipeStartY = 0
  private swipeBaseOffset = 0
  private swipeDirection: SwipeDirection = null

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

  clearLongPressTimer() {
    if (!this.longPressTimer) return
    clearTimeout(this.longPressTimer)
    this.longPressTimer = undefined
  }

  startTouch(event: TouchEvent, onLongPress: (event: TouchEvent) => void) {
    const touch = event.touches[0]
    if (!touch) return

    this.swipeStartX = touch.clientX
    this.swipeStartY = touch.clientY
    this.swipeDirection = null
    this.swipeBaseOffset = this.swipeOffsetX()

    if (this.isSwipeOpen) return

    this.clearLongPressTimer()
    this.longPressTimer = setTimeout(() => {
      this.longPressTimer = undefined
      onLongPress(event)
    }, FileItemModel.LONG_PRESS_DELAY_MS)
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

    if (this.longPressTimer && (absDx > FileItemModel.SWIPE_MOVE_GUARD || absDy > FileItemModel.SWIPE_MOVE_GUARD)) {
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
    this.closeSwipe()
    this.isTouchDragging.set(false)
    this.swipeStartX = 0
    this.swipeStartY = 0
    this.swipeDirection = null
  }
}
