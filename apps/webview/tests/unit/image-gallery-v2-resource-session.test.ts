import {afterEach, describe, expect, it, vi} from 'vitest'

import {
  GalleryResourceStore,
  resetGalleryResourceStoreSharedCacheForTests,
} from '../../src/features/media/components/image-gallery-v2/gallery-resource-store'
import {getGalleryAssetKey} from '../../src/features/media/components/image-gallery-v2/gallery-asset-identity'
import {
  getGalleryPanelSnapshotDebugReason,
  ImageGallerySessionModel,
} from '../../src/features/media/components/image-gallery-v2/gallery-session.model'
import type {GalleryImage} from '../../src/features/media/components/image-gallery-v2/gallery.types'
import {FileLoadError, type loadFileSourceById} from '../../src/features/media/components/file-loader'
import {resetImageDisplaySchedulerForTests} from '../../src/features/media/components/image-display-scheduler'
import {resetImageDerivativePrewarmForTests} from '../../src/features/media/components/image-derivative-prewarm'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'

type LoadSourceById = typeof loadFileSourceById
type LoadResult = Awaited<ReturnType<LoadSourceById>>

const images: GalleryImage[] = [
  {id: 1, name: 'one.jpg', path: '/one.jpg', mimeType: 'image/jpeg'},
  {id: 2, name: 'two.jpg', path: '/two.jpg', mimeType: 'image/jpeg'},
  {id: 3, name: 'three.jpg', path: '/three.jpg', mimeType: 'image/jpeg'},
  {id: 4, name: 'four.jpg', path: '/four.jpg', mimeType: 'image/jpeg'},
  {id: 5, name: 'five.jpg', path: '/five.jpg', mimeType: 'image/jpeg'},
]

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return {promise, resolve, reject}
}

function result(url: string, size = 4, release = vi.fn()): LoadResult {
  return {
    kind: 'asset-file',
    url,
    size,
    mimeType: 'image/webp',
    release,
  }
}

