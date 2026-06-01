import {afterEach, describe, expect, it, vi} from 'vitest'

import * as fileLoader from '../../src/features/media/components/file-loader'
import {ImageGalleryViewerModel} from '../../src/features/media/components/image-gallery-v2/gallery-viewer.model'
import {resetImageDisplaySchedulerForTests} from '../../src/features/media/components/image-display-scheduler'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return {promise, resolve}
}

describe('image-gallery-v2/gallery-viewer.model', () => {
  afterEach(() => {
    resetImageDisplaySchedulerForTests()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('loads the current gallery image through the preview-image variant', async () => {
    const loadSpy = vi.spyOn(fileLoader, 'loadFileSourceById').mockResolvedValue({
      blob: new Blob(['webp'], {type: 'image/webp'}),
      url: 'blob:gallery-preview',
      size: 4,
      mimeType: 'image/webp',
    })

    const model = new ImageGalleryViewerModel()
    model.setImages([{id: 6, name: 'photo.jpg', path: '/photo.jpg', mimeType: 'image/jpeg'}], 0)
    await model.loadCurrentImage()

    expect(loadSpy).toHaveBeenCalledWith(
      6,
      'photo.jpg',
      expect.objectContaining({
        mimeType: 'image/jpeg',
        variant: 'preview-image',
        derivativeFallback: 'none',
      }),
    )
  })

  it('keeps the current image visible when the preview request resolves', async () => {
    const loadSpy = vi
      .spyOn(fileLoader, 'loadFileSourceById')
      .mockImplementation(async (fileId, _name, options) => ({
        blob: new Blob([options?.variant === 'preview-image' ? 'preview-webp' : 'webp'], {
          type: 'image/webp',
        }),
        url: `blob:${fileId}:${options?.variant}`,
        size: 12,
        mimeType: 'image/webp',
      }))

    const model = new ImageGalleryViewerModel()
    model.setImages([{id: 16, name: 'scan.heic', path: '/scan.heic', mimeType: 'image/heic'}], 0)
    await model.loadCurrentImage()

    expect(model.loading()).toBe(false)
    expect(model.currentImageUrl()).toBe('blob:16:preview-image')
    expect(loadSpy).toHaveBeenCalledWith(
      16,
      'scan.heic',
      expect.objectContaining({
        mimeType: 'image/heic',
        variant: 'preview-image',
        derivativeFallback: 'none',
      }),
    )
  })

  it('preloads one visible swipe neighbor through preview-image and loads thumbnails by window', async () => {
    const loadSpy = vi
      .spyOn(fileLoader, 'loadFileSourceById')
      .mockImplementation(async (fileId, _name, options) => ({
        blob: new Blob([`${fileId}:${options?.variant}`], {type: 'image/webp'}),
        url: `blob:${fileId}:${options?.variant}`,
        size: 4,
        mimeType: 'image/webp',
      }))

    const model = new ImageGalleryViewerModel()
    model.setImages(
      [
        {id: 1, name: 'one.jpg', path: '/one.jpg', mimeType: 'image/jpeg'},
        {id: 2, name: 'two.jpg', path: '/two.jpg', mimeType: 'image/jpeg'},
        {id: 3, name: 'three.jpg', path: '/three.jpg', mimeType: 'image/jpeg'},
      ],
      0,
    )

    model.preloadAdjacentImages()

    await vi.waitFor(() => {
      expect(loadSpy).toHaveBeenCalledTimes(1)
    })

    expect(loadSpy.mock.calls).toEqual(
      expect.arrayContaining([
        [2, 'two.jpg', expect.objectContaining({variant: 'preview-image', derivativeFallback: 'none'})],
      ]),
    )
    await vi.waitFor(() => {
      expect(model.peekVisiblePanelUrl(1)).toBe('blob:2:preview-image')
    })
    expect(model.peekThumbnailStripUrl(1)).toBe(null)

    model.primeThumbnailWindow(1, 0)

    await vi.waitFor(() => {
      expect(model.peekThumbnailStripUrl(1)).toBe('blob:2:thumbnail-image')
    })
    expect(model.peekThumbnailStripUrl(1)).toBe('blob:2:thumbnail-image')
    expect(model.captureVisibleTrackSlot(1)).toEqual({
      imageIndex: 1,
      imageId: 2,
      src: 'blob:2:preview-image',
      loading: false,
    })
  })

  it('keeps the current gallery image on the display preview without loading raw bytes', async () => {
    const loadSpy = vi.spyOn(fileLoader, 'loadFileSourceById').mockImplementation(async (fileId) => ({
      blob: new Blob(['preview'], {type: 'image/webp'}),
      url: `blob:${fileId}:preview`,
      size: 7,
      mimeType: 'image/webp',
    }))

    const model = new ImageGalleryViewerModel()
    model.setImages([{id: 9, name: 'photo.jpg', path: '/photo.jpg', mimeType: 'image/jpeg'}], 0)
    await model.loadCurrentImage()

    expect(model.currentImageUrl()).toBe('blob:9:preview')
    expect(model.loading()).toBe(false)
    expect(loadSpy.mock.calls.map(([, , options]) => options?.variant)).toEqual(['preview-image'])

    expect(model.captureVisibleTrackSlot(0)).toEqual({
      imageIndex: 0,
      imageId: 9,
      src: 'blob:9:preview',
      loading: false,
    })
  })

  it('records a display-safe error instead of retrying raw bytes when preview loading fails', async () => {
    const loadSpy = vi.spyOn(fileLoader, 'loadFileSourceById').mockRejectedValue(new Error('DERIVATIVE_UNAVAILABLE'))

    const model = new ImageGalleryViewerModel()
    model.setImages([{id: 14, name: 'photo.heic', path: '/photo.heic', mimeType: 'image/heic'}], 0)
    await model.loadCurrentImage()

    expect(model.currentImageUrl()).toBeNull()
    expect(model.loading()).toBe(false)
    expect(model.session.currentPanel().error).toBe('DERIVATIVE_UNAVAILABLE')
    expect(model.getDebugSnapshot().rawDisplayLoadCount).toBe(0)
    expect(loadSpy.mock.calls.map(([, , options]) => options?.variant)).toEqual(['preview-image'])
    expect(loadSpy).toHaveBeenCalledWith(
      14,
      'photo.heic',
      expect.objectContaining({
        derivativeFallback: 'none',
        variant: 'preview-image',
      }),
    )
  })

  it('does not show a low-resolution thumbnail as the visible image while the preview is loading', async () => {
    const previewImage = deferred<Awaited<ReturnType<typeof fileLoader.loadFileSourceById>>>()

    vi.spyOn(fileLoader, 'loadFileSourceById').mockImplementation(async (fileId, _name, options) => {
      if (fileId === 3 && options?.variant === 'preview-image') {
        return await previewImage.promise
      }

      return {
        blob: new Blob([`${fileId}:${options?.variant}`], {type: 'image/webp'}),
        url: `blob:${fileId}:${options?.variant}`,
        size: 4,
        mimeType: 'image/webp',
      }
    })

    const model = new ImageGalleryViewerModel()
    model.setImages(
      [
        {id: 1, name: 'one.jpg', path: '/one.jpg', mimeType: 'image/jpeg'},
        {id: 2, name: 'two.jpg', path: '/two.jpg', mimeType: 'image/jpeg'},
        {id: 3, name: 'three.jpg', path: '/three.jpg', mimeType: 'image/jpeg'},
      ],
      0,
    )

    model.primeImage(2)

    await vi.waitFor(() => {
      expect(model.peekThumbnailStripUrl(2)).toBe('blob:3:thumbnail-image')
    })
    expect(model.peekVisiblePanelUrl(2)).toBe(null)

    model.setImages(
      [
        {id: 1, name: 'one.jpg', path: '/one.jpg', mimeType: 'image/jpeg'},
        {id: 2, name: 'two.jpg', path: '/two.jpg', mimeType: 'image/jpeg'},
        {id: 3, name: 'three.jpg', path: '/three.jpg', mimeType: 'image/jpeg'},
      ],
      2,
    )
    void model.loadCurrentImage()

    expect(model.currentImageUrl()).toBe(null)
    expect(model.loading()).toBe(true)

    previewImage.resolve({
      blob: new Blob(['preview'], {type: 'image/webp'}),
      url: 'blob:3:preview-image',
      size: 7,
      mimeType: 'image/webp',
    })

    await vi.waitFor(() => {
      expect(model.currentImageUrl()).toBe('blob:3:preview-image')
      expect(model.loading()).toBe(false)
    })
  })

  it('does not block the current image behind an aborted preload for the same asset', async () => {
    const stalePreload = deferred<Awaited<ReturnType<typeof fileLoader.loadFileSourceById>>>()
    let secondPreviewRequested = false
    const staleRelease = vi.fn()

    const loadSpy = vi
      .spyOn(fileLoader, 'loadFileSourceById')
      .mockImplementation(async (fileId, _name, options) => {
        if (fileId === 2 && options?.variant === 'preview-image') {
          if (!secondPreviewRequested) {
            secondPreviewRequested = true
            return await stalePreload.promise
          }

          return {
            blob: new Blob(['current-preview'], {type: 'image/webp'}),
            url: 'blob:2:current-preview',
            size: 15,
            mimeType: 'image/webp',
          }
        }

        return {
          blob: new Blob([`${fileId}:${options?.variant}`], {type: 'image/webp'}),
          url: `blob:${fileId}:${options?.variant}`,
          size: 4,
          mimeType: 'image/webp',
        }
      })

    const model = new ImageGalleryViewerModel()
    model.setImages(
      [
        {id: 1, name: 'one.jpg', path: '/one.jpg', mimeType: 'image/jpeg'},
        {id: 2, name: 'two.jpg', path: '/two.jpg', mimeType: 'image/jpeg'},
      ],
      0,
    )

    model.primeImage(1)

    await vi.waitFor(() => {
      expect(loadSpy).toHaveBeenCalledTimes(1)
    })

    model.navigate(1)

    await vi.waitFor(() => {
      expect(model.currentImageUrl()).toBe('blob:2:current-preview')
    })

    stalePreload.resolve({
      blob: new Blob(['stale-preview'], {type: 'image/webp'}),
      kind: 'blob',
      url: 'blob:2:stale-preview',
      size: 13,
      mimeType: 'image/webp',
      release: staleRelease,
    })

    await vi.waitFor(() => {
      expect(model.loadingImageIds()).toEqual([])
    })

    expect(
      loadSpy.mock.calls.filter(
        ([fileId, , options]) => fileId === 2 && options?.variant === 'preview-image',
      ),
    ).toHaveLength(2)
    await vi.waitFor(() => {
      expect(staleRelease).toHaveBeenCalledTimes(1)
    })
  })

  it('biases preload toward one latest-direction neighbor while keeping raw bytes out of the queue', async () => {
    const createImageBitmap = vi.fn(async () => ({
      close() {},
    }))
    vi.stubGlobal('createImageBitmap', createImageBitmap)

    const loadSpy = vi
      .spyOn(fileLoader, 'loadFileSourceById')
      .mockImplementation(async (fileId, _name, options) => ({
        blob: new Blob([`${fileId}:${options?.variant}`], {type: 'image/webp'}),
        url: `blob:${fileId}:${options?.variant}`,
        size: fileId,
        mimeType: 'image/webp',
      }))

    const model = new ImageGalleryViewerModel()
    model.setImages(
      [
        {id: 1, name: 'one.jpg', path: '/one.jpg', mimeType: 'image/jpeg'},
        {id: 2, name: 'two.jpg', path: '/two.jpg', mimeType: 'image/jpeg'},
        {id: 3, name: 'three.jpg', path: '/three.jpg', mimeType: 'image/jpeg'},
        {id: 4, name: 'four.jpg', path: '/four.jpg', mimeType: 'image/jpeg'},
        {id: 5, name: 'five.jpg', path: '/five.jpg', mimeType: 'image/jpeg'},
        {id: 6, name: 'six.jpg', path: '/six.jpg', mimeType: 'image/jpeg'},
      ],
      1,
    )

    model.navigate(2)

    await vi.waitFor(() => {
      expect(model.currentImageUrl()).toMatch(/^blob:3:/)
    })
    await vi.waitFor(() => {
      expect(loadSpy).toHaveBeenCalledTimes(2)
    })

    const requestedAssets = loadSpy.mock.calls.map(([fileId, , options]) => `${fileId}:${options?.variant}`)
    expect(requestedAssets[0]).toBe('3:preview-image')
    expect(requestedAssets).toEqual(['3:preview-image', '4:preview-image'])
    expect(requestedAssets).not.toContain('3:raw')

    model.preloadAdjacentImages()
    await Promise.resolve()

    expect(createImageBitmap).not.toHaveBeenCalled()
    expect(model.peekVisiblePanelUrl(1)).toBe(null)
    expect(model.peekVisiblePanelUrl(3)).toBe('blob:4:preview-image')

    model.primeThumbnailWindow(3, 1)

    await vi.waitFor(() => {
      expect(model.peekThumbnailStripUrl(4)).toBe('blob:5:thumbnail-image')
    })

    expect(model.peekThumbnailStripUrl(3)).toBe('blob:4:thumbnail-image')
    expect(model.peekThumbnailStripUrl(4)).toBe('blob:5:thumbnail-image')
    expect(model.peekThumbnailStripUrl(5)).toBe(null)
  })

  it('keeps preload priming side-effect free for navigation direction', async () => {
    const loadSpy = vi.spyOn(fileLoader, 'loadFileSourceById').mockResolvedValue({
      blob: new Blob(['webp'], {type: 'image/webp'}),
      url: 'blob:primed',
      size: 4,
      mimeType: 'image/webp',
    })

    const model = new ImageGalleryViewerModel()
    model.setImages(
      [
        {id: 1, name: 'one.jpg', path: '/one.jpg', mimeType: 'image/jpeg'},
        {id: 2, name: 'two.jpg', path: '/two.jpg', mimeType: 'image/jpeg'},
        {id: 3, name: 'three.jpg', path: '/three.jpg', mimeType: 'image/jpeg'},
        {id: 4, name: 'four.jpg', path: '/four.jpg', mimeType: 'image/jpeg'},
      ],
      2,
    )

    model.session.lastDirection.set(1)
    model.primeImage(0)

    await vi.waitFor(() => {
      expect(loadSpy).toHaveBeenCalled()
    })

    expect(model.session.lastDirection()).toBe(1)
    expect(loadSpy).toHaveBeenCalledWith(
      1,
      'one.jpg',
      expect.objectContaining({
        variant: 'thumbnail-image',
      }),
    )
  })

  it('opens by loading the current preview before priming the adjacent preview', async () => {
    const currentPreview = deferred<Awaited<ReturnType<typeof fileLoader.loadFileSourceById>>>()
    const loadSpy = vi.spyOn(fileLoader, 'loadFileSourceById').mockImplementation(async (fileId, _name, options) => {
      if (fileId === 1 && options?.variant === 'preview-image') {
        return await currentPreview.promise
      }

      return {
        blob: new Blob([`${fileId}:${options?.variant}`], {type: 'image/webp'}),
        url: `blob:${fileId}:${options?.variant}`,
        size: 4,
        mimeType: 'image/webp',
      }
    })

    const model = new ImageGalleryViewerModel()
    model.open(
      [
        {id: 1, name: 'one.jpg', path: '/one.jpg', mimeType: 'image/jpeg'},
        {id: 2, name: 'two.jpg', path: '/two.jpg', mimeType: 'image/jpeg'},
      ],
      0,
    )

    await vi.waitFor(() => {
      expect(loadSpy).toHaveBeenCalledTimes(1)
    })
    expect(loadSpy.mock.calls[0]?.[0]).toBe(1)

    currentPreview.resolve({
      blob: new Blob(['current'], {type: 'image/webp'}),
      url: 'blob:1:preview-image',
      size: 7,
      mimeType: 'image/webp',
    })

    await vi.waitFor(() => {
      expect(loadSpy).toHaveBeenCalledTimes(2)
    })
    expect(loadSpy.mock.calls[1]?.[0]).toBe(2)
    expect(loadSpy.mock.calls[1]?.[2]).toEqual(
      expect.objectContaining({
        variant: 'preview-image',
        derivativeFallback: 'none',
      }),
    )
  })

  it('syncs changed images by loading the requested current preview and then priming the neighbor', async () => {
    const currentPreview = deferred<Awaited<ReturnType<typeof fileLoader.loadFileSourceById>>>()
    const loadSpy = vi.spyOn(fileLoader, 'loadFileSourceById').mockImplementation(async (fileId, _name, options) => {
      if (fileId === 3 && options?.variant === 'preview-image') {
        return await currentPreview.promise
      }

      return {
        blob: new Blob([`${fileId}:${options?.variant}`], {type: 'image/webp'}),
        url: `blob:${fileId}:${options?.variant}`,
        size: 4,
        mimeType: 'image/webp',
      }
    })

    const model = new ImageGalleryViewerModel()
    model.syncImages(
      [
        {id: 1, name: 'one.jpg', path: '/one.jpg', mimeType: 'image/jpeg'},
        {id: 2, name: 'two.jpg', path: '/two.jpg', mimeType: 'image/jpeg'},
        {id: 3, name: 'three.jpg', path: '/three.jpg', mimeType: 'image/jpeg'},
        {id: 4, name: 'four.jpg', path: '/four.jpg', mimeType: 'image/jpeg'},
      ],
      2,
    )

    await vi.waitFor(() => {
      expect(loadSpy).toHaveBeenCalledTimes(1)
    })
    expect(loadSpy.mock.calls[0]?.[0]).toBe(3)

    currentPreview.resolve({
      blob: new Blob(['current'], {type: 'image/webp'}),
      url: 'blob:3:preview-image',
      size: 7,
      mimeType: 'image/webp',
    })

    await vi.waitFor(() => {
      expect(loadSpy).toHaveBeenCalledTimes(2)
    })
    expect(loadSpy.mock.calls[1]?.[0]).toBe(4)
  })
})
