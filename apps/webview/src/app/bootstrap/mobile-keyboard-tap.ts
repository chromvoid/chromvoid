import type {Store} from '../state/store'

/**
 * Workaround for mobile keyboards swallowing taps on action elements.
 *
 * When the software keyboard is visible and the user taps a button/link,
 * the browser first dismisses the keyboard and the original tap is lost.
 * This module detects such taps via pointerdown→pointerup and fires a
 * synthetic `.click()` when the trusted click never arrives.
 */
export const setupMobileKeyboardTapWorkaround = (store: Store) => {
  import('root/core/transport/tauri/ipc')
    .then(({tauriInvoke, tauriListen}) => {
      // --- keyboard visibility attribute ---
      tauriListen<{visible: boolean}>('keyboard:visibility-changed', (payload) => {
        document.documentElement.toggleAttribute('data-mobile-keyboard-expanded', payload.visible)
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
        target: HTMLElement
        pointerId: number
        fallbackTimerId: number | null
      }

      let candidate: KeyboardTapCandidate | null = null
      let suppressedClick: {target: HTMLElement; until: number} | null = null

      const nowMs = () =>
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now()

      const getDeepActiveElement = (): HTMLElement | null => {
        let active: Element | null = document.activeElement
        while (active instanceof HTMLElement && active.shadowRoot?.activeElement) {
          active = active.shadowRoot.activeElement
        }
        return active instanceof HTMLElement ? active : null
      }

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
      ])

      const isTextInputLike = (el: HTMLElement): boolean => {
        if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true
        if (el.isContentEditable) return true
        if (!(el instanceof HTMLInputElement)) return false
        return !NON_TEXT_INPUT_TYPES.has(el.type.toLowerCase())
      }

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

      // --- pointer listeners ---
      document.addEventListener(
        'pointerdown',
        (event: PointerEvent) => {
          if (event.pointerType !== 'touch') return
          if (!document.documentElement.hasAttribute('data-mobile-keyboard-expanded')) return

          const active = getDeepActiveElement()
          if (!active || !isTextInputLike(active)) return

          const path = event.composedPath()
          if (path.includes(active)) return

          const actionTarget = resolveActionTarget(path)
          if (!actionTarget) return
          if (actionTarget.matches(':disabled, [aria-disabled="true"], [disabled]')) return

          clearCandidate()
          active.blur()
          candidate = {target: actionTarget, pointerId: event.pointerId, fallbackTimerId: null}
        },
        {capture: true},
      )

      document.addEventListener(
        'pointerup',
        (event: PointerEvent) => {
          if (!candidate || event.pointerId !== candidate.pointerId) return
          if (!eventTargets(event, candidate.target)) {
            clearCandidate()
            return
          }

          const target = candidate.target
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
      store.isMobile.subscribe(tryNativeSetup)
    })
    .catch(() => {})
}
