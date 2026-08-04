import {action, atom, computed, withAbort, withAsync, wrap} from '@reatom/core'
import type {Lang} from '@project/i18n'

import {
  DEFAULT_SESSION_SETTINGS,
  loadSessionSettings,
  saveSessionSettings,
  type SessionSettings,
} from 'root/core/session/session-settings'
import {i18n, langState, langsAvailable, setLang} from 'root/i18n'
import {tauriInvoke} from 'root/core/transport/tauri/ipc'
import {getAppContext, tryGetAppContext} from 'root/shared/services/app-context'
import {isTauriRuntime} from 'root/core/runtime/runtime'
import {runtimeCapabilitiesAtom} from 'root/core/runtime/runtime-capabilities'
import {runtimeModeModel} from 'root/core/runtime/runtime-mode.model'
import {moduleAccessModel} from 'root/core/pro/module-access.model'
import type {ModuleAccessState} from 'root/core/pro/module-access.model'
import {biometricAppGateModel} from 'root/routes/biometric-app-gate/biometric-app-gate.model'
import {passmanagerMaintenanceModel} from 'root/features/passmanager/models/passmanager-maintenance.model'
import {normalizeMarkdownAttachmentFolderPath} from 'root/features/file-manager/services/markdown-attachment-settings'
import {navigationModel} from 'root/app/navigation/navigation.model'
import type {SettingsRoute} from 'root/app/navigation/navigation.types'
import {
  macosOtpAutofillStatusLabel,
  macosOtpAutofillStatusState,
  macosVerificationCodeSetupStatusLabel,
  resolveMacosOtpAutofillStatus,
  type CredentialProviderNativeStatus,
  type MacosOneTimeCodeAutofillStatus,
} from './macos-credential-provider-status'
import {vaultRekeyModel} from './vault-rekey.model'

type RpcOk<T> = {ok: true; result: T}
type RpcErr = {ok: false; error: string; code?: string | null}
type RpcResult<T> = RpcOk<T> | RpcErr

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

export type SettingsPreferenceKey = keyof SessionSettings

function isOk<T>(res: RpcResult<T>): res is RpcOk<T> {
  return typeof res === 'object' && res !== null && 'ok' in res && (res as {ok: unknown}).ok === true
}

class SettingsPageModel {
  private passwordImportTaskRequest = 0

  readonly vaultRekey = vaultRekeyModel
  readonly currentLanguage = computed(() => langState())
  readonly languageOptions = computed(() => langsAvailable.map(([value, label]) => ({value, label})))
  readonly currentLanguageLabel = computed(
    () =>
      this.languageOptions().find((option) => option.value === this.currentLanguage())?.label ??
      this.currentLanguage(),
  )

