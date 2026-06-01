import {atom, computed, wrap} from '@reatom/core'
import type {ImagePhotoMetadata} from 'root/core/transport/transport'
import {writeAndroidUnlockDebug} from 'root/shared/services/android-unlock-debug'
import {
  getMobileGalleryPhotoMetadataKey,
  loadMobileGalleryPhotoMetadata,
  type MobileGalleryPhotoMetadataResult,
} from './image-gallery-mobile-metadata'
import type {
  MobileGalleryGpsAvailability,
  MobileGalleryImageMeta,
  MobileGalleryInfoSheetDetent,
} from './image-gallery-mobile.types'

export type MobileGalleryPhotoMetadataLoader = (
  image: MobileGalleryImageMeta,
) => Promise<MobileGalleryPhotoMetadataResult>

export type ImageGalleryMobileInfoSheetModelOptions = {
  metadataLoader?: MobileGalleryPhotoMetadataLoader
  log?: (event: string, meta?: Record<string, unknown>) => void
}

export function classifyPhotoMetadataGpsAvailability(
  metadata: ImagePhotoMetadata | null,
): MobileGalleryGpsAvailability {
  if (metadata?.gps) return 'gps-available'

  if (metadata?.gpsDiagnostic?.status === 'source_too_large') {
    return 'gps-unavailable-too-large'
  }

  if (metadata?.gpsDiagnostic?.status === 'invalid') {
    return 'gps-unavailable-invalid-source'
  }

  if (
    metadata?.gpsDiagnostic?.importProvenanceStatus === 'at_risk' ||
    metadata?.importProvenance?.regularStreamFallback === true ||
    metadata?.importProvenance?.permissionStatus === 'denied'
  ) {
    return 'gps-unavailable-import-at-risk'
  }

  return 'gps-unavailable-unknown'
}

export class ImageGalleryMobileInfoSheetModel {
  private readonly infoSheetOpenAtom = atom(false, 'media.imageGalleryV2.mobile.infoSheetOpen')
  private readonly infoSheetDetentAtom = atom<MobileGalleryInfoSheetDetent>(
    'collapsed',
    'media.imageGalleryV2.mobile.infoSheetDetent',
  )
  private readonly photoMetadataAtom = atom<ImagePhotoMetadata | null>(
    null,
    'media.imageGalleryV2.mobile.photoMetadata',
  )
  private readonly photoMetadataLoadingAtom = atom(false, 'media.imageGalleryV2.mobile.photoMetadataLoading')
  private readonly photoMetadataErrorAtom = atom<string | null>(
    null,
    'media.imageGalleryV2.mobile.photoMetadataError',
  )
  private readonly photoMetadataImageKeyAtom = atom('', 'media.imageGalleryV2.mobile.photoMetadataImageKey')
  readonly photoMetadataGpsAvailability = computed<MobileGalleryGpsAvailability>(
    () => classifyPhotoMetadataGpsAvailability(this.photoMetadataAtom()),
    'media.imageGalleryV2.mobile.photoMetadataGpsAvailability',
  )

  readonly state = {
    infoSheetOpen: this.infoSheetOpenAtom,
    infoSheetDetent: this.infoSheetDetentAtom,
    photoMetadata: this.photoMetadataAtom,
    photoMetadataLoading: this.photoMetadataLoadingAtom,
    photoMetadataError: this.photoMetadataErrorAtom,
    photoMetadataImageKey: this.photoMetadataImageKeyAtom,
    photoMetadataGpsAvailability: this.photoMetadataGpsAvailability,
  }

  private photoMetadataRequestSeq = 0

  constructor(private readonly options: ImageGalleryMobileInfoSheetModelOptions = {}) {}

  openInfoSheet(image?: MobileGalleryImageMeta) {
    this.debug('sheet:open', this.getImageDebugMeta(image))
    this.state.infoSheetDetent.set('middle')
    this.state.infoSheetOpen.set(true)
    this.loadInfoSheetMetadata(image, {forceRetry: true})
  }

  closeInfoSheet() {
    if (!this.state.infoSheetOpen()) {
      return false
    }

    this.state.infoSheetOpen.set(false)
    this.state.infoSheetDetent.set('collapsed')
    this.debug('sheet:close')
    return true
  }

  setInfoSheetDetent(detent: MobileGalleryInfoSheetDetent) {
    if (!this.state.infoSheetOpen()) return
    this.debug('sheet:detent', {detent})
    this.state.infoSheetDetent.set(detent)
  }

