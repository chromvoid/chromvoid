import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {atom} from '@reatom/core'

import {
  DEFAULT_SESSION_SETTINGS,
  loadSessionSettings,
  saveSessionSettings,
} from '../../src/core/session/session-settings'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {setLang as setAppLang} from '../../src/i18n'
import {i18n as passmanagerI18n, setPasswordManagerLang} from '@project/passmanager/i18n'
import {i18n as passwordImportI18n} from '@chromvoid/password-import/i18n'
import {CVCallout} from '@chromvoid/uikit/components/cv-callout'
import {SettingsPage} from '../../src/routes/settings/settings-page'
import {settingsPageModel} from '../../src/routes/settings/settings.model'
import {moduleAccessModel, type EntitlementSnapshot} from '../../src/core/pro/module-access.model'
import {runtimeModeModel} from '../../src/core/runtime/runtime-mode.model'
import {guidanceModel} from '../../src/core/guidance/guidance.model'
import {navigationModel} from '../../src/app/navigation/navigation.model'
import {DEFAULT_SNAPSHOT} from '../../src/app/navigation/navigation-snapshot'
import {
  clearAppContext,
  createMockAppContext,
  getAppContext,
  initAppContext,
} from '../../src/shared/services/app-context'

const tauriInvoke = vi.fn()

vi.mock('root/core/transport/tauri/ipc', () => {
  return {
    tauriInvoke: (...args: unknown[]) => tauriInvoke(...args),
    tauriListen: vi.fn().mockResolvedValue(() => {}),
  }
})

let defined = false

function ensureDefined() {
  if (defined) return
  CVCallout.define()
  SettingsPage.define()
  defined = true
}

function settingsLayout(page: SettingsPage): HTMLElement & {updateComplete: Promise<unknown>} {
  const layout = page.shadowRoot?.querySelector<HTMLElement & {updateComplete: Promise<unknown>}>(
    'settings-page-desktop-layout, settings-page-mobile-layout',
  )
  if (!layout?.shadowRoot) throw new Error('Settings layout not found')
  return layout
}

function settingsRoot(page: SettingsPage): ShadowRoot {
  return settingsLayout(page).shadowRoot!
}

function setSettingsRoute(kind: 'overview' | 'security' | 'autofill' | 'files' | 'passwords' | 'license') {
  navigationModel.snapshot.set({
    surface: 'settings',
    settings: {kind},
    overlay: {kind: 'none'},
  })
}

function findSettingsButton(page: SettingsPage, label: string): HTMLElement & {disabled: boolean} {
  const button = Array.from(settingsRoot(page).querySelectorAll('cv-button')).find((candidate) =>
    candidate.textContent?.includes(label),
  ) as (HTMLElement & {disabled: boolean}) | undefined
  if (!button) throw new Error(`Settings button not found: ${label}`)
  return button
}

function findVisibleSettingsError(page: SettingsPage): HTMLElement | null {
  return (
    Array.from(settingsRoot(page).querySelectorAll<HTMLElement>('cv-callout[variant="danger"]')).find(
      (candidate) => !candidate.hidden,
    ) ?? null
  )
}

