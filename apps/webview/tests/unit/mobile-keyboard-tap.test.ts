import {atom} from '@reatom/core'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {setupMobileKeyboardTapWorkaround} from '../../src/app/bootstrap/mobile-keyboard-tap'
import {
  ANDROID_KEYBOARD_INSETS_EVENT,
  ANDROID_NATIVE_KEYBOARD_INSETS_ATTR,
  ANDROID_NATIVE_SAFE_AREA_BOTTOM_ATTR,
  IOS_KEYBOARD_INSETS_EVENT,
  IOS_NATIVE_KEYBOARD_INSETS_ATTR,
  IOS_NATIVE_SAFE_AREA_BOTTOM_ATTR,
  MOBILE_KEYBOARD_NATIVE_RESIZE_ATTR,
  NATIVE_KEYBOARD_INSETS_ATTR,
  NATIVE_SAFE_AREA_BOTTOM_ATTR,
  applyMobileKeyboardInsetsPayload,
  applyMobileKeyboardVisibilityPayload,
  getMobileKeyboardPayloadBottomInset,
  setupAndroidKeyboardInsetsEventListener,
  setupIOSKeyboardInsetsEventListener,
} from 'root/app/bootstrap/mobile-keyboard-insets'

const tauriInvoke = vi.fn()
const tauriListen = vi.fn()

type WindowWithNativeKeyboardInsets = Window & {
  __chromvoidAndroidKeyboardInsets?: unknown
  __chromvoidIosKeyboardInsets?: unknown
}

vi.mock('root/core/transport/tauri/ipc', () => ({
  tauriInvoke: (...args: unknown[]) => tauriInvoke(...args),
  tauriListen: (...args: unknown[]) => tauriListen(...args),
}))

async function flushDynamicImport(): Promise<void> {
  await vi.dynamicImportSettled()
  await Promise.resolve()
}

function createTouchPointerEvent(
  type: string,
  options: {clientX?: number; clientY?: number; pointerId?: number} = {},
): PointerEvent {
  const event = new Event(type, {bubbles: true, cancelable: true, composed: true}) as PointerEvent
  Object.defineProperties(event, {
    clientX: {value: options.clientX ?? 0},
    clientY: {value: options.clientY ?? 0},
    pointerId: {value: options.pointerId ?? 1},
    pointerType: {value: 'touch'},
  })
  return event
}

