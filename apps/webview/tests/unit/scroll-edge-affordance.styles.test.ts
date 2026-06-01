import {describe, expect, it} from 'vitest'

import {scrollEdgeAffordanceStyles} from '../../src/shared/ui/scroll-edge-affordance.styles'

describe('scroll edge affordance styles', () => {
  it('defines top and bottom scroll edge overlays', () => {
    const cssText = scrollEdgeAffordanceStyles.cssText

    expect(cssText).toContain('.scroll-edge-frame::before')
    expect(cssText).toContain(".scroll-edge-frame[data-scroll-block-start='true']::before")
    expect(cssText).toContain(".scroll-edge-frame[data-scroll-block-end='true']::after")
    expect(cssText).toMatch(/\.scroll-edge-frame::before,\s*\.scroll-edge-frame::after\s*\{[\s\S]*pointer-events: none;/)
    expect(cssText).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*\.scroll-edge-frame::before,\s*\.scroll-edge-frame::after\s*\{[\s\S]*transition: none;/,
    )
  })
})
