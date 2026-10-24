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
import {moduleAccessModel} from '../../src/core/modules/module-access.model'
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

function setSettingsRoute(kind: 'overview' | 'security' | 'autofill' | 'files' | 'passwords') {
  navigationModel.snapshot.set({
    surface: 'settings',
    settings: {kind},
    overlay: {kind: 'none'},
  })
}

describe('Session settings mobile background lock', () => {
  beforeEach(() => {
    tauriInvoke.mockReset()
    resetRuntimeCapabilities()
    settingsPageModel.settings.set({...DEFAULT_SESSION_SETTINGS})
    settingsPageModel.credentialProviderSelected.set(null)
    settingsPageModel.credentialProviderNativeStatus.set(null)
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

  it('keeps inactivity auto-lock and biometric app gate opt-in by default', () => {
    expect(DEFAULT_SESSION_SETTINGS.auto_lock_timeout_secs).toBe(0)
    expect(DEFAULT_SESSION_SETTINGS.require_biometric_app_gate).toBe(false)
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

  it('switches WebView and passmanager language from settings without reload', async () => {
    ensureDefined()
    vi.spyOn(settingsPageModel, 'load').mockResolvedValue()
    setRuntimeCapabilities({platform: 'ios', mobile: true})
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

  it('renders the universal mobile lock toggle and incompatibility warning when autofill is supported', async () => {
    ensureDefined()
    vi.spyOn(settingsPageModel, 'load').mockResolvedValue()
    setRuntimeCapabilities({
      platform: 'ios',
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
      platform: 'ios',
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
    moduleAccessModel.resolution.set({
      phase: 'resolved',
      states: [
        {feature_key: 'credential-provider', status: 'enabled', denial_code: null},
      ],
    })
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

    moduleAccessModel.resolution.set({
      phase: 'resolved',
      states: [
        {feature_key: 'credential-provider', status: 'disabled_by_rollout', denial_code: 'FEATURE_DISABLED_BY_ROLLOUT'},
      ],
    })
    expect(settingsPageModel.credentialProviderSettingsActionDisabled()).toBe(false)

    setRuntimeCapabilities({platform: 'ios', mobile: true, supports_autofill: true})
    expect(settingsPageModel.credentialProviderSettingsActionDisabled()).toBe(true)
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
  })

  it('renders mobile autofill onboarding inline inside the provider card', async () => {
    ensureDefined()
    vi.spyOn(settingsPageModel, 'load').mockResolvedValue()
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
      supports_autofill: true,
    })
    moduleAccessModel.resolution.set({
      phase: 'resolved',
      states: [
        {
          feature_key: 'credential-provider',
          status: 'enabled',
          denial_code: null,
        },
      ],
    })
    setSettingsRoute('autofill')
    guidanceModel.setRoute('dashboard')
    settingsPageModel.credentialProviderSelected.set(false)

    const page = document.createElement('settings-page') as SettingsPage
    document.body.appendChild(page)
    await page.updateComplete

    const root = settingsRoot(page)
    const text = (root.textContent ?? '').replace(/\s+/g, ' ')

    expect(text).toContain('ChromVoid provider status must be checked in iOS settings')
    expect(text).toContain('Open App Settings')
    expect(text).toContain('iOS Password Options')
    expect(root.querySelector('.provider-steps')).not.toBeNull()
  })

  it('explains unavailable credential provider access without blocking the section', async () => {
    ensureDefined()
    vi.spyOn(settingsPageModel, 'load').mockResolvedValue()
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
      supports_autofill: true,
    })
    moduleAccessModel.resolution.set({
      phase: 'resolved',
      states: [
        {feature_key: 'credential-provider', status: 'disabled_by_rollout', denial_code: 'FEATURE_DISABLED_BY_ROLLOUT'},
      ],
    })
    setSettingsRoute('autofill')

    const page = document.createElement('settings-page') as SettingsPage
    document.body.appendChild(page)
    await page.updateComplete

    expect(settingsRoot(page).querySelector('cv-callout')?.textContent).toContain(
      'This feature is currently disabled',
    )
    expect(settingsPageModel.credentialProviderSettingsActionDisabled()).toBe(true)

    moduleAccessModel.resolution.set({phase: 'failed', error: 'snapshot unavailable'})
    await Promise.resolve()
    await settingsLayout(page).updateComplete

    expect(settingsRoot(page).querySelector('cv-callout')?.textContent).toContain(
      'could not confirm whether this feature is available',
    )

    moduleAccessModel.resolution.set({
      phase: 'resolved',
      states: [{feature_key: 'credential-provider', status: 'enabled', denial_code: null}],
    })
    await Promise.resolve()
    await settingsLayout(page).updateComplete

    expect(settingsRoot(page).querySelector('cv-callout')).toBeNull()
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
