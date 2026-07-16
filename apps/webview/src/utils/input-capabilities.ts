export const TOUCH_FIRST_POINTER_MEDIA = '(hover: none) and (pointer: coarse)'
export const FINE_POINTER_MEDIA = '(pointer: fine)'

export function matchesInputMedia(query: string): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false

  try {
    return window.matchMedia(query).matches
  } catch {
    return false
  }
}

export function hasTouchFirstPointer(): boolean {
  return matchesInputMedia(TOUCH_FIRST_POINTER_MEDIA)
}

export function hasFinePointer(): boolean {
  return matchesInputMedia(FINE_POINTER_MEDIA)
}
