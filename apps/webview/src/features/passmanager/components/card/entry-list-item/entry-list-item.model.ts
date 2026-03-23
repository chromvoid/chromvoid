import {computed, state} from '@statx/core'

import {Entry} from '@project/passmanager'
import {copyWithAutoWipe, DEFAULT_CLIPBOARD_WIPE_MS} from '@project/passmanager'
import {pmEntryMoveModel} from '../../../models/pm-entry-move-model'
import {pmModel} from '../../../password-manager.model'

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

export class PMEntryListItemModel {
  readonly entry = state<Entry | undefined>(undefined)

  readonly isSelected = computed(() => this.entry()?.isSelected() || false)

  readonly hasUsername = computed(() => {
    const username = this.entry()?.username
    return Boolean(username && username.trim().length > 0)
  })

  readonly hasOtp = computed(() => (this.entry()?.otps().length ?? 0) > 0)

  readonly hasSshKeys = computed(() => (this.entry()?.sshKeys.length ?? 0) > 0)

  // ── Swipe state ──

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

  get isSwipeTracking() {
    return this.swipeState() === 'tracking'
  }

  setEntry(entry: Entry | undefined): void {
    this.entry.set(entry)
  }

  openEntry(event: Event): void {
    event.preventDefault()

    if (this.isSwipeOpen) {
      this.closeSwipe()
      return
    }

    const entry = this.entry.peek()
    if (!entry) {
      return
    }

    pmModel.openItem(entry)
  }

  copyUsername(event: Event): void {
    event.stopPropagation()

    const username = this.entry.peek()?.username
    if (!username) {
      return
    }

    copyWithAutoWipe(username, DEFAULT_CLIPBOARD_WIPE_MS)
  }

  async copyPassword(event: Event): Promise<void> {
    event.stopPropagation()

    const entry = this.entry.peek()
    if (!entry) {
      return
    }

    const pwd = await entry.password()
    if (pwd != null) {
      await copyWithAutoWipe(pwd, DEFAULT_CLIPBOARD_WIPE_MS)
    }
  }

  isDragEnabled(entry: Entry): boolean {
    if (window.passmanager.isReadOnly()) return false
    if (!pmEntryMoveModel.isDesktopDragEnabled()) return false

    return Boolean(entry.id)
  }

  startDrag(event: DragEvent): void {
    const entry = this.entry.peek()
    if (!(entry instanceof Entry)) {
      event.preventDefault()
      return
    }

    const target = event.target
    if (target instanceof HTMLElement && target.closest('.item-actions, .action-button')) {
      event.preventDefault()
      return
    }

    pmEntryMoveModel.startDrag(entry.id)
    pmEntryMoveModel.setDragData(event, entry.id)
  }

  endDrag(): void {
    pmEntryMoveModel.clearDragState()
  }

  handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      this.openEntry(event)
    }
  }

  // ── Touch / swipe / long-press ──

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
    }, PMEntryListItemModel.LONG_PRESS_DELAY_MS)
  }

  onTouchMove(event: TouchEvent): SwipeMoveResult | null {
    const touch = event.touches[0]
    if (!touch) return null

    const dx = touch.clientX - this.swipeStartX
    const dy = touch.clientY - this.swipeStartY
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)

    if (
      this.swipeDirection === null &&
      (absDx > PMEntryListItemModel.SWIPE_MOVE_GUARD || absDy > PMEntryListItemModel.SWIPE_MOVE_GUARD)
    ) {
      this.swipeDirection = absDx > absDy ? 'horizontal' : 'vertical'

      if (this.swipeDirection === 'horizontal') {
        this.clearLongPressTimer()
        this.swipeBaseOffset = this.swipeOffsetX()
      }
    }

    if (this.longPressTimer && (absDx > PMEntryListItemModel.SWIPE_MOVE_GUARD || absDy > PMEntryListItemModel.SWIPE_MOVE_GUARD)) {
      this.clearLongPressTimer()
    }

    if (this.swipeDirection !== 'horizontal') return null

    this.swipeState.set('tracking')

    const W = PMEntryListItemModel.SWIPE_ACTION_WIDTH
    let offset = this.swipeBaseOffset + dx * PMEntryListItemModel.SWIPE_DRAG_FACTOR
    offset = Math.max(-W, Math.min(W, offset))
    this.swipeOffsetX.set(offset)

    return {offset, preventDefault: true}
  }

  onTouchEnd(): SwipeFinishResult | null {
    if (!this.isSwipeTracking) return null

    this.clearLongPressTimer()

    const W = PMEntryListItemModel.SWIPE_ACTION_WIDTH
    const T = PMEntryListItemModel.SWIPE_SNAP_THRESHOLD
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
    this.swipeStartX = 0
    this.swipeStartY = 0
    this.swipeDirection = null
  }
}
