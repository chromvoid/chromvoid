import {atom, computed, wrap} from '@reatom/core'
import type {Lang} from '@project/i18n'

import {
  DEFAULT_SESSION_SETTINGS,
  loadSessionSettings,
  saveSessionSettings,
  type SessionSettings,
} from 'root/core/session/session-settings'
import {i18n, langState, langsAvalable, setLang} from 'root/i18n'
import {navigationModel} from 'root/app/navigation/navigation.model'
import {tauriInvoke} from 'root/core/transport/tauri/ipc'
import {getAppContext} from 'root/shared/services/app-context'
import {isTauriRuntime} from 'root/core/runtime/runtime'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {moduleAccessModel} from 'root/core/pro/module-access.model'
import type {ModuleAccessState} from 'root/core/pro/module-access.model'
import {biometricAppGateModel} from 'root/routes/biometric-app-gate/biometric-app-gate.model'
import {passmanagerMaintenanceModel} from 'root/features/passmanager/models/passmanager-maintenance.model'
import {normalizeMarkdownAttachmentFolderPath} from 'root/features/file-manager/services/markdown-attachment-settings'
import {vaultRekeyModel} from './vault-rekey.model'

type RpcOk<T> = {ok: true; result: T}
type RpcErr = {ok: false; error: string; code?: string | null}
type RpcResult<T> = RpcOk<T> | RpcErr

type CredentialProviderStatus = {
  platform?: 'android' | 'ios' | string
  selected: boolean | null
  available?: boolean
  passkeysLiteAvailable?: boolean
  passkeysLiteReason?: string | null
  settingsAction?: 'open_system_autofill' | 'open_app_settings' | 'show_instructions' | string
}

type SshAgentStatus = {
  running: boolean
  socket_path: string | null
  identities_count: number
}

type AndroidQuickLockTileStatus = {
  supported: boolean
  requestSupported: boolean
  enabled: boolean
}

type AndroidQuickLockTileRequestResult = {
  requested: boolean
  supported: boolean
  enabled: boolean
  status: string
}

function isOk<T>(res: RpcResult<T>): res is RpcOk<T> {
  return typeof res === 'object' && res !== null && 'ok' in res && (res as {ok: unknown}).ok === true
}

class SettingsPageModel {
  readonly vaultRekey = vaultRekeyModel
  readonly currentLanguage = computed(() => langState())
  readonly languageOptions = computed(() =>
    langsAvalable.map(([value, label]) => ({value, label})),
  )

  readonly settings = atom<SessionSettings>({...DEFAULT_SESSION_SETTINGS})
  readonly androidAutofillProviderSelected = atom<boolean | null>(null)
  readonly androidQuickLockTileStatus = atom<AndroidQuickLockTileStatus | null>(null)
  readonly sshAgentStatus = atom<SshAgentStatus | null>(null)
  readonly activationCodeDraft = atom('')
  readonly licenseActive = computed(() => moduleAccessModel.entitlement()?.licensed === true)
  readonly licenseSeatStatus = computed(() => moduleAccessModel.licenseSeatStatus())
  readonly licenseSeatBusy = computed(() => moduleAccessModel.licenseSeatLoading())
  readonly releaseCurrentSeatDisabled = computed(
    () =>
      moduleAccessModel.licenseSeatLoading() ||
      moduleAccessModel.licenseSeatStatus()?.current_device_active === false,
  )
  readonly licenseActivationBusy = computed(() => moduleAccessModel.loading())
  readonly licenseActivationDisabled = computed(
    () => moduleAccessModel.loading() || !this.activationCodeDraft().trim(),
  )
  readonly licenseCabinetOpenDisabled = computed(
    () => moduleAccessModel.loading() || this.licenseSeatStatus()?.current_device_active !== true,
  )
  readonly licenseActivationErrorLabel = computed(() => {
    const message = moduleAccessModel.error() || moduleAccessModel.licenseSeatError()
    if (!message) return ''
    if (
      message.startsWith('Unknown license key id') ||
      message.startsWith('No trusted license public key configured')
    ) {
      return i18n('settings:license-public-key-missing')
    }
    return message
  })
  readonly licenseActivationErrorHidden = computed(() => !this.licenseActivationErrorLabel())

  async load(): Promise<void> {
    if (!isTauriRuntime()) return
    try {
      const settings = await wrap(loadSessionSettings())
      this.settings.set(settings)
      biometricAppGateModel.applySessionSettings(settings)
    } catch (error) {
      console.warn('Failed to load session settings', error)
    }
    await this.refreshAndroidAutofillProviderStatus()
    await this.refreshAndroidQuickLockTileStatus()
    await this.refreshSshAgentStatus()
    await moduleAccessModel.refresh()
    if (this.licenseActive()) {
      await moduleAccessModel.refreshLicenseSeatStatus()
    }
  }

