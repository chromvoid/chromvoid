import {beforeEach, describe, expect, it, vi} from 'vitest'

import {VolumeMountModel} from '../../src/routes/volume/volume-mount.model'
import {
  getRuntimeCapabilities,
  isCapabilityEnabled,
  resetRuntimeCapabilities,
  setRuntimeCapabilities,
} from '../../src/core/runtime/runtime-capabilities'

const tauriInvoke = vi.fn()

vi.mock('root/core/transport/tauri/ipc', () => {
  return {
    tauriInvoke: (...args: unknown[]) => tauriInvoke(...args),
  }
})

describe('Mobile Capability Gating', () => {
  beforeEach(() => {
    tauriInvoke.mockReset()
    resetRuntimeCapabilities()
  })

  it('prevents volume IPC calls on mobile runtime without volume capability', async () => {
    setRuntimeCapabilities({
      mobile: true,
      supports_volume: false,
    })

    const model = new VolumeMountModel()
    await model.mount()

    expect(tauriInvoke).not.toHaveBeenCalled()
    expect(model.status().state).toBe('error')
    expect(model.status().error).toContain('Volume is not available on this platform')
  })

  it('keeps iOS native parity capabilities fail-closed until native bridges enable them', () => {
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
    })

    const caps = getRuntimeCapabilities()
    expect(caps.supports_android_native_upload).toBe(false)
    expect(caps.supports_android_share_import).toBe(false)
    expect(caps.supports_android_native_otp_qr_scan).toBe(false)
    expect(caps.supports_android_saf_backup_restore).toBe(false)
    expect(caps.supports_android_native_video).toBe(false)
    expect(caps.android_native_audio_playback_rollout_enabled).toBe(false)
    expect(caps.supports_native_file_upload).toBe(false)
    expect(caps.supports_share_import).toBe(false)
    expect(caps.supports_native_otp_qr_scan).toBe(false)
    expect(caps.supports_mobile_backup_restore).toBe(false)
    expect(caps.supports_photo_library_save).toBe(false)
    expect(caps.supports_native_audio_playback).toBe(false)
    expect(caps.supports_native_video_playback).toBe(false)
    expect(caps.supports_credential_provider_passkeys_lite).toBe(false)
    expect(isCapabilityEnabled('supports_android_native_upload')).toBe(false)
    expect(isCapabilityEnabled('supports_android_share_import')).toBe(false)
    expect(isCapabilityEnabled('supports_native_file_upload')).toBe(false)
    expect(isCapabilityEnabled('supports_share_import')).toBe(false)
  })
})
