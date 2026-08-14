import {atom} from '@reatom/core'

export const MOBILE_KEYBOARD_EXPANDED_ATTR = 'data-mobile-keyboard-expanded'
export const VISUAL_VIEWPORT_SHRUNK_ATTR = 'data-visual-viewport-shrunken'

export const mobileKeyboardOccluding = atom(false, 'mobileKeyboard.occluding')

const readInitialMobileLayoutViewportBlockSize = (): number => {
  if (typeof document === 'undefined' || typeof window === 'undefined') return 0

  const blockSize = document.documentElement.clientHeight || window.innerHeight
  return Number.isFinite(blockSize) && blockSize > 0 ? Math.round(blockSize) : 0
}

export const mobileLayoutViewportBlockSize = atom(
  readInitialMobileLayoutViewportBlockSize(),
  'mobileKeyboard.layoutViewportBlockSize',
)

export const setMobileKeyboardOccluding = (occluding: boolean): void => {
  if (mobileKeyboardOccluding() === occluding) return
  mobileKeyboardOccluding.set(occluding)
}

export const setMobileLayoutViewportBlockSize = (blockSize: number): void => {
  if (!Number.isFinite(blockSize) || blockSize <= 0) return

  const normalizedBlockSize = Math.round(blockSize)
  if (mobileLayoutViewportBlockSize() === normalizedBlockSize) return
  mobileLayoutViewportBlockSize.set(normalizedBlockSize)
}
