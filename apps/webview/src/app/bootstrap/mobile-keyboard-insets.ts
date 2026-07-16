import {syncPasswordInputDialogKeyboardOffset} from '../../shared/services/mobile-dialog-keyboard-stabilization'
import {
  MOBILE_KEYBOARD_EXPANDED_ATTR,
  VISUAL_VIEWPORT_SHRUNK_ATTR,
  setMobileKeyboardOccluding,
} from './mobile-keyboard/keyboard-occlusion.model'

export const ANDROID_KEYBOARD_INSETS_EVENT = 'chromvoid:android-keyboard-insets-changed'
export const IOS_KEYBOARD_INSETS_EVENT = 'chromvoid:ios-keyboard-insets-changed'
export const MOBILE_KEYBOARD_BEFORE_INSETS_APPLY_EVENT = 'chromvoid:mobile-keyboard-before-insets-apply'
export const NATIVE_KEYBOARD_INSETS_ATTR = 'data-native-keyboard-insets'
export const ANDROID_NATIVE_KEYBOARD_INSETS_ATTR = 'data-android-native-keyboard-insets'
export const IOS_NATIVE_KEYBOARD_INSETS_ATTR = 'data-ios-native-keyboard-insets'
export const MOBILE_KEYBOARD_NATIVE_RESIZE_ATTR = 'data-mobile-keyboard-native-resize'
export const NATIVE_SAFE_AREA_BOTTOM_ATTR = 'data-native-safe-area-bottom'
export const ANDROID_NATIVE_SAFE_AREA_BOTTOM_ATTR = 'data-android-native-safe-area-bottom'
export const IOS_NATIVE_SAFE_AREA_BOTTOM_ATTR = 'data-ios-native-safe-area-bottom'

export type MobileKeyboardInsetsPhase = 'progress' | 'settled'
export type MobileKeyboardInsetsSource = 'android-native' | 'ios-native' | 'tauri-visibility'
export type MobileKeyboardViewportMode = 'overlay' | 'native-resize'
export type MobileKeyboardInsetsPayload = {
  visible: boolean
  bottomInset?: number | null
  safeAreaTopInset?: number | null
  safeAreaBottomInset?: number | null
  phase?: MobileKeyboardInsetsPhase
  source?: MobileKeyboardInsetsSource
  viewportMode?: MobileKeyboardViewportMode
}

export type MobileKeyboardVisibilityPayload = {
  visible: boolean
  bottomInset?: number | null
  safeAreaTopInset?: number | null
  safeAreaBottomInset?: number | null
  phase?: MobileKeyboardInsetsPhase
  source?: MobileKeyboardInsetsSource
  viewportMode?: MobileKeyboardViewportMode
}

export type MobileKeyboardBeforeInsetsApplyDetail = {
  visible: boolean
  previousBottomInset: number
  nextBottomInset: number
  source: MobileKeyboardInsetsSource
  viewportMode: MobileKeyboardViewportMode
}

type WindowWithNativeKeyboardInsets = Window & {
  __chromvoidAndroidKeyboardInsets?: unknown
  __chromvoidIosKeyboardInsets?: unknown
}

export const getMobileKeyboardPayloadBottomInset = (payload: MobileKeyboardInsetsPayload): number => {
  if (!payload.visible) return 0
  const bottomInset = payload.bottomInset
  if (typeof bottomInset !== 'number' || !Number.isFinite(bottomInset) || bottomInset <= 0) return 0
  return Math.round(bottomInset)
}

const getPayloadSource = (payload: MobileKeyboardInsetsPayload): MobileKeyboardInsetsSource =>
  payload.source ?? 'tauri-visibility'

const getPayloadPhase = (payload: MobileKeyboardInsetsPayload): MobileKeyboardInsetsPhase =>
  payload.phase ?? 'settled'

const getPayloadViewportMode = (payload: MobileKeyboardInsetsPayload): MobileKeyboardViewportMode =>
  payload.viewportMode === 'native-resize' ? 'native-resize' : 'overlay'

const isNativeKeyboardInsetsSource = (source: MobileKeyboardInsetsSource): boolean =>
  source === 'android-native' || source === 'ios-native'

