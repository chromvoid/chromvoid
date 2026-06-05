import {getRuntimeCapabilities} from '../../core/runtime/runtime-capabilities'
import {syncPasswordInputDialogKeyboardOffset} from '../../shared/services/mobile-dialog-keyboard-stabilization'
import {
  ANDROID_NATIVE_KEYBOARD_INSETS_ATTR,
  applyMobileKeyboardCssOffsets,
  IOS_NATIVE_KEYBOARD_INSETS_ATTR,
  MOBILE_KEYBOARD_NATIVE_RESIZE_ATTR,
  NATIVE_KEYBOARD_INSETS_ATTR,
  NATIVE_SAFE_AREA_BOTTOM_ATTR,
} from './mobile-keyboard-insets'

const VISUAL_VIEWPORT_SHRUNK_ATTR = 'data-visual-viewport-shrunken'
const NATIVE_KEYBOARD_EXPANDED_ATTR = 'data-mobile-keyboard-expanded'
const MIN_KEYBOARD_BOTTOM_INSET = 72
const KEYBOARD_BOTTOM_INSET_VIEWPORT_RATIO = 0.08
const ANDROID_SAFE_AREA_BOTTOM_FALLBACK = 16

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

  const offsetTop = Math.max(0, visualViewportOffsetTop)
  const inset = layoutViewportHeight - (visualViewportHeight + offsetTop)
  return inset > 1 ? Math.round(inset) : 0
}

export const splitVisualViewportBottomInset = ({
  layoutViewportHeight,
  bottomInset,
}: {
  layoutViewportHeight: number
  bottomInset: number
}): {keyboardInset: number; safeAreaInset: number} => {
  if (!Number.isFinite(layoutViewportHeight) || layoutViewportHeight <= 0) {
    return {keyboardInset: 0, safeAreaInset: 0}
  }

  if (!Number.isFinite(bottomInset) || bottomInset <= 0) {
    return {keyboardInset: 0, safeAreaInset: 0}
  }

  // Android WebView can expose the system navigation/gesture inset through
  // visualViewport even when the keyboard is closed. Treat only large bottom
  // insets as keyboard occlusion; keep smaller ones as a safe-area fallback.
  const keyboardThreshold = Math.max(
    MIN_KEYBOARD_BOTTOM_INSET,
    Math.round(layoutViewportHeight * KEYBOARD_BOTTOM_INSET_VIEWPORT_RATIO),
  )

  if (bottomInset >= keyboardThreshold) {
    return {keyboardInset: bottomInset, safeAreaInset: 0}
  }

  return {keyboardInset: 0, safeAreaInset: bottomInset}
}

export const resolveEffectiveKeyboardInset = ({
  visualViewportKeyboardInset,
  nativeKeyboardInset,
  preferNativeKeyboardInset = false,
}: {
  visualViewportKeyboardInset: number
  nativeKeyboardInset: number
  preferNativeKeyboardInset?: boolean
}): number => {
  const normalizedVisualInset =
    Number.isFinite(visualViewportKeyboardInset) && visualViewportKeyboardInset > 0
      ? Math.round(visualViewportKeyboardInset)
      : 0
  const normalizedNativeInset =
    Number.isFinite(nativeKeyboardInset) && nativeKeyboardInset > 0 ? Math.round(nativeKeyboardInset) : 0

  if (preferNativeKeyboardInset && normalizedNativeInset > 0) return normalizedNativeInset

  return Math.max(normalizedVisualInset, normalizedNativeInset)
}

export const resolveSafeAreaBottomFallback = ({
  platform,
  mobile,
  safeAreaInset,
  safeAreaEnvInset,
  nativeSafeAreaBottomInset = 0,
  hasNativeSafeAreaBottom = false,
}: {
  platform: string
  mobile: boolean
  safeAreaInset: number
  safeAreaEnvInset: number
  nativeSafeAreaBottomInset?: number
  hasNativeSafeAreaBottom?: boolean
}): number => {
  const normalizedSafeAreaInset =
    Number.isFinite(safeAreaInset) && safeAreaInset > 0 ? Math.round(safeAreaInset) : 0
  const normalizedSafeAreaEnvInset =
    Number.isFinite(safeAreaEnvInset) && safeAreaEnvInset > 0 ? Math.round(safeAreaEnvInset) : 0
  const normalizedNativeSafeAreaBottomInset =
    Number.isFinite(nativeSafeAreaBottomInset) && nativeSafeAreaBottomInset > 0
      ? Math.round(nativeSafeAreaBottomInset)
      : 0

  if (hasNativeSafeAreaBottom || normalizedNativeSafeAreaBottomInset > 0) return 0

  if (
    platform === 'android' &&
    mobile &&
    normalizedSafeAreaInset === 0 &&
    normalizedSafeAreaEnvInset === 0
  ) {
    return ANDROID_SAFE_AREA_BOTTOM_FALLBACK
  }

  return normalizedSafeAreaInset
}

