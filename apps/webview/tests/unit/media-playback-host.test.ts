import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {
  MediaPlaybackHost,
  MEDIA_STREAM_LOADABILITY_TIMEOUT_MS,
} from '../../src/features/media/components/media-playback-host'
import {ANDROID_MEDIA_SESSION_CONTROL_EVENT} from '../../src/features/media/models/android-media-session-events'
import {mediaPlaybackModel} from '../../src/features/media/models/media-playback.model'
import {invalidateFileBlobCache} from '../../src/features/media/components/file-loader'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {runtimeModeModel} from '../../src/core/runtime/runtime-mode.model'
import {resetMediaStreamOwnerRegistryForTests} from '../../src/features/media/models/media-stream-owner-registry'
import type {ResolvedAudioTrack} from '../../src/features/media/models/media-playback.model'

const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL
const originalPlay = HTMLMediaElement.prototype.play
const originalPause = HTMLMediaElement.prototype.pause
const originalLoad = HTMLMediaElement.prototype.load

function streamOf(...chunks: Uint8Array[]): AsyncIterable<Uint8Array> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk
      }
    },
  }
}

async function flushHost(host: MediaPlaybackHost): Promise<void> {
  await Promise.resolve()
  await host.updateComplete
}

function setAudioDuration(audio: HTMLAudioElement, duration: number): void {
  Object.defineProperty(audio, 'duration', {
    configurable: true,
    value: duration,
  })
}

async function startBlobAudioSession(): Promise<void> {
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
    [{id: 201, name: 'track.mp3', mimeType: 'audio/mpeg', size: 5}],
    0,
  )
}

function enableAndroidNativeAudio(): void {
  setRuntimeCapabilities({
    platform: 'android',
    mobile: true,
    android_native_audio_playback_rollout_enabled: true,
  })
  runtimeModeModel.setCoreMode('local')
}

function androidAudioTrack(overrides: Partial<ResolvedAudioTrack> = {}): ResolvedAudioTrack {
  return {
    id: 202,
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
    value: vi.fn(() => 'blob:host-audio'),
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  })
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    writable: true,
    value: vi.fn().mockResolvedValue(undefined),
  })
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  })
  Object.defineProperty(HTMLMediaElement.prototype, 'load', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  })
  await mediaPlaybackModel.stopSession()
  resetMediaStreamOwnerRegistryForTests()
  resetRuntimeCapabilities()
  runtimeModeModel.handleTransportDisconnect()
  invalidateFileBlobCache(201)
  invalidateFileBlobCache(202)
  invalidateFileBlobCache(203)
})

afterEach(async () => {
  vi.useRealTimers()
  document.body.innerHTML = ''
  await mediaPlaybackModel.stopSession()
  resetMediaStreamOwnerRegistryForTests()
  resetRuntimeCapabilities()
  runtimeModeModel.handleTransportDisconnect()
  invalidateFileBlobCache(201)
  invalidateFileBlobCache(202)
  invalidateFileBlobCache(203)
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
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    writable: true,
    value: originalPlay,
  })
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
    configurable: true,
    writable: true,
    value: originalPause,
  })
  Object.defineProperty(HTMLMediaElement.prototype, 'load', {
    configurable: true,
    writable: true,
    value: originalLoad,
  })
})

