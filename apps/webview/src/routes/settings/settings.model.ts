import {state} from '@statx/core'

import {
  DEFAULT_SESSION_SETTINGS,
  loadSessionSettings,
  saveSessionSettings,
  type SessionSettings,
} from 'root/core/session/session-settings'
import {navigationModel} from 'root/app/navigation/navigation.model'
import {tauriInvoke} from 'root/core/transport/tauri/ipc'
import {getAppContext} from 'root/shared/services/app-context'
import {isTauriRuntime} from 'root/core/runtime/runtime'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {biometricAppGateModel} from 'root/routes/biometric-app-gate/biometric-app-gate.model'

type RpcOk<T> = {ok: true; result: T}
type RpcErr = {ok: false; error: string; code?: string | null}
type RpcResult<T> = RpcOk<T> | RpcErr

type AndroidAutofillProviderStatus = {
  selected: boolean
}

function isOk<T>(res: RpcResult<T>): res is RpcOk<T> {
  return typeof res === 'object' && res !== null && 'ok' in res && (res as {ok: unknown}).ok === true
}

class SettingsPageModel {
  readonly settings = state<SessionSettings>({...DEFAULT_SESSION_SETTINGS})
  readonly androidAutofillProviderSelected = state<boolean | null>(null)

  async load(): Promise<void> {
    if (!isTauriRuntime()) return
    try {
      const settings = await loadSessionSettings()
      this.settings.set(settings)
      biometricAppGateModel.applySessionSettings(settings)
    } catch (error) {
      console.warn('Failed to load session settings', error)
    }
    await this.refreshAndroidAutofillProviderStatus()
  }

  async setAutoLockTimeout(rawValue: string): Promise<void> {
    const secs = Number.parseInt(rawValue, 10)
    if (Number.isNaN(secs)) return
    await this.saveSettings({...this.settings(), auto_lock_timeout_secs: secs})
  }

  async setLockOnSleep(checked: boolean): Promise<void> {
    await this.saveSettings({...this.settings(), lock_on_sleep: checked})
  }

  async setLockOnMobileBackground(checked: boolean): Promise<void> {
    await this.saveSettings({...this.settings(), lock_on_mobile_background: checked})
  }

  async setAutoMountAfterUnlock(checked: boolean): Promise<void> {
    await this.saveSettings({...this.settings(), auto_mount_after_unlock: checked})
  }

  async setRequireBiometricAppGate(checked: boolean): Promise<void> {
    await this.saveSettings({...this.settings(), require_biometric_app_gate: checked})
  }

  async setKeepScreenAwakeWhenUnlocked(checked: boolean): Promise<void> {
    await this.saveSettings({...this.settings(), keep_screen_awake_when_unlocked: checked})
  }

  goBack(): void {
    navigationModel.goBack()
  }

  isIosRuntime(): boolean {
    return getRuntimeCapabilities().platform === 'ios'
  }

  isAndroidRuntime(): boolean {
    return getRuntimeCapabilities().platform === 'android'
  }

  isMobileRuntime(): boolean {
    return Boolean(getRuntimeCapabilities().mobile)
  }

  isMobileBiometricSupported(): boolean {
    const caps = getRuntimeCapabilities()
    return caps.mobile && caps.supports_biometric
  }

  supportsCredentialProviderAutofill(): boolean {
    const caps = getRuntimeCapabilities()
    return caps.mobile && caps.supports_autofill
  }

  showsAndroidAutofillProviderSection(): boolean {
    const caps = getRuntimeCapabilities()
    return caps.platform === 'android' && caps.supports_autofill
  }

  async refreshAndroidAutofillProviderStatus(): Promise<void> {
    if (!isTauriRuntime() || !this.showsAndroidAutofillProviderSection()) {
      this.androidAutofillProviderSelected.set(null)
      return
    }

    try {
      const res = await tauriInvoke<RpcResult<AndroidAutofillProviderStatus>>(
        'android_autofill_provider_status',
      )
      if (!isOk(res)) {
        throw new Error(res.error || 'Failed to query Android autofill provider status')
      }
      this.androidAutofillProviderSelected.set(Boolean(res.result.selected))
    } catch (error) {
      console.warn('Failed to query Android autofill provider status', error)
      this.androidAutofillProviderSelected.set(null)
    }
  }

  async openAndroidAutofillProviderSettings(): Promise<void> {
    if (!isTauriRuntime() || !this.showsAndroidAutofillProviderSection()) return

    try {
      const res = await tauriInvoke<RpcResult<{opened: boolean}>>('android_open_autofill_provider_settings')
      if (!isOk(res) || !res.result.opened) {
        throw new Error(isOk(res) ? 'Failed to open Android autofill provider settings' : res.error)
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to open Android autofill provider settings'
      console.warn(message, error)
      getAppContext().store.pushNotification('error', message)
    }
  }

  private async saveSettings(settings: SessionSettings): Promise<void> {
    if (!isTauriRuntime()) return
    try {
      const savedSettings = await saveSessionSettings(settings)
      this.settings.set(savedSettings)
      biometricAppGateModel.applySessionSettings(savedSettings)
      getAppContext().store.pushNotification('success', 'Settings saved')
    } catch (error) {
      console.warn('Failed to save session settings', error)
    }
  }
}

export const settingsPageModel = new SettingsPageModel()
