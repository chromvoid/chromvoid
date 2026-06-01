import {afterEach, describe, expect, it, vi} from 'vitest'

const {loadFileSourceById, isMockTransport, FileLoadError, isMediaBlobFallbackLimitError} = vi.hoisted(() => {
  class MockFileLoadError extends Error {
    constructor(readonly code: string, message: string) {
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
import {MEDIA_STREAM_LOADABILITY_TIMEOUT_MS} from '../../src/features/media/models/media-stream-loadability'
import {
  dispatchMediaStreamError,
  resetMediaStreamOwnerRegistryForTests,
} from '../../src/features/media/models/media-stream-owner-registry'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {runtimeModeModel} from '../../src/core/runtime/runtime-mode.model'

type TestFileSource = {
  kind: 'blob' | 'media-stream'
  url: string
  streamId?: string
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
    expect(model.errorMessage()).toBe(i18n('media:fallback-limited-title' as any))
    expect(loadFileSourceById).toHaveBeenCalledTimes(1)
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
})
