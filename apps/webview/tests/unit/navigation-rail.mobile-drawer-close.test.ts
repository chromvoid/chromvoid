import {afterEach, describe, expect, it, vi} from 'vitest'

import {androidSystemBackModel} from '../../src/app/navigation/android-system-back.model'
import {navigationModel} from '../../src/app/navigation/navigation.model'
import {moduleAccessModel} from '../../src/core/pro/module-access.model'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {NavigationRail, NavigationRailActions} from '../../src/features/file-manager/components/navigation-rail'
import {navigationRailModel} from '../../src/features/file-manager/components/navigation-rail.model'
import {ChromVoidAppModel} from '../../src/routes/app.route.model'
import {atom} from '@reatom/core'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

type LayoutMode = 'mobile' | 'desktop'

function setupContext(layout: LayoutMode, sidebarOpen = true) {
  const layoutMode = atom<LayoutMode>(layout)
  const sidebar = atom(sidebarOpen)
  const theme = atom<'light' | 'dark' | 'system'>('dark')
  const currentPath = atom('/')

  initAppContext(
    createMockAppContext({
      store: {
        layoutMode,
        sidebarOpen: sidebar,
        setSidebarOpen: (next: boolean) => sidebar.set(next),
        currentPath,
        theme,
        setLayoutQueryParam: () => {},
        switchTheme: () => {
          theme.set(theme() === 'dark' ? 'light' : 'dark')
        },
      } as any,
    }),
  )

  navigationModel.reset()

  return {sidebar}
}

