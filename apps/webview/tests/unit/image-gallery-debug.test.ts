import {afterEach, describe, expect, it, vi} from 'vitest'

import {
  createImageDisplaySourceDebugPayload,
  formatImageGalleryDebugError,
  logImageGalleryDebug,
} from '../../src/features/media/components/image-gallery-debug'

describe('image gallery debug contract', () => {
  afterEach(() => {
    localStorage.removeItem('chromvoid:image-gallery-debug')
    vi.restoreAllMocks()
  })

  it('creates a stable redacted display source payload', () => {
    const payload = createImageDisplaySourceDebugPayload({
      nodeId: 42,
      variant: 'preview-image',
      sourceKind: 'prepared-source',
      sourceMimeType: 'image/heic',
      outputMimeType: 'image/webp',
      requestIntent: 'current-preview:42',
      schedulerPriority: 500,
    })

    expect(payload).toEqual({
      nodeId: 42,
      variant: 'preview-image',
      sourceKind: 'prepared-source',
      sourceMimeType: 'image/heic',
      outputMimeType: 'image/webp',
      sourceRevision: null,
      storageVersion: null,
      requestIntent: 'current-preview:42',
      schedulerPriority: 500,
      releaseReason: null,
    })
    expect(Object.keys(payload)).not.toEqual(expect.arrayContaining(['fileName', 'name', 'path']))
  })

  it('uses null defaults for lifecycle debug events without a concrete source', () => {
    expect(
      createImageDisplaySourceDebugPayload({
        sourceKind: 'prepared-source',
        releaseReason: 'vault-lock',
      }),
    ).toEqual({
      nodeId: null,
      variant: null,
      sourceKind: 'prepared-source',
      sourceMimeType: null,
      outputMimeType: null,
      sourceRevision: null,
      storageVersion: null,
      requestIntent: null,
      schedulerPriority: null,
      releaseReason: 'vault-lock',
    })
  })

  it('redacts raw error messages from debug metadata', () => {
    const error = new Error('/Users/kaifat/Pictures/photo.heic failed')
    Object.assign(error, {code: 'DERIVATIVE_UNAVAILABLE'})

    const metadata = formatImageGalleryDebugError(error)

    expect(metadata).toEqual({
      errorName: 'Error',
      code: 'DERIVATIVE_UNAVAILABLE',
    })
    expect(JSON.stringify(metadata)).not.toContain('photo.heic')
    expect(JSON.stringify(formatImageGalleryDebugError('/tmp/photo.heic'))).not.toContain('photo.heic')
  })

  it('keeps redacted native decoder details for image diagnostics', () => {
    const error = new Error(
      'Android image preview decoder returned null: Image derivative max edge exceeds policy: edge=0 max=1920 (PREVIEW_DECODE)',
    )

    expect(formatImageGalleryDebugError(error)).toEqual({
      errorName: 'Error',
      code: 'PREVIEW_DECODE',
      errorMessage:
        'Android image preview decoder returned null: Image derivative max edge exceeds policy: edge=0 max=1920 (PREVIEW_DECODE)',
    })
  })

  it('keeps object metadata and adds a logcat-readable JSON payload', () => {
    localStorage.setItem('chromvoid:image-gallery-debug', '1')
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const metadata = {reason: 'background', nodeId: 42}

    logImageGalleryDebug('file-loader', 'prepared-source.purge-start', metadata)

    expect(info).toHaveBeenCalledWith(
      '[debug][image-gallery][file-loader] prepared-source.purge-start',
      metadata,
      '{"reason":"background","nodeId":42}',
    )
  })
})
