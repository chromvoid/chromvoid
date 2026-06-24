import {atom} from '@reatom/core'

export const MOBILE_KEYBOARD_EXPANDED_ATTR = 'data-mobile-keyboard-expanded'
export const VISUAL_VIEWPORT_SHRUNK_ATTR = 'data-visual-viewport-shrunken'

export const mobileKeyboardOccluding = atom(false, 'mobileKeyboard.occluding')

export const setMobileKeyboardOccluding = (occluding: boolean): void => {
  if (mobileKeyboardOccluding() === occluding) return
  mobileKeyboardOccluding.set(occluding)
}
