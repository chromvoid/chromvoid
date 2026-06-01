import {atom} from '@reatom/core'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {setupAndroidAudioWarmup} from '../../src/app/bootstrap/android-audio-warmup'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {runtimeModeModel} from '../../src/core/runtime/runtime-mode.model'
import {mediaPlaybackModel} from '../../src/features/media/models/media-playback.model'

function enableAndroidNativeAudio(): void {
  setRuntimeCapabilities({
    platform: 'android',
    mobile: true,
    android_native_audio_playback_rollout_enabled: true,
  })
  runtimeModeModel.setCoreMode('local')
  runtimeModeModel.resetAndroidNativeAudioForRuntimeSession()
  mediaPlaybackModel.driverKind.set('web-audio-element')
}

describe('setupAndroidAudioWarmup', () => {
  afterEach(() => {
    resetRuntimeCapabilities()
    runtimeModeModel.handleTransportDisconnect()
    mediaPlaybackModel.driverKind.set('web-audio-element')
    vi.restoreAllMocks()
  })

  it('does not duplicate the explicit initial warmup through subscribe-time callbacks', () => {
    enableAndroidNativeAudio()
    const ws = {
      kind: 'tauri',
      connected: atom(true),
      warmupAndroidAudio: vi.fn(async () => true),
    }

    const cleanup = setupAndroidAudioWarmup(ws as never)
    try {
      expect(ws.warmupAndroidAudio).toHaveBeenCalledTimes(1)
    } finally {
      cleanup()
    }
  })

  it('warms once when Android native audio becomes available after setup', async () => {
    runtimeModeModel.setCoreMode('local')
    mediaPlaybackModel.driverKind.set('web-audio-element')
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      android_native_audio_playback_rollout_enabled: false,
    })
    const ws = {
      kind: 'tauri',
      connected: atom(true),
      warmupAndroidAudio: vi.fn(async () => true),
    }

    const cleanup = setupAndroidAudioWarmup(ws as never)
    try {
      expect(ws.warmupAndroidAudio).not.toHaveBeenCalled()

      setRuntimeCapabilities({
        platform: 'android',
        mobile: true,
        android_native_audio_playback_rollout_enabled: true,
      })
      await Promise.resolve()

      expect(ws.warmupAndroidAudio).toHaveBeenCalledTimes(1)
    } finally {
      cleanup()
    }
  })
})
