import {atom} from '@reatom/core'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {setupMobileKeyboardTapWorkaround} from '../../src/app/bootstrap/mobile-keyboard-tap'
import {
  ANDROID_KEYBOARD_INSETS_EVENT,
  ANDROID_NATIVE_KEYBOARD_INSETS_ATTR,
  ANDROID_NATIVE_SAFE_AREA_BOTTOM_ATTR,
  applyMobileKeyboardInsetsPayload,
  applyMobileKeyboardVisibilityPayload,
  getMobileKeyboardPayloadBottomInset,
  setupAndroidKeyboardInsetsEventListener,
} from 'root/app/bootstrap/mobile-keyboard-insets'

const tauriInvoke = vi.fn()
const tauriListen = vi.fn()

vi.mock('root/core/transport/tauri/ipc', () => ({
  tauriInvoke: (...args: unknown[]) => tauriInvoke(...args),
  tauriListen: (...args: unknown[]) => tauriListen(...args),
}))

async function flushDynamicImport(): Promise<void> {
  await vi.dynamicImportSettled()
  await Promise.resolve()
}

describe('mobile keyboard visibility payload', () => {
  afterEach(() => {
    delete (window as Window & {__chromvoidAndroidKeyboardInsets?: unknown}).__chromvoidAndroidKeyboardInsets
    document.documentElement.removeAttribute('data-mobile-keyboard-expanded')
    document.documentElement.removeAttribute(ANDROID_NATIVE_KEYBOARD_INSETS_ATTR)
    document.documentElement.removeAttribute(ANDROID_NATIVE_SAFE_AREA_BOTTOM_ATTR)
    document.documentElement.style.removeProperty('--safe-area-top-fallback')
    document.documentElement.style.removeProperty('--safe-area-bottom-native')
    document.documentElement.style.removeProperty('--native-keyboard-bottom-inset')
    document.documentElement.style.removeProperty('--visual-viewport-bottom-inset')
  })

  it('stores a real native keyboard inset when the keyboard is visible', () => {
    applyMobileKeyboardVisibilityPayload(document.documentElement, {
      visible: true,
      bottomInset: 286.4,
    })

    expect(document.documentElement.hasAttribute('data-mobile-keyboard-expanded')).toBe(true)
    expect(document.documentElement.style.getPropertyValue('--native-keyboard-bottom-inset')).toBe('286px')
    expect(document.documentElement.style.getPropertyValue('--visual-viewport-bottom-inset')).toBe('286px')
  })

  it('keeps a larger visual viewport inset when the native inset is smaller', () => {
    document.documentElement.style.setProperty('--visual-viewport-bottom-inset', '320px')

    applyMobileKeyboardVisibilityPayload(document.documentElement, {
      visible: true,
      bottomInset: 280,
    })

    expect(document.documentElement.style.getPropertyValue('--native-keyboard-bottom-inset')).toBe('280px')
    expect(document.documentElement.style.getPropertyValue('--visual-viewport-bottom-inset')).toBe('320px')
  })

  it('applies android native progress insets exactly during IME animation', () => {
    document.documentElement.style.setProperty('--visual-viewport-bottom-inset', '320px')

    applyMobileKeyboardInsetsPayload(document.documentElement, {
      visible: true,
      bottomInset: 140,
      safeAreaTopInset: 24,
      safeAreaBottomInset: 18,
      phase: 'progress',
      source: 'android-native',
    })

    expect(document.documentElement.hasAttribute('data-mobile-keyboard-expanded')).toBe(true)
    expect(document.documentElement.hasAttribute(ANDROID_NATIVE_KEYBOARD_INSETS_ATTR)).toBe(true)
    expect(document.documentElement.hasAttribute(ANDROID_NATIVE_SAFE_AREA_BOTTOM_ATTR)).toBe(true)
    expect(document.documentElement.style.getPropertyValue('--safe-area-top-fallback')).toBe('24px')
    expect(document.documentElement.style.getPropertyValue('--safe-area-bottom-native')).toBe('18px')
    expect(document.documentElement.style.getPropertyValue('--native-keyboard-bottom-inset')).toBe('140px')
    expect(document.documentElement.style.getPropertyValue('--visual-viewport-bottom-inset')).toBe('140px')
  })

  it('applies android native custom events to keyboard inset state', () => {
    const cleanup = setupAndroidKeyboardInsetsEventListener(document.documentElement)

    window.dispatchEvent(
      new CustomEvent(ANDROID_KEYBOARD_INSETS_EVENT, {
        detail: {
          visible: true,
          bottomInset: 188.2,
          safeAreaTopInset: 27.7,
          safeAreaBottomInset: 19.2,
          phase: 'progress',
        },
      }),
    )
    cleanup()

    expect(document.documentElement.hasAttribute(ANDROID_NATIVE_KEYBOARD_INSETS_ATTR)).toBe(true)
    expect(document.documentElement.hasAttribute(ANDROID_NATIVE_SAFE_AREA_BOTTOM_ATTR)).toBe(true)
    expect(document.documentElement.style.getPropertyValue('--safe-area-top-fallback')).toBe('28px')
    expect(document.documentElement.style.getPropertyValue('--safe-area-bottom-native')).toBe('19px')
    expect(document.documentElement.style.getPropertyValue('--native-keyboard-bottom-inset')).toBe('188px')
    expect(document.documentElement.style.getPropertyValue('--visual-viewport-bottom-inset')).toBe('188px')
  })

  it('applies android native safe-area custom events when the keyboard is hidden', () => {
    const cleanup = setupAndroidKeyboardInsetsEventListener(document.documentElement)

    window.dispatchEvent(
      new CustomEvent(ANDROID_KEYBOARD_INSETS_EVENT, {
        detail: {
          visible: false,
          bottomInset: 0,
          safeAreaTopInset: 50,
          safeAreaBottomInset: 18,
          phase: 'settled',
        },
      }),
    )
    cleanup()

    expect(document.documentElement.hasAttribute('data-mobile-keyboard-expanded')).toBe(false)
    expect(document.documentElement.hasAttribute(ANDROID_NATIVE_KEYBOARD_INSETS_ATTR)).toBe(false)
    expect(document.documentElement.hasAttribute(ANDROID_NATIVE_SAFE_AREA_BOTTOM_ATTR)).toBe(true)
    expect(document.documentElement.style.getPropertyValue('--safe-area-top-fallback')).toBe('50px')
    expect(document.documentElement.style.getPropertyValue('--safe-area-bottom-native')).toBe('18px')
    expect(document.documentElement.style.getPropertyValue('--visual-viewport-bottom-inset')).toBe('0px')
  })

  it('treats zero android native bottom safe-area as an explicit value', () => {
    applyMobileKeyboardInsetsPayload(document.documentElement, {
      visible: false,
      bottomInset: 0,
      safeAreaTopInset: 24,
      safeAreaBottomInset: 0,
      phase: 'settled',
      source: 'android-native',
    })

    expect(document.documentElement.hasAttribute(ANDROID_NATIVE_SAFE_AREA_BOTTOM_ATTR)).toBe(true)
    expect(document.documentElement.style.getPropertyValue('--safe-area-bottom-native')).toBe('0px')
  })

  it('applies a pending android native inset payload when the listener starts late', () => {
    ;(window as Window & {__chromvoidAndroidKeyboardInsets?: unknown}).__chromvoidAndroidKeyboardInsets = {
      visible: false,
      bottomInset: 0,
      safeAreaTopInset: 30,
      safeAreaBottomInset: 22,
      phase: 'settled',
    }

    const cleanup = setupAndroidKeyboardInsetsEventListener(document.documentElement)
    cleanup()

    expect(document.documentElement.style.getPropertyValue('--safe-area-top-fallback')).toBe('30px')
    expect(document.documentElement.style.getPropertyValue('--safe-area-bottom-native')).toBe('22px')
  })

  it('clears the native keyboard inset when the keyboard is hidden', () => {
    applyMobileKeyboardVisibilityPayload(document.documentElement, {
      visible: true,
      bottomInset: 280,
    })

    applyMobileKeyboardVisibilityPayload(document.documentElement, {visible: false})

    expect(document.documentElement.hasAttribute('data-mobile-keyboard-expanded')).toBe(false)
    expect(document.documentElement.style.getPropertyValue('--native-keyboard-bottom-inset')).toBe('0px')
    expect(document.documentElement.style.getPropertyValue('--visual-viewport-bottom-inset')).toBe('0px')
  })

  it('ignores invalid native insets without creating a fallback height', () => {
    expect(getMobileKeyboardPayloadBottomInset({visible: true, bottomInset: Number.NaN})).toBe(0)
    expect(getMobileKeyboardPayloadBottomInset({visible: true, bottomInset: -20})).toBe(0)
    expect(getMobileKeyboardPayloadBottomInset({visible: false, bottomInset: 280})).toBe(0)
  })
})

