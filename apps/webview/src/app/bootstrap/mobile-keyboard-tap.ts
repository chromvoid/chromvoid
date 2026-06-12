import type {Store} from '../state/store'
import {
  applyMobileKeyboardVisibilityPayload,
  setupNativeKeyboardInsetsEventListeners,
  type MobileKeyboardVisibilityPayload,
} from './mobile-keyboard-insets'
import {subscribeToSignalChanges} from '../../shared/services/subscribed-signal'
import {
  getDeepActiveElement,
  getPathElements,
  isTextInputLike,
} from './mobile-keyboard'

export {
  applyMobileKeyboardInsetsPayload,
  applyMobileKeyboardVisibilityPayload,
  getMobileKeyboardPayloadBottomInset,
  setupAndroidKeyboardInsetsEventListener,
  setupIOSKeyboardInsetsEventListener,
  setupNativeKeyboardInsetsEventListeners,
  type MobileKeyboardInsetsPayload,
  type MobileKeyboardVisibilityPayload,
} from './mobile-keyboard-insets'

/**
 * Workaround for mobile keyboards swallowing taps on action elements.
 *
 * When the software keyboard is visible and the user taps a button/link,
 * the browser first dismisses the keyboard and the original tap is lost.
 * This module detects such taps via pointerdown→pointerup and fires a
 * synthetic `.click()` when the trusted click never arrives.
 */
export const setupMobileKeyboardTapWorkaround = (store: Store) => {
  setupNativeKeyboardInsetsEventListeners(document.documentElement)

  import('root/core/transport/tauri/ipc')
    .then(({tauriInvoke, tauriListen}) => {
      // --- keyboard visibility attribute ---
      tauriListen<MobileKeyboardVisibilityPayload>('keyboard:visibility-changed', (payload) => {
        applyMobileKeyboardVisibilityPayload(document.documentElement, payload)
      }).catch(() => {})

      // --- action target resolution ---
      const ACTION_TARGET_SELECTOR = [
        'cv-button',
        'cv-menu-item',
        'button',
        'a[href]',
        'summary',
        'input[type="button"]',
        'input[type="submit"]',
        'input[type="reset"]',
        '[role="button"]',
        '[data-action]',
      ].join(', ')

      type KeyboardTapCandidate = {
        active: HTMLElement
        target: HTMLElement
        preserveKeyboard: boolean
        pointerId: number
        startX: number
        startY: number
        fallbackTimerId: number | null
      }

      const TAP_MOVEMENT_TOLERANCE_PX = 10

      let candidate: KeyboardTapCandidate | null = null
      let suppressedClick: {target: HTMLElement; until: number} | null = null

      const nowMs = () =>
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now()

      const isWithinTextInputLike = (path: Array<EventTarget | undefined>): boolean =>
        path.some((node) => node instanceof HTMLElement && isTextInputLike(node, {includeSelect: true}))

      const resolveActionTarget = (path: Array<EventTarget | undefined>): HTMLElement | null => {
        let fallback: HTMLElement | null = null
        for (const node of path) {
          if (!(node instanceof HTMLElement)) continue
          if (!node.matches(ACTION_TARGET_SELECTOR)) continue
          if (node.matches('cv-button, cv-menu-item')) return node
          if (!fallback) fallback = node
        }
        return fallback
      }

      const clearCandidate = () => {
        if (!candidate) return
        if (candidate.fallbackTimerId !== null) window.clearTimeout(candidate.fallbackTimerId)
        candidate = null
      }

      const eventTargets = (event: Event, element: HTMLElement): boolean =>
        event.composedPath().includes(element)

      const isTapMovement = (event: PointerEvent, currentCandidate: KeyboardTapCandidate): boolean => {
        const deltaX = event.clientX - currentCandidate.startX
        const deltaY = event.clientY - currentCandidate.startY
        return Math.hypot(deltaX, deltaY) <= TAP_MOVEMENT_TOLERANCE_PX
      }

      // --- pointer listeners ---
      document.addEventListener(
        'pointerdown',
        (event: PointerEvent) => {
          if (event.pointerType !== 'touch') return
          if (!document.documentElement.hasAttribute('data-mobile-keyboard-expanded')) return

          const active = getDeepActiveElement()
          if (!active || !isTextInputLike(active, {includeSelect: true})) return

          const path = getPathElements(event)
          if (path.includes(active)) return

          const actionTarget = resolveActionTarget(path)
          if (!actionTarget) return
          if (actionTarget.matches(':disabled, [aria-disabled="true"], [disabled]')) return

          clearCandidate()
          candidate = {
            active,
            target: actionTarget,
            preserveKeyboard: isWithinTextInputLike(path),
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            fallbackTimerId: null,
          }
        },
        {capture: true},
      )

      document.addEventListener(
        'pointermove',
        (event: PointerEvent) => {
          if (!candidate || event.pointerId !== candidate.pointerId) return
          if (!isTapMovement(event, candidate)) clearCandidate()
        },
        {capture: true},
      )

      document.addEventListener(
        'pointerup',
        (event: PointerEvent) => {
          if (!candidate || event.pointerId !== candidate.pointerId) return
          if (!eventTargets(event, candidate.target) || !isTapMovement(event, candidate)) {
            clearCandidate()
            return
          }

          const target = candidate.target
          if (!candidate.preserveKeyboard) {
            candidate.active.blur()
          }
          candidate.fallbackTimerId = window.setTimeout(() => {
            if (!candidate || candidate.target !== target) return
            candidate = null
            target.click()
            suppressedClick = {target, until: nowMs() + 700}
          }, 110)
        },
        {capture: true},
      )

      document.addEventListener(
        'pointercancel',
        (event: PointerEvent) => {
          if (candidate && event.pointerId === candidate.pointerId) clearCandidate()
        },
        {capture: true},
      )

      document.addEventListener(
        'click',
        (event: MouseEvent) => {
          const now = nowMs()
          if (suppressedClick) {
            if (now > suppressedClick.until) {
              suppressedClick = null
            } else if (event.isTrusted && eventTargets(event, suppressedClick.target)) {
              suppressedClick = null
              event.preventDefault()
              event.stopImmediatePropagation()
              return
            }
          }

          if (!candidate || !event.isTrusted) return
          if (!eventTargets(event, candidate.target)) return
          clearCandidate()
        },
        {capture: true},
      )

      // --- native gestures setup (deferred until mobile) ---
      let nativeSetupDone = false
      const tryNativeSetup = () => {
        if (nativeSetupDone || !store.isMobile()) return
        nativeSetupDone = true
        tauriInvoke('setup_native_gestures').catch(() => {})
      }
      tryNativeSetup()
      subscribeToSignalChanges(store.isMobile, tryNativeSetup)
    })
    .catch(() => {})
}
