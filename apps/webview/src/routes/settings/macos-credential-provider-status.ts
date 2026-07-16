import type {ModuleAccessState} from 'root/core/pro/module-access.model'
import {i18n} from 'root/i18n'

export type MacosOneTimeCodeAutofillStatus =
  | 'unsupported_os'
  | 'locked_pro'
  | 'vault_required'
  | 'provider_disabled'
  | 'extension_not_enabled'
  | 'ready'
  | 'unverified'

export type CredentialProviderNativeStatus = {
  platform?: 'android' | 'ios' | 'macos' | string
  selected: boolean | null
  available?: boolean
  passkeysLiteAvailable?: boolean
  passkeysLiteReason?: string | null
  settingsAction?: 'open_system_autofill' | 'open_app_settings' | 'show_instructions' | string
  capabilities?: {
    oneTimeCodeAutofill?: {
      status?: MacosOneTimeCodeAutofillStatus
      platformVersionMajor?: number
      apiAvailable?: boolean
      rolloutEnabled?: boolean
      bridgeAvailable?: boolean
    }
    verificationCodeSetupHandler?: {
      status?: 'available' | 'unverified'
      scheme?: string
      defaultSelection?: 'unverified'
    }
  }
}

type MacosOtpStatusInput = {
  platform: string
  nativeStatus: CredentialProviderNativeStatus | null
  selected: boolean | null
  localCoreMode: boolean
  accessStatus: ModuleAccessState['status']
  vaultOpen: boolean
}

export function resolveMacosOtpAutofillStatus({
  platform,
  nativeStatus,
  selected,
  localCoreMode,
  accessStatus,
  vaultOpen,
}: MacosOtpStatusInput): MacosOneTimeCodeAutofillStatus {
  const capability = nativeStatus?.capabilities?.oneTimeCodeAutofill
  if (platform !== 'macos' || !capability) return 'unverified'
  if (capability.status === 'unsupported_os' || capability.apiAvailable === false) {
    return 'unsupported_os'
  }
  if (capability.status === 'provider_disabled' || capability.rolloutEnabled === false) {
    return 'provider_disabled'
  }
  if (selected === false) return 'extension_not_enabled'
  if (selected === null || !localCoreMode) return 'unverified'
  if (accessStatus === 'locked_pro') return 'locked_pro'
  if (accessStatus === 'disabled_by_rollout') return 'provider_disabled'
  if (accessStatus !== 'enabled') return 'unverified'
  if (!vaultOpen) return 'vault_required'
  return capability.bridgeAvailable === true ? 'ready' : 'unverified'
}

export function macosOtpAutofillStatusState(
  status: MacosOneTimeCodeAutofillStatus,
): 'selected' | 'missing' | 'unknown' {
  if (status === 'ready') return 'selected'
  if (
    status === 'locked_pro' ||
    status === 'vault_required' ||
    status === 'provider_disabled' ||
    status === 'extension_not_enabled'
  ) {
    return 'missing'
  }
  return 'unknown'
}

export function macosOtpAutofillStatusLabel(status: MacosOneTimeCodeAutofillStatus): string {
  switch (status) {
    case 'ready':
      return i18n('settings:provider-otp-ready')
    case 'unsupported_os':
      return i18n('settings:provider-otp-unsupported-os')
    case 'locked_pro':
      return i18n('settings:provider-otp-locked-pro')
    case 'vault_required':
      return i18n('settings:provider-otp-vault-required')
    case 'provider_disabled':
      return i18n('settings:provider-otp-disabled')
    case 'extension_not_enabled':
      return i18n('settings:provider-otp-extension-disabled')
    default:
      return i18n('settings:provider-otp-unverified')
  }
}

export function macosVerificationCodeSetupStatusLabel(status: 'available' | 'unverified'): string {
  return status === 'available'
    ? i18n('settings:provider-setup-available')
    : i18n('settings:provider-setup-unverified')
}
