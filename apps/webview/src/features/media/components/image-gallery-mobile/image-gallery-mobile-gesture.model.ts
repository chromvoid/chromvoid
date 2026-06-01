import {atom, computed} from '@reatom/core'
import type {SwipeDirection} from './image-gallery-mobile-track.model'

export const MOBILE_GALLERY_DOUBLE_TAP_MS = 260
export const MOBILE_GALLERY_LONG_PRESS_MS = 420

const DOUBLE_TAP_DISTANCE = 28
const DOUBLE_TAP_SCALE = 2.5
const MAX_ZOOM_SCALE = 4
const DISMISS_CLOSE_THRESHOLD = 120
const DISMISS_DRAG_RESISTANCE = 0.92
const EDGE_DRAG_RESISTANCE = 0.18
const EDGE_DRAG_MAX_OFFSET = 32
const LONG_PRESS_MOVE_THRESHOLD = 12
const TAP_ZONE_EDGE_RATIO = 0.22

export type GestureState = 'idle' | 'dragging' | 'settling' | 'dismissing'
export type CaptureMode = 'none' | 'drag' | 'queue' | 'dismiss' | 'pan' | 'pinch'

export type GalleryTouchPoint = {
  clientX: number
  clientY: number
}

export type GalleryRect = {
  left: number
  top: number
  width: number
  height: number
}

export type TouchStartMode = 'ignore' | 'pinch' | 'queue' | 'pan' | 'drag'

export type TouchStartResult = {
  mode: TouchStartMode
  clearLongPress: boolean
  clearSingleTap: boolean
  scheduleLongPress: boolean
}

export type TouchMoveResult = {
  preventDefault: boolean
  clearLongPress: boolean
  clearSingleTap: boolean
  primeTargets: number[]
  shouldSyncDragTrack: boolean
  resetDragTrack?: boolean
}

export type TouchEndResult = {
  close: boolean
  scheduleTap: GalleryTouchPoint | null
  startSettle: SwipeDirection | null
  primeTargets: number[]
}

export type TouchCancelResult = {
  startSettle: SwipeDirection | null
}

export type SingleTapResult = {
  navigateTo: number | null
  edgeNudge: SwipeDirection
}

export type DynamicStyleSnapshot = {
  imageTranslateX: string
  imageTranslateY: string
  imageScale: string
  imageTransition: string
  viewportTranslateY: string
  viewportOpacity: string
}

export type ImageGalleryMobileGestureSettleResult = {
  committedIndex: number | null
  nextDirection: SwipeDirection
}

export type ImageGalleryMobileGestureQueueResult = {
  startSettle: SwipeDirection | null
  primeTargets: number[]
}

export type ImageGalleryMobileGestureModelDeps = {
  getImageCount: () => number
  getDisplayIndex: () => number
  getActiveSettleDirection: () => SwipeDirection
  lockTrackSlots: () => void
  refreshUnlockedSlots: () => void
  beginTrackSettling: (direction: SwipeDirection) => void
  finishTrackSettling: () => ImageGalleryMobileGestureSettleResult
  enqueueDirection: (
    direction: SwipeDirection,
    wasSettling: boolean,
  ) => ImageGalleryMobileGestureQueueResult
  getPrimeTargetsForDirection: (direction: SwipeDirection, isDirectDrag: boolean) => number[]
  commitDirectNavigation: (index: number) => number | null
  log?: (event: string, meta?: Record<string, unknown>) => void
}

export class ImageGalleryMobileGestureModel {
  private readonly gestureStateAtom = atom<GestureState>('idle', 'media.imageGalleryV2.mobile.gestureState')
  private readonly captureModeAtom = atom<CaptureMode>('none', 'media.imageGalleryV2.mobile.captureMode')
  private readonly chromeVisibleAtom = atom(true, 'media.imageGalleryV2.mobile.chromeVisible')
  private readonly zoomScaleAtom = atom(1, 'media.imageGalleryV2.mobile.zoomScale')
  private readonly zoomXAtom = atom(0, 'media.imageGalleryV2.mobile.zoomX')
  private readonly zoomYAtom = atom(0, 'media.imageGalleryV2.mobile.zoomY')
  private readonly dragOffsetXAtom = atom(0, 'media.imageGalleryV2.mobile.dragOffsetX')
  private readonly dismissOffsetYAtom = atom(0, 'media.imageGalleryV2.mobile.dismissOffsetY')

