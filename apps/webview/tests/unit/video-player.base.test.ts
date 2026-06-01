import {afterEach, describe, expect, it, vi} from 'vitest'
import {nothing} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'

const {loadFileSourceById, FileLoadError, isMediaBlobFallbackLimitError} = vi.hoisted(() => {
  class MockFileLoadError extends Error {
    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message)
    }
  }

  return {
    loadFileSourceById: vi.fn(),
    FileLoadError: MockFileLoadError,
    isMediaBlobFallbackLimitError: (error: unknown) =>
      error instanceof MockFileLoadError && error.code === 'MEDIA_BLOB_FALLBACK_LIMIT',
  }
})

vi.mock('../../src/features/media/components/file-loader', () => ({
  FileLoadError,
  loadFileSourceById,
  isMediaBlobFallbackLimitError,
}))

import {VideoPlayerBase} from '../../src/features/media/components/video-player.base'
import {VideoPlayerMobile} from '../../src/features/media/components/video-player.mobile'
import {MEDIA_STREAM_LOADABILITY_TIMEOUT_MS} from '../../src/features/media/models/media-stream-loadability'
import {
  dispatchAndroidVideoPlayerEvent,
  dispatchMediaStreamError,
  resetMediaStreamOwnerRegistryForTests,
} from '../../src/features/media/models/media-stream-owner-registry'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {runtimeModeModel} from '../../src/core/runtime/runtime-mode.model'
import {i18n} from '../../src/i18n'

type TestFileSource = {
  kind: 'blob' | 'media-stream' | 'android-native-video'
  url: string
  streamId?: string
  token?: string
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
}

if (!customElements.get('test-video-player')) {
  customElements.define('test-video-player', TestVideoPlayer)
}
if (!customElements.get('test-video-player-mobile')) {
  customElements.define('test-video-player-mobile', TestVideoPlayerMobile)
}
VideoPlayerMobile.define()

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
  resetMediaStreamOwnerRegistryForTests()
  resetRuntimeCapabilities()
  runtimeModeModel.handleTransportDisconnect()
  loadFileSourceById.mockReset()
  vi.restoreAllMocks()
})

describe('video-player base media stream lifecycle', () => {
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
    expect(loadFileSourceById).toHaveBeenLastCalledWith(
      43,
      'large.mp4',
      expect.objectContaining({
        sourceSize: 67_108_865,
        variant: 'raw',
      }),
    )
  })

  it('ignores stale Android native events and releases the active native source on error', async () => {
    const nativeSource = createFileSource('', {
      kind: 'android-native-video',
      token: 'android-video-token',
      size: 100,
    })
    loadFileSourceById.mockResolvedValueOnce(nativeSource)

    const element = appendOpenPlayer(44, 'native.mp4', 100)

    await vi.waitFor(() => {
      expect(element.currentLoading()).toBe(false)
      expect(element.currentSourceKind()).toBe('android-native-video')
    })

    dispatchAndroidVideoPlayerEvent({
      token: 'stale-video-token',
      event: 'error',
      error: 'ERR_STALE',
    })

    expect(nativeSource.release).not.toHaveBeenCalled()
    expect(element.currentSourceKind()).toBe('android-native-video')

    dispatchAndroidVideoPlayerEvent({
      token: 'android-video-token',
      event: 'error',
      error: 'ERR_ANDROID_VIDEO_SOURCE_READ',
    })

    await vi.waitFor(() => {
      expect(nativeSource.release).toHaveBeenCalledOnce()
      expect(element.currentSourceKind()).toBe('none')
      expect(element.currentErrorMessage()).toBe(i18n('media:video-load-failed' as any))
    })
  })

  it('closes the overlay when the Android native player is released', async () => {
    const nativeSource = createFileSource('', {
      kind: 'android-native-video',
      token: 'released-video-token',
      size: 100,
    })
    loadFileSourceById.mockResolvedValueOnce(nativeSource)

    const element = appendOpenPlayer(45, 'native-release.mp4', 100)
    const closeSpy = vi.fn()
    element.addEventListener('close', closeSpy)

    await vi.waitFor(() => {
      expect(element.currentLoading()).toBe(false)
      expect(element.currentSourceKind()).toBe('android-native-video')
    })

    dispatchAndroidVideoPlayerEvent({
      token: 'released-video-token',
      event: 'released',
    })

    await vi.waitFor(() => {
      expect(closeSpy).toHaveBeenCalledOnce()
      expect(nativeSource.release).toHaveBeenCalledOnce()
      expect(element.currentSourceKind()).toBe('none')
    })
  })

  it('keeps the mobile webview blank while Android native video is playing', async () => {
    const nativeSource = createFileSource('', {
      kind: 'android-native-video',
      token: 'blank-native-video-token',
      size: 100,
    })
    loadFileSourceById.mockResolvedValueOnce(nativeSource)

    const element = appendOpenMobilePlayer(46, 'native-blank.mp4', 100)

    await vi.waitFor(() => {
      expect(element.currentLoading()).toBe(false)
      expect(element.currentSourceKind()).toBe('android-native-video')
    })
    await element.updateComplete

    const root = element.shadowRoot
    expect(root?.querySelector('.overlay')).toBeNull()
    expect(root?.querySelector('.fallback-card')).toBeNull()
    expect(root?.textContent ?? '').not.toContain(i18n('media:video-native-playing' as any))
    expect(nativeSource.release).not.toHaveBeenCalled()
  })

  it('renders load errors instead of leaving the Android player overlay blank', async () => {
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