  setLanguage(value: string): void {
    if (!this.languageOptions().some((option) => option.value === value)) return
    setLang(value as Lang)
  }

  licenseStatusState(): 'selected' | 'missing' | 'unknown' {
    const entitlement = moduleAccessModel.entitlement()
    if (!entitlement) return 'unknown'
    return entitlement.licensed ? 'selected' : 'missing'
  }

  licenseStatusLabel(): string {
    const entitlement = moduleAccessModel.entitlement()
    if (!entitlement) return i18n('settings:license-status-unknown')
    return entitlement.licensed ? i18n('settings:license-status-pro') : i18n('settings:license-status-free')
  }

  licenseDetailLabel(): string {
    const entitlement = moduleAccessModel.entitlement()
    if (!entitlement) return moduleAccessModel.error() || i18n('settings:license-state-unavailable')
    return `${entitlement.source_core} · ${entitlement.build_policy}`
  }

  licenseSeatUsageLabel(): string {
    const status = moduleAccessModel.licenseSeatStatus()
    if (!status && moduleAccessModel.licenseSeatError()) return i18n('settings:license-seats-unavailable')
    if (!status) return i18n('settings:license-seats-loading')
    return i18n('settings:license-seats-usage', {
      used: status.seats_used,
      total: status.seat_limit,
      free: status.seats_available,
    })
  }

  licenseSeatsUsedLabel(): string {
    const status = moduleAccessModel.licenseSeatStatus()
    if (!status && moduleAccessModel.licenseSeatError()) return i18n('settings:license-seats-unavailable')
    if (!status) return i18n('settings:license-seats-loading')
    return `${status.seats_used} / ${status.seat_limit}`
  }

  licenseSeatsAvailableLabel(): string {
    const status = moduleAccessModel.licenseSeatStatus()
    if (!status && moduleAccessModel.licenseSeatError()) return i18n('settings:license-seats-unavailable')
    if (!status) return i18n('settings:license-seats-loading')
    return String(status.seats_available)
  }

  licensePurchaseIdLabel(): string {
    return moduleAccessModel.licenseSeatStatus()?.purchase_id ?? ''
  }

  setActivationCodeDraft(value: string): void {
    moduleAccessModel.clearError()
    this.activationCodeDraft.set(value)
  }

  async activateLicense(): Promise<void> {
    const activationCode = this.activationCodeDraft().trim()
    if (!activationCode) return
    const ok = await moduleAccessModel.activateWithActivationCode(activationCode)
    if (ok) {
      this.activationCodeDraft.set('')
      getAppContext().store.pushNotification('success', i18n('settings:license-activated'))
    } else {
      getAppContext().store.pushNotification(
        'error',
        moduleAccessModel.error() || i18n('settings:license-activation-failed'),
      )
    }
  }

  async releaseCurrentSeat(): Promise<void> {
    const ok = await moduleAccessModel.releaseCurrentSeat()
    if (ok) {
      getAppContext().store.pushNotification('success', i18n('settings:license-release-seat-success'))
    } else {
      getAppContext().store.pushNotification(
        'error',
        moduleAccessModel.licenseSeatError() || i18n('settings:license-release-seat-failed'),
      )
    }
  }

  async openLicenseCabinet(): Promise<void> {
    const handoff = await moduleAccessModel.createLicenseCabinetHandoff()
    if (!handoff) {
      getAppContext().store.pushNotification(
        'error',
        moduleAccessModel.error() || i18n('settings:license-cabinet-open-failed'),
      )
      return
    }
    window.open(handoff.cabinet_url, '_blank', 'noopener,noreferrer')
  }

  async setAutoLockTimeout(rawValue: string): Promise<void> {
    const secs = Number.parseInt(rawValue, 10)
    if (Number.isNaN(secs)) return
    await this.saveSettings({...this.settings(), auto_lock_timeout_secs: secs})
  }

  isLockOnSleepEnabled(): boolean {
    const settings = this.settings()
    if (!this.isMobileRuntime()) return settings.lock_on_sleep
    return settings.lock_on_sleep || settings.lock_on_mobile_background
  }

  async setLockOnSleep(checked: boolean): Promise<void> {
    const settings = this.settings()
    await this.saveSettings({
      ...settings,
      lock_on_sleep: checked,
      lock_on_mobile_background: this.isMobileRuntime() ? checked : settings.lock_on_mobile_background,
    })
  }

  async setAutoMountAfterUnlock(checked: boolean): Promise<void> {
    await this.saveSettings({...this.settings(), auto_mount_after_unlock: checked})
  }

