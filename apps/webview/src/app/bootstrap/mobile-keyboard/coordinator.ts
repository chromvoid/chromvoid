import type {Store} from '../../state/store'
import {pmMobileDebug} from 'root/features/passmanager/models/pm-mobile-debug'
import {MOBILE_KEYBOARD_PROGRAMMATIC_SCROLL_EVENT} from '../../../shared/services/mobile-keyboard-scroll-intent'
import {
  ANDROID_NATIVE_KEYBOARD_INSETS_ATTR,
  IOS_NATIVE_KEYBOARD_INSETS_ATTR,
  MOBILE_KEYBOARD_NATIVE_RESIZE_ATTR,
  NATIVE_KEYBOARD_INSETS_ATTR,
} from '../mobile-keyboard-insets'
import {
  getActiveMobileKeyboardTarget,
  getMobileKeyboardScrollTargetFromPath,
  getPathElements,
  isKeyboardScrollOptedOut,
  nowMs,
  roundDebugNumber,
} from './text-field-targets'
import {createMobileKeyboardStateController} from './keyboard-state'
import {createScrollIntentTracker} from './scroll-intent'
import {createPreserveController} from './preserve-controller'
import {createRevealController} from './reveal-controller'
import {isMobileKeyboardTargetFullyVisible} from './geometry'

const keyboardScrollDebug = (event: string, details?: Record<string, unknown>): void => {
  pmMobileDebug('keyboardScroll', event, details)
}

const readDebugTarget = (element: HTMLElement | null): string | undefined =>
  element?.getAttribute('name') ?? element?.getAttribute('data-inline-field') ?? element?.localName

const readKeyboardOpenMs = (since: number): number => roundDebugNumber(nowMs() - since)

