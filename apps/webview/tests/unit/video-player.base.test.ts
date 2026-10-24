import {afterEach, describe, expect, it, vi} from 'vitest'
import {nothing} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'

const {
  loadFileSourceById,
  isMockTransport,
  FileLoadError,
  isMediaBlobFallbackLimitError,
  writeAndroidUnlockDebugMock,
} = vi.hoisted(() => {
  class MockFileLoadError extends Error {
    constructor(
      readonly code: string,
      message: string,
      readonly details: Record<string, unknown> = {},
    ) {
      super(message)
    }
  }

  return {
    loadFileSourceById: vi.fn(),
    isMockTransport: vi.fn(() => false),
    FileLoadError: MockFileLoadError,
    isMediaBlobFallbackLimitError: (error: unknown) =>
      error instanceof MockFileLoadError && error.code === 'MEDIA_BLOB_FALLBACK_LIMIT',
    writeAndroidUnlockDebugMock: vi.fn(),
  }
})

vi.mock('../../src/features/media/components/file-loader', () => ({
  FileLoadError,
  loadFileSourceById,
  isMockTransport,
  isMediaBlobFallbackLimitError,
}))

vi.mock('root/shared/services/android-unlock-debug', () => ({
  writeAndroidUnlockDebug: writeAndroidUnlockDebugMock,
}))

import {VideoPlayerBase} from '../../src/features/media/components/video-player.base'
import {VideoPlayer} from '../../src/features/media/components/video-player.desktop'
import {VideoPlayerMobile} from '../../src/features/media/components/video-player.mobile'
import {VideoPlayerModel} from '../../src/features/media/components/video-player.model'
import {
  MEDIA_STREAM_LOADABILITY_TIMEOUT_MS,
  REMOTE_MEDIA_STREAM_LOADABILITY_TIMEOUT_MS,
} from '../../src/features/media/models/media-stream-loadability'
import {
  dispatchMediaStreamError,
  releaseAllMediaStreamOwnersForLifecycle,
  resetMediaStreamOwnerRegistryForTests,
} from '../../src/features/media/models/media-stream-owner-registry'
import {resetVideoSourceHandoffForTests} from '../../src/features/media/models/video-source-handoff'
import {VideoPreviewModel} from '../../src/features/media/components/video-preview.model'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {runtimeModeModel} from '../../src/core/runtime/runtime-mode.model'
import {i18n} from '../../src/i18n'

type TestFileSource = {
  kind: 'blob' | 'media-stream' | 'video-source'
  url: string
  delivery?: 'custom-scheme' | 'loopback-http' | 'mse' | 'native-video'
  streamId?: string
  sourceToken?: string
  token?: string
  nativeSourceToken?: string
  size: number
  mimeType: string
  release: ReturnType<typeof vi.fn>
}

class TestVideoPlayer extends VideoPlayerBase {
  currentUrl() {
    return this.videoUrl()
  }

  currentLoading() {
    return this.loading()
  }

  currentFallbackLimited() {
    return this.fallbackLimited()
  }

  currentSourceKind() {
    return this.sourceKind()
  }

  currentSourceDelivery() {
    return this.sourceDelivery()
  }

  currentSourceState() {
    return this.sourceState()
  }

  currentErrorMessage() {
    return this.errorMessage()
  }

  protected override render() {
    const url = this.videoUrl()
    if (this.loading()) return html`<span>loading</span>`
    if (!url) return nothing

    return html`
      <video
        src=${url}
        @loadedmetadata=${this.handleVideoElementReady}
        @canplay=${this.handleVideoElementReady}
        @error=${this.handleVideoElementError}
        @waiting=${this.handleVideoPlaybackEvent}
        @stalled=${this.handleVideoPlaybackEvent}
        @playing=${this.handleVideoPlaybackEvent}
        @pause=${this.handleVideoPlaybackEvent}
        @progress=${this.handleVideoPlaybackEvent}
        @timeupdate=${this.handleVideoPlaybackEvent}
      ></video>
    `
  }
}

class TestVideoPlayerMobile extends VideoPlayerMobile {
  currentLoading() {
    return this.loading()
  }

  currentSourceKind() {
    return this.sourceKind()
  }

  currentSourceDelivery() {
    return this.sourceDelivery()
  }
}

if (!customElements.get('test-video-player')) {
  customElements.define('test-video-player', TestVideoPlayer)
}
if (!customElements.get('test-video-player-mobile')) {
  customElements.define('test-video-player-mobile', TestVideoPlayerMobile)
}
VideoPlayerMobile.define()
VideoPlayer.define()

const originalMediaElementPlay = HTMLMediaElement.prototype.play

function mockMediaElementPlay(playMock: ReturnType<typeof vi.fn>) {
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    writable: true,
    value: playMock,
  })
}

function defineBufferedRange(video: HTMLVideoElement, start: number, end: number) {
  Object.defineProperty(video, 'buffered', {
    configurable: true,
    value: {
      length: 1,
      start: () => start,
      end: () => end,
    },
  })
}

