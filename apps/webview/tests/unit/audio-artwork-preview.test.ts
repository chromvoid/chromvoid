import {afterEach, describe, expect, it, vi} from 'vitest'

const {loadFileSourceById} = vi.hoisted(() => ({
  loadFileSourceById: vi.fn(),
}))

vi.mock('../../src/features/media/components/file-loader', () => ({
  loadFileSourceById,
}))

import {AudioArtworkPreview} from '../../src/features/media/components/audio-artwork-preview'
import {AudioArtworkPreviewModel} from '../../src/features/media/components/audio-artwork-preview.model'

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

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  loadFileSourceById.mockReset()
})

describe('audio-artwork-preview', () => {
  it('loads audio artwork through the requested derivative variant', async () => {
    const source = createFileSource('blob:artwork-preview')
    loadFileSourceById.mockResolvedValue(source)

    const model = new AudioArtworkPreviewModel()
    model.setTarget({
      fileId: 77,
      fileName: 'track.mp3',
      mimeType: 'audio/mpeg',
      lastModified: 1710000000000,
      sourceSize: 4096,
      sourceRevision: 5,
      variant: 'preview-image',
    })

    await vi.waitFor(() => {
      expect(model.loadingState()).toBe('loaded')
      expect(model.artworkUrl()).toBe('blob:artwork-preview')
    })

    expect(loadFileSourceById).toHaveBeenCalledWith(
      77,
      'track.mp3',
      expect.objectContaining({
        mimeType: 'audio/mpeg',
        lastModified: 1710000000000,
        sourceSize: 4096,
        variant: 'preview-image',
        derivativeFallback: 'none',
        displayJobType: 'current-preview',
      }),
    )

    model.cleanup()

    expect(source.release).toHaveBeenCalledOnce()
  })

  it('ignores stale successful artwork loads after target switch', async () => {
    const firstLoad = deferred<TestFileSource>()
    const secondLoad = deferred<TestFileSource>()
    const staleSource = createFileSource('blob:stale-artwork')
    const freshSource = createFileSource('blob:fresh-artwork')
    loadFileSourceById
      .mockImplementationOnce(() => firstLoad.promise)
      .mockImplementationOnce(() => secondLoad.promise)

    const model = new AudioArtworkPreviewModel()
    model.setTarget({
      fileId: 81,
      fileName: 'old.mp3',
      mimeType: 'audio/mpeg',
      variant: 'preview-image',
    })
    model.setTarget({
      fileId: 82,
      fileName: 'fresh.mp3',
      mimeType: 'audio/mpeg',
      variant: 'preview-image',
    })

    secondLoad.resolve(freshSource)
    await flushAsync()
    firstLoad.resolve(staleSource)
    await flushAsync()

    expect(model.loadingState()).toBe('loaded')
    expect(model.artworkUrl()).toBe('blob:fresh-artwork')
    expect(staleSource.release).toHaveBeenCalledOnce()
    expect(freshSource.release).not.toHaveBeenCalled()
  })

  it('falls back without raw display when artwork derivative is unavailable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    loadFileSourceById.mockRejectedValue(new Error('DERIVATIVE_UNAVAILABLE:thumbnail-image'))

    const model = new AudioArtworkPreviewModel()
    model.setTarget({
      fileId: 78,
      fileName: 'no-cover.flac',
      mimeType: 'audio/flac',
      variant: 'thumbnail-image',
    })

    await vi.waitFor(() => {
      expect(model.loadingState()).toBe('unavailable')
      expect(model.artworkUrl()).toBeNull()
    })

    expect(loadFileSourceById).toHaveBeenCalledWith(
      78,
      'no-cover.flac',
      expect.objectContaining({
        variant: 'thumbnail-image',
        derivativeFallback: 'none',
        displayJobType: 'thumbnail',
      }),
    )
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('does not start artwork loading while disabled', () => {
    const model = new AudioArtworkPreviewModel()
    model.setTarget({
      fileId: 77,
      fileName: 'track.mp3',
      mimeType: 'audio/mpeg',
      variant: 'preview-image',
      loadEnabled: false,
    })

    expect(model.loadingState()).toBe('idle')
    expect(model.artworkUrl()).toBeNull()
    expect(loadFileSourceById).not.toHaveBeenCalled()
  })

  it('releases the matching source when browser image rendering fails', async () => {
    const source = createFileSource('blob:bad-render')
    loadFileSourceById.mockResolvedValue(source)

    const model = new AudioArtworkPreviewModel()
    model.setTarget({
      fileId: 79,
      fileName: 'broken-artwork.m4a',
      mimeType: 'audio/mp4',
      variant: 'preview-image',
    })

    await vi.waitFor(() => {
      expect(model.artworkUrl()).toBe('blob:bad-render')
    })

    model.handleImageRenderError('blob:bad-render')

    expect(source.release).toHaveBeenCalledOnce()
    expect(model.artworkUrl()).toBeNull()
    expect(model.loadingState()).toBe('unavailable')
  })

  it('renders loaded artwork from reactive model state', async () => {
    loadFileSourceById.mockResolvedValue(createFileSource('blob:component-artwork'))
    AudioArtworkPreview.define()

    const element = document.createElement('audio-artwork-preview') as AudioArtworkPreview
    element.fileId = 80
    element.fileName = 'track.mp3'
    element.mimeType = 'audio/mpeg'
    element.variant = 'thumbnail-image'
    document.body.append(element)

    await vi.waitFor(() => {
      const image = element.shadowRoot?.querySelector<HTMLImageElement>('img.artwork-image')
      expect(image).toBeTruthy()
      expect(image?.getAttribute('src')).toBe('blob:component-artwork')
    })
  })
})
