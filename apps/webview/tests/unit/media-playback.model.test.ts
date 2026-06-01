import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {
  ANDROID_MEDIA3_PLAYBACK_READY_TIMEOUT_MS,
  ANDROID_MEDIA3_START_ACK_TIMEOUT_MS,
  ANDROID_NATIVE_AUDIO_PREPARING_STATUS_DELAY_MS,
  MEDIA_PLAYBACK_WAVEFORM_BAR_COUNT,
  MEDIA_PLAYBACK_WAVEFORM_LEVEL_COUNT,
  mediaPlaybackModel,
} from '../../src/features/media/models/media-playback.model'
import {ANDROID_MEDIA3_COMMAND_TIMEOUT_MS} from '../../src/features/media/models/android-media3-playback-driver'
import {
  dispatchMediaStreamError,
  resetMediaStreamOwnerRegistryForTests,
} from '../../src/features/media/models/media-stream-owner-registry'
import {
  MAX_ANDROID_AUDIO_BLOB_FALLBACK_BYTES,
  MAX_MEDIA_BLOB_FALLBACK_BYTES,
  invalidateFileBlobCache,
} from '../../src/features/media/components/file-loader'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {runtimeModeModel} from '../../src/core/runtime/runtime-mode.model'
import type {AndroidAudioCommand} from '../../src/core/transport/transport'
import type {ResolvedAudioTrack} from '../../src/features/media/models/media-playback.model'

const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL

function streamOf(...chunks: Uint8Array[]): AsyncIterable<Uint8Array> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk
      }
    },
  }
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error('condition not met')
}

function seedSeekableAudioState(): void {
  mediaPlaybackModel.sessionKind.set('audio')
  mediaPlaybackModel.tracks.set([{id: 1, name: 'track.mp3', path: '/track.mp3', mimeType: 'audio/mpeg'}])
  mediaPlaybackModel.currentIndex.set(0)
  mediaPlaybackModel.loadingState.set('loaded')
  mediaPlaybackModel.currentTime.set(0)
  mediaPlaybackModel.duration.set(75)
}

function enableAndroidNativeAudio(): void {
  setRuntimeCapabilities({
    platform: 'android',
    mobile: true,
    android_native_audio_playback_rollout_enabled: true,
  })
  runtimeModeModel.setCoreMode('local')
}

function enableIosNativeAudio(): void {
  setRuntimeCapabilities({
    platform: 'ios',
    mobile: true,
    supports_native_audio_playback: true,
  })
  runtimeModeModel.setCoreMode('local')
}

function androidAudioTrack(overrides: Partial<ResolvedAudioTrack> = {}): ResolvedAudioTrack {
  return {
    id: 301,
    name: 'private-track-name.mp3',
    path: '/private-track-name.mp3',
    mimeType: 'audio/mpeg',
    size: 1234,
    sourceRevision: 77,
    ...overrides,
  }
}

beforeEach(async () => {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(() => 'blob:audio-url'),
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  })
  await mediaPlaybackModel.stopSession()
  resetMediaStreamOwnerRegistryForTests()
  invalidateFileBlobCache(1)
  invalidateFileBlobCache(2)
  invalidateFileBlobCache(101)
  invalidateFileBlobCache(301)
  invalidateFileBlobCache(302)
  resetRuntimeCapabilities()
  runtimeModeModel.handleTransportDisconnect()
})

afterEach(async () => {
  await mediaPlaybackModel.stopSession()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  resetMediaStreamOwnerRegistryForTests()
  invalidateFileBlobCache(1)
  invalidateFileBlobCache(2)
  invalidateFileBlobCache(101)
  invalidateFileBlobCache(301)
  invalidateFileBlobCache(302)
  resetRuntimeCapabilities()
  runtimeModeModel.handleTransportDisconnect()
  clearAppContext()
  vi.clearAllMocks()
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: originalCreateObjectURL,
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: originalRevokeObjectURL,
  })
})

