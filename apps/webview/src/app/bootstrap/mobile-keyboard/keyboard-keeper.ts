import {pmMobileDebug} from 'root/features/passmanager/models/pm-mobile-debug'
import {MOBILE_KEYBOARD_SCROLL_ATTR, MOBILE_KEYBOARD_SCROLL_OFF_VALUE} from './constants'
import {getDeepActiveElement, isMobileKeyboardScrollTarget} from './text-field-targets'

/**
 * Keyboard keeper: prevents the Android IME hide/show flash when focus moves
 * from one editor to another through a render cycle (the old editor unmounts,
 * the new one is focused only after render — leaving a frame with no focused
 * editable, which makes the IME collapse and re-open).
 *
 * Hold focuses a hidden off-screen input synchronously inside the user gesture
 * (an input → input transition keeps the IME up); the scheduled focus of the
 * real editor then moves focus keeper → editor, again input → input. If the
 * editor never materializes, a timeout blurs the keeper so the keyboard closes
 * the way it would have without the hold.
 */

const KEEPER_RELEASE_TIMEOUT_MS = 600

let keeperInput: HTMLInputElement | null = null
let releaseTimerId = 0

const keeperDebug = (event: string, details?: Record<string, unknown>): void => {
  pmMobileDebug('keyboardKeeper', event, details)
}

const ensureKeeperInput = (): HTMLInputElement => {
  if (keeperInput?.isConnected) return keeperInput

  const input = document.createElement('input')
  input.type = 'text'
  input.tabIndex = -1
  input.autocomplete = 'off'
  input.setAttribute('aria-hidden', 'true')
  // Our focus-scroll coordinator must ignore the keeper entirely.
  input.setAttribute(MOBILE_KEYBOARD_SCROLL_ATTR, MOBILE_KEYBOARD_SCROLL_OFF_VALUE)
  // Must stay focusable: opacity 0 + 1px, never display:none.
  input.style.cssText =
    'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;border:0;padding:0;pointer-events:none;'
  document.body.append(input)
  keeperInput = input
  return input
}

const clearReleaseTimer = (): void => {
  if (!releaseTimerId) return
  window.clearTimeout(releaseTimerId)
  releaseTimerId = 0
}

const isKeeperFocused = (): boolean =>
  keeperInput !== null && getDeepActiveElement() === keeperInput

/**
 * Park the keyboard on the hidden keeper input. Call synchronously inside the
 * user gesture that is about to swap editors. No-ops unless an editable element
 * currently holds focus (i.e. the keyboard is attributable to a text field).
 */
export function holdMobileKeyboard(reason = 'hold'): void {
  if (typeof document === 'undefined') return

  const active = getDeepActiveElement()
  if (!active || active === keeperInput) return
  if (!isMobileKeyboardScrollTarget(active)) return

  const keeper = ensureKeeperInput()
  try {
    keeper.focus({preventScroll: true})
  } catch {
    keeper.focus()
  }

  if (getDeepActiveElement() !== keeper) return

  keeperDebug('hold', {reason, from: active.localName})
  clearReleaseTimer()
  releaseTimerId = window.setTimeout(() => {
    releaseTimerId = 0
    if (!isKeeperFocused()) return
    keeperInput?.blur()
    keeperDebug('timeout', {reason})
  }, KEEPER_RELEASE_TIMEOUT_MS)
}

/**
 * End the hold. If the real editor already took focus this only clears the
 * fallback timer; if the keeper still holds focus it is blurred so the
 * keyboard closes instead of being parked forever.
 */
export function releaseMobileKeyboardHold(reason = 'release'): void {
  if (typeof document === 'undefined') return

  clearReleaseTimer()
  if (!isKeeperFocused()) return

  keeperInput?.blur()
  keeperDebug('release.blur', {reason})
}
