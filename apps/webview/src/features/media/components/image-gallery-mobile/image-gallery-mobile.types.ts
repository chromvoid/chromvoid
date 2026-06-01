import type {ImagePhotoMetadata} from 'root/core/transport/transport'
import type {CVMenuButtonInputEvent} from '@chromvoid/uikit/components/cv-menu-button'

export type MobileGalleryInfoSheetDetent = 'collapsed' | 'middle' | 'expanded'

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

export type MobileGalleryHeaderRenderState = {
  currentImage?: MobileGalleryImageMeta
  imageCount: number
  displayIndex: number
  chromeVisible: boolean
  showSaveToGallery: boolean
  showShare: boolean
  sharePending: boolean
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
  onClose: (event: Event) => void
  onHeaderInfo: (event: Event) => void
  onHeaderMenuInput: (event: CVMenuButtonInputEvent) => void
  onSheetClose: (event: Event) => void
  onExternalUrlClick: (event: MouseEvent) => void
  onInfoSheetSurfaceChange: (
    event: CustomEvent<{open: boolean; detent?: MobileGalleryInfoSheetDetent}>,
  ) => void
  onThumbnailSelect: (event: CustomEvent<{index: number}>) => void
}
