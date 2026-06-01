import {describe, expect, it} from 'vitest'

import {SURFACE_IDS} from '../../src/app/navigation/navigation.types'
import {ROUTE_IDS} from '../../src/app/router/router'
import {
  GUIDANCE_ANCHOR_REGISTER_EVENT,
  GUIDANCE_ANCHOR_UNREGISTER_EVENT,
  GUIDANCE_PRESENTATION_IDS,
  GUIDANCE_SURFACE_IDS,
  GUIDANCE_TRIGGER_IDS,
} from '../../src/core/guidance/guidance.constants'
import {
  MODULE_ACCESS_STATUSES,
  PRO_FEATURE_KEYS,
} from '../../src/core/pro/module-access.model'
import {RUNTIME_CAPABILITY_KEYS} from '../../src/core/runtime/runtime-capabilities'

describe('guidance runtime contracts', () => {
  it('exports dashboard surfaces as runtime data without adding welcome', () => {
    expect(SURFACE_IDS).toEqual([
      'files',
      'notes',
      'passwords',
      'passkeys',
      'settings',
      'remote',
      'gateway',
      'remote-storage',
    ])
    expect(SURFACE_IDS).not.toContain('welcome')
    expect(GUIDANCE_SURFACE_IDS).toEqual([...SURFACE_IDS, 'welcome'])
  })

  it('exports app routes as runtime validation data', () => {
    expect(ROUTE_IDS).toEqual([
      'loading',
      'welcome',
      'no-license',
      'dashboard',
      'task-progress',
      'no-connection',
    ])
  })

  it('exports runtime capability keys used by guidance validation', () => {
    expect(RUNTIME_CAPABILITY_KEYS).toEqual([
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
    ])
  })

  it('exports Pro feature and module access status keys used by guidance validation', () => {
    expect(PRO_FEATURE_KEYS).toEqual([
      'remote',
      'credential-provider',
      'ssh-agent',
      'crypto-wallet',
      'emergency-access',
      'browser-extension',
      'mounted-vault',
    ])
    expect(MODULE_ACCESS_STATUSES).toEqual([
      'unsupported',
      'disabled_by_rollout',
      'entitlement_unavailable',
      'locked_pro',
      'enabled',
    ])
  })

  it('exports guidance enums and event names', () => {
    expect(GUIDANCE_TRIGGER_IDS).toEqual([
      'first_run',
      'empty_state',
      'blocked_action',
      'feature_discovery',
      'manual_help',
    ])
    expect(GUIDANCE_PRESENTATION_IDS).toEqual([
      'tooltip',
      'popover',
      'bottom_sheet',
      'inline_hint',
    ])
    expect(GUIDANCE_ANCHOR_REGISTER_EVENT).toBe('guidance-anchor-register')
    expect(GUIDANCE_ANCHOR_UNREGISTER_EVENT).toBe('guidance-anchor-unregister')
  })
})