export const setupMobileKeyboardFocusScroll = (store: Store): (() => void) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {}

  const root = document.documentElement
  const visualViewport = window.visualViewport
  const keyboardState = createMobileKeyboardStateController()
  const scrollIntent = createScrollIntentTracker()
  let activeTarget: HTMLElement | null = null
  // Once the user deliberately scrolls while a field is focused, their position
  // is sovereign for the rest of the episode: reveal must not bring the field
  // back, and preserve pins the position even with the field out of view.
  let userScrolledAway = false

  const isMobile = (): boolean => {
    try {
      return Boolean(store.isMobile())
    } catch {
      return false
    }
  }

  const getCurrentActiveTarget = (): HTMLElement | null => getActiveMobileKeyboardTarget()

  const preserve = createPreserveController({
    isMobile,
    getKeyboardState: keyboardState.getState,
    getActiveTarget: getCurrentActiveTarget,
    hasUserScrollAuthority: () => userScrolledAway,
    scrollIntent,
    debug: keyboardScrollDebug,
    readDebugTarget,
  })
  const reveal = createRevealController({
    isMobile,
    scrollIntent,
    debug: keyboardScrollDebug,
    readDebugTarget,
  })

  const startRevealForTarget = (target: HTMLElement, reason: string) => {
    activeTarget = target
    reveal.start(target, reason)
  }

  // Reveal runs only against a real occlusion; the 18px margin is the landing
  // position when we do scroll, never an invariant to chase on a visible field —
  // that margin chase is what produces stray micro-scrolls while typing.
  const startRevealIfOccluded = (target: HTMLElement, reason: string) => {
    if (userScrolledAway) return
    if (isMobileKeyboardTargetFullyVisible(target)) return
    startRevealForTarget(target, reason)
  }

  const handleFocusEvent = (event: Event) => {
    const pathElements = getPathElements(event)
    const target = getMobileKeyboardScrollTargetFromPath(pathElements)

    if (!target || isKeyboardScrollOptedOut(target, pathElements)) {
      activeTarget = null
      reveal.cancel('focus-opt-out')
      preserve.cancel('focus-opt-out')
      return
    }

    activeTarget = target
    userScrolledAway = false
    const state = keyboardState.refresh(event.type)

    // Focusing a field that is already fully visible must not scroll at all:
    // skip the margin-enforcing reveal and instead pin the current position
    // against the browser's native recentering (whenever a keyboard is up).
    if (isMobileKeyboardTargetFullyVisible(target)) {
      reveal.cancel('focus-target-visible')
      if (state.status !== 'closed') preserve.start(target, 'focus')
      return
    }

    startRevealForTarget(target, event.type)
  }

  const cancelVisibleSameTargetReveal = (event: Event) => {
    const target = activeTarget
    if (!target) return

    const pathElements = getPathElements(event)
    const eventTarget = getMobileKeyboardScrollTargetFromPath(pathElements)
    if (eventTarget !== target) return

    if (isKeyboardScrollOptedOut(target, pathElements)) {
      reveal.cancel('target-opt-out')
      preserve.cancel('target-opt-out')
      return
    }

    if (keyboardState.getState().status !== 'closed' && isMobileKeyboardTargetFullyVisible(target)) {
      reveal.cancel('visible-same-target')
    }
  }

  const handlePointerDown = (event: PointerEvent) => {
    keyboardState.refresh('pointerdown')
    scrollIntent.handlePointerDown(event)
    cancelVisibleSameTargetReveal(event)

    if (event.pointerType !== 'touch') return
    const pathElements = getPathElements(event)
    const target = getMobileKeyboardScrollTargetFromPath(pathElements)
    if (!target || isKeyboardScrollOptedOut(target, pathElements)) return
    // Tapping back into a field re-engages it after a deliberate scroll-away.
    userScrolledAway = false
    preserve.start(target, 'tap')
  }

  const handlePointerMove = (event: PointerEvent) => {
    if (!scrollIntent.handlePointerMove(event)) return
    userScrolledAway = true
    reveal.cancel('pointer-scroll')
    preserve.cancel('pointer-scroll')
  }

  const handlePointerEnd = (event: PointerEvent) => {
    scrollIntent.handlePointerEnd(event)
  }

  const handleTouchStart = (event: TouchEvent) => {
    scrollIntent.handleTouchStart(event)
    cancelVisibleSameTargetReveal(event)
  }

  const handleTouchMove = (event: TouchEvent) => {
    if (!scrollIntent.handleTouchMove(event)) return
    userScrolledAway = true
    reveal.cancel('touch-scroll')
    preserve.cancel('touch-scroll')
  }

  const handleTouchEnd = (event: TouchEvent) => {
    scrollIntent.handleTouchEnd(event)
  }

  const handleWheel = () => {
    scrollIntent.handleWheel()
    userScrolledAway = true
    reveal.cancel('wheel')
    preserve.cancel('wheel')
  }

  const handleInputEvent = (event: Event) => {
    keyboardState.refresh(event.type)
    const pathElements = getPathElements(event)
    const pathTarget = getMobileKeyboardScrollTargetFromPath(pathElements)
    const target = getCurrentActiveTarget() ?? pathTarget ?? activeTarget
    if (!target || isKeyboardScrollOptedOut(target, pathElements)) return

    // Cancel reveal before arming preserve so the two never overlap on a
    // visible target: preserve would revert reveal's margin positioning.
    if (isMobileKeyboardTargetFullyVisible(target)) {
      reveal.cancel('input-visible')
    }

    if (event.type === 'beforeinput') {
      preserve.start(target, 'input')
    }
  }

  const handleViewportChange = () => {
    keyboardState.refresh('viewport-change')
    const target = activeTarget ?? getCurrentActiveTarget()
    if (target) startRevealIfOccluded(target, 'viewport-change')
  }

  const handleProgrammaticScroll = () => {
    scrollIntent.handleProgrammaticScrollEvent()
    preserve.cancel('programmatic-scroll')
  }

  const unsubscribeKeyboardState = keyboardState.subscribe((state) => {
    keyboardScrollDebug('keyboardState.transition', {
      status: state.status,
      source: state.source,
      phase: state.phase,
      viewportMode: state.viewportMode,
      bottomInset: roundDebugNumber(state.bottomInset),
      keyboardOpenMs: state.status === 'closed' ? undefined : readKeyboardOpenMs(state.since),
    })

    if (state.status === 'closed') {
      userScrolledAway = false
      return
    }

    const target = activeTarget ?? getCurrentActiveTarget()
    if (target) startRevealIfOccluded(target, 'keyboard-state')
  })

  const rootObserver =
    typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver(() => {
          keyboardState.refresh('root-mutation')
          const target = activeTarget ?? getCurrentActiveTarget()
          if (target) startRevealIfOccluded(target, 'root-mutation')
        })

  document.addEventListener('focusin', handleFocusEvent, {capture: true})
  document.addEventListener('cv-focus', handleFocusEvent, {capture: true})
  document.addEventListener('beforeinput', handleInputEvent, {capture: true})
  document.addEventListener('input', handleInputEvent, {capture: true})
  document.addEventListener('cv-input', handleInputEvent, {capture: true})
  document.addEventListener('pointerdown', handlePointerDown, {capture: true, passive: true})
  document.addEventListener('pointermove', handlePointerMove, {capture: true, passive: true})
  document.addEventListener('pointerup', handlePointerEnd, {capture: true, passive: true})
  document.addEventListener('pointercancel', handlePointerEnd, {capture: true, passive: true})
  document.addEventListener('touchstart', handleTouchStart, {capture: true, passive: true})
  document.addEventListener('touchmove', handleTouchMove, {capture: true, passive: true})
  document.addEventListener('touchend', handleTouchEnd, {capture: true, passive: true})
  document.addEventListener('touchcancel', handleTouchEnd, {capture: true, passive: true})
  document.addEventListener('wheel', handleWheel, {capture: true, passive: true})
  document.addEventListener(MOBILE_KEYBOARD_PROGRAMMATIC_SCROLL_EVENT, handleProgrammaticScroll, {
    capture: true,
  })
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
      ANDROID_NATIVE_KEYBOARD_INSETS_ATTR,
      IOS_NATIVE_KEYBOARD_INSETS_ATTR,
      MOBILE_KEYBOARD_NATIVE_RESIZE_ATTR,
    ],
  })

  return () => {
    activeTarget = null
    unsubscribeKeyboardState()
    reveal.cleanup()
    preserve.cleanup()
    scrollIntent.cleanup()
    keyboardState.cleanup()
    rootObserver?.disconnect()
    document.removeEventListener('focusin', handleFocusEvent, {capture: true})
    document.removeEventListener('cv-focus', handleFocusEvent, {capture: true})
    document.removeEventListener('beforeinput', handleInputEvent, {capture: true})
    document.removeEventListener('input', handleInputEvent, {capture: true})
    document.removeEventListener('cv-input', handleInputEvent, {capture: true})
    document.removeEventListener('pointerdown', handlePointerDown, {capture: true})
    document.removeEventListener('pointermove', handlePointerMove, {capture: true})
    document.removeEventListener('pointerup', handlePointerEnd, {capture: true})
    document.removeEventListener('pointercancel', handlePointerEnd, {capture: true})
    document.removeEventListener('touchstart', handleTouchStart, {capture: true})
    document.removeEventListener('touchmove', handleTouchMove, {capture: true})
    document.removeEventListener('touchend', handleTouchEnd, {capture: true})
    document.removeEventListener('touchcancel', handleTouchEnd, {capture: true})
    document.removeEventListener('wheel', handleWheel, {capture: true})
    document.removeEventListener(MOBILE_KEYBOARD_PROGRAMMATIC_SCROLL_EVENT, handleProgrammaticScroll, {
      capture: true,
    })
    visualViewport?.removeEventListener('resize', handleViewportChange)
    visualViewport?.removeEventListener('scroll', handleViewportChange)
    window.removeEventListener('resize', handleViewportChange)
    window.removeEventListener('orientationchange', handleViewportChange)
  }
}