describe('mediaPlaybackModel', () => {
  it('starts an audio session paused and keeps playback intent separate from media events', async () => {
    const download = vi.fn().mockImplementation(async () => streamOf(new TextEncoder().encode('audio')))
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'ws',
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    await mediaPlaybackModel.startAudioSession(
      [
        {id: 1, name: 'one.mp3', mimeType: 'audio/mpeg', size: 5},
        {id: 2, name: 'two.mp3', mimeType: 'audio/mpeg', size: 5},
      ],
      0,
    )

    expect(mediaPlaybackModel.sessionKind()).toBe('audio')
    expect(mediaPlaybackModel.currentTrack()?.id).toBe(1)
    expect(mediaPlaybackModel.currentTrackId()).toBe(1)
    expect(mediaPlaybackModel.queueCount()).toBe(2)
    expect(mediaPlaybackModel.playbackIntent()).toBe('pause')
    expect(mediaPlaybackModel.isPlaying()).toBe(false)
    expect(mediaPlaybackModel.playbackState()).toBe('paused')
    expect(mediaPlaybackModel.sourceKind()).toBe('blob')

    mediaPlaybackModel.requestPlay()
    mediaPlaybackModel.handleMediaPlay()

    expect(mediaPlaybackModel.playbackIntent()).toBe('play')
    expect(mediaPlaybackModel.isPlaying()).toBe(true)
    expect(mediaPlaybackModel.playbackState()).toBe('playing')

    await mediaPlaybackModel.handleTrackEnded()

    expect(mediaPlaybackModel.currentTrack()?.id).toBe(2)
    expect(mediaPlaybackModel.currentTrackId()).toBe(2)
    expect(mediaPlaybackModel.playbackIntent()).toBe('play')
    expect(mediaPlaybackModel.playbackState()).toBe('buffering')
  })

  it('can start a minimized audio session with autoplay intent', async () => {
    const download = vi.fn().mockImplementation(async () => streamOf(new TextEncoder().encode('audio')))
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'ws',
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    await mediaPlaybackModel.startAudioSession(
      [{id: 1, name: 'one.mp3', mimeType: 'audio/mpeg', size: 5}],
      0,
      {autoplay: true, showFullPlayer: false},
    )

    expect(mediaPlaybackModel.sessionKind()).toBe('audio')
    expect(mediaPlaybackModel.currentTrackId()).toBe(1)
    expect(mediaPlaybackModel.playbackIntent()).toBe('play')
    expect(mediaPlaybackModel.isPlaying()).toBe(true)
    expect(mediaPlaybackModel.playbackState()).toBe('buffering')
    expect(mediaPlaybackModel.fullPlayerOpen()).toBe(false)
    expect(mediaPlaybackModel.miniControlsVisible()).toBe(true)
  })

  it('exposes split labels and normalized progress for audio presentation state', () => {
    seedSeekableAudioState()
    mediaPlaybackModel.currentTime.set(42)

    expect(mediaPlaybackModel.currentTrackId()).toBe(1)
    expect(mediaPlaybackModel.currentTrackTitle()).toBe('track')
    expect(mediaPlaybackModel.currentTrackFileName()).toBe('track.mp3')
    expect(mediaPlaybackModel.currentPositionLabel()).toBe('0:42')
    expect(mediaPlaybackModel.durationLabel()).toBe('1:15')
    expect(mediaPlaybackModel.positionLabel()).toBe('0:42 / 1:15')
    expect(mediaPlaybackModel.progressValue()).toBeCloseTo(42 / 75)
    expect(mediaPlaybackModel.queueCount()).toBe(1)
    expect(mediaPlaybackModel.queueRows()).toMatchObject([
      {
        index: 0,
        id: 1,
        title: 'track',
        fileName: 'track.mp3',
        durationLabel: '1:15',
        isCurrent: true,
      },
    ])
    expect(mediaPlaybackModel.waveformDisplayBars()).toHaveLength(MEDIA_PLAYBACK_WAVEFORM_BAR_COUNT)

    mediaPlaybackModel.currentTime.set(90)
    expect(mediaPlaybackModel.progressValue()).toBe(1)
    expect(mediaPlaybackModel.waveformDisplayBars().every((bar) => bar.isPlayed)).toBe(true)

    mediaPlaybackModel.currentTime.set(-4)
    expect(mediaPlaybackModel.currentPositionLabel()).toBe('0:00')
    expect(mediaPlaybackModel.progressValue()).toBe(0)
  })

  it('projects full-player audio position between coarse media time updates', () => {
    let nowMs = 1000
    let frameCallback: ((time: number) => void) | null = null
    vi.spyOn(performance, 'now').mockImplementation(() => nowMs)
    const requestFrame = vi.fn((callback: (time: number) => void) => {
      frameCallback = callback
      return requestFrame.mock.calls.length + 1
    })
    vi.stubGlobal('requestAnimationFrame', requestFrame)
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    seedSeekableAudioState()
    mediaPlaybackModel.currentTime.set(10)
    mediaPlaybackModel.openFullPlayer()
    mediaPlaybackModel.handleMediaPlay()

    expect(mediaPlaybackModel.displayCurrentTime()).toBe(10)
    expect(requestFrame).toHaveBeenCalled()

    nowMs = 1250
    frameCallback?.(nowMs)

    expect(mediaPlaybackModel.displayCurrentTime()).toBeCloseTo(10.25, 2)
    expect(mediaPlaybackModel.progressValue()).toBeCloseTo(10.25 / 75, 2)
    expect(mediaPlaybackModel.waveformDisplayBars().filter((bar) => bar.isPlayed)).toHaveLength(
      Math.floor(mediaPlaybackModel.progressValue() * MEDIA_PLAYBACK_WAVEFORM_BAR_COUNT),
    )

    mediaPlaybackModel.previewSeek(20)

    expect(mediaPlaybackModel.displayCurrentTime()).toBe(20)
  })

  it('returns zero progress for unavailable, invalid, or fallback-limited audio duration', () => {
    seedSeekableAudioState()
    mediaPlaybackModel.currentTime.set(12)

    mediaPlaybackModel.duration.set(null)
    expect(mediaPlaybackModel.durationLabel()).toBe('--:--')
    expect(mediaPlaybackModel.progressValue()).toBe(0)

    mediaPlaybackModel.duration.set(Number.POSITIVE_INFINITY)
    expect(mediaPlaybackModel.progressValue()).toBe(0)

    mediaPlaybackModel.duration.set(0)
    expect(mediaPlaybackModel.progressValue()).toBe(0)

    mediaPlaybackModel.duration.set(75)
    mediaPlaybackModel.loadingState.set('fallback-limited')
    expect(mediaPlaybackModel.progressValue()).toBe(0)

    mediaPlaybackModel.sessionKind.set('none')
    expect(mediaPlaybackModel.progressValue()).toBe(0)
  })

  it('marks Android native audio as preparing while playback waits for native readiness', () => {
    mediaPlaybackModel.sessionKind.set('audio')
    mediaPlaybackModel.tracks.set([
      androidAudioTrack(),
      androidAudioTrack({id: 302, name: 'second-track.mp3', sourceRevision: 78}),
    ])
    mediaPlaybackModel.currentIndex.set(0)
    mediaPlaybackModel.driverKind.set('android-media3')
    mediaPlaybackModel.nativeSessionId.set('native-1')
    mediaPlaybackModel.loadingState.set('loading')
    mediaPlaybackModel.playbackState.set('buffering')
    mediaPlaybackModel.playbackIntent.set('play')

    expect(mediaPlaybackModel.nativeAudioPreparing()).toBe(true)

    mediaPlaybackModel.handleAndroidAudioPlayerEvent({
      event: 'state',
      nativeSessionId: 'native-1',
      trackId: 301,
      sourceRevision: 77,
      index: 0,
      loadingState: 'loaded',
      playbackState: 'playing',
      playbackIntent: 'play',
      positionMs: 0,
      durationMs: 75_000,
    })

    expect(mediaPlaybackModel.nativeAudioPreparing()).toBe(false)

    mediaPlaybackModel.currentIndex.set(1)
    mediaPlaybackModel.playbackState.set('buffering')

    expect(mediaPlaybackModel.nativeAudioPreparing()).toBe(false)

    mediaPlaybackModel.driverKind.set('web-audio-element')
    mediaPlaybackModel.loadingState.set('loading')
    mediaPlaybackModel.playbackState.set('buffering')

    expect(mediaPlaybackModel.nativeAudioPreparing()).toBe(false)
  })

  it('delays Android native audio preparation status visibility', async () => {
    vi.useFakeTimers()
    mediaPlaybackModel.sessionKind.set('audio')
    mediaPlaybackModel.tracks.set([androidAudioTrack()])
    mediaPlaybackModel.currentIndex.set(0)
    mediaPlaybackModel.driverKind.set('android-media3')
    mediaPlaybackModel.nativeSessionId.set('native-1')
    mediaPlaybackModel.loadingState.set('loading')
    mediaPlaybackModel.playbackState.set('buffering')
    mediaPlaybackModel.playbackIntent.set('play')

    expect(mediaPlaybackModel.nativeAudioPreparing()).toBe(true)
    expect(mediaPlaybackModel.nativeAudioPreparingStatusVisible()).toBe(false)

    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(ANDROID_NATIVE_AUDIO_PREPARING_STATUS_DELAY_MS - 1)
    expect(mediaPlaybackModel.nativeAudioPreparingStatusVisible()).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    expect(mediaPlaybackModel.nativeAudioPreparingStatusVisible()).toBe(true)
  })

  it('cancels Android native audio preparation status before the delay elapses', async () => {
    vi.useFakeTimers()
    mediaPlaybackModel.sessionKind.set('audio')
    mediaPlaybackModel.tracks.set([androidAudioTrack()])
    mediaPlaybackModel.currentIndex.set(0)
    mediaPlaybackModel.driverKind.set('android-media3')
    mediaPlaybackModel.nativeSessionId.set('native-1')
    mediaPlaybackModel.loadingState.set('loading')
    mediaPlaybackModel.playbackState.set('buffering')
    mediaPlaybackModel.playbackIntent.set('play')

    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(ANDROID_NATIVE_AUDIO_PREPARING_STATUS_DELAY_MS - 1)
    mediaPlaybackModel.loadingState.set('loaded')
    mediaPlaybackModel.playbackState.set('playing')
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(1)

    expect(mediaPlaybackModel.nativeAudioPreparing()).toBe(false)
    expect(mediaPlaybackModel.nativeAudioPreparingStatusVisible()).toBe(false)
  })

  it('loads native audio streams when allowed and falls back to blob after range-required errors', async () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_media_stream_protocol: true,
    })
    runtimeModeModel.setCoreMode('local')
    const prepareMediaStream = vi.fn().mockResolvedValue({
      kind: 'media-stream',
      streamId: 'stream-1',
      url: 'chromvoid-media://localhost/stream-1',
      name: 'track.mp3',
      mimeType: 'audio/mpeg',
      size: 100,
      sourceRevision: 9,
      expiresAt: 123456,
    })
    const releaseMediaStream = vi.fn().mockResolvedValue(undefined)
    const download = vi.fn().mockImplementation(async () => streamOf(new TextEncoder().encode('fallback')))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          prepareMediaStream,
          releaseMediaStream,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    await mediaPlaybackModel.startAudioSession(
      [{id: 101, name: 'track.mp3', mimeType: 'audio/mpeg', size: 100}],
      0,
    )

    expect(mediaPlaybackModel.sourceKind()).toBe('media-stream')
    expect(mediaPlaybackModel.sourceStreamId()).toBe('stream-1')
    expect(mediaPlaybackModel.sourceUrl()).toBe('chromvoid-media://localhost/stream-1')
    expect(download).not.toHaveBeenCalled()

    dispatchMediaStreamError({
      streamId: 'stream-1',
      code: 'ERR_MEDIA_RANGE_REQUIRED',
      httpStatus: 416,
      nodeId: 101,
      sourceRevision: 9,
    })

    await waitFor(() => mediaPlaybackModel.sourceKind() === 'blob')

    expect(releaseMediaStream).toHaveBeenCalledTimes(1)
    expect(download).toHaveBeenCalledTimes(1)
    expect(runtimeModeModel.canUseNativeMediaStream({transportKind: 'tauri'})).toBe(false)
  })

  it('selects Android Media3 playback when local Android native audio is available', async () => {
    enableAndroidNativeAudio()
    const sendAndroidAudioCommand = vi.fn().mockResolvedValue(undefined)
    const download = vi.fn().mockImplementation(async () => streamOf(new TextEncoder().encode('fallback')))
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          sendAndroidAudioCommand,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    await mediaPlaybackModel.startAudioSession([androidAudioTrack()], 0)

    expect(mediaPlaybackModel.driverKind()).toBe('android-media3')
    expect(mediaPlaybackModel.androidNativeAudioActive()).toBe(true)
    expect(mediaPlaybackModel.sourceKind()).toBe('android-media3')
    expect(mediaPlaybackModel.sourceUrl()).toBeNull()
    expect(mediaPlaybackModel.loadingState()).toBe('loading')
    expect(mediaPlaybackModel.audioArtworkLoadAllowed()).toBe(false)
    expect(download).not.toHaveBeenCalled()

    const startCommand = sendAndroidAudioCommand.mock.calls[0]?.[0]
    expect(startCommand).toMatchObject({
      command: 'startSession',
      tracks: [
        {
          trackId: 301,
          systemTitle: 'ChromVoid audio',
          mimeType: 'audio/mpeg',
          size: 1234,
          sourceRevision: 77,
        },
      ],
      index: 0,
      autoplay: false,
    })
    expect(startCommand.nativeSessionId).toBe(mediaPlaybackModel.nativeSessionId())
    expect(JSON.stringify(startCommand)).not.toContain('private-track-name')

    mediaPlaybackModel.requestPlay()
    await Promise.resolve()

    expect(sendAndroidAudioCommand).toHaveBeenLastCalledWith({
      command: 'play',
      nativeSessionId: startCommand.nativeSessionId,
    })

    mediaPlaybackModel.handleMediaTimeUpdate(0, 120)
    mediaPlaybackModel.handleAndroidAudioPlayerEvent({
      event: 'state',
      nativeSessionId: startCommand.nativeSessionId,
      trackId: 301,
      sourceRevision: 77,
      index: 0,
      playbackState: 'playing',
      playbackIntent: 'play',
      loadingState: 'loaded',
      positionMs: 0,
      durationMs: 120_000,
    })
    expect(mediaPlaybackModel.audioArtworkLoadAllowed()).toBe(true)

    mediaPlaybackModel.seekTo(42)
    await Promise.resolve()

    expect(sendAndroidAudioCommand).toHaveBeenLastCalledWith({
      command: 'seekTo',
      nativeSessionId: startCommand.nativeSessionId,
      positionMs: 42_000,
    })
  })

  it('selects iOS AVPlayer playback when local iOS native audio is available', async () => {
    enableIosNativeAudio()
    const sendNativeAudioCommand = vi.fn().mockResolvedValue({
      accepted: true,
      tracks: [
        {
          trackId: 301,
          mimeType: 'audio/mpeg',
          size: 1234,
          sourceRevision: 77,
        },
      ],
    })
    const download = vi.fn().mockImplementation(async () => streamOf(new TextEncoder().encode('fallback')))
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          sendNativeAudioCommand,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    await mediaPlaybackModel.startAudioSession([androidAudioTrack()], 0)

    expect(mediaPlaybackModel.driverKind()).toBe('ios-avplayer')
    expect(mediaPlaybackModel.nativeAudioActive()).toBe(true)
    expect(mediaPlaybackModel.sourceKind()).toBe('ios-avplayer')
    expect(mediaPlaybackModel.sourceUrl()).toBeNull()
    expect(mediaPlaybackModel.loadingState()).toBe('loading')
    expect(download).not.toHaveBeenCalled()
    expect(sendNativeAudioCommand).toHaveBeenCalledWith({
      command: 'startSession',
      nativeSessionId: expect.any(String),
      tracks: [
        {
          trackId: 301,
          systemTitle: 'ChromVoid audio',
          mimeType: 'audio/mpeg',
          size: 1234,
          sourceRevision: 77,
        },
      ],
      index: 0,
      autoplay: false,
    })
  })

  it('applies iOS native audio state events to the playback model', async () => {
    enableIosNativeAudio()
    const sendNativeAudioCommand = vi.fn().mockResolvedValue({accepted: true})
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          sendNativeAudioCommand,
        } as any,
      }),
    )

    await mediaPlaybackModel.startAudioSession([androidAudioTrack()], 0, {autoplay: true})
    const nativeSessionId = mediaPlaybackModel.nativeSessionId()
    expect(nativeSessionId).toBeTruthy()

    mediaPlaybackModel.handleNativeAudioPlayerEvent({
      event: 'state',
      nativeSessionId,
      trackId: 301,
      sourceRevision: 77,
      index: 0,
      playbackState: 'playing',
      playbackIntent: 'play',
      loadingState: 'loaded',
      positionMs: 42_000,
      durationMs: 120_000,
    })

    expect(mediaPlaybackModel.driverKind()).toBe('ios-avplayer')
    expect(mediaPlaybackModel.loadingState()).toBe('loaded')
    expect(mediaPlaybackModel.playbackState()).toBe('playing')
    expect(mediaPlaybackModel.currentTime()).toBe(42)
    expect(mediaPlaybackModel.duration()).toBe(120)
  })

  it('accepts Android native state events that arrive before startSession resolves', async () => {
    enableAndroidNativeAudio()
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      const sendAndroidAudioCommand = vi.fn(async (command: AndroidAudioCommand) => {
        if (command.command === 'startSession') {
          mediaPlaybackModel.handleAndroidAudioPlayerEvent({
            event: 'state',
            nativeSessionId: command.nativeSessionId,
            trackId: 301,
            sourceRevision: 77,
            index: 0,
            playbackState: 'paused',
            playbackIntent: 'pause',
            loadingState: 'loaded',
            positionMs: 12_000,
            durationMs: 120_000,
          })
        }
        return undefined
      })
      initAppContext(
        createMockAppContext({
          ws: {
            kind: 'tauri',
            sendAndroidAudioCommand,
          } as any,
        }),
      )

      await mediaPlaybackModel.startAudioSession([androidAudioTrack()], 0)

      const startCommand = sendAndroidAudioCommand.mock.calls[0]?.[0]
      expect(mediaPlaybackModel.nativeSessionId()).toBe(startCommand.nativeSessionId)
      expect(mediaPlaybackModel.driverKind()).toBe('android-media3')
      expect(mediaPlaybackModel.sourceKind()).toBe('android-media3')
      expect(mediaPlaybackModel.playbackState()).toBe('paused')
      expect(mediaPlaybackModel.loadingState()).toBe('loaded')
      expect(mediaPlaybackModel.currentTime()).toBe(12)
      expect(mediaPlaybackModel.duration()).toBe(120)

      const trace = consoleInfo.mock.calls.flat().map(String).join('\n')
      expect(trace).toContain('eventApplied')
      expect(trace).toContain('startAckAlreadyReceived')
      expect(trace).not.toContain('stale_session')
      expect(trace).not.toContain('startAckWatchdogStarted')
    } finally {
      consoleInfo.mockRestore()
    }
  })

  it('keeps a newer Android audio session when an older start resolves late', async () => {
    enableAndroidNativeAudio()
    let resolveFirstStart: (() => void) | undefined
    const sendAndroidAudioCommand = vi.fn((command: AndroidAudioCommand) => {
      if (command.command === 'startSession' && command.tracks[0]?.trackId === 301) {
        return new Promise<undefined>((resolve) => {
          resolveFirstStart = () => resolve(undefined)
        })
      }

      return Promise.resolve(undefined)
    })
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          sendAndroidAudioCommand,
        } as any,
      }),
    )

    const firstStart = mediaPlaybackModel.startAudioSession([androidAudioTrack()], 0)
    await waitFor(() => sendAndroidAudioCommand.mock.calls.length === 1)
    await waitFor(() => mediaPlaybackModel.nativeSessionId() !== null)
    const firstNativeSessionId = mediaPlaybackModel.nativeSessionId()

    await mediaPlaybackModel.startAudioSession([androidAudioTrack({id: 302, sourceRevision: 78})], 0)
    const secondNativeSessionId = mediaPlaybackModel.nativeSessionId()

    expect(sendAndroidAudioCommand).toHaveBeenCalledWith({
      command: 'stop',
      nativeSessionId: firstNativeSessionId,
    })
    expect(mediaPlaybackModel.currentTrack()?.id).toBe(302)
    expect(secondNativeSessionId).not.toBe(firstNativeSessionId)

    resolveFirstStart?.()
    await firstStart

    expect(mediaPlaybackModel.currentTrack()?.id).toBe(302)
    expect(mediaPlaybackModel.nativeSessionId()).toBe(secondNativeSessionId)
    expect(mediaPlaybackModel.driverKind()).toBe('android-media3')
  })

  it('keeps a newer Android audio session when an older native failure stop resolves late', async () => {
    enableAndroidNativeAudio()
    let resolveFirstStop: (() => void) | undefined
    let stopCalls = 0
    const sendAndroidAudioCommand = vi.fn((command: AndroidAudioCommand) => {
      if (command.command === 'stop') {
        stopCalls += 1
        if (stopCalls === 1) {
          return new Promise<undefined>((resolve) => {
            resolveFirstStop = () => resolve(undefined)
          })
        }
      }

      return Promise.resolve(undefined)
    })
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          sendAndroidAudioCommand,
        } as any,
      }),
    )

    await mediaPlaybackModel.startAudioSession([androidAudioTrack()], 0)
    const firstNativeSessionId = mediaPlaybackModel.nativeSessionId()

    mediaPlaybackModel.handleAndroidAudioPlayerEvent({
      event: 'error',
      nativeSessionId: firstNativeSessionId,
      trackId: 301,
      sourceRevision: 77,
      code: 'ERR_NATIVE_AUDIO_VAULT_LOCKED',
      recoverable: false,
    })
    await waitFor(() => stopCalls === 1)

    await mediaPlaybackModel.startAudioSession([androidAudioTrack({id: 302, sourceRevision: 78})], 0)
    const secondNativeSessionId = mediaPlaybackModel.nativeSessionId()

    resolveFirstStop?.()
    await Promise.resolve()
    await Promise.resolve()

    expect(mediaPlaybackModel.currentTrack()?.id).toBe(302)
    expect(mediaPlaybackModel.nativeSessionId()).toBe(secondNativeSessionId)
    expect(mediaPlaybackModel.driverKind()).toBe('android-media3')
  })

  it('starts Android Media3 with only a local track id and reconciles native source metadata', async () => {
    enableAndroidNativeAudio()
    const sendAndroidAudioCommand = vi.fn().mockResolvedValue({
      accepted: true,
      tracks: [
        {
          trackId: 301,
          mimeType: 'audio/mpeg',
          size: 1234,
          sourceRevision: 88,
        },
      ],
    })
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          sendAndroidAudioCommand,
        } as any,
      }),
    )

    await mediaPlaybackModel.startAudioSession(
      [
        androidAudioTrack({
          mimeType: undefined,
          size: undefined,
          sourceRevision: undefined,
          lastModified: 77,
        }),
      ],
      0,
    )
    const nativeSessionId = mediaPlaybackModel.nativeSessionId()
    const startCommand = sendAndroidAudioCommand.mock.calls[0]?.[0]

    expect(mediaPlaybackModel.driverKind()).toBe('android-media3')
    expect(startCommand.tracks[0]).toEqual({
      trackId: 301,
      systemTitle: 'ChromVoid audio',
    })
    expect(mediaPlaybackModel.currentTrack()).toMatchObject({
      id: 301,
      mimeType: 'audio/mpeg',
      size: 1234,
      sourceRevision: 88,
    })

    mediaPlaybackModel.handleAndroidAudioPlayerEvent({
      event: 'state',
      nativeSessionId,
      trackId: 301,
      sourceRevision: 88,
      index: 0,
      playbackState: 'playing',
      playbackIntent: 'play',
      loadingState: 'loaded',
      positionMs: 2_000,
      durationMs: 120_000,
    })

    expect(mediaPlaybackModel.playbackState()).toBe('playing')
    expect(mediaPlaybackModel.currentTime()).toBe(2)
  })

  it('passes audio media-info playback MIME to Android native start', async () => {
    enableAndroidNativeAudio()
    const sendAndroidAudioCommand = vi.fn().mockResolvedValue(undefined)
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          sendAndroidAudioCommand,
        } as any,
      }),
    )

    await mediaPlaybackModel.startAudioSession(
      [
        androidAudioTrack({
          mimeType: undefined,
          mediaInfo: {
            kind: 'audio',
            audioTracks: 1,
            videoTracks: 0,
            playbackMimeType: 'audio/mp4',
          },
        }),
      ],
      0,
    )

    const startCommand = sendAndroidAudioCommand.mock.calls[0]?.[0]
    expect(startCommand.tracks[0]).toMatchObject({
      trackId: 301,
      mimeType: 'audio/mp4',
      size: 1234,
      sourceRevision: 77,
    })
  })

  it('infers Android native audio MIME from extension when source metadata is complete', async () => {
    enableAndroidNativeAudio()
    const sendAndroidAudioCommand = vi.fn().mockResolvedValue(undefined)
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          sendAndroidAudioCommand,
        } as any,
      }),
    )

    await mediaPlaybackModel.startAudioSession([androidAudioTrack({mimeType: 'application/octet-stream'})], 0)

    const startCommand = sendAndroidAudioCommand.mock.calls[0]?.[0]
    expect(startCommand.tracks[0]).toMatchObject({
      trackId: 301,
      mimeType: 'audio/mpeg',
      size: 1234,
      sourceRevision: 77,
    })
  })

  it('falls back to Web audio and disables native audio when Android native start fails', async () => {
    enableAndroidNativeAudio()
    const sendAndroidAudioCommand = vi.fn().mockRejectedValue(new Error('native start failed'))
    const download = vi.fn().mockImplementation(async () => streamOf(new TextEncoder().encode('fallback')))
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          sendAndroidAudioCommand,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    await mediaPlaybackModel.startAudioSession([androidAudioTrack({id: 302})], 0)

    expect(sendAndroidAudioCommand).toHaveBeenCalledTimes(1)
    expect(mediaPlaybackModel.driverKind()).toBe('web-audio-element')
    expect(mediaPlaybackModel.nativeSessionId()).toBeNull()
    expect(mediaPlaybackModel.sourceKind()).toBe('blob')
    expect(download).toHaveBeenCalledTimes(1)
    expect(runtimeModeModel.canUseAndroidNativeAudio({transportKind: 'tauri'})).toBe(false)
  })

  it('falls back to Web audio when Android native start is rejected', async () => {
    enableAndroidNativeAudio()
    const sendAndroidAudioCommand = vi.fn().mockResolvedValue({accepted: false})
    const download = vi.fn().mockImplementation(async () => streamOf(new TextEncoder().encode('fallback')))
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          sendAndroidAudioCommand,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    await mediaPlaybackModel.startAudioSession([androidAudioTrack({id: 302})], 0)

    expect(sendAndroidAudioCommand).toHaveBeenCalledTimes(1)
    expect(mediaPlaybackModel.driverKind()).toBe('web-audio-element')
    expect(mediaPlaybackModel.nativeSessionId()).toBeNull()
    expect(mediaPlaybackModel.sourceKind()).toBe('blob')
    expect(download).toHaveBeenCalledTimes(1)
    expect(runtimeModeModel.canUseAndroidNativeAudio({transportKind: 'tauri'})).toBe(false)
  })

  it('falls back to Web audio when Android native command times out', async () => {
    vi.useFakeTimers()
    enableAndroidNativeAudio()
    const sendAndroidAudioCommand = vi.fn().mockImplementation(() => new Promise(() => {}))
    const download = vi.fn().mockImplementation(async () => streamOf(new TextEncoder().encode('fallback')))
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          sendAndroidAudioCommand,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    const start = mediaPlaybackModel.startAudioSession([androidAudioTrack({id: 302})], 0)
    await vi.advanceTimersByTimeAsync(ANDROID_MEDIA3_COMMAND_TIMEOUT_MS)
    await start

    expect(sendAndroidAudioCommand).toHaveBeenCalledTimes(1)
    expect(mediaPlaybackModel.driverKind()).toBe('web-audio-element')
    expect(mediaPlaybackModel.nativeSessionId()).toBeNull()
    expect(mediaPlaybackModel.sourceKind()).toBe('blob')
    expect(download).toHaveBeenCalledTimes(1)
    expect(runtimeModeModel.canUseAndroidNativeAudio({transportKind: 'tauri'})).toBe(false)
  })

  it('keeps Android native diagnostics redacted and summarized', async () => {
    enableAndroidNativeAudio()
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      const sendAndroidAudioCommand = vi.fn().mockResolvedValue(undefined)
      initAppContext(
        createMockAppContext({
          ws: {
            kind: 'tauri',
            sendAndroidAudioCommand,
          } as any,
        }),
      )

      await mediaPlaybackModel.startAudioSession([androidAudioTrack()], 0)
      const nativeSessionId = mediaPlaybackModel.nativeSessionId()
      mediaPlaybackModel.handleAndroidAudioPlayerEvent({
        event: 'state',
        nativeSessionId,
        trackId: 301,
        sourceRevision: 77,
        index: 0,
        playbackState: 'playing',
        playbackIntent: 'play',
        loadingState: 'loaded',
        positionMs: 0,
      })

      const trace = consoleInfo.mock.calls.flat().map(String).join('\n')
      expect(trace).toContain('commandSend')
      expect(trace).toContain('startAckWatchdogStarted')
      expect(trace).toContain('startAckReceived')
      expect(trace).not.toContain('spectrumBinCount')
      expect(trace).not.toContain('eventSpectrum')
      expect(trace).not.toContain('private-track-name')
      expect(trace).not.toContain('/private-track-name.mp3')
      expect(trace).not.toContain('sourceToken')
      expect(trace).not.toContain('"bins"')
    } finally {
      consoleInfo.mockRestore()
    }
  })

  it('falls back to Web audio when Android native start never reports state', async () => {
    vi.useFakeTimers()
    enableAndroidNativeAudio()
    const sendAndroidAudioCommand = vi.fn().mockResolvedValue(undefined)
    const download = vi.fn().mockImplementation(async () => streamOf(new TextEncoder().encode('fallback')))
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          sendAndroidAudioCommand,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    await mediaPlaybackModel.startAudioSession([androidAudioTrack({id: 302})], 0)
    const nativeSessionId = mediaPlaybackModel.nativeSessionId()

    mediaPlaybackModel.handleAndroidAudioPlayerEvent({
      event: 'state',
      nativeSessionId: 'stale-session',
      trackId: 302,
      sourceRevision: 77,
      index: 0,
      playbackState: 'playing',
    })
    mediaPlaybackModel.handleAndroidAudioPlayerEvent({event: 'state'})
    mediaPlaybackModel.requestPlay()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(ANDROID_MEDIA3_START_ACK_TIMEOUT_MS)

    expect(sendAndroidAudioCommand).toHaveBeenCalledWith({
      command: 'stop',
      nativeSessionId,
    })
    expect(mediaPlaybackModel.driverKind()).toBe('web-audio-element')
    expect(mediaPlaybackModel.nativeSessionId()).toBeNull()
    expect(mediaPlaybackModel.sourceKind()).toBe('blob')
    expect(mediaPlaybackModel.playbackIntent()).toBe('play')
    expect(mediaPlaybackModel.playbackIssue()).toBeNull()
    expect(download).toHaveBeenCalledTimes(1)
    expect(runtimeModeModel.canUseAndroidNativeAudio({transportKind: 'tauri'})).toBe(true)
    sendAndroidAudioCommand.mockClear()
    download.mockClear()

    await mediaPlaybackModel.startAudioSession([androidAudioTrack()], 0)

    expect(mediaPlaybackModel.driverKind()).toBe('android-media3')
    expect(mediaPlaybackModel.nativeSessionId()).not.toBeNull()
    expect(mediaPlaybackModel.sourceKind()).toBe('android-media3')
    expect(sendAndroidAudioCommand).toHaveBeenCalledWith(expect.objectContaining({command: 'startSession'}))
    expect(download).not.toHaveBeenCalled()
  })

  it.each([
    {label: 'oversized', size: MAX_ANDROID_AUDIO_BLOB_FALLBACK_BYTES + 1},
    {label: 'unknown-size', size: undefined},
  ])('keeps Android native audio preparing when $label start has no Web blob fallback', async ({size}) => {
    vi.useFakeTimers()
    enableAndroidNativeAudio()
    const sendAndroidAudioCommand = vi.fn().mockResolvedValue(undefined)
    const download = vi.fn().mockImplementation(async () => streamOf(new TextEncoder().encode('fallback')))
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          sendAndroidAudioCommand,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    await mediaPlaybackModel.startAudioSession([androidAudioTrack({id: 601, size})], 0, {
      autoplay: true,
    })
    const nativeSessionId = mediaPlaybackModel.nativeSessionId()

    await vi.advanceTimersByTimeAsync(ANDROID_MEDIA3_START_ACK_TIMEOUT_MS)

    expect(sendAndroidAudioCommand).not.toHaveBeenCalledWith({
      command: 'stop',
      nativeSessionId,
    })
    expect(mediaPlaybackModel.driverKind()).toBe('android-media3')
    expect(mediaPlaybackModel.nativeSessionId()).toBe(nativeSessionId)
    expect(mediaPlaybackModel.sourceKind()).toBe('android-media3')
    expect(mediaPlaybackModel.loadingState()).toBe('loading')
    expect(mediaPlaybackModel.playbackState()).toBe('buffering')
    expect(mediaPlaybackModel.playbackIntent()).toBe('play')
    expect(mediaPlaybackModel.playbackIssue()).toBeNull()
    expect(download).not.toHaveBeenCalled()
  })

  it('falls back to Web audio when Android native playback never becomes ready', async () => {
    vi.useFakeTimers()
    enableAndroidNativeAudio()
    const sendAndroidAudioCommand = vi.fn().mockResolvedValue(undefined)
    const download = vi.fn().mockImplementation(async () => streamOf(new TextEncoder().encode('fallback')))
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          sendAndroidAudioCommand,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    await mediaPlaybackModel.startAudioSession([androidAudioTrack({id: 302})], 0)
    const nativeSessionId = mediaPlaybackModel.nativeSessionId()
    mediaPlaybackModel.handleAndroidAudioPlayerEvent({
      event: 'state',
      nativeSessionId,
      trackId: 302,
      sourceRevision: 77,
      index: 0,
      playbackState: 'buffering',
      playbackIntent: 'pause',
      loadingState: 'loading',
      positionMs: 0,
    })

    mediaPlaybackModel.requestPlay()
    await Promise.resolve()
    mediaPlaybackModel.handleAndroidAudioPlayerEvent({
      event: 'state',
      nativeSessionId,
      trackId: 302,
      sourceRevision: 77,
      index: 0,
      playbackState: 'buffering',
      playbackIntent: 'play',
      loadingState: 'loading',
      positionMs: 0,
    })
    await vi.advanceTimersByTimeAsync(ANDROID_MEDIA3_PLAYBACK_READY_TIMEOUT_MS)

    expect(sendAndroidAudioCommand).toHaveBeenCalledWith({
      command: 'stop',
      nativeSessionId,
    })
    expect(mediaPlaybackModel.driverKind()).toBe('web-audio-element')
    expect(mediaPlaybackModel.nativeSessionId()).toBeNull()
    expect(mediaPlaybackModel.sourceKind()).toBe('blob')
    expect(mediaPlaybackModel.playbackIntent()).toBe('play')
    expect(download).toHaveBeenCalledTimes(1)
    expect(runtimeModeModel.canUseAndroidNativeAudio({transportKind: 'tauri'})).toBe(true)
    sendAndroidAudioCommand.mockClear()
    download.mockClear()

    await mediaPlaybackModel.startAudioSession([androidAudioTrack()], 0)

    expect(mediaPlaybackModel.driverKind()).toBe('android-media3')
    expect(mediaPlaybackModel.nativeSessionId()).not.toBeNull()
    expect(mediaPlaybackModel.sourceKind()).toBe('android-media3')
    expect(sendAndroidAudioCommand).toHaveBeenCalledWith(expect.objectContaining({command: 'startSession'}))
    expect(download).not.toHaveBeenCalled()
  })

  it.each([
    {label: 'oversized', size: MAX_ANDROID_AUDIO_BLOB_FALLBACK_BYTES + 1},
    {label: 'unknown-size', size: undefined},
  ])('keeps Android native audio preparing when $label playback has no Web blob fallback', async ({size}) => {
    vi.useFakeTimers()
    enableAndroidNativeAudio()
    const sendAndroidAudioCommand = vi.fn().mockResolvedValue(undefined)
    const download = vi.fn().mockImplementation(async () => streamOf(new TextEncoder().encode('fallback')))
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          sendAndroidAudioCommand,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    await mediaPlaybackModel.startAudioSession(
      [androidAudioTrack({id: 501, size}), androidAudioTrack({id: 502, size: 2048, sourceRevision: 78})],
      0,
      {autoplay: true},
    )
    const nativeSessionId = mediaPlaybackModel.nativeSessionId()
    mediaPlaybackModel.handleAndroidAudioPlayerEvent({
      event: 'state',
      nativeSessionId,
      trackId: 501,
      sourceRevision: 77,
      index: 0,
      playbackState: 'buffering',
      playbackIntent: 'play',
      loadingState: 'loading',
      positionMs: 0,
    })

    await vi.advanceTimersByTimeAsync(ANDROID_MEDIA3_PLAYBACK_READY_TIMEOUT_MS)

    expect(sendAndroidAudioCommand).not.toHaveBeenCalledWith({
      command: 'stop',
      nativeSessionId,
    })
    expect(mediaPlaybackModel.driverKind()).toBe('android-media3')
    expect(mediaPlaybackModel.nativeSessionId()).toBe(nativeSessionId)
    expect(mediaPlaybackModel.sourceKind()).toBe('android-media3')
    expect(mediaPlaybackModel.loadingState()).toBe('loading')
    expect(mediaPlaybackModel.playbackState()).toBe('buffering')
    expect(mediaPlaybackModel.playbackIntent()).toBe('play')
    expect(mediaPlaybackModel.playbackIssue()).toBeNull()
    expect(runtimeModeModel.canUseAndroidNativeAudio({transportKind: 'tauri'})).toBe(true)
    expect(download).not.toHaveBeenCalled()

    sendAndroidAudioCommand.mockClear()
    await mediaPlaybackModel.selectTrack(1)

    expect(sendAndroidAudioCommand).toHaveBeenCalledWith({
      command: 'selectTrack',
      nativeSessionId,
      index: 1,
    })
    expect(mediaPlaybackModel.driverKind()).toBe('android-media3')
    expect(mediaPlaybackModel.sourceKind()).toBe('android-media3')
    expect(mediaPlaybackModel.playbackIssue()).toBeNull()
    expect(download).not.toHaveBeenCalled()
  })

  it('restarts Android native audio when track selection command fails', async () => {
    enableAndroidNativeAudio()
    const sendAndroidAudioCommand = vi.fn((command: AndroidAudioCommand) => {
      if (command.command === 'selectTrack') {
        return Promise.reject(new Error('select failed'))
      }
      return Promise.resolve(undefined)
    })
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          sendAndroidAudioCommand,
        } as any,
      }),
    )
    await mediaPlaybackModel.startAudioSession(
      [androidAudioTrack({id: 401, sourceRevision: 91}), androidAudioTrack({id: 402, sourceRevision: 92})],
      0,
      {autoplay: true},
    )
    const nativeSessionId = mediaPlaybackModel.nativeSessionId()

    await mediaPlaybackModel.selectTrack(1)

    expect(sendAndroidAudioCommand).toHaveBeenCalledWith({
      command: 'selectTrack',
      nativeSessionId,
      index: 1,
    })
    expect(sendAndroidAudioCommand).toHaveBeenCalledWith({
      command: 'stop',
      nativeSessionId,
    })
    expect(
      sendAndroidAudioCommand.mock.calls.filter(
        ([command]) => (command as AndroidAudioCommand).command === 'startSession',
      ),
    ).toHaveLength(2)
    expect(mediaPlaybackModel.currentIndex()).toBe(1)
    expect(mediaPlaybackModel.driverKind()).toBe('android-media3')
    expect(mediaPlaybackModel.nativeSessionId()).not.toBe(nativeSessionId)
    expect(mediaPlaybackModel.sourceKind()).toBe('android-media3')
    expect(mediaPlaybackModel.loadingState()).toBe('loading')
    expect(mediaPlaybackModel.playbackIntent()).toBe('play')
    expect(runtimeModeModel.canUseAndroidNativeAudio({transportKind: 'tauri'})).toBe(true)
  })

  it('does not show fallback-limited after a ready Android session restarts on track select failure', async () => {
    vi.useFakeTimers()
    enableAndroidNativeAudio()
    const sendAndroidAudioCommand = vi.fn((command: AndroidAudioCommand) => {
      if (command.command === 'selectTrack') {
        return Promise.reject(new Error('select failed'))
      }
      return Promise.resolve(undefined)
    })
    const download = vi.fn().mockImplementation(async () => streamOf(new TextEncoder().encode('fallback')))
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          sendAndroidAudioCommand,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )
    await mediaPlaybackModel.startAudioSession(
      [
        androidAudioTrack({id: 701, size: MAX_ANDROID_AUDIO_BLOB_FALLBACK_BYTES + 1}),
        androidAudioTrack({
          id: 702,
          name: 'second-track.mp3',
          size: MAX_ANDROID_AUDIO_BLOB_FALLBACK_BYTES + 2,
          sourceRevision: 78,
        }),
      ],
      0,
      {autoplay: true},
    )
    const firstNativeSessionId = mediaPlaybackModel.nativeSessionId()
    mediaPlaybackModel.handleAndroidAudioPlayerEvent({
      event: 'state',
      nativeSessionId: firstNativeSessionId,
      trackId: 701,
      sourceRevision: 77,
      index: 0,
      playbackState: 'playing',
      playbackIntent: 'play',
      loadingState: 'loaded',
      positionMs: 2_000,
      durationMs: 75_000,
    })
    sendAndroidAudioCommand.mockClear()

    await mediaPlaybackModel.selectTrack(1)
    const restartedNativeSessionId = mediaPlaybackModel.nativeSessionId()
    await vi.advanceTimersByTimeAsync(ANDROID_MEDIA3_START_ACK_TIMEOUT_MS)

    expect(sendAndroidAudioCommand).toHaveBeenCalledWith({
      command: 'selectTrack',
      nativeSessionId: firstNativeSessionId,
      index: 1,
    })
    expect(sendAndroidAudioCommand).toHaveBeenCalledWith({
      command: 'stop',
      nativeSessionId: firstNativeSessionId,
    })
    expect(sendAndroidAudioCommand).not.toHaveBeenCalledWith({
      command: 'stop',
      nativeSessionId: restartedNativeSessionId,
    })
    expect(mediaPlaybackModel.currentIndex()).toBe(1)
    expect(mediaPlaybackModel.driverKind()).toBe('android-media3')
    expect(mediaPlaybackModel.nativeSessionId()).toBe(restartedNativeSessionId)
    expect(mediaPlaybackModel.loadingState()).toBe('loading')
    expect(mediaPlaybackModel.playbackState()).toBe('buffering')
    expect(mediaPlaybackModel.playbackIntent()).toBe('play')
    expect(mediaPlaybackModel.playbackIssue()).toBeNull()
    expect(download).not.toHaveBeenCalled()
  })

  it('keeps Android native playback when it reports playing before readiness timeout', async () => {
    vi.useFakeTimers()
    enableAndroidNativeAudio()
    const sendAndroidAudioCommand = vi.fn().mockResolvedValue(undefined)
    const download = vi.fn().mockImplementation(async () => streamOf(new TextEncoder().encode('fallback')))
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          sendAndroidAudioCommand,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    await mediaPlaybackModel.startAudioSession([androidAudioTrack()], 0)
    const nativeSessionId = mediaPlaybackModel.nativeSessionId()
    mediaPlaybackModel.requestPlay()
    await Promise.resolve()
    mediaPlaybackModel.handleAndroidAudioPlayerEvent({
      event: 'state',
      nativeSessionId,
      trackId: 301,
      sourceRevision: 77,
      index: 0,
      playbackState: 'playing',
      playbackIntent: 'play',
      loadingState: 'loaded',
      positionMs: 1_000,
      durationMs: 10_000,
    })
    await vi.advanceTimersByTimeAsync(ANDROID_MEDIA3_PLAYBACK_READY_TIMEOUT_MS)

    expect(mediaPlaybackModel.driverKind()).toBe('android-media3')
    expect(mediaPlaybackModel.nativeSessionId()).toBe(nativeSessionId)
    expect(mediaPlaybackModel.playbackState()).toBe('playing')
    expect(download).not.toHaveBeenCalled()
  })

  it('reconciles matching Android native audio state events', async () => {
    enableAndroidNativeAudio()
    const sendAndroidAudioCommand = vi.fn().mockResolvedValue(undefined)
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          sendAndroidAudioCommand,
        } as any,
      }),
    )
    await mediaPlaybackModel.startAudioSession([androidAudioTrack()], 0)
    const nativeSessionId = mediaPlaybackModel.nativeSessionId()

    mediaPlaybackModel.handleAndroidAudioPlayerEvent({
      event: 'state',
      nativeSessionId,
      trackId: 301,
      sourceRevision: 77,
      index: 0,
      playbackState: 'playing',
      playbackIntent: 'play',
      loadingState: 'loaded',
      positionMs: 42_000,
      durationMs: 120_000,
      canSeek: true,
      hasPrevious: false,
      hasNext: false,
    })

    expect(mediaPlaybackModel.playbackState()).toBe('playing')
    expect(mediaPlaybackModel.playbackIntent()).toBe('play')
    expect(mediaPlaybackModel.loadingState()).toBe('loaded')
    expect(mediaPlaybackModel.currentTime()).toBe(42)
    expect(mediaPlaybackModel.duration()).toBe(120)
    expect(mediaPlaybackModel.canSeek()).toBe(true)
  })

  it('ignores Android native audio spectrum payloads instead of applying UI state', async () => {
    enableAndroidNativeAudio()
    const sendAndroidAudioCommand = vi.fn().mockResolvedValue(undefined)
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          sendAndroidAudioCommand,
        } as any,
      }),
    )
    await mediaPlaybackModel.startAudioSession([androidAudioTrack()], 0)
    const nativeSessionId = mediaPlaybackModel.nativeSessionId()
    const before = mediaPlaybackModel.waveformDisplayBars()

    mediaPlaybackModel.handleAndroidAudioPlayerEvent({
      event: 'spectrum',
      nativeSessionId,
      trackId: 301,
      sourceRevision: 77,
      index: 0,
      bins: Array.from({length: MEDIA_PLAYBACK_WAVEFORM_BAR_COUNT}, () => 0.5),
      rms: 0.25,
    } as any)

    expect(mediaPlaybackModel.waveformDisplayBars()).toEqual(before)
  })

  it('derives deterministic waveform display bars from model-owned shape and playback progress', () => {
    seedSeekableAudioState()
    mediaPlaybackModel.currentTime.set(0)

    const bars = mediaPlaybackModel.waveformDisplayBars()

    expect(bars).toHaveLength(MEDIA_PLAYBACK_WAVEFORM_BAR_COUNT)
    expect(bars.every((bar) => bar.level >= 0 && bar.level <= MEDIA_PLAYBACK_WAVEFORM_LEVEL_COUNT)).toBe(true)
    expect(bars.every((bar) => !bar.isPlayed)).toBe(true)
    expect(bars.some((bar) => bar.emphasis === 'soft')).toBe(true)
    expect(bars.some((bar) => bar.emphasis === 'normal')).toBe(true)
    expect(bars.some((bar) => bar.emphasis === 'peak')).toBe(true)
    expect(bars.some((bar) => bar.isNearPlayhead)).toBe(true)
    const midStart = Math.floor(MEDIA_PLAYBACK_WAVEFORM_BAR_COUNT / 3)
    const highStart = Math.floor(MEDIA_PLAYBACK_WAVEFORM_BAR_COUNT * 0.75)
    expect(bars[midStart - 1]).toMatchObject({index: midStart - 1, band: 'low'})
    expect(bars[midStart]).toMatchObject({index: midStart, band: 'mid'})
    expect(bars[highStart - 1]).toMatchObject({index: highStart - 1, band: 'mid'})
    expect(bars[highStart]).toMatchObject({index: highStart, band: 'high'})
    expect(bars.at(-1)).toMatchObject({index: MEDIA_PLAYBACK_WAVEFORM_BAR_COUNT - 1, band: 'high'})

    mediaPlaybackModel.currentTime.set(37.5)
    const halfPlayedBars = mediaPlaybackModel.waveformDisplayBars()
    const halfPlayedCount = Math.floor(MEDIA_PLAYBACK_WAVEFORM_BAR_COUNT / 2)
    expect(halfPlayedBars.slice(0, halfPlayedCount).every((bar) => bar.isPlayed)).toBe(true)
    expect(halfPlayedBars[halfPlayedCount]?.isPlayed).toBe(false)

    mediaPlaybackModel.currentTime.set(75)
    const completedBars = mediaPlaybackModel.waveformDisplayBars()
    expect(completedBars.every((bar) => bar.isPlayed)).toBe(true)
    expect(completedBars.at(-1)).toMatchObject({isNearPlayhead: true})
  })

  it('derives a stable waveform shape per track identity', () => {
    mediaPlaybackModel.sessionKind.set('audio')
    mediaPlaybackModel.tracks.set([
      {id: 1, name: 'track-a.mp3', path: '/track-a.mp3', mimeType: 'audio/mpeg', size: 1000},
      {id: 2, name: 'track-b.mp3', path: '/track-b.mp3', mimeType: 'audio/mpeg', size: 1000},
    ])
    mediaPlaybackModel.currentIndex.set(0)
    mediaPlaybackModel.loadingState.set('loaded')
    mediaPlaybackModel.currentTime.set(0)
    mediaPlaybackModel.duration.set(75)

    const firstShape = mediaPlaybackModel.waveformDisplayBars().map((bar) => bar.level)
    expect(mediaPlaybackModel.waveformDisplayBars().map((bar) => bar.level)).toEqual(firstShape)

    mediaPlaybackModel.currentIndex.set(1)
    const secondShape = mediaPlaybackModel.waveformDisplayBars().map((bar) => bar.level)

    expect(secondShape).toHaveLength(MEDIA_PLAYBACK_WAVEFORM_BAR_COUNT)
    expect(secondShape).not.toEqual(firstShape)
  })

  it('does not expose the removed live spectrum UI atoms or computed values', () => {
    expect('spectrumBins' in mediaPlaybackModel).toBe(false)
    expect('spectrumDisplayLevels' in mediaPlaybackModel).toBe(false)
    expect('spectrumDisplayBars' in mediaPlaybackModel).toBe(false)
    expect('spectrumActive' in mediaPlaybackModel).toBe(false)
  })

  it('ignores stale and malformed Android native audio events', async () => {
    enableAndroidNativeAudio()
    const sendAndroidAudioCommand = vi.fn().mockResolvedValue(undefined)
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          sendAndroidAudioCommand,
        } as any,
      }),
    )
    await mediaPlaybackModel.startAudioSession([androidAudioTrack()], 0)
    const nativeSessionId = mediaPlaybackModel.nativeSessionId()

    mediaPlaybackModel.handleAndroidAudioPlayerEvent({
      event: 'state',
      nativeSessionId: 'stale-session',
      trackId: 301,
      sourceRevision: 77,
      index: 0,
      playbackState: 'playing',
      positionMs: 10_000,
    })
    mediaPlaybackModel.handleAndroidAudioPlayerEvent({
      event: 'released',
      nativeSessionId: 'stale-session',
      reason: 'service_destroyed',
    })
    mediaPlaybackModel.handleAndroidAudioPlayerEvent({
      event: 'error',
      nativeSessionId: 'stale-session',
      code: 'ERR_NATIVE_AUDIO_SOURCE_READ',
    })
    mediaPlaybackModel.handleAndroidAudioPlayerEvent({
      event: 'state',
      nativeSessionId,
      trackId: 999,
      sourceRevision: 77,
      index: 0,
      playbackState: 'playing',
      positionMs: 20_000,
    })
    mediaPlaybackModel.handleAndroidAudioPlayerEvent({
      event: 'state',
      nativeSessionId,
      trackId: 301,
      sourceRevision: 999,
      index: 0,
      playbackState: 'playing',
      positionMs: 30_000,
    })
    mediaPlaybackModel.handleAndroidAudioPlayerEvent({
      event: 'state',
      nativeSessionId,
      trackId: 301,
      sourceRevision: 77,
      index: 99,
      playbackState: 'playing',
      positionMs: 40_000,
    })
    mediaPlaybackModel.handleAndroidAudioPlayerEvent({event: 'state'})

    expect(mediaPlaybackModel.playbackState()).toBe('paused')
    expect(mediaPlaybackModel.currentTime()).toBe(0)
  })

  it('records a native service issue when current Android service is destroyed during intended playback', async () => {
    enableAndroidNativeAudio()
    const sendAndroidAudioCommand = vi.fn().mockResolvedValue(undefined)
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          sendAndroidAudioCommand,
        } as any,
      }),
    )
    await mediaPlaybackModel.startAudioSession([androidAudioTrack()], 0, {autoplay: true})
    const nativeSessionId = mediaPlaybackModel.nativeSessionId()
    mediaPlaybackModel.handleAndroidAudioPlayerEvent({
      event: 'state',
      nativeSessionId,
      trackId: 301,
      sourceRevision: 77,
      index: 0,
      playbackState: 'playing',
      playbackIntent: 'play',
      loadingState: 'loaded',
      positionMs: 5_000,
      durationMs: 120_000,
    })

    mediaPlaybackModel.handleAndroidAudioPlayerEvent({
      event: 'released',
      nativeSessionId,
      trackId: 301,
      sourceRevision: 77,
      reason: 'service_destroyed',
    })

    expect(mediaPlaybackModel.sessionKind()).toBe('none')
    expect(mediaPlaybackModel.driverKind()).toBe('web-audio-element')
    expect(mediaPlaybackModel.nativeSessionId()).toBeNull()
    expect(mediaPlaybackModel.playbackState()).toBe('stopped')
    expect(mediaPlaybackModel.playbackIssue()).toMatchObject({
      kind: 'android-native-service-stopped',
      trackId: 301,
      sourceRevision: 77,
    })
  })

  it('clears native state without issue when Android reports system stop release', async () => {
    enableAndroidNativeAudio()
    const sendAndroidAudioCommand = vi.fn().mockResolvedValue(undefined)
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          sendAndroidAudioCommand,
        } as any,
      }),
    )
    await mediaPlaybackModel.startAudioSession([androidAudioTrack()], 0, {autoplay: true})
    const nativeSessionId = mediaPlaybackModel.nativeSessionId()

    mediaPlaybackModel.handleAndroidAudioPlayerEvent({
      event: 'released',
      nativeSessionId,
      reason: 'system_stop',
    })

    expect(mediaPlaybackModel.sessionKind()).toBe('none')
    expect(mediaPlaybackModel.driverKind()).toBe('web-audio-element')
    expect(mediaPlaybackModel.nativeSessionId()).toBeNull()
    expect(mediaPlaybackModel.playbackState()).toBe('stopped')
    expect(mediaPlaybackModel.playbackIssue()).toBeNull()
  })

  it('stops native playback on Android native source errors without starting Web audio', async () => {
    enableAndroidNativeAudio()
    const sendAndroidAudioCommand = vi.fn().mockResolvedValue(undefined)
    const download = vi.fn().mockImplementation(async () => streamOf(new TextEncoder().encode('fallback')))
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          sendAndroidAudioCommand,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )
    await mediaPlaybackModel.startAudioSession([androidAudioTrack()], 0)
    const nativeSessionId = mediaPlaybackModel.nativeSessionId()
    sendAndroidAudioCommand.mockClear()

    mediaPlaybackModel.handleAndroidAudioPlayerEvent({
      event: 'error',
      nativeSessionId,
      trackId: 301,
      sourceRevision: 77,
      code: 'ERR_NATIVE_AUDIO_VAULT_LOCKED',
      recoverable: false,
    })
    await waitFor(() => mediaPlaybackModel.playbackState() === 'error')

    expect(sendAndroidAudioCommand).toHaveBeenCalledWith({
      command: 'stop',
      nativeSessionId,
    })
    expect(mediaPlaybackModel.driverKind()).toBe('web-audio-element')
    expect(mediaPlaybackModel.nativeSessionId()).toBeNull()
    expect(mediaPlaybackModel.sourceKind()).toBe('none')
    expect(mediaPlaybackModel.loadingState()).toBe('error')
    expect(mediaPlaybackModel.playbackIssue()).toMatchObject({
      kind: 'android-native-error',
      nativeCode: 'ERR_NATIVE_AUDIO_VAULT_LOCKED',
    })
    expect(runtimeModeModel.canUseAndroidNativeAudio({transportKind: 'tauri'})).toBe(true)
    expect(download).not.toHaveBeenCalled()
  })

  it.each([
    {label: 'source read', code: 'ERR_NATIVE_AUDIO_SOURCE_READ'},
    {label: 'decoder', code: 'ERROR_CODE_DECODING_FAILED'},
  ])('falls back to Web audio and quarantines native on terminal $label errors', async ({code}) => {
    enableAndroidNativeAudio()
    const sendAndroidAudioCommand = vi.fn().mockResolvedValue(undefined)
    const download = vi.fn().mockImplementation(async () => streamOf(new TextEncoder().encode('fallback')))
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          sendAndroidAudioCommand,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )
    await mediaPlaybackModel.startAudioSession([androidAudioTrack()], 0, {autoplay: true})
    const nativeSessionId = mediaPlaybackModel.nativeSessionId()
    sendAndroidAudioCommand.mockClear()

    mediaPlaybackModel.handleAndroidAudioPlayerEvent({
      event: 'error',
      nativeSessionId,
      trackId: 301,
      sourceRevision: 77,
      code,
      recoverable: false,
    })
    await waitFor(() => mediaPlaybackModel.sourceKind() === 'blob')

    expect(sendAndroidAudioCommand).toHaveBeenCalledWith({
      command: 'stop',
      nativeSessionId,
    })
    expect(mediaPlaybackModel.driverKind()).toBe('web-audio-element')
    expect(mediaPlaybackModel.nativeSessionId()).toBeNull()
    expect(mediaPlaybackModel.playbackIssue()).toBeNull()
    expect(mediaPlaybackModel.playbackIntent()).toBe('play')
    expect(download).toHaveBeenCalledTimes(1)
    expect(runtimeModeModel.canUseAndroidNativeAudio({transportKind: 'tauri'})).toBe(false)
  })

  it('advances native playback on matching Android ended events', async () => {
    enableAndroidNativeAudio()
    const sendAndroidAudioCommand = vi.fn().mockResolvedValue(undefined)
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          sendAndroidAudioCommand,
        } as any,
      }),
    )
    await mediaPlaybackModel.startAudioSession(
      [androidAudioTrack(), androidAudioTrack({id: 302, sourceRevision: 78})],
      0,
    )
    const nativeSessionId = mediaPlaybackModel.nativeSessionId()
    sendAndroidAudioCommand.mockClear()

    mediaPlaybackModel.handleAndroidAudioPlayerEvent({
      event: 'ended',
      nativeSessionId,
      trackId: 301,
      sourceRevision: 77,
      index: 0,
    })
    await Promise.resolve()

    expect(mediaPlaybackModel.currentTrack()?.id).toBe(302)
    expect(mediaPlaybackModel.playbackIntent()).toBe('play')
    expect(sendAndroidAudioCommand).toHaveBeenCalledWith({
      command: 'selectTrack',
      nativeSessionId,
      index: 1,
    })
  })

  it('releases the active source and clears state when stopped', async () => {
    const download = vi.fn().mockImplementation(async () => streamOf(new TextEncoder().encode('audio')))
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'ws',
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    await mediaPlaybackModel.startAudioSession(
      [{id: 1, name: 'track.mp3', mimeType: 'audio/mpeg', size: 5}],
      0,
    )
    mediaPlaybackModel.handleMediaTimeUpdate(12, 75)
    mediaPlaybackModel.seekTo(42)
    expect(mediaPlaybackModel.seekRequest()).toMatchObject({time: 42})

    await mediaPlaybackModel.stopSession()

    expect(mediaPlaybackModel.sessionKind()).toBe('none')
    expect(mediaPlaybackModel.currentTrackId()).toBeNull()
    expect(mediaPlaybackModel.sourceUrl()).toBeNull()
    expect(mediaPlaybackModel.sourceKind()).toBe('none')
    expect(mediaPlaybackModel.playbackState()).toBe('stopped')
    expect(mediaPlaybackModel.progressValue()).toBe(0)
    expect(mediaPlaybackModel.seekRequest()).toBeNull()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:audio-url')
  })

  it('creates seek requests and optimistically updates current time', () => {
    seedSeekableAudioState()

    mediaPlaybackModel.seekTo(42)
    const firstRequest = mediaPlaybackModel.seekRequest()

    expect(mediaPlaybackModel.currentTime()).toBe(42)
    expect(firstRequest).toMatchObject({time: 42})

    mediaPlaybackModel.seekTo(42)
    const secondRequest = mediaPlaybackModel.seekRequest()

    expect(secondRequest).toMatchObject({time: 42})
    expect(secondRequest?.id).not.toBe(firstRequest?.id)
  })

  it('previews seek targets without issuing playback seeks until committed', () => {
    seedSeekableAudioState()

    mediaPlaybackModel.previewSeek(42)

    expect(mediaPlaybackModel.currentTime()).toBe(0)
    expect(mediaPlaybackModel.seekPreviewTime()).toBe(42)
    expect(mediaPlaybackModel.currentPositionLabel()).toBe('0:42')
    expect(mediaPlaybackModel.progressValue()).toBeCloseTo(42 / 75)
    expect(mediaPlaybackModel.seekRequest()).toBeNull()

    mediaPlaybackModel.previewSeek(50)

    expect(mediaPlaybackModel.currentTime()).toBe(0)
    expect(mediaPlaybackModel.seekPreviewTime()).toBe(50)
    expect(mediaPlaybackModel.seekRequest()).toBeNull()

    mediaPlaybackModel.commitSeek()

    expect(mediaPlaybackModel.seekPreviewTime()).toBe(50)
    expect(mediaPlaybackModel.currentTime()).toBe(50)
    expect(mediaPlaybackModel.seekRequest()).toMatchObject({time: 50})

    mediaPlaybackModel.handleMediaTimeUpdate(12, 75)

    expect(mediaPlaybackModel.currentTime()).toBe(12)
    expect(mediaPlaybackModel.seekPreviewTime()).toBe(50)
    expect(mediaPlaybackModel.currentPositionLabel()).toBe('0:50')
    expect(mediaPlaybackModel.progressValue()).toBeCloseTo(50 / 75)

    mediaPlaybackModel.handleMediaTimeUpdate(50.1, 75)

    expect(mediaPlaybackModel.seekPreviewTime()).toBeNull()
    expect(mediaPlaybackModel.currentTime()).toBe(50.1)
  })

  it('clamps seek requests to the available duration', () => {
    seedSeekableAudioState()

    mediaPlaybackModel.seekTo(-5)
    expect(mediaPlaybackModel.currentTime()).toBe(0)
    expect(mediaPlaybackModel.seekRequest()).toMatchObject({time: 0})

    mediaPlaybackModel.seekTo(999)
    expect(mediaPlaybackModel.currentTime()).toBe(75)
    expect(mediaPlaybackModel.seekRequest()).toMatchObject({time: 75})
  })

  it('ignores seeks when duration or playback source is unavailable', () => {
    seedSeekableAudioState()
    mediaPlaybackModel.currentTime.set(8)
    mediaPlaybackModel.duration.set(null)

    mediaPlaybackModel.seekTo(10)

    expect(mediaPlaybackModel.currentTime()).toBe(8)
    expect(mediaPlaybackModel.seekRequest()).toBeNull()

    mediaPlaybackModel.duration.set(75)
    mediaPlaybackModel.loadingState.set('fallback-limited')

    mediaPlaybackModel.seekTo(10)

    expect(mediaPlaybackModel.currentTime()).toBe(8)
    expect(mediaPlaybackModel.seekRequest()).toBeNull()

    mediaPlaybackModel.loadingState.set('idle')

    mediaPlaybackModel.seekTo(10)

    expect(mediaPlaybackModel.currentTime()).toBe(8)
    expect(mediaPlaybackModel.seekRequest()).toBeNull()
  })

  it('uses fallback-limited state for oversized audio blob fallback without downloading', async () => {
    const download = vi.fn().mockImplementation(async () => streamOf(new TextEncoder().encode('audio')))
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'ws',
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    await mediaPlaybackModel.startAudioSession(
      [
        {
          id: 1,
          name: 'large.mp3',
          mimeType: 'audio/mpeg',
          size: MAX_MEDIA_BLOB_FALLBACK_BYTES + 1,
        },
      ],
      0,
    )

    expect(mediaPlaybackModel.loadingState()).toBe('fallback-limited')
    expect(mediaPlaybackModel.sourceKind()).toBe('none')
    expect(mediaPlaybackModel.sourceUrl()).toBeNull()
    expect(mediaPlaybackModel.playbackState()).toBe('paused')
    expect(mediaPlaybackModel.playbackIssue()).toMatchObject({
      kind: 'blob-fallback-limited',
      trackId: 1,
      sourceSize: MAX_MEDIA_BLOB_FALLBACK_BYTES + 1,
      fallbackLimitBytes: MAX_MEDIA_BLOB_FALLBACK_BYTES,
    })
    expect(download).not.toHaveBeenCalled()
  })
})
