import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {
  DEFAULT_SESSION_SETTINGS,
  loadSessionSettings,
  saveSessionSettings,
} from '../../src/core/session/session-settings'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {SettingsPage} from '../../src/routes/settings/settings-page'
import {settingsPageModel} from '../../src/routes/settings/settings.model'

const tauriInvoke = vi.fn()

vi.mock('root/core/transport/tauri/ipc', () => {
  return {
    tauriInvoke: (...args: unknown[]) => tauriInvoke(...args),
  }
})

let defined = false

function ensureDefined() {
  if (defined) return
  SettingsPage.define()
  defined = true
}

describe('Session settings mobile background lock', () => {
  beforeEach(() => {
    tauriInvoke.mockReset()
    resetRuntimeCapabilities()
    settingsPageModel.settings.set({...DEFAULT_SESSION_SETTINGS})
    settingsPageModel.androidAutofillProviderSelected.set(null)
    vi.stubGlobal('__TAURI_INTERNALS__', {invoke: vi.fn()})
  })

  afterEach(() => {
    document.querySelectorAll('settings-page').forEach((element) => element.remove())
    settingsPageModel.settings.set({...DEFAULT_SESSION_SETTINGS})
    settingsPageModel.androidAutofillProviderSelected.set(null)
    resetRuntimeCapabilities()
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
      keep_screen_awake_when_unlocked: true,
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

  it('renders the mobile background-lock toggle and incompatibility warning when autofill is supported', async () => {
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

    const page = document.createElement('settings-page') as SettingsPage
    page.hideBackLink = true
    document.body.appendChild(page)
    await page.updateComplete

    const text = page.shadowRoot?.textContent ?? ''
    expect(text).toContain('Lock vault when app goes to background')
    expect(text).toContain('Credential Provider / Autofill is incompatible with this option')
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
      if (cmd === 'android_autofill_provider_status') {
        return {
          ok: true,
          result: {selected: true},
        }
      }
      throw new Error(`Unexpected command: ${cmd}`)
    })

    await settingsPageModel.load()

    expect(settingsPageModel.androidAutofillProviderSelected()).toBe(true)
    expect(tauriInvoke).toHaveBeenCalledWith('android_autofill_provider_status')
  })

  it('renders Android autofill provider instructions and Chrome note', async () => {
    ensureDefined()
    vi.spyOn(settingsPageModel, 'load').mockResolvedValue()
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_autofill: true,
    })
    settingsPageModel.androidAutofillProviderSelected.set(false)

    const page = document.createElement('settings-page') as SettingsPage
    page.hideBackLink = true
    document.body.appendChild(page)
    await page.updateComplete

    const text = (page.shadowRoot?.textContent ?? '').replace(/\s+/g, ' ')
    expect(text).toContain('Credential Provider / Autofill')
    expect(text).toContain('ChromVoid is not selected as the Android Autofill provider yet')
    expect(text).toContain('Open Autofill Provider Settings')
    expect(text).toContain('Autofill using another service')
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

    await settingsPageModel.openAndroidAutofillProviderSettings()

    expect(tauriInvoke).toHaveBeenCalledWith('android_open_autofill_provider_settings')
  })

  it('hides the mobile background-lock toggle outside mobile runtime', async () => {
    ensureDefined()
    vi.spyOn(settingsPageModel, 'load').mockResolvedValue()
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      mobile: false,
    })

    const page = document.createElement('settings-page') as SettingsPage
    page.hideBackLink = true
    document.body.appendChild(page)
    await page.updateComplete

    const text = page.shadowRoot?.textContent ?? ''
    expect(text).not.toContain('Lock vault when app goes to background')
  })
})
