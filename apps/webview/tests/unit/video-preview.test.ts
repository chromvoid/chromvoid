import {afterEach, describe, expect, it, vi} from 'vitest'

const {loadFileSourceById, isMockTransport, FileLoadError, isMediaBlobFallbackLimitError} = vi.hoisted(() => {
  class MockFileLoadError extends Error {
    constructor(readonly code: string, message: string, readonly details: Record<string, unknown> = {}) {
      super(message)
    }
  }

  return {
    loadFileSourceById: vi.fn(),
    isMockTransport: vi.fn(() => false),
    FileLoadError: MockFileLoadError,
    isMediaBlobFallbackLimitError: (error: unknown) =>
      error instanceof MockFileLoadError && error.code === 'MEDIA_BLOB_FALLBACK_LIMIT',
  }
})

vi.mock('../../src/features/media/components/file-loader', () => ({
  FileLoadError,
  loadFileSourceById,
  isMockTransport,
  isMediaBlobFallbackLimitError,
}))

import {i18n} from '../../src/i18n'
import {VideoPreviewModel} from '../../src/features/media/components/video-preview.model'
import {
  MEDIA_STREAM_LOADABILITY_TIMEOUT_MS,
  REMOTE_MEDIA_STREAM_LOADABILITY_TIMEOUT_MS,
} from '../../src/features/media/models/media-stream-loadability'
import {
  releaseAllMediaStreamOwnersForLifecycle,
  dispatchMediaStreamError,
  resetMediaStreamOwnerRegistryForTests,
} from '../../src/features/media/models/media-stream-owner-registry'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {runtimeModeModel} from '../../src/core/runtime/runtime-mode.model'
import {
  claimVideoSourceHandoff,
  getVideoSourceHandoffOfferCountForTests,
  resetVideoSourceHandoffForTests,
} from '../../src/features/media/models/video-source-handoff'

type TestFileSource = {
  kind: 'blob' | 'video-source' | 'media-stream'
  url: string
  delivery?: 'loopback-http' | 'mse' | 'native-video'
  streamId?: string
  sourceToken?: string
  token?: string
  nativeSourceToken?: string
  size: number
  mimeType: string
  release: ReturnType<typeof vi.fn>
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
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return {promise, resolve, reject}
}

async function flushAsync(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  resetMediaStreamOwnerRegistryForTests()
  resetVideoSourceHandoffForTests()
  resetRuntimeCapabilities()
  runtimeModeModel.handleTransportDisconnect()
  loadFileSourceById.mockReset()
  isMockTransport.mockReset()
  isMockTransport.mockReturnValue(false)
})

