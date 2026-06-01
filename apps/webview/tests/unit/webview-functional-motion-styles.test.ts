import {describe, expect, it} from 'vitest'

import {functionalMotionStyles} from '../../src/shared/ui/shared-styles'

describe('functionalMotionStyles', () => {
  const cssText = functionalMotionStyles.cssText

  it('exports the first WebView functional motion primitives', () => {
    expect(cssText).toContain('.motion-panel-reveal')
    expect(cssText).toContain('.motion-text-swap')
    expect(cssText).toContain('.motion-number-pop')
    expect(cssText).toContain('.motion-icon-swap')
    expect(cssText).toContain('.motion-success-check')
  })

  it('uses ChromVoid motion tokens and exact transitioned properties', () => {
    expect(cssText).toContain('var(--cv-duration-fast)')
    expect(cssText).toContain('var(--cv-duration-normal)')
    expect(cssText).toContain('var(--cv-easing-standard)')
    expect(cssText).toContain('var(--cv-easing-decelerate)')
    expect(cssText).toContain('grid-template-rows var(--cv-duration-normal)')
    expect(cssText).not.toContain('transition: all')
  })

  it('defines reduced-motion coverage and no loop-capable animation', () => {
    expect(cssText).toContain('@media (prefers-reduced-motion: reduce)')
    expect(cssText).toMatch(/\.motion-panel-reveal[\s\S]*transform: none;[\s\S]*filter: none;/)
    expect(cssText).toMatch(/\.motion-success-check[\s\S]*animation: none;/)
    expect(cssText).not.toMatch(/\binfinite\b/)
  })
})
