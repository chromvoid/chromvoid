import {describe, expect, it, vi} from 'vitest'

import {getMobileGalleryPhotoMetadataKey} from '../../src/features/media/components/image-gallery-mobile/image-gallery-mobile-metadata'
import {
  classifyPhotoMetadataGpsAvailability,
  ImageGalleryMobileInfoSheetModel,
} from '../../src/features/media/components/image-gallery-mobile/image-gallery-mobile-info-sheet.model'
import type {MobileGalleryImageMeta} from '../../src/features/media/components/image-gallery-mobile/image-gallery-mobile.types'

function imageMeta(id: number, lastModified = 1000): MobileGalleryImageMeta {
  return {
    id,
    name: `${id}.jpg`,
    mimeType: 'image/jpeg',
    size: 1024,
    lastModified,
  }
}

describe('image-gallery-v2/mobile-gallery-info-sheet.model', () => {
  it('classifies GPS availability from metadata diagnostics and import provenance', () => {
    expect(classifyPhotoMetadataGpsAvailability({gps: {latitude: 1, longitude: 2}})).toBe('gps-available')
    expect(
      classifyPhotoMetadataGpsAvailability({
        gpsDiagnostic: {status: 'source_too_large'},
      }),
    ).toBe('gps-unavailable-too-large')
    expect(
      classifyPhotoMetadataGpsAvailability({
        gpsDiagnostic: {status: 'invalid'},
      }),
    ).toBe('gps-unavailable-invalid-source')
    expect(
      classifyPhotoMetadataGpsAvailability({
        gpsDiagnostic: {status: 'not_found', importProvenanceStatus: 'at_risk'},
      }),
    ).toBe('gps-unavailable-import-at-risk')
    expect(
      classifyPhotoMetadataGpsAvailability({
        importProvenance: {
          sourceRevision: 3,
          platform: 'android',
          imageCandidate: true,
          permissionStatus: 'denied',
          requireOriginalStatus: 'not_attempted_permission_missing',
          originalStreamUsed: false,
          regularStreamFallback: true,
        },
      }),
    ).toBe('gps-unavailable-import-at-risk')
    expect(classifyPhotoMetadataGpsAvailability(null)).toBe('gps-unavailable-unknown')
  })

  it('updates computed GPS availability when metadata changes', async () => {
    const image = imageMeta(17)
    const loader = vi.fn(async (input: MobileGalleryImageMeta) => ({
      imageKey: getMobileGalleryPhotoMetadataKey(input),
      metadata: {
        gpsDiagnostic: {status: 'invalid'},
      },
    }))
    const model = new ImageGalleryMobileInfoSheetModel({metadataLoader: loader})

    expect(model.state.photoMetadataGpsAvailability()).toBe('gps-unavailable-unknown')

    model.openInfoSheet(image)

    await vi.waitFor(() => {
      expect(model.state.photoMetadataGpsAvailability()).toBe('gps-unavailable-invalid-source')
    })
  })

  it('opens the sheet, loads metadata, reloads on explicit open, and skips passive repeated loads', async () => {
    const image = imageMeta(7)
    const loader = vi.fn(async (input: MobileGalleryImageMeta) => ({
      imageKey: getMobileGalleryPhotoMetadataKey(input),
      metadata: {
        width: 4000,
        height: 3000,
        cameraModel: 'EOS R6',
      },
    }))
    const model = new ImageGalleryMobileInfoSheetModel({metadataLoader: loader})

    model.openInfoSheet(image)

    expect(model.state.infoSheetOpen()).toBe(true)
    expect(model.state.infoSheetDetent()).toBe('middle')
    expect(model.state.photoMetadataLoading()).toBe(true)

    await vi.waitFor(() => {
      expect(model.state.photoMetadataLoading()).toBe(false)
      expect(model.state.photoMetadata()).toMatchObject({width: 4000, height: 3000, cameraModel: 'EOS R6'})
    })
    expect(model.state.photoMetadataError()).toBeNull()

    model.loadInfoSheetMetadata(image)
    expect(loader).toHaveBeenCalledTimes(1)

    model.closeInfoSheet()
    expect(model.state.infoSheetDetent()).toBe('collapsed')
    model.openInfoSheet(image)
    expect(model.state.infoSheetDetent()).toBe('middle')
    expect(model.state.photoMetadataLoading()).toBe(true)

    await vi.waitFor(() => {
      expect(model.state.photoMetadataLoading()).toBe(false)
    })
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('tracks detent state only while the sheet is open', () => {
    const model = new ImageGalleryMobileInfoSheetModel({
      metadataLoader: async (input) => ({
        imageKey: getMobileGalleryPhotoMetadataKey(input),
        metadata: null,
      }),
    })

    model.setInfoSheetDetent('expanded')
    expect(model.state.infoSheetDetent()).toBe('collapsed')

    model.openInfoSheet(imageMeta(5))
    expect(model.state.infoSheetDetent()).toBe('middle')
    model.setInfoSheetDetent('expanded')
    expect(model.state.infoSheetDetent()).toBe('expanded')

    model.closeInfoSheet()
    expect(model.state.infoSheetOpen()).toBe(false)
    expect(model.state.infoSheetDetent()).toBe('collapsed')
  })

  it('ignores stale photo metadata when a newer image key is loading', async () => {
    const first = imageMeta(1, 1000)
    const second = imageMeta(2, 2000)
    const resolves: Array<(value: {imageKey: string; metadata: {width: number}}) => void> = []
    const loader = vi.fn(
      (input: MobileGalleryImageMeta) =>
        new Promise<{imageKey: string; metadata: {width: number}}>((resolve) => {
          void input
          resolves.push(resolve)
        }),
    )
    const model = new ImageGalleryMobileInfoSheetModel({metadataLoader: loader})

    model.openInfoSheet(first)
    model.openInfoSheet(second)
    resolves[0]?.({
      imageKey: getMobileGalleryPhotoMetadataKey(first),
      metadata: {width: 111},
    })
    await Promise.resolve()

    expect(model.state.photoMetadata()).toBeNull()
    expect(model.state.photoMetadataLoading()).toBe(true)

    resolves[1]?.({
      imageKey: getMobileGalleryPhotoMetadataKey(second),
      metadata: {width: 222},
    })

    await vi.waitFor(() => {
      expect(model.state.photoMetadata()).toMatchObject({width: 222})
      expect(model.state.photoMetadataLoading()).toBe(false)
    })
  })

  it('ignores stale photo metadata failures when a newer image key is loading', async () => {
    const first = imageMeta(8, 1000)
    const second = imageMeta(9, 2000)
    const requests: Array<{
      resolve: (value: {imageKey: string; metadata: {width: number}}) => void
      reject: (error: unknown) => void
    }> = []
    const loader = vi.fn(
      () =>
        new Promise<{imageKey: string; metadata: {width: number}}>((resolve, reject) => {
          requests.push({resolve, reject})
        }),
    )
    const model = new ImageGalleryMobileInfoSheetModel({metadataLoader: loader})

    model.openInfoSheet(first)
    model.openInfoSheet(second)

    requests[0]?.reject(new Error('stale failure'))
    await Promise.resolve()

    expect(model.state.photoMetadata()).toBeNull()
    expect(model.state.photoMetadataError()).toBeNull()
    expect(model.state.photoMetadataLoading()).toBe(true)

    requests[1]?.resolve({
      imageKey: getMobileGalleryPhotoMetadataKey(second),
      metadata: {width: 333},
    })

    await vi.waitFor(() => {
      expect(model.state.photoMetadata()).toMatchObject({width: 333})
      expect(model.state.photoMetadataError()).toBeNull()
      expect(model.state.photoMetadataLoading()).toBe(false)
    })
  })

  it('clears metadata, errors, and pending image key on teardown', async () => {
    const model = new ImageGalleryMobileInfoSheetModel({
      metadataLoader: async (input) => {
        throw new Error(`failed ${input.id}`)
      },
    })

    model.openInfoSheet(imageMeta(3))

    await vi.waitFor(() => {
      expect(model.state.photoMetadataLoading()).toBe(false)
      expect(model.state.photoMetadata()).toBeNull()
      expect(model.state.photoMetadataError()).toBe('failed 3')
    })

    model.teardown()

    expect(model.state.infoSheetOpen()).toBe(false)
    expect(model.state.infoSheetDetent()).toBe('collapsed')
    expect(model.state.photoMetadataError()).toBeNull()
    expect(model.state.photoMetadataImageKey()).toBe('')
  })
})
