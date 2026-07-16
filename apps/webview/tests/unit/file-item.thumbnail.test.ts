import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import * as fileLoader from '../../src/features/media/components/file-loader'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {FileItem} from '../../src/features/file-manager/components/file-item'
import {FileItemModel} from '../../src/features/file-manager/models/file-item.model'
import {
  disposeFileThumbnailCache,
  fileThumbnailStore,
  getFileThumbnailKey,
  resumeFileThumbnailCache,
  resetFileThumbnailCacheForTests,
  suspendFileThumbnailCache,
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

const SECOND_IMAGE_ITEM = {
  ...IMAGE_ITEM,
  id: 44,
  path: '/second-photo.jpg',
  name: 'second-photo.jpg',
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
      expect(image?.getAttribute('loading')).toBeNull()
      expect(image?.getAttribute('decoding')).toBe('async')
      expect(image?.dataset['loadingOwner']).toBe('virtual-list')
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

  it('does not publish a stale thumbnail after session cache disposal', async () => {
    const pending = deferred<Awaited<ReturnType<typeof fileLoader.loadFileSourceById>>>()
    const release = vi.fn()
    vi.spyOn(fileLoader, 'loadFileSourceById').mockReturnValue(pending.promise)
    const model = new FileItemModel()

    model.setThumbnailTarget(IMAGE_ITEM, 'grid')
    await vi.waitFor(() => {
      expect(fileLoader.loadFileSourceById).toHaveBeenCalledTimes(1)
    })

    disposeFileThumbnailCache()
    pending.resolve({
      kind: 'asset-file',
      url: 'blob:stale-thumbnail',
      size: 5,
      mimeType: 'image/webp',
      release,
    })

    await vi.waitFor(() => {
      expect(model.thumbnailUrl()).toBeNull()
      expect(release).toHaveBeenCalledTimes(1)
    })
    model.dispose()
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

  it('updates only consumers of the loaded thumbnail key', async () => {
    const firstPending = deferred<Awaited<ReturnType<typeof fileLoader.loadFileSourceById>>>()
    const secondPending = deferred<Awaited<ReturnType<typeof fileLoader.loadFileSourceById>>>()
    vi.spyOn(fileLoader, 'loadFileSourceById').mockImplementation((fileId) =>
      fileId === IMAGE_ITEM.id ? firstPending.promise : secondPending.promise,
    )
    const first = new FileItemModel()
    const second = new FileItemModel()
    first.setThumbnailTarget(IMAGE_ITEM, 'list')
    second.setThumbnailTarget(SECOND_IMAGE_ITEM, 'list')

    const secondUpdates: Array<string | null> = []
    const unsubscribe = second.thumbnailUrl.subscribe(() => {
      secondUpdates.push(second.thumbnailUrl())
    })
    const initialUpdateCount = secondUpdates.length

    firstPending.resolve({
      kind: 'asset-file',
      url: 'blob:first-reactive-thumbnail',
      size: 5,
      mimeType: 'image/webp',
      release: vi.fn(),
    })

    await vi.waitFor(() => {
      expect(first.thumbnailUrl()).toBe('blob:first-reactive-thumbnail')
    })
    expect(secondUpdates).toHaveLength(initialUpdateCount)

    secondPending.resolve({
      kind: 'asset-file',
      url: 'blob:second-reactive-thumbnail',
      size: 5,
      mimeType: 'image/webp',
      release: vi.fn(),
    })
    await vi.waitFor(() => {
      expect(second.thumbnailUrl()).toBe('blob:second-reactive-thumbnail')
    })

    unsubscribe()
    first.dispose()
    second.dispose()
  })

  it('ignores a stale row lease after a cache generation change', async () => {
    const loadSpy = vi.spyOn(fileLoader, 'loadFileSourceById').mockImplementation(async () => ({
      kind: 'asset-file',
      url: `blob:lease-generation-${loadSpy.mock.calls.length}`,
      size: 5,
      mimeType: 'image/webp',
      release: vi.fn(),
    }))
    const staleModel = new FileItemModel()
    staleModel.setThumbnailTarget(IMAGE_ITEM, 'list')
    await vi.waitFor(() => expect(staleModel.thumbnailUrl()).toBe('blob:lease-generation-1'))

    disposeFileThumbnailCache()
    const currentModel = new FileItemModel()
    currentModel.setThumbnailTarget(IMAGE_ITEM, 'list')
    await vi.waitFor(() => expect(currentModel.thumbnailUrl()).toBe('blob:lease-generation-2'))

    staleModel.dispose()
    suspendFileThumbnailCache()
    resumeFileThumbnailCache()

    await vi.waitFor(() => {
      expect(loadSpy).toHaveBeenCalledTimes(3)
      expect(currentModel.thumbnailUrl()).toBe('blob:lease-generation-3')
    })
    currentModel.dispose()
  })

  it('bounds initial thumbnail prewarm work', async () => {
    const loadSpy = vi.spyOn(fileLoader, 'loadFileSourceById').mockImplementation(async (fileId) => ({
      kind: 'asset-file',
      url: `blob:prewarm-${fileId}`,
      size: 5,
      mimeType: 'image/webp',
      release: vi.fn(),
    }))
    const items = Array.from({length: 40}, (_, index) => ({
      ...IMAGE_ITEM,
      id: 100 + index,
      path: `/prewarm-${index}.jpg`,
      name: `prewarm-${index}.jpg`,
    }))

    await fileThumbnailStore.preload(items)

    expect(loadSpy).toHaveBeenCalledTimes(24)
  })

  it('keeps an in-flight thumbnail load when the same item host reconnects during sorting', async () => {
    const pending = deferred<Awaited<ReturnType<typeof fileLoader.loadFileSourceById>>>()
    const release = vi.fn()
    const loadSpy = vi.spyOn(fileLoader, 'loadFileSourceById').mockReturnValue(pending.promise)
    const element = document.createElement('file-item-desktop') as FileItem
    element.item = IMAGE_ITEM
    element.viewMode = 'list'
    document.body.appendChild(element)
    await settle(element)

    await vi.waitFor(() => {
      expect(loadSpy).toHaveBeenCalledTimes(1)
    })

    element.remove()
    document.body.appendChild(element)
    await settle(element)

    pending.resolve({
      kind: 'asset-file',
      url: 'blob:sort-reconnected-thumbnail',
      size: 5,
      mimeType: 'image/webp',
      release,
    })

    await vi.waitFor(() => {
      expect(
        element.shadowRoot?.querySelector<HTMLImageElement>('img.thumbnail-image')?.getAttribute('src'),
      ).toBe('blob:sort-reconnected-thumbnail')
    })
    expect(loadSpy).toHaveBeenCalledTimes(1)
    expect(release).not.toHaveBeenCalled()
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

  it('keeps an in-flight thumbnail across virtualized remounts', async () => {
    const pending = deferred<Awaited<ReturnType<typeof fileLoader.loadFileSourceById>>>()
    let loadSignal: AbortSignal | null = null
    vi.spyOn(fileLoader, 'loadFileSourceById').mockImplementation((_id, _name, options) => {
      loadSignal = options?.signal ?? null
      return pending.promise
    })

    const first = document.createElement('file-item-desktop') as FileItem
    first.item = IMAGE_ITEM
    first.viewMode = 'list'
    document.body.appendChild(first)

    await vi.waitFor(() => {
      expect(loadSignal).not.toBeNull()
    })
    first.remove()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(loadSignal?.aborted).toBe(false)

    const second = document.createElement('file-item-desktop') as FileItem
    second.item = IMAGE_ITEM
    second.viewMode = 'list'
    document.body.appendChild(second)
    await second.updateComplete

    pending.resolve({
      kind: 'asset-file',
      url: 'blob:virtualized-in-flight-thumbnail',
      size: 5,
      mimeType: 'image/webp',
      release: vi.fn(),
    })

    await vi.waitFor(() => {
      expect(fileLoader.loadFileSourceById).toHaveBeenCalledTimes(1)
      expect(
        second.shadowRoot?.querySelector<HTMLImageElement>('img.thumbnail-image')?.getAttribute('src'),
      ).toBe('blob:virtualized-in-flight-thumbnail')
    })
  })

  it('suspends released native sources and resumes retained thumbnails after foreground', async () => {
    const firstRelease = vi.fn()
    const secondRelease = vi.fn()
    const loadSpy = vi
      .spyOn(fileLoader, 'loadFileSourceById')
      .mockResolvedValueOnce({
        kind: 'asset-file',
        url: 'blob:before-background',
        size: 5,
        mimeType: 'image/webp',
        release: firstRelease,
      })
      .mockResolvedValueOnce({
        kind: 'asset-file',
        url: 'blob:after-foreground',
        size: 5,
        mimeType: 'image/webp',
        release: secondRelease,
      })

    const element = document.createElement('file-item-desktop') as FileItem
    element.item = IMAGE_ITEM
    element.viewMode = 'list'
    document.body.appendChild(element)

    await vi.waitFor(() => {
      expect(element.shadowRoot?.querySelector('img.thumbnail-image')?.getAttribute('src')).toBe(
        'blob:before-background',
      )
    })

    suspendFileThumbnailCache()
    await vi.waitFor(() => {
      expect(element.shadowRoot?.querySelector('img.thumbnail-image')).toBeNull()
    })
    expect(firstRelease).toHaveBeenCalledTimes(1)

    resumeFileThumbnailCache()
    await vi.waitFor(() => {
      expect(loadSpy).toHaveBeenCalledTimes(2)
      expect(element.shadowRoot?.querySelector('img.thumbnail-image')?.getAttribute('src')).toBe(
        'blob:after-foreground',
      )
    })

    expect(fileThumbnailStore.read(getFileThumbnailKey(IMAGE_ITEM))).toMatchObject({
      status: 'loaded',
      url: 'blob:after-foreground',
    })

    element.remove()
    resetFileThumbnailCacheForTests()
    expect(secondRelease).toHaveBeenCalledTimes(1)
  })
})
