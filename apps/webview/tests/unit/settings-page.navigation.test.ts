import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {setLang as setAppLang} from '../../src/i18n'
import {SettingsPage} from '../../src/routes/settings/settings-page'

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

  it('hides only the local header when rendered with an external toolbar', async () => {
    ensureDefined()

    const page = document.createElement('settings-page') as SettingsPage
    page.externalToolbar = true
    document.body.append(page)
    await page.updateComplete

    expect(page.shadowRoot?.querySelector('.header')).toBeNull()
    expect(page.shadowRoot?.querySelector('.settings-shell')).not.toBeNull()
  })
})