const getCurrentViewportInset = (root: HTMLElement): number => {
  const currentViewportInset = Number.parseFloat(
    getComputedStyle(root).getPropertyValue('--app-runtime-visual-viewport-inset-block-end'),
  )
  return Number.isFinite(currentViewportInset) && currentViewportInset > 0
    ? Math.round(currentViewportInset)
    : 0
}

const readRootCssPx = (root: HTMLElement, name: string): number => {
  const value = Number.parseFloat(getComputedStyle(root).getPropertyValue(name))
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0
}

const getCurrentKeyboardLayoutInset = (root: HTMLElement): number =>
  Math.max(
    readRootCssPx(root, '--app-runtime-keyboard-scroll-clearance'),
    readRootCssPx(root, '--app-runtime-keyboard-overlay-offset'),
    readRootCssPx(root, '--app-runtime-visual-viewport-inset-block-end'),
  )

const getSafeAreaTopInset = (payload: MobileKeyboardInsetsPayload): number | null => {
  const topInset = payload.safeAreaTopInset
  if (typeof topInset !== 'number' || !Number.isFinite(topInset) || topInset < 0) return null
  return Math.round(topInset)
}

const getSafeAreaBottomInset = (payload: MobileKeyboardInsetsPayload): number | null => {
  const bottomInset = payload.safeAreaBottomInset
  if (typeof bottomInset !== 'number' || !Number.isFinite(bottomInset) || bottomInset < 0) return null
  return Math.round(bottomInset)
}

const normalizeKeyboardInset = (keyboardInset: number): number =>
  Number.isFinite(keyboardInset) && keyboardInset > 0 ? Math.round(keyboardInset) : 0

export type MobileKeyboardLayoutOffsets = {
  bottomInset: number
  scrollActionOffset: number
  scrollClearance: number
  overlayOffset: number
}

export const resolveMobileKeyboardLayoutOffsets = (
  keyboardInset: number,
  viewportMode: MobileKeyboardViewportMode = 'overlay',
): MobileKeyboardLayoutOffsets => {
  const bottomInset = normalizeKeyboardInset(keyboardInset)
  const viewportOffset = viewportMode === 'native-resize' ? 0 : bottomInset

  return {
    bottomInset,
    scrollActionOffset: viewportOffset,
    scrollClearance: viewportOffset,
    overlayOffset: viewportOffset,
  }
}

export const applyMobileKeyboardCssOffsets = (
  root: HTMLElement,
  keyboardInset: number,
  viewportMode: MobileKeyboardViewportMode = 'overlay',
): void => {
  const offsets = resolveMobileKeyboardLayoutOffsets(keyboardInset, viewportMode)

  root.style.setProperty('--app-runtime-keyboard-inset-block-end', `${offsets.bottomInset}px`)
  root.style.setProperty('--app-runtime-keyboard-scroll-action-offset', `${offsets.scrollActionOffset}px`)
  root.style.setProperty('--app-runtime-keyboard-scroll-clearance', `${offsets.scrollClearance}px`)
  root.style.setProperty('--app-runtime-keyboard-overlay-offset', `${offsets.overlayOffset}px`)
}