describe('NavigationRail mobile drawer auto-close', () => {
  afterEach(() => {
    navigationModel.disconnect()
    navigationRailModel.expanded.set(false)
    moduleAccessModel.reset()
    resetRuntimeCapabilities()
    clearAppContext()
    vi.unstubAllGlobals()
    document.querySelectorAll('navigation-rail').forEach((el) => el.remove())
    document.querySelectorAll('navigation-rail-actions').forEach((el) => el.remove())
  })

  function createRail() {
    NavigationRail.define()
    return document.createElement('navigation-rail') as NavigationRail
  }

  async function createRenderedRail() {
    const rail = createRail()
    document.body.appendChild(rail)
    await rail.updateComplete
    return rail
  }

  function createActions() {
    NavigationRailActions.define()
    return document.createElement('navigation-rail-actions') as NavigationRailActions
  }

  async function createRenderedActions() {
    const actions = createActions()
    document.body.appendChild(actions)
    await actions.updateComplete
    return actions
  }

  function buttonLabels(root: ParentNode | null): string[] {
    return Array.from(root?.querySelectorAll<HTMLElement>('cv-button') ?? []).map(
      (button) => button.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    )
  }

  it('closes sidebar after selecting Notes, Passwords, OTPs and Settings on mobile', () => {
    const {sidebar} = setupContext('mobile', true)
    const rail = createRail()

    ;(rail as any).handleNotesClick()
    expect(navigationModel.currentSurface()).toBe('notes')
    expect(sidebar()).toBe(false)

    sidebar.set(true)
    ;(rail as any).handlePasswordsClick()
    expect(navigationModel.currentSurface()).toBe('passwords')
    expect(sidebar()).toBe(false)

    sidebar.set(true)
    ;(rail as any).handleOtpCodesClick()
    expect(navigationModel.currentSurface()).toBe('passwords')
    expect(navigationModel.snapshot().passwords).toEqual({kind: 'otp-view'})
    expect(sidebar()).toBe(false)

    sidebar.set(true)
    ;(rail as any).handleSettingsClick()
    expect(navigationModel.currentSurface()).toBe('settings')
    expect(sidebar()).toBe(false)
  })

  it('renders Passkeys below OTPs and closes the mobile drawer when selected on Android', async () => {
    const {sidebar} = setupContext('mobile', true)
    vi.stubGlobal('__TAURI_INTERNALS__', {invoke: vi.fn()})
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_autofill: true,
      supports_credential_provider_passkeys_lite: true,
    })

    const rail = await createRenderedRail()
    const labels = buttonLabels(rail.shadowRoot)
    const otpIndex = labels.findIndex((label) => label.includes('OTPs'))
    const passkeysIndex = labels.findIndex((label) => label.includes('Passkeys'))
    const buttons = Array.from(rail.shadowRoot?.querySelectorAll<HTMLElement>('cv-button') ?? [])
    const passwordsButton = buttons.find((button) => button.textContent?.includes('Passwords'))
    const passkeysButton = buttons.find((button) => button.textContent?.includes('Passkeys'))
    const passwordsIconName = passwordsButton?.querySelector('cv-icon')?.getAttribute('name')
    const passkeysIconName = passkeysButton?.querySelector('cv-icon')?.getAttribute('name')

    expect(otpIndex).toBeGreaterThanOrEqual(0)
    expect(passkeysIndex).toBe(otpIndex + 1)
    expect(passwordsIconName).not.toBe(passkeysIconName)
    expect(passkeysIconName).toBe('octicons:passkey-fill')
    ;(rail as any).handlePasskeysClick()
    expect(navigationModel.currentSurface()).toBe('passkeys')
    expect(sidebar()).toBe(false)
  })

  it('does not change sidebar state on desktop', () => {
    const {sidebar} = setupContext('desktop', true)
    const rail = createRail()

    ;(rail as any).handleNotesClick()
    expect(navigationModel.currentSurface()).toBe('notes')
    expect(sidebar()).toBe(true)
    ;(rail as any).handlePasswordsClick()
    expect(navigationModel.currentSurface()).toBe('passwords')
    expect(sidebar()).toBe(true)
    ;(rail as any).handleOtpCodesClick()
    expect(navigationModel.currentSurface()).toBe('passwords')
    expect(navigationModel.snapshot().passwords).toEqual({kind: 'otp-view'})
    expect(sidebar()).toBe(true)
    ;(rail as any).handleSettingsClick()
    expect(navigationModel.currentSurface()).toBe('settings')
    expect(sidebar()).toBe(true)
  })

  it('renders OTPs as a separate active drawer item for the OTP quick view route', async () => {
    setupContext('mobile', true)
    navigationModel.openPassmanagerRoute({kind: 'otp-view'})

    const rail = await createRenderedRail()
    const buttons = Array.from(rail.shadowRoot?.querySelectorAll<HTMLElement>('cv-button.item') ?? [])
    const labels = buttons.map((button) => button.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    const passwordsButton = buttons.find((button) => (button.textContent ?? '').includes('Credentials'))
    const otpButton = buttons.find((button) => (button.textContent ?? '').includes('OTPs'))

    expect(labels.some((label) => label.includes('Credentials'))).toBe(true)
    expect(labels.some((label) => label.includes('OTPs'))).toBe(true)
    expect(passwordsButton?.classList.contains('active')).toBe(false)
    expect(otpButton?.classList.contains('active')).toBe(true)
  })

  it('renders Notes as a separate active drawer item for the Notes route', async () => {
    setupContext('mobile', true)
    navigationModel.navigateToSurface('notes', 'replace')

    const rail = await createRenderedRail()
    const buttons = Array.from(rail.shadowRoot?.querySelectorAll<HTMLElement>('cv-button.item') ?? [])
    const labels = buttons.map((button) => button.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    const filesButton = buttons.find((button) => (button.textContent ?? '').includes('Files'))
    const notesButton = buttons.find((button) => (button.textContent ?? '').includes('Notes'))

    expect(labels.some((label) => label.includes('Files'))).toBe(true)
    expect(labels.some((label) => label.includes('Notes'))).toBe(true)
    expect(filesButton?.classList.contains('active')).toBe(false)
    expect(notesButton?.classList.contains('active')).toBe(true)
  })

  it('keeps mobile drawer rail expanded and disables the brand collapse toggle', async () => {
    setupContext('mobile', true)
    navigationRailModel.expanded.set(false)

    const rail = await createRenderedRail()
    const brandIcon = rail.shadowRoot?.querySelector<HTMLElement>('.brand-icon')

    expect(rail.hasAttribute('expanded')).toBe(true)
    expect(brandIcon?.getAttribute('role')).toBeNull()
    expect(brandIcon?.getAttribute('tabindex')).toBeNull()

    brandIcon?.click()
    await rail.updateComplete

    expect(rail.hasAttribute('expanded')).toBe(true)
  })

  it('hides command palette from the mobile drawer while keeping core drawer actions', async () => {
    setupContext('mobile', true)

    const rail = await createRenderedRail()
    const actions = await createRenderedActions()
    const railLabels = buttonLabels(rail.shadowRoot)
    const actionLabels = buttonLabels(actions.shadowRoot)

    expect(railLabels.some((label) => label.includes('Command palette'))).toBe(false)
    expect(railLabels.some((label) => label.includes('Settings'))).toBe(false)
    expect(railLabels.some((label) => label.includes('Lock'))).toBe(false)
    expect(railLabels.some((label) => label.includes('Files'))).toBe(true)
    expect(actionLabels.some((label) => label.includes('Command palette'))).toBe(false)
    expect(actionLabels.some((label) => label.includes('Settings'))).toBe(true)
    expect(actionLabels.some((label) => label.includes('Lock'))).toBe(true)
    expect(actionLabels.some((label) => label.includes('Files'))).toBe(false)
  })

  it('pins secondary mobile drawer actions below the primary navigation', async () => {
    setupContext('mobile', true)
    moduleAccessModel.rawStates.set([
      {feature_key: 'remote', status: 'enabled', denial_code: null},
      {feature_key: 'browser-extension', status: 'enabled', denial_code: null},
      {feature_key: 'mounted-vault', status: 'enabled', denial_code: null},
    ])
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_network_remote: true,
      supports_volume: true,
      supports_gateway: true,
    })

    const rail = await createRenderedRail()
    const actions = await createRenderedActions()
    const mainNav = rail.shadowRoot?.querySelector<HTMLElement>('.main-nav') ?? null
    const railSecondaryActions = rail.shadowRoot?.querySelector<HTMLElement>('.secondary-actions') ?? null
    const secondaryActions = actions.shadowRoot?.querySelector<HTMLElement>('.secondary-actions') ?? null
    const mainLabels = buttonLabels(mainNav)
    const secondaryLabels = buttonLabels(secondaryActions)

    expect(mainNav).not.toBeNull()
    expect(railSecondaryActions).toBeNull()
    expect(secondaryActions).not.toBeNull()
    expect(secondaryActions?.querySelector('.theme-toggle')).not.toBeNull()

    expect(mainLabels.some((label) => label.includes('Files'))).toBe(true)
    expect(mainLabels.some((label) => label.includes('Notes'))).toBe(true)
    expect(mainLabels.some((label) => label.includes('Credentials'))).toBe(true)
    expect(mainLabels.some((label) => label.includes('OTPs'))).toBe(true)
    expect(mainLabels.some((label) => label.includes('Settings'))).toBe(false)
    expect(mainLabels.some((label) => label.includes('Lock'))).toBe(false)
    expect(mainLabels.some((label) => label.includes('Remote'))).toBe(false)

    expect(secondaryLabels.some((label) => label.includes('Storage'))).toBe(true)
    expect(secondaryLabels.some((label) => label.includes('Remote'))).toBe(true)
    expect(secondaryLabels.some((label) => label.includes('Extensions'))).toBe(true)
    expect(secondaryLabels.some((label) => label.includes('Settings'))).toBe(true)
    expect(secondaryLabels.some((label) => label.includes('Lock'))).toBe(true)
    expect(secondaryLabels.some((label) => label.includes('Files'))).toBe(false)
    expect(secondaryLabels.some((label) => label.includes('Notes'))).toBe(false)
    expect(secondaryLabels.some((label) => label.includes('Credentials'))).toBe(false)
    expect(secondaryLabels.some((label) => label.includes('OTPs'))).toBe(false)
  })

  it('hides unsupported Pro surfaces on mobile while keeping locked Remote visible', async () => {
    setupContext('mobile', true)
    moduleAccessModel.rawStates.set([
      {feature_key: 'remote', status: 'locked_pro', denial_code: 'PRO_REQUIRED'},
      {feature_key: 'browser-extension', status: 'locked_pro', denial_code: 'PRO_REQUIRED'},
      {feature_key: 'mounted-vault', status: 'locked_pro', denial_code: 'PRO_REQUIRED'},
    ])
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_network_remote: true,
      supports_volume: false,
      supports_gateway: false,
    })

    const actions = await createRenderedActions()
    const buttons = Array.from(actions.shadowRoot?.querySelectorAll<HTMLElement>('cv-button.item') ?? [])
    const labels = buttons.map((button) => button.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    const remoteButton = buttons.find((button) => (button.textContent ?? '').includes('Remote'))

    expect(labels.some((label) => label.includes('Remote'))).toBe(true)
    expect(labels.some((label) => label.includes('Storage'))).toBe(false)
    expect(labels.some((label) => label.includes('Extensions'))).toBe(false)
    expect(remoteButton?.querySelector('cv-icon[slot="suffix"]')?.getAttribute('name')).toBe('lock')
  })

  it('silently redirects unsupported Pro surface to Remote on mobile', () => {
    setupContext('mobile', true)
    moduleAccessModel.rawStates.set([
      {feature_key: 'remote', status: 'locked_pro', denial_code: 'PRO_REQUIRED'},
      {feature_key: 'browser-extension', status: 'locked_pro', denial_code: 'PRO_REQUIRED'},
    ])
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_network_remote: true,
      supports_gateway: false,
    })
    const appModel = new ChromVoidAppModel()

    navigationModel.navigateToSurface('gateway', 'replace')
    const redirected = (
      appModel as unknown as {
        normalizeUnsupportedSurface: () => boolean
      }
    ).normalizeUnsupportedSurface()

    expect(redirected).toBe(true)
    expect(navigationModel.currentSurface()).toBe('remote')
    expect(navigationModel.remotePanel()).toBe('hosts')
  })

  it('keeps the brand collapse toggle available on desktop', async () => {
    setupContext('desktop', true)
    navigationRailModel.expanded.set(false)

    const rail = await createRenderedRail()
    const brandIcon = rail.shadowRoot?.querySelector<HTMLElement>('.brand-icon')

    expect(rail.hasAttribute('expanded')).toBe(false)
    expect(brandIcon?.getAttribute('role')).toBe('button')

    brandIcon?.click()
    await vi.waitFor(() => {
      expect(rail.hasAttribute('expanded')).toBe(true)
    })

    brandIcon?.click()
    await vi.waitFor(() => {
      expect(rail.hasAttribute('expanded')).toBe(false)
    })
  })

  it('keeps command palette available on the desktop rail', async () => {
    setupContext('desktop', true)

    const rail = await createRenderedRail()
    const buttons = Array.from(rail.shadowRoot?.querySelectorAll<HTMLElement>('cv-button.item') ?? [])
    const labels = buttons.map((button) => button.textContent?.replace(/\s+/g, ' ').trim() ?? '')

    expect(labels.some((label) => label.includes('Command palette'))).toBe(true)
  })

  it('renders only Remote for network remote and routes back to remote hosts', async () => {
    setupContext('desktop', true)
    setRuntimeCapabilities({
      desktop: true,
      supports_network_remote: true,
    })

    navigationModel.navigateToRemotePanel('pair-ios', 'replace')

    const rail = await createRenderedRail()
    const buttons = Array.from(rail.shadowRoot?.querySelectorAll<HTMLButtonElement>('cv-button.item') ?? [])
    const labels = buttons.map((button) => button.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    const remoteButton = buttons.find((button) => (button.textContent ?? '').includes('Remote'))

    expect(labels.some((label) => label.includes('Remote'))).toBe(true)
    expect(labels.some((label) => label.includes('Network Pair'))).toBe(false)
    expect(remoteButton?.classList.contains('active')).toBe(true)

    remoteButton?.click()
    await rail.updateComplete

    expect(navigationModel.currentSurface()).toBe('remote')
    expect(navigationModel.remotePanel()).toBe('hosts')
  })

  it('closes the mobile drawer on Android system back before app backgrounding', () => {
    const {sidebar} = setupContext('mobile', true)
    const appModel = new ChromVoidAppModel()

    try {
      appModel.connect()

      expect(androidSystemBackModel.handleBack()).toBe(true)
      expect(sidebar()).toBe(false)
    } finally {
      appModel.disconnect()
    }
  })
})
