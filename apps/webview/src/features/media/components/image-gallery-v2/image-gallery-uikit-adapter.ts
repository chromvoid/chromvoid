import type {
  CVImageViewerAction,
  CVImageViewerItem,
  CVImageViewerThumbnailWindow,
} from '@chromvoid/uikit/components/cv-image-viewer'
import type {ImageGalleryViewerModel} from './gallery-viewer.model'
import type {GalleryImage, GalleryThumbnailVirtualWindow, ImageViewerActionButton} from './gallery.types'

type GalleryViewerAdapterModel = Pick<
  ImageGalleryViewerModel,
  'captureVisibleTrackSlot' | 'isImageLoading' | 'peekThumbnailStripUrl' | 'peekVisiblePanelUrl'
>

export function mapGalleryImagesToViewerItems(input: {
  images: readonly GalleryImage[]
  model: GalleryViewerAdapterModel
  getMeta?: (image: GalleryImage, index: number, total: number) => readonly string[]
}): CVImageViewerItem[] {
  const total = input.images.length

  return input.images.map((image, index) => {
    const visibleSlot = input.model.captureVisibleTrackSlot(index)
    const visibleUrl = input.model.peekVisiblePanelUrl(index)
    const thumbnailUrl = input.model.peekThumbnailStripUrl(index)

    return {
      id: image.id,
      title: image.name,
      alt: image.name,
      meta: input.getMeta?.(image, index, total) ?? [],
      src: visibleUrl,
      thumbnailSrc: thumbnailUrl,
      loading: visibleSlot?.loading ?? input.model.isImageLoading(index),
      error: visibleSlot?.error ?? null,
    }
  })
}

export function mapGalleryActionsToViewerActions(input: {
  actions: readonly ImageViewerActionButton[]
  translate: (labelKey: string) => string
  sharePending?: boolean
  busyLabel?: string
}): CVImageViewerAction[] {
  return input.actions.map((action) => {
    const pending = action.action === 'share' && Boolean(input.sharePending)
    const label = pending
      ? (input.busyLabel ?? input.translate(action.labelKey))
      : input.translate(action.labelKey)

    return {
      value: action.action,
      label,
      icon: action.icon,
      dangerous: action.dangerous,
      disabled: pending,
      loading: pending,
    }
  })
}

export function mapGalleryThumbnailWindow(
  window: GalleryThumbnailVirtualWindow | null | undefined,
): CVImageViewerThumbnailWindow | null {
  if (!window) return null

  return {
    indices: window.indices,
    beforeCount: window.beforeCount,
    afterCount: window.afterCount,
    thumbnailStepPx: window.thumbnailStepPx,
  }
}