describe('media-playback-host', () => {
  it('syncs model source and playback intent to the audio element', async () => {
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
      [{id: 201, name: 'track.mp3', mimeType: 'audio/mpeg', size: 5}],
      0,
    )

    const host = document.createElement('media-playback-host') as MediaPlaybackHost
    document.body.appendChild(host)
    await flushHost(host)
    const audio = host.shadowRoot?.querySelector('audio') as HTMLAudioElement

    expect(audio.src).toBe('blob:host-audio')

    mediaPlaybackModel.requestPlay()
    await flushHost(host)

    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled()

    audio.dispatchEvent(new Event('play'))
    expect(mediaPlaybackModel.playbackState()).toBe('playing')
  })

  it('applies native playback intent nudges without waiting for a Lit update', async () => {
    await startBlobAudioSession()

    const host = document.createElement('media-playback-host') as MediaPlaybackHost
    document.body.appendChild(host)
    await flushHost(host)

    vi.mocked(HTMLMediaElement.prototype.play).mockClear()
    vi.mocked(HTMLMediaElement.prototype.pause).mockClear()

    mediaPlaybackModel.requestPlay()
    globalThis.dispatchEvent(new CustomEvent(ANDROID_MEDIA_SESSION_CONTROL_EVENT))

    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1)

    mediaPlaybackModel.handleMediaPlay()
    mediaPlaybackModel.requestPause()
    globalThis.dispatchEvent(new CustomEvent(ANDROID_MEDIA_SESSION_CONTROL_EVENT))

    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(1)
  })

  it('applies model seek requests to the audio element', async () => {
    await startBlobAudioSession()

    const host = document.createElement('media-playback-host') as MediaPlaybackHost
    document.body.appendChild(host)
    await flushHost(host)
    const audio = host.shadowRoot?.querySelector('audio') as HTMLAudioElement
    setAudioDuration(audio, 75)
    mediaPlaybackModel.handleMediaTimeUpdate(0, 75)

    mediaPlaybackModel.seekTo(42)
    await flushHost(host)

    expect(audio.currentTime).toBe(42)
    expect(mediaPlaybackModel.currentTime()).toBe(42)
  })

  it('applies repeated same-time seek requests with distinct model ids', async () => {
    await startBlobAudioSession()

    const host = document.createElement('media-playback-host') as MediaPlaybackHost
    document.body.appendChild(host)
    await flushHost(host)
    const audio = host.shadowRoot?.querySelector('audio') as HTMLAudioElement
    setAudioDuration(audio, 75)
    mediaPlaybackModel.handleMediaTimeUpdate(0, 75)

    mediaPlaybackModel.seekTo(42)
    await flushHost(host)
    audio.currentTime = 10

    mediaPlaybackModel.seekTo(42)
    await flushHost(host)

    expect(audio.currentTime).toBe(42)
    expect(mediaPlaybackModel.currentTime()).toBe(42)
  })

  it('keeps pending seek requests unapplied until media duration is available', async () => {
    await startBlobAudioSession()

    const host = document.createElement('media-playback-host') as MediaPlaybackHost
    document.body.appendChild(host)
    await flushHost(host)
    const audio = host.shadowRoot?.querySelector('audio') as HTMLAudioElement
    setAudioDuration(audio, Number.NaN)
    mediaPlaybackModel.handleMediaTimeUpdate(0, 75)

    mediaPlaybackModel.seekTo(42)
    await flushHost(host)

    expect(audio.currentTime).toBe(0)
    expect(mediaPlaybackModel.currentTime()).toBe(42)

    setAudioDuration(audio, 75)
    audio.dispatchEvent(new Event('durationchange'))
    await flushHost(host)

    expect(audio.currentTime).toBe(42)
    expect(mediaPlaybackModel.currentTime()).toBe(42)
  })

  it('disables native streaming after media-stream loadability timeout and reloads blob fallback', async () => {
    vi.useFakeTimers()
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_media_stream_protocol: true,
    })
    runtimeModeModel.setCoreMode('local')
    const prepareMediaStream = vi.fn().mockResolvedValue({
      kind: 'media-stream',
      streamId: 'stream-202',
      url: 'chromvoid-media://localhost/stream-202',
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
      [{id: 202, name: 'track.mp3', mimeType: 'audio/mpeg', size: 100}],
      0,
    )
    expect(mediaPlaybackModel.sourceKind()).toBe('media-stream')

    const host = document.createElement('media-playback-host') as MediaPlaybackHost
    document.body.appendChild(host)
    await flushHost(host)

    await vi.advanceTimersByTimeAsync(MEDIA_STREAM_LOADABILITY_TIMEOUT_MS)
    await Promise.resolve()
    await Promise.resolve()

    expect(releaseMediaStream).toHaveBeenCalledTimes(1)
    expect(download).toHaveBeenCalledTimes(1)
    expect(mediaPlaybackModel.sourceKind()).toBe('blob')
    expect(runtimeModeModel.canUseNativeMediaStream({transportKind: 'tauri'})).toBe(false)
  })

  it('clears the media-stream loadability watchdog after canplay', async () => {
    vi.useFakeTimers()
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_media_stream_protocol: true,
    })
    runtimeModeModel.setCoreMode('local')
    const prepareMediaStream = vi.fn().mockResolvedValue({
      kind: 'media-stream',
      streamId: 'stream-202',
      url: 'chromvoid-media://localhost/stream-202',
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
      [{id: 202, name: 'track.mp3', mimeType: 'audio/mpeg', size: 100}],
      0,
    )

    const host = document.createElement('media-playback-host') as MediaPlaybackHost
    document.body.appendChild(host)
    await flushHost(host)
    const audio = host.shadowRoot?.querySelector('audio') as HTMLAudioElement
    audio.dispatchEvent(new Event('canplay'))

    await vi.advanceTimersByTimeAsync(MEDIA_STREAM_LOADABILITY_TIMEOUT_MS)
    await Promise.resolve()

    expect(releaseMediaStream).not.toHaveBeenCalled()
    expect(download).not.toHaveBeenCalled()
    expect(mediaPlaybackModel.sourceKind()).toBe('media-stream')
  })

  it('clears hidden audio and ignores playback intent while Android Media3 owns playback', async () => {
    await startBlobAudioSession()
    const host = document.createElement('media-playback-host') as MediaPlaybackHost
    document.body.appendChild(host)
    await flushHost(host)
    const audio = host.shadowRoot?.querySelector('audio') as HTMLAudioElement
    expect(audio.getAttribute('src')).toBe('blob:host-audio')

    enableAndroidNativeAudio()
    clearAppContext()
    const sendAndroidAudioCommand = vi.fn().mockResolvedValue(undefined)
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          sendAndroidAudioCommand,
        } as any,
        catalog: {
          api: {
            download: vi.fn(),
          },
        } as any,
      }),
    )
    vi.mocked(HTMLMediaElement.prototype.play).mockClear()
    vi.mocked(HTMLMediaElement.prototype.pause).mockClear()
    vi.mocked(HTMLMediaElement.prototype.load).mockClear()

    await mediaPlaybackModel.startAudioSession([androidAudioTrack({id: 203})], 0)
    await flushHost(host)

    expect(mediaPlaybackModel.driverKind()).toBe('android-media3')
    expect(audio.getAttribute('src')).toBeNull()
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(1)
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalledTimes(1)

    sendAndroidAudioCommand.mockClear()
    mediaPlaybackModel.requestPlay()
    await flushHost(host)
    await Promise.resolve()

    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled()
    expect(sendAndroidAudioCommand).toHaveBeenCalledWith({
      command: 'play',
      nativeSessionId: mediaPlaybackModel.nativeSessionId(),
    })
  })
})