describe('image gallery v2 resource/session core', () => {
  afterEach(() => {
    localStorage.removeItem('chromvoid:image-gallery-debug')
    resetGalleryResourceStoreSharedCacheForTests()
    resetImageDisplaySchedulerForTests()
    resetImageDerivativePrewarmForTests()
    resetRuntimeCapabilities()
  })

  it('classifies panel snapshot debug reasons for loader profiling', () => {
    expect(
      getGalleryPanelSnapshotDebugReason({
        hasPreviewSrc: true,
        hasThumbnailSrc: false,
        loading: true,
        error: null,
      }),
    ).toBe('has-preview')
    expect(
      getGalleryPanelSnapshotDebugReason({
        hasPreviewSrc: false,
        hasThumbnailSrc: false,
        loading: false,
        error: 'Unable to display image',
      }),
    ).toBe('error')
    expect(
      getGalleryPanelSnapshotDebugReason({
        hasPreviewSrc: false,
        hasThumbnailSrc: false,
        loading: true,
        error: null,
      }),
    ).toBe('loading-preview')
    expect(
      getGalleryPanelSnapshotDebugReason({
        hasPreviewSrc: false,
        hasThumbnailSrc: true,
        loading: false,
        error: null,
      }),
    ).toBe('thumbnail-only')
    expect(
      getGalleryPanelSnapshotDebugReason({
        hasPreviewSrc: false,
        hasThumbnailSrc: false,
        loading: false,
        error: null,
      }),
    ).toBe('no-preview-not-loading')
  })

  it('owns derivative sources and releases unretained cached assets', async () => {
    const release = vi.fn()
    const loadSourceById = vi.fn<LoadSourceById>(async (fileId, _name, options) =>
      result(`blob:${fileId}:${options?.variant}`, 4, release),
    )
    const store = new GalleryResourceStore({loadSourceById})

    const asset = await store.loadDisplayAsset(images[0], 'preview-image', 'current')

    expect(asset.url).toBe('blob:1:preview-image')
    expect(store.peek(1, ['preview-image'])).toEqual(asset)
    expect(store.getDebugSnapshot()).toMatchObject({
      cachedAssetCount: 1,
      objectUrlCount: 1,
      revokedObjectUrlCount: 0,
    })

    store.retain(new Set())

    expect(release).toHaveBeenCalledTimes(1)
    expect(store.getDebugSnapshot()).toMatchObject({
      cachedAssetCount: 0,
      objectUrlCount: 0,
      revokedObjectUrlCount: 1,
    })
  })

  it('uses image source version in gallery resource cache identity', async () => {
    const releases = new Map<number, ReturnType<typeof vi.fn>>()
    const loadSourceById = vi.fn<LoadSourceById>(async (fileId, _name, options) => {
      const release = vi.fn()
      releases.set(options?.lastModified ?? 0, release)
      return result(`blob:${fileId}:${options?.variant}:${options?.lastModified ?? 0}`, 4, release)
    })
    const store = new GalleryResourceStore({loadSourceById})
    const firstVersion = {...images[0], lastModified: 100}
    const secondVersion = {...images[0], lastModified: 200}

    const firstAsset = await store.loadDisplayAsset(firstVersion, 'preview-image', 'current')
    const secondAsset = await store.loadDisplayAsset(secondVersion, 'preview-image', 'current')

    expect(firstAsset.url).toBe('blob:1:preview-image:100')
    expect(secondAsset.url).toBe('blob:1:preview-image:200')
    expect(loadSourceById).toHaveBeenCalledTimes(2)
    expect(store.peekImage(firstVersion, ['preview-image'])).toEqual(firstAsset)
    expect(store.peekImage(secondVersion, ['preview-image'])).toEqual(secondAsset)
    expect(store.getDebugSnapshot()).toMatchObject({cachedAssetCount: 2})

    store.retain(new Set([getGalleryAssetKey(secondVersion, 'preview-image')]))

    expect(releases.get(100)).toHaveBeenCalledTimes(1)
    expect(releases.get(200)).not.toHaveBeenCalled()
    expect(store.peekImage(firstVersion, ['preview-image'])).toBeNull()
    expect(store.peekImage(secondVersion, ['preview-image'])).toEqual(secondAsset)
  })

  it('caches deterministic derivative failures at the gallery resource layer', async () => {
    const loadSourceById = vi.fn<LoadSourceById>(() =>
      Promise.reject(new FileLoadError('DERIVATIVE_UNAVAILABLE', 'DERIVATIVE_UNAVAILABLE:thumbnail-image')),
    )
    const store = new GalleryResourceStore({loadSourceById})

    await expect(store.loadDisplayAsset(images[0], 'thumbnail-image', 'thumbnail')).rejects.toMatchObject({
      code: 'DERIVATIVE_UNAVAILABLE',
    })

    expect(loadSourceById).toHaveBeenCalledTimes(1)
    expect(store.peekFailure(images[0], 'thumbnail-image')).toMatchObject({
      assetKey: getGalleryAssetKey(images[0], 'thumbnail-image'),
      imageId: 1,
      variant: 'thumbnail-image',
      code: 'DERIVATIVE_UNAVAILABLE',
      message: 'DERIVATIVE_UNAVAILABLE:thumbnail-image',
      firstFailedAt: expect.any(Number),
    })
    expect(store.getDebugSnapshot()).toMatchObject({
      failedAssetCount: 1,
      failedAssetKeys: [getGalleryAssetKey(images[0], 'thumbnail-image')],
      inFlightCount: 0,
      loadingImageIds: [],
    })

    await expect(store.loadDisplayAsset(images[0], 'thumbnail-image', 'thumbnail')).rejects.toMatchObject({
      code: 'DERIVATIVE_UNAVAILABLE',
    })

    expect(loadSourceById).toHaveBeenCalledTimes(1)
  })

  it('reuses loaded thumbnail assets across gallery resource store instances', async () => {
    const release = vi.fn()
    const loadSourceById = vi.fn<LoadSourceById>(async (fileId, _name, options) =>
      result(`blob:${fileId}:${options?.variant}`, 4, release),
    )
    const firstStore = new GalleryResourceStore({loadSourceById})

    const firstAsset = await firstStore.loadDisplayAsset(images[0], 'thumbnail-image', 'thumbnail')
    firstStore.cleanup()

    expect(loadSourceById).toHaveBeenCalledTimes(1)
    expect(release).not.toHaveBeenCalled()

    const secondStore = new GalleryResourceStore({loadSourceById})
    const secondAsset = await secondStore.loadDisplayAsset(images[0], 'thumbnail-image', 'thumbnail')

    expect(secondAsset).toEqual(firstAsset)
    expect(loadSourceById).toHaveBeenCalledTimes(1)

    secondStore.cleanup()
    expect(release).not.toHaveBeenCalled()

    resetGalleryResourceStoreSharedCacheForTests()
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('does not reuse deterministic failure cache across image source versions', async () => {
    const loadSourceById = vi
      .fn<LoadSourceById>()
      .mockRejectedValueOnce(
        new FileLoadError('DERIVATIVE_UNAVAILABLE', 'DERIVATIVE_UNAVAILABLE:preview-image'),
      )
      .mockResolvedValue(result('blob:1:preview-image:200'))
    const store = new GalleryResourceStore({loadSourceById})
    const firstVersion = {...images[0], lastModified: 100}
    const secondVersion = {...images[0], lastModified: 200}

    await expect(store.loadDisplayAsset(firstVersion, 'preview-image', 'current')).rejects.toMatchObject({
      code: 'DERIVATIVE_UNAVAILABLE',
    })
    const loaded = await store.loadDisplayAsset(secondVersion, 'preview-image', 'current')

    expect(loaded.url).toBe('blob:1:preview-image:200')
    expect(loadSourceById).toHaveBeenCalledTimes(2)
    expect(store.hasFailed(firstVersion, 'preview-image')).toBe(true)
    expect(store.hasFailed(secondVersion, 'preview-image')).toBe(false)
  })

  it('does not cache aborted gallery loads as deterministic failures', async () => {
    const loadSourceById = vi.fn<LoadSourceById>(() =>
      Promise.reject(new DOMException('Aborted', 'AbortError')),
    )
    const store = new GalleryResourceStore({loadSourceById})

    await expect(store.loadDisplayAsset(images[0], 'preview-image', 'current')).rejects.toMatchObject({
      name: 'AbortError',
    })
    await expect(store.loadDisplayAsset(images[0], 'preview-image', 'current')).rejects.toMatchObject({
      name: 'AbortError',
    })

    expect(loadSourceById).toHaveBeenCalledTimes(2)
    expect(store.hasFailed(images[0], 'preview-image')).toBe(false)
    expect(store.getDebugSnapshot()).toMatchObject({failedAssetCount: 0})
  })

  it('logs cache miss, in-flight join, and cache hit profiling events', async () => {
    localStorage.setItem('chromvoid:image-gallery-debug', '1')
    setRuntimeCapabilities({platform: 'android', mobile: true})
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const pending = deferred<LoadResult>()
    const loadSourceById = vi.fn<LoadSourceById>(() => pending.promise)
    const store = new GalleryResourceStore({loadSourceById})
    let firstLoad: Promise<unknown> | null = null
    let joinedLoad: Promise<unknown> | null = null

    try {
      firstLoad = store.loadDisplayAsset(images[0], 'preview-image', 'current')

      await vi.waitFor(() => {
        expect(loadSourceById).toHaveBeenCalledTimes(1)
      })

      joinedLoad = store.loadDisplayAsset(images[0], 'preview-image', 'current')

      await vi.waitFor(() => {
        const messages = info.mock.calls.map(([message]) => String(message))
        expect(messages.some((message) => message.includes('load.cache-miss'))).toBe(true)
        expect(messages.some((message) => message.includes('load.join-inflight'))).toBe(true)
      })

      pending.resolve(result('blob:1:preview-image'))
      await Promise.all([firstLoad, joinedLoad])
      await store.loadDisplayAsset(images[0], 'preview-image', 'current')

      const messages = info.mock.calls.map(([message]) => String(message))
      expect(messages.some((message) => message.includes('load.cache-hit'))).toBe(true)
    } finally {
      pending.resolve(result('blob:1:preview-image'))
      await Promise.allSettled([firstLoad, joinedLoad].filter(Boolean))
      info.mockRestore()
    }
  })

  it('retains matching in-flight loads when aborting an intent with retain keys', async () => {
    const pending = new Map<number, ReturnType<typeof deferred<LoadResult>>>()
    const loadSourceById = vi.fn<LoadSourceById>((fileId, _name, options) => {
      const item = deferred<LoadResult>()
      pending.set(fileId, item)
      options?.signal?.addEventListener(
        'abort',
        () => item.reject(new DOMException('Aborted', 'AbortError')),
        {once: true},
      )
      return item.promise
    })
    const store = new GalleryResourceStore({loadSourceById})

    const first = store.loadDisplayAsset(images[0], 'thumbnail-image', 'thumbnail')
    const second = store.loadDisplayAsset(images[1], 'thumbnail-image', 'thumbnail')
    const third = store.loadDisplayAsset(images[2], 'thumbnail-image', 'thumbnail')

    await vi.waitFor(() => {
      expect(loadSourceById).toHaveBeenCalledTimes(2)
    })

    const abortResult = store.abortIntent('thumbnail', {
      retainAssetKeys: new Set([
        getGalleryAssetKey(images[1], 'thumbnail-image'),
        getGalleryAssetKey(images[2], 'thumbnail-image'),
      ]),
      reason: 'test-retain',
    })

    expect(abortResult).toEqual({abortedCount: 1, retainedCount: 2})
    await expect(first).rejects.toMatchObject({name: 'AbortError'})
    expect(store.hasInFlight(1, 'thumbnail-image')).toBe(false)
    expect(store.hasInFlight(2, 'thumbnail-image')).toBe(true)
    expect(store.hasInFlight(3, 'thumbnail-image')).toBe(true)

    pending.get(2)?.resolve(result('blob:2:thumbnail-image'))
    await expect(second).resolves.toMatchObject({url: 'blob:2:thumbnail-image'})

    await vi.waitFor(() => {
      expect(loadSourceById).toHaveBeenCalledTimes(3)
    })
    pending.get(3)?.resolve(result('blob:3:thumbnail-image'))
    await expect(third).resolves.toMatchObject({url: 'blob:3:thumbnail-image'})
  })

  it('keeps preview panel loading independent from thumbnail-only loads', async () => {
    const thumbnail = deferred<LoadResult>()
    const loadSourceById = vi.fn<LoadSourceById>((fileId, _name, options) => {
      if (options?.variant === 'thumbnail-image') {
        return thumbnail.promise
      }

      return Promise.resolve(result(`blob:${fileId}:${options?.variant}`))
    })
    const session = new ImageGallerySessionModel({loadSourceById})

    session.setImages(images, 1)
    session.primeThumbnailWindow(1, 0)

    await vi.waitFor(() => {
      expect(loadSourceById).toHaveBeenCalledWith(
        2,
        'two.jpg',
        expect.objectContaining({variant: 'thumbnail-image'}),
      )
    })

    expect(session.getDebugSnapshot().loadingImageIds).toEqual([2])
    expect(session.getPanelSnapshot(1, 'current')).toMatchObject({
      imageId: 2,
      src: null,
      loading: false,
      error: null,
    })
    expect(session.getThumbnailSnapshot(1)).toMatchObject({
      imageId: 2,
      src: null,
      loading: true,
    })

    thumbnail.resolve(result('blob:2:thumbnail-image'))

    await vi.waitFor(() => {
      expect(session.getThumbnailSnapshot(1).src).toBe('blob:2:thumbnail-image')
    })
  })

  it('skips known failed thumbnail assets without marking thumbnails as loading', async () => {
    const loadSourceById = vi.fn<LoadSourceById>((fileId, _name, options) => {
      if (fileId === 2 && options?.variant === 'thumbnail-image') {
        return Promise.reject(
          new FileLoadError('DERIVATIVE_UNAVAILABLE', 'DERIVATIVE_UNAVAILABLE:thumbnail-image'),
        )
      }

      return Promise.resolve(result(`blob:${fileId}:${options?.variant}`))
    })
    const session = new ImageGallerySessionModel({loadSourceById})

    session.setImages(images, 1)
    session.primeThumbnailWindow(1, 0)

    await vi.waitFor(() => {
      expect(session.getDebugSnapshot()).toMatchObject({
        failedAssetCount: 1,
        failedAssetKeys: [getGalleryAssetKey(images[1], 'thumbnail-image')],
      })
    })
    expect(session.getThumbnailSnapshot(1)).toMatchObject({
      imageId: 2,
      src: null,
      loading: false,
    })

    session.primeThumbnailWindow(2, 1)

    await vi.waitFor(() => {
      expect(loadSourceById.mock.calls.map(([fileId]) => fileId)).toEqual([2, 3, 4])
    })

    session.primeThumbnailWindow(1, 1)

    await vi.waitFor(() => {
      expect(loadSourceById.mock.calls.map(([fileId]) => fileId)).toEqual([2, 3, 4, 1])
    })
    expect(
      loadSourceById.mock.calls.filter(
        ([fileId, , options]) => fileId === 2 && options?.variant === 'thumbnail-image',
      ),
    ).toHaveLength(1)
    expect(session.getThumbnailSnapshot(1)).toMatchObject({
      imageId: 2,
      src: null,
      loading: false,
    })
  })

  it('remembers failed neighbor previews and skips repeated neighbor priming', async () => {
    const loadSourceById = vi.fn<LoadSourceById>((fileId, _name, options) => {
      if (fileId === 3 && options?.variant === 'preview-image') {
        return Promise.reject(new Error('preview unavailable'))
      }

      return Promise.resolve(result(`blob:${fileId}:${options?.variant}`))
    })
    const session = new ImageGallerySessionModel({loadSourceById})

    session.setImages(images, 1)
    session.primeDirectionalNeighbor(1)

    await vi.waitFor(() => {
      expect(session.getPanelSnapshot(2, 'next')).toMatchObject({
        imageId: 3,
        src: null,
        loading: false,
        error: 'preview unavailable',
      })
    })
    expect(loadSourceById).toHaveBeenCalledTimes(1)

    session.primeDirectionalNeighbor(1)

    expect(loadSourceById).toHaveBeenCalledTimes(1)
    expect(session.getPanelSnapshot(2, 'next')).toMatchObject({
      imageId: 3,
      src: null,
      loading: false,
      error: 'preview unavailable',
    })
  })

  it('retains an in-flight neighbor preview when navigating onto that image', async () => {
    const pending = new Map<number, ReturnType<typeof deferred<LoadResult>>>()
    const loadSourceById = vi.fn<LoadSourceById>((fileId, _name, options) => {
      const item = deferred<LoadResult>()
      pending.set(fileId, item)
      options?.signal?.addEventListener(
        'abort',
        () => item.reject(new DOMException('Aborted', 'AbortError')),
        {once: true},
      )
      return item.promise
    })
    const session = new ImageGallerySessionModel({loadSourceById})

    session.setImages(images, 0)
    session.primeDirectionalNeighbor(1)

    await vi.waitFor(() => {
      expect(loadSourceById).toHaveBeenCalledWith(
        2,
        'two.jpg',
        expect.objectContaining({variant: 'preview-image'}),
      )
    })

    session.navigate(1)

    await vi.waitFor(() => {
      expect(session.currentPanel()).toMatchObject({
        imageId: 2,
        src: null,
        loading: true,
        error: null,
      })
    })
    expect(
      loadSourceById.mock.calls.filter(
        ([fileId, , options]) => fileId === 2 && options?.variant === 'preview-image',
      ),
    ).toHaveLength(1)

    pending.get(2)?.resolve(result('blob:2:preview-image'))

    await vi.waitFor(() => {
      expect(session.currentPanel()).toMatchObject({
        imageId: 2,
        src: 'blob:2:preview-image',
        loading: false,
        error: null,
      })
    })
  })

  it('logs successful neighbor completion with explicit success status', async () => {
    localStorage.setItem('chromvoid:image-gallery-debug', '1')
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const loadSourceById = vi.fn<LoadSourceById>((fileId, _name, options) =>
      Promise.resolve(result(`blob:${fileId}:${options?.variant}`)),
    )
    const session = new ImageGallerySessionModel({loadSourceById})

    try {
      session.setImages(images, 1)
      session.primeDirectionalNeighbor(1)

      await vi.waitFor(() => {
        const done = info.mock.calls.find(([message]) => String(message).includes('prime-neighbor.done'))
        expect(done?.[1]).toMatchObject({
          imageId: 3,
          status: 'success',
        })
      })
    } finally {
      info.mockRestore()
    }
  })

  it('logs failed neighbor completion with explicit error status', async () => {
    localStorage.setItem('chromvoid:image-gallery-debug', '1')
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const loadSourceById = vi.fn<LoadSourceById>((fileId, _name, options) => {
      if (fileId === 3 && options?.variant === 'preview-image') {
        return Promise.reject(new Error('preview unavailable'))
      }

      return Promise.resolve(result(`blob:${fileId}:${options?.variant}`))
    })
    const session = new ImageGallerySessionModel({loadSourceById})

    try {
      session.setImages(images, 1)
      session.primeDirectionalNeighbor(1)

      await vi.waitFor(() => {
        const done = info.mock.calls.find(([message]) => String(message).includes('prime-neighbor.done'))
        expect(done?.[1]).toMatchObject({
          imageId: 3,
          status: 'error',
        })
      })
      expect(warn.mock.calls.some(([message]) => String(message).includes('prime-neighbor.error'))).toBe(true)
      expect(session.getPanelSnapshot(2, 'next')).toMatchObject({
        imageId: 3,
        src: null,
        loading: false,
        error: 'preview unavailable',
      })
    } finally {
      info.mockRestore()
      warn.mockRestore()
    }
  })

  it('keeps current panel errors visible while retrying a failed preview', async () => {
    const retry = deferred<LoadResult>()
    let previewCalls = 0
    const loadSourceById = vi.fn<LoadSourceById>((fileId, _name, options) => {
      if (fileId === 3 && options?.variant === 'preview-image') {
        previewCalls += 1
        if (previewCalls === 1) {
          return Promise.reject(new Error('preview unavailable'))
        }

        return retry.promise
      }

      return Promise.resolve(result(`blob:${fileId}:${options?.variant}`))
    })
    const session = new ImageGallerySessionModel({loadSourceById})

    session.setImages(images, 2)
    await session.loadCurrent()

    expect(session.currentPanel()).toMatchObject({
      imageId: 3,
      src: null,
      loading: false,
      error: 'preview unavailable',
    })

    const retryLoad = session.loadCurrent()

    await vi.waitFor(() => {
      expect(previewCalls).toBe(2)
    })
    expect(session.currentPanel()).toMatchObject({
      imageId: 3,
      src: null,
      loading: false,
      error: 'preview unavailable',
    })

    retry.resolve(result('blob:3:preview-image'))
    await retryLoad

    expect(session.currentPanel()).toMatchObject({
      imageId: 3,
      src: 'blob:3:preview-image',
      loading: false,
      error: null,
    })
  })

  it('reuses known deterministic current preview failures without scheduler churn', async () => {
    const loadSourceById = vi.fn<LoadSourceById>((fileId, _name, options) => {
      if (fileId === 3 && options?.variant === 'preview-image') {
        return Promise.reject(
          new FileLoadError('DERIVATIVE_UNAVAILABLE', 'DERIVATIVE_UNAVAILABLE:preview-image'),
        )
      }

      return Promise.resolve(result(`blob:${fileId}:${options?.variant}`))
    })
    const session = new ImageGallerySessionModel({loadSourceById})

    session.setImages(images, 2)
    await session.loadCurrent()

    expect(session.currentPanel()).toMatchObject({
      imageId: 3,
      src: null,
      loading: false,
      error: 'DERIVATIVE_UNAVAILABLE:preview-image',
    })
    expect(session.getDebugSnapshot()).toMatchObject({
      failedAssetCount: 1,
      failedAssetKeys: [getGalleryAssetKey(images[2], 'preview-image')],
    })

    await session.loadCurrent()

    expect(loadSourceById).toHaveBeenCalledTimes(1)
    expect(session.currentPanel()).toMatchObject({
      imageId: 3,
      src: null,
      loading: false,
      error: 'DERIVATIVE_UNAVAILABLE:preview-image',
    })
  })

  it('routes gallery thumbnail loads through the global scheduler cap', async () => {
    const galleryImages = Array.from(
      {length: 6},
      (_, index): GalleryImage => ({
        id: index + 1,
        name: `image-${index + 1}.jpg`,
        path: `/image-${index + 1}.jpg`,
        mimeType: 'image/jpeg',
      }),
    )
    const pending = new Map<number, ReturnType<typeof deferred<LoadResult>>>()
    let activeLoads = 0
    let maxActiveLoads = 0
    const loadSourceById = vi.fn<LoadSourceById>((fileId, _name, options) => {
      activeLoads += 1
      maxActiveLoads = Math.max(maxActiveLoads, activeLoads)
      const item = deferred<LoadResult>()
      pending.set(fileId, item)
      return item.promise.finally(() => {
        activeLoads -= 1
      })
    })
    const store = new GalleryResourceStore({loadSourceById})

    const loads = galleryImages.map((image) => store.loadDisplayAsset(image, 'thumbnail-image', 'thumbnail'))

    await vi.waitFor(() => {
      expect(loadSourceById).toHaveBeenCalledTimes(2)
    })
    expect(maxActiveLoads).toBe(2)

    pending.get(1)?.resolve(result('blob:1:thumbnail-image'))

    await vi.waitFor(() => {
      expect(loadSourceById).toHaveBeenCalledTimes(3)
    })

    for (const [fileId, item] of pending) {
      item.resolve(result(`blob:${fileId}:thumbnail-image`))
    }

    await vi.waitFor(() => {
      expect(loadSourceById).toHaveBeenCalledTimes(5)
    })
    for (const [fileId, item] of pending) {
      item.resolve(result(`blob:${fileId}:thumbnail-image`))
    }

    await vi.waitFor(() => {
      expect(loadSourceById).toHaveBeenCalledTimes(6)
    })
    for (const [fileId, item] of pending) {
      item.resolve(result(`blob:${fileId}:thumbnail-image`))
    }

    await Promise.all(loads)

    expect(maxActiveLoads).toBe(2)
  })

  it('bounds virtual thumbnail rendering and priming for large galleries', async () => {
    const largeImages = Array.from(
      {length: 1000},
      (_, index): GalleryImage => ({
        id: index + 1,
        name: `image-${index + 1}.jpg`,
        path: `/image-${index + 1}.jpg`,
        mimeType: 'image/jpeg',
      }),
    )
    const loadSourceById = vi.fn<LoadSourceById>(async (fileId, _name, options) =>
      result(`blob:${fileId}:${options?.variant}`),
    )
    const session = new ImageGallerySessionModel({loadSourceById})

    session.setImages(largeImages, 500)
    session.setThumbnailViewportMetrics({viewportWidth: 4000, thumbnailStepPx: 64})

    const virtualWindow = session.getThumbnailVirtualWindow()
    expect(virtualWindow.indices.length).toBeLessThanOrEqual(32)
    expect(virtualWindow.indices).toContain(500)

    session.primeThumbnailVirtualWindow(500)

    await vi.waitFor(() => {
      expect(loadSourceById).toHaveBeenCalled()
    })
    expect(loadSourceById.mock.calls.length).toBeLessThanOrEqual(48)
    expect(loadSourceById.mock.calls.every(([, , options]) => options?.variant === 'thumbnail-image')).toBe(
      true,
    )
  })

  it('renders the whole virtual thumbnail strip for galleries within the render cap', () => {
    const cappedImages = Array.from(
      {length: 25},
      (_, index): GalleryImage => ({
        id: index + 1,
        name: `image-${index + 1}.jpg`,
        path: `/image-${index + 1}.jpg`,
        mimeType: 'image/jpeg',
      }),
    )
    const session = new ImageGallerySessionModel()

    session.setImages(cappedImages, 0)
    session.setThumbnailViewportMetrics({viewportWidth: 320, thumbnailStepPx: 64})

    const virtualWindow = session.getThumbnailVirtualWindow()
    expect(virtualWindow.indices).toEqual(cappedImages.map((_, index) => index))
    expect(virtualWindow.beforeCount).toBe(0)
    expect(virtualWindow.afterCount).toBe(0)
  })

  it('keeps display physical slots and derivative prewarm ids bounded for large galleries', () => {
    const largeImages = Array.from(
      {length: 1000},
      (_, index): GalleryImage => ({
        id: index + 1,
        name: `image-${index + 1}.jpg`,
        path: `/image-${index + 1}.jpg`,
        mimeType: 'image/jpeg',
      }),
    )
    const session = new ImageGallerySessionModel()

    session.setImages(largeImages, 500)

    const displayWindow = session.getDisplayWindowSnapshot()
    expect(displayWindow.physicalSlots).toEqual([
      {slotId: 'previous', role: 'previous', imageIndex: 499, imageId: 500},
      {slotId: 'current', role: 'current', imageIndex: 500, imageId: 501},
      {slotId: 'next', role: 'next', imageIndex: 501, imageId: 502},
    ])
    expect(displayWindow.preparedRetentionIds).toEqual([500, 501, 502])
    expect(displayWindow.derivativePrewarmIds).toEqual([])

    const debug = session.getDebugSnapshot()
    expect(debug).toMatchObject({
      activePhysicalSlots: displayWindow.physicalSlots,
      retainedPreparedSourceIds: [500, 501, 502],
      prewarmImageIds: [],
      thumbnailVirtualWindow: expect.objectContaining({maxRendered: 32}),
      scheduler: expect.objectContaining({
        activeByType: expect.any(Object),
        queuedByType: expect.any(Object),
        queuedByPriority: expect.any(Object),
      }),
      renderFailureCount: 0,
      purgeCount: 0,
      releaseCount: 0,
    })
  })

  it('retains recently viewed preview sources for back-and-forth navigation', async () => {
    const releases = new Map<number, ReturnType<typeof vi.fn>>()
    const loadSourceById = vi.fn<LoadSourceById>(async (fileId, _name, options) => {
      const release = vi.fn()
      releases.set(fileId, release)
      return result(`blob:${fileId}:${options?.variant}`, 4, release)
    })
    const session = new ImageGallerySessionModel({loadSourceById})

    session.setImages(images, 0)
    await session.loadCurrent()
    session.navigate(1)

    await vi.waitFor(() => {
      expect(session.getPanelSnapshot(1, 'current').src).toBe('blob:2:preview-image')
    })

    session.navigate(2)

    await vi.waitFor(() => {
      expect(session.getPanelSnapshot(2, 'current').src).toBe('blob:3:preview-image')
    })

    expect(releases.get(1)).not.toHaveBeenCalled()

    session.navigate(0)

    await vi.waitFor(() => {
      expect(session.getPanelSnapshot(0, 'current').src).toBe('blob:1:preview-image')
    })

    const previewLoadsForFirstImage = loadSourceById.mock.calls.filter(
      ([fileId, , options]) => fileId === 1 && options?.variant === 'preview-image',
    )
    expect(previewLoadsForFirstImage).toHaveLength(1)
  })

  it('does not retain stale preview cache when an image source version changes', async () => {
    const releases = new Map<number, ReturnType<typeof vi.fn>>()
    const loadSourceById = vi.fn<LoadSourceById>(async (fileId, _name, options) => {
      const release = vi.fn()
      releases.set(options?.lastModified ?? 0, release)
      return result(`blob:${fileId}:${options?.variant}:${options?.lastModified ?? 0}`, 4, release)
    })
    const session = new ImageGallerySessionModel({loadSourceById})

    session.setImages([{...images[0], lastModified: 100}], 0)
    await session.loadCurrent()

    expect(session.currentPanel().src).toBe('blob:1:preview-image:100')

    session.setImages([{...images[0], lastModified: 200}], 0)
    await session.loadCurrent()

    expect(loadSourceById).toHaveBeenCalledTimes(2)
    expect(releases.get(100)).toHaveBeenCalledTimes(1)
    expect(releases.get(200)).not.toHaveBeenCalled()
    expect(session.currentPanel().src).toBe('blob:1:preview-image:200')
  })

  it('does not prewarm full preview derivatives after current display', async () => {
    const largeImages = Array.from(
      {length: 1000},
      (_, index): GalleryImage => ({
        id: index + 1,
        name: `image-${index + 1}.jpg`,
        path: `/image-${index + 1}.jpg`,
        mimeType: 'image/jpeg',
      }),
    )
    const loadSourceById = vi.fn<LoadSourceById>(async (fileId, _name, options) =>
      result(`blob:${fileId}:${options?.variant}`),
    )
    const prewarmDerivative = vi.fn(() => Promise.resolve())
    const session = new ImageGallerySessionModel({loadSourceById, prewarmDerivative})

    session.setImages(largeImages, 10)
    await session.loadCurrent()

    expect(prewarmDerivative).not.toHaveBeenCalled()

    session.navigate(100)

    await vi.waitFor(() => {
      expect(session.currentPanel()).toMatchObject({imageId: 101, src: 'blob:101:preview-image'})
    })
    expect(prewarmDerivative).not.toHaveBeenCalled()
  })

  it('releases rendered gallery preview sources and marks display errors', async () => {
    const release = vi.fn()
    const loadSourceById = vi.fn<LoadSourceById>(async (fileId, _name, options) =>
      result(`blob:${fileId}:${options?.variant}`, 4, release),
    )
    const session = new ImageGallerySessionModel({loadSourceById})

    session.setImages(images, 0)
    await session.loadCurrent()

    const loadedPanel = session.getPanelSnapshot(0, 'current')
    expect(loadedPanel.src).toBe('blob:1:preview-image')

    session.handleImageRenderError(1, 'blob:1:preview-image')

    const failedPanel = session.getPanelSnapshot(0, 'current')
    expect(release).toHaveBeenCalledOnce()
    expect(failedPanel.src).toBeNull()
    expect(failedPanel.error).toBeTruthy()
    expect(loadSourceById).toHaveBeenCalledTimes(1)
    expect(session.getDebugSnapshot()).toMatchObject({
      renderFailureCount: 1,
      releaseCount: 1,
    })
  })

  it('refreshes a rendered thumbnail failure once, then leaves a placeholder on repeat failure', async () => {
    const releases: ReturnType<typeof vi.fn>[] = []
    const loadSourceById = vi.fn<LoadSourceById>(async (fileId, _name, options) => {
      const release = vi.fn()
      releases.push(release)
      return result(`blob:${fileId}:${options?.variant}:${loadSourceById.mock.calls.length}`, 4, release)
    })
    const session = new ImageGallerySessionModel({loadSourceById})

    session.setImages(images, 1)
    session.primeThumbnailWindow(1, 0)

    await vi.waitFor(() => {
      expect(session.getThumbnailSnapshot(1).src).toBe('blob:2:thumbnail-image:1')
    })

    session.handleThumbnailRenderError(2, 'blob:2:thumbnail-image:1')

    await vi.waitFor(() => {
      expect(session.getThumbnailSnapshot(1).src).toBe('blob:2:thumbnail-image:2')
    })
    expect(releases[0]!).toHaveBeenCalledOnce()
    expect(loadSourceById).toHaveBeenCalledTimes(2)
    expect(loadSourceById.mock.calls[1]?.[2]).toEqual(
      expect.objectContaining({
        variant: 'thumbnail-image',
        derivativeFallback: 'none',
        cachePolicy: 'refresh',
        preparedSourcePolicy: 'skip',
      }),
    )

    session.handleThumbnailRenderError(2, 'blob:2:thumbnail-image:2')

    expect(releases[1]!).toHaveBeenCalledOnce()
    expect(session.getThumbnailSnapshot(1)).toMatchObject({
      imageId: 2,
      src: null,
      loading: false,
    })
    expect(session.getDebugSnapshot()).toMatchObject({
      failedAssetCount: 1,
      failedAssetKeys: [getGalleryAssetKey(images[1], 'thumbnail-image')],
      renderFailureCount: 2,
    })
    expect(loadSourceById).toHaveBeenCalledTimes(2)
  })

  it('ignores stale gallery preview render errors from old urls', async () => {
    const release = vi.fn()
    const loadSourceById = vi.fn<LoadSourceById>(async (fileId, _name, options) =>
      result(`blob:${fileId}:${options?.variant}`, 4, release),
    )
    const session = new ImageGallerySessionModel({loadSourceById})

    session.setImages(images, 0)
    await session.loadCurrent()

    session.handleImageRenderError(1, 'blob:stale-preview')

    const panel = session.getPanelSnapshot(0, 'current')
    expect(release).not.toHaveBeenCalled()
    expect(panel.src).toBe('blob:1:preview-image')
    expect(panel.error).toBeNull()
  })

  it('shifts and primes the virtual thumbnail window from model-owned scroll center intent', async () => {
    const largeImages = Array.from(
      {length: 1000},
      (_, index): GalleryImage => ({
        id: index + 1,
        name: `image-${index + 1}.jpg`,
        path: `/image-${index + 1}.jpg`,
        mimeType: 'image/jpeg',
      }),
    )
    const loadSourceById = vi.fn<LoadSourceById>(async (fileId, _name, options) =>
      result(`blob:${fileId}:${options?.variant}`),
    )
    const session = new ImageGallerySessionModel({loadSourceById})

    session.setImages(largeImages, 500)
    session.setThumbnailViewportMetrics({viewportWidth: 4000, thumbnailStepPx: 64})
    session.setThumbnailScrollCenterIndex(900)

    let virtualWindow = session.getThumbnailVirtualWindow()
    expect(virtualWindow.indices.length).toBeLessThanOrEqual(32)
    expect(virtualWindow.indices).toContain(900)
    await vi.waitFor(() => {
      expect(
        loadSourceById.mock.calls.some(
          ([fileId, , options]) => fileId === 901 && options?.variant === 'thumbnail-image',
        ),
      ).toBe(true)
    })

    session.navigate(500)
    virtualWindow = session.getThumbnailVirtualWindow()
    expect(virtualWindow.indices.length).toBeLessThanOrEqual(32)
    expect(virtualWindow.indices).toContain(500)
  })

  it('shifts programmatic thumbnail scroll center without priming intermediate windows', async () => {
    const largeImages = Array.from(
      {length: 1000},
      (_, index): GalleryImage => ({
        id: index + 1,
        name: `image-${index + 1}.jpg`,
        path: `/image-${index + 1}.jpg`,
        mimeType: 'image/jpeg',
      }),
    )
    const loadSourceById = vi.fn<LoadSourceById>(async (fileId, _name, options) =>
      result(`blob:${fileId}:${options?.variant}`),
    )
    const session = new ImageGallerySessionModel({loadSourceById})

    session.setImages(largeImages, 500)
    session.setThumbnailViewportMetrics({viewportWidth: 4000, thumbnailStepPx: 64})
    session.setThumbnailProgrammaticScrollCenterIndex(700)
    session.setThumbnailProgrammaticScrollCenterIndex(900)

    const virtualWindow = session.getThumbnailVirtualWindow()
    expect(virtualWindow.indices.length).toBeLessThanOrEqual(32)
    expect(virtualWindow.indices).toContain(900)
    expect(loadSourceById).not.toHaveBeenCalled()

    session.primeThumbnailVirtualWindow(900)

    await vi.waitFor(() => {
      expect(
        loadSourceById.mock.calls.some(
          ([fileId, , options]) => fileId === 901 && options?.variant === 'thumbnail-image',
        ),
      ).toBe(true)
    })
  })

  it('rejects aborted loads and releases a late source returned by an ignored abort signal', async () => {
    const pending = deferred<LoadResult>()
    const release = vi.fn()
    const loadSourceById = vi.fn<LoadSourceById>(() => pending.promise)
    const store = new GalleryResourceStore({loadSourceById})

    const load = store.loadDisplayAsset(images[0], 'preview-image', 'current')

    expect(store.getDebugSnapshot()).toMatchObject({
      inFlightCount: 1,
      loadingImageIds: [1],
    })

    store.abortIntent('current')

    await expect(load).rejects.toMatchObject({name: 'AbortError'})
    expect(store.getDebugSnapshot()).toMatchObject({
      inFlightCount: 0,
      loadingImageIds: [],
    })

    pending.resolve(result('blob:late-abort', 4, release))

    await vi.waitFor(() => {
      expect(release).toHaveBeenCalledTimes(1)
    })
  })

  it('keeps stale current loads under scheduler cap and releases their late source', async () => {
    const firstPreview = deferred<LoadResult>()
    const staleRelease = vi.fn()
    const loadSourceById = vi.fn<LoadSourceById>((fileId, _name, options) => {
      if (fileId === 1 && options?.variant === 'preview-image') {
        return firstPreview.promise
      }
      return Promise.resolve(result(`blob:${fileId}:${options?.variant}`))
    })
    const session = new ImageGallerySessionModel({loadSourceById})

    session.setImages(images, 0)
    const firstLoad = session.loadCurrent()

    await vi.waitFor(() => {
      expect(loadSourceById).toHaveBeenCalledWith(
        1,
        'one.jpg',
        expect.objectContaining({variant: 'preview-image'}),
      )
    })

    session.navigate(1)

    expect(loadSourceById).toHaveBeenCalledTimes(1)
    expect(session.currentPanel()).toMatchObject({
      imageIndex: 1,
      imageId: 2,
      src: null,
      error: null,
    })

    firstPreview.resolve(result('blob:stale-current', 4, staleRelease))

    await vi.waitFor(() => {
      expect(staleRelease).toHaveBeenCalledTimes(1)
      expect(loadSourceById).toHaveBeenCalledWith(
        2,
        'two.jpg',
        expect.objectContaining({
          variant: 'preview-image',
          materializationPriority: 500,
        }),
      )
    })

    await vi.waitFor(() => {
      expect(session.currentPanel().src).toBe('blob:2:preview-image')
    })
    await Promise.allSettled([firstLoad])

    expect(session.currentPanel()).toMatchObject({
      imageIndex: 1,
      imageId: 2,
      src: 'blob:2:preview-image',
      error: null,
    })
  })

  it('loads current first, then one directional neighbor, and thumbnails only for the requested window', async () => {
    const current = deferred<LoadResult>()
    const neighbor = deferred<LoadResult>()
    const thumbnailDefers = new Map<number, ReturnType<typeof deferred<LoadResult>>>()
    const loadSourceById = vi.fn<LoadSourceById>((fileId, _name, options) => {
      if (fileId === 3 && options?.variant === 'preview-image') {
        return current.promise
      }
      if (fileId === 4 && options?.variant === 'preview-image') {
        return neighbor.promise
      }
      if (options?.variant === 'thumbnail-image') {
        const item = deferred<LoadResult>()
        thumbnailDefers.set(fileId, item)
        return item.promise
      }
      return Promise.resolve(result(`blob:${fileId}:${options?.variant}`))
    })
    const session = new ImageGallerySessionModel({loadSourceById})

    session.open(images, 2)

    await vi.waitFor(() => {
      expect(session.getDebugSnapshot()).toMatchObject({
        inFlightCount: 1,
        loadingImageIds: [3],
      })
    })
    expect(loadSourceById).toHaveBeenCalledTimes(1)

    current.resolve(result('blob:3:preview-image'))

    await vi.waitFor(() => {
      expect(session.currentPanel().src).toBe('blob:3:preview-image')
      expect(session.getDebugSnapshot()).toMatchObject({
        inFlightCount: 1,
        loadingImageIds: [4],
      })
    })

    session.primeThumbnailWindow(2, 1)

    await vi.waitFor(() => {
      expect(session.getDebugSnapshot().inFlightCount).toBe(4)
    })

    expect(loadSourceById.mock.calls.map(([fileId, , options]) => `${fileId}:${options?.variant}`)).toEqual([
      '3:preview-image',
      '4:preview-image',
      '2:thumbnail-image',
      '3:thumbnail-image',
    ])

    neighbor.resolve(result('blob:4:preview-image'))
    await vi.waitFor(() => {
      expect(loadSourceById.mock.calls.map(([fileId, , options]) => `${fileId}:${options?.variant}`)).toEqual([
        '3:preview-image',
        '4:preview-image',
        '2:thumbnail-image',
        '3:thumbnail-image',
      ])
    })
    for (const [fileId, pending] of Array.from(thumbnailDefers)) {
      pending.resolve(result(`blob:${fileId}:thumbnail-image`))
    }

    await vi.waitFor(() => {
      expect(loadSourceById.mock.calls.map(([fileId, , options]) => `${fileId}:${options?.variant}`)).toEqual([
        '3:preview-image',
        '4:preview-image',
        '2:thumbnail-image',
        '3:thumbnail-image',
        '4:thumbnail-image',
      ])
    })
    for (const [fileId, pending] of thumbnailDefers) {
      pending.resolve(result(`blob:${fileId}:thumbnail-image`))
    }

    await vi.waitFor(() => {
      expect(session.getDebugSnapshot().inFlightCount).toBe(0)
    })
  })

  it('preserves overlapping thumbnail in-flight loads across window shifts', async () => {
    const thumbnailDefers = new Map<number, ReturnType<typeof deferred<LoadResult>>>()
    const loadSourceById = vi.fn<LoadSourceById>((fileId, _name, options) => {
      const item = deferred<LoadResult>()
      thumbnailDefers.set(fileId, item)
      options?.signal?.addEventListener(
        'abort',
        () => item.reject(new DOMException('Aborted', 'AbortError')),
        {once: true},
      )
      return item.promise
    })
    const session = new ImageGallerySessionModel({loadSourceById})

    session.setImages(images, 1)
    session.primeThumbnailWindow(1, 1)

    await vi.waitFor(() => {
      expect(loadSourceById.mock.calls.map(([fileId]) => fileId)).toEqual([1, 2])
    })

    session.primeThumbnailWindow(2, 1)

    await vi.waitFor(() => {
      expect(session.getDebugSnapshot()).toMatchObject({
        inFlightCount: 3,
        loadingImageIds: [2, 3, 4],
      })
    })

    session.primeThumbnailWindow(2, 1)

    expect(loadSourceById.mock.calls.map(([fileId]) => fileId)).toEqual([1, 2])
    expect(session.getDebugSnapshot()).toMatchObject({
      inFlightCount: 3,
      loadingImageIds: [2, 3, 4],
    })

    thumbnailDefers.get(2)?.resolve(result('blob:2:thumbnail-image'))
    await vi.waitFor(() => {
      expect(loadSourceById.mock.calls.map(([fileId]) => fileId)).toEqual([1, 2, 3, 4])
    })

    for (const fileId of [2, 3, 4]) {
      thumbnailDefers.get(fileId)?.resolve(result(`blob:${fileId}:thumbnail-image`))
    }

    await vi.waitFor(() => {
      expect(session.getDebugSnapshot().inFlightCount).toBe(0)
    })
  })

  it('does not restart the same neighbor preview while it is already loading', async () => {
    const neighbor = deferred<LoadResult>()
    const loadSourceById = vi.fn<LoadSourceById>((fileId, _name, options) => {
      if (fileId === 4 && options?.variant === 'preview-image') {
        return neighbor.promise
      }
      return Promise.resolve(result(`blob:${fileId}:${options?.variant}`))
    })
    const session = new ImageGallerySessionModel({loadSourceById})

    session.setImages(images, 2)
    session.primeDirectionalNeighbor(1)

    await vi.waitFor(() => {
      expect(loadSourceById).toHaveBeenCalledTimes(1)
      expect(session.getDebugSnapshot()).toMatchObject({
        inFlightCount: 1,
        loadingImageIds: [4],
      })
    })

    session.primeDirectionalNeighbor(1)
    session.primeDirectionalNeighbor(1)

    expect(loadSourceById).toHaveBeenCalledTimes(1)
    expect(session.getDebugSnapshot()).toMatchObject({
      inFlightCount: 1,
      loadingImageIds: [4],
    })

    neighbor.resolve(result('blob:4:preview-image'))

    await vi.waitFor(() => {
      expect(session.getDebugSnapshot()).toMatchObject({
        cachedAssetCount: 1,
        inFlightCount: 0,
        loadingImageIds: [],
      })
    })
  })

  it('cleans session-local sources while keeping thumbnails in the shared reopen cache', async () => {
    const releases: Array<{variant: string | undefined; release: ReturnType<typeof vi.fn>}> = []
    const loadSourceById = vi.fn<LoadSourceById>(async (fileId, _name, options) => {
      const release = vi.fn()
      releases.push({variant: options?.variant, release})
      return result(`blob:${fileId}:${options?.variant}`, 4, release)
    })
    const session = new ImageGallerySessionModel({loadSourceById})

    session.setImages(images, 1)
    await session.loadCurrent()
    session.primeDirectionalNeighbor(1)
    session.primeThumbnailWindow(1, 1)

    await vi.waitFor(() => {
      expect(session.getDebugSnapshot().cachedAssetCount).toBeGreaterThanOrEqual(4)
    })

    session.close()

    expect(session.getDebugSnapshot()).toMatchObject({
      cachedAssetCount: 0,
      inFlightCount: 0,
      objectUrlCount: 0,
      loadingImageIds: [],
      rawDisplayLoadCount: 0,
      revokedObjectUrlCount: releases
        .filter((entry) => entry.variant === 'preview-image')
        .reduce((count, entry) => count + entry.release.mock.calls.length, 0),
    })
    expect(releases.filter((entry) => entry.variant === 'preview-image')).not.toHaveLength(0)
    expect(
      releases
        .filter((entry) => entry.variant === 'preview-image')
        .every((entry) => entry.release.mock.calls.length === 1),
    ).toBe(true)
    expect(releases.filter((entry) => entry.variant === 'thumbnail-image')).not.toHaveLength(0)
    expect(
      releases
        .filter((entry) => entry.variant === 'thumbnail-image')
        .every((entry) => entry.release.mock.calls.length === 0),
    ).toBe(true)
  })

  it('passes derivative-only display options and never requests raw display variants', async () => {
    const loadSourceById = vi.fn<LoadSourceById>(async (fileId, _name, options) =>
      result(`blob:${fileId}:${options?.variant}`),
    )
    const session = new ImageGallerySessionModel({
      loadSourceById,
    })

    session.setImages(images, 0)
    await session.loadCurrent()
    session.primeDirectionalNeighbor(1)
    session.primeThumbnailWindow(0, 1)

    await vi.waitFor(() => {
      expect(loadSourceById).toHaveBeenCalledTimes(4)
    })

    for (const [, , options] of loadSourceById.mock.calls) {
      expect(options?.variant).not.toBe('raw')
      expect(options).toEqual(
        expect.objectContaining({
          derivativeFallback: 'none',
        }),
      )
    }
    expect(session.getDebugSnapshot().rawDisplayLoadCount).toBe(0)
  })
})
