import {getRuntimeCapabilities} from '../../core/runtime/runtime-capabilities'

/**
 * On iOS webviews, override the viewport meta to disable user zoom
 * and enable viewport-fit=cover for safe-area support.
 */
export const syncIOSViewportZoomPolicy = (runtimeIsTauri: boolean) => {
  if (typeof document === 'undefined' || !runtimeIsTauri) return

  const caps = getRuntimeCapabilities()
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const isIOSWebview = caps.platform === 'ios' || /iPhone|iPad|iPod/i.test(userAgent)
  if (!isIOSWebview) return

  const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
  if (!viewport) return

  viewport.setAttribute(
    'content',
    'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content',
  )
}