  async setAutoStartSshAgentAfterUnlock(checked: boolean): Promise<void> {
    await this.saveSettings({...this.settings(), auto_start_ssh_agent_after_unlock: checked})
  }

  async setRequireBiometricAppGate(checked: boolean): Promise<void> {
    await this.saveSettings({...this.settings(), require_biometric_app_gate: checked})
  }

  async setKeepScreenAwakeWhenUnlocked(checked: boolean): Promise<void> {
    await this.saveSettings({...this.settings(), keep_screen_awake_when_unlocked: checked})
  }

  async setAndroidVaultStatusNotificationEnabled(checked: boolean): Promise<void> {
    await this.saveSettings({
      ...this.settings(),
      android_vault_status_notification_enabled: checked,
    })
  }

  async setAndroidQuickLockTileEnabled(checked: boolean): Promise<void> {
    await this.saveSettings({
      ...this.settings(),
      android_quick_lock_tile_enabled: checked,
    })
    await this.refreshAndroidQuickLockTileStatus()
  }

  async setConfirmFileDeletion(checked: boolean): Promise<void> {
    await this.saveSettings({...this.settings(), confirm_file_deletion: checked})
  }

  async setShowHiddenFiles(checked: boolean): Promise<void> {
    await this.saveSettings({...this.settings(), show_hidden_files: checked})
  }

