import {syncPasswordInputDialogKeyboardOffset} from '../../shared/services/mobile-dialog-keyboard-stabilization'

export const ANDROID_KEYBOARD_INSETS_EVENT = 'chromvoid:android-keyboard-insets-changed'
export const ANDROID_NATIVE_KEYBOARD_INSETS_ATTR = 'data-android-native-keyboard-insets'
export const ANDROID_NATIVE_SAFE_AREA_BOTTOM_ATTR = 'data-android-native-safe-area-bottom'

export type MobileKeyboardInsetsPhase = 'progress' | 'settled'
export type MobileKeyboardInsetsSource = 'android-native' | 'tauri-visibility'

export type MobileKeyboardInsetsPayload = {
  visible: boolean
  bottomInset?: number | null
  safeAreaTopInset?: number | null
  safeAreaBottomInset?: number | null
  phase?: MobileKeyboardInsetsPhase
  source?: MobileKeyboardInsetsSource
}

export type MobileKeyboardVisibilityPayload = {
  visible: boolean
  bottomInset?: number | null
}

type WindowWithAndroidKeyboardInsets = Window & {
  __chromvoidAndroidKeyboardInsets?: unknown
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

const getCurrentViewportInset = (root: HTMLElement): number => {
  const currentViewportInset = Number.parseFloat(
    getComputedStyle(root).getPropertyValue('--visual-viewport-bottom-inset'),
  )
  return Number.isFinite(currentViewportInset) && currentViewportInset > 0
    ? Math.round(currentViewportInset)
    : 0
}

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

export const applyMobileKeyboardInsetsPayload = (
  root: HTMLElement,
  payload: MobileKeyboardInsetsPayload,
): void => {
  const bottomInset = getMobileKeyboardPayloadBottomInset(payload)
  const source = getPayloadSource(payload)
  const phase = getPayloadPhase(payload)
  const usesAndroidNativeInsets = source === 'android-native'
  const keyboardVisible = payload.visible || bottomInset > 0

  root.toggleAttribute('data-mobile-keyboard-expanded', keyboardVisible)
  root.toggleAttribute(ANDROID_NATIVE_KEYBOARD_INSETS_ATTR, usesAndroidNativeInsets && keyboardVisible)
  root.style.setProperty('--native-keyboard-bottom-inset', `${bottomInset}px`)

  const safeAreaTopInset = usesAndroidNativeInsets ? getSafeAreaTopInset(payload) : null
  if (safeAreaTopInset !== null) {
    root.style.setProperty('--safe-area-top-fallback', `${safeAreaTopInset}px`)
  }

  const safeAreaBottomInset = usesAndroidNativeInsets ? getSafeAreaBottomInset(payload) : null
  if (usesAndroidNativeInsets) {
    root.toggleAttribute(ANDROID_NATIVE_SAFE_AREA_BOTTOM_ATTR, safeAreaBottomInset !== null)
    if (safeAreaBottomInset !== null) {
      root.style.setProperty('--safe-area-bottom-native', `${safeAreaBottomInset}px`)
    } else {
      root.style.removeProperty('--safe-area-bottom-native')
    }
  }

  if (bottomInset > 0) {
    const visualViewportInset = usesAndroidNativeInsets
      ? bottomInset
      : Math.max(getCurrentViewportInset(root), bottomInset)
    root.style.setProperty('--visual-viewport-bottom-inset', `${visualViewportInset}px`)
  } else if (!payload.visible) {
    root.style.setProperty('--visual-viewport-bottom-inset', '0px')
  }

  syncPasswordInputDialogKeyboardOffset(bottomInset, {phase, source})
}

export const applyMobileKeyboardVisibilityPayload = (
  root: HTMLElement,
  payload: MobileKeyboardVisibilityPayload,
): void => {
  applyMobileKeyboardInsetsPayload(root, {
    ...payload,
    phase: 'settled',
    source: 'tauri-visibility',
  })
}

const normalizeAndroidKeyboardInsetsPayload = (detail: unknown): MobileKeyboardInsetsPayload | null => {
  if (!detail || typeof detail !== 'object') return null

  const record = detail as Record<string, unknown>
  if (typeof record['visible'] !== 'boolean') return null

  const phase = record['phase'] === 'progress' || record['phase'] === 'settled' ? record['phase'] : 'progress'
  return {
    visible: record['visible'],
    bottomInset: typeof record['bottomInset'] === 'number' ? record['bottomInset'] : null,
    safeAreaTopInset: typeof record['safeAreaTopInset'] === 'number' ? record['safeAreaTopInset'] : null,
    safeAreaBottomInset:
      typeof record['safeAreaBottomInset'] === 'number' ? record['safeAreaBottomInset'] : null,
    phase,
    source: 'android-native',
  }
}

export const getAndroidKeyboardInsetsEventPayload = (event: Event): MobileKeyboardInsetsPayload | null => {
  if (typeof CustomEvent === 'undefined') return null
  if (!(event instanceof CustomEvent)) return null
  return normalizeAndroidKeyboardInsetsPayload(event.detail)
}

export const setupAndroidKeyboardInsetsEventListener = (root: HTMLElement): (() => void) => {
  const handleAndroidKeyboardInsetsEvent = (event: Event) => {
    const payload = getAndroidKeyboardInsetsEventPayload(event)
    if (!payload) return

    applyMobileKeyboardInsetsPayload(root, payload)
  }

  const pendingPayload = normalizeAndroidKeyboardInsetsPayload(
    (window as WindowWithAndroidKeyboardInsets).__chromvoidAndroidKeyboardInsets,
  )
  if (pendingPayload) {
    applyMobileKeyboardInsetsPayload(root, pendingPayload)
  }

  window.addEventListener(ANDROID_KEYBOARD_INSETS_EVENT, handleAndroidKeyboardInsetsEvent)
  return () => {
    window.removeEventListener(ANDROID_KEYBOARD_INSETS_EVENT, handleAndroidKeyboardInsetsEvent)
  }
}
