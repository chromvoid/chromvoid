import type {ImageDisplaySchedulerDebugSnapshot} from '../image-display-scheduler'

export type GalleryImage = {
  id: number
  name: string
  path: string
  size?: number
  createdAt?: number
  lastModified?: number
  mimeType?: string
}

export type ImageViewerAction =
  | 'share'
  | 'save-to-gallery'
  | 'download'
  | 'open-external'
  | 'delete'
  | 'info'

export type ImageViewerActionButton = {
  action: ImageViewerAction
  icon: string
  labelKey: string
  dangerous?: boolean
}

export type GalleryCloseReason = 'control' | 'back' | 'swipe-dismiss'

export type GalleryCloseDetail = {
  reason: GalleryCloseReason
}

export type GalleryNavigateDetail = {
  index: number
  direction: 'forward' | 'backward'
}

export type GalleryActionDetail = {
  action: ImageViewerAction
  fileId: number
}

export type GalleryDisplayVariant = 'preview-image' | 'thumbnail-image'
export type GalleryAssetKey = string

export type GalleryAssetSnapshot = {
  imageId: number
  variant: GalleryDisplayVariant
  url: string
  size: number
  mimeType: string
}

export type GalleryAssetFailureSnapshot = {
  assetKey: GalleryAssetKey
  imageId: number
  variant: GalleryDisplayVariant
  code: 'DERIVATIVE_UNAVAILABLE' | 'RENDER_FAILED'
  message: string
  firstFailedAt: number
}

export type GalleryPanelSnapshot = {
  role: 'previous' | 'current' | 'next'
  imageIndex: number | null
  imageId: number | null
  src: string | null
  loading: boolean
  error: string | null
}

export type GalleryThumbnailSnapshot = {
  imageIndex: number
  imageId: number
  src: string | null
  loading: boolean
  selected: boolean
}

export type GalleryDisplayPhysicalSlotId = 'previous' | 'current' | 'next'

export type GalleryDisplayPhysicalSlotSnapshot = {
  slotId: GalleryDisplayPhysicalSlotId
  role: GalleryPanelSnapshot['role']
  imageIndex: number
  imageId: number
}

export type GalleryDisplayWindowSnapshot = {
  physicalSlots: GalleryDisplayPhysicalSlotSnapshot[]
  preparedRetentionIds: number[]
  derivativePrewarmIds: number[]
}

export type GalleryThumbnailVirtualWindow = {
  startIndex: number
  endIndex: number
  indices: number[]
  beforeCount: number
  afterCount: number
  thumbnailStepPx: number
  maxRendered: number
}

export type GalleryResourceDebugSnapshot = {
  cachedAssetCount: number
  failedAssetCount: number
  failedAssetKeys: GalleryAssetKey[]
  inFlightCount: number
  objectUrlCount: number
  loadingImageIds: number[]
  rawDisplayLoadCount: number
  revokedObjectUrlCount: number
  activePhysicalSlots: GalleryDisplayPhysicalSlotSnapshot[]
  retainedPreparedSourceIds: number[]
  thumbnailVirtualWindow: GalleryThumbnailVirtualWindow | null
  scheduler: ImageDisplaySchedulerDebugSnapshot
  prewarmImageIds: number[]
  renderFailureCount: number
  purgeCount: number
  releaseCount: number
}
