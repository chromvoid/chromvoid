import type {Store} from '../state/store'
import {
  IOS_NATIVE_KEYBOARD_INSETS_ATTR,
  MOBILE_KEYBOARD_NATIVE_RESIZE_ATTR,
  NATIVE_KEYBOARD_INSETS_ATTR,
} from './mobile-keyboard-insets'

export const MOBILE_KEYBOARD_SCROLL_ATTR = 'data-mobile-keyboard-scroll'
export const MOBILE_KEYBOARD_SCROLL_CONTAINER_ATTR = 'data-mobile-keyboard-scroll-container'

const MOBILE_KEYBOARD_SCROLL_OFF_VALUE = 'off'
const POST_FOCUS_SCROLL_FRAME_LIMIT = 45
const VISUAL_VIEWPORT_FIELD_MARGIN_PX = 18
const MIN_SCROLL_ADJUSTMENT_PX = 1
const TAP_MOVEMENT_TOLERANCE_PX = 10
const RECENT_GESTURE_WINDOW_MS = 2_000

const TEXT_FIELD_HOST_TAGS: ReadonlySet<string> = new Set([
  'cv-input',
  'cv-textarea',
  'cv-number',
  'cv-combobox',
])

const NON_TEXT_INPUT_TYPES: ReadonlySet<string> = new Set([
  'button',
  'submit',
  'reset',
  'checkbox',
  'radio',
  'range',
  'color',
  'file',
  'image',
  'hidden',
])

const SCROLLABLE_OVERFLOW_RE = /^(auto|scroll|overlay)$/

type ScrollSession = {
  readonly element: HTMLElement
  frameCount: number
  rafId: number
}

type GestureStart = {
  readonly kind: 'pointer' | 'touch'
  readonly id: number
  readonly x: number
  readonly y: number
  readonly startedAt: number
}

type MobileKeyboardVisibleRect = {
  readonly top: number
  readonly bottom: number
}

const nowMs = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()

const getPathElements = (event: Event): HTMLElement[] => {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target]
  return path.filter((node): node is HTMLElement => node instanceof HTMLElement)
}

const getComposedParent = (element: HTMLElement): HTMLElement | null => {
  if (element.parentElement) return element.parentElement

  const root = element.getRootNode()
  if (root instanceof ShadowRoot && root.host instanceof HTMLElement) {
    return root.host
  }

  return null
}

const findComposedAncestor = (
  element: HTMLElement,
  predicate: (candidate: HTMLElement) => boolean,
  {includeSelf}: {includeSelf: boolean},
): HTMLElement | null => {
  let current: HTMLElement | null = includeSelf ? element : getComposedParent(element)
  while (current) {
    if (predicate(current)) return current
    current = getComposedParent(current)
  }

  return null
}

const isDisabledOrReadonly = (element: HTMLElement): boolean => {
  const formLikeElement = element as HTMLElement & {
    disabled?: boolean
    readonly?: boolean
    readOnly?: boolean
  }
  return (
    formLikeElement.disabled === true ||
    formLikeElement.readonly === true ||
    formLikeElement.readOnly === true ||
    element.matches('[disabled], [readonly], [aria-disabled="true"]')
  )
}

const isContentEditableTarget = (element: HTMLElement): boolean =>
  element.isContentEditable || element.getAttribute('contenteditable') === 'true'

export const isMobileKeyboardScrollTarget = (element: HTMLElement): boolean => {
  if (isContentEditableTarget(element)) return true
  if (isDisabledOrReadonly(element)) return false

  const tagName = element.localName
  if (TEXT_FIELD_HOST_TAGS.has(tagName)) return true
  if (element instanceof HTMLTextAreaElement) return true
  if (!(element instanceof HTMLInputElement)) return false

  return !NON_TEXT_INPUT_TYPES.has(element.type.toLowerCase())
}

const isKeyboardScrollOptedOut = (element: HTMLElement, pathElements: readonly HTMLElement[]): boolean => {
  if (
    pathElements.some(
      (candidate) => candidate.getAttribute(MOBILE_KEYBOARD_SCROLL_ATTR) === MOBILE_KEYBOARD_SCROLL_OFF_VALUE,
    )
  ) {
    return true
  }

  return Boolean(
    findComposedAncestor(
      element,
      (candidate) =>
        candidate.getAttribute(MOBILE_KEYBOARD_SCROLL_ATTR) === MOBILE_KEYBOARD_SCROLL_OFF_VALUE,
      {includeSelf: true},
    ),
  )
}

