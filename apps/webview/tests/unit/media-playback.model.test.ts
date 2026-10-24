import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {
  NATIVE_AUDIO_PREPARING_STATUS_DELAY_MS,
  MEDIA_PLAYBACK_WAVEFORM_BAR_COUNT,
  MEDIA_PLAYBACK_WAVEFORM_LEVEL_COUNT,
  mediaPlaybackModel,
} from '../../src/features/media/models/media-playback.model'
import {
  dispatchMediaStreamError,
  resetMediaStreamOwnerRegistryForTests,
} from '../../src/features/media/models/media-stream-owner-registry'
import {
  MAX_NATIVE_AUDIO_BLOB_FALLBACK_BYTES,
  MAX_MEDIA_BLOB_FALLBACK_BYTES,
  invalidateFileBlobCache,
} from '../../src/features/media/components/file-loader'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {runtimeModeModel} from '../../src/core/runtime/runtime-mode.model'
import type {NativeAudioCommand} from '../../src/core/transport/transport'
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

function enableIosNativeAudio(): void {
  setRuntimeCapabilities({
    platform: 'ios',
    mobile: true,
    supports_native_audio_playback: true,
  })
  runtimeModeModel.setCoreMode('local')
}

function nativeAudioTrack(overrides: Partial<ResolvedAudioTrack> = {}): ResolvedAudioTrack {
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

  it('marks native audio as preparing while playback waits for native readiness', () => {
    mediaPlaybackModel.sessionKind.set('audio')
    mediaPlaybackModel.tracks.set([
      nativeAudioTrack(),
      nativeAudioTrack({id: 302, name: 'second-track.mp3', sourceRevision: 78}),
    ])
    mediaPlaybackModel.currentIndex.set(0)
    mediaPlaybackModel.driverKind.set('ios-avplayer')
    mediaPlaybackModel.nativeSessionId.set('native-1')
    mediaPlaybackModel.loadingState.set('loading')
    mediaPlaybackModel.playbackState.set('buffering')
    mediaPlaybackModel.playbackIntent.set('play')

    expect(mediaPlaybackModel.nativeAudioPreparing()).toBe(true)

    mediaPlaybackModel.handleNativeAudioPlayerEvent({
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

  it('delays native audio preparation status visibility', async () => {
    vi.useFakeTimers()
    mediaPlaybackModel.sessionKind.set('audio')
    mediaPlaybackModel.tracks.set([nativeAudioTrack()])
    mediaPlaybackModel.currentIndex.set(0)
    mediaPlaybackModel.driverKind.set('ios-avplayer')
    mediaPlaybackModel.nativeSessionId.set('native-1')
    mediaPlaybackModel.loadingState.set('loading')
    mediaPlaybackModel.playbackState.set('buffering')
    mediaPlaybackModel.playbackIntent.set('play')

    expect(mediaPlaybackModel.nativeAudioPreparing()).toBe(true)
    expect(mediaPlaybackModel.nativeAudioPreparingStatusVisible()).toBe(false)

    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(NATIVE_AUDIO_PREPARING_STATUS_DELAY_MS - 1)
    expect(mediaPlaybackModel.nativeAudioPreparingStatusVisible()).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    expect(mediaPlaybackModel.nativeAudioPreparingStatusVisible()).toBe(true)
  })

  it('cancels native audio preparation status before the delay elapses', async () => {
    vi.useFakeTimers()
    mediaPlaybackModel.sessionKind.set('audio')
    mediaPlaybackModel.tracks.set([nativeAudioTrack()])
    mediaPlaybackModel.currentIndex.set(0)
    mediaPlaybackModel.driverKind.set('ios-avplayer')
    mediaPlaybackModel.nativeSessionId.set('native-1')
    mediaPlaybackModel.loadingState.set('loading')
    mediaPlaybackModel.playbackState.set('buffering')
    mediaPlaybackModel.playbackIntent.set('play')

    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(NATIVE_AUDIO_PREPARING_STATUS_DELAY_MS - 1)
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

  it('loads remote USB audio through a media stream when blob fallback is too large', async () => {
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
      supports_media_stream_protocol: false,
    })
    runtimeModeModel.setCoreMode({remote: {host: {host_id: 'host-1', type: 'mobile_usb'}}})
    const prepareMediaStream = vi.fn().mockResolvedValue({
      kind: 'media-stream',
      streamId: 'stream-15',
      url: 'chromvoid-media://localhost/stream-15',
      name: 'remote-track.mp3',
      mimeType: 'audio/mpeg',
      size: MAX_NATIVE_AUDIO_BLOB_FALLBACK_BYTES + 1,
      sourceRevision: 1780561243303,
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
      [
        {
          id: 15,
          name: 'remote-track.mp3',
          mimeType: 'audio/mpeg',
          size: MAX_NATIVE_AUDIO_BLOB_FALLBACK_BYTES + 1,
          sourceRevision: 1780561243303,
        },
      ],
      0,
    )

    expect(mediaPlaybackModel.driverKind()).toBe('web-audio-element')
    expect(mediaPlaybackModel.loadingState()).toBe('loaded')
    expect(mediaPlaybackModel.sourceKind()).toBe('media-stream')
    expect(mediaPlaybackModel.sourceStreamId()).toBe('stream-15')
    expect(mediaPlaybackModel.sourceUrl()).toBe('chromvoid-media://localhost/stream-15')
    expect(mediaPlaybackModel.playbackIssue()).toBeNull()
    expect(prepareMediaStream).toHaveBeenCalledWith(15, {
      fileName: 'remote-track.mp3',
      mimeType: 'audio/mpeg',
      lastModified: null,
    })
    expect(download).not.toHaveBeenCalled()

    await mediaPlaybackModel.stopSession()
    expect(releaseMediaStream).toHaveBeenCalledTimes(1)
  })

  it('stays fallback-limited when remote stream transport and native playback are unavailable', async () => {
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
      supports_media_stream_protocol: false,
    })
    runtimeModeModel.setCoreMode({remote: {host: {host_id: 'host-1', type: 'mobile_usb'}}})
    const download = vi.fn().mockImplementation(async () => streamOf(new TextEncoder().encode('fallback')))

    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
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
          id: 14,
          name: 'remote-broken.mp3',
          mimeType: 'audio/mpeg',
          size: 9_990_144,
          sourceRevision: 1_780_561_242_976,
        },
      ],
      0,
      {autoplay: true},
    )

    expect(mediaPlaybackModel.driverKind()).toBe('web-audio-element')
    expect(mediaPlaybackModel.loadingState()).toBe('fallback-limited')
    expect(mediaPlaybackModel.sourceKind()).toBe('none')
    expect(mediaPlaybackModel.sourceUrl()).toBeNull()
    expect(mediaPlaybackModel.playbackState()).toBe('paused')
    expect(mediaPlaybackModel.playbackIntent()).toBe('pause')
    expect(mediaPlaybackModel.playbackIssue()).toMatchObject({
      kind: 'blob-fallback-limited',
      trackId: 14,
      sourceSize: 9_990_144,
      fallbackLimitBytes: MAX_MEDIA_BLOB_FALLBACK_BYTES,
    })
    expect(download).not.toHaveBeenCalled()
  })

  it('keeps remote USB audio streaming available after stream failures', async () => {
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
      supports_media_stream_protocol: false,
    })
    runtimeModeModel.setCoreMode({remote: {host: {host_id: 'host-1', type: 'mobile_usb'}}})
    const prepareMediaStream = vi
      .fn()
      .mockResolvedValueOnce({
        kind: 'media-stream',
        streamId: 'stream-15',
        url: 'chromvoid-media://localhost/stream-15',
        name: 'remote-track-15.mp3',
        mimeType: 'audio/mpeg',
        size: MAX_NATIVE_AUDIO_BLOB_FALLBACK_BYTES + 1,
        sourceRevision: 1780561243303,
        expiresAt: 123456,
      })
      .mockResolvedValueOnce({
        kind: 'media-stream',
        streamId: 'stream-16',
        url: 'chromvoid-media://localhost/stream-16',
        name: 'remote-track-16.mp3',
        mimeType: 'audio/mpeg',
        size: MAX_NATIVE_AUDIO_BLOB_FALLBACK_BYTES + 1,
        sourceRevision: 1780561244303,
        expiresAt: 123456,
      })
      .mockResolvedValueOnce({
        kind: 'media-stream',
        streamId: 'stream-17',
        url: 'chromvoid-media://localhost/stream-17',
        name: 'remote-track-17.mp3',
        mimeType: 'audio/mpeg',
        size: MAX_NATIVE_AUDIO_BLOB_FALLBACK_BYTES + 1,
        sourceRevision: 1780561245303,
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
      [
        {
          id: 15,
          name: 'remote-track-15.mp3',
          mimeType: 'audio/mpeg',
          size: MAX_NATIVE_AUDIO_BLOB_FALLBACK_BYTES + 1,
          sourceRevision: 1780561243303,
        },
      ],
      0,
    )

    expect(mediaPlaybackModel.sourceKind()).toBe('media-stream')
    expect(mediaPlaybackModel.sourceStreamId()).toBe('stream-15')

    mediaPlaybackModel.handleNativeStreamLoadabilityFailure('stream-15')

    await waitFor(() => mediaPlaybackModel.loadingState() === 'error')

    expect(mediaPlaybackModel.sourceKind()).toBe('none')
    expect(runtimeModeModel.canUseMediaStreamSource({transportKind: 'tauri'})).toBe(true)
    expect(download).not.toHaveBeenCalled()

    await mediaPlaybackModel.startAudioSession(
      [
        {
          id: 16,
          name: 'remote-track-16.mp3',
          mimeType: 'audio/mpeg',
          size: MAX_NATIVE_AUDIO_BLOB_FALLBACK_BYTES + 1,
          sourceRevision: 1780561244303,
        },
      ],
      0,
    )

    expect(mediaPlaybackModel.loadingState()).toBe('loaded')
    expect(mediaPlaybackModel.sourceKind()).toBe('media-stream')
    expect(mediaPlaybackModel.sourceStreamId()).toBe('stream-16')
    expect(mediaPlaybackModel.sourceUrl()).toBe('chromvoid-media://localhost/stream-16')
    expect(mediaPlaybackModel.playbackIssue()).toBeNull()

    dispatchMediaStreamError({
      streamId: 'stream-16',
      code: 'ERR_MEDIA_RANGE_REQUIRED',
      httpStatus: 416,
      nodeId: 16,
      sourceRevision: 1780561244303,
    })

    await waitFor(() => mediaPlaybackModel.loadingState() === 'error')

    expect(mediaPlaybackModel.sourceKind()).toBe('none')
    expect(runtimeModeModel.canUseMediaStreamSource({transportKind: 'tauri'})).toBe(true)
    expect(download).not.toHaveBeenCalled()

    await mediaPlaybackModel.startAudioSession(
      [
        {
          id: 17,
          name: 'remote-track-17.mp3',
          mimeType: 'audio/mpeg',
          size: MAX_NATIVE_AUDIO_BLOB_FALLBACK_BYTES + 1,
          sourceRevision: 1780561245303,
        },
      ],
      0,
    )

    expect(mediaPlaybackModel.loadingState()).toBe('loaded')
    expect(mediaPlaybackModel.sourceKind()).toBe('media-stream')
    expect(mediaPlaybackModel.sourceStreamId()).toBe('stream-17')
    expect(mediaPlaybackModel.sourceUrl()).toBe('chromvoid-media://localhost/stream-17')
    expect(mediaPlaybackModel.playbackIssue()).toBeNull()
    expect(prepareMediaStream).toHaveBeenCalledTimes(3)
    expect(releaseMediaStream).toHaveBeenCalledTimes(2)
    expect(download).not.toHaveBeenCalled()
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

    await mediaPlaybackModel.startAudioSession([nativeAudioTrack()], 0)

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

    await mediaPlaybackModel.startAudioSession([nativeAudioTrack()], 0, {autoplay: true})
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

  it('accepts native state events that arrive before startSession resolves', async () => {
    enableIosNativeAudio()
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      const sendNativeAudioCommand = vi.fn(async (command: NativeAudioCommand) => {
        if (command.command === 'startSession') {
          mediaPlaybackModel.handleNativeAudioPlayerEvent({
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
            sendNativeAudioCommand,
          } as any,
        }),
      )

      await mediaPlaybackModel.startAudioSession([nativeAudioTrack()], 0)

      const startCommand = sendNativeAudioCommand.mock.calls[0]?.[0]
      expect(mediaPlaybackModel.nativeSessionId()).toBe(startCommand.nativeSessionId)
      expect(mediaPlaybackModel.driverKind()).toBe('ios-avplayer')
      expect(mediaPlaybackModel.sourceKind()).toBe('ios-avplayer')
      expect(mediaPlaybackModel.playbackState()).toBe('paused')
      expect(mediaPlaybackModel.loadingState()).toBe('loaded')
      expect(mediaPlaybackModel.currentTime()).toBe(12)
      expect(mediaPlaybackModel.duration()).toBe(120)

      const trace = consoleInfo.mock.calls.flat().map(String).join('\n')
      expect(trace).toContain('eventApplied')
      expect(trace).not.toContain('stale_session')
    } finally {
      consoleInfo.mockRestore()
    }
  })

  it('keeps a newer native audio session when an older start resolves late', async () => {
    enableIosNativeAudio()
    let resolveFirstStart: (() => void) | undefined
    const sendNativeAudioCommand = vi.fn((command: NativeAudioCommand) => {
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
          sendNativeAudioCommand,
        } as any,
      }),
    )

    const firstStart = mediaPlaybackModel.startAudioSession([nativeAudioTrack()], 0)
    await waitFor(() => sendNativeAudioCommand.mock.calls.length === 1)
    await waitFor(() => mediaPlaybackModel.nativeSessionId() !== null)
    const firstNativeSessionId = mediaPlaybackModel.nativeSessionId()

    await mediaPlaybackModel.startAudioSession([nativeAudioTrack({id: 302, sourceRevision: 78})], 0)
    const secondNativeSessionId = mediaPlaybackModel.nativeSessionId()

    expect(sendNativeAudioCommand).toHaveBeenCalledWith({
      command: 'stop',
      nativeSessionId: firstNativeSessionId,
    })
    expect(mediaPlaybackModel.currentTrack()?.id).toBe(302)
    expect(secondNativeSessionId).not.toBe(firstNativeSessionId)

    resolveFirstStart?.()
    await firstStart

    expect(mediaPlaybackModel.currentTrack()?.id).toBe(302)
    expect(mediaPlaybackModel.nativeSessionId()).toBe(secondNativeSessionId)
    expect(mediaPlaybackModel.driverKind()).toBe('ios-avplayer')
  })

  it('keeps a newer native audio session when an older native failure stop resolves late', async () => {
    enableIosNativeAudio()
    let resolveFirstStop: (() => void) | undefined
    let stopCalls = 0
    const sendNativeAudioCommand = vi.fn((command: NativeAudioCommand) => {
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
          sendNativeAudioCommand,
        } as any,
      }),
    )

    await mediaPlaybackModel.startAudioSession([nativeAudioTrack()], 0)
    const firstNativeSessionId = mediaPlaybackModel.nativeSessionId()

    mediaPlaybackModel.handleNativeAudioPlayerEvent({
      event: 'error',
      nativeSessionId: firstNativeSessionId,
      trackId: 301,
      sourceRevision: 77,
      code: 'ERR_NATIVE_AUDIO_VAULT_LOCKED',
      recoverable: false,
    })
    await waitFor(() => stopCalls === 1)

    await mediaPlaybackModel.startAudioSession([nativeAudioTrack({id: 302, sourceRevision: 78})], 0)
    const secondNativeSessionId = mediaPlaybackModel.nativeSessionId()

    resolveFirstStop?.()
    await Promise.resolve()
    await Promise.resolve()

    expect(mediaPlaybackModel.currentTrack()?.id).toBe(302)
    expect(mediaPlaybackModel.nativeSessionId()).toBe(secondNativeSessionId)
    expect(mediaPlaybackModel.driverKind()).toBe('ios-avplayer')
  })

  it('starts native with only a local track id and reconciles native source metadata', async () => {
    enableIosNativeAudio()
    const sendNativeAudioCommand = vi.fn().mockResolvedValue({
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
          sendNativeAudioCommand,
        } as any,
      }),
    )

    await mediaPlaybackModel.startAudioSession(
      [
        nativeAudioTrack({
          mimeType: undefined,
          size: undefined,
          sourceRevision: undefined,
          lastModified: 77,
        }),
      ],
      0,
    )
    const nativeSessionId = mediaPlaybackModel.nativeSessionId()
    const startCommand = sendNativeAudioCommand.mock.calls[0]?.[0]

    expect(mediaPlaybackModel.driverKind()).toBe('ios-avplayer')
    expect(startCommand.tracks[0]).toEqual({
      trackId: 301,
      systemTitle: 'ChromVoid audio',
      mimeType: 'audio/mpeg',
    })
    expect(mediaPlaybackModel.currentTrack()).toMatchObject({
      id: 301,
      mimeType: 'audio/mpeg',
      size: 1234,
      sourceRevision: 88,
    })

    mediaPlaybackModel.handleNativeAudioPlayerEvent({
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

  it('passes audio media-info playback MIME to native start', async () => {
    enableIosNativeAudio()
    const sendNativeAudioCommand = vi.fn().mockResolvedValue(undefined)
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          sendNativeAudioCommand,
        } as any,
      }),
    )

    await mediaPlaybackModel.startAudioSession(
      [
        nativeAudioTrack({
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

    const startCommand = sendNativeAudioCommand.mock.calls[0]?.[0]
    expect(startCommand.tracks[0]).toMatchObject({
      trackId: 301,
      mimeType: 'audio/mp4',
      size: 1234,
      sourceRevision: 77,
    })
  })

  it('infers native audio MIME from extension when source metadata is complete', async () => {
    enableIosNativeAudio()
    const sendNativeAudioCommand = vi.fn().mockResolvedValue(undefined)
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          sendNativeAudioCommand,
        } as any,
      }),
    )

    await mediaPlaybackModel.startAudioSession([nativeAudioTrack({mimeType: 'application/octet-stream'})], 0)

    const startCommand = sendNativeAudioCommand.mock.calls[0]?.[0]
    expect(startCommand.tracks[0]).toMatchObject({
      trackId: 301,
      mimeType: 'audio/mpeg',
      size: 1234,
      sourceRevision: 77,
    })
  })

  it('falls back to Web audio and disables native audio when native start fails', async () => {
    enableIosNativeAudio()
    const sendNativeAudioCommand = vi.fn().mockRejectedValue(new Error('native start failed'))
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

    await mediaPlaybackModel.startAudioSession([nativeAudioTrack({id: 302})], 0)

    expect(sendNativeAudioCommand).toHaveBeenCalledTimes(1)
    expect(mediaPlaybackModel.driverKind()).toBe('web-audio-element')
    expect(mediaPlaybackModel.nativeSessionId()).toBeNull()
    expect(mediaPlaybackModel.sourceKind()).toBe('blob')
    expect(download).toHaveBeenCalledTimes(1)
    expect(runtimeModeModel.canUseNativeAudioPlayback({transportKind: 'tauri'})).toBe(false)
  })

  it('falls back to Web audio when native start is rejected', async () => {
    enableIosNativeAudio()
    const sendNativeAudioCommand = vi.fn().mockResolvedValue({accepted: false})
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

    await mediaPlaybackModel.startAudioSession([nativeAudioTrack({id: 302})], 0)

    expect(sendNativeAudioCommand).toHaveBeenCalledTimes(1)
    expect(mediaPlaybackModel.driverKind()).toBe('web-audio-element')
    expect(mediaPlaybackModel.nativeSessionId()).toBeNull()
    expect(mediaPlaybackModel.sourceKind()).toBe('blob')
    expect(download).toHaveBeenCalledTimes(1)
    expect(runtimeModeModel.canUseNativeAudioPlayback({transportKind: 'tauri'})).toBe(false)
  })

  it('keeps native diagnostics redacted and summarized', async () => {
    enableIosNativeAudio()
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      const sendNativeAudioCommand = vi.fn().mockResolvedValue(undefined)
      initAppContext(
        createMockAppContext({
          ws: {
            kind: 'tauri',
            sendNativeAudioCommand,
          } as any,
        }),
      )

      await mediaPlaybackModel.startAudioSession([nativeAudioTrack()], 0)
      const nativeSessionId = mediaPlaybackModel.nativeSessionId()
      mediaPlaybackModel.handleNativeAudioPlayerEvent({
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
      expect(trace).toContain('eventApplied')
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

  it('restarts native audio when track selection command fails', async () => {
    enableIosNativeAudio()
    const sendNativeAudioCommand = vi.fn((command: NativeAudioCommand) => {
      if (command.command === 'selectTrack') {
        return Promise.reject(new Error('select failed'))
      }
      return Promise.resolve(undefined)
    })
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          sendNativeAudioCommand,
        } as any,
      }),
    )
    await mediaPlaybackModel.startAudioSession(
      [nativeAudioTrack({id: 401, sourceRevision: 91}), nativeAudioTrack({id: 402, sourceRevision: 92})],
      0,
      {autoplay: true},
    )
    const nativeSessionId = mediaPlaybackModel.nativeSessionId()

    await mediaPlaybackModel.selectTrack(1)

    expect(sendNativeAudioCommand).toHaveBeenCalledWith({
      command: 'selectTrack',
      nativeSessionId,
      index: 1,
    })
    expect(sendNativeAudioCommand).toHaveBeenCalledWith({
      command: 'stop',
      nativeSessionId,
    })
    expect(
      sendNativeAudioCommand.mock.calls.filter(
        ([command]) => (command as NativeAudioCommand).command === 'startSession',
      ),
    ).toHaveLength(2)
    expect(mediaPlaybackModel.currentIndex()).toBe(1)
    expect(mediaPlaybackModel.driverKind()).toBe('ios-avplayer')
    expect(mediaPlaybackModel.nativeSessionId()).not.toBe(nativeSessionId)
    expect(mediaPlaybackModel.sourceKind()).toBe('ios-avplayer')
    expect(mediaPlaybackModel.loadingState()).toBe('loading')
    expect(mediaPlaybackModel.playbackIntent()).toBe('play')
    expect(runtimeModeModel.canUseNativeAudioPlayback({transportKind: 'tauri'})).toBe(true)
  })

  it('does not show fallback-limited after a ready native session restarts on track select failure', async () => {
    vi.useFakeTimers()
    enableIosNativeAudio()
    const sendNativeAudioCommand = vi.fn((command: NativeAudioCommand) => {
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
          sendNativeAudioCommand,
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
        nativeAudioTrack({id: 701, size: MAX_NATIVE_AUDIO_BLOB_FALLBACK_BYTES + 1}),
        nativeAudioTrack({
          id: 702,
          name: 'second-track.mp3',
          size: MAX_NATIVE_AUDIO_BLOB_FALLBACK_BYTES + 2,
          sourceRevision: 78,
        }),
      ],
      0,
      {autoplay: true},
    )
    const firstNativeSessionId = mediaPlaybackModel.nativeSessionId()
    mediaPlaybackModel.handleNativeAudioPlayerEvent({
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
    sendNativeAudioCommand.mockClear()

    await mediaPlaybackModel.selectTrack(1)
    const restartedNativeSessionId = mediaPlaybackModel.nativeSessionId()
    await vi.runOnlyPendingTimersAsync()

    expect(sendNativeAudioCommand).toHaveBeenCalledWith({
      command: 'selectTrack',
      nativeSessionId: firstNativeSessionId,
      index: 1,
    })
    expect(sendNativeAudioCommand).toHaveBeenCalledWith({
      command: 'stop',
      nativeSessionId: firstNativeSessionId,
    })
    expect(sendNativeAudioCommand).not.toHaveBeenCalledWith({
      command: 'stop',
      nativeSessionId: restartedNativeSessionId,
    })
    expect(mediaPlaybackModel.currentIndex()).toBe(1)
    expect(mediaPlaybackModel.driverKind()).toBe('ios-avplayer')
    expect(mediaPlaybackModel.nativeSessionId()).toBe(restartedNativeSessionId)
    expect(mediaPlaybackModel.loadingState()).toBe('loading')
    expect(mediaPlaybackModel.playbackState()).toBe('buffering')
    expect(mediaPlaybackModel.playbackIntent()).toBe('play')
    expect(mediaPlaybackModel.playbackIssue()).toBeNull()
    expect(download).not.toHaveBeenCalled()
  })

  it('reconciles matching native audio state events', async () => {
    enableIosNativeAudio()
    const sendNativeAudioCommand = vi.fn().mockResolvedValue(undefined)
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          sendNativeAudioCommand,
        } as any,
      }),
    )
    await mediaPlaybackModel.startAudioSession([nativeAudioTrack()], 0)
    const nativeSessionId = mediaPlaybackModel.nativeSessionId()

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

  it('ignores native audio spectrum payloads instead of applying UI state', async () => {
    enableIosNativeAudio()
    const sendNativeAudioCommand = vi.fn().mockResolvedValue(undefined)
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          sendNativeAudioCommand,
        } as any,
      }),
    )
    await mediaPlaybackModel.startAudioSession([nativeAudioTrack()], 0)
    const nativeSessionId = mediaPlaybackModel.nativeSessionId()
    const before = mediaPlaybackModel.waveformDisplayBars()

    mediaPlaybackModel.handleNativeAudioPlayerEvent({
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

  it('ignores stale and malformed native audio events', async () => {
    enableIosNativeAudio()
    const sendNativeAudioCommand = vi.fn().mockResolvedValue(undefined)
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          sendNativeAudioCommand,
        } as any,
      }),
    )
    await mediaPlaybackModel.startAudioSession([nativeAudioTrack()], 0)
    const nativeSessionId = mediaPlaybackModel.nativeSessionId()

    mediaPlaybackModel.handleNativeAudioPlayerEvent({
      event: 'state',
      nativeSessionId: 'stale-session',
      trackId: 301,
      sourceRevision: 77,
      index: 0,
      playbackState: 'playing',
      positionMs: 10_000,
    })
    mediaPlaybackModel.handleNativeAudioPlayerEvent({
      event: 'released',
      nativeSessionId: 'stale-session',
      reason: 'service_destroyed',
    })
    mediaPlaybackModel.handleNativeAudioPlayerEvent({
      event: 'error',
      nativeSessionId: 'stale-session',
      code: 'ERR_NATIVE_AUDIO_SOURCE_READ',
    })
    mediaPlaybackModel.handleNativeAudioPlayerEvent({
      event: 'state',
      nativeSessionId,
      trackId: 999,
      sourceRevision: 77,
      index: 0,
      playbackState: 'playing',
      positionMs: 20_000,
    })
    mediaPlaybackModel.handleNativeAudioPlayerEvent({
      event: 'state',
      nativeSessionId,
      trackId: 301,
      sourceRevision: 999,
      index: 0,
      playbackState: 'playing',
      positionMs: 30_000,
    })
    mediaPlaybackModel.handleNativeAudioPlayerEvent({
      event: 'state',
      nativeSessionId,
      trackId: 301,
      sourceRevision: 77,
      index: 99,
      playbackState: 'playing',
      positionMs: 40_000,
    })
    mediaPlaybackModel.handleNativeAudioPlayerEvent({event: 'state'})

    expect(mediaPlaybackModel.playbackState()).toBe('paused')
    expect(mediaPlaybackModel.currentTime()).toBe(0)
  })

  it('records a native service issue when current native service is destroyed during intended playback', async () => {
    enableIosNativeAudio()
    const sendNativeAudioCommand = vi.fn().mockResolvedValue(undefined)
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          sendNativeAudioCommand,
        } as any,
      }),
    )
    await mediaPlaybackModel.startAudioSession([nativeAudioTrack()], 0, {autoplay: true})
    const nativeSessionId = mediaPlaybackModel.nativeSessionId()
    mediaPlaybackModel.handleNativeAudioPlayerEvent({
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

    mediaPlaybackModel.handleNativeAudioPlayerEvent({
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
      kind: 'native-service-stopped',
      trackId: 301,
      sourceRevision: 77,
    })
  })

  it('clears native state without issue when the native player reports system stop release', async () => {
    enableIosNativeAudio()
    const sendNativeAudioCommand = vi.fn().mockResolvedValue(undefined)
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          sendNativeAudioCommand,
        } as any,
      }),
    )
    await mediaPlaybackModel.startAudioSession([nativeAudioTrack()], 0, {autoplay: true})
    const nativeSessionId = mediaPlaybackModel.nativeSessionId()

    mediaPlaybackModel.handleNativeAudioPlayerEvent({
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

  it('stops native playback on native source errors without starting Web audio', async () => {
    enableIosNativeAudio()
    const sendNativeAudioCommand = vi.fn().mockResolvedValue(undefined)
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
    await mediaPlaybackModel.startAudioSession([nativeAudioTrack()], 0)
    const nativeSessionId = mediaPlaybackModel.nativeSessionId()
    sendNativeAudioCommand.mockClear()

    mediaPlaybackModel.handleNativeAudioPlayerEvent({
      event: 'error',
      nativeSessionId,
      trackId: 301,
      sourceRevision: 77,
      code: 'ERR_NATIVE_AUDIO_VAULT_LOCKED',
      recoverable: false,
    })
    await waitFor(() => mediaPlaybackModel.playbackState() === 'error')

    expect(sendNativeAudioCommand).toHaveBeenCalledWith({
      command: 'stop',
      nativeSessionId,
    })
    expect(mediaPlaybackModel.driverKind()).toBe('web-audio-element')
    expect(mediaPlaybackModel.nativeSessionId()).toBeNull()
    expect(mediaPlaybackModel.sourceKind()).toBe('none')
    expect(mediaPlaybackModel.loadingState()).toBe('error')
    expect(mediaPlaybackModel.playbackIssue()).toMatchObject({
      kind: 'native-error',
      nativeCode: 'ERR_NATIVE_AUDIO_VAULT_LOCKED',
    })
    expect(runtimeModeModel.canUseNativeAudioPlayback({transportKind: 'tauri'})).toBe(true)
    expect(download).not.toHaveBeenCalled()
  })

  it.each([
    {label: 'source read', code: 'ERR_NATIVE_AUDIO_SOURCE_READ'},
    {label: 'decoder', code: 'ERROR_CODE_DECODING_FAILED'},
  ])('falls back to Web audio and quarantines native on terminal $label errors', async ({code}) => {
    enableIosNativeAudio()
    const sendNativeAudioCommand = vi.fn().mockResolvedValue(undefined)
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
    await mediaPlaybackModel.startAudioSession([nativeAudioTrack()], 0, {autoplay: true})
    const nativeSessionId = mediaPlaybackModel.nativeSessionId()
    sendNativeAudioCommand.mockClear()

    mediaPlaybackModel.handleNativeAudioPlayerEvent({
      event: 'error',
      nativeSessionId,
      trackId: 301,
      sourceRevision: 77,
      code,
      recoverable: false,
    })
    await waitFor(() => mediaPlaybackModel.sourceKind() === 'blob')

    expect(sendNativeAudioCommand).toHaveBeenCalledWith({
      command: 'stop',
      nativeSessionId,
    })
    expect(mediaPlaybackModel.driverKind()).toBe('web-audio-element')
    expect(mediaPlaybackModel.nativeSessionId()).toBeNull()
    expect(mediaPlaybackModel.playbackIssue()).toBeNull()
    expect(mediaPlaybackModel.playbackIntent()).toBe('play')
    expect(download).toHaveBeenCalledTimes(1)
    expect(runtimeModeModel.canUseNativeAudioPlayback({transportKind: 'tauri'})).toBe(false)
  })

  it('advances native playback on matching native ended events', async () => {
    enableIosNativeAudio()
    const sendNativeAudioCommand = vi.fn().mockResolvedValue(undefined)
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          sendNativeAudioCommand,
        } as any,
      }),
    )
    await mediaPlaybackModel.startAudioSession(
      [nativeAudioTrack(), nativeAudioTrack({id: 302, sourceRevision: 78})],
      0,
    )
    const nativeSessionId = mediaPlaybackModel.nativeSessionId()
    sendNativeAudioCommand.mockClear()

    mediaPlaybackModel.handleNativeAudioPlayerEvent({
      event: 'ended',
      nativeSessionId,
      trackId: 301,
      sourceRevision: 77,
      index: 0,
    })
    await Promise.resolve()

    expect(mediaPlaybackModel.currentTrack()?.id).toBe(302)
    expect(mediaPlaybackModel.playbackIntent()).toBe('play')
    expect(sendNativeAudioCommand).toHaveBeenCalledWith({
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