function createFileSource(url: string, overrides: Partial<TestFileSource> = {}): TestFileSource {
  return {
    kind: 'blob',
    url,
    size: 1,
    mimeType: 'video/mp4',
    release: vi.fn(),
    ...overrides,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return {promise, resolve, reject}
}

async function flushAsync(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

function appendOpenPlayer(fileId: number, fileName: string, sourceSize = 42): TestVideoPlayer {
  const element = document.createElement('test-video-player') as TestVideoPlayer
  element.fileId = fileId
  element.fileName = fileName
  element.mimeType = 'video/mp4'
  element.sourceSize = sourceSize
  element.open = true
  document.body.appendChild(element)
  return element
}

function appendOpenMobilePlayer(fileId: number, fileName: string, sourceSize = 42): TestVideoPlayerMobile {
  const element = document.createElement('test-video-player-mobile') as TestVideoPlayerMobile
  element.fileId = fileId
  element.fileName = fileName
  element.mimeType = 'video/mp4'
  element.sourceSize = sourceSize
  element.open = true
  document.body.appendChild(element)
  return element
}

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
  clearAppContext()
  resetMediaStreamOwnerRegistryForTests()
  resetVideoSourceHandoffForTests()
  resetRuntimeCapabilities()
  runtimeModeModel.handleTransportDisconnect()
  loadFileSourceById.mockReset()
  isMockTransport.mockReset()
  isMockTransport.mockReturnValue(false)
  writeAndroidUnlockDebugMock.mockReset()
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    writable: true,
    value: originalMediaElementPlay,
  })
  vi.restoreAllMocks()
})

