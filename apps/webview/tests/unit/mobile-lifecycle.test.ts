import {afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest'

const {
  tauriInvokeMock,
  handleBackgroundMock,
  handleForegroundResumeMock,
  purgePreparedFileSourcesMock,
  releaseMediaSourcesForAppBackgroundMock,
} = vi.hoisted(() => ({
  tauriInvokeMock: vi.fn(() => Promise.resolve({ok: true, result: {locked: false}})),
  handleBackgroundMock: vi.fn(),
  handleForegroundResumeMock: vi.fn(),
  purgePreparedFileSourcesMock: vi.fn(() => Promise.resolve()),
  releaseMediaSourcesForAppBackgroundMock: vi.fn(() => Promise.resolve()),
}))

vi.mock('../../src/core/transport/tauri/ipc', () => ({
  tauriInvoke: tauriInvokeMock,
}))

vi.mock('../../src/routes/biometric-app-gate/biometric-app-gate.model', () => ({
  biometricAppGateModel: {
    handleBackground: handleBackgroundMock,
    handleForegroundResume: handleForegroundResumeMock,
  },
}))

vi.mock('../../src/features/media/components/file-loader', () => ({
  purgePreparedFileSources: purgePreparedFileSourcesMock,
}))

vi.mock('../../src/features/media/models/media-lifecycle', () => ({
  releaseMediaSourcesForAppBackground: releaseMediaSourcesForAppBackgroundMock,
}))

import {
  MOBILE_FILE_PICKER_LIFECYCLE_END_EVENT,
  MOBILE_FILE_PICKER_LIFECYCLE_START_EVENT,
} from '@chromvoid/password-import'
import {setupMobileLifecycle} from '../../src/app/bootstrap/mobile-lifecycle'
import {
  ANDROID_NATIVE_VIDEO_LIFECYCLE_END_EVENT,
  ANDROID_NATIVE_VIDEO_LIFECYCLE_START_EVENT,
} from '../../src/features/media/models/android-native-video-lifecycle'
import {mediaPlaybackModel} from '../../src/features/media/models/media-playback.model'

describe('setupMobileLifecycle', () => {
  let visibilityState: DocumentVisibilityState = 'visible'

  const seedAndroidAudioState = (
    loadingState: 'loaded' | 'loading' | 'fallback-limited' | 'error',
    playbackIntent: 'play' | 'pause' = 'play',
  ) => {
    mediaPlaybackModel.sessionKind.set('audio')
    mediaPlaybackModel.tracks.set([
      {
        id: 301,
        name: 'track.mp3',
        path: '/track.mp3',
        mimeType: 'audio/mpeg',
        size: 1234,
        sourceRevision: 77,
      },
    ])
    mediaPlaybackModel.currentIndex.set(0)
    mediaPlaybackModel.driverKind.set('android-media3')
    mediaPlaybackModel.nativeSessionId.set('android-native-session-123456')
    mediaPlaybackModel.loadingState.set(loadingState)
    mediaPlaybackModel.playbackIntent.set(playbackIntent)
  }

  beforeAll(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibilityState,
    })

    setupMobileLifecycle(
      {kind: 'tauri'} as never,
      {
        isMobile: () => true,
      } as never,
    )
  })

  beforeEach(() => {
    visibilityState = 'visible'
    tauriInvokeMock.mockClear()
    handleBackgroundMock.mockClear()
    handleForegroundResumeMock.mockClear()
    purgePreparedFileSourcesMock.mockClear()
    releaseMediaSourcesForAppBackgroundMock.mockClear()
  })

  afterEach(async () => {
    vi.useRealTimers()
    visibilityState = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))
    await Promise.resolve()
    await mediaPlaybackModel.stopSession()
  })

  it('treats hidden and visible as background and foreground by default', () => {
    visibilityState = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))

    expect(handleBackgroundMock).toHaveBeenCalledTimes(1)
    expect(purgePreparedFileSourcesMock).toHaveBeenCalledWith('background')
    expect(releaseMediaSourcesForAppBackgroundMock).toHaveBeenCalledTimes(1)
    expect(releaseMediaSourcesForAppBackgroundMock).toHaveBeenCalledWith({
      preserveAudioSession: false,
    })
    expect(tauriInvokeMock).toHaveBeenCalledWith('mobile_notify_background')

    visibilityState = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))

    expect(handleForegroundResumeMock).toHaveBeenCalledTimes(1)
    expect(tauriInvokeMock).toHaveBeenCalledWith('mobile_notify_foreground')
  })

  it('handles pause and resume events when visibilitychange is not fired', () => {
    document.dispatchEvent(new Event('pause'))

    expect(handleBackgroundMock).toHaveBeenCalledTimes(1)
    expect(purgePreparedFileSourcesMock).toHaveBeenCalledWith('background')
    expect(releaseMediaSourcesForAppBackgroundMock).toHaveBeenCalledTimes(1)
    expect(releaseMediaSourcesForAppBackgroundMock).toHaveBeenCalledWith({
      preserveAudioSession: false,
    })
    expect(tauriInvokeMock).toHaveBeenCalledWith('mobile_notify_background')

    document.dispatchEvent(new Event('resume'))

    expect(handleForegroundResumeMock).toHaveBeenCalledTimes(1)
    expect(tauriInvokeMock).toHaveBeenCalledWith('mobile_notify_foreground')
  })

  it.each(['loaded', 'loading'] as const)(
    'preserves Android native audio on background while state is %s',
    (loadingState) => {
      seedAndroidAudioState(loadingState)

      visibilityState = 'hidden'
      document.dispatchEvent(new Event('visibilitychange'))

      expect(releaseMediaSourcesForAppBackgroundMock).toHaveBeenCalledWith({
        preserveAudioSession: true,
      })
    },
  )

  it.each(['fallback-limited', 'error'] as const)(
    'does not preserve Android native audio on background while state is %s',
    (loadingState) => {
      seedAndroidAudioState(loadingState)

      visibilityState = 'hidden'
      document.dispatchEvent(new Event('visibilitychange'))

      expect(releaseMediaSourcesForAppBackgroundMock).toHaveBeenCalledWith({
        preserveAudioSession: false,
      })
    },
  )

  it('does not preserve Android native audio on background after the user paused playback', () => {
    seedAndroidAudioState('loaded', 'pause')

    visibilityState = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))

    expect(releaseMediaSourcesForAppBackgroundMock).toHaveBeenCalledWith({
      preserveAudioSession: false,
    })
  })

  it('stops active audio only when mobile background notify reports a lock', async () => {
    seedAndroidAudioState('loaded')
    tauriInvokeMock.mockResolvedValueOnce({ok: true, result: {locked: true}})
    const stopSession = vi.spyOn(mediaPlaybackModel, 'stopSession').mockResolvedValue(undefined)

    try {
      visibilityState = 'hidden'
      document.dispatchEvent(new Event('visibilitychange'))

      await vi.waitFor(() => {
        expect(stopSession).toHaveBeenCalledTimes(1)
      })
      expect(releaseMediaSourcesForAppBackgroundMock).toHaveBeenCalledWith({
        preserveAudioSession: true,
      })
    } finally {
      stopSession.mockRestore()
    }
  })

  it('ignores blur and focus while the document is still visible', () => {
    window.dispatchEvent(new Event('blur'))

    expect(handleBackgroundMock).not.toHaveBeenCalled()
    expect(purgePreparedFileSourcesMock).not.toHaveBeenCalled()
    expect(releaseMediaSourcesForAppBackgroundMock).not.toHaveBeenCalled()
    expect(tauriInvokeMock).not.toHaveBeenCalled()

    window.dispatchEvent(new Event('focus'))

    expect(handleForegroundResumeMock).not.toHaveBeenCalled()
    expect(tauriInvokeMock).not.toHaveBeenCalled()
  })

  it('ignores the hidden-visible cycle triggered by the mobile file picker', () => {
    window.dispatchEvent(
      new CustomEvent(MOBILE_FILE_PICKER_LIFECYCLE_START_EVENT, {
        detail: {timeoutMs: 30_000},
      }),
    )

    visibilityState = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))

    visibilityState = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))

    window.dispatchEvent(new CustomEvent(MOBILE_FILE_PICKER_LIFECYCLE_END_EVENT))

    expect(handleBackgroundMock).not.toHaveBeenCalled()
    expect(handleForegroundResumeMock).not.toHaveBeenCalled()
    expect(purgePreparedFileSourcesMock).not.toHaveBeenCalled()
    expect(releaseMediaSourcesForAppBackgroundMock).not.toHaveBeenCalled()
    expect(tauriInvokeMock).not.toHaveBeenCalled()
  })

  it('re-arms foreground biometric flow after a stale mobile file picker suppression expires', async () => {
    vi.useFakeTimers()
    window.dispatchEvent(
      new CustomEvent(MOBILE_FILE_PICKER_LIFECYCLE_START_EVENT, {
        detail: {timeoutMs: 100},
      }),
    )

    visibilityState = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))

    expect(handleBackgroundMock).not.toHaveBeenCalled()
    expect(handleForegroundResumeMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(101)
    visibilityState = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))

    expect(handleForegroundResumeMock).toHaveBeenCalledTimes(1)
    expect(tauriInvokeMock).toHaveBeenCalledWith('mobile_notify_foreground')
  })

  it('ignores pause and resume triggered by the mobile file picker', () => {
    window.dispatchEvent(
      new CustomEvent(MOBILE_FILE_PICKER_LIFECYCLE_START_EVENT, {
        detail: {timeoutMs: 30_000},
      }),
    )

    document.dispatchEvent(new Event('pause'))
    document.dispatchEvent(new Event('resume'))
    window.dispatchEvent(new CustomEvent(MOBILE_FILE_PICKER_LIFECYCLE_END_EVENT))

    expect(handleBackgroundMock).not.toHaveBeenCalled()
    expect(handleForegroundResumeMock).not.toHaveBeenCalled()
    expect(purgePreparedFileSourcesMock).not.toHaveBeenCalled()
    expect(releaseMediaSourcesForAppBackgroundMock).not.toHaveBeenCalled()
    expect(tauriInvokeMock).not.toHaveBeenCalled()
  })

  it('ignores the hidden-visible cycle triggered by the Android native video activity', () => {
    window.dispatchEvent(
      new CustomEvent(ANDROID_NATIVE_VIDEO_LIFECYCLE_START_EVENT, {
        detail: {timeoutMs: 30_000},
      }),
    )

    visibilityState = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))

    visibilityState = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))

    window.dispatchEvent(new CustomEvent(ANDROID_NATIVE_VIDEO_LIFECYCLE_END_EVENT))

    expect(handleBackgroundMock).not.toHaveBeenCalled()
    expect(handleForegroundResumeMock).not.toHaveBeenCalled()
    expect(purgePreparedFileSourcesMock).not.toHaveBeenCalled()
    expect(releaseMediaSourcesForAppBackgroundMock).not.toHaveBeenCalled()
    expect(tauriInvokeMock).not.toHaveBeenCalled()
  })

  it('resumes normal lifecycle handling after the file picker session ends', () => {
    window.dispatchEvent(
      new CustomEvent(MOBILE_FILE_PICKER_LIFECYCLE_START_EVENT, {
        detail: {timeoutMs: 30_000},
      }),
    )
    window.dispatchEvent(new CustomEvent(MOBILE_FILE_PICKER_LIFECYCLE_END_EVENT))

    visibilityState = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))

    expect(handleBackgroundMock).toHaveBeenCalledTimes(1)
    expect(purgePreparedFileSourcesMock).toHaveBeenCalledWith('background')
    expect(releaseMediaSourcesForAppBackgroundMock).toHaveBeenCalledTimes(1)
    expect(releaseMediaSourcesForAppBackgroundMock).toHaveBeenCalledWith({
      preserveAudioSession: false,
    })
    expect(tauriInvokeMock).toHaveBeenCalledWith('mobile_notify_background')
  })

  it('preserves an active audio session on background when the vault remains unlocked', async () => {
    mediaPlaybackModel.sessionKind.set('audio')
    mediaPlaybackModel.tracks.set([{id: 91, name: 'track.mp3', mimeType: 'audio/mpeg', size: 100}])
    mediaPlaybackModel.loadingState.set('loaded')
    mediaPlaybackModel.playbackIntent.set('play')

    visibilityState = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))
    await Promise.resolve()
    await Promise.resolve()

    expect(releaseMediaSourcesForAppBackgroundMock).toHaveBeenCalledWith({
      preserveAudioSession: true,
    })
    expect(mediaPlaybackModel.sessionKind()).toBe('audio')
  })

  it('stops a preserved audio session when mobile background notification locks the vault', async () => {
    tauriInvokeMock.mockResolvedValueOnce({ok: true, result: {locked: true}})
    mediaPlaybackModel.sessionKind.set('audio')
    mediaPlaybackModel.tracks.set([{id: 92, name: 'track.mp3', mimeType: 'audio/mpeg', size: 100}])
    mediaPlaybackModel.loadingState.set('loaded')
    mediaPlaybackModel.playbackIntent.set('play')

    visibilityState = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(releaseMediaSourcesForAppBackgroundMock).toHaveBeenCalledWith({
      preserveAudioSession: true,
    })
    await vi.waitFor(() => {
      expect(mediaPlaybackModel.sessionKind()).toBe('none')
    })
  })
})