  readonly settings = atom<SessionSettings>({...DEFAULT_SESSION_SETTINGS})
  readonly activePreference = atom<SettingsPreferenceKey | null>(null, 'settings.activePreference')
  readonly failedPreference = atom<SettingsPreferenceKey | null>(null, 'settings.failedPreference')
  private readonly persistPreference = action(
    async (input: {key: SettingsPreferenceKey; settings: SessionSettings}) => {
      if (this.failedPreference() === input.key) this.failedPreference.set(null)
      this.activePreference.set(input.key)
      try {
        const savedSettings = await wrap(saveSessionSettings(input.settings))
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
        return savedSettings
      } catch (error) {
        this.failedPreference.set(input.key)
        console.warn('Failed to save session settings', error)
        const message = error instanceof Error ? error.message : i18n('settings:save-failed')
        getAppContext().store.pushNotification('error', message || i18n('settings:save-failed'))
        throw error
      } finally {
        this.activePreference.set(null)
      }
    },
    'settings.persistPreference',
  ).extend(withAsync(), withAbort('first-in-win'))
  readonly preferenceSavePending = computed(
    () => this.persistPreference.pending() > 0,
    'settings.preferenceSavePending',
  )
  readonly preferenceSaveError = computed(() => {
    const error = this.persistPreference.error()
    return error instanceof Error ? error.message : error ? String(error) : ''
  }, 'settings.preferenceSaveError')
  readonly credentialProviderSelected = atom<boolean | null>(
    null,
    'settings.credentialProviderSelected',
  )
  readonly credentialProviderNativeStatus = atom<CredentialProviderNativeStatus | null>(
    null,
    'settings.credentialProviderNativeStatus',
  )
  readonly androidQuickLockTileStatus = atom<AndroidQuickLockTileStatus | null>(null)
  readonly sshAgentStatus = atom<SshAgentStatus | null>(null)
  readonly supportsExternalPro = computed(
    () => moduleAccessModel.supportsExternalPro(),
    'settings.supportsExternalPro',
  )
  readonly activationCodeDraft = atom('')
  readonly activationCodeError = atom('', 'settings.activationCodeError')
  readonly licenseActive = computed(() => moduleAccessModel.entitlement()?.licensed === true)
  readonly licenseSeatStatus = computed(() => moduleAccessModel.licenseSeatStatus())
  readonly licenseSeatBusy = computed(() => moduleAccessModel.licenseSeatLoading())
  readonly releaseCurrentSeatDisabled = computed(
    () =>
      moduleAccessModel.licenseSeatLoading() ||
      moduleAccessModel.licenseSeatStatus()?.current_device_active === false,
  )
  readonly licenseActivationBusy = computed(() => moduleAccessModel.loading())
  readonly licenseActivationDisabled = computed(() => moduleAccessModel.loading())
  readonly licenseCabinetOpenDisabled = computed(
    () => moduleAccessModel.loading() || this.licenseSeatStatus()?.current_device_active !== true,
  )
  readonly licenseActivationErrorLabel = computed(() => {
    if (this.activationCodeError()) return this.activationCodeError()
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
  readonly autoLockSummary = computed(() => this.autoLockLabel(this.settings().auto_lock_timeout_secs))
  readonly credentialProviderSummary = computed(() => {
    const platform = runtimeCapabilitiesAtom().platform
    const selected = this.credentialProviderSelected()
    if (platform === 'macos') {
      if (selected === true) return i18n('settings:provider-selected-macos')
      if (selected === false) return i18n('settings:provider-missing-macos')
      return i18n('settings:provider-unknown-macos')
    }
    if (platform === 'ios') return i18n('settings:provider-unknown-ios')
    if (selected === true) return i18n('settings:provider-selected')
    if (selected === false) return i18n('settings:provider-missing')
    return i18n('settings:provider-unknown')
  })
  readonly credentialProviderStatusState = computed<'selected' | 'missing' | 'unknown'>(() => {
    const selected = this.credentialProviderSelected()
    return selected === true ? 'selected' : selected === false ? 'missing' : 'unknown'
  })
  readonly macosOneTimeCodeAutofillStatus = computed<MacosOneTimeCodeAutofillStatus>(() => {
    return resolveMacosOtpAutofillStatus({
      platform: runtimeCapabilitiesAtom().platform,
      nativeStatus: this.credentialProviderNativeStatus(),
      selected: this.credentialProviderSelected(),
      localCoreMode: runtimeModeModel.localCoreMode(),
      accessStatus: this.credentialProviderAccess().status,
      vaultOpen: Boolean(getAppContext().state.data()?.StorageOpened),
    })
  }, 'settings.macosOneTimeCodeAutofillStatus')
  readonly macosVerificationCodeSetupStatus = computed<'available' | 'unverified'>(() =>
    this.credentialProviderNativeStatus()?.capabilities?.verificationCodeSetupHandler?.status === 'available'
      ? 'available'
      : 'unverified',
  )
  readonly credentialProviderSettingsActionDisabled = computed(
    () =>
      runtimeCapabilitiesAtom().platform !== 'macos' &&
      this.credentialProviderAccess().status !== 'enabled',
    'settings.credentialProviderSettingsActionDisabled',
  )
  readonly credentialProviderDescription = computed(() => {
    const platform = runtimeCapabilitiesAtom().platform
    if (platform === 'macos') return i18n('settings:provider-description-macos')
    if (platform === 'ios') return i18n('settings:provider-description-ios')
    return i18n('settings:provider-description')
  })
  readonly credentialProviderActionLabel = computed(() => {
    const platform = runtimeCapabilitiesAtom().platform
    if (platform === 'macos') {
      return this.credentialProviderSelected() === false
        ? i18n('settings:provider-enable-macos')
        : i18n('settings:provider-manage-macos')
    }
    return i18n(platform === 'ios' ? 'settings:provider-open-ios' : 'settings:provider-open')
  })
  readonly credentialProviderSteps = computed<readonly [string, string]>(() => {
    const platform = runtimeCapabilitiesAtom().platform
    if (platform === 'macos') {
      return [
        i18n('settings:provider-step-1-macos'),
        i18n('settings:provider-step-2-macos'),
      ] as const
    }
    if (platform === 'ios') {
      return [i18n('settings:provider-step-1-ios'), i18n('settings:provider-step-2-ios')] as const
    }
    return [i18n('settings:provider-step-1'), i18n('settings:provider-step-2')] as const
  })
  readonly licenseSummary = computed(() => this.licenseStatusLabel())

  async load(): Promise<void> {
    try {
      const settings = await wrap(loadSessionSettings())
      this.settings.set(settings)
      this.failedPreference.set(null)
      biometricAppGateModel.applySessionSettings(settings)
    } catch (error) {
      console.warn('Failed to load session settings', error)
    }
    if (!isTauriRuntime()) return
    await this.refreshCredentialProviderStatus()
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
    if (!this.supportsExternalPro()) return
    moduleAccessModel.clearError()
    this.activationCodeError.set('')
    this.activationCodeDraft.set(value)
  }

  async activateLicense(): Promise<boolean> {
    if (!this.supportsExternalPro()) return false
    const activationCode = this.activationCodeDraft().trim()
    if (!activationCode) {
      this.activationCodeError.set(i18n('dialogs:field-required'))
      return false
    }
    const ok = await wrap(moduleAccessModel.activateWithActivationCode(activationCode))
    if (ok) {
      this.activationCodeDraft.set('')
      getAppContext().store.pushNotification('success', i18n('settings:license-activated'))
    } else {
      getAppContext().store.pushNotification(
        'error',
        moduleAccessModel.error() || i18n('settings:license-activation-failed'),
      )
    }
    return ok
  }

  async releaseCurrentSeat(): Promise<void> {
    if (!this.supportsExternalPro()) return
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
    if (!this.supportsExternalPro()) return
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

  async setAutoLockTimeout(rawValue: string): Promise<boolean> {
    const secs = Number.parseInt(rawValue, 10)
    if (Number.isNaN(secs)) return false
    return await this.saveSettings('auto_lock_timeout_secs', {
      ...this.settings(),
      auto_lock_timeout_secs: secs,
    })
  }

  isLockOnSleepEnabled(): boolean {
    const settings = this.settings()
    if (!this.isMobileRuntime()) return settings.lock_on_sleep
    return settings.lock_on_sleep || settings.lock_on_mobile_background
  }

  async setLockOnSleep(checked: boolean): Promise<void> {
    const settings = this.settings()
    await this.saveSettings('lock_on_sleep', {
      ...settings,
      lock_on_sleep: checked,
      lock_on_mobile_background: this.isMobileRuntime() ? checked : settings.lock_on_mobile_background,
    })
  }

  async setAutoMountAfterUnlock(checked: boolean): Promise<void> {
    await this.saveSettings('auto_mount_after_unlock', {
      ...this.settings(),
      auto_mount_after_unlock: checked,
    })
  }

  async setAutoStartSshAgentAfterUnlock(checked: boolean): Promise<void> {
    await this.saveSettings('auto_start_ssh_agent_after_unlock', {
      ...this.settings(),
      auto_start_ssh_agent_after_unlock: checked,
    })
  }

  async setRequireBiometricAppGate(checked: boolean): Promise<void> {
    await this.saveSettings('require_biometric_app_gate', {
      ...this.settings(),
      require_biometric_app_gate: checked,
    })
  }

  async setKeepScreenAwakeWhenUnlocked(checked: boolean): Promise<void> {
    await this.saveSettings('keep_screen_awake_when_unlocked', {
      ...this.settings(),
      keep_screen_awake_when_unlocked: checked,
    })
  }

  async setAndroidVaultStatusNotificationEnabled(checked: boolean): Promise<void> {
    await this.saveSettings('android_vault_status_notification_enabled', {
      ...this.settings(),
      android_vault_status_notification_enabled: checked,
    })
  }

  async setAndroidQuickLockTileEnabled(checked: boolean): Promise<void> {
    const saved = await this.saveSettings('android_quick_lock_tile_enabled', {
      ...this.settings(),
      android_quick_lock_tile_enabled: checked,
    })
    if (saved) await this.refreshAndroidQuickLockTileStatus()
  }

  async setConfirmFileDeletion(checked: boolean): Promise<void> {
    await this.saveSettings('confirm_file_deletion', {
      ...this.settings(),
      confirm_file_deletion: checked,
    })
  }

  async setShowHiddenFiles(checked: boolean): Promise<void> {
    await this.saveSettings('show_hidden_files', {...this.settings(), show_hidden_files: checked})
  }

  async setMarkdownAttachmentFolderPath(rawValue: string): Promise<boolean> {
    const normalized = normalizeMarkdownAttachmentFolderPath(rawValue)
    if (!normalized.ok) {
      getAppContext().store.pushNotification('error', i18n(normalized.errorKey))
      return false
    }

    const settings = this.settings()
    if (settings.markdown_attachment_folder_path === normalized.path) {
      return true
    }

    return await this.saveSettings('markdown_attachment_folder_path', {
      ...settings,
      markdown_attachment_folder_path: normalized.path,
    })
  }

  isIosRuntime(): boolean {
    return runtimeCapabilitiesAtom().platform === 'ios'
  }

  isAndroidRuntime(): boolean {
    return runtimeCapabilitiesAtom().platform === 'android'
  }

  isMacosRuntime(): boolean {
    return runtimeCapabilitiesAtom().platform === 'macos'
  }

  isMobileRuntime(): boolean {
    return runtimeCapabilitiesAtom().mobile
  }

  isMobileBiometricSupported(): boolean {
    const caps = runtimeCapabilitiesAtom()
    return caps.mobile && caps.supports_biometric
  }

  isPreferencePending(key: SettingsPreferenceKey): boolean {
    return this.preferenceSavePending() && this.activePreference() === key
  }

  preferenceErrorFor(key: SettingsPreferenceKey): string {
    return this.failedPreference() === key ? i18n('settings:save-failed') : ''
  }

  autoLockLabel(seconds: number): string {
    switch (seconds) {
      case 0:
        return i18n('settings:never')
      case 60:
        return i18n('settings:1-minute')
      case 300:
        return i18n('settings:5-minutes')
      case 900:
        return i18n('settings:15-minutes')
      case 1800:
        return i18n('settings:30-minutes')
      case 3600:
        return i18n('settings:1-hour')
      default:
        return `${seconds}s`
    }
  }

  supportsCredentialProviderAutofill(): boolean {
    return runtimeCapabilitiesAtom().supports_autofill
  }

  showsMobileAutofillLockConflict(): boolean {
    const caps = runtimeCapabilitiesAtom()
    return caps.mobile && caps.supports_autofill
  }

  credentialProviderAccess(): ModuleAccessState {
    return moduleAccessModel.featureAccess('credential-provider')
  }

  showsMacosOtpCapabilities(): boolean {
    return runtimeCapabilitiesAtom().platform === 'macos'
  }

  macosOneTimeCodeAutofillStatusState(): 'selected' | 'missing' | 'unknown' {
    return macosOtpAutofillStatusState(this.macosOneTimeCodeAutofillStatus())
  }

  macosOneTimeCodeAutofillStatusLabel(): string {
    return macosOtpAutofillStatusLabel(this.macosOneTimeCodeAutofillStatus())
  }

  macosVerificationCodeSetupStatusLabel(): string {
    return macosVerificationCodeSetupStatusLabel(this.macosVerificationCodeSetupStatus())
  }

  showsCredentialProviderSection(): boolean {
    return this.supportsExternalPro() && this.supportsCredentialProviderAutofill()
  }

  isRouteAvailable(route: SettingsRoute): boolean {
    if (route.kind === 'license') return this.supportsExternalPro()
    if (route.kind === 'autofill') return this.showsCredentialProviderSection()
    return true
  }

  resolveAvailableRoute(route: SettingsRoute): SettingsRoute {
    return this.isRouteAvailable(route) ? route : {kind: 'overview'}
  }

  async refreshCredentialProviderStatus(): Promise<void> {
    if (!isTauriRuntime() || !this.showsCredentialProviderSection()) {
      this.credentialProviderSelected.set(null)
      this.credentialProviderNativeStatus.set(null)
      return
    }

    try {
      const res = await wrap(
        tauriInvoke<RpcResult<CredentialProviderNativeStatus>>('credential_provider_status'),
      )
      if (!isOk(res)) {
        throw new Error(res.error || i18n('settings:provider-query-failed'))
      }
      this.credentialProviderSelected.set(
        typeof res.result.selected === 'boolean' ? res.result.selected : null,
      )
      this.credentialProviderNativeStatus.set(res.result)
    } catch (error) {
      console.warn('Failed to query credential provider status', error)
      this.credentialProviderSelected.set(null)
      this.credentialProviderNativeStatus.set(null)
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
        tauriInvoke<RpcResult<AndroidQuickLockTileRequestResult>>('android_request_quick_lock_tile'),
      )
      if (!isOk(res)) {
        throw new Error(res.error || i18n('settings:android-quick-lock-tile-request-failed'))
      }
      if (res.result.requested) {
        getAppContext().store.pushNotification('success', i18n('settings:android-quick-lock-tile-requested'))
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
        error instanceof Error ? error.message : i18n('settings:android-quick-lock-tile-request-failed')
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
      await this.refreshCredentialProviderStatus()
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

  passwordMaintenanceError(): string {
    return passmanagerMaintenanceModel.error()
  }

  async openPasswordImportTask(): Promise<void> {
    const request = ++this.passwordImportTaskRequest
    await wrap(this.openPasswordImport())
    if (
      this.isPasswordImportTaskRequestCurrent(request) &&
      navigationModel.currentSurface() === 'settings' &&
      navigationModel.settingsRoute().kind === 'passwords' &&
      this.passwordImportDialogOpen()
    ) {
      navigationModel.navigateToSettingsRoute({kind: 'password-import'})
    }
  }

  async ensurePasswordImportTaskReady(): Promise<void> {
    if (this.passwordImportDialogOpen() || this.passwordMaintenanceBusyAction() === 'import') return
    const request = ++this.passwordImportTaskRequest
    await wrap(this.openPasswordImport())
    if (
      this.isPasswordImportTaskRequestCurrent(request) &&
      navigationModel.currentSurface() === 'settings' &&
      navigationModel.settingsRoute().kind === 'password-import' &&
      !this.passwordImportDialogOpen()
    ) {
      navigationModel.navigateToSettingsRoute({kind: 'passwords'}, 'replace')
    }
  }

  cancelPasswordImportTaskPreparation(): void {
    this.passwordImportTaskRequest += 1
    passmanagerMaintenanceModel.cancelSettingsImportDialogPreparation()
  }

  cancelPasswordImportTaskForRouteChange(
    previous: SettingsRoute['kind'] | null,
    current: SettingsRoute['kind'],
  ): void {
    if (previous === null || previous === current) return
    if (previous === 'password-import') {
      this.closePasswordImportDialog()
      return
    }
    this.cancelPasswordImportTaskPreparation()
  }

  closePasswordImportTask(): void {
    this.closePasswordImportDialog()
    navigationModel.navigateToSettingsRoute({kind: 'passwords'}, 'replace')
  }

  openVaultRekeyTask(): void {
    if (!this.vaultRekey.busy()) this.vaultRekey.reset()
    navigationModel.navigateToSettingsRoute({kind: 'vault-rekey'})
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
    this.passwordImportTaskRequest += 1
    passmanagerMaintenanceModel.closeSettingsImportDialog()
  }

  private isPasswordImportTaskRequestCurrent(request: number): boolean {
    return request === this.passwordImportTaskRequest && tryGetAppContext() !== null
  }

  private async saveSettings(key: SettingsPreferenceKey, settings: SessionSettings): Promise<boolean> {
    try {
      await this.persistPreference({key, settings})
      return true
    } catch {
      return false
    }
  }
}

export const settingsPageModel = new SettingsPageModel()