export const applyMobileKeyboardInsetsPayload = (
  root: HTMLElement,
  payload: MobileKeyboardInsetsPayload,
): void => {
  const bottomInset = getMobileKeyboardPayloadBottomInset(payload)
  const source = getPayloadSource(payload)
  const phase = getPayloadPhase(payload)
  const viewportMode = getPayloadViewportMode(payload)
  const usesAndroidNativeInsets = source === 'android-native'
  const usesIOSNativeInsets = source === 'ios-native'
  const usesNativeKeyboardInsets = isNativeKeyboardInsetsSource(source)
  const usesNativeResize = usesNativeKeyboardInsets && viewportMode === 'native-resize'
  const keyboardVisible = payload.visible || bottomInset > 0
  const previousBottomInset = getCurrentKeyboardLayoutInset(root)

  if (typeof window !== 'undefined' && previousBottomInset > 0 && bottomInset === 0) {
    window.dispatchEvent(
      new CustomEvent<MobileKeyboardBeforeInsetsApplyDetail>(MOBILE_KEYBOARD_BEFORE_INSETS_APPLY_EVENT, {
        detail: {
          visible: keyboardVisible,
          previousBottomInset,
          nextBottomInset: bottomInset,
          source,
          viewportMode,
        },
      }),
    )
  }

  root.toggleAttribute(MOBILE_KEYBOARD_EXPANDED_ATTR, keyboardVisible)
  setMobileKeyboardOccluding(keyboardVisible || root.hasAttribute(VISUAL_VIEWPORT_SHRUNK_ATTR))
  root.toggleAttribute(NATIVE_KEYBOARD_INSETS_ATTR, usesNativeKeyboardInsets && keyboardVisible)
  root.toggleAttribute(ANDROID_NATIVE_KEYBOARD_INSETS_ATTR, usesAndroidNativeInsets && keyboardVisible)
  root.toggleAttribute(IOS_NATIVE_KEYBOARD_INSETS_ATTR, usesIOSNativeInsets && keyboardVisible)
  root.toggleAttribute(MOBILE_KEYBOARD_NATIVE_RESIZE_ATTR, usesNativeResize && keyboardVisible)
  root.style.setProperty('--app-runtime-keyboard-native-inset-block-end', `${bottomInset}px`)

  const safeAreaTopInset = usesNativeKeyboardInsets ? getSafeAreaTopInset(payload) : null
  if (safeAreaTopInset !== null) {
    root.style.setProperty('--app-runtime-safe-area-block-start-fallback', `${safeAreaTopInset}px`)
  }

  const safeAreaBottomInset = usesNativeKeyboardInsets ? getSafeAreaBottomInset(payload) : null
  if (usesNativeKeyboardInsets) {
    root.toggleAttribute(NATIVE_SAFE_AREA_BOTTOM_ATTR, safeAreaBottomInset !== null)
    root.toggleAttribute(ANDROID_NATIVE_SAFE_AREA_BOTTOM_ATTR, usesAndroidNativeInsets && safeAreaBottomInset !== null)
    root.toggleAttribute(IOS_NATIVE_SAFE_AREA_BOTTOM_ATTR, usesIOSNativeInsets && safeAreaBottomInset !== null)
    if (safeAreaBottomInset !== null) {
      root.style.setProperty('--app-runtime-safe-area-block-end-native', `${safeAreaBottomInset}px`)
    } else {
      root.style.removeProperty('--app-runtime-safe-area-block-end-native')
    }
  }

  if (bottomInset > 0) {
    const visualViewportInset = usesNativeResize
      ? 0
      : usesNativeKeyboardInsets
        ? bottomInset
        : Math.max(getCurrentViewportInset(root), bottomInset)
    root.style.setProperty('--app-runtime-visual-viewport-inset-block-end', `${visualViewportInset}px`)
    applyMobileKeyboardCssOffsets(root, bottomInset, viewportMode)
  } else {
    root.style.setProperty('--app-runtime-visual-viewport-inset-block-end', '0px')
    applyMobileKeyboardCssOffsets(root, 0, viewportMode)
  }

  syncPasswordInputDialogKeyboardOffset(bottomInset, {phase, source, viewportMode})
}

export const applyMobileKeyboardVisibilityPayload = (
  root: HTMLElement,
  payload: MobileKeyboardVisibilityPayload,
): void => {
  const source = payload.source ?? 'tauri-visibility'
  if (source === 'ios-native') {
    if (payload.phase === 'progress') return
    if (payload.viewportMode !== 'native-resize') return
  }

  applyMobileKeyboardInsetsPayload(root, {
    ...payload,
    phase: payload.phase ?? 'settled',
    source,
  })
}

const normalizeAndroidKeyboardInsetsPayload = (detail: unknown): MobileKeyboardInsetsPayload | null => {
  if (!detail || typeof detail !== 'object') return null

  const record = detail as Record<string, unknown>
  if (typeof record['visible'] !== 'boolean') return null

  const phase = record['phase'] === 'progress' || record['phase'] === 'settled' ? record['phase'] : 'progress'
  const viewportMode = record['viewportMode'] === 'native-resize' ? 'native-resize' : 'overlay'
  return {
    visible: record['visible'],
    bottomInset: typeof record['bottomInset'] === 'number' ? record['bottomInset'] : null,
    safeAreaTopInset: typeof record['safeAreaTopInset'] === 'number' ? record['safeAreaTopInset'] : null,
    safeAreaBottomInset:
      typeof record['safeAreaBottomInset'] === 'number' ? record['safeAreaBottomInset'] : null,
    phase,
    source: 'android-native',
    viewportMode,
  }
}