describe('Session settings mobile background lock', () => {
  beforeEach(() => {
    tauriInvoke.mockReset()
    resetRuntimeCapabilities()
    settingsPageModel.settings.set({...DEFAULT_SESSION_SETTINGS})
    settingsPageModel.credentialProviderSelected.set(null)
    settingsPageModel.credentialProviderNativeStatus.set(null)
    settingsPageModel.androidQuickLockTileStatus.set(null)
    settingsPageModel.activationCodeDraft.set('')
    settingsPageModel.activationCodeError.set('')
    settingsPageModel.vaultRekey.reset()
    moduleAccessModel.reset()
    guidanceModel.progress.set([])
    guidanceModel.productStates.set(new Set())
    guidanceModel.completedDomainEvents.set(new Set())
    guidanceModel.manualHelpRequest.set(null)
    guidanceModel.blockedActionRequest.set(null)
    guidanceModel.setRoute('loading')
    navigationModel.snapshot.set(DEFAULT_SNAPSHOT)
    initAppContext(createMockAppContext())
    setSettingsRoute('overview')
    setAppLang('en')
    vi.stubGlobal('__TAURI_INTERNALS__', {invoke: vi.fn()})
  })

  afterEach(() => {
    document.querySelectorAll('settings-page').forEach((element) => element.remove())
    settingsPageModel.settings.set({...DEFAULT_SESSION_SETTINGS})
    settingsPageModel.credentialProviderSelected.set(null)
    settingsPageModel.credentialProviderNativeStatus.set(null)
    settingsPageModel.androidQuickLockTileStatus.set(null)
    settingsPageModel.activationCodeDraft.set('')
    settingsPageModel.activationCodeError.set('')
    settingsPageModel.vaultRekey.reset()
    moduleAccessModel.reset()
    guidanceModel.progress.set([])
    guidanceModel.productStates.set(new Set())
    guidanceModel.completedDomainEvents.set(new Set())
    guidanceModel.manualHelpRequest.set(null)
    guidanceModel.blockedActionRequest.set(null)
    guidanceModel.setRoute('loading')
    navigationModel.snapshot.set(DEFAULT_SNAPSHOT)
    clearAppContext()
    resetRuntimeCapabilities()
    setAppLang('en')
    setPasswordManagerLang('en')
    localStorage.clear()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('defaults lock_on_mobile_background to false when older saved settings omit it', async () => {
    tauriInvoke.mockResolvedValue({
      ok: true,
      result: {
        auto_lock_timeout_secs: 60,
        lock_on_sleep: false,
        require_biometric_app_gate: false,
        auto_mount_after_unlock: true,
        keep_screen_awake_when_unlocked: true,
      },
    })

    await expect(loadSessionSettings()).resolves.toEqual({
      auto_lock_timeout_secs: 60,
      lock_on_sleep: false,
      lock_on_mobile_background: false,
      require_biometric_app_gate: false,
      auto_mount_after_unlock: true,
      auto_start_ssh_agent_after_unlock: false,
      keep_screen_awake_when_unlocked: true,
      android_vault_status_notification_enabled: true,
      android_quick_lock_tile_enabled: true,
      confirm_file_deletion: true,
      show_hidden_files: false,
      markdown_attachment_folder_path: '/attachments',
    })
    expect(tauriInvoke).toHaveBeenCalledWith('get_session_settings')
  })

  it('includes lock_on_mobile_background in save payloads', async () => {
    const settings = {...DEFAULT_SESSION_SETTINGS, lock_on_mobile_background: true}
    tauriInvoke.mockResolvedValue({
      ok: true,
      result: settings,
    })

    await expect(saveSessionSettings(settings)).resolves.toEqual(settings)
    expect(tauriInvoke).toHaveBeenCalledWith('set_session_settings', {settings})
  })

  it('renders Android quick lock toggles and Add Tile action', async () => {
    ensureDefined()
    vi.spyOn(settingsPageModel, 'load').mockResolvedValue()
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_autofill: true,
    })
    settingsPageModel.androidQuickLockTileStatus.set({
      supported: true,
      requestSupported: true,
      enabled: true,
    })
    setSettingsRoute('security')

    const page = document.createElement('settings-page') as SettingsPage
    document.body.appendChild(page)
    await page.updateComplete

    const text = settingsRoot(page).textContent ?? ''
    expect(text).toContain('Android quick lock')
    expect(text).toContain('Show vault status notification')
    expect(text).toContain('Quick Settings Lock Tile')
    expect(text).toContain('Add Quick Settings Tile')
  })

  it('renders activation-code activation without recovery-key input on mobile', async () => {
    ensureDefined()
    vi.spyOn(settingsPageModel, 'load').mockResolvedValue()
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_network_remote: true,
    })
    setSettingsRoute('license')

    const page = document.createElement('settings-page') as SettingsPage
    document.body.appendChild(page)
    await page.updateComplete

    const text = settingsRoot(page).textContent ?? ''
    const inputs = Array.from(settingsRoot(page).querySelectorAll('.license-input')) as HTMLInputElement[]
    expect(inputs[0]?.placeholder).toBe('Activation code')
    expect(inputs).toHaveLength(1)
    expect(text).toContain('Activate')
    expect(text).not.toContain('Account recovery key')
    expect(text).not.toContain('Restore license')
    expect(inputs.map((input) => input.placeholder)).not.toContain('License key')
  })

  it('hides activation inputs for active Pro and shows seat controls', async () => {
    ensureDefined()
    vi.spyOn(settingsPageModel, 'load').mockResolvedValue()
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_network_remote: true,
    })
    moduleAccessModel.entitlement.set({
      licensed: true,
      plan: 'pro',
      feature_keys: ['remote'],
      source_core: 'local',
      build_policy: 'enforce',
    })
    moduleAccessModel.licenseSeatStatus.set({
      seat_limit: 3,
      seats_used: 1,
      seats_available: 2,
      current_device_active: true,
      purchase_id: 'PURCHASE-CURRENT-ID',
      devices: [
        {
          device_fingerprint: 'device-1',
          activated_at: '2026-05-19T00:00:00Z',
          current_device: true,
        },
      ],
    })
    setSettingsRoute('license')

    const page = document.createElement('settings-page') as SettingsPage
    document.body.appendChild(page)
    await page.updateComplete

    const text = (settingsRoot(page).textContent ?? '').replace(/\s+/g, ' ')
    expect(settingsRoot(page).querySelector('.license-input')).toBeNull()
    expect(text).toContain('Seats: 1 of 3 used, 2 free')
    expect(text).toContain('PURCHASE-CURRENT-ID')
    expect(text).toContain('Open cabinet')
    expect(text).toContain('Release this seat')
    expect(text).not.toContain('Restore license')
    expect(text).not.toContain('Recover account access')
  })

  it('shows seat status as unavailable after a failed active Pro status load', async () => {
    ensureDefined()
    vi.spyOn(settingsPageModel, 'load').mockResolvedValue()
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_network_remote: true,
    })
    moduleAccessModel.entitlement.set({
      licensed: true,
      plan: 'pro',
      feature_keys: ['remote'],
      source_core: 'local',
      build_policy: 'enforce',
    })
    moduleAccessModel.licenseSeatStatus.set(null)
    moduleAccessModel.licenseSeatError.set('License seat status failed: 405 Method Not Allowed')
    setSettingsRoute('license')

    const page = document.createElement('settings-page') as SettingsPage
    document.body.appendChild(page)
    await page.updateComplete

    const text = (settingsRoot(page).querySelector('.license-stack')?.textContent ?? '').replace(/\s+/g, ' ')
    expect(text).toContain('Unavailable')
    expect(text).not.toContain('Loading')
  })

  it('opens cabinet through a current-seat handoff URL', async () => {
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_network_remote: true,
    })
    moduleAccessModel.licenseSeatStatus.set({
      seat_limit: 3,
      seats_used: 1,
      seats_available: 2,
      current_device_active: true,
      purchase_id: 'PURCHASE-CURRENT-ID',
      devices: [],
    })
    tauriInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'license_account_cabinet_handoff') {
        return {
          ok: true,
          result: {
            cabinet_url: 'https://chromvoid.com/account/license/?purchase_id=PURCHASE-CURRENT-ID#handoff=token',
            expires_at: '2026-05-31T00:03:00Z',
          },
        }
      }
      throw new Error(`Unexpected command: ${cmd}`)
    })
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    setSettingsRoute('license')

    await settingsPageModel.openLicenseCabinet()

    expect(tauriInvoke).toHaveBeenCalledWith('license_account_cabinet_handoff')
    expect(open).toHaveBeenCalledWith(
      'https://chromvoid.com/account/license/?purchase_id=PURCHASE-CURRENT-ID#handoff=token',
      '_blank',
      'noopener,noreferrer',
    )
  })

  it('releases the current active seat and clears local Pro entitlement', async () => {
    const activeEntitlement: EntitlementSnapshot = {
      licensed: true,
      plan: 'pro',
      feature_keys: ['remote'],
      source_core: 'local',
      build_policy: 'enforce',
    }
    const freeEntitlement: EntitlementSnapshot = {
      licensed: false,
      plan: 'free',
      feature_keys: [],
      source_core: 'local',
      build_policy: 'enforce',
    }
    moduleAccessModel.entitlement.set(activeEntitlement)
    moduleAccessModel.licenseSeatStatus.set({
      seat_limit: 3,
      seats_used: 1,
      seats_available: 2,
      current_device_active: true,
      purchase_id: 'PURCHASE-CURRENT-ID',
      devices: [
        {
          device_fingerprint: 'device-1',
          activated_at: '2026-05-19T00:00:00Z',
          current_device: true,
        },
      ],
    })
    tauriInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'license_current_seat_deactivate') {
        return {
          ok: true,
          result: {
            seat_limit: 3,
            seats_used: 0,
            seats_available: 3,
            current_device_active: false,
            purchase_id: 'PURCHASE-CURRENT-ID',
            devices: [],
          },
        }
      }
      if (cmd === 'module_access_snapshot') {
        return {ok: true, result: []}
      }
      if (cmd === 'license_status') {
        return {ok: true, result: freeEntitlement}
      }
      throw new Error(`Unexpected command: ${cmd}`)
    })

    await settingsPageModel.releaseCurrentSeat()

    expect(tauriInvoke).toHaveBeenCalledWith('license_current_seat_deactivate')
    expect(moduleAccessModel.entitlement()?.licensed).toBe(false)
    expect(moduleAccessModel.licenseSeatStatus()).toBeNull()
  })

  it('opens cabinet from the rendered active seat controls', async () => {
    ensureDefined()
    vi.spyOn(settingsPageModel, 'load').mockResolvedValue()
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_network_remote: true,
    })
    const entitlement = {
      licensed: true,
      plan: 'pro',
      feature_keys: ['remote'],
      source_core: 'local',
      build_policy: 'enforce',
    }
    const seatStatus = {
      seat_limit: 3,
      seats_used: 1,
      seats_available: 2,
      current_device_active: true,
      purchase_id: 'PURCHASE-CURRENT-ID',
      devices: [
        {
          device_fingerprint: 'device-1',
          activated_at: '2026-05-19T00:00:00Z',
          current_device: true,
        },
      ],
    }
    moduleAccessModel.entitlement.set(entitlement)
    moduleAccessModel.licenseSeatStatus.set(seatStatus)
    tauriInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'license_account_cabinet_handoff') {
        return {
          ok: true,
          result: {
            cabinet_url: 'https://chromvoid.com/account/license/?purchase_id=PURCHASE-CURRENT-ID#handoff=token',
            expires_at: '2026-05-31T00:03:00Z',
          },
        }
      }
      throw new Error(`Unexpected command: ${cmd}`)
    })
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    setSettingsRoute('license')

    const page = document.createElement('settings-page') as SettingsPage
    document.body.appendChild(page)
    await page.updateComplete

    const button = findSettingsButton(page, 'Open cabinet')
    expect(settingsRoot(page).querySelector('.license-input')).toBeNull()
    expect(button).not.toBeNull()
    expect(settingsRoot(page).textContent).not.toContain('Recover account access')
    expect(settingsRoot(page).textContent).not.toContain('New account recovery key')

    expect(button.disabled).toBe(false)
    button.click()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(tauriInvoke).toHaveBeenCalledWith('license_account_cabinet_handoff')
    expect(open).toHaveBeenCalledWith(
      'https://chromvoid.com/account/license/?purchase_id=PURCHASE-CURRENT-ID#handoff=token',
      '_blank',
      'noopener,noreferrer',
    )
  })

  it('renders cabinet handoff errors inline', async () => {
    ensureDefined()
    vi.spyOn(settingsPageModel, 'load').mockResolvedValue()
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_network_remote: true,
    })
    moduleAccessModel.entitlement.set({
      licensed: true,
      plan: 'pro',
      feature_keys: ['remote'],
      source_core: 'local',
      build_policy: 'enforce',
    })
    moduleAccessModel.licenseSeatStatus.set({
      seat_limit: 3,
      seats_used: 1,
      seats_available: 2,
      current_device_active: true,
      purchase_id: 'PURCHASE-CURRENT-ID',
      devices: [
        {
          device_fingerprint: 'device-1',
          activated_at: '2026-05-19T00:00:00Z',
          current_device: true,
        },
      ],
    })
    tauriInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'license_account_cabinet_handoff') {
        return {
          ok: false,
          code: 'LICENSE_INVALID',
          error: 'Unknown license key id',
        }
      }
      throw new Error(`Unexpected command: ${cmd}`)
    })
    setSettingsRoute('license')

    const page = document.createElement('settings-page') as SettingsPage
    document.body.appendChild(page)
    await page.updateComplete

    const button = findSettingsButton(page, 'Open cabinet')
    expect(button).not.toBeNull()

    button.click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await settingsLayout(page).updateComplete

    const error = findVisibleSettingsError(page)
    expect(error?.hidden).toBe(false)
    expect(error?.textContent).toContain('This app build is missing the license verification key')
  })

  it('switches WebView and passmanager language from settings without reload', async () => {
    ensureDefined()
    vi.spyOn(settingsPageModel, 'load').mockResolvedValue()
    setRuntimeCapabilities({platform: 'android', mobile: true})
    setAppLang('en')

    const page = document.createElement('settings-page') as SettingsPage
    document.body.appendChild(page)
    await page.updateComplete

    const root = settingsRoot(page)
    expect(root.textContent).toContain('Application')
    const languageRow = Array.from(root.querySelectorAll<HTMLButtonElement>('.overview-row')).find(
      (row) => row.textContent?.includes('Language'),
    )
    expect(languageRow).not.toBeNull()
    languageRow?.click()
    await Promise.resolve()
    await settingsLayout(page).updateComplete
    expect(
      (root.querySelector('cv-bottom-sheet') as HTMLElement & {open: boolean} | null)?.open,
    ).toBe(true)
    const russianOption = Array.from(root.querySelectorAll<HTMLButtonElement>('.sheet-option')).find(
      (option) => option.dataset['value'] === 'ru',
    )
    expect(russianOption).not.toBeNull()
    russianOption?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await Promise.resolve()
    await settingsLayout(page).updateComplete

    expect(localStorage.getItem('current-lang')).toBe('ru')
    expect(document.documentElement.lang).toBe('ru')
    expect(settingsRoot(page).textContent).toContain('Приложение')
    expect(passmanagerI18n('root:title')).toBe('Пароли')
    expect(passwordImportI18n('import:dialog:title')).toBe('Импорт паролей')
  })

  it('hides Android quick lock settings outside Android runtime', async () => {
    ensureDefined()
    vi.spyOn(settingsPageModel, 'load').mockResolvedValue()
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
      supports_biometric: true,
    })
    setSettingsRoute('security')

    const page = document.createElement('settings-page') as SettingsPage
    document.body.appendChild(page)
    await page.updateComplete

    const text = settingsRoot(page).textContent ?? ''
    expect(text).not.toContain('Android quick lock')
    expect(text).not.toContain('Quick Settings Lock Tile')
    expect(text).not.toContain('Local Android passkeys')
    expect(text).not.toContain('Passkeys')
  })

  it('persists Android vault status notification setting', async () => {
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
    })
    tauriInvoke.mockImplementation(
      async (_cmd: string, payload?: {settings: typeof DEFAULT_SESSION_SETTINGS}) => ({
        ok: true,
        result: payload?.settings ?? DEFAULT_SESSION_SETTINGS,
      }),
    )

    await settingsPageModel.setAndroidVaultStatusNotificationEnabled(false)

    expect(tauriInvoke).toHaveBeenCalledWith('set_session_settings', {
      settings: {
        ...DEFAULT_SESSION_SETTINGS,
        android_vault_status_notification_enabled: false,
      },
    })
  })

  it('persists file deletion confirmation setting', async () => {
    tauriInvoke.mockImplementation(
      async (_cmd: string, payload?: {settings: typeof DEFAULT_SESSION_SETTINGS}) => ({
        ok: true,
        result: payload?.settings ?? DEFAULT_SESSION_SETTINGS,
      }),
    )

    await settingsPageModel.setConfirmFileDeletion(false)

    expect(tauriInvoke).toHaveBeenCalledWith('set_session_settings', {
      settings: {
        ...DEFAULT_SESSION_SETTINGS,
        confirm_file_deletion: false,
      },
    })
  })

  it('requests Android quick lock tile through the native command', async () => {
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
    })
    tauriInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'android_request_quick_lock_tile') {
        return {
          ok: true,
          result: {requested: true, supported: true, enabled: true, status: 'requested'},
        }
      }
      if (cmd === 'android_quick_lock_tile_status') {
        return {
          ok: true,
          result: {supported: true, requestSupported: true, enabled: true},
        }
      }
      throw new Error(`Unexpected command: ${cmd}`)
    })

    await settingsPageModel.requestAndroidQuickLockTile()

    expect(tauriInvoke).toHaveBeenCalledWith('android_request_quick_lock_tile')
  })

  it('renders the universal mobile lock toggle and incompatibility warning when autofill is supported', async () => {
    ensureDefined()
    vi.spyOn(settingsPageModel, 'load').mockResolvedValue()
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_autofill: true,
    })
    settingsPageModel.settings.set({
      ...DEFAULT_SESSION_SETTINGS,
      lock_on_mobile_background: false,
    })
    setSettingsRoute('security')

    const page = document.createElement('settings-page') as SettingsPage
    document.body.appendChild(page)
    await page.updateComplete

    const text = settingsRoot(page).textContent ?? ''
    expect(text).toContain('Lock when app is hidden or device sleeps')
    expect(text).toContain('Credential Provider / Autofill is incompatible with this option')
    expect(text).not.toContain('Lock vault when app goes to background')
  })

  it('saves the universal mobile lock toggle into both legacy fields', async () => {
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_autofill: true,
    })
    tauriInvoke.mockImplementation(
      async (_cmd: string, payload?: {settings: typeof DEFAULT_SESSION_SETTINGS}) => ({
        ok: true,
        result: payload?.settings ?? DEFAULT_SESSION_SETTINGS,
      }),
    )

    await settingsPageModel.setLockOnSleep(true)

    expect(tauriInvoke).toHaveBeenCalledWith('set_session_settings', {
      settings: {
        ...DEFAULT_SESSION_SETTINGS,
        lock_on_sleep: true,
        lock_on_mobile_background: true,
      },
    })
  })

  it('updates browser session settings without invoking Tauri', async () => {
    vi.unstubAllGlobals()

    await settingsPageModel.setShowHiddenFiles(true)

    expect(settingsPageModel.settings().show_hidden_files).toBe(true)
    expect(tauriInvoke).not.toHaveBeenCalled()
  })

  it('preserves the previous snapshot and reports failed preference saves', async () => {
    const notification = vi.spyOn(getAppContext().store, 'pushNotification')
    tauriInvoke.mockResolvedValue({ok: false, error: 'Disk is unavailable'})

    await settingsPageModel.setShowHiddenFiles(true)

    expect(settingsPageModel.settings().show_hidden_files).toBe(false)
    expect(notification).toHaveBeenCalledWith('error', 'Disk is unavailable')
    expect(settingsPageModel.preferenceErrorFor('show_hidden_files')).toBe('Failed to save settings')
    expect(settingsPageModel.preferenceSavePending()).toBe(false)
  })

  it('keeps one preference save in flight and skips competing writes', async () => {
    let resolveSave!: (value: unknown) => void
    tauriInvoke.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve
        }),
    )

    const first = settingsPageModel.setShowHiddenFiles(true)
    await Promise.resolve()
    expect(settingsPageModel.isPreferencePending('show_hidden_files')).toBe(true)

    const second = settingsPageModel.setConfirmFileDeletion(false)
    await Promise.resolve()
    expect(tauriInvoke).toHaveBeenCalledTimes(1)

    resolveSave({
      ok: true,
      result: {...DEFAULT_SESSION_SETTINGS, show_hidden_files: true},
    })
    await Promise.all([first, second])

    expect(settingsPageModel.settings()).toEqual({
      ...DEFAULT_SESSION_SETTINGS,
      show_hidden_files: true,
    })
    expect(settingsPageModel.preferenceSavePending()).toBe(false)
  })

  it('does not show a success toast for ordinary preference saves', async () => {
    const notification = vi.spyOn(getAppContext().store, 'pushNotification')
    tauriInvoke.mockImplementation(
      async (_cmd: string, payload?: {settings: typeof DEFAULT_SESSION_SETTINGS}) => ({
        ok: true,
        result: payload?.settings ?? DEFAULT_SESSION_SETTINGS,
      }),
    )

    await settingsPageModel.setShowHiddenFiles(true)

    expect(notification).not.toHaveBeenCalledWith('success', expect.any(String))
  })

  it('loads Android autofill provider selection status', async () => {
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_autofill: true,
    })
    tauriInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_session_settings') {
        return {
          ok: true,
          result: DEFAULT_SESSION_SETTINGS,
        }
      }
      if (cmd === 'credential_provider_status') {
        return {
          ok: true,
          result: {selected: true},
        }
      }
      throw new Error(`Unexpected command: ${cmd}`)
    })

    await settingsPageModel.load()

    expect(settingsPageModel.credentialProviderSelected()).toBe(true)
    expect(tauriInvoke).toHaveBeenCalledWith('credential_provider_status')
  })

  it('loads iOS credential provider status without faking selected provider state', async () => {
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
      supports_autofill: true,
    })
    tauriInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_session_settings') {
        return {
          ok: true,
          result: DEFAULT_SESSION_SETTINGS,
        }
      }
      if (cmd === 'credential_provider_status') {
        return {
          ok: true,
          result: {
            platform: 'ios',
            selected: null,
            available: true,
            passkeysLiteAvailable: true,
            passkeysLiteReason: null,
            settingsAction: 'open_app_settings',
          },
        }
      }
      throw new Error(`Unexpected command: ${cmd}`)
    })

    await settingsPageModel.load()

    expect(settingsPageModel.credentialProviderSelected()).toBeNull()
    expect(tauriInvoke).toHaveBeenCalledWith('credential_provider_status')
  })

  it('loads macOS Credential Provider selection status', async () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      mobile: false,
      supports_autofill: true,
    })
    tauriInvoke.mockResolvedValue({
      ok: true,
      result: {
        platform: 'macos',
        selected: false,
        available: true,
        settingsAction: 'request_enable',
      },
    })

    await settingsPageModel.refreshCredentialProviderStatus()

    expect(settingsPageModel.credentialProviderSelected()).toBe(false)
    expect(settingsPageModel.credentialProviderSummary()).toBe(
      'ChromVoid is not enabled as a macOS AutoFill provider yet',
    )
    expect(settingsPageModel.credentialProviderActionLabel()).toBe('Enable ChromVoid for AutoFill')
  })

  it('resolves truthful macOS verification-code capability states independently', () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      mobile: false,
      supports_autofill: true,
    })
    runtimeModeModel.setCoreMode('local')
    moduleAccessModel.rawStates.set([
      {feature_key: 'credential-provider', status: 'enabled', denial_code: null},
    ])
    const vaultData = atom({StorageOpened: true})
    clearAppContext()
    initAppContext(
      createMockAppContext({
        state: {data: vaultData} as ReturnType<typeof getAppContext>['state'],
      }),
    )
    settingsPageModel.credentialProviderSelected.set(true)
    settingsPageModel.credentialProviderNativeStatus.set({
      platform: 'macos',
      selected: true,
      capabilities: {
        oneTimeCodeAutofill: {
          status: 'unverified',
          platformVersionMajor: 15,
          apiAvailable: true,
          rolloutEnabled: true,
          bridgeAvailable: true,
        },
        verificationCodeSetupHandler: {
          status: 'available',
          scheme: 'otpauth',
          defaultSelection: 'unverified',
        },
      },
    })

    expect(settingsPageModel.macosOneTimeCodeAutofillStatus()).toBe('ready')
    expect(settingsPageModel.macosVerificationCodeSetupStatus()).toBe('available')

    vaultData.set({StorageOpened: false})
    expect(settingsPageModel.macosOneTimeCodeAutofillStatus()).toBe('vault_required')

    settingsPageModel.credentialProviderSelected.set(false)
    expect(settingsPageModel.macosOneTimeCodeAutofillStatus()).toBe('extension_not_enabled')

    settingsPageModel.credentialProviderNativeStatus.set({
      platform: 'macos',
      selected: true,
      capabilities: {
        oneTimeCodeAutofill: {
          status: 'unsupported_os',
          platformVersionMajor: 14,
          apiAvailable: false,
          rolloutEnabled: true,
          bridgeAvailable: true,
        },
      },
    })
    expect(settingsPageModel.macosOneTimeCodeAutofillStatus()).toBe('unsupported_os')

    moduleAccessModel.rawStates.set([
      {feature_key: 'credential-provider', status: 'locked_pro', denial_code: 'PRO_REQUIRED'},
    ])
    expect(settingsPageModel.credentialProviderSettingsActionDisabled()).toBe(false)

    setRuntimeCapabilities({platform: 'android', mobile: true, supports_autofill: true})
    expect(settingsPageModel.credentialProviderSettingsActionDisabled()).toBe(true)
  })

  it('renders Android autofill provider instructions and Chrome note', async () => {
    ensureDefined()
    vi.spyOn(settingsPageModel, 'load').mockResolvedValue()
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_autofill: true,
    })
    settingsPageModel.credentialProviderSelected.set(false)
    setSettingsRoute('autofill')

    const page = document.createElement('settings-page') as SettingsPage
    document.body.appendChild(page)
    await page.updateComplete

    const text = (settingsRoot(page).textContent ?? '').replace(/\s+/g, ' ')
    expect(text).toContain('Credential Provider / Autofill')
    expect(text).toContain('ChromVoid is not selected as the Android Autofill provider yet')
    expect(text).toContain('Open Autofill Provider Settings')
    expect(text).toContain('Autofill using another service')
  })

  it('renders iOS credential provider instructions with public app settings action', async () => {
    ensureDefined()
    vi.spyOn(settingsPageModel, 'load').mockResolvedValue()
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
      supports_autofill: true,
    })
    settingsPageModel.credentialProviderSelected.set(null)
    setSettingsRoute('autofill')

    const page = document.createElement('settings-page') as SettingsPage
    document.body.appendChild(page)
    await page.updateComplete

    const text = (settingsRoot(page).textContent ?? '').replace(/\s+/g, ' ')
    expect(text).toContain('Credential Provider / Autofill')
    expect(text).toContain('ChromVoid provider status must be checked in iOS settings')
    expect(text).toContain('Open App Settings')
    expect(text).toContain('iOS Password Options')
    expect(text).not.toContain('Android quick lock')
  })

  it('renders mobile autofill onboarding inline inside the provider card', async () => {
    ensureDefined()
    vi.spyOn(settingsPageModel, 'load').mockResolvedValue()
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_autofill: true,
    })
    moduleAccessModel.rawStates.set([
      {
        feature_key: 'credential-provider',
        status: 'enabled',
        denial_code: null,
      },
    ])
    setSettingsRoute('autofill')
    guidanceModel.setRoute('dashboard')
    settingsPageModel.credentialProviderSelected.set(false)

    const page = document.createElement('settings-page') as SettingsPage
    document.body.appendChild(page)
    await page.updateComplete

    const root = settingsRoot(page)
    const text = (root.textContent ?? '').replace(/\s+/g, ' ')

    expect(text).toContain('ChromVoid is not selected as the Android Autofill provider yet')
    expect(text).toContain('Open Autofill Provider Settings')
    expect(text).toContain('Autofill using another service')
    expect(root.querySelector('.provider-steps')).not.toBeNull()
  })

  it('invokes the Android autofill provider picker command', async () => {
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_autofill: true,
    })
    tauriInvoke.mockResolvedValue({
      ok: true,
      result: {opened: true},
    })

    await settingsPageModel.openCredentialProviderSettings()

    expect(tauriInvoke).toHaveBeenCalledWith('open_credential_provider_settings')
  })

  it('invokes the neutral credential provider settings command on iOS', async () => {
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
      supports_autofill: true,
    })
    tauriInvoke.mockResolvedValue({
      ok: true,
      result: {opened: true, settingsAction: 'open_app_settings'},
    })

    await settingsPageModel.openCredentialProviderSettings()

    expect(tauriInvoke).toHaveBeenCalledWith('open_credential_provider_settings')
  })

  it('requests macOS Credential Provider activation and refreshes its status', async () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      mobile: false,
      supports_autofill: true,
    })
    tauriInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'open_credential_provider_settings') {
        return {ok: true, result: {opened: true, selected: true, settingsAction: 'request_enable'}}
      }
      if (cmd === 'credential_provider_status') {
        return {ok: true, result: {platform: 'macos', selected: true, available: true}}
      }
      throw new Error(`Unexpected command: ${cmd}`)
    })

    await settingsPageModel.openCredentialProviderSettings()

    expect(tauriInvoke).toHaveBeenNthCalledWith(1, 'open_credential_provider_settings')
    expect(tauriInvoke).toHaveBeenNthCalledWith(2, 'credential_provider_status')
    expect(settingsPageModel.credentialProviderSelected()).toBe(true)
    expect(settingsPageModel.credentialProviderActionLabel()).toBe('Open AutoFill Settings')
  })

  it('does not render the legacy mobile-only background lock copy', async () => {
    ensureDefined()
    vi.spyOn(settingsPageModel, 'load').mockResolvedValue()
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      mobile: false,
    })

    const page = document.createElement('settings-page') as SettingsPage
    document.body.appendChild(page)
    await page.updateComplete

    const text = settingsRoot(page).textContent ?? ''
    expect(text).toContain('Lock when app is hidden or device sleeps')
    expect(text).not.toContain('Lock vault when app goes to background')
  })
})
