import type {FileListItem} from 'root/shared/contracts/file-manager'
import type {VirtualFileListPointerState, VirtualFileListSelectionState} from './types'
import {getFocusedItemId} from './utils'

const LONG_PRESS_DELAY_MS = 480
const SWIPE_TRACK_GUARD = 14

export interface VirtualFileListPointerHandlers {
  onPointerDown: (e: PointerEvent) => void
  onPointerMove: (e: PointerEvent) => void
  onPointerUp: (e: PointerEvent) => void
  onPointerCancel: (e: PointerEvent) => void
  onTouchStart: (item: FileListItem, event: TouchEvent) => void
  onTouchMove: (event?: TouchEvent) => void
  onTouchEnd: (event?: TouchEvent) => void
  dispose: () => void
}

export interface VirtualFileListPointerHandlersDeps {
  pointerState: VirtualFileListPointerState
  selectionState: VirtualFileListSelectionState
  getItems: () => FileListItem[]
  getSelectedItems: () => number[]
  isSelectionMode: () => boolean
  emitSelectionModeRequested: (enabled: boolean) => void
  emitSelectionChange: (selectedItems: number[]) => void
  focusItemById: (id: number) => void
}

export const createPointerHandlers = (
  deps: VirtualFileListPointerHandlersDeps,
): VirtualFileListPointerHandlers => {
  const {
    pointerState,
    selectionState,
    getItems,
    getSelectedItems,
    isSelectionMode,
    emitSelectionModeRequested,
    emitSelectionChange,
    focusItemById,
  } = deps

  const cancelTouchLongPress = () => {
    if (pointerState.touchLongPressTimer) {
      window.clearTimeout(pointerState.touchLongPressTimer)
      pointerState.touchLongPressTimer = null
    }
    pointerState.touchLongPressPointerId = null
    pointerState.touchLongPressItemId = null
  }

  const cancelTouchLongPressOnMove = (point: {clientX: number; clientY: number}) => {
    if (!pointerState.touchLongPressTimer) return

    const dx = point.clientX - pointerState.touchLongPressStartX
    const dy = point.clientY - pointerState.touchLongPressStartY
    if (Math.hypot(dx, dy) > SWIPE_TRACK_GUARD) {
      cancelTouchLongPress()
    }
  }

  const getTrackedTouch = (event: TouchEvent): Touch | null => {
    const touches = Array.from(event.touches)
    if (pointerState.touchLongPressPointerId == null) {
      return touches[0] ?? null
    }
    return touches.find((touch) => touch.identifier === pointerState.touchLongPressPointerId) ?? null
  }

  const startTouchLongPress = (event: PointerEvent) => {
    if (event.pointerType !== 'touch') return

    const path = event.composedPath?.() ?? []
    for (const el of path) {
      if (!(el instanceof HTMLElement)) continue
      if (el.classList?.contains('drag-handle')) return
      if (el.matches?.('button, a, input, textarea, select, cv-button, cv-checkbox, .action-btn')) return
    }

    const id = getFocusedItemId(event)
    if (id == null) return

    cancelTouchLongPress()
    pointerState.touchLongPressPointerId = event.pointerId
    pointerState.touchLongPressItemId = id
    pointerState.touchLongPressStartX = event.clientX
    pointerState.touchLongPressStartY = event.clientY

    pointerState.touchLongPressTimer = window.setTimeout(() => {
      pointerState.touchLongPressTimer = null
      const filtered = getItems()
      const idx = filtered.findIndex((item) => item.id === id)
      if (idx >= 0) {
        selectionState.lastSelectionAnchorIndex = idx
        selectionState.lastKeyboardAnchorIndex = idx
      }

      if (!isSelectionMode()) {
        emitSelectionModeRequested(true)
      }

      const selected = [...getSelectedItems()]
      const current = selected.indexOf(id)
      if (current >= 0) {
        selected.splice(current, 1)
      } else {
        selected.push(id)
      }

      emitSelectionChange(selected)
      focusItemById(id)
      pointerState.lastLongPressAtMs = Date.now()
      pointerState.lastLongPressItemId = id
    }, LONG_PRESS_DELAY_MS)
  }

  const startTouchLongPressFromTouch = (event: TouchEvent, item: FileListItem) => {
    if (!event.touches[0]) return
    const touch = event.touches[0]
    const contextPath = event.composedPath?.() ?? []
    for (const el of contextPath) {
      if (!(el instanceof HTMLElement)) continue
      if (el.classList?.contains('drag-handle')) return
      if (el.matches?.('button, a, input, textarea, select, cv-button, cv-checkbox, .action-btn')) return
    }

    cancelTouchLongPress()
    pointerState.touchLongPressPointerId = event.changedTouches[0]?.identifier ?? null
    pointerState.touchLongPressItemId = item.id
    pointerState.touchLongPressStartX = touch.clientX
    pointerState.touchLongPressStartY = touch.clientY

    pointerState.touchLongPressTimer = window.setTimeout(() => {
      pointerState.touchLongPressTimer = null
      const filtered = getItems()
      const idx = filtered.findIndex((candidate) => candidate.id === item.id)
      if (idx >= 0) {
        selectionState.lastSelectionAnchorIndex = idx
        selectionState.lastKeyboardAnchorIndex = idx
      }
      if (!isSelectionMode()) {
        emitSelectionModeRequested(true)
      }

      const selected = [...getSelectedItems()]
      const i = selected.indexOf(item.id)
      if (i >= 0) {
        selected.splice(i, 1)
      } else {
        selected.push(item.id)
      }
      pointerState.lastLongPressAtMs = Date.now()
      pointerState.lastLongPressItemId = item.id
      focusItemById(item.id)
      emitSelectionChange(selected)
    }, LONG_PRESS_DELAY_MS)
  }

  return {
    onPointerDown: (e: PointerEvent) => {
      pointerState.lastPointerType = e.pointerType
      pointerState.lastPointerDownAtMs = Date.now()
      pointerState.lastPointerDownItemId = getFocusedItemId(e)
      startTouchLongPress(e)
    },
    onPointerMove: (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      if (
        pointerState.touchLongPressPointerId == null ||
        e.pointerId !== pointerState.touchLongPressPointerId
      )
        return
      if (!pointerState.touchLongPressTimer) return

      cancelTouchLongPressOnMove(e)
    },
    onPointerUp: (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        cancelTouchLongPress()
      }
    },
    onPointerCancel: (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        cancelTouchLongPress()
      }
    },
    onTouchStart: (item, event) => startTouchLongPressFromTouch(event, item),
    onTouchMove: (event?: TouchEvent) => {
      const touch = event ? getTrackedTouch(event) : null
      if (touch) {
        cancelTouchLongPressOnMove(touch)
      }
    },
    onTouchEnd: (_event?: TouchEvent) => {
      cancelTouchLongPress()
    },
    dispose: () => {
      cancelTouchLongPress()
    },
  }
}