  readonly state = {
    gestureState: this.gestureStateAtom,
    captureMode: this.captureModeAtom,
    chromeVisible: this.chromeVisibleAtom,
    zoomScale: this.zoomScaleAtom,
    zoomX: this.zoomXAtom,
    zoomY: this.zoomYAtom,
    dragOffsetX: this.dragOffsetXAtom,
    dismissOffsetY: this.dismissOffsetYAtom,
  }

  readonly computed = {
    isZoomed: computed(() => this.state.zoomScale() > 1.01, 'media.imageGalleryV2.mobile.isZoomed'),
    hasPendingLocalNavigation: computed(
      () => this.state.captureMode() !== 'none' || this.state.gestureState() !== 'idle',
      'media.imageGalleryV2.mobile.hasPendingGestureNavigation',
    ),
    dynamicStyles: computed<DynamicStyleSnapshot>(
      () => {
        const captureMode = this.state.captureMode()
        const dismissOffsetY = captureMode === 'dismiss' ? this.state.dismissOffsetY() : 0
        const imageTranslateY = this.state.zoomY() + dismissOffsetY * 0.15
        const viewportOpacity = dismissOffsetY > 0 ? Math.max(0.4, 1 - dismissOffsetY / 360) : 1
        const imageTransition =
          captureMode === 'pinch' || captureMode === 'pan' ? 'none' : 'transform 0.18s ease-out'

        return {
          imageTranslateX: `${this.state.zoomX()}px`,
          imageTranslateY: `${imageTranslateY}px`,
          imageScale: String(this.state.zoomScale()),
          imageTransition,
          viewportTranslateY: `${dismissOffsetY}px`,
          viewportOpacity: String(viewportOpacity),
        }
      },
      'media.imageGalleryV2.mobile.dynamicStyles',
    ),
  }

  private startX = 0
  private startY = 0
  private startTime = 0
  private deltaX = 0
  private deltaY = 0
  private directionLocked = false
  private lastTapAt = 0
  private lastTapX = 0
  private lastTapY = 0
  private panStartX = 0
  private panStartY = 0
  private panOriginX = 0
  private panOriginY = 0
  private pinchStartDistance = 0
  private pinchStartScale = 1
  private pinchStartMidX = 0
  private pinchStartMidY = 0
  private pinchStartZoomX = 0
  private pinchStartZoomY = 0

  constructor(private readonly deps: ImageGalleryMobileGestureModelDeps) {}

  resetLocalNavigationState() {
    this.resetGestureState()
    this.resetZoomState()
    this.resetTapState()
    this.state.chromeVisible.set(true)
  }

  resetGestureState() {
    this.endCapture()
    this.state.gestureState.set('idle')
    this.state.dragOffsetX.set(0)
    this.state.dismissOffsetY.set(0)
  }

  resetZoomState() {
    this.state.zoomScale.set(1)
    this.state.zoomX.set(0)
    this.state.zoomY.set(0)
    this.state.dismissOffsetY.set(0)
  }

  showChrome() {
    if (this.state.chromeVisible()) return
    this.state.chromeVisible.set(true)
  }

  toggleChrome() {
    this.state.chromeVisible.set(!this.state.chromeVisible())
  }

  beginTouch(
    touches: GalleryTouchPoint[],
    now: number,
    options: {infoSheetOpen?: boolean} = {},
  ): TouchStartResult {
    const firstTouch = touches[0]
    if (!firstTouch) {
      return {
        mode: 'ignore',
        clearLongPress: false,
        clearSingleTap: false,
        scheduleLongPress: false,
      }
    }

    if (touches.length >= 2) {
      this.deps.lockTrackSlots()
      this.beginPinch(touches)
      return {
        mode: 'pinch',
        clearLongPress: true,
        clearSingleTap: true,
        scheduleLongPress: false,
      }
    }

    if (options.infoSheetOpen) {
      return {
        mode: 'ignore',
        clearLongPress: false,
        clearSingleTap: false,
        scheduleLongPress: false,
      }
    }

    if (this.state.gestureState() === 'settling') {
      this.beginCapture('queue', firstTouch, now)
      return {
        mode: 'queue',
        clearLongPress: false,
        clearSingleTap: false,
        scheduleLongPress: false,
      }
    }

    if (this.computed.isZoomed()) {
      this.deps.lockTrackSlots()
      this.beginPan(firstTouch)
      return {
        mode: 'pan',
        clearLongPress: false,
        clearSingleTap: false,
        scheduleLongPress: false,
      }
    }

    if (this.state.gestureState() !== 'idle') {
      return {
        mode: 'ignore',
        clearLongPress: false,
        clearSingleTap: false,
        scheduleLongPress: false,
      }
    }

    this.deps.lockTrackSlots()
    this.beginCapture('drag', firstTouch, now)
    this.state.gestureState.set('dragging')
    return {
      mode: 'drag',
      clearLongPress: false,
      clearSingleTap: false,
      scheduleLongPress: true,
    }
  }

