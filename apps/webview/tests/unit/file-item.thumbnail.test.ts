import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import * as fileLoader from '../../src/features/media/components/file-loader'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {FileItem} from '../../src/features/file-manager/components/file-item'
import {FileItemModel} from '../../src/features/file-manager/models/file-item.model'
import {
  acquireFileThumbnail,
  resetFileThumbnailCacheForTests,
} from '../../src/features/file-manager/models/file-thumbnail-cache.model'

const IMAGE_ITEM = {
  id: 41,
  path: '/photo.jpg',
  name: 'photo.jpg',
  isDir: false,
  size: 2048,
  lastModified: 1710000000000,
  mimeType: 'image/jpeg',
}

const DOC_ITEM = {
  id: 42,
  path: '/report.pdf',
  name: 'report.pdf',
  isDir: false,
  size: 1024,
  lastModified: 1710000001234,
  mimeType: 'application/pdf',
}

const AUDIO_ITEM = {
  id: 43,
  path: '/track.mp3',
  name: 'track.mp3',
  isDir: false,
  size: 4096,
  lastModified: 1710000005678,
  mimeType: 'audio/mpeg',
}

async function settle(element: HTMLElement & {updateComplete?: Promise<unknown>}) {
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return {promise, resolve, reject}
}

describe('file-item thumbnail rendering', () => {
  beforeEach(() => {
    FileItem.define()
    initAppContext(createMockAppContext())
  })

  afterEach(() => {
    resetFileThumbnailCacheForTests()
    document.body.innerHTML = ''
    clearAppContext()
    vi.restoreAllMocks()
  })

  it('renders image thumbnails in list/grid items through the thumbnail-image variant', async () => {
    const release = vi.fn()
    const loadSpy = vi.spyOn(fileLoader, 'loadFileSourceById').mockResolvedValue({
      kind: 'asset-file',
      url: 'blob:file-thumb',
      size: 5,
      mimeType: 'image/webp',
      release,
    })

    const element = document.createElement('file-item-desktop') as FileItem
    element.item = IMAGE_ITEM
    element.viewMode = 'grid'
    document.body.appendChild(element)
    await settle(element)

    await vi.waitFor(() => {
      expect(loadSpy).toHaveBeenCalledWith(
        IMAGE_ITEM.id,
        IMAGE_ITEM.name,
        expect.objectContaining({
          mimeType: IMAGE_ITEM.mimeType,
          lastModified: IMAGE_ITEM.lastModified,
          variant: 'thumbnail-image',
          derivativeFallback: 'none',
        }),
      )
      const image = element.shadowRoot?.querySelector<HTMLImageElement>('img.thumbnail-image')
      expect(image?.getAttribute('src')).toBe('blob:file-thumb')
    })

    element.remove()

    expect(release).not.toHaveBeenCalled()

    resetFileThumbnailCacheForTests()

    expect(release).toHaveBeenCalledTimes(1)
  })

  it('renders audio artwork thumbnails through the thumbnail-image variant', async () => {
    const release = vi.fn()
    const loadSpy = vi.spyOn(fileLoader, 'loadFileSourceById').mockResolvedValue({
      kind: 'asset-file',
      url: 'blob:audio-artwork-thumb',
      size: 5,
      mimeType: 'image/webp',
      release,
    })

    const element = document.createElement('file-item-desktop') as FileItem
    element.item = AUDIO_ITEM
    element.viewMode = 'grid'
    document.body.appendChild(element)
    await settle(element)

    await vi.waitFor(() => {
      expect(loadSpy).toHaveBeenCalledWith(
        AUDIO_ITEM.id,
        AUDIO_ITEM.name,
        expect.objectContaining({
          mimeType: AUDIO_ITEM.mimeType,
          lastModified: AUDIO_ITEM.lastModified,
          variant: 'thumbnail-image',
          derivativeFallback: 'none',
        }),
      )
      const image = element.shadowRoot?.querySelector<HTMLImageElement>('img.thumbnail-image')
      expect(image?.getAttribute('src')).toBe('blob:audio-artwork-thumb')
    })

    element.remove()
    resetFileThumbnailCacheForTests()

    expect(release).toHaveBeenCalledTimes(1)
  })

  it('renders audio items icon-only without warning when embedded artwork is unavailable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const loadSpy = vi
      .spyOn(fileLoader, 'loadFileSourceById')
      .mockRejectedValue(
        new fileLoader.FileLoadError('DERIVATIVE_UNAVAILABLE', 'DERIVATIVE_UNAVAILABLE:thumbnail-image'),
      )

    const element = document.createElement('file-item-desktop') as FileItem
    element.item = AUDIO_ITEM
    element.viewMode = 'grid'
    document.body.appendChild(element)
    await settle(element)

    await vi.waitFor(() => {
      expect(loadSpy).toHaveBeenCalledOnce()
      expect(element.shadowRoot?.querySelector('img.thumbnail-image')).toBeNull()
      expect(element.shadowRoot?.querySelector('.icon.file-media')).not.toBeNull()
    })

    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('retries a non-renderable thumbnail through the blob derivative path', async () => {
    const preparedRelease = vi.fn()
    const blobRelease = vi.fn()
    const loadSpy = vi
      .spyOn(fileLoader, 'loadFileSourceById')
      .mockResolvedValueOnce({
        kind: 'asset-file',
        url: 'http://asset.localhost/bad-thumbnail',
        size: 5,
        mimeType: 'image/webp',
        release: preparedRelease,
      })
      .mockResolvedValueOnce({
        kind: 'blob',
        url: 'blob:file-thumb-retry',
        size: 5,
        mimeType: 'image/png',
        release: blobRelease,
      })

    const element = document.createElement('file-item-desktop') as FileItem
    element.item = IMAGE_ITEM
    element.viewMode = 'list'
    document.body.appendChild(element)
    await settle(element)

    await vi.waitFor(() => {
      expect(
        element.shadowRoot?.querySelector<HTMLImageElement>('img.thumbnail-image')?.getAttribute('src'),
      ).toBe('http://asset.localhost/bad-thumbnail')
    })

    element.shadowRoot
      ?.querySelector<HTMLImageElement>('img.thumbnail-image')
      ?.dispatchEvent(new Event('error'))

    await vi.waitFor(() => {
      expect(loadSpy).toHaveBeenCalledTimes(2)
      expect(
        element.shadowRoot?.querySelector<HTMLImageElement>('img.thumbnail-image')?.getAttribute('src'),
      ).toBe('blob:file-thumb-retry')
    })

    expect(loadSpy.mock.calls[1]?.[2]).toMatchObject({
      variant: 'thumbnail-image',
      derivativeFallback: 'none',
      preparedSourcePolicy: 'skip',
    })
    expect(preparedRelease).toHaveBeenCalledTimes(1)

    element.remove()
    resetFileThumbnailCacheForTests()
    expect(blobRelease).toHaveBeenCalledTimes(1)
  })

  it('returns to icon-only rendering when thumbnail recovery also fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const preparedRelease = vi.fn()
    const loadSpy = vi
      .spyOn(fileLoader, 'loadFileSourceById')
      .mockResolvedValueOnce({
        kind: 'asset-file',
        url: 'http://asset.localhost/bad-thumbnail',
        size: 5,
        mimeType: 'image/webp',
        release: preparedRelease,
      })
      .mockRejectedValueOnce(
        new fileLoader.FileLoadError('DERIVATIVE_UNAVAILABLE', 'DERIVATIVE_UNAVAILABLE:thumbnail-image'),
      )

    const element = document.createElement('file-item-desktop') as FileItem
    element.item = IMAGE_ITEM
    element.viewMode = 'list'
    document.body.appendChild(element)
    await settle(element)

    await vi.waitFor(() => {
      expect(
        element.shadowRoot?.querySelector<HTMLImageElement>('img.thumbnail-image')?.getAttribute('src'),
      ).toBe('http://asset.localhost/bad-thumbnail')
    })

    element.shadowRoot
      ?.querySelector<HTMLImageElement>('img.thumbnail-image')
      ?.dispatchEvent(new Event('error'))

    await vi.waitFor(() => {
      expect(loadSpy).toHaveBeenCalledTimes(2)
      expect(element.shadowRoot?.querySelector('img.thumbnail-image')).toBeNull()
      expect(element.shadowRoot?.querySelector('.icon.file-image')).not.toBeNull()
    })

    expect(loadSpy.mock.calls[1]?.[2]).toMatchObject({
      preparedSourcePolicy: 'skip',
    })
    expect(preparedRelease).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('does not set a stale thumbnail url after dispose', async () => {
    const pending = deferred<Awaited<ReturnType<typeof fileLoader.loadFileSourceById>>>()
    vi.spyOn(fileLoader, 'loadFileSourceById').mockReturnValue(pending.promise)
    const model = new FileItemModel()

    model.setThumbnailTarget(IMAGE_ITEM, 'grid')
    await vi.waitFor(() => {
      expect(fileLoader.loadFileSourceById).toHaveBeenCalledTimes(1)
    })

    model.dispose()
    pending.resolve({
      kind: 'asset-file',
      url: 'blob:stale-thumbnail',
      size: 5,
      mimeType: 'image/webp',
      release: vi.fn(),
    })

    await vi.waitFor(() => {
      expect(model.thumbnailUrl()).toBeNull()
    })
  })

  it('reuses cached thumbnails across virtualized remounts without a second load', async () => {
    const release = vi.fn()
    const loadSpy = vi.spyOn(fileLoader, 'loadFileSourceById').mockResolvedValue({
      kind: 'asset-file',
      url: 'blob:file-thumb',
      size: 5,
      mimeType: 'image/webp',
      release,
    })

    const first = document.createElement('file-item-desktop') as FileItem
    first.item = IMAGE_ITEM
    first.viewMode = 'list'
    document.body.appendChild(first)
    await settle(first)

    await vi.waitFor(() => {
      expect(
        first.shadowRoot?.querySelector<HTMLImageElement>('img.thumbnail-image')?.getAttribute('src'),
      ).toBe('blob:file-thumb')
    })

    first.remove()
    await Promise.resolve()

    expect(release).not.toHaveBeenCalled()

    const second = document.createElement('file-item-desktop') as FileItem
    second.item = IMAGE_ITEM
    second.viewMode = 'list'
    document.body.appendChild(second)
    await second.updateComplete

    expect(loadSpy).toHaveBeenCalledTimes(1)
    expect(
      second.shadowRoot?.querySelector<HTMLImageElement>('img.thumbnail-image')?.getAttribute('src'),
    ).toBe('blob:file-thumb')

    second.remove()
    resetFileThumbnailCacheForTests()

    expect(release).toHaveBeenCalledTimes(1)
  })

  it('loads a fresh thumbnail when the file source version changes', async () => {
    const releases = new Map<number, ReturnType<typeof vi.fn>>()
    const loadSpy = vi
      .spyOn(fileLoader, 'loadFileSourceById')
      .mockImplementation(async (_id, _name, options) => {
        const lastModified = options?.lastModified ?? 0
        const release = vi.fn()
        releases.set(lastModified, release)
        return {
          kind: 'asset-file',
          url: `blob:file-thumb:${lastModified}`,
          size: 5,
          mimeType: 'image/webp',
          release,
        }
      })

    const element = document.createElement('file-item-desktop') as FileItem
    element.item = IMAGE_ITEM
    element.viewMode = 'list'
    document.body.appendChild(element)
    await settle(element)

    await vi.waitFor(() => {
      expect(
        element.shadowRoot?.querySelector<HTMLImageElement>('img.thumbnail-image')?.getAttribute('src'),
      ).toBe(`blob:file-thumb:${IMAGE_ITEM.lastModified}`)
    })

    const nextLastModified = IMAGE_ITEM.lastModified + 1
    element.item = {...IMAGE_ITEM, lastModified: nextLastModified}
    await element.updateComplete

    await vi.waitFor(() => {
      expect(
        element.shadowRoot?.querySelector<HTMLImageElement>('img.thumbnail-image')?.getAttribute('src'),
      ).toBe(`blob:file-thumb:${nextLastModified}`)
    })

    expect(loadSpy).toHaveBeenCalledTimes(2)

    resetFileThumbnailCacheForTests()

    expect(releases.get(IMAGE_ITEM.lastModified)).toHaveBeenCalledTimes(1)
    expect(releases.get(nextLastModified)).toHaveBeenCalledTimes(1)
  })

  it('keeps non-gallery items on icon-only rendering without thumbnail requests', async () => {
    const loadSpy = vi.spyOn(fileLoader, 'loadFileSourceById').mockResolvedValue({
      kind: 'asset-file',
      url: 'blob:file-thumb',
      size: 5,
      mimeType: 'image/webp',
      release: vi.fn(),
    })

    const element = document.createElement('file-item-desktop') as FileItem
    element.item = DOC_ITEM
    element.viewMode = 'list'
    document.body.appendChild(element)
    await settle(element)

    expect(loadSpy).not.toHaveBeenCalled()
    expect(element.shadowRoot?.querySelector('img.thumbnail-image')).toBeNull()
    expect(element.shadowRoot?.querySelector('.icon.file-document')).not.toBeNull()
  })

  it('aborts an unused in-flight thumbnail cache entry when the only waiter leaves', async () => {
    let loadSignal: AbortSignal | null = null
    vi.spyOn(fileLoader, 'loadFileSourceById').mockImplementation((_id, _name, options) => {
      loadSignal = options?.signal ?? null
      return new Promise(() => {})
    })

    const controller = new AbortController()
    const pending = acquireFileThumbnail(IMAGE_ITEM, {signal: controller.signal})

    await vi.waitFor(() => {
      expect(loadSignal).not.toBeNull()
    })

    controller.abort()

    await expect(pending).rejects.toMatchObject({name: 'AbortError'})
    expect(loadSignal?.aborted).toBe(true)
  })
})