describe('video-player base media stream lifecycle', () => {
  it('writes persistent video playback debug events for source lifecycle', async () => {
    const streamSource = createFileSource('chromvoid-media://localhost/player-debug', {
      kind: 'media-stream',
      streamId: 'player-debug-stream',
      sourceRevision: 9,
      size: 2048,
    })
    loadFileSourceById.mockResolvedValueOnce(streamSource)

    const element = appendOpenPlayer(40, 'debug-player.mp4', 2048)

    await vi.waitFor(() => {
      expect(element.currentSourceKind()).toBe('media-stream')
      expect(element.currentLoading()).toBe(false)
    })

    expect(writeAndroidUnlockDebugMock).toHaveBeenCalledWith(
      'media-playback/video',
      'loadRequested',
      expect.objectContaining({
        fileId: 40,
        mimeType: 'video/mp4',
        sourceSize: 2048,
      }),
    )
    expect(writeAndroidUnlockDebugMock).toHaveBeenCalledWith(
      'media-playback/video',
      'sourceResolved',
      expect.objectContaining({
        fileId: 40,
        sourceKind: 'media-stream',
        sourceRevision: 9,
        hasStreamId: true,
        hasToken: false,
      }),
    )
    expect(writeAndroidUnlockDebugMock).toHaveBeenCalledWith(
      'media-telemetry',
      'media.source.prepare.start',
      expect.objectContaining({
        fileId: 40,
        mimeType: 'video/mp4',
        sourceSize: 2048,
      }),
    )
    expect(writeAndroidUnlockDebugMock).toHaveBeenCalledWith(
      'media-telemetry',
      'media.source.prepare.ready',
      expect.objectContaining({
        fileId: 40,
        sourceKind: 'media-stream',
        sourceRevision: 9,
        hasStreamId: true,
        hasToken: false,
      }),
    )
    expect(writeAndroidUnlockDebugMock).toHaveBeenCalledWith(
      'media-telemetry',
      'media.delivery.selected',
      expect.objectContaining({
        fileId: 40,
        sourceKind: 'media-stream',
        sourceRevision: 9,
        hasStreamId: true,
        hasToken: false,
      }),
    )

    await element.updateComplete
    element.shadowRoot?.querySelector('video')?.dispatchEvent(new Event('loadedmetadata'))

    expect(writeAndroidUnlockDebugMock).toHaveBeenCalledWith(
      'media-playback/video',
      'elementReady',
      expect.objectContaining({
        fileId: 40,
        sourceKind: 'media-stream',
        hasStreamId: true,
      }),
    )
    expect(writeAndroidUnlockDebugMock).toHaveBeenCalledWith(
      'media-telemetry',
      'media.playback.metadata',
      expect.objectContaining({
        fileId: 40,
        sourceKind: 'media-stream',
        hasStreamId: true,
      }),
    )
  })

  it('samples playback telemetry and throttles duplicate media events', async () => {
    const streamSource = createFileSource('http://127.0.0.1:49152/media/player-telemetry', {
      kind: 'media-stream',
      streamId: 'player-telemetry-stream',
      delivery: 'loopback-http',
      sourceRevision: 10,
      size: 4096,
    })
    loadFileSourceById.mockResolvedValueOnce(streamSource)

    const element = appendOpenPlayer(41, 'telemetry-player.mp4', 4096)

    await vi.waitFor(() => {
      expect(element.currentSourceKind()).toBe('media-stream')
      expect(element.currentLoading()).toBe(false)
    })
    await element.updateComplete

    vi.useFakeTimers()
    const video = element.shadowRoot?.querySelector('video') as HTMLVideoElement
    expect(video).toBeTruthy()
    video.currentTime = 2
    Object.defineProperty(video, 'duration', {configurable: true, value: 5})
    Object.defineProperty(video, 'readyState', {configurable: true, value: 3})
    Object.defineProperty(video, 'networkState', {configurable: true, value: 2})
    Object.defineProperty(video, 'paused', {configurable: true, value: false})
    Object.defineProperty(video, 'buffered', {
      configurable: true,
      value: {
        length: 1,
        start: () => 1,
        end: () => 4,
      },
    })
    Object.defineProperty(video, 'getVideoPlaybackQuality', {
      configurable: true,
      value: () => ({
        droppedVideoFrames: 3,
        totalVideoFrames: 120,
        corruptedVideoFrames: 1,
      }),
    })

    video.dispatchEvent(new Event('loadedmetadata'))

    expect(writeAndroidUnlockDebugMock).toHaveBeenCalledWith(
      'media-playback/video',
      'playbackTelemetry',
      expect.objectContaining({
        fileId: 41,
        sourceKind: 'media-stream',
        sourceDelivery: 'loopback-http',
        currentTimeMs: 2000,
        durationMs: 5000,
        bufferedAheadMs: 2000,
        droppedVideoFrames: 3,
        totalVideoFrames: 120,
      }),
    )
    expect(writeAndroidUnlockDebugMock).toHaveBeenCalledWith(
      'media-telemetry',
      'media.playback.dropped_frames',
      expect.objectContaining({
        fileId: 41,
        sourceDelivery: 'loopback-http',
        droppedVideoFrames: 3,
        totalVideoFrames: 120,
      }),
    )

    const waitingEvents = () =>
      writeAndroidUnlockDebugMock.mock.calls.filter(([, event, payload]) => {
        const record = payload as {eventName?: unknown}
        return event === 'playbackEvent' && record.eventName === 'waiting'
      })

    video.dispatchEvent(new Event('waiting'))
    video.dispatchEvent(new Event('waiting'))
    expect(waitingEvents()).toHaveLength(1)
    expect(writeAndroidUnlockDebugMock).toHaveBeenCalledWith(
      'media-telemetry',
      'media.playback.buffering',
      expect.objectContaining({
        eventName: 'waiting',
        sourceDelivery: 'loopback-http',
      }),
    )

    vi.advanceTimersByTime(300)
    video.dispatchEvent(new Event('waiting'))
    expect(waitingEvents()).toHaveLength(2)

    video.dispatchEvent(new Event('playing'))
    video.dispatchEvent(new Event('pause'))
    expect(writeAndroidUnlockDebugMock).toHaveBeenCalledWith(
      'media-telemetry',
      'media.playback.playing',
      expect.objectContaining({
        eventName: 'playing',
        sourceDelivery: 'loopback-http',
      }),
    )
    expect(writeAndroidUnlockDebugMock).toHaveBeenCalledWith(
      'media-telemetry',
      'media.playback.paused',
      expect.objectContaining({
        eventName: 'pause',
        sourceDelivery: 'loopback-http',
      }),
    )

    vi.advanceTimersByTime(1000)
    expect(writeAndroidUnlockDebugMock).toHaveBeenCalledWith(
      'media-playback/video',
      'playbackTelemetry',
      expect.objectContaining({
        sampleReason: 'sample',
        sourceDelivery: 'loopback-http',
      }),
    )

    document.body.removeChild(element)
    vi.advanceTimersByTime(2000)
    const sampleCountAfterTeardown = writeAndroidUnlockDebugMock.mock.calls.filter(([, event, payload]) => {
      const record = payload as {sampleReason?: unknown}
      return event === 'playbackTelemetry' && record.sampleReason === 'sample'
    }).length
    vi.advanceTimersByTime(2000)
    const finalSampleCount = writeAndroidUnlockDebugMock.mock.calls.filter(([, event, payload]) => {
      const record = payload as {sampleReason?: unknown}
      return event === 'playbackTelemetry' && record.sampleReason === 'sample'
    }).length
    expect(finalSampleCount).toBe(sampleCountAfterTeardown)
  })

  it('registers the active stream owner and falls back to blob after range-required errors', async () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_media_stream_protocol: true,
    })
    runtimeModeModel.setCoreMode('local')
    const streamSource = createFileSource('chromvoid-media://localhost/player-stream', {
      kind: 'media-stream',
      streamId: 'player-stream',
    })
    const blobSource = createFileSource('blob:player-fallback')
    loadFileSourceById.mockResolvedValueOnce(streamSource).mockResolvedValueOnce(blobSource)

    const element = appendOpenPlayer(41, 'player.mp4')

    await vi.waitFor(() => {
      expect(element.currentUrl()).toBe('chromvoid-media://localhost/player-stream')
      expect(element.currentLoading()).toBe(false)
    })

    dispatchMediaStreamError({
      streamId: 'player-stream',
      code: 'ERR_MEDIA_RANGE_REQUIRED',
      httpStatus: 416,
      nodeId: 41,
      sourceRevision: 4,
    })

    await vi.waitFor(() => {
      expect(element.currentUrl()).toBe('blob:player-fallback')
    })

    expect(streamSource.release).toHaveBeenCalledOnce()
    expect(blobSource.release).not.toHaveBeenCalled()
    expect(loadFileSourceById).toHaveBeenCalledTimes(2)
    expect(runtimeModeModel.canUseNativeMediaStream({transportKind: 'tauri'})).toBe(false)
  })

  it('clears the native loadability watchdog after video metadata loads', async () => {
    vi.useFakeTimers()
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_media_stream_protocol: true,
    })
    runtimeModeModel.setCoreMode('local')
    const streamSource = createFileSource('chromvoid-media://localhost/player-ready', {
      kind: 'media-stream',
      streamId: 'player-ready',
    })
    const blobSource = createFileSource('blob:should-not-load')
    loadFileSourceById.mockResolvedValueOnce(streamSource).mockResolvedValueOnce(blobSource)

    const element = appendOpenPlayer(42, 'ready.mp4')

    await vi.waitFor(() => {
      expect(element.currentUrl()).toBe('chromvoid-media://localhost/player-ready')
    })
    await element.updateComplete

    const video = element.shadowRoot?.querySelector('video')
    video?.dispatchEvent(new Event('loadedmetadata'))

    await vi.advanceTimersByTimeAsync(MEDIA_STREAM_LOADABILITY_TIMEOUT_MS)

    expect(loadFileSourceById).toHaveBeenCalledTimes(1)
    expect(streamSource.release).not.toHaveBeenCalled()
    expect(element.currentUrl()).toBe('chromvoid-media://localhost/player-ready')
    expect(runtimeModeModel.canUseNativeMediaStream({transportKind: 'tauri'})).toBe(true)
  })

  it('keeps remote media streams attached after the loadability timeout', async () => {
    vi.useFakeTimers()
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_media_stream_protocol: true,
    })
    runtimeModeModel.setCoreMode({remote: {host: {type: 'mobile_usb', host_id: 'host-1'}}})
    const streamSource = createFileSource('chromvoid-media://localhost/remote-player-stream', {
      kind: 'media-stream',
      streamId: 'remote-player-stream',
    })
    const blobSource = createFileSource('blob:remote-should-not-load')
    loadFileSourceById.mockResolvedValueOnce(streamSource).mockResolvedValueOnce(blobSource)

    const element = appendOpenPlayer(49, 'remote-player.mp4', 80 * 1024 * 1024)

    await vi.waitFor(() => {
      expect(element.currentUrl()).toBe('chromvoid-media://localhost/remote-player-stream')
      expect(element.currentSourceKind()).toBe('media-stream')
    })

    await vi.advanceTimersByTimeAsync(REMOTE_MEDIA_STREAM_LOADABILITY_TIMEOUT_MS)
    await flushAsync()

    expect(loadFileSourceById).toHaveBeenCalledTimes(1)
    expect(streamSource.release).not.toHaveBeenCalled()
    expect(element.currentUrl()).toBe('chromvoid-media://localhost/remote-player-stream')
    expect(element.currentFallbackLimited()).toBe(false)
    expect(runtimeModeModel.canUseMediaStreamSource({transportKind: 'tauri'})).toBe(true)
  })

  it('classifies video-source loadability timeout as source-starved without legacy fallback', async () => {
    vi.useFakeTimers()
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_media_http_stream: true,
    })
    runtimeModeModel.setCoreMode('local')
    const streamSource = createFileSource('http://127.0.0.1:49152/media/starved-video-source', {
      kind: 'video-source',
      delivery: 'loopback-http',
      streamId: 'starved-video-source',
      sourceToken: 'starved-video-source',
      size: 4096,
    })
    const blobSource = createFileSource('blob:should-not-load')
    loadFileSourceById.mockResolvedValueOnce(streamSource).mockResolvedValueOnce(blobSource)

    const element = appendOpenPlayer(50, 'starved.mp4', 4096)

    await vi.waitFor(() => {
      expect(element.currentSourceKind()).toBe('video-source')
      expect(element.currentSourceDelivery()).toBe('loopback-http')
    })

    await vi.advanceTimersByTimeAsync(MEDIA_STREAM_LOADABILITY_TIMEOUT_MS)

    await vi.waitFor(() => {
      expect(streamSource.release).toHaveBeenCalledOnce()
      expect(element.currentSourceKind()).toBe('none')
      expect(element.currentSourceState()).toEqual({state: 'failed', reason: 'source-starved'})
      expect(element.currentErrorMessage()).toBe(i18n('media:video-load-failed' as any))
    })
    expect(loadFileSourceById).toHaveBeenCalledTimes(1)
    expect(blobSource.release).not.toHaveBeenCalled()
    expect(writeAndroidUnlockDebugMock).toHaveBeenCalledWith(
      'media-telemetry',
      'media.source.starved',
      expect.objectContaining({
        fileId: 50,
        reason: 'loadability-timeout',
        sourceKind: 'video-source',
        sourceDelivery: 'loopback-http',
      }),
    )
  })

  it('shows a load error for remote stream element errors without falling back to blob', async () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_media_stream_protocol: true,
    })
    runtimeModeModel.setCoreMode({remote: {host: {type: 'mobile_usb', host_id: 'host-1'}}})
    const streamSource = createFileSource('chromvoid-media://localhost/remote-error-stream', {
      kind: 'media-stream',
      streamId: 'remote-error-stream',
    })
    const blobSource = createFileSource('blob:remote-error-should-not-load')
    loadFileSourceById.mockResolvedValueOnce(streamSource).mockResolvedValueOnce(blobSource)

    const element = appendOpenPlayer(50, 'remote-error.mp4', 80 * 1024 * 1024)

    await vi.waitFor(() => {
      expect(element.currentSourceKind()).toBe('media-stream')
    })
    await element.updateComplete

    const video = element.shadowRoot?.querySelector('video')
    video?.dispatchEvent(new Event('error'))

    await vi.waitFor(() => {
      expect(element.currentSourceKind()).toBe('none')
      expect(element.currentErrorMessage()).toBe(i18n('media:video-load-failed' as any))
    })

    expect(streamSource.release).toHaveBeenCalledOnce()
    expect(loadFileSourceById).toHaveBeenCalledTimes(1)
    expect(element.currentFallbackLimited()).toBe(false)
    expect(runtimeModeModel.canUseMediaStreamSource({transportKind: 'tauri'})).toBe(true)
  })

  it('ignores stale successful player loads after file switch', async () => {
    const firstLoad = deferred<TestFileSource>()
    const secondLoad = deferred<TestFileSource>()
    const staleSource = createFileSource('blob:stale-player')
    const freshSource = createFileSource('blob:fresh-player')
    loadFileSourceById
      .mockImplementationOnce(() => firstLoad.promise)
      .mockImplementationOnce(() => secondLoad.promise)

    const element = appendOpenPlayer(47, 'old-player.mp4')
    await flushAsync()

    element.fileId = 48
    element.fileName = 'fresh-player.mp4'
    await element.updateComplete
    await flushAsync()

    secondLoad.resolve(freshSource)
    await flushAsync()
    firstLoad.resolve(staleSource)
    await flushAsync()

    expect(element.currentUrl()).toBe('blob:fresh-player')
    expect(element.currentLoading()).toBe(false)
    expect(staleSource.release).toHaveBeenCalledOnce()
    expect(freshSource.release).not.toHaveBeenCalled()
  })

  it('surfaces fallback-limited state when blob fallback is over the source size limit', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    loadFileSourceById.mockRejectedValueOnce(
      new FileLoadError('MEDIA_BLOB_FALLBACK_LIMIT', 'MEDIA_BLOB_FALLBACK_LIMIT:67108865:67108864'),
    )

    const element = appendOpenPlayer(43, 'large.mp4', 67_108_865)

    await vi.waitFor(() => {
      expect(element.currentLoading()).toBe(false)
      expect(element.currentFallbackLimited()).toBe(true)
    })

    expect(element.currentUrl()).toBeNull()
    expect(element.currentSourceState()).toEqual({state: 'fallback-limited', reason: 'fallback-limited'})
    expect(loadFileSourceById).toHaveBeenLastCalledWith(
      43,
      'large.mp4',
      expect.objectContaining({
        sourceSize: 67_108_865,
        variant: 'raw',
      }),
    )
  })

  it('surfaces typed provider-unavailable state for video-source failures', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    loadFileSourceById.mockRejectedValueOnce(
      new FileLoadError('MEDIA_VIDEO_PROVIDER_UNAVAILABLE', 'MEDIA_VIDEO_PROVIDER_UNAVAILABLE', {
        reason: 'provider-unavailable',
      }),
    )

    const element = appendOpenPlayer(49, 'provider-unavailable.mp4', 80 * 1024 * 1024)

    await vi.waitFor(() => {
      expect(element.currentLoading()).toBe(false)
      expect(element.currentSourceState()).toEqual({state: 'failed', reason: 'provider-unavailable'})
    })

    expect(element.currentUrl()).toBeNull()
    expect(element.currentFallbackLimited()).toBe(false)
    expect(element.currentErrorMessage()).toBe(i18n('media:video-load-failed' as any))
  })

  it('keeps the mobile webview blank while native video is playing', async () => {
    const nativeSource = createFileSource('', {
      kind: 'video-source',
      delivery: 'native-video',
      streamId: 'stream-blank-video',
      sourceToken: 'stream-blank-video',
      nativeSourceToken: 'blank-native-video-token',
      size: 100,
    })
    loadFileSourceById.mockResolvedValueOnce(nativeSource)

    const element = appendOpenMobilePlayer(46, 'native-blank.mp4', 100)

    await vi.waitFor(() => {
      expect(element.currentLoading()).toBe(false)
      expect(element.currentSourceKind()).toBe('video-source')
      expect(element.currentSourceDelivery()).toBe('native-video')
    })
    await element.updateComplete

    const root = element.shadowRoot
    expect(root?.querySelector('.overlay')).toBeNull()
    expect(root?.querySelector('.fallback-card')).toBeNull()
    expect(root?.textContent ?? '').not.toContain(i18n('media:video-native-playing' as any))
    expect(nativeSource.release).not.toHaveBeenCalled()
  })

  it('renders load errors instead of leaving the native player overlay blank', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    loadFileSourceById.mockRejectedValueOnce(new Error('native video failed'))
    const element = document.createElement('video-player-mobile') as VideoPlayerMobile
    element.fileId = 46
    element.fileName = 'native-failure.mp4'
    element.mimeType = 'video/mp4'
    element.sourceSize = 100
    element.open = true
    document.body.appendChild(element)

    await vi.waitFor(() => {
      const text = element.shadowRoot?.textContent ?? ''
      expect(text).toContain(i18n('media:video-load-failed' as any))
      expect(text).toContain(i18n('media:video-error-copy' as any))
    })
  })
})

