import type {ImageViewerAction, ImageViewerActionButton} from './gallery.types'

const ACTION_BUTTONS: Record<ImageViewerAction, ImageViewerActionButton> = {
  download: {
    action: 'download',
    icon: 'download',
    labelKey: 'action:download',
  },
  'open-external': {
    action: 'open-external',
    icon: 'box-arrow-up-right',
    labelKey: 'action:open-external',
  },
  info: {
    action: 'info',
    icon: 'info',
    labelKey: 'details:metadata',
  },
  'save-to-gallery': {
    action: 'save-to-gallery',
    icon: 'image-down',
    labelKey: 'action:save-to-gallery',
  },
  share: {
    action: 'share',
    icon: 'share-2',
    labelKey: 'action:share',
  },
  delete: {
    action: 'delete',
    icon: 'trash',
    labelKey: 'button:delete',
    dangerous: true,
  },
}

export function getImageViewerActionButtons(input: {
  showDownload: boolean
  showSaveToGallery: boolean
  showShare: boolean
  includeInfo: boolean
  includeDelete: boolean
}): ImageViewerActionButton[] {
  const actions = [
    input.showDownload ? 'download' : null,
    'open-external',
    input.includeInfo ? 'info' : null,
    input.showSaveToGallery ? 'save-to-gallery' : null,
    input.showShare ? 'share' : null,
    input.includeDelete ? 'delete' : null,
  ].filter((action): action is ImageViewerAction => action !== null)

  return actions.map((action) => ACTION_BUTTONS[action])
}
