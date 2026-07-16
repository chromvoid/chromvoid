import {beforeEach, describe, expect, it} from 'vitest'

import {
  getRuntimeCapabilities,
  resetRuntimeCapabilities,
  setRuntimeCapabilities,
} from '../../src/core/runtime/runtime-capabilities'
import {
  resetRuntimeMediaProbeState,
  setRuntimeMediaProbeState,
} from '../../src/core/runtime/runtime-media-probes'
import {runtimeModeModel} from '../../src/core/runtime/runtime-mode.model'

describe('runtime media stream gate', () => {
  beforeEach(() => {
    resetRuntimeCapabilities()
    resetRuntimeMediaProbeState()
    runtimeModeModel.handleTransportDisconnect()
  })

  it('is disabled by default', () => {
    expect(runtimeModeModel.supportsMediaStreamProtocol()).toBe(false)
    expect(runtimeModeModel.supportsMediaHttpStream()).toBe(false)
    expect(runtimeModeModel.supportsMseVideoPlayback()).toBe(false)
    expect(runtimeModeModel.canUseNativeMediaStream({transportKind: 'tauri'})).toBe(false)
    expect(runtimeModeModel.canUseHttpVideoSource({transportKind: 'tauri'})).toBe(false)
    expect(runtimeModeModel.canUseMseVideoPlayback({transportKind: 'tauri'})).toBe(false)
    expect(runtimeModeModel.supportsNativeAudioPlayback()).toBe(false)
    expect(runtimeModeModel.supportsNativeVideoPlayback()).toBe(false)
    expect(runtimeModeModel.canUseDesktopNativeVideoSource({transportKind: 'tauri'})).toBe(false)
    expect(runtimeModeModel.canUseMobileNativeVideoSource({transportKind: 'tauri'})).toBe(false)
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

  it('allows native media streams for local and remote Tauri sessions with capability enabled', () => {
    setRuntimeCapabilities({supports_media_stream_protocol: true})
    runtimeModeModel.setCoreMode('local')

    expect(runtimeModeModel.canUseNativeMediaStream({transportKind: 'tauri'})).toBe(true)
    expect(runtimeModeModel.canUseNativeMediaStream({transportKind: 'ws'})).toBe(false)

    runtimeModeModel.setCoreMode({remote: {host: {type: 'tauri_remote_wss', peer_id: 'peer-1'}}})
    expect(runtimeModeModel.canUseNativeMediaStream({transportKind: 'tauri'})).toBe(true)
    expect(runtimeModeModel.canUseNativeMediaStream({transportKind: 'ws'})).toBe(false)

    runtimeModeModel.setCoreMode('switching')
    expect(runtimeModeModel.canUseNativeMediaStream({transportKind: 'tauri'})).toBe(false)
  })

  it('allows Tauri media stream source requests until the WebView protocol fails in this session', () => {
    runtimeModeModel.setCoreMode('local')

    expect(runtimeModeModel.canUseNativeMediaStream({transportKind: 'tauri'})).toBe(false)
    expect(runtimeModeModel.canUseMediaStreamSource({transportKind: 'tauri'})).toBe(true)
    expect(runtimeModeModel.canUseMediaStreamSource({transportKind: 'ws'})).toBe(false)

    runtimeModeModel.disableNativeMediaStreamForRuntimeSession()
    expect(runtimeModeModel.canUseMediaStreamSource({transportKind: 'tauri'})).toBe(false)
  })

  it('gates prepared desktop video sources by confirmed loopback HTTP capability', () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_media_stream_protocol: true,
    })
    runtimeModeModel.setCoreMode('local')

    expect(runtimeModeModel.canUseNativeMediaStream({transportKind: 'tauri'})).toBe(true)
    expect(runtimeModeModel.canUseMediaStreamSource({transportKind: 'tauri'})).toBe(true)
    expect(runtimeModeModel.canUseHttpVideoSource({transportKind: 'tauri'})).toBe(false)

    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_media_stream_protocol: true,
      supports_media_http_stream: true,
    })

    expect(runtimeModeModel.canUseHttpVideoSource({transportKind: 'tauri'})).toBe(true)
    expect(runtimeModeModel.canUseHttpVideoSource({transportKind: 'ws'})).toBe(false)

    runtimeModeModel.setCoreMode('switching')
    expect(runtimeModeModel.canUseHttpVideoSource({transportKind: 'tauri'})).toBe(false)
  })

  it('requires desktop HTTP capability before MSE can be considered available', () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_mse_video_playback: true,
    })
    runtimeModeModel.setCoreMode('local')

    expect(runtimeModeModel.canUseMseVideoPlayback({transportKind: 'tauri'})).toBe(false)

    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_media_http_stream: true,
      supports_mse_video_playback: true,
    })

    expect(runtimeModeModel.canUseMseVideoPlayback({transportKind: 'tauri'})).toBe(true)
  })

  it('blocks desktop HTTP and MSE video sources when loopback probes fail', () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_media_http_stream: true,
      supports_mse_video_playback: true,
    })
    runtimeModeModel.setCoreMode('local')

    expect(runtimeModeModel.canUseHttpVideoSource({transportKind: 'tauri'})).toBe(true)
    expect(runtimeModeModel.canUseMseVideoPlayback({transportKind: 'tauri'})).toBe(true)

    setRuntimeMediaProbeState({loopbackHttp: 'unsupported'})

    expect(runtimeModeModel.canUseHttpVideoSource({transportKind: 'tauri'})).toBe(false)
    expect(runtimeModeModel.canUseMseVideoPlayback({transportKind: 'tauri'})).toBe(false)

    setRuntimeMediaProbeState({loopbackHttp: 'supported', connectSrc: 'unsupported'})

    expect(runtimeModeModel.canUseHttpVideoSource({transportKind: 'tauri'})).toBe(false)

    setRuntimeMediaProbeState({connectSrc: 'supported', mseController: 'unsupported'})

    expect(runtimeModeModel.canUseHttpVideoSource({transportKind: 'tauri'})).toBe(true)
    expect(runtimeModeModel.canUseMseVideoPlayback({transportKind: 'tauri'})).toBe(false)
  })

  it('blocks Android native video when the native bridge probe fails', () => {
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_native_video_playback: true,
      supports_mobile_native_video_playback: true,
      supports_android_native_video: true,
    })
    runtimeModeModel.setCoreMode('local')

    expect(runtimeModeModel.canUseMobileNativeVideoSource({transportKind: 'tauri'})).toBe(true)
    expect(runtimeModeModel.canUseAndroidNativeVideo({transportKind: 'tauri'})).toBe(true)

    setRuntimeMediaProbeState({mobileNativeVideo: 'unsupported'})

    expect(runtimeModeModel.canUseMobileNativeVideoSource({transportKind: 'tauri'})).toBe(false)
    expect(runtimeModeModel.canUseAndroidNativeVideo({transportKind: 'tauri'})).toBe(false)
    expect(runtimeModeModel.canUseNativeVideoPlayback({transportKind: 'tauri'})).toBe(false)
  })

  it('tracks remote media inspection split capability from mode changes', () => {
    runtimeModeModel.handleModeChanged({
      current_mode: {remote: {host: {type: 'tauri_remote_wss', peer_id: 'peer-1'}}},
      remote_core_features: ['remote_media_inspection_split_v1'],
      transport_session_generation: 11,
    })

    expect(runtimeModeModel.remoteCoreMode()).toBe(true)
    expect(runtimeModeModel.transportSessionGeneration()).toBe(11)
    expect(runtimeModeModel.remoteMediaInspectionSplitAvailable()).toBe(true)
    expect(runtimeModeModel.remoteMediaInspectionVisibleAllowed()).toBe(true)

    runtimeModeModel.handleModeChanged({
      current_mode: {remote: {host: {type: 'tauri_remote_wss', peer_id: 'peer-2'}}},
    })

    expect(runtimeModeModel.remoteMediaInspectionSplitAvailable()).toBe(false)
    expect(runtimeModeModel.transportSessionGeneration()).toBe(null)
    expect(runtimeModeModel.remoteMediaInspectionVisibleAllowed()).toBe(false)
  })

  it('clears remote media inspection features outside remote mode', () => {
    runtimeModeModel.setCoreMode(
      {remote: {host: {type: 'tauri_remote_wss', peer_id: 'peer-1'}}},
      ['remote_media_inspection_split_v1'],
    )

    runtimeModeModel.setCoreMode('local')

    expect(runtimeModeModel.remoteCoreFeatures()).toEqual([])
    expect(runtimeModeModel.transportSessionGeneration()).toBe(null)
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

  it('allows Android native video for local and remote Tauri sessions with capability enabled', () => {
    setRuntimeCapabilities({supports_android_native_video: true})
    runtimeModeModel.setCoreMode('local')

    expect(runtimeModeModel.canUseAndroidNativeVideo({transportKind: 'tauri'})).toBe(true)
    expect(runtimeModeModel.canUseAndroidNativeVideo({transportKind: 'ws'})).toBe(false)

    runtimeModeModel.setCoreMode({remote: {host: {type: 'tauri_remote_wss', peer_id: 'peer-1'}}})
    expect(runtimeModeModel.canUseAndroidNativeVideo({transportKind: 'tauri'})).toBe(true)

    runtimeModeModel.setCoreMode('switching')
    expect(runtimeModeModel.canUseAndroidNativeVideo({transportKind: 'tauri'})).toBe(false)
  })

  it('allows neutral native video playback for local and remote Tauri sessions with capability enabled', () => {
    setRuntimeCapabilities({supports_native_video_playback: true})
    runtimeModeModel.setCoreMode('local')

    expect(runtimeModeModel.canUseNativeVideoPlayback({transportKind: 'tauri'})).toBe(true)
    expect(runtimeModeModel.canUseNativeVideoPlayback({transportKind: 'ws'})).toBe(false)

    runtimeModeModel.setCoreMode({remote: {host: {type: 'tauri_remote_wss', peer_id: 'peer-1'}}})
    expect(runtimeModeModel.canUseNativeVideoPlayback({transportKind: 'tauri'})).toBe(true)

    runtimeModeModel.setCoreMode('switching')
    expect(runtimeModeModel.canUseNativeVideoPlayback({transportKind: 'tauri'})).toBe(false)
  })

  it('requires platform-specific caps for prepared native video sources', () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_native_video_playback: true,
    })
    runtimeModeModel.setCoreMode('local')

    expect(runtimeModeModel.canUseNativeVideoPlayback({transportKind: 'tauri'})).toBe(true)
    expect(runtimeModeModel.canUseDesktopNativeVideoSource({transportKind: 'tauri'})).toBe(false)

    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_native_video_playback: true,
      supports_desktop_native_video_playback: true,
    })

    expect(runtimeModeModel.canUseDesktopNativeVideoSource({transportKind: 'tauri'})).toBe(true)

    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_native_video_playback: true,
    })

    expect(runtimeModeModel.canUseNativeVideoPlayback({transportKind: 'tauri'})).toBe(true)
    expect(runtimeModeModel.canUseMobileNativeVideoSource({transportKind: 'tauri'})).toBe(false)

    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_native_video_playback: true,
      supports_mobile_native_video_playback: true,
    })

    expect(runtimeModeModel.canUseMobileNativeVideoSource({transportKind: 'tauri'})).toBe(true)
  })

  it('can disable Android native video for the current runtime session', () => {
    setRuntimeCapabilities({supports_android_native_video: true})
    runtimeModeModel.setCoreMode('local')

    runtimeModeModel.disableAndroidNativeVideoForRuntimeSession()
    expect(runtimeModeModel.canUseAndroidNativeVideo({transportKind: 'tauri'})).toBe(false)

    runtimeModeModel.resetAndroidNativeVideoForRuntimeSession()
    expect(runtimeModeModel.canUseAndroidNativeVideo({transportKind: 'tauri'})).toBe(true)
  })

  it('allows Android native audio for local and remote Android Tauri sessions with rollout enabled', () => {
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      android_native_audio_playback_rollout_enabled: true,
    })
    runtimeModeModel.setCoreMode('local')

    expect(runtimeModeModel.canUseAndroidNativeAudio({transportKind: 'tauri'})).toBe(true)
    expect(runtimeModeModel.canUseAndroidNativeAudio({transportKind: 'ws'})).toBe(false)

    runtimeModeModel.setCoreMode({remote: {host: {type: 'tauri_remote_wss', peer_id: 'peer-1'}}})
    expect(runtimeModeModel.canUseAndroidNativeAudio({transportKind: 'tauri'})).toBe(true)

    runtimeModeModel.setCoreMode('switching')
    expect(runtimeModeModel.canUseAndroidNativeAudio({transportKind: 'tauri'})).toBe(false)
  })

  it('allows neutral native audio playback for local and remote Tauri sessions with capability enabled', () => {
    setRuntimeCapabilities({supports_native_audio_playback: true})
    runtimeModeModel.setCoreMode('local')

    expect(runtimeModeModel.canUseNativeAudioPlayback({transportKind: 'tauri'})).toBe(true)
    expect(runtimeModeModel.canUseNativeAudioPlayback({transportKind: 'ws'})).toBe(false)

    runtimeModeModel.setCoreMode({remote: {host: {type: 'tauri_remote_wss', peer_id: 'peer-1'}}})
    expect(runtimeModeModel.canUseNativeAudioPlayback({transportKind: 'tauri'})).toBe(true)

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
