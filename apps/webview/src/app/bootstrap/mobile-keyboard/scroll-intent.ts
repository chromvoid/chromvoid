import {
  RECENT_GESTURE_WINDOW_MS,
  RECENT_PROGRAMMATIC_SCROLL_MS,
  RECENT_USER_SCROLL_INTENT_MS,
  TAP_MOVEMENT_TOLERANCE_PX,
} from './constants'
import {
  getMobileKeyboardScrollTargetFromPath,
  getPathElements,
  nowMs,
} from './text-field-targets'
type GestureStart = {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly startedAt: number
}

export type ScrollIntentTracker = {
  handlePointerDown(event: PointerEvent): void
  handlePointerMove(event: PointerEvent): boolean
  handlePointerEnd(event: PointerEvent): void
  handleTouchStart(event: TouchEvent): void
  handleTouchMove(event: TouchEvent): boolean
  handleTouchEnd(event: TouchEvent): void
  handleWheel(): void
  handleProgrammaticScrollEvent(): void
  hasRecentUserIntent(windowMs?: number): boolean
  hasRecentProgrammaticScroll(windowMs?: number): boolean
  hasUserIntentAfter(timestamp: number): boolean
  hasProgrammaticScrollAfter(timestamp: number): boolean
  cleanup(): void
}

const pointerGestureId = (event: PointerEvent): string => `pointer:${event.pointerId}`
const touchGestureId = (touch: Touch): string => `touch:${touch.identifier}`

const movedBeyondTapTolerance = (gesture: GestureStart, x: number, y: number): boolean =>
  Math.hypot(x - gesture.x, y - gesture.y) > TAP_MOVEMENT_TOLERANCE_PX

const isRecentGesture = (gesture: GestureStart): boolean =>
  nowMs() - gesture.startedAt <= RECENT_GESTURE_WINDOW_MS

export const createScrollIntentTracker = (): ScrollIntentTracker => {
  const gestures = new Map<string, GestureStart>()
  let recentUserIntentAt = Number.NEGATIVE_INFINITY
  let recentProgrammaticScrollAt = Number.NEGATIVE_INFINITY

  const markUserIntent = () => {
    recentUserIntentAt = nowMs()
  }

  const trackGesture = (id: string, x: number, y: number) => {
    gestures.set(id, {id, x, y, startedAt: nowMs()})
  }

  const handleGestureMove = (id: string, x: number, y: number): boolean => {
    const gesture = gestures.get(id)
    if (!gesture || !isRecentGesture(gesture)) return false

    if (!movedBeyondTapTolerance(gesture, x, y)) return false
    markUserIntent()
    return true
  }

  return {
    handlePointerDown(event) {
      if (event.pointerType === 'touch') {
        trackGesture(pointerGestureId(event), event.clientX, event.clientY)
        return
      }

      const pathElements = getPathElements(event)
      if (!getMobileKeyboardScrollTargetFromPath(pathElements)) {
        markUserIntent()
      }
    },
    handlePointerMove(event) {
      return handleGestureMove(pointerGestureId(event), event.clientX, event.clientY)
    },
    handlePointerEnd(event) {
      gestures.delete(pointerGestureId(event))
    },
    handleTouchStart(event) {
      for (const touch of Array.from(event.changedTouches)) {
        trackGesture(touchGestureId(touch), touch.clientX, touch.clientY)
      }
    },
    handleTouchMove(event) {
      let moved = false
      for (const touch of Array.from(event.touches)) {
        moved = handleGestureMove(touchGestureId(touch), touch.clientX, touch.clientY) || moved
      }
      return moved
    },
    handleTouchEnd(event) {
      for (const touch of Array.from(event.changedTouches)) {
        gestures.delete(touchGestureId(touch))
      }
    },
    handleWheel() {
      markUserIntent()
    },
    handleProgrammaticScrollEvent() {
      recentProgrammaticScrollAt = nowMs()
    },
    hasRecentUserIntent(windowMs = RECENT_USER_SCROLL_INTENT_MS) {
      return nowMs() - recentUserIntentAt <= windowMs
    },
    hasRecentProgrammaticScroll(windowMs = RECENT_PROGRAMMATIC_SCROLL_MS) {
      return nowMs() - recentProgrammaticScrollAt <= windowMs
    },
    hasUserIntentAfter(timestamp) {
      return recentUserIntentAt > timestamp
    },
    hasProgrammaticScrollAfter(timestamp) {
      return recentProgrammaticScrollAt > timestamp
    },
    cleanup() {
      gestures.clear()
    },
  }
}
