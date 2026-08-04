import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {DEFAULT_SESSION_SETTINGS} from '../../src/core/session/session-settings'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {guidanceModel} from '../../src/core/guidance/guidance.model'
import {moduleAccessModel} from '../../src/core/pro/module-access.model'
import {setLang as setAppLang} from '../../src/i18n'
import {SettingsPage} from '../../src/routes/settings/settings-page'
import {settingsPageModel} from '../../src/routes/settings/settings.model'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {navigationModel} from '../../src/app/navigation/navigation.model'

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
  document.body.append(page)
  await page.updateComplete
  const layout = page.shadowRoot?.querySelector<HTMLElement & {updateComplete: Promise<unknown>}>(
    'settings-page-desktop-layout, settings-page-mobile-layout',
  )
  await layout?.updateComplete
  return page
}

function layoutRoot(page: SettingsPage): ShadowRoot {
  const layout = page.shadowRoot?.querySelector(
    'settings-page-desktop-layout, settings-page-mobile-layout',
  )
  if (!layout?.shadowRoot) throw new Error('Settings layout root not found')
  return layout.shadowRoot
}

function resetSettingsState() {
  settingsPageModel.settings.set({...DEFAULT_SESSION_SETTINGS})
  settingsPageModel.credentialProviderSelected.set(null)
  settingsPageModel.androidQuickLockTileStatus.set(null)
  settingsPageModel.sshAgentStatus.set(null)
  settingsPageModel.activationCodeDraft.set('')
  settingsPageModel.activationCodeError.set('')
  settingsPageModel.vaultRekey.reset()
  moduleAccessModel.reset()
  guidanceModel.progress.set([])
  guidanceModel.productStates.set(new Set())
  guidanceModel.completedDomainEvents.set(new Set())
  guidanceModel.manualHelpRequest.set(null)
  guidanceModel.blockedActionRequest.set(null)
  guidanceModel.setRoute('settings')
  navigationModel.snapshot.set({
    surface: 'settings',
    settings: {kind: 'overview'},
    overlay: {kind: 'none'},
  })
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

  it('keeps license activation available and identifies an empty activation code', async () => {
    expect(settingsPageModel.licenseActivationDisabled()).toBe(false)

    await expect(settingsPageModel.activateLicense()).resolves.toBe(false)

    expect(settingsPageModel.activationCodeError()).toBe('This field is required')
  })

  it('renders the desktop section index and semantic settings sections', async () => {
    setRuntimeCapabilities({platform: 'macos', desktop: true, mobile: false})

    const page = await renderSettingsPage()
    const root = layoutRoot(page)

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
    expect(section(root, 'settings-credential-provider')).toBeNull()
    expect(root.querySelector<HTMLInputElement>('#settings-markdown-attachment-folder')?.value).toBe(
      '/attachments',
    )
    expect(root.querySelector('.license-input')).not.toBeNull()
  })

  it('renders macOS Credential Provider status and actions when the capability is available', async () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      mobile: false,
      supports_autofill: true,
    })
    settingsPageModel.credentialProviderSelected.set(false)

    const page = await renderSettingsPage()
    const root = layoutRoot(page)
    const provider = section(root, 'settings-credential-provider')
    const providerIndexLink = root.querySelector<HTMLAnchorElement>(
      '.settings-index-link[href="#settings-credential-provider"]',
    )

    expect(indexHrefs(root)).toContain('#settings-credential-provider')
    expect(providerIndexLink?.textContent?.trim()).toBe('Autofill')
    expect(provider).not.toBeNull()
    expect(provider?.querySelector('#settings-credential-provider-title')?.textContent?.trim()).toBe(
      'Credential Provider / Autofill',
    )
    expect(provider?.textContent).toContain('ChromVoid is not enabled as a macOS AutoFill provider yet')
    expect(provider?.textContent).toContain('Enable ChromVoid for AutoFill')
    expect(provider?.querySelector('[role="status"]')?.getAttribute('aria-atomic')).toBe('true')

    settingsPageModel.credentialProviderSelected.set(true)
    const layout = page.shadowRoot?.querySelector<HTMLElement & {updateComplete: Promise<unknown>}>(
      'settings-page-desktop-layout',
    )
    await Promise.resolve()
    await layout?.updateComplete
    const updatedProvider = section(root, 'settings-credential-provider')

    expect(updatedProvider?.textContent).toContain('ChromVoid is enabled as a macOS AutoFill provider')
    expect(updatedProvider?.textContent).toContain('Open AutoFill Settings')
    expect(updatedProvider?.querySelector('.provider-steps')).toBeNull()
  })

  it('renders the mobile overview hierarchy and hides desktop-only controls', async () => {
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
    const root = layoutRoot(page)

    expect(root.querySelector('.settings-index')).toBeNull()
    expect(root.querySelector('#settings-ssh-agent')).toBeNull()
    expect(root.querySelectorAll('.overview-row')).toHaveLength(6)
    expect(
      Array.from(root.querySelectorAll<HTMLElement>('[data-settings-route]')).map(
        (row) => row.dataset['settingsRoute'],
      ),
    ).toEqual(['security', 'autofill', 'files', 'passwords', 'license'])
    expect(root.textContent).toContain('Security & locking')
    expect(root.textContent).toContain('Credential Provider / Autofill')
    expect(root.textContent).toContain('Files & storage')
    expect(root.textContent).toContain('Password vault')
    expect(root.textContent).toContain('Language')
    expect(root.textContent).toContain('License')
  })

  it('omits all external Pro settings from the iOS distribution', async () => {
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
      desktop: false,
      supports_autofill: true,
      supports_external_pro: false,
    })

    const page = await renderSettingsPage()
    const root = layoutRoot(page)

    expect(root.querySelectorAll('.overview-row')).toHaveLength(4)
    expect(
      Array.from(root.querySelectorAll<HTMLElement>('[data-settings-route]')).map(
        (row) => row.dataset['settingsRoute'],
      ),
    ).toEqual(['security', 'files', 'passwords'])
    expect(root.querySelector('[data-settings-route="autofill"]')).toBeNull()
    expect(root.querySelector('[data-settings-route="license"]')).toBeNull()
    expect(root.querySelector('.license-input')).toBeNull()
  })

  it('switches the Settings presentation reactively without losing the route snapshot', async () => {
    setRuntimeCapabilities({platform: 'macos', desktop: true, mobile: false})
    navigationModel.snapshot.set({
      surface: 'settings',
      settings: {kind: 'security'},
      overlay: {kind: 'none'},
    })
    const page = await renderSettingsPage()

    expect(page.shadowRoot?.querySelector('settings-page-desktop-layout')).not.toBeNull()

    setRuntimeCapabilities({platform: 'android', desktop: false, mobile: true})
    await Promise.resolve()
    await page.updateComplete

    expect(page.shadowRoot?.querySelector('settings-page-desktop-layout')).toBeNull()
    expect(page.shadowRoot?.querySelector('settings-page-mobile-layout')).not.toBeNull()
    expect(navigationModel.settingsRoute()).toEqual({kind: 'security'})
  })
})