  moveTouch(touches: GalleryTouchPoint[], rect: GalleryRect | null): TouchMoveResult {
    if (this.state.captureMode() === 'none') {
      return {
        preventDefault: false,
        clearLongPress: false,
        clearSingleTap: false,
        primeTargets: [],
        shouldSyncDragTrack: false,
      }
    }

    if (touches.length >= 2) {
      const wasPinch = this.state.captureMode() === 'pinch'
      if (!wasPinch) {
        this.beginPinch(touches)
      }
      this.updatePinch(touches, rect)
      return {
        preventDefault: true,
        clearLongPress: true,
        clearSingleTap: true,
        primeTargets: [],
        shouldSyncDragTrack: false,
        resetDragTrack: !wasPinch,
      }
    }

    const touch = touches[0]
    if (!touch) {
      return {
        preventDefault: false,
        clearLongPress: false,
        clearSingleTap: false,
        primeTargets: [],
        shouldSyncDragTrack: false,
      }
    }

    if (this.state.captureMode() === 'pan') {
      this.updatePan(touch, rect)
      return {
        preventDefault: true,
        clearLongPress: true,
        clearSingleTap: false,
        primeTargets: [],
        shouldSyncDragTrack: false,
      }
    }

    if (this.state.captureMode() === 'pinch') {
      return {
        preventDefault: true,
        clearLongPress: false,
        clearSingleTap: false,
        primeTargets: [],
        shouldSyncDragTrack: false,
      }
    }

    const dx = touch.clientX - this.startX
    const dy = touch.clientY - this.startY
    this.deltaX = dx
    this.deltaY = dy

    const clearLongPress =
      Math.abs(dx) > LONG_PRESS_MOVE_THRESHOLD || Math.abs(dy) > LONG_PRESS_MOVE_THRESHOLD

    if (this.state.captureMode() === 'dismiss') {
      this.state.dismissOffsetY.set(Math.max(0, dy * DISMISS_DRAG_RESISTANCE))
      return {
        preventDefault: true,
        clearLongPress,
        clearSingleTap: false,
        primeTargets: [],
        shouldSyncDragTrack: false,
      }
    }

    if (!this.directionLocked) {
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        if (Math.abs(dx) > Math.abs(dy)) {
          this.directionLocked = true
        } else if (dy > 0) {
          this.state.captureMode.set('dismiss')
          this.state.gestureState.set('dismissing')
          this.directionLocked = true
          this.state.dismissOffsetY.set(Math.max(0, dy * DISMISS_DRAG_RESISTANCE))
          return {
            preventDefault: true,
            clearLongPress: true,
            clearSingleTap: false,
            primeTargets: [],
            shouldSyncDragTrack: false,
          }
        } else {
          const previousMode = this.state.captureMode()
          this.endCapture()
          if (previousMode === 'drag') {
            this.state.gestureState.set('idle')
            this.deps.refreshUnlockedSlots()
          }

          return {
            preventDefault: false,
            clearLongPress: true,
            clearSingleTap: false,
            primeTargets: [],
            shouldSyncDragTrack: false,
          }
        }
      } else {
        return {
          preventDefault: false,
          clearLongPress,
          clearSingleTap: false,
          primeTargets: [],
          shouldSyncDragTrack: false,
        }
      }
    }

    const direction = dx > 0 ? -1 : dx < 0 ? 1 : 0
    const primeTargets = this.getPrimeTargetsForDirection(direction as SwipeDirection)

    if (this.state.captureMode() !== 'drag' && this.state.captureMode() !== 'queue') {
      return {
        preventDefault: false,
        clearLongPress,
        clearSingleTap: false,
        primeTargets,
        shouldSyncDragTrack: false,
      }
    }

    if (this.state.captureMode() !== 'drag') {
      return {
        preventDefault: true,
        clearLongPress,
        clearSingleTap: false,
        primeTargets,
        shouldSyncDragTrack: false,
      }
    }

