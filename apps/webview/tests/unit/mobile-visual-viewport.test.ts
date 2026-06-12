import {describe, expect, it} from 'vitest'

import {applyMobileKeyboardCssOffsets} from 'root/app/bootstrap/mobile-keyboard-insets'
import {
  getVisualViewportBottomInset,
  getVisualViewportBlockSize,
  getVisualViewportLayoutHeight,
  resolveEffectiveKeyboardInset,
  resolveSafeAreaBottomFallback,
  splitVisualViewportBottomInset,
} from 'root/app/bootstrap/mobile-visual-viewport'

describe('getVisualViewportLayoutHeight', () => {
  it('keeps the root height when the native keyboard overlay attribute is active', () => {
    expect(
      getVisualViewportLayoutHeight({
        rootClientHeight: 844,
        windowInnerHeight: 522,
        preferRootHeight: true,
      }),
    ).toBe(844)
  })

  it('models resizes-visual behavior by keeping layout height while the visual viewport shrinks', () => {
    const layoutViewportHeight = getVisualViewportLayoutHeight({
      rootClientHeight: 844,
      windowInnerHeight: 844,
      preferRootHeight: false,
    })

    expect(layoutViewportHeight).toBe(844)
    expect(
      getVisualViewportBottomInset({
        layoutViewportHeight,
        visualViewportHeight: 522,
        visualViewportOffsetTop: 0,
      }),
    ).toBe(322)
  })

  it('models resizes-content behavior by returning no keyboard inset when root and window shrink together', () => {
    const layoutViewportHeight = getVisualViewportLayoutHeight({
      rootClientHeight: 522,
      windowInnerHeight: 522,
      preferRootHeight: false,
    })

    expect(layoutViewportHeight).toBe(522)
    expect(
      getVisualViewportBottomInset({
        layoutViewportHeight,
        visualViewportHeight: 522,
        visualViewportOffsetTop: 0,
      }),
    ).toBe(0)
  })

  it('uses the smaller viewport height when the platform already resized the layout viewport', () => {
    expect(
      getVisualViewportLayoutHeight({
        rootClientHeight: 844,
        windowInnerHeight: 522,
        preferRootHeight: false,
      }),
    ).toBe(522)
  })
})

describe('getVisualViewportBlockSize', () => {
  it('uses the visible visualViewport height for keyboard-aware sizing', () => {
    expect(
      getVisualViewportBlockSize({
        visualViewportHeight: 522.4,
        windowInnerHeight: 844,
      }),
    ).toBe(522)
  })

  it('falls back to window.innerHeight when visualViewport reports invalid geometry', () => {
    expect(
      getVisualViewportBlockSize({
        visualViewportHeight: NaN,
        windowInnerHeight: 844.2,
      }),
    ).toBe(844)
  })

  it('returns zero when no valid viewport height is available', () => {
    expect(
      getVisualViewportBlockSize({
        visualViewportHeight: 0,
        windowInnerHeight: NaN,
      }),
    ).toBe(0)
  })
})

describe('getVisualViewportBottomInset', () => {
  it('returns zero when the visual viewport already matches the layout viewport', () => {
    expect(
      getVisualViewportBottomInset({
        layoutViewportHeight: 844,
        visualViewportHeight: 844,
        visualViewportOffsetTop: 0,
      }),
    ).toBe(0)
  })

  it('returns the occluded bottom strip when the keyboard shrinks only the visual viewport', () => {
    expect(
      getVisualViewportBottomInset({
        layoutViewportHeight: 844,
        visualViewportHeight: 522,
        visualViewportOffsetTop: 0,
      }),
    ).toBe(322)
  })

  it('accounts for visual viewport offset before calculating the bottom inset', () => {
    expect(
      getVisualViewportBottomInset({
        layoutViewportHeight: 844,
        visualViewportHeight: 522,
        visualViewportOffsetTop: 24,
      }),
    ).toBe(298)
  })

  it('clamps invalid and negative values to zero', () => {
    expect(
      getVisualViewportBottomInset({
        layoutViewportHeight: 844,
        visualViewportHeight: 900,
        visualViewportOffsetTop: 0,
      }),
    ).toBe(0)

    expect(
      getVisualViewportBottomInset({
        layoutViewportHeight: NaN,
        visualViewportHeight: 500,
        visualViewportOffsetTop: 0,
      }),
    ).toBe(0)
  })

  it('treats a negative offsetTop as zero so transient browser noise does not inflate the inset', () => {
    expect(
      getVisualViewportBottomInset({
        layoutViewportHeight: 844,
        visualViewportHeight: 522,
        visualViewportOffsetTop: -32,
      }),
    ).toBe(322)
  })
})

describe('splitVisualViewportBottomInset', () => {
  it('keeps small bottom insets as safe-area fallback instead of keyboard occlusion', () => {
    expect(
      splitVisualViewportBottomInset({
        layoutViewportHeight: 844,
        bottomInset: 24,
      }),
    ).toEqual({
      keyboardInset: 0,
      safeAreaInset: 24,
    })
  })

  it('treats large bottom insets as keyboard occlusion', () => {
    expect(
      splitVisualViewportBottomInset({
        layoutViewportHeight: 844,
        bottomInset: 322,
      }),
    ).toEqual({
      keyboardInset: 322,
      safeAreaInset: 0,
    })
  })

  it('returns zeroed insets for invalid values', () => {
    expect(
      splitVisualViewportBottomInset({
        layoutViewportHeight: NaN,
        bottomInset: 24,
      }),
    ).toEqual({
      keyboardInset: 0,
      safeAreaInset: 0,
    })

    expect(
      splitVisualViewportBottomInset({
        layoutViewportHeight: 844,
        bottomInset: -24,
      }),
    ).toEqual({
      keyboardInset: 0,
      safeAreaInset: 0,
    })
  })
})

