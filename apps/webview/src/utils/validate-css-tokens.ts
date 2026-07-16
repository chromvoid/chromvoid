type TokenReport = {
  scope: string
  missing: string[]
}

function readVar(el: Element, name: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim()
}

function reportMissing(el: Element, scope: string, names: string[]): TokenReport {
  const missing: string[] = []
  for (const name of names) {
    if (!readVar(el, name)) missing.push(name)
  }
  return {scope, missing}
}

function collectRootRuntimePropertyNames(): string[] {
  const names = new Set<string>()

  const visitRules = (rules: CSSRuleList) => {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) {
        const targetsRoot = rule.selectorText
          .split(',')
          .map((selector) => selector.trim())
          .includes(':root')
        if (targetsRoot) {
          for (let index = 0; index < rule.style.length; index += 1) {
            const name = rule.style.item(index)
            if (name.startsWith('--app-runtime-')) names.add(name)
          }
        }
      }

      const nestedRules = (rule as CSSRule & {cssRules?: CSSRuleList}).cssRules
      if (nestedRules) visitRules(nestedRules)
    }
  }

  for (const styleSheet of document.styleSheets) {
    try {
      visitRules(styleSheet.cssRules)
    } catch {
      // Cross-origin stylesheets are opaque and cannot own Webview runtime values.
    }
  }

  return [...names].sort()
}

export function validateCssTokens(): TokenReport[] {
  const root = document.documentElement

  const cvCore = [
    '--cv-color-bg',
    '--cv-color-surface',
    '--cv-color-surface-2',
    '--cv-color-text',
    '--cv-color-text-muted',
    '--cv-color-border',
    '--cv-color-primary',
    '--cv-color-success',
    '--cv-space-4',
    '--cv-radius-md',
    '--cv-shadow-1',
    '--cv-shadow-2',
    '--cv-duration-fast',
    '--cv-easing-standard',
    '--cv-z-modal',
  ]

  const appCore = [
    '--app-spacing-4',
    '--app-touch-target-min',
    '--cv-gradient-primary',
    '--app-overlay-background',
  ]

  const reports = [
    reportMissing(root, 'ChromVoid CV tokens', cvCore),
    reportMissing(root, 'ChromVoid app tokens', appCore),
    reportMissing(root, 'ChromVoid runtime values', collectRootRuntimePropertyNames()),
  ]

  const missingTotal = reports.reduce((sum, r) => sum + r.missing.length, 0)
  if (missingTotal > 0) {
    console.warn('[chromvoid][css-tokens] Missing CSS variables detected', reports)
  }

  return reports
}

declare global {
  interface Window {
    __chromvoidValidateCssTokens?: () => TokenReport[]
  }
}