describe('video-preview', () => {
  it('loads video into model state', async () => {
    const source = createFileSource('blob:video-preview')
    loadFileSourceById.mockResolvedValue(source)

    const model = new VideoPreviewModel()
    model.setFile(21, 'clip.mp4', {mimeType: 'video/mp4', sourceSize: 42})

    await vi.waitFor(() => {
      expect(model.loadingState()).toBe('loaded')
      expect(model.videoUrl()).toBe('blob:video-preview')
      expect(model.playable()).toBe(true)
    })

    expect(loadFileSourceById).toHaveBeenCalledWith(
      21,
      'clip.mp4',
      expect.objectContaining({
        mimeType: 'video/mp4',
        sourceSize: 42,
        variant: 'raw',
      }),
    )
    expect(source.release).not.toHaveBeenCalled()

    model.cleanup()

    expect(source.release).toHaveBeenCalledOnce()
  })

  it('cancels a scheduled retry when a different file replaces the preview', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    loadFileSourceById
      .mockRejectedValueOnce(new Error('first video failed'))
      .mockResolvedValueOnce(createFileSource('blob:next-video'))

    const model = new VideoPreviewModel()
    model.setFile(22, 'first.mp4')
    await flushAsync()

    model.setFile(23, 'second.mp4')
    await flushAsync()
    await vi.advanceTimersByTimeAsync(1_000)

    expect(loadFileSourceById).toHaveBeenCalledTimes(2)
    expect(model.loadingState()).toBe('loaded')
    expect(model.videoUrl()).toBe('blob:next-video')
  })

  it('cancels a scheduled retry during cleanup', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    loadFileSourceById.mockRejectedValueOnce(new Error('cleanup video failed'))

    const model = new VideoPreviewModel()
    model.setFile(24, 'cleanup.mp4')
    await flushAsync()

    model.cleanup()
    await vi.advanceTimersByTimeAsync(1_000)

    expect(loadFileSourceById).toHaveBeenCalledTimes(1)
    expect(model.loadingState()).toBe('idle')
    expect(model.videoUrl()).toBeNull()
    expect(model.playable()).toBe(false)
  })

  it('ignores stale successful results from a previous file load', async () => {
    const first = deferred<TestFileSource>()
    const second = deferred<TestFileSource>()
    const firstSource = createFileSource('blob:first-video')
    const secondSource = createFileSource('blob:second-video')
    loadFileSourceById
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)

    const model = new VideoPreviewModel()
    model.setFile(25, 'first.mp4')
    model.setFile(26, 'second.mp4')

    second.resolve(secondSource)
    await flushAsync()

    first.resolve(firstSource)
    await flushAsync()

    expect(model.loadingState()).toBe('loaded')
    expect(model.videoUrl()).toBe('blob:second-video')
    expect(firstSource.release).toHaveBeenCalledOnce()
    expect(secondSource.release).not.toHaveBeenCalled()
  })

  it('ignores stale failures from a previous file load', async () => {
    const first = deferred<TestFileSource>()
    const second = deferred<TestFileSource>()
    loadFileSourceById
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const model = new VideoPreviewModel()
    model.setFile(27, 'first.mp4')
    model.setFile(28, 'second.mp4')

    second.resolve(createFileSource('blob:stable-video'))
    await flushAsync()

    first.reject(new Error('stale video failure'))
    await flushAsync()

    expect(model.loadingState()).toBe('loaded')
    expect(model.videoUrl()).toBe('blob:stable-video')
    expect(model.errorMessage()).toBe('')
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  it('starts a fresh retry without leaving the previous retry timer alive', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    loadFileSourceById
      .mockRejectedValueOnce(new Error('retry video failed'))
      .mockResolvedValueOnce(createFileSource('blob:retried-video'))

    const model = new VideoPreviewModel()
    model.setFile(29, 'retry.mp4')
    await flushAsync()

    model.retry()
    await flushAsync()
    await vi.advanceTimersByTimeAsync(1_000)

    expect(loadFileSourceById).toHaveBeenCalledTimes(2)
    expect(model.loadingState()).toBe('loaded')
    expect(model.videoUrl()).toBe('blob:retried-video')
  })

  it('keeps the mock-transport error message unchanged', async () => {
    isMockTransport.mockReturnValue(true)

    const model = new VideoPreviewModel()
    model.setFile(30, 'mocked.mp4')
    await flushAsync()

    expect(loadFileSourceById).not.toHaveBeenCalled()
    expect(model.loadingState()).toBe('error')
    expect(model.errorMessage()).toBe(i18n('media:preview-desktop-only' as any))
  })

  it('keeps the unsupported-format error message unchanged', async () => {
    const model = new VideoPreviewModel()
    model.setFile(31, 'notes.txt')

    await flushAsync()

    expect(loadFileSourceById).not.toHaveBeenCalled()
    expect(model.loadingState()).toBe('error')
    expect(model.sourceState()).toEqual({state: 'unsupported', reason: 'unsupported-container'})
    expect(model.playable()).toBe(false)
    expect(model.errorMessage()).toBe(i18n('media:video-format-unsupported' as any))
  })

  it('surfaces fallback-limited state without retrying oversized blob fallback', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    loadFileSourceById.mockRejectedValueOnce(
      new FileLoadError('MEDIA_BLOB_FALLBACK_LIMIT', 'MEDIA_BLOB_FALLBACK_LIMIT:67108865:67108864'),
    )

    const model = new VideoPreviewModel()
    model.setFile(36, 'large.mp4', {mimeType: 'video/mp4', sourceSize: 67_108_865})

    await vi.waitFor(() => {
      expect(model.loadingState()).toBe('fallback-limited')
    })

    expect(model.videoUrl()).toBeNull()
    expect(model.sourceState()).toEqual({state: 'fallback-limited', reason: 'fallback-limited'})
    expect(model.errorMessage()).toBe(i18n('media:fallback-limited-title' as any))
    expect(loadFileSourceById).toHaveBeenCalledTimes(1)
  })

  it('surfaces typed source-starved state without changing generic preview copy', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    loadFileSourceById.mockRejectedValue(
      new FileLoadError('MEDIA_SOURCE_STARVED', 'MEDIA_SOURCE_STARVED', {
        reason: 'source-starved',
      }),
    )

    const model = new VideoPreviewModel()
    model.setFile(37, 'starved.mp4', {mimeType: 'video/mp4', sourceSize: 67_108_865})

    await vi.waitFor(() => expect(loadFileSourceById).toHaveBeenCalledTimes(1))
    await vi.advanceTimersByTimeAsync(1_000)
    await vi.waitFor(() => expect(loadFileSourceById).toHaveBeenCalledTimes(2))
    await vi.advanceTimersByTimeAsync(2_000)
    await vi.waitFor(() => {
      expect(loadFileSourceById).toHaveBeenCalledTimes(3)
      expect(model.loadingState()).toBe('error')
      expect(model.sourceState()).toEqual({state: 'failed', reason: 'source-starved'})
    })

    expect(model.videoUrl()).toBeNull()
    expect(model.errorMessage()).toBe(i18n('media:video-load-failed' as any))
  })

  it('falls back to blob when the active native stream reports range-required', async () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_media_stream_protocol: true,
    })
    runtimeModeModel.setCoreMode('local')
    const streamSource = createFileSource('chromvoid-media://localhost/video-stream', {
      kind: 'media-stream',
      streamId: 'video-stream',
    })
    const blobSource = createFileSource('blob:video-fallback')
    loadFileSourceById.mockResolvedValueOnce(streamSource).mockResolvedValueOnce(blobSource)

    const model = new VideoPreviewModel()
    model.setFile(32, 'fallback.mp4')

    await vi.waitFor(() => {
      expect(model.sourceKind()).toBe('media-stream')
      expect(model.videoUrl()).toBe('chromvoid-media://localhost/video-stream')
    })

    dispatchMediaStreamError({
      streamId: 'video-stream',
      code: 'ERR_MEDIA_RANGE_REQUIRED',
      httpStatus: 416,
      nodeId: 32,
      sourceRevision: 7,
    })

    await vi.waitFor(() => {
      expect(model.sourceKind()).toBe('blob')
      expect(model.videoUrl()).toBe('blob:video-fallback')
    })

    expect(streamSource.release).toHaveBeenCalledOnce()
    expect(blobSource.release).not.toHaveBeenCalled()
    expect(loadFileSourceById).toHaveBeenCalledTimes(2)
    expect(runtimeModeModel.canUseNativeMediaStream({transportKind: 'tauri'})).toBe(false)
  })

  it('registers loopback video-source by stream id and falls back after range-required errors', async () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_media_stream_protocol: true,
    })
    runtimeModeModel.setCoreMode('local')
    const streamSource = createFileSource('http://127.0.0.1:32123/media/source', {
      kind: 'video-source',
      delivery: 'loopback-http',
      streamId: 'preview-video-source-stream',
      sourceToken: 'preview-video-source-token',
    })
    const blobSource = createFileSource('blob:video-source-fallback')
    loadFileSourceById.mockResolvedValueOnce(streamSource).mockResolvedValueOnce(blobSource)

    const model = new VideoPreviewModel()
    model.setFile(39, 'video-source.mp4')

    await vi.waitFor(() => {
      expect(model.sourceKind()).toBe('video-source')
      expect(model.videoUrl()).toBe('http://127.0.0.1:32123/media/source')
    })

    dispatchMediaStreamError({
      streamId: 'preview-video-source-stream',
      code: 'ERR_MEDIA_RANGE_REQUIRED',
      httpStatus: 416,
      nodeId: 39,
      sourceRevision: 8,
    })

    await vi.waitFor(() => {
      expect(model.sourceKind()).toBe('blob')
      expect(model.videoUrl()).toBe('blob:video-source-fallback')
    })

    expect(streamSource.release).toHaveBeenCalledOnce()
    expect(blobSource.release).not.toHaveBeenCalled()
    expect(loadFileSourceById).toHaveBeenCalledTimes(2)
  })

  it('uses the same fallback path for a native stream video element error', async () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_media_stream_protocol: true,
    })
    runtimeModeModel.setCoreMode('local')
    const streamSource = createFileSource('chromvoid-media://localhost/error-stream', {
      kind: 'media-stream',
      streamId: 'error-stream',
    })
    const blobSource = createFileSource('blob:error-fallback')
    loadFileSourceById.mockResolvedValueOnce(streamSource).mockResolvedValueOnce(blobSource)

    const model = new VideoPreviewModel()
    model.setFile(33, 'element-error.mp4')

    await vi.waitFor(() => {
      expect(model.sourceKind()).toBe('media-stream')
    })

    model.handleVideoElementError()

    await vi.waitFor(() => {
      expect(model.sourceKind()).toBe('blob')
      expect(model.videoUrl()).toBe('blob:error-fallback')
    })

    expect(streamSource.release).toHaveBeenCalledOnce()
    expect(loadFileSourceById).toHaveBeenCalledTimes(2)
    expect(runtimeModeModel.canUseNativeMediaStream({transportKind: 'tauri'})).toBe(false)
  })

  it('shows a load error for remote stream element errors without falling back to blob', async () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_media_stream_protocol: true,
    })
    runtimeModeModel.setCoreMode({remote: {host: {type: 'mobile_usb', host_id: 'host-1'}}})
    const streamSource = createFileSource('chromvoid-media://localhost/remote-preview-error', {
      kind: 'media-stream',
      streamId: 'remote-preview-error',
    })
    const blobSource = createFileSource('blob:remote-preview-should-not-load')
    loadFileSourceById.mockResolvedValueOnce(streamSource).mockResolvedValueOnce(blobSource)

    const model = new VideoPreviewModel()
    model.setFile(37, 'remote-error.mp4')

    await vi.waitFor(() => {
      expect(model.sourceKind()).toBe('media-stream')
    })

    model.handleVideoElementError()

    await vi.waitFor(() => {
      expect(model.sourceKind()).toBe('none')
      expect(model.loadingState()).toBe('error')
      expect(model.errorMessage()).toBe(i18n('media:video-load-failed' as any))
    })

    expect(streamSource.release).toHaveBeenCalledOnce()
    expect(loadFileSourceById).toHaveBeenCalledTimes(1)
    expect(runtimeModeModel.canUseMediaStreamSource({transportKind: 'tauri'})).toBe(true)
  })

  it('falls back to blob after native stream loadability timeout', async () => {
    vi.useFakeTimers()
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_media_stream_protocol: true,
    })
    runtimeModeModel.setCoreMode('local')
    const streamSource = createFileSource('chromvoid-media://localhost/timeout-stream', {
      kind: 'media-stream',
      streamId: 'timeout-stream',
    })
    const blobSource = createFileSource('blob:timeout-fallback')
    loadFileSourceById.mockResolvedValueOnce(streamSource).mockResolvedValueOnce(blobSource)

    const model = new VideoPreviewModel()
    model.setFile(34, 'timeout.mp4')

    await vi.waitFor(() => {
      expect(model.sourceKind()).toBe('media-stream')
    })

    await vi.advanceTimersByTimeAsync(MEDIA_STREAM_LOADABILITY_TIMEOUT_MS)

    await vi.waitFor(() => {
      expect(model.sourceKind()).toBe('blob')
      expect(model.videoUrl()).toBe('blob:timeout-fallback')
    })
  })

  it('keeps remote media streams attached after the loadability timeout', async () => {
    vi.useFakeTimers()
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_media_stream_protocol: true,
    })
    runtimeModeModel.setCoreMode({remote: {host: {type: 'mobile_usb', host_id: 'host-1'}}})
    const streamSource = createFileSource('chromvoid-media://localhost/remote-preview-timeout', {
      kind: 'media-stream',
      streamId: 'remote-preview-timeout',
    })
    const blobSource = createFileSource('blob:remote-preview-timeout-should-not-load')
    loadFileSourceById.mockResolvedValueOnce(streamSource).mockResolvedValueOnce(blobSource)

    const model = new VideoPreviewModel()
    model.setFile(38, 'remote-timeout.mp4')

    await vi.waitFor(() => {
      expect(model.sourceKind()).toBe('media-stream')
      expect(model.videoUrl()).toBe('chromvoid-media://localhost/remote-preview-timeout')
    })

    await vi.advanceTimersByTimeAsync(REMOTE_MEDIA_STREAM_LOADABILITY_TIMEOUT_MS)
    await flushAsync()

    expect(loadFileSourceById).toHaveBeenCalledTimes(1)
    expect(streamSource.release).not.toHaveBeenCalled()
    expect(model.sourceKind()).toBe('media-stream')
    expect(model.videoUrl()).toBe('chromvoid-media://localhost/remote-preview-timeout')
    expect(model.loadingState()).toBe('loaded')
    expect(runtimeModeModel.canUseMediaStreamSource({transportKind: 'tauri'})).toBe(true)
  })

  it('releases and shows a load error on native range-read failure without blob retry', async () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_media_stream_protocol: true,
    })
    runtimeModeModel.setCoreMode('local')
    const streamSource = createFileSource('chromvoid-media://localhost/read-failed', {
      kind: 'media-stream',
      streamId: 'read-failed',
    })
    loadFileSourceById.mockResolvedValueOnce(streamSource)

    const model = new VideoPreviewModel()
    model.setFile(35, 'corrupt.mp4')

    await vi.waitFor(() => {
      expect(model.sourceKind()).toBe('media-stream')
    })

    dispatchMediaStreamError({
      streamId: 'read-failed',
      code: 'ERR_MEDIA_RANGE_READ_FAILED',
      httpStatus: 500,
      nodeId: 35,
      sourceRevision: 7,
    })

    expect(streamSource.release).toHaveBeenCalledOnce()
    expect(model.loadingState()).toBe('error')
    expect(model.videoUrl()).toBeNull()
    expect(model.errorMessage()).toBe(i18n('media:video-load-failed' as any))
    expect(loadFileSourceById).toHaveBeenCalledTimes(1)
    expect(runtimeModeModel.canUseNativeMediaStream({transportKind: 'tauri'})).toBe(true)
  })

  it('releases native video-source for matching lifecycle context without loadability fallback', async () => {
    vi.useFakeTimers()
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
      supports_native_video_playback: true,
    })
    runtimeModeModel.setCoreMode('local')
    const nativeSource = createFileSource('', {
      kind: 'video-source',
      delivery: 'native-video',
      streamId: 'preview-native-source-stream',
      sourceToken: 'preview-native-source-token',
      nativeSourceToken: 'preview-native-token',
      size: 100,
    })
    const blobSource = createFileSource('blob:native-video-source-should-not-load')
    loadFileSourceById.mockResolvedValueOnce(nativeSource).mockResolvedValueOnce(blobSource)

    const model = new VideoPreviewModel()
    model.setFile(40, 'native-source.mp4', {mimeType: 'video/mp4', sourceSize: 100})

    await vi.waitFor(() => {
      expect(model.sourceKind()).toBe('video-source')
      expect(model.sourceDelivery()).toBe('native-video')
      expect(model.videoUrl()).toBeNull()
      expect(model.loadingState()).toBe('loaded')
    })

    await vi.advanceTimersByTimeAsync(MEDIA_STREAM_LOADABILITY_TIMEOUT_MS)
    await flushAsync()

    expect(loadFileSourceById).toHaveBeenCalledTimes(1)
    expect(nativeSource.release).not.toHaveBeenCalled()
    expect(model.sourceKind()).toBe('video-source')
    expect(model.sourceDelivery()).toBe('native-video')

    await releaseAllMediaStreamOwnersForLifecycle('background', {nodeId: 41})

    expect(nativeSource.release).not.toHaveBeenCalled()
    expect(model.sourceKind()).toBe('video-source')
    expect(model.sourceDelivery()).toBe('native-video')

    await releaseAllMediaStreamOwnersForLifecycle('background', {nodeId: 40})

    expect(nativeSource.release).toHaveBeenCalledOnce()
    expect(blobSource.release).not.toHaveBeenCalled()
    expect(loadFileSourceById).toHaveBeenCalledTimes(1)
    expect(model.sourceKind()).toBe('none')
    expect(model.videoUrl()).toBeNull()
    expect(model.loadingState()).toBe('error')
    expect(model.errorMessage()).toBe(i18n('media:video-load-failed' as any))
  })

  it('fails only the file on decode errors without quarantining the media stack', async () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_media_stream_protocol: true,
    })
    runtimeModeModel.setCoreMode('local')
    const streamSource = createFileSource('chromvoid-media://localhost/preview-decode-error', {
      kind: 'media-stream',
      streamId: 'preview-decode-error',
    })
    const blobSource = createFileSource('blob:preview-decode-should-not-load')
    loadFileSourceById.mockResolvedValueOnce(streamSource).mockResolvedValueOnce(blobSource)

    const model = new VideoPreviewModel()
    model.setFile(41, 'corrupt-preview.mp4')

    await vi.waitFor(() => {
      expect(model.sourceKind()).toBe('media-stream')
    })

    const video = document.createElement('video')
    Object.defineProperty(video, 'error', {
      configurable: true,
      value: {code: 4}, // MEDIA_ERR_SRC_NOT_SUPPORTED
    })
    model.handleVideoElementError(video)

    await vi.waitFor(() => {
      expect(model.sourceKind()).toBe('none')
      expect(model.loadingState()).toBe('error')
      expect(model.sourceState()).toEqual({state: 'unsupported', reason: 'unsupported-codec'})
    })
    expect(streamSource.release).toHaveBeenCalledOnce()
    expect(blobSource.release).not.toHaveBeenCalled()
    expect(loadFileSourceById).toHaveBeenCalledTimes(1)
    expect(runtimeModeModel.canUseNativeMediaStream({transportKind: 'tauri'})).toBe(true)
  })

  it('aborts an in-flight prepare on lifecycle release and releases the late stream', async () => {
    const pending = deferred<TestFileSource>()
    let observedSignal: AbortSignal | undefined
    loadFileSourceById.mockImplementationOnce(
      (_fileId: number, _fileName: string, options?: {signal?: AbortSignal}) => {
        observedSignal = options?.signal
        return pending.promise
      },
    )

    const model = new VideoPreviewModel()
    model.setFile(50, 'inflight-preview.mp4', {mimeType: 'video/mp4', sourceSize: 100})
    await flushAsync()
    expect(observedSignal?.aborted).toBe(false)

    await releaseAllMediaStreamOwnersForLifecycle('vault-lock', {nodeId: 50})
    expect(observedSignal?.aborted).toBe(true)

    const lateSource = createFileSource('chromvoid-media://localhost/late-preview', {
      kind: 'media-stream',
      streamId: 'late-preview',
    })
    pending.resolve(lateSource)
    await flushAsync()

    expect(lateSource.release).toHaveBeenCalledOnce()
    expect(model.videoUrl()).toBeNull()
    expect(model.sourceKind()).toBe('none')
  })

  it('offers handoff-safe sources and skips release once the source is claimed', async () => {
    const streamSource = createFileSource('http://127.0.0.1:49152/media/preview-handoff', {
      kind: 'video-source',
      delivery: 'loopback-http',
      streamId: 'preview-handoff-stream',
      sourceToken: 'preview-handoff-stream',
    })
    loadFileSourceById.mockResolvedValueOnce(streamSource)

    const model = new VideoPreviewModel()
    model.setFile(43, 'handoff.mp4', {mimeType: 'video/mp4', lastModified: 12})

    await vi.waitFor(() => {
      expect(model.sourceKind()).toBe('video-source')
    })
    expect(getVideoSourceHandoffOfferCountForTests()).toBe(1)

    const claimed = claimVideoSourceHandoff({nodeId: 43, lastModified: 12})
    expect(claimed).toBe(streamSource)

    // Release responsibility moved to the claimer: the preview's own release
    // must be a no-op for the handed-off source.
    model.cleanup()
    expect(streamSource.release).not.toHaveBeenCalled()

    // The claim marker is consumed exactly once.
    model.cleanup()
    expect(streamSource.release).not.toHaveBeenCalled()
  })

  it('revokes the handoff offer when the preview releases an unclaimed source', async () => {
    const streamSource = createFileSource('chromvoid-media://localhost/unclaimed-handoff', {
      kind: 'media-stream',
      streamId: 'unclaimed-handoff-stream',
    })
    loadFileSourceById.mockResolvedValueOnce(streamSource)

    const model = new VideoPreviewModel()
    model.setFile(44, 'unclaimed.mp4', {mimeType: 'video/mp4', lastModified: 13})

    await vi.waitFor(() => {
      expect(model.sourceKind()).toBe('media-stream')
    })
    expect(getVideoSourceHandoffOfferCountForTests()).toBe(1)

    model.cleanup()

    expect(streamSource.release).toHaveBeenCalledOnce()
    expect(getVideoSourceHandoffOfferCountForTests()).toBe(0)
    expect(claimVideoSourceHandoff({nodeId: 44, lastModified: 13})).toBeNull()
  })
})
