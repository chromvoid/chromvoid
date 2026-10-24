import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const openExternalBrowserUrl = vi.hoisted(() => vi.fn((_url: string) => Promise.resolve()))

vi.mock('../../src/shared/services/external-browser', () => ({
  openExternalBrowserUrl: (url: string) => openExternalBrowserUrl(url),
}))

import {DEFAULT_SESSION_SETTINGS} from '../../src/core/session/session-settings'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {guidanceModel} from '../../src/core/guidance/guidance.model'
import {moduleAccessModel} from '../../src/core/modules/module-access.model'
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
  settingsPageModel.sshAgentStatus.set(null)
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

function legalLinks(root: ParentNode): HTMLAnchorElement[] {
  return Array.from(root.querySelectorAll<HTMLAnchorElement>('a[data-legal-document]'))
}

const PRIVACY_URL = 'https://chromvoid.com/en/legal/privacy-policy/'
const TERMS_URL = 'https://chromvoid.com/en/legal/terms-of-service-eula/'

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
    openExternalBrowserUrl.mockClear()
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
    const root = layoutRoot(page)

    expect(root.querySelector('.settings-shell')).not.toBeNull()
    expect(root.querySelector('.settings-index')).not.toBeNull()
    expect(indexHrefs(root)).toEqual([
      '#settings-application',
      '#settings-passwords',
      '#settings-session-security',
      '#settings-ssh-agent',
      '#settings-about',
    ])
    expect(section(root, 'settings-application')?.tagName).toBe('SECTION')
    expect(section(root, 'settings-passwords')?.tagName).toBe('SECTION')
    expect(section(root, 'settings-session-security')?.tagName).toBe('SECTION')
    expect(section(root, 'settings-ssh-agent')?.tagName).toBe('SECTION')
    expect(section(root, 'settings-credential-provider')).toBeNull()
    expect(root.querySelector<HTMLInputElement>('#settings-markdown-attachment-folder')?.value).toBe(
      '/attachments',
    )
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
      platform: 'ios',
      mobile: true,
      desktop: false,
      supports_autofill: true,
    })

    const page = await renderSettingsPage()
    const root = layoutRoot(page)

    expect(root.querySelector('.settings-index')).toBeNull()
    expect(root.querySelector('#settings-ssh-agent')).toBeNull()
    expect(root.querySelectorAll('.overview-row')).toHaveLength(7)
    expect(
      Array.from(root.querySelectorAll<HTMLElement>('[data-settings-route]')).map(
        (row) => row.dataset['settingsRoute'],
      ),
    ).toEqual(['security', 'autofill', 'files', 'passwords'])
    expect(root.textContent).toContain('Security & locking')
    expect(root.textContent).toContain('Credential Provider / Autofill')
    expect(root.textContent).toContain('Files & storage')
    expect(root.textContent).toContain('Password vault')
    expect(root.textContent).toContain('Language')
  })

  it('links the privacy policy and terms of service from the desktop About section', async () => {
    setRuntimeCapabilities({platform: 'macos', desktop: true, mobile: false})

    const page = await renderSettingsPage()
    const root = layoutRoot(page)
    const about = section(root, 'settings-about')

    expect(about?.tagName).toBe('SECTION')
    expect(about?.querySelector('#settings-about-title')?.textContent?.trim()).toBe('About')
    const links = legalLinks(about!)
    expect(links.map((link) => [link.textContent?.replace(/\s+/g, ' ').trim(), link.getAttribute('href')])).toEqual([
      ['Privacy Policy Opens in your browser', PRIVACY_URL],
      ['Terms of Service Opens in your browser', TERMS_URL],
    ])
    expect(links.every((link) => link.getAttribute('rel') === 'noopener noreferrer')).toBe(true)

    const click = new MouseEvent('click', {bubbles: true, cancelable: true})
    links[0]!.dispatchEvent(click)

    expect(click.defaultPrevented).toBe(true)
    expect(openExternalBrowserUrl).toHaveBeenCalledWith(PRIVACY_URL)
  })

  it('links the privacy policy and terms of service from the mobile overview', async () => {
    setRuntimeCapabilities({platform: 'ios', mobile: true, desktop: false})

    const page = await renderSettingsPage()
    const root = layoutRoot(page)
    const aboutGroup = Array.from(root.querySelectorAll<HTMLElement>('.overview-section')).find(
      (group) => group.querySelector('.group-label')?.textContent?.trim() === 'About',
    )

    expect(aboutGroup).toBeDefined()
    const links = legalLinks(aboutGroup!)
    expect(links.map((link) => [link.querySelector('.overview-title')?.textContent, link.getAttribute('href')])).toEqual([
      ['Privacy Policy', PRIVACY_URL],
      ['Terms of Service', TERMS_URL],
    ])

    const click = new MouseEvent('click', {bubbles: true, cancelable: true})
    links[1]!.dispatchEvent(click)

    expect(click.defaultPrevented).toBe(true)
    expect(openExternalBrowserUrl).toHaveBeenCalledWith(TERMS_URL)
    expect(navigationModel.settingsRoute()).toEqual({kind: 'overview'})
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

    setRuntimeCapabilities({platform: 'ios', desktop: false, mobile: true})
    await Promise.resolve()
    await page.updateComplete

    expect(page.shadowRoot?.querySelector('settings-page-desktop-layout')).toBeNull()
    expect(page.shadowRoot?.querySelector('settings-page-mobile-layout')).not.toBeNull()
    expect(navigationModel.settingsRoute()).toEqual({kind: 'security'})
  })
})
