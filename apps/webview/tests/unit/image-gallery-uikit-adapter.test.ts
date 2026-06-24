import {describe, expect, it} from 'vitest'

import {
  mapGalleryActionsToViewerActions,
  mapGalleryImagesToViewerItems,
  mapGalleryThumbnailWindow,
} from '../../src/features/media/components/image-gallery-v2/image-gallery-uikit-adapter'

const IMAGES = [
  {id: 1, name: 'one.jpg', path: '/one.jpg', mimeType: 'image/jpeg'},
  {id: 2, name: 'two.heic', path: '/two.heic', mimeType: 'image/heic'},
  {id: 3, name: 'three.jpg', path: '/three.jpg', mimeType: 'image/jpeg'},
]

describe('image-gallery uikit adapter', () => {
  it('maps gallery images to app-agnostic image viewer items', () => {
    const model = {
      captureVisibleTrackSlot: (index: number) =>
        index === 1
          ? {
              imageIndex: 1,
              imageId: 2,
              src: 'preview:2',
              loading: false,
              error: null,
            }
          : null,
      isImageLoading: (index: number) => index === 2,
      peekVisiblePanelUrl: (index: number) => (index === 1 ? 'preview:2' : null),
      peekThumbnailStripUrl: (index: number) => `thumb:${index}`,
    }

    expect(
      mapGalleryImagesToViewerItems({
        images: IMAGES,
        model,
        getMeta: (image, index, total) => [`${index + 1} / ${total}`, image.mimeType ?? ''],
      }),
    ).toEqual([
      {
        id: 1,
        title: 'one.jpg',
        alt: 'one.jpg',
        meta: ['1 / 3', 'image/jpeg'],
        src: null,
        thumbnailSrc: 'thumb:0',
        loading: false,
        error: null,
      },
      {
        id: 2,
        title: 'two.heic',
        alt: 'two.heic',
        meta: ['2 / 3', 'image/heic'],
        src: 'preview:2',
        thumbnailSrc: 'thumb:1',
        loading: false,
        error: null,
      },
      {
        id: 3,
        title: 'three.jpg',
        alt: 'three.jpg',
        meta: ['3 / 3', 'image/jpeg'],
        src: null,
        thumbnailSrc: 'thumb:2',
        loading: true,
        error: null,
      },
    ])
  })

  it('maps action descriptors while preserving pending share state', () => {
    expect(
      mapGalleryActionsToViewerActions({
        actions: [
          {action: 'download', icon: 'download', labelKey: 'action:download'},
          {action: 'share', icon: 'share-2', labelKey: 'action:share'},
          {action: 'delete', icon: 'trash', labelKey: 'button:delete', dangerous: true},
        ],
        translate: (key) => `t:${key}`,
        sharePending: true,
        busyLabel: 'Preparing file...',
      }),
    ).toEqual([
      {
        value: 'download',
        label: 't:action:download',
        icon: 'download',
        dangerous: undefined,
        disabled: false,
        loading: false,
      },
      {
        value: 'share',
        label: 'Preparing file...',
        icon: 'share-2',
        dangerous: undefined,
        disabled: true,
        loading: true,
      },
      {
        value: 'delete',
        label: 't:button:delete',
        icon: 'trash',
        dangerous: true,
        disabled: false,
        loading: false,
      },
    ])
  })

  it('maps thumbnail virtualization without expanding the window', () => {
    expect(
      mapGalleryThumbnailWindow({
        startIndex: 10,
        endIndex: 14,
        indices: [10, 11, 12, 13, 14],
        beforeCount: 10,
        afterCount: 20,
        thumbnailStepPx: 64,
        maxRendered: 5,
      }),
    ).toEqual({
      indices: [10, 11, 12, 13, 14],
      beforeCount: 10,
      afterCount: 20,
      thumbnailStepPx: 64,
    })
  })
})
