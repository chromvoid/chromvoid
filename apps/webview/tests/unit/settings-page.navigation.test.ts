import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {setLang as setAppLang} from '../../src/i18n'
import {SettingsPage} from '../../src/routes/settings/settings-page'
import {navigationModel} from '../../src/app/navigation/navigation.model'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

let defined = false

function ensureDefined() {
  if (defined) return
  SettingsPage.define()
  defined = true
}

async function getMobileLayout(page: SettingsPage) {
  const layout = page.shadowRoot?.querySelector<HTMLElement & {updateComplete: Promise<unknown>}>(
    'settings-page-mobile-layout',
  )
  if (!layout?.shadowRoot) throw new Error('Mobile Settings layout not found')
  await layout.updateComplete
  return layout
}

describe('settings page mobile section navigation', () => {
  beforeEach(() => {
    resetRuntimeCapabilities()
    setRuntimeCapabilities({platform: 'ios', mobile: true})
    initAppContext(createMockAppContext())
    navigationModel.snapshot.set({
      surface: 'settings',
      settings: {kind: 'overview'},
      overlay: {kind: 'none'},
    })
    setAppLang('en')
  })

  afterEach(() => {
    document.querySelectorAll('settings-page').forEach((element) => element.remove())
    clearAppContext()
    resetRuntimeCapabilities()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('opens a dedicated settings category from the mobile overview', async () => {
    ensureDefined()
    const page = document.createElement('settings-page') as SettingsPage
    document.body.append(page)
    await page.updateComplete
    const layout = await getMobileLayout(page)
    const filesRow = layout.shadowRoot?.querySelector<HTMLButtonElement>(
      '[data-settings-route="files"]',
    )

    expect(filesRow).not.toBeNull()
    filesRow?.click()
    await layout.updateComplete

    expect(navigationModel.settingsRoute()).toEqual({kind: 'files'})
    expect(layout.shadowRoot?.querySelector('#settings-mobile-heading')?.textContent).toBe('Files & storage')
    expect(layout.shadowRoot?.querySelector('cv-switch[aria-label="Show dotfiles in Files"]')).not.toBeNull()
  })

  it('renders settings content without a page-local header', async () => {
    ensureDefined()

    const page = document.createElement('settings-page') as SettingsPage
    document.body.append(page)
    await page.updateComplete
    const layout = await getMobileLayout(page)

    expect(layout.shadowRoot?.querySelector('.header')).toBeNull()
    expect(layout.shadowRoot?.querySelector('.overview')).not.toBeNull()
    expect(layout.shadowRoot?.querySelector('h1:not(.sr-only)')).toBeNull()
  })
})
