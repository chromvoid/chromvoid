import type {ImagePhotoMetadata} from 'root/core/transport/transport'

export type MobileGalleryInfoSheetDetent = 'collapsed' | 'expanded'

export type MobileGalleryGpsAvailability =
  | 'gps-available'
  | 'gps-unavailable-import-at-risk'
  | 'gps-unavailable-invalid-source'
  | 'gps-unavailable-too-large'
  | 'gps-unavailable-unknown'

export type MobileGalleryImageMeta = {
  id: number
  name: string
  mimeType?: string
  path?: string
  size?: number
  createdAt?: number
  lastModified?: number
}

export type MobileGalleryInfoSheetRenderState = {
  currentImage?: MobileGalleryImageMeta
  open: boolean
  detent: MobileGalleryInfoSheetDetent
  photoMetadata: ImagePhotoMetadata | null
  photoMetadataLoading: boolean
  photoMetadataError: string | null
  gpsAvailability: MobileGalleryGpsAvailability
}

export type MobileGalleryRenderActions = {
  onSheetClose: (event: Event) => void
  onExternalUrlClick: (event: MouseEvent) => void
  onInfoSheetSurfaceChange: (event: CustomEvent<{open: boolean; detent?: string}>) => void
  onThumbnailSelect: (event: CustomEvent<{index: number}>) => void
}
