import {atom} from '@reatom/core'

export type RuntimeCapabilities = {
  platform: string
  desktop: boolean
  mobile: boolean
  supports_native_path_io: boolean
  supports_open_external: boolean
  supports_native_share: boolean
  supports_volume: boolean
  supports_gateway: boolean
  supports_usb_remote: boolean
  supports_network_remote: boolean
  supports_biometric: boolean
  supports_autofill: boolean
  supports_media_stream_protocol: boolean
  supports_native_audio_playback: boolean
  supports_native_video_playback: boolean
  supports_native_file_upload: boolean
  supports_share_import: boolean
  supports_native_otp_qr_scan: boolean
  supports_mobile_backup_restore: boolean
  supports_photo_library_save: boolean
  supports_credential_provider_passkeys_lite: boolean
  supports_android_native_video: boolean
  android_native_audio_playback_rollout_enabled: boolean
  supports_android_native_upload: boolean
  supports_android_share_import: boolean
  supports_android_native_otp_qr_scan: boolean
  supports_storage_root_selection: boolean
  supports_android_saf_backup_restore: boolean
}

export const RUNTIME_CAPABILITY_KEYS = [
  'supports_native_path_io',
  'supports_open_external',
  'supports_native_share',
  'supports_volume',
  'supports_gateway',
  'supports_usb_remote',
  'supports_network_remote',
  'supports_biometric',
  'supports_autofill',
  'supports_media_stream_protocol',
  'supports_native_audio_playback',
  'supports_native_video_playback',
  'supports_native_file_upload',
  'supports_share_import',
  'supports_native_otp_qr_scan',
  'supports_mobile_backup_restore',
  'supports_photo_library_save',
  'supports_credential_provider_passkeys_lite',
  'supports_android_native_video',
  'android_native_audio_playback_rollout_enabled',
  'supports_android_native_upload',
  'supports_android_share_import',
  'supports_android_native_otp_qr_scan',
  'supports_storage_root_selection',
  'supports_android_saf_backup_restore',
] as const satisfies readonly (keyof Omit<RuntimeCapabilities, 'platform' | 'desktop' | 'mobile'>)[]

export type RuntimeCapabilityKey = (typeof RUNTIME_CAPABILITY_KEYS)[number]

const FALLBACK_CAPABILITIES: RuntimeCapabilities = {
  platform: 'web',
  desktop: false,
  mobile: false,
  supports_native_path_io: false,
  supports_open_external: false,
  supports_native_share: false,
  supports_volume: false,
  supports_gateway: false,
  supports_usb_remote: false,
  supports_network_remote: true,
  supports_biometric: false,
  supports_autofill: false,
  supports_media_stream_protocol: false,
  supports_native_audio_playback: false,
  supports_native_video_playback: false,
  supports_native_file_upload: false,
  supports_share_import: false,
  supports_native_otp_qr_scan: false,
  supports_mobile_backup_restore: false,
  supports_photo_library_save: false,
  supports_credential_provider_passkeys_lite: false,
  supports_android_native_video: false,
  android_native_audio_playback_rollout_enabled: false,
  supports_android_native_upload: false,
  supports_android_share_import: false,
  supports_android_native_otp_qr_scan: false,
  supports_storage_root_selection: false,
  supports_android_saf_backup_restore: false,
}

let currentCapabilities: RuntimeCapabilities = {...FALLBACK_CAPABILITIES}

export const runtimeCapabilitiesAtom = atom<RuntimeCapabilities>(
  currentCapabilities,
  'runtime.capabilities',
)

export function getRuntimeCapabilities(): RuntimeCapabilities {
  return currentCapabilities
}

export function setRuntimeCapabilities(
  next: Partial<RuntimeCapabilities> | null | undefined,
): RuntimeCapabilities {
  if (!next || typeof next !== 'object') {
    currentCapabilities = {...FALLBACK_CAPABILITIES}
    runtimeCapabilitiesAtom.set(currentCapabilities)
    return currentCapabilities
  }

  currentCapabilities = {
    ...FALLBACK_CAPABILITIES,
    ...next,
  }
  runtimeCapabilitiesAtom.set(currentCapabilities)
  return currentCapabilities
}

export function isCapabilityEnabled(
  capability: RuntimeCapabilityKey,
): boolean {
  return Boolean(currentCapabilities[capability])
}

export function resetRuntimeCapabilities(): void {
  currentCapabilities = {...FALLBACK_CAPABILITIES}
  runtimeCapabilitiesAtom.set(currentCapabilities)
}
