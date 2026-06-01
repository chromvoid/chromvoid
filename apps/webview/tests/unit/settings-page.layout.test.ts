import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {DEFAULT_SESSION_SETTINGS} from '../../src/core/session/session-settings'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {guidanceModel} from '../../src/core/guidance/guidance.model'
import {moduleAccessModel} from '../../src/core/pro/module-access.model'
import {setLang as setAppLang} from '../../src/i18n'
import {SettingsPage} from '../../src/routes/settings/settings-page'
import {settingsPageModel} from '../../src/routes/settings/settings.model'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

let defined = false

function ensureDefined() {
  if (defined) return
  SettingsPage.define()
  defined = true
}

async function renderSettingsPage() {
  ensureDefined()
  vi.spyOn(settingsPageModel, 'load').mockResolvedValue()
  const page = document.createElement('settings-page') as SettingsPage
  page.hideBackLink = true
  document.body.append(page)
  await page.updateComplete
  await Promise.resolve()
  await page.updateComplete
  return page
}

function resetSettingsState() {
  settingsPageModel.settings.set({...DEFAULT_SESSION_SETTINGS})
  settingsPageModel.androidAutofillProviderSelected.set(null)
  settingsPageModel.androidQuickLockTileStatus.set(null)
  settingsPageModel.sshAgentStatus.set(null)
  settingsPageModel.activationCodeDraft.set('')
  settingsPageModel.vaultRekey.reset()
  moduleAccessModel.reset()
  guidanceModel.progress.set([])
  guidanceModel.productStates.set(new Set())
  guidanceModel.completedDomainEvents.set(new Set())
  guidanceModel.manualHelpRequest.set(null)
  guidanceModel.blockedActionRequest.set(null)
  guidanceModel.setRoute('settings')
}

function section(root: ShadowRoot, id: string): HTMLElement | null {
  return root.getElementById(id) as HTMLElement | null
}

function indexHrefs(root: ShadowRoot): string[] {
  return Array.from(root.querySelectorAll<HTMLAnchorElement>('.settings-index-link')).map((anchor) =>
    anchor.getAttribute('href'),
  ) as string[]
}

describe('Settings page layout', () => {
  beforeEach(() => {
    resetRuntimeCapabilities()
    resetSettingsState()
    initAppContext(createMockAppContext())
    setAppLang('en')
  })

  afterEach(() => {
    document.querySelectorAll('settings-page').forEach((element) => element.remove())
    clearAppContext()
    resetRuntimeCapabilities()
    resetSettingsState()
    setAppLang('en')
    vi.restoreAllMocks()
  })

  it('renders the desktop section index and semantic settings sections', async () => {
    setRuntimeCapabilities({platform: 'macos', desktop: true, mobile: false})

    const page = await renderSettingsPage()
    const root = page.shadowRoot!

    expect(root.querySelector('.settings-shell')).not.toBeNull()
    expect(root.querySelector('.settings-index')).not.toBeNull()
    expect(indexHrefs(root)).toEqual([
      '#settings-application',
      '#settings-passwords',
      '#settings-license',
      '#settings-session-security',
      '#settings-ssh-agent',
    ])
    expect(section(root, 'settings-application')?.tagName).toBe('SECTION')
    expect(section(root, 'settings-passwords')?.tagName).toBe('SECTION')
    expect(section(root, 'settings-license')?.tagName).toBe('SECTION')
    expect(section(root, 'settings-session-security')?.tagName).toBe('SECTION')
    expect(section(root, 'settings-ssh-agent')?.tagName).toBe('SECTION')
    expect(section(root, 'settings-mobile-autofill')).toBeNull()
    expect(root.querySelector<HTMLInputElement>('#settings-markdown-attachment-folder')?.value).toBe(
      '/attachments',
    )
    expect(root.querySelector('.license-input')).not.toBeNull()
  })

  it('uses the mobile section map for Android Autofill and hides desktop SSH', async () => {
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      desktop: false,
      supports_autofill: true,
    })
    settingsPageModel.androidQuickLockTileStatus.set({
      supported: true,
      requestSupported: true,
      enabled: true,
    })

    const page = await renderSettingsPage()
    const root = page.shadowRoot!

    expect(indexHrefs(root)).toEqual([
      '#settings-application',
      '#settings-passwords',
      '#settings-license',
      '#settings-session-security',
      '#settings-mobile-autofill',
    ])
    expect(section(root, 'settings-ssh-agent')).toBeNull()
    expect(section(root, 'settings-mobile-autofill')?.tagName).toBe('SECTION')
    expect(root.querySelector('#settings-auto-lock')).not.toBeNull()
    expect(root.textContent).toContain('Android quick lock')
    const licenseInputs = Array.from(root.querySelectorAll('.license-input')) as HTMLInputElement[]
    expect(licenseInputs.map((input) => input.getAttribute('placeholder'))).toEqual(['Activation code'])
  })
})