    const atStart = this.deps.getDisplayIndex() === 0 && dx > 0
    const atEnd = this.deps.getDisplayIndex() === this.deps.getImageCount() - 1 && dx < 0
    this.state.dragOffsetX.set(atStart || atEnd ? this.toEdgeDragOffset(dx) : dx)

    return {
      preventDefault: true,
      clearLongPress,
      clearSingleTap: false,
      primeTargets,
      shouldSyncDragTrack: true,
    }
  }

  endTouch(point: GalleryTouchPoint | null, now: number): TouchEndResult {
    if (this.state.captureMode() === 'none') {
      return {
        close: false,
        scheduleTap: null,
        startSettle: null,
        primeTargets: [],
      }
    }

    const captureMode = this.state.captureMode()

    if (captureMode === 'pan') {
      const panDistance = Math.hypot(this.state.zoomX() - this.panOriginX, this.state.zoomY() - this.panOriginY)
      this.endCapture()
      this.state.gestureState.set('idle')
      this.deps.refreshUnlockedSlots()

      if (panDistance <= 6 && point) {
        return {
          close: false,
          scheduleTap: point,
          startSettle: null,
          primeTargets: [],
        }
      }

      return {
        close: false,
        scheduleTap: null,
        startSettle: null,
        primeTargets: [],
      }
    }

    if (captureMode === 'pinch') {
      if (this.state.zoomScale() <= 1.01) {
        this.resetZoomState()
      }

      this.endCapture()
      this.state.gestureState.set('idle')
      this.deps.refreshUnlockedSlots()
      return {
        close: false,
        scheduleTap: null,
        startSettle: null,
        primeTargets: [],
      }
    }

    if (captureMode === 'dismiss') {
      const shouldClose = this.state.dismissOffsetY() >= DISMISS_CLOSE_THRESHOLD
      this.endCapture()
      this.state.gestureState.set('idle')

      if (shouldClose) {
        return {
          close: true,
          scheduleTap: null,
          startSettle: null,
          primeTargets: [],
        }
      }

      this.state.dismissOffsetY.set(0)
      this.deps.refreshUnlockedSlots()
      return {
        close: false,
        scheduleTap: null,
        startSettle: null,
        primeTargets: [],
      }
    }

    const direction = this.resolveGestureDirection(now)
    const hadHorizontalIntent = this.directionLocked
    const hadMeaningfulMovement = Math.abs(this.deltaX) > 8 || Math.abs(this.deltaY) > 8
    this.endCapture()

    if (captureMode === 'queue') {
      const queued = this.enqueueDirection(direction)
      return {
        close: false,
        scheduleTap: null,
        startSettle: queued.startSettle,
        primeTargets: queued.primeTargets,
      }
    }

    if (!hadHorizontalIntent && !hadMeaningfulMovement && point) {
      this.state.gestureState.set('idle')
      this.deps.refreshUnlockedSlots()
      return {
        close: false,
        scheduleTap: point,
        startSettle: null,
        primeTargets: [],
      }
    }

    this.beginSettling(direction)
    return {
      close: false,
      scheduleTap: null,
      startSettle: direction,
      primeTargets: [],
    }
  }

  cancelTouch(): TouchCancelResult {
    if (this.state.captureMode() === 'drag') {
      this.endCapture()
      this.beginSettling(0)
      return {startSettle: 0}
    }

    if (this.state.captureMode() === 'dismiss') {
      this.state.dismissOffsetY.set(0)
    }

    if (this.state.captureMode() === 'pinch' && this.state.zoomScale() <= 1.01) {
      this.resetZoomState()
    }

    this.endCapture()
    this.state.gestureState.set('idle')
    this.deps.refreshUnlockedSlots()
    return {startSettle: null}
  }

  finishSettling() {
    this.state.dragOffsetX.set(0)
    const direction = this.deps.getActiveSettleDirection()
    const result = this.deps.finishTrackSettling()

    if (result.committedIndex === null) {
      this.state.gestureState.set('idle')
      this.deps.log?.('finish-settling.noop', {direction})
      return result
    }

    this.resetZoomState()
    this.state.gestureState.set('idle')
    this.deps.log?.('finish-settling.commit', {
      direction,
      committedIndex: result.committedIndex,
      nextDirection: result.nextDirection,
    })
    return result
  }

  registerTap(point: GalleryTouchPoint, now: number, rect: GalleryRect | null) {
    const isDoubleTap =
      now - this.lastTapAt <= MOBILE_GALLERY_DOUBLE_TAP_MS &&
      Math.hypot(point.clientX - this.lastTapX, point.clientY - this.lastTapY) <= DOUBLE_TAP_DISTANCE

    this.lastTapAt = now
    this.lastTapX = point.clientX
    this.lastTapY = point.clientY

    if (isDoubleTap) {
      this.toggleZoomAt(point, rect)
      this.lastTapAt = 0
      return 'double' as const
    }

    return 'single' as const
  }

  handleSingleTap(clientX: number, rect: GalleryRect | null): SingleTapResult {
    if (!this.state.chromeVisible()) {
      this.showChrome()
      return {navigateTo: null, edgeNudge: 0}
    }

    if (this.computed.isZoomed()) {
      this.toggleChrome()
      return {navigateTo: null, edgeNudge: 0}
    }

    if (!rect) {
      this.toggleChrome()
      return {navigateTo: null, edgeNudge: 0}
    }

    const ratio = (clientX - rect.left) / Math.max(rect.width, 1)
    if (ratio <= TAP_ZONE_EDGE_RATIO) {
      if (this.deps.getDisplayIndex() > 0) {
        return {
          navigateTo: this.deps.commitDirectNavigation(this.deps.getDisplayIndex() - 1),
          edgeNudge: 0,
        }
      }

      return {navigateTo: null, edgeNudge: -1}
    }

    if (ratio >= 1 - TAP_ZONE_EDGE_RATIO) {
      if (this.deps.getDisplayIndex() < this.deps.getImageCount() - 1) {
        return {
          navigateTo: this.deps.commitDirectNavigation(this.deps.getDisplayIndex() + 1),
          edgeNudge: 0,
        }
      }

      return {navigateTo: null, edgeNudge: 1}
    }

    this.toggleChrome()
    return {navigateTo: null, edgeNudge: 0}
  }

  handleLongPressFired(infoSheetOpen: boolean) {
    if (infoSheetOpen || this.state.gestureState() === 'settling' || this.computed.isZoomed()) {
      return false
    }

    this.endCapture()
    this.state.gestureState.set('idle')
    return true
  }

  beginSettling(direction: SwipeDirection) {
    this.deps.beginTrackSettling(direction)
    this.state.gestureState.set('settling')
    this.state.dragOffsetX.set(0)
    this.showChrome()
    this.deps.log?.('begin-settling', {direction})
  }

  private enqueueDirection(direction: SwipeDirection) {
    const wasSettling = this.state.gestureState() === 'settling'
    const queued = this.deps.enqueueDirection(direction, wasSettling)
    if (queued.startSettle !== null) {
      this.beginSettling(queued.startSettle)
    }
    this.deps.log?.('queue-direction', {
      direction,
      startSettle: queued.startSettle,
      primeTargets: queued.primeTargets,
    })

    return queued
  }

  private beginCapture(mode: CaptureMode, touch: GalleryTouchPoint, now: number) {
    this.state.captureMode.set(mode)
    this.startX = touch.clientX
    this.startY = touch.clientY
    this.startTime = now
    this.deltaX = 0
    this.deltaY = 0
    this.directionLocked = false
    this.state.dragOffsetX.set(0)
  }

  private endCapture() {
    this.state.captureMode.set('none')
    this.startX = 0
    this.startY = 0
    this.startTime = 0
    this.deltaX = 0
    this.deltaY = 0
    this.directionLocked = false
    this.state.dragOffsetX.set(0)
  }

  private resolveGestureDirection(now: number): SwipeDirection {
    if (!this.directionLocked) {
      return 0
    }

    const elapsed = Math.max(now - this.startTime, 1)
    const velocity = Math.abs(this.deltaX) / elapsed
    const shouldNavigate = Math.abs(this.deltaX) > 50 || velocity > 0.3

    if (!shouldNavigate) {
      return 0
    }

    if (this.deltaX > 0) {
      if (this.deps.getDisplayIndex() === 0) {
        return 0
      }
      return -1
    }

    if (this.deltaX < 0) {
      if (this.deps.getDisplayIndex() >= this.deps.getImageCount() - 1) {
        return 0
      }
      return 1
    }

    return 0
  }

  private getPrimeTargetsForDirection(direction: SwipeDirection) {
    return this.deps.getPrimeTargetsForDirection(direction, this.state.captureMode() === 'drag')
  }

  private toEdgeDragOffset(deltaX: number) {
    const sign = Math.sign(deltaX)
    const limitedOffset = Math.min(Math.abs(deltaX) * EDGE_DRAG_RESISTANCE, EDGE_DRAG_MAX_OFFSET)
    return sign * limitedOffset
  }

  private beginPan(touch: GalleryTouchPoint) {
    this.state.captureMode.set('pan')
    this.state.gestureState.set('dragging')
    this.panStartX = touch.clientX
    this.panStartY = touch.clientY
    this.panOriginX = this.state.zoomX()
    this.panOriginY = this.state.zoomY()
    this.showChrome()
  }

  private updatePan(touch: GalleryTouchPoint, rect: GalleryRect | null) {
    this.state.zoomX.set(this.panOriginX + (touch.clientX - this.panStartX))
    this.state.zoomY.set(this.panOriginY + (touch.clientY - this.panStartY))
    this.clampZoomOffset(rect)
  }

  private beginPinch(touches: GalleryTouchPoint[]) {
    const a = touches[0]
    const b = touches[1]
    if (!a || !b) return

    this.state.captureMode.set('pinch')
    this.state.gestureState.set('dragging')
    this.directionLocked = false
    this.deltaX = 0
    this.deltaY = 0
    this.state.dragOffsetX.set(0)
    this.state.dismissOffsetY.set(0)
    this.pinchStartDistance = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)
    this.pinchStartScale = this.state.zoomScale()
    this.pinchStartMidX = (a.clientX + b.clientX) / 2
    this.pinchStartMidY = (a.clientY + b.clientY) / 2
    this.pinchStartZoomX = this.state.zoomX()
    this.pinchStartZoomY = this.state.zoomY()
    this.showChrome()
  }

  private updatePinch(touches: GalleryTouchPoint[], rect: GalleryRect | null) {
    const a = touches[0]
    const b = touches[1]
    if (!a || !b || this.pinchStartDistance <= 0) return

    const nextDistance = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)
    const nextMidX = (a.clientX + b.clientX) / 2
    const nextMidY = (a.clientY + b.clientY) / 2
    const scaleDelta = nextDistance / this.pinchStartDistance
    const nextScale = Math.max(1, Math.min(MAX_ZOOM_SCALE, this.pinchStartScale * scaleDelta))
    this.state.zoomScale.set(nextScale)

    if (rect) {
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      const startOffsetX = this.pinchStartMidX - centerX
      const startOffsetY = this.pinchStartMidY - centerY
      const nextOffsetX = nextMidX - centerX
      const nextOffsetY = nextMidY - centerY
      const scaleRatio = nextScale / Math.max(this.pinchStartScale, 0.001)

      this.state.zoomX.set(nextOffsetX - scaleRatio * (startOffsetX - this.pinchStartZoomX))
      this.state.zoomY.set(nextOffsetY - scaleRatio * (startOffsetY - this.pinchStartZoomY))
    } else {
      this.state.zoomX.set(this.pinchStartZoomX + (nextMidX - this.pinchStartMidX))
      this.state.zoomY.set(this.pinchStartZoomY + (nextMidY - this.pinchStartMidY))
    }

    this.clampZoomOffset(rect)
  }

  private toggleZoomAt(point: GalleryTouchPoint, rect: GalleryRect | null) {
    if (this.computed.isZoomed()) {
      this.resetZoomState()
      return
    }

    if (!rect) {
      this.state.zoomScale.set(DOUBLE_TAP_SCALE)
      return
    }

    const offsetX = point.clientX - (rect.left + rect.width / 2)
    const offsetY = point.clientY - (rect.top + rect.height / 2)
    this.state.zoomScale.set(DOUBLE_TAP_SCALE)
    this.state.zoomX.set(-offsetX * 0.8)
    this.state.zoomY.set(-offsetY * 0.8)
    this.clampZoomOffset(rect)
    this.showChrome()
  }

  private clampZoomOffset(rect: GalleryRect | null) {
    if (!rect) return

    const maxX = Math.max(0, (rect.width * this.state.zoomScale() - rect.width) / 2)
    const maxY = Math.max(0, (rect.height * this.state.zoomScale() - rect.height) / 2)

    this.state.zoomX.set(Math.max(-maxX, Math.min(maxX, this.state.zoomX())))
    this.state.zoomY.set(Math.max(-maxY, Math.min(maxY, this.state.zoomY())))
  }

  private resetTapState() {
    this.lastTapAt = 0
    this.lastTapX = 0
    this.lastTapY = 0
  }
}
