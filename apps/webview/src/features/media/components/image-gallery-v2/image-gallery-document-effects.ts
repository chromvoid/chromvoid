let bodyScrollLockDepth = 0
let previousBodyOverflow = ''

export function lockGalleryBodyScroll(): () => void {
  if (typeof document === 'undefined') {
    return () => {}
  }

  const body = document.body
  if (bodyScrollLockDepth === 0) {
    previousBodyOverflow = body.style.overflow
  }

  bodyScrollLockDepth += 1
  body.style.overflow = 'hidden'

  let released = false
  return () => {
    if (released) {
      return
    }

    released = true
    bodyScrollLockDepth = Math.max(0, bodyScrollLockDepth - 1)
    if (bodyScrollLockDepth === 0) {
      body.style.overflow = previousBodyOverflow
      previousBodyOverflow = ''
    }
  }
}

export function getDeepActiveElement(start?: Document | ShadowRoot): HTMLElement | null {
  const root = start ?? (typeof document === 'undefined' ? null : document)
  let active: Element | null = root?.activeElement ?? null

  while (active instanceof HTMLElement && active.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement
  }

  return active instanceof HTMLElement ? active : null
}