describe('video-player model-driven startup (SPEC-231)', () => {
  it('renders the desktop player video without autoplay and with preload=auto', async () => {
    const blobSource = createFileSource('blob:desktop-template')
    loadFileSourceById.mockResolvedValueOnce(blobSource)
    const element = document.createElement('video-player') as VideoPlayer
    element.fileId = 62
    element.fileName = 'template.mp4'
    element.mimeType = 'video/mp4'
    element.sourceSize = 42
    element.open = true
    document.body.appendChild(element)

    await vi.waitFor(() => {
      expect(element.shadowRoot?.querySelector('video')).toBeTruthy()
    })

    const video = element.shadowRoot!.querySelector('video')!
    expect(video.hasAttribute('autoplay')).toBe(false)
    expect(video.getAttribute('preload')).toBe('auto')
  })

  it('starts playback exactly once when the startup buffer budget is reached', async () => {
    const playMock = vi.fn().mockResolvedValue(undefined)
    mockMediaElementPlay(playMock)
    const streamSource = createFileSource('http://127.0.0.1:49152/media/startup', {
      kind: 'media-stream',
      delivery: 'loopback-http',
      streamId: 'startup-stream',
      size: 4096,
    })
    loadFileSourceById.mockResolvedValueOnce(streamSource)

    const element = appendOpenPlayer(60, 'startup.mp4', 4096)
    await vi.waitFor(() => {
      expect(element.currentLoading()).toBe(false)
    })
    await element.updateComplete
    const video = element.shadowRoot?.querySelector('video') as HTMLVideoElement
    expect(video).toBeTruthy()
    video.dispatchEvent(new Event('loadedmetadata'))
    expect(playMock).not.toHaveBeenCalled()

    defineBufferedRange(video, 0, 1)
    video.dispatchEvent(new Event('progress'))
    expect(playMock).not.toHaveBeenCalled()

    defineBufferedRange(video, 0, 5)
    video.dispatchEvent(new Event('progress'))
    expect(playMock).toHaveBeenCalledTimes(1)

    video.dispatchEvent(new Event('progress'))
    expect(playMock).toHaveBeenCalledTimes(1)
  })

  it('keeps the paused UI state when the startup play() attempt is rejected', async () => {
    const playMock = vi
      .fn()
      .mockRejectedValue(new DOMException('play() blocked by autoplay policy', 'NotAllowedError'))
    mockMediaElementPlay(playMock)
    const streamSource = createFileSource('http://127.0.0.1:49152/media/blocked', {
      kind: 'media-stream',
      delivery: 'loopback-http',
      streamId: 'blocked-stream',
      size: 4096,
    })
    loadFileSourceById.mockResolvedValueOnce(streamSource)

    const element = appendOpenPlayer(61, 'blocked.mp4', 4096)
    await vi.waitFor(() => {
      expect(element.currentLoading()).toBe(false)
    })
    await element.updateComplete
    const video = element.shadowRoot?.querySelector('video') as HTMLVideoElement
    video.dispatchEvent(new Event('loadedmetadata'))

    defineBufferedRange(video, 0, 6)
    video.dispatchEvent(new Event('progress'))
    expect(playMock).toHaveBeenCalledTimes(1)
    await flushAsync()

    expect(element.currentErrorMessage()).toBe('')
    expect(element.currentSourceKind()).toBe('media-stream')
    expect(element.currentLoading()).toBe(false)
    expect(streamSource.release).not.toHaveBeenCalled()
  })
})