describe('mobile keyboard visibility payload', () => {
  afterEach(() => {
    delete (window as WindowWithNativeKeyboardInsets).__chromvoidAndroidKeyboardInsets
    delete (window as WindowWithNativeKeyboardInsets).__chromvoidIosKeyboardInsets
    document.documentElement.removeAttribute('data-mobile-keyboard-expanded')
    document.documentElement.removeAttribute(NATIVE_KEYBOARD_INSETS_ATTR)
    document.documentElement.removeAttribute(ANDROID_NATIVE_KEYBOARD_INSETS_ATTR)
    document.documentElement.removeAttribute(IOS_NATIVE_KEYBOARD_INSETS_ATTR)
    document.documentElement.removeAttribute(MOBILE_KEYBOARD_NATIVE_RESIZE_ATTR)
    document.documentElement.removeAttribute(NATIVE_SAFE_AREA_BOTTOM_ATTR)
    document.documentElement.removeAttribute(ANDROID_NATIVE_SAFE_AREA_BOTTOM_ATTR)
    document.documentElement.removeAttribute(IOS_NATIVE_SAFE_AREA_BOTTOM_ATTR)
    document.documentElement.style.removeProperty('--safe-area-top-fallback')
    document.documentElement.style.removeProperty('--safe-area-bottom-native')
    document.documentElement.style.removeProperty('--native-keyboard-bottom-inset')
    document.documentElement.style.removeProperty('--visual-viewport-bottom-inset')
    document.documentElement.style.removeProperty('--mobile-keyboard-bottom-inset')
    document.documentElement.style.removeProperty('--mobile-keyboard-scroll-action-offset')
    document.documentElement.style.removeProperty('--mobile-keyboard-scroll-clearance')
    document.documentElement.style.removeProperty('--mobile-keyboard-overlay-offset')
  })

  it('stores a real native keyboard inset when the keyboard is visible', () => {
    applyMobileKeyboardVisibilityPayload(document.documentElement, {
      visible: true,
      bottomInset: 286.4,
    })

    expect(document.documentElement.hasAttribute('data-mobile-keyboard-expanded')).toBe(true)
  })

  it('applies android native progress insets exactly during IME animation', () => {
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
    expect(document.documentElement.hasAttribute(NATIVE_KEYBOARD_INSETS_ATTR)).toBe(true)
    expect(document.documentElement.hasAttribute(ANDROID_NATIVE_SAFE_AREA_BOTTOM_ATTR)).toBe(true)
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
    expect(document.documentElement.hasAttribute(NATIVE_KEYBOARD_INSETS_ATTR)).toBe(false)
    expect(document.documentElement.hasAttribute(ANDROID_NATIVE_KEYBOARD_INSETS_ATTR)).toBe(false)
    expect(document.documentElement.hasAttribute(NATIVE_SAFE_AREA_BOTTOM_ATTR)).toBe(true)
    expect(document.documentElement.hasAttribute(ANDROID_NATIVE_SAFE_AREA_BOTTOM_ATTR)).toBe(true)
  })

  it('applies ios native-resize custom events without visual viewport lift', () => {
    const cleanup = setupIOSKeyboardInsetsEventListener(document.documentElement)

    window.dispatchEvent(
      new CustomEvent(IOS_KEYBOARD_INSETS_EVENT, {
        detail: {
          visible: true,
          bottomInset: 301.6,
          safeAreaTopInset: 58.7,
          safeAreaBottomInset: 34.2,
          phase: 'settled',
          source: 'ios-native',
          viewportMode: 'native-resize',
        },
      }),
    )
    cleanup()

    expect(document.documentElement.hasAttribute(IOS_NATIVE_KEYBOARD_INSETS_ATTR)).toBe(true)
    expect(document.documentElement.hasAttribute(MOBILE_KEYBOARD_NATIVE_RESIZE_ATTR)).toBe(true)
    expect(document.documentElement.style.getPropertyValue('--native-keyboard-bottom-inset')).toBe('302px')
    expect(document.documentElement.style.getPropertyValue('--visual-viewport-bottom-inset')).toBe('0px')
    expect(document.documentElement.style.getPropertyValue('--mobile-keyboard-bottom-inset')).toBe('302px')
    expect(document.documentElement.style.getPropertyValue('--mobile-keyboard-scroll-action-offset')).toBe('0px')
    expect(document.documentElement.style.getPropertyValue('--mobile-keyboard-overlay-offset')).toBe('0px')
  })

  it('ignores malformed ios custom events that are missing native-resize mode', () => {
    const cleanup = setupIOSKeyboardInsetsEventListener(document.documentElement)

    window.dispatchEvent(
      new CustomEvent(IOS_KEYBOARD_INSETS_EVENT, {
        detail: {
          visible: true,
          bottomInset: 301.6,
          source: 'ios-native',
        },
      }),
    )
    cleanup()

    expect(document.documentElement.hasAttribute(IOS_NATIVE_KEYBOARD_INSETS_ATTR)).toBe(false)
    expect(document.documentElement.style.getPropertyValue('--native-keyboard-bottom-inset')).toBe('')
  })

  it('ignores ios native progress custom events', () => {
    const cleanup = setupIOSKeyboardInsetsEventListener(document.documentElement)

    window.dispatchEvent(
      new CustomEvent(IOS_KEYBOARD_INSETS_EVENT, {
        detail: {
          visible: true,
          bottomInset: 301.6,
          safeAreaTopInset: 58.7,
          safeAreaBottomInset: 34.2,
          phase: 'progress',
          source: 'ios-native',
          viewportMode: 'native-resize',
        },
      }),
    )
    cleanup()

    expect(document.documentElement.hasAttribute('data-mobile-keyboard-expanded')).toBe(false)
    expect(document.documentElement.hasAttribute(IOS_NATIVE_KEYBOARD_INSETS_ATTR)).toBe(false)
    expect(document.documentElement.hasAttribute(MOBILE_KEYBOARD_NATIVE_RESIZE_ATTR)).toBe(false)
  })

  it('ignores ios native progress visibility payloads', () => {
    applyMobileKeyboardVisibilityPayload(document.documentElement, {
      visible: true,
      bottomInset: 301.6,
      safeAreaTopInset: 58.7,
      safeAreaBottomInset: 34.2,
      phase: 'progress',
      source: 'ios-native',
      viewportMode: 'native-resize',
    })

    expect(document.documentElement.hasAttribute('data-mobile-keyboard-expanded')).toBe(false)
    expect(document.documentElement.hasAttribute(IOS_NATIVE_KEYBOARD_INSETS_ATTR)).toBe(false)
    expect(document.documentElement.hasAttribute(MOBILE_KEYBOARD_NATIVE_RESIZE_ATTR)).toBe(false)
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

    expect(document.documentElement.hasAttribute(NATIVE_SAFE_AREA_BOTTOM_ATTR)).toBe(true)
    expect(document.documentElement.hasAttribute(ANDROID_NATIVE_SAFE_AREA_BOTTOM_ATTR)).toBe(true)
  })

  it('applies a pending android native inset payload when the listener starts late', () => {
    ;(window as WindowWithNativeKeyboardInsets).__chromvoidAndroidKeyboardInsets = {
      visible: false,
      bottomInset: 0,
      safeAreaTopInset: 30,
      safeAreaBottomInset: 22,
      phase: 'settled',
    }

    const cleanup = setupAndroidKeyboardInsetsEventListener(document.documentElement)
    cleanup()

    expect(document.documentElement.hasAttribute(ANDROID_NATIVE_SAFE_AREA_BOTTOM_ATTR)).toBe(true)
  })

  it('applies a pending ios native-resize inset payload when the listener starts late', () => {
    ;(window as WindowWithNativeKeyboardInsets).__chromvoidIosKeyboardInsets = {
      visible: true,
      bottomInset: 288,
      safeAreaTopInset: 59,
      safeAreaBottomInset: 34,
      phase: 'settled',
      source: 'ios-native',
      viewportMode: 'native-resize',
    }

    const cleanup = setupIOSKeyboardInsetsEventListener(document.documentElement)
    cleanup()

    expect(document.documentElement.hasAttribute(MOBILE_KEYBOARD_NATIVE_RESIZE_ATTR)).toBe(true)
    expect(document.documentElement.style.getPropertyValue('--native-keyboard-bottom-inset')).toBe('288px')
    expect(document.documentElement.style.getPropertyValue('--visual-viewport-bottom-inset')).toBe('0px')
  })

  it('clears the native keyboard inset when the keyboard is hidden', () => {
    applyMobileKeyboardVisibilityPayload(document.documentElement, {
      visible: true,
      bottomInset: 280,
    })

    applyMobileKeyboardVisibilityPayload(document.documentElement, {visible: false})

    expect(document.documentElement.hasAttribute('data-mobile-keyboard-expanded')).toBe(false)
  })

  it('ignores invalid native insets without creating a fallback height', () => {
    expect(getMobileKeyboardPayloadBottomInset({visible: true, bottomInset: Number.NaN})).toBe(0)
    expect(getMobileKeyboardPayloadBottomInset({visible: true, bottomInset: -20})).toBe(0)
    expect(getMobileKeyboardPayloadBottomInset({visible: false, bottomInset: 280})).toBe(0)
  })
})

