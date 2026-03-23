import {describe, expect, it} from 'vitest'

import {getVisualViewportBottomInset, getVisualViewportLayoutHeight} from 'root/app/bootstrap/mobile-visual-viewport'

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
})
