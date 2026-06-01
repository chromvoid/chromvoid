import {afterEach, describe, expect, it, vi} from 'vitest'

const {loadFileSourceById, isMockTransport} = vi.hoisted(() => ({
  loadFileSourceById: vi.fn(),
  isMockTransport: vi.fn(() => false),
}))

vi.mock('../../src/features/media/components/file-loader', () => ({
  loadFileSourceById,
  isMockTransport,
}))

import {ImagePreviewModel} from '../../src/features/media/components/image-preview.model'
import {ImagePreview} from '../../src/features/media/components/image-preview'
import {i18n} from '../../src/i18n'

type TestFileSource = {
  kind: 'blob'
  url: string
  size: number
  mimeType: string
  release: ReturnType<typeof vi.fn>
}

function createFileSource(url: string, overrides: Partial<TestFileSource> = {}): TestFileSource {
  return {
    kind: 'blob' as const,
    url,
    size: 1,
    mimeType: 'image/webp',
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
  document.body.innerHTML = ''
  loadFileSourceById.mockReset()
  isMockTransport.mockReset()
  isMockTransport.mockReturnValue(false)
})

describe('image-preview', () => {
  it('loads image into model state', async () => {
    const source = createFileSource('blob:preview-model')
    loadFileSourceById.mockResolvedValue(source)

    const model = new ImagePreviewModel()
    model.setFile(7, 'photo.png')

    await vi.waitFor(() => {
      expect(model.loadingState()).toBe('loaded')
      expect(model.imageUrl()).toBe('blob:preview-model')
    })

    expect(source.release).not.toHaveBeenCalled()

    model.cleanup()

    expect(source.release).toHaveBeenCalledOnce()
  })

  it('requests preview-image sources for inline image previews', async () => {
    loadFileSourceById.mockResolvedValue(createFileSource('blob:image-preview'))

    const model = new ImagePreviewModel()
    model.setFile(8, 'photo.jpg', 'image/jpeg', 1710000000000)

    await vi.waitFor(() => {
      expect(model.loadingState()).toBe('loaded')
    })

    expect(loadFileSourceById).toHaveBeenCalledWith(
      8,
      'photo.jpg',
      expect.objectContaining({
        lastModified: 1710000000000,
        variant: 'preview-image',
        derivativeFallback: 'none',
      }),
    )
  })

  it('keeps inline preview loaded when the preview source resolves', async () => {
    loadFileSourceById.mockResolvedValue(createFileSource('blob:image-preview-source', {
      mimeType: 'image/webp',
    }))

    const model = new ImagePreviewModel()
    model.setFile(9, 'photo.heic', 'image/heic', 1710000000100)

    await vi.waitFor(() => {
      expect(model.loadingState()).toBe('loaded')
      expect(model.imageUrl()).toBe('blob:image-preview-source')
      expect(model.errorMessage()).toBe('')
    })
  })

  it('releases the prepared source when browser image rendering fails', async () => {
    const source = createFileSource('blob:render-failed')
    loadFileSourceById.mockResolvedValue(source)

    const model = new ImagePreviewModel()
    model.setFile(20, 'broken-render.png')

    await vi.waitFor(() => {
      expect(model.imageUrl()).toBe('blob:render-failed')
    })

    model.handleImageRenderError('blob:render-failed')

    expect(source.release).toHaveBeenCalledOnce()
    expect(model.imageUrl()).toBeNull()
    expect(model.loadingState()).toBe('error')
    expect(model.errorMessage()).toBe(i18n('media:image-display-failed' as any))
    expect(loadFileSourceById).toHaveBeenCalledTimes(1)
  })

  it('ignores stale browser image rendering failures', async () => {
    const source = createFileSource('blob:current-render')
    loadFileSourceById.mockResolvedValue(source)

    const model = new ImagePreviewModel()
    model.setFile(21, 'current.png')

    await vi.waitFor(() => {
      expect(model.imageUrl()).toBe('blob:current-render')
    })

    model.handleImageRenderError('blob:stale-render')

    expect(source.release).not.toHaveBeenCalled()
    expect(model.imageUrl()).toBe('blob:current-render')
    expect(model.loadingState()).toBe('loaded')
  })

  it('rerenders loaded image from reatom model without manual requestUpdate', async () => {
    loadFileSourceById.mockResolvedValue(createFileSource('blob:preview-component'))
    ImagePreview.define()

    const element = document.createElement('image-preview') as ImagePreview
    element.fileId = 42
    element.fileName = 'photo.png'
    element.mimeType = 'image/png'
    document.body.append(element)

    await vi.waitFor(() => {
      const image = element.shadowRoot?.querySelector<HTMLImageElement>('img.preview-image')
      expect(image).toBeTruthy()
      expect(image?.getAttribute('src')).toBe('blob:preview-component')
    })
  })

  it('cancels a scheduled retry when a different file replaces the preview', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    loadFileSourceById
      .mockRejectedValueOnce(new Error('first image failed'))
      .mockResolvedValueOnce(createFileSource('blob:next-image'))

    const model = new ImagePreviewModel()
    model.setFile(11, 'first.png')
    await vi.advanceTimersByTimeAsync(120)
    await flushAsync()

    model.setFile(12, 'second.png')
    await vi.advanceTimersByTimeAsync(120)
    await flushAsync()
    await vi.advanceTimersByTimeAsync(1_000)

    expect(loadFileSourceById).toHaveBeenCalledTimes(2)
    expect(model.loadingState()).toBe('loaded')
    expect(model.imageUrl()).toBe('blob:next-image')
  })

  it('cancels a scheduled retry during cleanup', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    loadFileSourceById.mockRejectedValueOnce(new Error('cleanup image failed'))

    const model = new ImagePreviewModel()
    model.setFile(13, 'cleanup.png')
    await vi.advanceTimersByTimeAsync(120)
    await flushAsync()

    model.cleanup()
    await vi.advanceTimersByTimeAsync(1_000)

    expect(loadFileSourceById).toHaveBeenCalledTimes(1)
    expect(model.loadingState()).toBe('idle')
    expect(model.imageUrl()).toBeNull()
  })

  it('ignores stale successful results from a previous file load', async () => {
    const first = deferred<TestFileSource>()
    const second = deferred<TestFileSource>()
    const firstSource = createFileSource('blob:first-image')
    const secondSource = createFileSource('blob:second-image')
    loadFileSourceById
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)

    const model = new ImagePreviewModel()
    vi.useFakeTimers()
    model.setFile(14, 'first.png')
    await vi.advanceTimersByTimeAsync(120)
    await flushAsync()
    model.setFile(15, 'second.png')
    await vi.advanceTimersByTimeAsync(120)
    await flushAsync()

    second.resolve(secondSource)
    await flushAsync()

    first.resolve(firstSource)
    await flushAsync()

    expect(model.loadingState()).toBe('loaded')
    expect(model.imageUrl()).toBe('blob:second-image')
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
    const model = new ImagePreviewModel()
    vi.useFakeTimers()
    model.setFile(16, 'first.png')
    await vi.advanceTimersByTimeAsync(120)
    await flushAsync()
    model.setFile(17, 'second.png')
    await vi.advanceTimersByTimeAsync(120)
    await flushAsync()

    second.resolve(createFileSource('blob:stable-image'))
    await flushAsync()

    first.reject(new Error('stale image failure'))
    await flushAsync()

    expect(model.loadingState()).toBe('loaded')
    expect(model.imageUrl()).toBe('blob:stable-image')
    expect(model.errorMessage()).toBe('')
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  it('starts a fresh retry without leaving the previous retry timer alive', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    loadFileSourceById
      .mockRejectedValueOnce(new Error('retry image failed'))
      .mockResolvedValueOnce(createFileSource('blob:retried-image'))

    const model = new ImagePreviewModel()
    model.setFile(18, 'retry.png')
    await vi.advanceTimersByTimeAsync(120)
    await flushAsync()

    model.retry()
    await flushAsync()
    await vi.advanceTimersByTimeAsync(1_000)

    expect(loadFileSourceById).toHaveBeenCalledTimes(2)
    expect(model.loadingState()).toBe('loaded')
    expect(model.imageUrl()).toBe('blob:retried-image')
  })

  it('keeps the mock-transport error message unchanged', async () => {
    isMockTransport.mockReturnValue(true)

    const model = new ImagePreviewModel()
    model.setFile(19, 'mocked.png')
    await vi.waitFor(() => {
      expect(model.loadingState()).toBe('error')
    })

    expect(loadFileSourceById).not.toHaveBeenCalled()
    expect(model.errorMessage()).toBe(i18n('media:preview-desktop-only' as any))
  })

  it('debounces rapid file changes before starting expensive preview loads', async () => {
    vi.useFakeTimers()
    loadFileSourceById.mockResolvedValue(createFileSource('blob:second-debounced'))

    const model = new ImagePreviewModel()
    model.setFile(30, 'first.png', 'image/png')
    model.setFile(31, 'second.png', 'image/png')

    expect(model.loadingState()).toBe('loading')
    expect(loadFileSourceById).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(120)
    await flushAsync()

    expect(loadFileSourceById).toHaveBeenCalledTimes(1)
    expect(loadFileSourceById).toHaveBeenCalledWith(
      31,
      'second.png',
      expect.objectContaining({
        variant: 'preview-image',
        derivativeFallback: 'none',
      }),
    )
    expect(model.imageUrl()).toBe('blob:second-debounced')
  })
})
