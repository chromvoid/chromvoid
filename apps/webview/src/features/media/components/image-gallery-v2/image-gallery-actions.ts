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
  showSaveToGallery: boolean
  showShare: boolean
  includeInfo: boolean
  includeDelete: boolean
}): ImageViewerActionButton[] {
  const actions: ImageViewerAction[] = ['download', 'open-external']

  if (input.includeInfo) {
    actions.push('info')
  }
  if (input.showSaveToGallery) {
    actions.push('save-to-gallery')
  }
  if (input.showShare) {
    actions.push('share')
  }
  if (input.includeDelete) {
    actions.push('delete')
  }

  return actions.map((action) => ACTION_BUTTONS[action])
}