const normalizeIOSKeyboardInsetsPayload = (detail: unknown): MobileKeyboardInsetsPayload | null => {
  if (!detail || typeof detail !== 'object') return null

  const record = detail as Record<string, unknown>
  if (typeof record['visible'] !== 'boolean') return null
  if (record['source'] !== 'ios-native') return null
  if (record['viewportMode'] !== 'native-resize') return null
  if (record['phase'] === 'progress') return null

  return {
    visible: record['visible'],
    bottomInset: typeof record['bottomInset'] === 'number' ? record['bottomInset'] : null,
    safeAreaTopInset: typeof record['safeAreaTopInset'] === 'number' ? record['safeAreaTopInset'] : null,
    safeAreaBottomInset:
      typeof record['safeAreaBottomInset'] === 'number' ? record['safeAreaBottomInset'] : null,
    phase: 'settled',
    source: 'ios-native',
    viewportMode: 'native-resize',
  }
}

export const getAndroidKeyboardInsetsEventPayload = (event: Event): MobileKeyboardInsetsPayload | null => {
  if (typeof CustomEvent === 'undefined') return null
  if (!(event instanceof CustomEvent)) return null
  return normalizeAndroidKeyboardInsetsPayload(event.detail)
}

export const getIOSKeyboardInsetsEventPayload = (event: Event): MobileKeyboardInsetsPayload | null => {
  if (typeof CustomEvent === 'undefined') return null
  if (!(event instanceof CustomEvent)) return null
  return normalizeIOSKeyboardInsetsPayload(event.detail)
}

export const setupAndroidKeyboardInsetsEventListener = (root: HTMLElement): (() => void) => {
  const handleAndroidKeyboardInsetsEvent = (event: Event) => {
    const payload = getAndroidKeyboardInsetsEventPayload(event)
    if (!payload) return

    applyMobileKeyboardInsetsPayload(root, payload)
  }

  const pendingPayload = normalizeAndroidKeyboardInsetsPayload(
    (window as WindowWithNativeKeyboardInsets).__chromvoidAndroidKeyboardInsets,
  )
  if (pendingPayload) {
    applyMobileKeyboardInsetsPayload(root, pendingPayload)
  }

  window.addEventListener(ANDROID_KEYBOARD_INSETS_EVENT, handleAndroidKeyboardInsetsEvent)
  return () => {
    window.removeEventListener(ANDROID_KEYBOARD_INSETS_EVENT, handleAndroidKeyboardInsetsEvent)
  }
}

export const setupIOSKeyboardInsetsEventListener = (root: HTMLElement): (() => void) => {
  const handleIOSKeyboardInsetsEvent = (event: Event) => {
    const payload = getIOSKeyboardInsetsEventPayload(event)
    if (!payload) return

    applyMobileKeyboardInsetsPayload(root, payload)
  }

  const pendingPayload = normalizeIOSKeyboardInsetsPayload(
    (window as WindowWithNativeKeyboardInsets).__chromvoidIosKeyboardInsets,
  )
  if (pendingPayload) {
    applyMobileKeyboardInsetsPayload(root, pendingPayload)
  }

  window.addEventListener(IOS_KEYBOARD_INSETS_EVENT, handleIOSKeyboardInsetsEvent)
  return () => {
    window.removeEventListener(IOS_KEYBOARD_INSETS_EVENT, handleIOSKeyboardInsetsEvent)
  }
}

export const setupNativeKeyboardInsetsEventListeners = (root: HTMLElement): (() => void) => {
  const cleanupAndroid = setupAndroidKeyboardInsetsEventListener(root)
  const cleanupIOS = setupIOSKeyboardInsetsEventListener(root)
  return () => {
    cleanupAndroid()
    cleanupIOS()
  }
}
