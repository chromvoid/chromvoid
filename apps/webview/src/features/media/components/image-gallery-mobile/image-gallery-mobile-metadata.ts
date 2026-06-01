import {tryGetAppContext} from 'root/shared/services/app-context'
import type {ImagePhotoMetadata} from 'root/core/transport/transport'
import {writeAndroidUnlockDebug} from 'root/shared/services/android-unlock-debug'
import {formatImageGalleryDebugError, logImageGalleryDebug, warnImageGalleryDebug} from '../image-gallery-debug'
import type {MobileGalleryImageMeta} from './image-gallery-mobile.types'

export type MobileGalleryPhotoMetadataResult = {
  imageKey: string
  metadata: ImagePhotoMetadata | null
}

export function getMobileGalleryPhotoMetadataKey(image: MobileGalleryImageMeta): string {
  return `${image.id}:${image.lastModified ?? 0}:${image.size ?? 0}`
}

export async function loadMobileGalleryPhotoMetadata(
  image: MobileGalleryImageMeta,
): Promise<MobileGalleryPhotoMetadataResult> {
  const imageKey = getMobileGalleryPhotoMetadataKey(image)
  const transport = tryGetAppContext()?.ws

  if (!transport?.imageMetadata) {
    writeAndroidUnlockDebug('image-gallery-metadata', 'transport-missing', {
      imageKey,
      nodeId: image.id,
    })
    warnImageGalleryDebug('mobile-metadata', 'transport-missing', {
      imageKey,
      nodeId: image.id,
    })
    return {imageKey, metadata: null}
  }

  logImageGalleryDebug('mobile-metadata', 'invoke-start', {
    imageKey,
    nodeId: image.id,
    mimeType: image.mimeType ?? null,
    hasLastModified: image.lastModified !== null && image.lastModified !== undefined,
  })
  writeAndroidUnlockDebug('image-gallery-metadata', 'invoke-start', {
    imageKey,
    nodeId: image.id,
    mimeType: image.mimeType ?? null,
    hasLastModified: image.lastModified !== null && image.lastModified !== undefined,
  })

  try {
    const metadata = await transport.imageMetadata(image.id, {
      fileName: image.name,
      mimeType: image.mimeType ?? null,
      lastModified: image.lastModified ?? null,
    })

    logImageGalleryDebug('mobile-metadata', 'invoke-done', {
      imageKey,
      nodeId: image.id,
      hasDimensions: Boolean(metadata.width || metadata.height),
      hasDateTaken: Boolean(metadata.dateTaken),
      hasCamera: Boolean(metadata.cameraMake || metadata.cameraModel),
      hasGps: Boolean(metadata.gps),
      gpsDiagnosticStatus: metadata.gpsDiagnostic?.status ?? null,
      importProvenanceStatus:
        metadata.gpsDiagnostic?.importProvenanceStatus ?? null,
      originalStreamUsed: metadata.importProvenance?.originalStreamUsed ?? null,
      regularStreamFallback: metadata.importProvenance?.regularStreamFallback ?? null,
    })
    writeAndroidUnlockDebug('image-gallery-metadata', 'invoke-done', {
      imageKey,
      nodeId: image.id,
      hasDimensions: Boolean(metadata.width || metadata.height),
      hasDateTaken: Boolean(metadata.dateTaken),
      hasCamera: Boolean(metadata.cameraMake || metadata.cameraModel),
      hasGps: Boolean(metadata.gps),
      gpsDiagnosticStatus: metadata.gpsDiagnostic?.status ?? null,
      importProvenanceStatus:
        metadata.gpsDiagnostic?.importProvenanceStatus ?? null,
      originalStreamUsed: metadata.importProvenance?.originalStreamUsed ?? null,
      regularStreamFallback: metadata.importProvenance?.regularStreamFallback ?? null,
    })

    return {imageKey, metadata}
  } catch (error) {
    writeAndroidUnlockDebug('image-gallery-metadata', 'invoke-failed', {
      imageKey,
      nodeId: image.id,
      ...formatImageGalleryDebugError(error),
    })
    warnImageGalleryDebug('mobile-metadata', 'invoke-failed', {
      imageKey,
      nodeId: image.id,
      ...formatImageGalleryDebugError(error),
    })
    throw error
  }
}