describe('video-player error routing and typed failure states', () => {
  it('routes native stream errors to loopback video-source owners by streamId', async () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_media_http_stream: true,
    })
    runtimeModeModel.setCoreMode('local')
    const streamSource = createFileSource('http://127.0.0.1:49152/media/owner-key', {
      kind: 'video-source',
      delivery: 'loopback-http',
      streamId: 'owner-key-stream',
      sourceToken: 'owner-key-source-token',
      size: 4096,
    })
    loadFileSourceById.mockResolvedValueOnce(streamSource)

    const element = appendOpenPlayer(63, 'owner-key.mp4', 4096)
    await vi.waitFor(() => {
      expect(element.currentSourceKind()).toBe('video-source')
    })

    dispatchMediaStreamError({
      streamId: 'owner-key-stream',
      code: 'ERR_MEDIA_RANGE_READ_FAILED',
      httpStatus: 500,
      nodeId: 63,
      sourceRevision: 2,
    })

    await vi.waitFor(() => {
      expect(element.currentSourceKind()).toBe('none')
      expect(element.currentSourceState()).toEqual({
        state: 'failed',
        reason: 'playback-backend-failure',
      })
      expect(element.currentErrorMessage()).toBe(i18n('media:video-load-failed' as any))
    })
    expect(streamSource.release).toHaveBeenCalledOnce()
    expect(loadFileSourceById).toHaveBeenCalledTimes(1)
  })

  it('fails only the file on decode errors without quarantining the media stack', async () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_media_stream_protocol: true,
    })
    runtimeModeModel.setCoreMode('local')
    const streamSource = createFileSource('chromvoid-media://localhost/decode-error', {
      kind: 'media-stream',
      streamId: 'decode-error-stream',
    })
    const blobSource = createFileSource('blob:decode-error-should-not-load')
    loadFileSourceById.mockResolvedValueOnce(streamSource).mockResolvedValueOnce(blobSource)

    const element = appendOpenPlayer(64, 'corrupt.mp4', 4096)
    await vi.waitFor(() => {
      expect(element.currentSourceKind()).toBe('media-stream')
    })
    await element.updateComplete

    const video = element.shadowRoot?.querySelector('video') as HTMLVideoElement
    Object.defineProperty(video, 'error', {
      configurable: true,
      value: {code: 3}, // MEDIA_ERR_DECODE
    })
    video.dispatchEvent(new Event('error'))

    await vi.waitFor(() => {
      expect(element.currentSourceKind()).toBe('none')
      expect(element.currentSourceState()).toEqual({
        state: 'unsupported',
        reason: 'unsupported-codec',
      })
    })
    expect(streamSource.release).toHaveBeenCalledOnce()
    expect(blobSource.release).not.toHaveBeenCalled()
    expect(loadFileSourceById).toHaveBeenCalledTimes(1)
    expect(runtimeModeModel.canUseNativeMediaStream({transportKind: 'tauri'})).toBe(true)
  })

  it('does not restart playback when a catalog refresh rebuilds identical mediaInfo', async () => {
    const firstSource = createFileSource('blob:first-info')
    const secondSource = createFileSource('blob:second-info')
    loadFileSourceById.mockResolvedValueOnce(firstSource).mockResolvedValueOnce(secondSource)

    const model = new VideoPlayerModel()
    const mediaInfo = {
      kind: 'video' as const,
      audioTracks: 1,
      videoTracks: 1,
      codecString: 'avc1.640028',
      mseFragmented: true,
      initSegment: {offset: 0, length: 8},
      mediaSegments: [{offset: 8, length: 16, timestampUs: 0}],
    }
    model.setFile({
      fileId: 71,
      fileName: 'stable.mp4',
      mimeType: 'video/mp4',
      mediaInfo,
      sourceSize: 24,
    })
    await vi.waitFor(() => {
      expect(model.videoUrl()).toBe('blob:first-info')
    })

    model.setFile({
      fileId: 71,
      fileName: 'stable.mp4',
      mimeType: 'video/mp4',
      mediaInfo: JSON.parse(JSON.stringify(mediaInfo)),
      sourceSize: 24,
    })
    await flushAsync()
    expect(loadFileSourceById).toHaveBeenCalledTimes(1)
    expect(model.videoUrl()).toBe('blob:first-info')
    expect(firstSource.release).not.toHaveBeenCalled()

    model.setFile({
      fileId: 71,
      fileName: 'stable.mp4',
      mimeType: 'video/mp4',
      mediaInfo: {...JSON.parse(JSON.stringify(mediaInfo)), durationMs: 5000},
      sourceSize: 24,
    })
    await vi.waitFor(() => {
      expect(model.videoUrl()).toBe('blob:second-info')
    })
    expect(loadFileSourceById).toHaveBeenCalledTimes(2)
    model.cleanup()
  })

  it('re-attempts a failed load when setFile is called with identical inputs', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    loadFileSourceById
      .mockRejectedValueOnce(new Error('backend down'))
      .mockResolvedValueOnce(createFileSource('blob:retried-player'))

    const model = new VideoPlayerModel()
    const input = {fileId: 72, fileName: 'retry.mp4', mimeType: 'video/mp4', sourceSize: 10}
    model.setFile(input)
    await vi.waitFor(() => {
      expect(model.sourceState()).toEqual({state: 'failed', reason: 'playback-backend-failure'})
    })

    model.setFile({...input})
    await vi.waitFor(() => {
      expect(model.videoUrl()).toBe('blob:retried-player')
    })
    expect(loadFileSourceById).toHaveBeenCalledTimes(2)
    model.cleanup()
  })

  it('does not attach a stream prepared while a lifecycle release aborted the load', async () => {
    const pending = deferred<TestFileSource>()
    loadFileSourceById.mockImplementationOnce(() => pending.promise)

    const model = new VideoPlayerModel()
    model.setFile({fileId: 70, fileName: 'inflight.mp4', mimeType: 'video/mp4', sourceSize: 100})
    await flushAsync()

    await releaseAllMediaStreamOwnersForLifecycle('vault-lock', {nodeId: 70})

    const lateSource = createFileSource('chromvoid-media://localhost/late-player', {
      kind: 'media-stream',
      streamId: 'late-player',
    })
    pending.resolve(lateSource)
    await flushAsync()

    expect(lateSource.release).toHaveBeenCalledOnce()
    expect(model.videoUrl()).toBeNull()
    expect(model.sourceKind()).toBe('none')
    model.cleanup()
  })
})