export const setupMobileVisualViewportSync = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  const viewport = window.visualViewport
  if (!viewport) return

  const root = document.documentElement
  let rafId = 0

  const sync = () => {
    rafId = 0

    const rootClientHeight = root.clientHeight
    const windowInnerHeight = window.innerHeight
    const preferRootHeight = root.hasAttribute(NATIVE_KEYBOARD_EXPANDED_ATTR)
    const layoutViewportHeight = getVisualViewportLayoutHeight({
      rootClientHeight,
      windowInnerHeight,
      preferRootHeight,
    })

    const bottomInset = getVisualViewportBottomInset({
      layoutViewportHeight,
      visualViewportHeight: viewport.height,
      visualViewportOffsetTop: viewport.offsetTop,
    })

    const {keyboardInset, safeAreaInset} = splitVisualViewportBottomInset({
      layoutViewportHeight,
      bottomInset,
    })
    const nativeKeyboardInset = Number.parseFloat(
      getComputedStyle(root).getPropertyValue('--native-keyboard-bottom-inset'),
    )
    const usesAndroidNativeInset = root.hasAttribute(ANDROID_NATIVE_KEYBOARD_INSETS_ATTR)
    const usesIOSNativeInset = root.hasAttribute(IOS_NATIVE_KEYBOARD_INSETS_ATTR)
    const usesNativeResize = root.hasAttribute(MOBILE_KEYBOARD_NATIVE_RESIZE_ATTR)
    const preferNativeKeyboardInset = root.hasAttribute(NATIVE_KEYBOARD_INSETS_ATTR)
    const effectiveKeyboardInset = resolveEffectiveKeyboardInset({
      visualViewportKeyboardInset: keyboardInset,
      nativeKeyboardInset,
      preferNativeKeyboardInset,
    })
    const cssOffsetSource = usesIOSNativeInset
      ? 'ios-native'
      : usesAndroidNativeInset
        ? 'android-native'
        : 'visual-viewport'
    const cssViewportMode = usesNativeResize ? 'native-resize' : 'overlay'
    const runtimeCaps = getRuntimeCapabilities()
    const safeAreaEnvInset = Number.parseFloat(
      getComputedStyle(root).getPropertyValue('--safe-area-bottom-env'),
    )
    const nativeSafeAreaBottomInset = Number.parseFloat(
      getComputedStyle(root).getPropertyValue('--safe-area-bottom-native'),
    )
    const hasNativeSafeAreaBottom = root.hasAttribute(NATIVE_SAFE_AREA_BOTTOM_ATTR)
    const resolvedSafeAreaInset = resolveSafeAreaBottomFallback({
      platform: runtimeCaps.platform,
      mobile: Boolean(runtimeCaps.mobile),
      safeAreaInset,
      safeAreaEnvInset,
      nativeSafeAreaBottomInset,
      hasNativeSafeAreaBottom,
    })

    root.style.setProperty(
      '--visual-viewport-bottom-inset',
      `${usesNativeResize ? 0 : effectiveKeyboardInset}px`,
    )
    applyMobileKeyboardCssOffsets(root, effectiveKeyboardInset, cssOffsetSource, cssViewportMode)
    root.style.setProperty('--safe-area-bottom-fallback', `${resolvedSafeAreaInset}px`)
    root.toggleAttribute(VISUAL_VIEWPORT_SHRUNK_ATTR, effectiveKeyboardInset > 0)
    if (!preferNativeKeyboardInset) {
      syncPasswordInputDialogKeyboardOffset(effectiveKeyboardInset, {
        phase: 'settled',
        source: 'visual-viewport',
      })
    }
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
