export const MOBILE_KEYBOARD_PROGRAMMATIC_SCROLL_EVENT =
  'chromvoid:mobile-keyboard-programmatic-scroll'

export function markMobileKeyboardProgrammaticScroll(reason?: string): void {
  if (typeof document === 'undefined') return

  document.dispatchEvent(
    new CustomEvent(MOBILE_KEYBOARD_PROGRAMMATIC_SCROLL_EVENT, {
      detail: {reason},
      bubbles: true,
      composed: true,
    }),
  )
}