describe('video-player playback telemetry', () => {
  it('treats canplay as telemetry-only and keeps rapid play/pause traces', async () => {
    loadFileSourceById.mockResolvedValueOnce(createFileSource('blob:telemetry-events'))
    const model = new VideoPlayerModel()
    model.setFile({fileId: 73, fileName: 'events.mp4', mimeType: 'video/mp4', sourceSize: 10})
    await vi.waitFor(() => {
      expect(model.videoUrl()).toBe('blob:telemetry-events')
    })

    const video = document.createElement('video')
    const telemetryEvents = (name: string) =>
      writeAndroidUnlockDebugMock.mock.calls.filter(
        ([scope, event]) => scope === 'media-telemetry' && event === name,
      )

    model.handleVideoPlaybackEvent('canplay', video)
    expect(telemetryEvents('media.playback.buffering')).toHaveLength(0)

    model.handleVideoPlaybackEvent('waiting', video)
    expect(telemetryEvents('media.playback.buffering')).toHaveLength(1)

    model.handleVideoPlaybackEvent('playing', video)
    model.handleVideoPlaybackEvent('pause', video)
    model.handleVideoPlaybackEvent('playing', video)

    expect(telemetryEvents('media.playback.playing')).toHaveLength(2)
    expect(telemetryEvents('media.playback.paused')).toHaveLength(1)
    expect(telemetryEvents('media.playback.first_frame')).toHaveLength(1)
    model.cleanup()
  })

  it('emits dropped_frames only on positive deltas between samples', async () => {
    vi.useFakeTimers()
    loadFileSourceById.mockResolvedValueOnce(createFileSource('blob:dropped-frames'))
    const model = new VideoPlayerModel()
    model.setFile({fileId: 74, fileName: 'dropped.mp4', mimeType: 'video/mp4', sourceSize: 10})
    await flushAsync()
    expect(model.videoUrl()).toBe('blob:dropped-frames')

    const video = document.createElement('video')
    let droppedVideoFrames = 3
    Object.defineProperty(video, 'getVideoPlaybackQuality', {
      configurable: true,
      value: () => ({
        droppedVideoFrames,
        totalVideoFrames: 100,
        corruptedVideoFrames: 0,
      }),
    })
    const droppedEvents = () =>
      writeAndroidUnlockDebugMock.mock.calls.filter(
        ([scope, event]) => scope === 'media-telemetry' && event === 'media.playback.dropped_frames',
      )

    model.handleVideoElementReady(video)
    expect(droppedEvents()).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(1000)
    expect(droppedEvents()).toHaveLength(1)

    droppedVideoFrames = 5
    await vi.advanceTimersByTimeAsync(1000)
    expect(droppedEvents()).toHaveLength(2)
    model.cleanup()
  })
})

