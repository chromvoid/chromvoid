import {beforeEach, describe, expect, it} from 'vitest'

import {
  getRuntimeCapabilities,
  resetRuntimeCapabilities,
  setRuntimeCapabilities,
} from '../../src/core/runtime/runtime-capabilities'
import {runtimeModeModel} from '../../src/core/runtime/runtime-mode.model'

describe('runtime media stream gate', () => {
  beforeEach(() => {
    resetRuntimeCapabilities()
    runtimeModeModel.handleTransportDisconnect()
  })

  it('is disabled by default', () => {
    expect(runtimeModeModel.supportsMediaStreamProtocol()).toBe(false)
    expect(runtimeModeModel.canUseNativeMediaStream({transportKind: 'tauri'})).toBe(false)
    expect(runtimeModeModel.supportsNativeAudioPlayback()).toBe(false)
    expect(runtimeModeModel.supportsNativeVideoPlayback()).toBe(false)
    expect(runtimeModeModel.canUseNativeAudioPlayback({transportKind: 'tauri'})).toBe(false)
    expect(runtimeModeModel.canUseNativeVideoPlayback({transportKind: 'tauri'})).toBe(false)
    expect(runtimeModeModel.androidNativeAudioRolloutEnabled()).toBe(false)
    expect(runtimeModeModel.canUseAndroidNativeAudio({transportKind: 'tauri'})).toBe(false)
    expect(getRuntimeCapabilities().supports_android_share_import).toBe(false)
  })

  it('keeps Android share import capability fail-closed in fallback runtime state', () => {
    expect(getRuntimeCapabilities().supports_android_share_import).toBe(false)

    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_android_share_import: true,
    })

    expect(getRuntimeCapabilities().supports_android_share_import).toBe(true)

    resetRuntimeCapabilities()

    expect(getRuntimeCapabilities().supports_android_share_import).toBe(false)
  })

  it('allows native media streams only for local Tauri sessions with capability enabled', () => {
    setRuntimeCapabilities({supports_media_stream_protocol: true})
    runtimeModeModel.setCoreMode('local')

    expect(runtimeModeModel.canUseNativeMediaStream({transportKind: 'tauri'})).toBe(true)
    expect(runtimeModeModel.canUseNativeMediaStream({transportKind: 'ws'})).toBe(false)

    runtimeModeModel.setCoreMode({remote: {host: {type: 'tauri_remote_wss', peer_id: 'peer-1'}}})
    expect(runtimeModeModel.canUseNativeMediaStream({transportKind: 'tauri'})).toBe(false)

    runtimeModeModel.setCoreMode('switching')
    expect(runtimeModeModel.canUseNativeMediaStream({transportKind: 'tauri'})).toBe(false)
  })

  it('tracks remote media inspection split capability from mode changes', () => {
    runtimeModeModel.handleModeChanged({
      current_mode: {remote: {host: {type: 'tauri_remote_wss', peer_id: 'peer-1'}}},
      remote_core_features: ['remote_media_inspection_split_v1'],
    })

    expect(runtimeModeModel.remoteCoreMode()).toBe(true)
    expect(runtimeModeModel.remoteMediaInspectionSplitAvailable()).toBe(true)
    expect(runtimeModeModel.remoteMediaInspectionVisibleAllowed()).toBe(true)

    runtimeModeModel.handleModeChanged({
      current_mode: {remote: {host: {type: 'tauri_remote_wss', peer_id: 'peer-2'}}},
    })

    expect(runtimeModeModel.remoteMediaInspectionSplitAvailable()).toBe(false)
    expect(runtimeModeModel.remoteMediaInspectionVisibleAllowed()).toBe(false)
  })

  it('clears remote media inspection features outside remote mode', () => {
    runtimeModeModel.setCoreMode(
      {remote: {host: {type: 'tauri_remote_wss', peer_id: 'peer-1'}}},
      ['remote_media_inspection_split_v1'],
    )

    runtimeModeModel.setCoreMode('local')

    expect(runtimeModeModel.remoteCoreFeatures()).toEqual([])
    expect(runtimeModeModel.remoteMediaInspectionSplitAvailable()).toBe(false)
    expect(runtimeModeModel.remoteMediaInspectionVisibleAllowed()).toBe(true)
  })

  it('can disable native streams for the current runtime session', () => {
    setRuntimeCapabilities({supports_media_stream_protocol: true})
    runtimeModeModel.setCoreMode('local')

    runtimeModeModel.disableNativeMediaStreamForRuntimeSession()
    expect(runtimeModeModel.canUseNativeMediaStream({transportKind: 'tauri'})).toBe(false)

    runtimeModeModel.resetNativeMediaStreamForRuntimeSession()
    expect(runtimeModeModel.canUseNativeMediaStream({transportKind: 'tauri'})).toBe(true)
  })

  it('resets session disable state on transport disconnect', () => {
    setRuntimeCapabilities({supports_media_stream_protocol: true})
    runtimeModeModel.setCoreMode('local')
    runtimeModeModel.disableNativeMediaStreamForRuntimeSession()

    runtimeModeModel.handleTransportDisconnect()

    expect(runtimeModeModel.coreMode()).toBe('local')
    expect(runtimeModeModel.canUseNativeMediaStream({transportKind: 'tauri'})).toBe(true)
  })

  it('allows Android native video only for local Tauri sessions with capability enabled', () => {
    setRuntimeCapabilities({supports_android_native_video: true})
    runtimeModeModel.setCoreMode('local')

    expect(runtimeModeModel.canUseAndroidNativeVideo({transportKind: 'tauri'})).toBe(true)
    expect(runtimeModeModel.canUseAndroidNativeVideo({transportKind: 'ws'})).toBe(false)

    runtimeModeModel.setCoreMode({remote: {host: {type: 'tauri_remote_wss', peer_id: 'peer-1'}}})
    expect(runtimeModeModel.canUseAndroidNativeVideo({transportKind: 'tauri'})).toBe(false)

    runtimeModeModel.setCoreMode('switching')
    expect(runtimeModeModel.canUseAndroidNativeVideo({transportKind: 'tauri'})).toBe(false)
  })

  it('allows neutral native video playback only for local Tauri sessions with capability enabled', () => {
    setRuntimeCapabilities({supports_native_video_playback: true})
    runtimeModeModel.setCoreMode('local')

    expect(runtimeModeModel.canUseNativeVideoPlayback({transportKind: 'tauri'})).toBe(true)
    expect(runtimeModeModel.canUseNativeVideoPlayback({transportKind: 'ws'})).toBe(false)

    runtimeModeModel.setCoreMode({remote: {host: {type: 'tauri_remote_wss', peer_id: 'peer-1'}}})
    expect(runtimeModeModel.canUseNativeVideoPlayback({transportKind: 'tauri'})).toBe(false)

    runtimeModeModel.setCoreMode('switching')
    expect(runtimeModeModel.canUseNativeVideoPlayback({transportKind: 'tauri'})).toBe(false)
  })

  it('can disable Android native video for the current runtime session', () => {
    setRuntimeCapabilities({supports_android_native_video: true})
    runtimeModeModel.setCoreMode('local')

    runtimeModeModel.disableAndroidNativeVideoForRuntimeSession()
    expect(runtimeModeModel.canUseAndroidNativeVideo({transportKind: 'tauri'})).toBe(false)

    runtimeModeModel.resetAndroidNativeVideoForRuntimeSession()
    expect(runtimeModeModel.canUseAndroidNativeVideo({transportKind: 'tauri'})).toBe(true)
  })

  it('allows Android native audio only for local Android Tauri sessions with rollout enabled', () => {
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      android_native_audio_playback_rollout_enabled: true,
    })
    runtimeModeModel.setCoreMode('local')

    expect(runtimeModeModel.canUseAndroidNativeAudio({transportKind: 'tauri'})).toBe(true)
    expect(runtimeModeModel.canUseAndroidNativeAudio({transportKind: 'ws'})).toBe(false)

    runtimeModeModel.setCoreMode({remote: {host: {type: 'tauri_remote_wss', peer_id: 'peer-1'}}})
    expect(runtimeModeModel.canUseAndroidNativeAudio({transportKind: 'tauri'})).toBe(false)

    runtimeModeModel.setCoreMode('switching')
    expect(runtimeModeModel.canUseAndroidNativeAudio({transportKind: 'tauri'})).toBe(false)
  })

  it('allows neutral native audio playback only for local Tauri sessions with capability enabled', () => {
    setRuntimeCapabilities({supports_native_audio_playback: true})
    runtimeModeModel.setCoreMode('local')

    expect(runtimeModeModel.canUseNativeAudioPlayback({transportKind: 'tauri'})).toBe(true)
    expect(runtimeModeModel.canUseNativeAudioPlayback({transportKind: 'ws'})).toBe(false)

    runtimeModeModel.setCoreMode({remote: {host: {type: 'tauri_remote_wss', peer_id: 'peer-1'}}})
    expect(runtimeModeModel.canUseNativeAudioPlayback({transportKind: 'tauri'})).toBe(false)

    runtimeModeModel.setCoreMode('switching')
    expect(runtimeModeModel.canUseNativeAudioPlayback({transportKind: 'tauri'})).toBe(false)
  })

  it('uses the neutral native audio disable state for the current runtime session', () => {
    setRuntimeCapabilities({supports_native_audio_playback: true})
    runtimeModeModel.setCoreMode('local')

    runtimeModeModel.disableAndroidNativeAudioForRuntimeSession()
    expect(runtimeModeModel.canUseNativeAudioPlayback({transportKind: 'tauri'})).toBe(false)

    runtimeModeModel.resetAndroidNativeAudioForRuntimeSession()
    expect(runtimeModeModel.canUseNativeAudioPlayback({transportKind: 'tauri'})).toBe(true)
  })

  it('fails Android native audio closed when platform or rollout requirements are missing', () => {
    runtimeModeModel.setCoreMode('local')

    setRuntimeCapabilities({
      platform: 'web',
      mobile: false,
      android_native_audio_playback_rollout_enabled: true,
    })
    expect(runtimeModeModel.canUseAndroidNativeAudio({transportKind: 'tauri'})).toBe(false)

    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      android_native_audio_playback_rollout_enabled: false,
    })
    expect(runtimeModeModel.canUseAndroidNativeAudio({transportKind: 'tauri'})).toBe(false)
  })

  it('can disable Android native audio for the current runtime session', () => {
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      android_native_audio_playback_rollout_enabled: true,
    })
    runtimeModeModel.setCoreMode('local')

    runtimeModeModel.disableAndroidNativeAudioForRuntimeSession()
    expect(runtimeModeModel.canUseAndroidNativeAudio({transportKind: 'tauri'})).toBe(false)

    runtimeModeModel.resetAndroidNativeAudioForRuntimeSession()
    expect(runtimeModeModel.canUseAndroidNativeAudio({transportKind: 'tauri'})).toBe(true)
  })

  it('resets Android native audio disable state on transport disconnect', () => {
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      android_native_audio_playback_rollout_enabled: true,
    })
    runtimeModeModel.setCoreMode('local')
    runtimeModeModel.disableAndroidNativeAudioForRuntimeSession()

    runtimeModeModel.handleTransportDisconnect()

    expect(runtimeModeModel.coreMode()).toBe('local')
    expect(runtimeModeModel.canUseAndroidNativeAudio({transportKind: 'tauri'})).toBe(true)
  })

  it('fails closed for malformed mode events', () => {
    setRuntimeCapabilities({supports_media_stream_protocol: true})
    runtimeModeModel.handleModeChanged({current_mode: {unknown: true}})

    expect(runtimeModeModel.coreMode()).toBe('switching')
    expect(runtimeModeModel.canUseNativeMediaStream({transportKind: 'tauri'})).toBe(false)
  })
})
