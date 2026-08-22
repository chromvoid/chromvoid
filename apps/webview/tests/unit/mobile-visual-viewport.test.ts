import {describe, expect, it} from 'vitest'

import {resolveMobileKeyboardLayoutOffsets} from 'root/app/bootstrap/mobile-keyboard-insets'
import {
  getVisualViewportBottomInset,
  getVisualViewportBlockSize,
  getVisualViewportLayoutHeight,
  resolveEffectiveKeyboardInset,
  resolveMobileLayoutViewportBlockSize,
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

describe('resolveMobileLayoutViewportBlockSize', () => {
  it('tracks layout viewport changes while the keyboard is closed', () => {
    expect(
      resolveMobileLayoutViewportBlockSize({
        currentBlockSize: 844,
        nextBlockSize: 700,
        currentlyOccluding: false,
        nextOccluding: false,
      }),
    ).toBe(700)
  })

  it('holds the pre-keyboard layout height throughout opening and closing transitions', () => {
    expect(
      resolveMobileLayoutViewportBlockSize({
        currentBlockSize: 844,
        nextBlockSize: 620,
        currentlyOccluding: true,
        nextOccluding: true,
      }),
    ).toBe(844)

    expect(
      resolveMobileLayoutViewportBlockSize({
        currentBlockSize: 844,
        nextBlockSize: 844,
        currentlyOccluding: true,
        nextOccluding: false,
      }),
    ).toBe(844)
  })

  it('resynchronizes after occlusion is fully closed', () => {
    expect(
      resolveMobileLayoutViewportBlockSize({
        currentBlockSize: 640,
        nextBlockSize: 844,
        currentlyOccluding: false,
        nextOccluding: false,
      }),
    ).toBe(844)
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

  it('keeps a native closed-keyboard payload authoritative over visual viewport noise', () => {
    expect(
      resolveEffectiveKeyboardInset({
        visualViewportKeyboardInset: 96,
        nativeKeyboardInset: 0,
        preferNativeKeyboardInset: true,
      }),
    ).toBe(0)
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

describe('resolveMobileKeyboardLayoutOffsets', () => {
  it('keeps ios native-resized action and overlay offsets at the resized viewport edge', () => {
    expect(resolveMobileKeyboardLayoutOffsets(286.4, 'native-resize')).toEqual({
      bottomInset: 286,
      scrollActionOffset: 0,
      scrollClearance: 0,
      overlayOffset: 0,
    })
  })

  it('moves android-style scroll and overlay action surfaces by the native keyboard overlap', () => {
    expect(resolveMobileKeyboardLayoutOffsets(140)).toEqual({
      bottomInset: 140,
      scrollActionOffset: 140,
      scrollClearance: 140,
      overlayOffset: 140,
    })
  })

  it('keeps android native-resized action and overlay offsets at the resized viewport edge', () => {
    expect(resolveMobileKeyboardLayoutOffsets(286.4, 'native-resize')).toEqual({
      bottomInset: 286,
      scrollActionOffset: 0,
      scrollClearance: 0,
      overlayOffset: 0,
    })
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
