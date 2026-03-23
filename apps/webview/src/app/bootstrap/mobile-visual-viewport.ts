const VISUAL_VIEWPORT_SHRUNK_ATTR = 'data-visual-viewport-shrunken'
const NATIVE_KEYBOARD_EXPANDED_ATTR = 'data-mobile-keyboard-expanded'

export const getVisualViewportLayoutHeight = ({
  rootClientHeight,
  windowInnerHeight,
  preferRootHeight,
}: {
  rootClientHeight: number
  windowInnerHeight: number
  preferRootHeight: boolean
}): number => {
  if (!Number.isFinite(rootClientHeight) || rootClientHeight <= 0) return 0
  if (preferRootHeight || !Number.isFinite(windowInnerHeight) || windowInnerHeight <= 0) {
    return rootClientHeight
  }

  return Math.min(rootClientHeight, windowInnerHeight)
}

export const getVisualViewportBottomInset = ({
  layoutViewportHeight,
  visualViewportHeight,
  visualViewportOffsetTop,
}: {
  layoutViewportHeight: number
  visualViewportHeight: number
  visualViewportOffsetTop: number
}): number => {
  if (!Number.isFinite(layoutViewportHeight) || layoutViewportHeight <= 0) return 0
  if (!Number.isFinite(visualViewportHeight) || visualViewportHeight <= 0) return 0
  if (!Number.isFinite(visualViewportOffsetTop)) return 0

  const inset = layoutViewportHeight - (visualViewportHeight + visualViewportOffsetTop)
  return inset > 1 ? Math.round(inset) : 0
}

export const setupMobileVisualViewportSync = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  const viewport = window.visualViewport
  if (!viewport) return

  const root = document.documentElement
  let rafId = 0

  const sync = () => {
    rafId = 0

    const layoutViewportHeight = getVisualViewportLayoutHeight({
      rootClientHeight: root.clientHeight,
      windowInnerHeight: window.innerHeight,
      preferRootHeight: root.hasAttribute(NATIVE_KEYBOARD_EXPANDED_ATTR),
    })

    const bottomInset = getVisualViewportBottomInset({
      layoutViewportHeight,
      visualViewportHeight: viewport.height,
      visualViewportOffsetTop: viewport.offsetTop,
    })

    root.style.setProperty('--visual-viewport-bottom-inset', `${bottomInset}px`)
    root.toggleAttribute(VISUAL_VIEWPORT_SHRUNK_ATTR, bottomInset > 0)
  }

  const scheduleSync = () => {
    if (rafId) return
    rafId = window.requestAnimationFrame(sync)
  }

  viewport.addEventListener('resize', scheduleSync)
  viewport.addEventListener('scroll', scheduleSync)
  window.addEventListener('resize', scheduleSync)
  window.addEventListener('orientationchange', scheduleSync)

  scheduleSync()
}