  loadInfoSheetMetadata(image: MobileGalleryImageMeta | undefined, options: {forceRetry?: boolean} = {}) {
    if (!image) {
      this.debug('metadata:missing-image')
      this.invalidatePhotoMetadataRequest()
      this.resetPhotoMetadataState()
      return
    }

    const imageKey = getMobileGalleryPhotoMetadataKey(image)
    if (this.state.photoMetadataImageKey() === imageKey) {
      const skipReason = this.getSameImageSkipReason(options.forceRetry === true)
      if (skipReason) {
        this.debug('metadata:skip', {
          ...this.getImageDebugMeta(image, imageKey),
          reason: skipReason,
        })
        return
      }
      if (options.forceRetry === true) {
        this.log('photo-metadata.retry', {imageKey})
        this.debug('metadata:retry', this.getImageDebugMeta(image, imageKey))
      }
    }

    const requestSeq = this.invalidatePhotoMetadataRequest()
    this.state.photoMetadataImageKey.set(imageKey)
    this.state.photoMetadata.set(null)
    this.state.photoMetadataError.set(null)
    this.state.photoMetadataLoading.set(true)
    this.log('photo-metadata.load-start', {imageKey})
    this.debug('metadata:load-start', {
      ...this.getImageDebugMeta(image, imageKey),
      requestSeq,
    })

    void this.finishMetadataLoad(image, imageKey, requestSeq)
  }

  reset() {
    this.invalidatePhotoMetadataRequest()
    this.state.infoSheetOpen.set(false)
    this.state.infoSheetDetent.set('collapsed')
    this.resetPhotoMetadataState()
  }

  teardown() {
    this.reset()
  }

  private get metadataLoader() {
    return this.options.metadataLoader ?? loadMobileGalleryPhotoMetadata
  }

  private invalidatePhotoMetadataRequest() {
    this.photoMetadataRequestSeq += 1
    return this.photoMetadataRequestSeq
  }

  private isStalePhotoMetadataResult(requestSeq: number, expectedKey: string, resultKey = expectedKey) {
    return (
      requestSeq !== this.photoMetadataRequestSeq ||
      resultKey !== expectedKey ||
      this.state.photoMetadataImageKey() !== expectedKey
    )
  }

  private resetPhotoMetadataState() {
    this.state.photoMetadata.set(null)
    this.state.photoMetadataLoading.set(false)
    this.state.photoMetadataError.set(null)
    this.state.photoMetadataImageKey.set('')
  }

  private async finishMetadataLoad(
    image: MobileGalleryImageMeta,
    imageKey: string,
    requestSeq: number,
  ): Promise<void> {
    try {
      const result = await wrap(this.metadataLoader(image))
      if (this.isStalePhotoMetadataResult(requestSeq, imageKey, result.imageKey)) {
        this.debug('metadata:stale', {
          ...this.getImageDebugMeta(image, imageKey),
          requestSeq,
          resultImageKey: result.imageKey,
        })
        return
      }

      this.state.photoMetadata.set(result.metadata)
      this.state.photoMetadataError.set(null)
      this.state.photoMetadataLoading.set(false)
      this.log('photo-metadata.load-done', {
        imageKey,
        hasMetadata: Boolean(result.metadata),
      })
      this.debug('metadata:load-done', {
        ...this.getImageDebugMeta(image, imageKey),
        requestSeq,
        hasMetadata: Boolean(result.metadata),
        hasGps: Boolean(result.metadata?.gps),
        gpsAvailability: this.photoMetadataGpsAvailability(),
        gpsDiagnosticStatus: result.metadata?.gpsDiagnostic?.status ?? null,
        importProvenanceStatus: result.metadata?.gpsDiagnostic?.importProvenanceStatus ?? null,
        hasDimensions: Boolean(result.metadata?.width || result.metadata?.height),
        hasDateTaken: Boolean(result.metadata?.dateTaken),
      })
    } catch (error) {
      if (this.isStalePhotoMetadataResult(requestSeq, imageKey)) {
        this.debug('metadata:failed-stale', {
          ...this.getImageDebugMeta(image, imageKey),
          requestSeq,
        })
        return
      }

      this.state.photoMetadata.set(null)
      this.state.photoMetadataError.set(error instanceof Error ? error.message : String(error))
      this.state.photoMetadataLoading.set(false)
      this.log('photo-metadata.load-failed', {
        imageKey,
        errorName: error instanceof Error ? error.name : typeof error,
      })
      this.debug('metadata:load-failed', {
        ...this.getImageDebugMeta(image, imageKey),
        requestSeq,
        errorName: error instanceof Error ? error.name : typeof error,
      })
    }
  }

  private log(event: string, meta?: Record<string, unknown>) {
    this.options.log?.(event, meta)
  }

  private getSameImageSkipReason(forceRetry: boolean) {
    if (this.state.photoMetadataLoading()) return 'loading'
    if (this.state.photoMetadata() && !forceRetry) return 'already-loaded'
    if (!forceRetry) return 'same-image-no-force'
    return null
  }

  private getImageDebugMeta(image?: MobileGalleryImageMeta, imageKey?: string): Record<string, unknown> {
    return {
      imageKey: image ? imageKey ?? getMobileGalleryPhotoMetadataKey(image) : null,
      nodeId: image?.id ?? null,
      mimeType: image?.mimeType ?? null,
      hasLastModified: image?.lastModified !== null && image?.lastModified !== undefined,
      size: image?.size ?? null,
    }
  }

  private debug(event: string, meta?: Record<string, unknown>) {
    writeAndroidUnlockDebug('image-gallery-info-sheet', event, meta)
  }
}
