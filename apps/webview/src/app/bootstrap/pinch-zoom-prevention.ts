/**
 * Prevent pinch-zoom and Safari gesture-zoom everywhere except inside <image-gallery>.
 */
export const setupPinchZoomPrevention = () => {
  const isInsideGallery = (el: EventTarget | null): boolean => {
    if (!(el instanceof Node)) return false
    let node: Node | null = el
    while (node) {
      if (node instanceof HTMLElement && node.tagName === 'IMAGE-GALLERY') return true
      node = node.parentNode ?? (node as unknown as ShadowRoot).host ?? null
    }
    return false
  }

  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length >= 2 && !isInsideGallery(e.target)) {
        e.preventDefault()
      }
    },
    {passive: false},
  )

  document.addEventListener(
    'gesturestart',
    (e) => {
      if (!isInsideGallery(e.target)) e.preventDefault()
    },
    {passive: false} as EventListenerOptions,
  )

  document.addEventListener(
    'gesturechange',
    (e) => {
      if (!isInsideGallery(e.target)) e.preventDefault()
    },
    {passive: false} as EventListenerOptions,
  )
}