describe('video-player prepared-source handoff', () => {
  it('reuses the preview-prepared source without a second prepare RPC', async () => {
    const previewSource = createFileSource('http://127.0.0.1:49152/media/handoff', {
      kind: 'video-source',
      delivery: 'loopback-http',
      streamId: 'handoff-stream',
      sourceToken: 'handoff-stream',
    })
    loadFileSourceById.mockResolvedValueOnce(previewSource)

    const preview = new VideoPreviewModel()
    preview.setFile(70, 'clip.mp4', {mimeType: 'video/mp4', lastModified: 111})
    await vi.waitFor(() => {
      expect(preview.sourceKind()).toBe('video-source')
    })
    expect(loadFileSourceById).toHaveBeenCalledTimes(1)

    const player = new VideoPlayerModel()
    player.setFile({fileId: 70, fileName: 'clip.mp4', mimeType: 'video/mp4', lastModified: 111})

    // No second prepare RPC: the player claimed the preview's source.
    expect(loadFileSourceById).toHaveBeenCalledTimes(1)
    expect(player.videoUrl()).toBe('http://127.0.0.1:49152/media/handoff')
    expect(player.sourceKind()).toBe('video-source')
    expect(player.sourceDelivery()).toBe('loopback-http')
    expect(player.loading()).toBe(false)

    // The preview's release becomes a no-op after the handoff.
    preview.cleanup()
    expect(previewSource.release).not.toHaveBeenCalled()

    // The player now owns release responsibility.
    player.cleanup()
    expect(previewSource.release).toHaveBeenCalledOnce()
  })

  it('falls back to a fresh prepare when node identity does not match', async () => {
    const previewSource = createFileSource('http://127.0.0.1:49152/media/mismatch', {
      kind: 'video-source',
      delivery: 'loopback-http',
      streamId: 'mismatch-stream',
      sourceToken: 'mismatch-stream',
    })
    loadFileSourceById.mockResolvedValueOnce(previewSource)

    const preview = new VideoPreviewModel()
    preview.setFile(71, 'clip.mp4', {mimeType: 'video/mp4', lastModified: 111})
    await vi.waitFor(() => {
      expect(preview.sourceKind()).toBe('video-source')
    })

    const freshSource = createFileSource('blob:fresh-player')
    loadFileSourceById.mockResolvedValueOnce(freshSource)

    const player = new VideoPlayerModel()
    player.setFile({fileId: 71, fileName: 'clip.mp4', mimeType: 'video/mp4', lastModified: 222})

    await vi.waitFor(() => {
      expect(player.videoUrl()).toBe('blob:fresh-player')
    })
    expect(loadFileSourceById).toHaveBeenCalledTimes(2)

    // The preview keeps release responsibility for its unclaimed source.
    preview.cleanup()
    expect(previewSource.release).toHaveBeenCalledOnce()

    player.cleanup()
    expect(freshSource.release).toHaveBeenCalledOnce()
  })

  it('falls back to a fresh prepare on a stale source revision', async () => {
    initAppContext(
      createMockAppContext({
        catalog: {
          catalog: {
            getNode: () => ({sourceRevision: 6}),
          },
        } as any,
      }),
    )

    const previewSource = createFileSource('http://127.0.0.1:49152/media/stale', {
      kind: 'video-source',
      delivery: 'loopback-http',
      streamId: 'stale-stream',
      sourceToken: 'stale-stream',
      sourceRevision: 5,
    })
    loadFileSourceById.mockResolvedValueOnce(previewSource)

    const preview = new VideoPreviewModel()
    preview.setFile(72, 'clip.mp4', {mimeType: 'video/mp4', lastModified: 111})
    await vi.waitFor(() => {
      expect(preview.sourceKind()).toBe('video-source')
    })

    const freshSource = createFileSource('blob:fresh-after-stale')
    loadFileSourceById.mockResolvedValueOnce(freshSource)

    const player = new VideoPlayerModel()
    player.setFile({fileId: 72, fileName: 'clip.mp4', mimeType: 'video/mp4', lastModified: 111})

    await vi.waitFor(() => {
      expect(player.videoUrl()).toBe('blob:fresh-after-stale')
    })
    expect(loadFileSourceById).toHaveBeenCalledTimes(2)

    // Stale offer: the preview still owns and releases its source.
    preview.cleanup()
    expect(previewSource.release).toHaveBeenCalledOnce()

    player.cleanup()
    expect(freshSource.release).toHaveBeenCalledOnce()
  })

  it('releases a handed-off source exactly once when a lifecycle trigger fires mid-handoff', async () => {
    const previewSource = createFileSource('http://127.0.0.1:49152/media/lifecycle-handoff', {
      kind: 'video-source',
      delivery: 'loopback-http',
      streamId: 'lifecycle-handoff-stream',
      sourceToken: 'lifecycle-handoff-stream',
    })
    loadFileSourceById.mockResolvedValueOnce(previewSource)

    const preview = new VideoPreviewModel()
    preview.setFile(73, 'clip.mp4', {mimeType: 'video/mp4', lastModified: 9})
    await vi.waitFor(() => {
      expect(preview.sourceKind()).toBe('video-source')
    })

    const player = new VideoPlayerModel()
    player.setFile({fileId: 73, fileName: 'clip.mp4', mimeType: 'video/mp4', lastModified: 9})
    expect(loadFileSourceById).toHaveBeenCalledTimes(1)

    await releaseAllMediaStreamOwnersForLifecycle('vault-lock', {nodeId: 73})

    // Late events route to the new owner: the player released the source.
    expect(previewSource.release).toHaveBeenCalledTimes(1)
    expect(player.sourceKind()).toBe('none')

    // Neither owner double-releases afterwards.
    preview.cleanup()
    player.cleanup()
    expect(previewSource.release).toHaveBeenCalledTimes(1)
  })
})