  async setMarkdownAttachmentFolderPath(rawValue: string): Promise<void> {
    const normalized = normalizeMarkdownAttachmentFolderPath(rawValue)
    if (!normalized.ok) {
      getAppContext().store.pushNotification('error', i18n(normalized.errorKey))
      return
    }

    const settings = this.settings()
    if (settings.markdown_attachment_folder_path === normalized.path) {
      return
    }

    await this.saveSettings({
      ...settings,
      markdown_attachment_folder_path: normalized.path,
    })
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

  credentialProviderAccess(): ModuleAccessState {
    return moduleAccessModel.featureAccess('credential-provider')
  }

  showsCredentialProviderSection(): boolean {
    const caps = getRuntimeCapabilities()
    return caps.mobile && caps.supports_autofill
  }

  showsAndroidAutofillProviderSection(): boolean {
    return this.showsCredentialProviderSection()
  }

  async refreshAndroidAutofillProviderStatus(): Promise<void> {
    await this.refreshCredentialProviderStatus()
  }

  async refreshCredentialProviderStatus(): Promise<void> {
    if (!isTauriRuntime() || !this.showsCredentialProviderSection()) {
      this.androidAutofillProviderSelected.set(null)
      return
    }

    try {
      const res = await wrap(
        tauriInvoke<RpcResult<CredentialProviderStatus>>('credential_provider_status'),
      )
      if (!isOk(res)) {
        throw new Error(res.error || i18n('settings:provider-query-failed'))
      }
      this.androidAutofillProviderSelected.set(
        typeof res.result.selected === 'boolean' ? res.result.selected : null,
      )
    } catch (error) {
      console.warn('Failed to query credential provider status', error)
      this.androidAutofillProviderSelected.set(null)
    }
  }

  async refreshAndroidQuickLockTileStatus(): Promise<void> {
    if (!isTauriRuntime() || !this.isAndroidRuntime()) {
      this.androidQuickLockTileStatus.set(null)
      return
    }

    try {
      const res = await wrap(
        tauriInvoke<RpcResult<AndroidQuickLockTileStatus>>('android_quick_lock_tile_status'),
      )
      if (!isOk(res)) {
        throw new Error(res.error || i18n('settings:android-quick-lock-tile-status-failed'))
      }
      this.androidQuickLockTileStatus.set(res.result)
    } catch (error) {
      console.warn('Failed to query Android quick lock tile status', error)
      this.androidQuickLockTileStatus.set(null)
    }
  }

  async requestAndroidQuickLockTile(): Promise<void> {
    if (!isTauriRuntime() || !this.isAndroidRuntime()) return

    try {
      const res = await wrap(
        tauriInvoke<RpcResult<AndroidQuickLockTileRequestResult>>(
          'android_request_quick_lock_tile',
        ),
      )
      if (!isOk(res)) {
        throw new Error(res.error || i18n('settings:android-quick-lock-tile-request-failed'))
      }
      if (res.result.requested) {
        getAppContext().store.pushNotification(
          'success',
          i18n('settings:android-quick-lock-tile-requested'),
        )
      } else if (!res.result.supported) {
        getAppContext().store.pushNotification(
          'warning',
          i18n('settings:android-quick-lock-tile-unsupported'),
        )
      } else {
        getAppContext().store.pushNotification(
          'warning',
          i18n('settings:android-quick-lock-tile-request-failed'),
        )
      }
      await this.refreshAndroidQuickLockTileStatus()
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : i18n('settings:android-quick-lock-tile-request-failed')
      console.warn(message, error)
      getAppContext().store.pushNotification('error', message)
    }
  }

  async refreshSshAgentStatus(): Promise<void> {
    if (!isTauriRuntime() || this.isMobileRuntime()) {
      this.sshAgentStatus.set(null)
      return
    }

    try {
      const status = await wrap(tauriInvoke<SshAgentStatus>('ssh_agent_status'))
      this.sshAgentStatus.set(status)
    } catch (error) {
      console.warn('Failed to query SSH agent status', error)
      this.sshAgentStatus.set(null)
    }
  }

  async startSshAgent(): Promise<void> {
    if (!isTauriRuntime() || this.isMobileRuntime()) return

    try {
      const status = await wrap(tauriInvoke<SshAgentStatus>('ssh_agent_start'))
      this.sshAgentStatus.set(status)
      getAppContext().store.pushNotification('success', i18n('settings:ssh-agent-started'))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn('Failed to start SSH agent', error)
      getAppContext().store.pushNotification('error', message)
    }
  }

  async stopSshAgent(): Promise<void> {
    if (!isTauriRuntime() || this.isMobileRuntime()) return

    try {
      const status = await wrap(tauriInvoke<SshAgentStatus>('ssh_agent_stop'))
      this.sshAgentStatus.set(status)
      getAppContext().store.pushNotification('success', i18n('settings:ssh-agent-stopped'))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn('Failed to stop SSH agent', error)
      getAppContext().store.pushNotification('error', message)
    }
  }

  async copySshAgentSocketPath(): Promise<void> {
    const socketPath = this.sshAgentStatus()?.socket_path
    if (!socketPath) return

    try {
      await wrap(navigator.clipboard.writeText(socketPath))
      getAppContext().store.pushNotification('success', i18n('settings:ssh-agent-socket-copied'))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn('Failed to copy SSH agent socket path', error)
      getAppContext().store.pushNotification('error', i18n('errors:failed-to-copy', {message}))
    }
  }

  async openAndroidAutofillProviderSettings(): Promise<void> {
    await this.openCredentialProviderSettings()
  }

  async openCredentialProviderSettings(): Promise<void> {
    if (!isTauriRuntime() || !this.showsCredentialProviderSection()) return

    try {
      const res = await wrap(
        tauriInvoke<RpcResult<{opened: boolean; settingsAction?: string}>>(
          'open_credential_provider_settings',
        ),
      )
      if (!isOk(res) || !res.result.opened) {
        throw new Error(isOk(res) ? i18n('settings:provider-open-failed') : res.error)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : i18n('settings:provider-open-failed')
      console.warn(message, error)
      getAppContext().store.pushNotification('error', message)
    }
  }

  passwordImportDialogOpen(): boolean {
    return passmanagerMaintenanceModel.importDialogOpen()
  }

  passwordImportCompletedSuccessfully(): boolean {
    return passmanagerMaintenanceModel.importCompletedSuccessfully()
  }

  passwordMaintenanceBusyAction() {
    return passmanagerMaintenanceModel.busyAction()
  }

  openPasswordImport(): Promise<void> {
    return passmanagerMaintenanceModel.openSettingsImportDialog()
  }

  exportPasswords(): Promise<void> {
    return passmanagerMaintenanceModel.exportRoot()
  }

  cleanPasswords(): Promise<void> {
    return passmanagerMaintenanceModel.cleanRoot()
  }

  handlePasswordImportComplete(event: Event): Promise<void> {
    return passmanagerMaintenanceModel.handleImportComplete(event)
  }

  closePasswordImportDialog(): void {
    passmanagerMaintenanceModel.closeSettingsImportDialog()
  }

  private async saveSettings(settings: SessionSettings): Promise<void> {
    if (!isTauriRuntime()) return
    try {
      const savedSettings = await wrap(saveSessionSettings(settings))
      this.settings.set(savedSettings)
      biometricAppGateModel.applySessionSettings(savedSettings)
      if (this.isAndroidRuntime()) {
        this.androidQuickLockTileStatus.set({
          ...(this.androidQuickLockTileStatus() ?? {
            supported: false,
            requestSupported: false,
          }),
          enabled: savedSettings.android_quick_lock_tile_enabled,
        })
      }
      getAppContext().store.pushNotification('success', i18n('settings:saved'))
    } catch (error) {
      console.warn('Failed to save session settings', error)
    }
  }
}

export const settingsPageModel = new SettingsPageModel()