describe('resolveEffectiveKeyboardInset', () => {
  it('prefers the largest real keyboard inset from visualViewport and native payloads', () => {
    expect(
      resolveEffectiveKeyboardInset({
        visualViewportKeyboardInset: 240,
        nativeKeyboardInset: 280,
      }),
    ).toBe(280)

    expect(
      resolveEffectiveKeyboardInset({
        visualViewportKeyboardInset: 320,
        nativeKeyboardInset: 280,
      }),
    ).toBe(320)
  })

  it('uses native android IME insets as source of truth during native animation', () => {
    expect(
      resolveEffectiveKeyboardInset({
        visualViewportKeyboardInset: 320,
        nativeKeyboardInset: 140,
        preferNativeKeyboardInset: true,
      }),
    ).toBe(140)
  })

  it('uses native mobile insets as source of truth when native geometry is active', () => {
    expect(
      resolveEffectiveKeyboardInset({
        visualViewportKeyboardInset: 520,
        nativeKeyboardInset: 286,
        preferNativeKeyboardInset: true,
      }),
    ).toBe(286)
  })

  it('ignores invalid native keyboard inset values instead of inventing fallback height', () => {
    expect(
      resolveEffectiveKeyboardInset({
        visualViewportKeyboardInset: 0,
        nativeKeyboardInset: NaN,
      }),
    ).toBe(0)

    expect(
      resolveEffectiveKeyboardInset({
        visualViewportKeyboardInset: 0,
        nativeKeyboardInset: -1,
      }),
    ).toBe(0)
  })
})

describe('applyMobileKeyboardCssOffsets', () => {
  it('keeps ios native-resized action and overlay offsets at the resized viewport edge', () => {
    applyMobileKeyboardCssOffsets(document.documentElement, 286.4, 'ios-native', 'native-resize')

    expect(document.documentElement.style.getPropertyValue('--mobile-keyboard-bottom-inset')).toBe('286px')
    expect(document.documentElement.style.getPropertyValue('--mobile-keyboard-scroll-action-offset')).toBe('0px')
    expect(document.documentElement.style.getPropertyValue('--mobile-keyboard-scroll-clearance')).toBe('0px')
    expect(document.documentElement.style.getPropertyValue('--mobile-keyboard-overlay-offset')).toBe('0px')

    document.documentElement.style.removeProperty('--mobile-keyboard-bottom-inset')
    document.documentElement.style.removeProperty('--mobile-keyboard-scroll-action-offset')
    document.documentElement.style.removeProperty('--mobile-keyboard-scroll-clearance')
    document.documentElement.style.removeProperty('--mobile-keyboard-overlay-offset')
  })

  it('moves android-style scroll and overlay action surfaces by the native keyboard overlap', () => {
    applyMobileKeyboardCssOffsets(document.documentElement, 140, 'android-native')

    expect(document.documentElement.style.getPropertyValue('--mobile-keyboard-bottom-inset')).toBe('140px')
    expect(document.documentElement.style.getPropertyValue('--mobile-keyboard-scroll-action-offset')).toBe('140px')
    expect(document.documentElement.style.getPropertyValue('--mobile-keyboard-scroll-clearance')).toBe('140px')
    expect(document.documentElement.style.getPropertyValue('--mobile-keyboard-overlay-offset')).toBe('140px')

    document.documentElement.style.removeProperty('--mobile-keyboard-bottom-inset')
    document.documentElement.style.removeProperty('--mobile-keyboard-scroll-action-offset')
    document.documentElement.style.removeProperty('--mobile-keyboard-scroll-clearance')
    document.documentElement.style.removeProperty('--mobile-keyboard-overlay-offset')
  })
})

describe('resolveSafeAreaBottomFallback', () => {
  it('keeps the detected safe-area inset when visualViewport already exposed it', () => {
    expect(
      resolveSafeAreaBottomFallback({
        platform: 'android',
        mobile: true,
        safeAreaInset: 24,
        safeAreaEnvInset: 0,
      }),
    ).toBe(24)
  })

  it('adds an android fallback when both env and visualViewport report zero', () => {
    expect(
      resolveSafeAreaBottomFallback({
        platform: 'android',
        mobile: true,
        safeAreaInset: 0,
        safeAreaEnvInset: 0,
      }),
    ).toBe(16)
  })

  it('does not invent an android fallback when native bottom safe-area is available', () => {
    expect(
      resolveSafeAreaBottomFallback({
        platform: 'android',
        mobile: true,
        safeAreaInset: 0,
        safeAreaEnvInset: 0,
        nativeSafeAreaBottomInset: 24,
      }),
    ).toBe(0)

    expect(
      resolveSafeAreaBottomFallback({
        platform: 'android',
        mobile: true,
        safeAreaInset: 0,
        safeAreaEnvInset: 0,
        hasNativeSafeAreaBottom: true,
      }),
    ).toBe(0)
  })

  it('does not invent a fallback outside android mobile runtime', () => {
    expect(
      resolveSafeAreaBottomFallback({
        platform: 'ios',
        mobile: true,
        safeAreaInset: 0,
        safeAreaEnvInset: 0,
      }),
    ).toBe(0)

    expect(
      resolveSafeAreaBottomFallback({
        platform: 'android',
        mobile: false,
        safeAreaInset: 0,
        safeAreaEnvInset: 0,
      }),
    ).toBe(0)
  })
})
