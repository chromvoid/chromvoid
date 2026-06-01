import {describe, expect, it} from 'vitest'

import {commandBarStyles} from '../../src/features/file-manager/components/command-bar.styles'

function stylesToText(styles: unknown): string {
  const values = Array.isArray(styles) ? styles : [styles]
  return values
    .map((value) => {
      if (value == null) return ''
      return typeof value === 'object' && 'cssText' in (value as object)
        ? String((value as {cssText: string}).cssText)
        : String(value)
    })
    .join('\n')
}

function ruleFor(cssText: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return cssText.match(new RegExp(`${escapedSelector}\\s*{[\\s\\S]*?}`))?.[0] ?? ''
}

function declarationValue(rule: string, property: string): string {
  return rule.match(new RegExp(`${property}:\\s*([\\s\\S]*?);`))?.[1] ?? ''
}

describe('command-bar motion contract', () => {
  const cssText = stylesToText(commandBarStyles)

  it('keeps dialog motion opacity-only with static centering transform', () => {
    const dialogRule = ruleFor(cssText, '.dialog')
    const openDialogRule = ruleFor(cssText, ':host([open]) .dialog')
    const dialogTransition = declarationValue(dialogRule, 'transition')

    expect(cssText).not.toContain('scale(')
    expect(dialogRule).toContain('transform: translateX(-50%);')
    expect(dialogTransition).toContain('opacity var(--cv-duration-normal, 220ms)')
    expect(dialogTransition).not.toContain('transform')
    expect(openDialogRule).not.toContain('transform:')
  })

  it('uses canonical motion tokens for command surface opacity transitions', () => {
    const backdropRule = ruleFor(cssText, '.backdrop')
    const dialogRule = ruleFor(cssText, '.dialog')
    const backdropTransition = declarationValue(backdropRule, 'transition')
    const dialogTransition = declarationValue(dialogRule, 'transition')

    expect(backdropTransition).toContain('opacity var(--cv-duration-normal, 220ms)')
    expect(backdropTransition).toContain('var(--cv-easing-standard, cubic-bezier(0.2, 0, 0, 1))')
    expect(dialogTransition).toContain('opacity var(--cv-duration-normal, 220ms)')
    expect(dialogTransition).toContain('var(--cv-easing-standard, cubic-bezier(0.2, 0, 0, 1))')
    expect(cssText).not.toContain('--ease-out-')
  })

  it('defines explicit reduced-motion coverage for the backdrop and dialog', () => {
    expect(cssText).toContain('@media (prefers-reduced-motion: reduce)')
    expect(cssText).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.backdrop,\s*\.dialog\s*{[\s\S]*transition-duration: var\(--cv-duration-instant, 0ms\);/,
    )
  })

  it('does not wire the future command-surface View Transition API name', () => {
    expect(cssText).not.toContain('view-transition-name: command-surface')
  })
})