export const getMobileKeyboardScrollTargetFromPath = (
  pathElements: readonly HTMLElement[],
): HTMLElement | null => {
  const customElementTarget = pathElements.find(
    (element) => TEXT_FIELD_HOST_TAGS.has(element.localName) && isMobileKeyboardScrollTarget(element),
  )
  if (customElementTarget) return customElementTarget

  return pathElements.find(isMobileKeyboardScrollTarget) ?? null
}

const readRootCssPx = (name: string): number => {
  const value = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name))
  return Number.isFinite(value) && value > 0 ? value : 0
}

const getPositiveViewportDimension = (value: number | undefined): number => {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

const getLayoutViewportHeight = (): number => {
  const rootHeight = getPositiveViewportDimension(document.documentElement.clientHeight)
  const windowHeight = getPositiveViewportDimension(window.innerHeight)

  return rootHeight || windowHeight
}

const getMobileKeyboardVisibleRect = (): MobileKeyboardVisibleRect | null => {
  const visualViewport = window.visualViewport
  const layoutHeight = getLayoutViewportHeight()
  const viewportTop = visualViewport ? getPositiveViewportDimension(visualViewport.offsetTop) : 0
  const viewportHeight = visualViewport
    ? getPositiveViewportDimension(visualViewport.height)
    : getPositiveViewportDimension(window.innerHeight) || layoutHeight

  if (viewportHeight <= 0 && layoutHeight <= 0) return null

  const visualBottom = viewportHeight > 0 ? viewportTop + viewportHeight : layoutHeight
  const root = document.documentElement
  const nativeResize = root.hasAttribute(MOBILE_KEYBOARD_NATIVE_RESIZE_ATTR)
  const nativeKeyboardInset = nativeResize ? 0 : readRootCssPx('--native-keyboard-bottom-inset')
  const overlayInset = Math.max(
    readRootCssPx('--mobile-keyboard-scroll-clearance'),
    readRootCssPx('--mobile-keyboard-overlay-offset'),
    readRootCssPx('--visual-viewport-bottom-inset'),
    nativeKeyboardInset,
  )
  const insetBottom = layoutHeight > 0 && overlayInset > 0 ? layoutHeight - overlayInset : visualBottom
  const bottom = Math.min(visualBottom, insetBottom)

  return bottom > viewportTop ? {top: viewportTop, bottom} : null
}

const getDocumentScroller = (): HTMLElement => {
  return document.scrollingElement instanceof HTMLElement
    ? document.scrollingElement
    : document.documentElement
}

const isDocumentScroller = (element: HTMLElement): boolean =>
  element === document.scrollingElement || element === document.documentElement || element === document.body

const isScrollableY = (element: HTMLElement): boolean => {
  const style = getComputedStyle(element)
  return (
    SCROLLABLE_OVERFLOW_RE.test(style.overflowY) &&
    element.scrollHeight - element.clientHeight > MIN_SCROLL_ADJUSTMENT_PX
  )
}

export const getMobileKeyboardScrollContainer = (target: HTMLElement): HTMLElement => {
  const explicitContainer = findComposedAncestor(
    target,
    (candidate) => candidate.hasAttribute(MOBILE_KEYBOARD_SCROLL_CONTAINER_ATTR),
    {includeSelf: false},
  )
  if (explicitContainer) return explicitContainer

  const scrollableAncestor = findComposedAncestor(target, isScrollableY, {includeSelf: false})
  return scrollableAncestor ?? getDocumentScroller()
}

const clampScrollTop = (scroller: HTMLElement, scrollTop: number): number => {
  const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
  return Math.min(maxScrollTop, Math.max(0, scrollTop))
}

const scrollMobileKeyboardTargetIntoView = (target: HTMLElement): boolean => {
  const visibleRect = getMobileKeyboardVisibleRect()
  if (!visibleRect) return false

  const scroller = getMobileKeyboardScrollContainer(target)
  const targetRect = target.getBoundingClientRect()
  const scrollerRect = scroller.getBoundingClientRect()
  const containerTop = isDocumentScroller(scroller)
    ? visibleRect.top
    : Math.max(scrollerRect.top, visibleRect.top)
  const containerBottom = isDocumentScroller(scroller)
    ? visibleRect.bottom
    : Math.min(scrollerRect.bottom, visibleRect.bottom)
  const visibleTop = containerTop + VISUAL_VIEWPORT_FIELD_MARGIN_PX
  const visibleBottom = containerBottom - VISUAL_VIEWPORT_FIELD_MARGIN_PX

  if (visibleBottom <= visibleTop) return false

  const bottomOverflow = targetRect.bottom - visibleBottom
  const topOverflow = visibleTop - targetRect.top
  const scrollDelta = bottomOverflow > 0 ? bottomOverflow : topOverflow > 0 ? -topOverflow : 0
  if (Math.abs(scrollDelta) <= MIN_SCROLL_ADJUSTMENT_PX) return false

  const nextScrollTop = clampScrollTop(scroller, scroller.scrollTop + scrollDelta)
  if (Math.abs(nextScrollTop - scroller.scrollTop) <= MIN_SCROLL_ADJUSTMENT_PX) return false

  scroller.scrollTop = nextScrollTop
  return true
}

const isRecentGesture = (gesture: GestureStart | null): gesture is GestureStart => {
  return Boolean(gesture && nowMs() - gesture.startedAt <= RECENT_GESTURE_WINDOW_MS)
}

const movedBeyondTapTolerance = (gesture: GestureStart, x: number, y: number): boolean => {
  return Math.hypot(x - gesture.x, y - gesture.y) > TAP_MOVEMENT_TOLERANCE_PX
}

export const setupMobileKeyboardFocusScroll = (store: Store): (() => void) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {}

  const root = document.documentElement
  const visualViewport = window.visualViewport
  let activeSession: ScrollSession | null = null
  let gestureStart: GestureStart | null = null

  const isMobile = (): boolean => {
    try {
      return Boolean(store.isMobile())
    } catch {
      return false
    }
  }

  const cancelActiveSession = () => {
    if (!activeSession) return
    if (activeSession.rafId) {
      window.cancelAnimationFrame(activeSession.rafId)
    }
    activeSession = null
  }

  const runScrollAttempt = (session: ScrollSession) => {
    session.rafId = 0

    if (!activeSession || activeSession !== session) return
    if (!isMobile() || !session.element.isConnected) {
      cancelActiveSession()
      return
    }

    scrollMobileKeyboardTargetIntoView(session.element)
    session.frameCount += 1

    if (session.frameCount >= POST_FOCUS_SCROLL_FRAME_LIMIT) {
      cancelActiveSession()
      return
    }

    scheduleActiveScroll()
  }

  function scheduleActiveScroll() {
    if (!activeSession || activeSession.rafId) return
    const session = activeSession
    session.rafId = window.requestAnimationFrame(() => runScrollAttempt(session))
  }

  const startScrollSession = (element: HTMLElement) => {
    cancelActiveSession()
    if (!isMobile()) return

    activeSession = {
      element,
      frameCount: 0,
      rafId: 0,
    }
    scheduleActiveScroll()
  }

  const handleFocusEvent = (event: Event) => {
    const pathElements = getPathElements(event)
    const target = getMobileKeyboardScrollTargetFromPath(pathElements)

    if (!target || isKeyboardScrollOptedOut(target, pathElements)) {
      cancelActiveSession()
      return
    }

    startScrollSession(target)
  }

  const handleViewportChange = () => {
    if (!activeSession) return
    scheduleActiveScroll()
  }

  const handlePointerDown = (event: PointerEvent) => {
    if (event.pointerType !== 'touch') return

    gestureStart = {
      kind: 'pointer',
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startedAt: nowMs(),
    }
  }

  const handlePointerMove = (event: PointerEvent) => {
    if (
      !activeSession ||
      !isRecentGesture(gestureStart) ||
      gestureStart.kind !== 'pointer' ||
      gestureStart.id !== event.pointerId
    ) {
      return
    }

    if (movedBeyondTapTolerance(gestureStart, event.clientX, event.clientY)) {
      cancelActiveSession()
    }
  }

  const clearPointerGesture = (event: PointerEvent) => {
    if (gestureStart?.kind === 'pointer' && gestureStart.id === event.pointerId) {
      gestureStart = null
    }
  }

  const getTouchPoint = (event: TouchEvent): Touch | null => {
    if (event.touches.length > 0) return event.touches[0] ?? null
    if (event.changedTouches.length > 0) return event.changedTouches[0] ?? null

    return null
  }

  const handleTouchStart = (event: TouchEvent) => {
    const touch = getTouchPoint(event)
    if (!touch) return

    gestureStart = {
      kind: 'touch',
      id: touch.identifier,
      x: touch.clientX,
      y: touch.clientY,
      startedAt: nowMs(),
    }
  }

  const handleTouchMove = (event: TouchEvent) => {
    if (!activeSession || !isRecentGesture(gestureStart) || gestureStart.kind !== 'touch') return

    const touch = Array.from(event.touches).find((candidate) => candidate.identifier === gestureStart?.id)
    if (!touch) return

    if (movedBeyondTapTolerance(gestureStart, touch.clientX, touch.clientY)) {
      cancelActiveSession()
    }
  }

  const handleTouchEnd = (event: TouchEvent) => {
    if (!gestureStart || gestureStart.kind !== 'touch') return

    const touch = Array.from(event.changedTouches).find(
      (candidate) => candidate.identifier === gestureStart?.id,
    )
    if (touch) gestureStart = null
  }

  const handleWheel = () => {
    cancelActiveSession()
  }

  const rootObserver =
    typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver(() => {
          scheduleActiveScroll()
        })

  document.addEventListener('focusin', handleFocusEvent, {capture: true})
  document.addEventListener('cv-focus', handleFocusEvent, {capture: true})
  document.addEventListener('pointerdown', handlePointerDown, {capture: true, passive: true})
  document.addEventListener('pointermove', handlePointerMove, {capture: true, passive: true})
  document.addEventListener('pointerup', clearPointerGesture, {capture: true, passive: true})
  document.addEventListener('pointercancel', clearPointerGesture, {capture: true, passive: true})
  document.addEventListener('touchstart', handleTouchStart, {capture: true, passive: true})
  document.addEventListener('touchmove', handleTouchMove, {capture: true, passive: true})
  document.addEventListener('touchend', handleTouchEnd, {capture: true, passive: true})
  document.addEventListener('touchcancel', handleTouchEnd, {capture: true, passive: true})
  document.addEventListener('wheel', handleWheel, {capture: true, passive: true})
  visualViewport?.addEventListener('resize', handleViewportChange)
  visualViewport?.addEventListener('scroll', handleViewportChange)
  window.addEventListener('resize', handleViewportChange)
  window.addEventListener('orientationchange', handleViewportChange)
  rootObserver?.observe(root, {
    attributes: true,
    attributeFilter: [
      'style',
      'data-mobile-keyboard-expanded',
      NATIVE_KEYBOARD_INSETS_ATTR,
      IOS_NATIVE_KEYBOARD_INSETS_ATTR,
      MOBILE_KEYBOARD_NATIVE_RESIZE_ATTR,
    ],
  })

  return () => {
    cancelActiveSession()
    rootObserver?.disconnect()
    document.removeEventListener('focusin', handleFocusEvent, {capture: true})
    document.removeEventListener('cv-focus', handleFocusEvent, {capture: true})
    document.removeEventListener('pointerdown', handlePointerDown, {capture: true})
    document.removeEventListener('pointermove', handlePointerMove, {capture: true})
    document.removeEventListener('pointerup', clearPointerGesture, {capture: true})
    document.removeEventListener('pointercancel', clearPointerGesture, {capture: true})
    document.removeEventListener('touchstart', handleTouchStart, {capture: true})
    document.removeEventListener('touchmove', handleTouchMove, {capture: true})
    document.removeEventListener('touchend', handleTouchEnd, {capture: true})
    document.removeEventListener('touchcancel', handleTouchEnd, {capture: true})
    document.removeEventListener('wheel', handleWheel, {capture: true})
    visualViewport?.removeEventListener('resize', handleViewportChange)
    visualViewport?.removeEventListener('scroll', handleViewportChange)
    window.removeEventListener('resize', handleViewportChange)
    window.removeEventListener('orientationchange', handleViewportChange)
  }
}