describe('mobile keyboard tap workaround', () => {
  afterEach(() => {
    tauriInvoke.mockReset()
    tauriListen.mockReset()
    document.body.innerHTML = ''
    document.documentElement.removeAttribute('data-mobile-keyboard-expanded')
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('blurs the focused input before fallback-clicking an external action', async () => {
    tauriInvoke.mockResolvedValue(undefined)
    tauriListen.mockResolvedValue(() => {})
    const isMobile = atom(true)

    setupMobileKeyboardTapWorkaround({isMobile} as any)
    await flushDynamicImport()

    const input = document.createElement('input')
    const action = document.createElement('button')
    document.body.append(input, action)
    input.focus()
    document.documentElement.setAttribute('data-mobile-keyboard-expanded', '')

    vi.useFakeTimers()
    const blurSpy = vi.spyOn(input, 'blur')
    const clickSpy = vi.spyOn(action, 'click')
    action.dispatchEvent(createTouchPointerEvent('pointerdown', {clientX: 12, clientY: 12}))
    action.dispatchEvent(createTouchPointerEvent('pointerup', {clientX: 12, clientY: 12}))
    await vi.advanceTimersByTimeAsync(111)

    expect(blurSpy).toHaveBeenCalledTimes(1)
    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it('does not blur when moving focus from one text input to another', async () => {
    tauriInvoke.mockResolvedValue(undefined)
    tauriListen.mockResolvedValue(() => {})
    const isMobile = atom(true)

    setupMobileKeyboardTapWorkaround({isMobile} as any)
    await flushDynamicImport()

    const input = document.createElement('input')
    const nextInput = document.createElement('input')
    document.body.append(input, nextInput)
    input.focus()
    document.documentElement.setAttribute('data-mobile-keyboard-expanded', '')

    const blurSpy = vi.spyOn(input, 'blur')
    nextInput.dispatchEvent(createTouchPointerEvent('pointerdown', {clientX: 12, clientY: 12}))
    nextInput.dispatchEvent(createTouchPointerEvent('pointerup', {clientX: 12, clientY: 12}))

    expect(blurSpy).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(input)
  })

  it('fallback-clicks actions inside a text field without hiding the keyboard', async () => {
    tauriInvoke.mockResolvedValue(undefined)
    tauriListen.mockResolvedValue(() => {})
    const isMobile = atom(true)

    setupMobileKeyboardTapWorkaround({isMobile} as any)
    await flushDynamicImport()

    const input = document.createElement('input')
    const field = document.createElement('cv-input')
    const action = document.createElement('span')
    action.setAttribute('role', 'button')
    field.append(action)
    document.body.append(input, field)
    input.focus()
    document.documentElement.setAttribute('data-mobile-keyboard-expanded', '')

    vi.useFakeTimers()
    const blurSpy = vi.spyOn(input, 'blur')
    const clickSpy = vi.spyOn(action, 'click')
    action.dispatchEvent(createTouchPointerEvent('pointerdown', {clientX: 12, clientY: 12}))
    action.dispatchEvent(createTouchPointerEvent('pointerup', {clientX: 12, clientY: 12}))
    await vi.advanceTimersByTimeAsync(111)

    expect(blurSpy).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(input)
    expect(clickSpy).toHaveBeenCalled()
  })

  it('keeps the focused input when an action touch turns into a scroll gesture', async () => {
    tauriInvoke.mockResolvedValue(undefined)
    tauriListen.mockResolvedValue(() => {})
    const isMobile = atom(true)

    setupMobileKeyboardTapWorkaround({isMobile} as any)
    await flushDynamicImport()

    const input = document.createElement('input')
    const action = document.createElement('button')
    document.body.append(input, action)
    input.focus()
    document.documentElement.setAttribute('data-mobile-keyboard-expanded', '')

    const blurSpy = vi.spyOn(input, 'blur')
    action.dispatchEvent(createTouchPointerEvent('pointerdown', {clientX: 12, clientY: 12}))
    action.dispatchEvent(createTouchPointerEvent('pointermove', {clientX: 12, clientY: 42}))
    action.dispatchEvent(createTouchPointerEvent('pointerup', {clientX: 12, clientY: 42}))

    expect(blurSpy).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(input)
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