describe('mobile keyboard native gesture setup', () => {
  afterEach(() => {
    tauriInvoke.mockReset()
    tauriListen.mockReset()
    document.documentElement.removeAttribute('data-mobile-keyboard-expanded')
  })

  it('does not duplicate native setup from the synchronous initial mobile callback', async () => {
    tauriInvoke.mockResolvedValue(undefined)
    tauriListen.mockResolvedValue(() => {})
    const isMobile = atom(true)

    setupMobileKeyboardTapWorkaround({isMobile} as any)
    await flushDynamicImport()

    expect(tauriInvoke.mock.calls.filter(([cmd]) => cmd === 'setup_native_gestures')).toHaveLength(1)
  })

  it('runs native setup when mobile becomes true after bootstrap', async () => {
    tauriInvoke.mockResolvedValue(undefined)
    tauriListen.mockResolvedValue(() => {})
    const isMobile = atom(false)

    setupMobileKeyboardTapWorkaround({isMobile} as any)
    await flushDynamicImport()
    expect(tauriInvoke.mock.calls.filter(([cmd]) => cmd === 'setup_native_gestures')).toHaveLength(0)

    isMobile.set(true)
    await Promise.resolve()

    expect(tauriInvoke.mock.calls.filter(([cmd]) => cmd === 'setup_native_gestures')).toHaveLength(1)
  })
})
