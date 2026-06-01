import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {setLang as setAppLang} from '../../src/i18n'
import {SettingsPage} from '../../src/routes/settings/settings-page'

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

let defined = false

function ensureDefined() {
  if (defined) return
  SettingsPage.define()
  defined = true
}

function installScrollIntoViewSpy() {
  const previous = HTMLElement.prototype.scrollIntoView
  const scrollIntoView = vi.fn()

  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoView,
  })

  return {
    scrollIntoView,
    restore() {
      if (previous) {
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
          configurable: true,
          value: previous,
        })
      } else {
        delete (HTMLElement.prototype as {scrollIntoView?: unknown}).scrollIntoView
      }
    },
  }
}

describe('settings page mobile section navigation', () => {
  beforeEach(() => {
    resetRuntimeCapabilities()
    setRuntimeCapabilities({platform: 'android', mobile: true})
    setAppLang('en')
  })

  afterEach(() => {
    document.querySelectorAll('settings-page').forEach((element) => element.remove())
    resetRuntimeCapabilities()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('keeps the mobile section index sticky and reserves bottom space', () => {
    const cssText = stylesToText(SettingsPage.styles)

    expect(cssText).toContain('--settings-index-sticky-offset: var(--app-spacing-4);')
    expect(cssText).toMatch(
      /@media \(max-width: 767px\)\s*{[\s\S]*--settings-index-sticky-offset: var\(--app-spacing-2\);/,
    )
    expect(cssText).toContain('--settings-index-mobile-block-size: 56px;')
    expect(cssText).toMatch(
      /padding-block-end: calc\(\s*var\(--app-spacing-8\) \+ var\(--app-spacing-8\) \+ var\(--safe-area-bottom-active, 0px\)\s*\);/,
    )
    expect(cssText).toMatch(
      /\.settings-index\s*{[^}]*position: sticky;[^}]*inset-block-start: var\(--settings-index-sticky-offset\);[^}]*overflow-x: auto;[^}]*touch-action: pan-x;/,
    )
    expect(cssText).toContain(
      'scroll-margin-block-start: var(--settings-section-scroll-margin-start);',
    )
  })

  it('scrolls to settings sections from shadow-dom index links', async () => {
    ensureDefined()
    const scrollSpy = installScrollIntoViewSpy()

    try {
      const page = document.createElement('settings-page') as SettingsPage
      page.hideBackLink = true
      document.body.append(page)
      await page.updateComplete

      const licenseLink = page.shadowRoot?.querySelector<HTMLAnchorElement>(
        '.settings-index-link[data-section-id="settings-license"]',
      )
      expect(licenseLink).not.toBeNull()
      expect(licenseLink?.getAttribute('href')).toBe('#settings-license')

      const event = new MouseEvent('click', {bubbles: true, cancelable: true, composed: true})
      licenseLink?.dispatchEvent(event)

      expect(event.defaultPrevented).toBe(true)
      expect(scrollSpy.scrollIntoView).toHaveBeenCalledWith({block: 'start', inline: 'nearest'})
    } finally {
      scrollSpy.restore()
    }
  })
})
