import {describe, expect, it} from 'vitest'

import {getImageViewerActionButtons} from '../../src/features/media/components/image-gallery-v2/image-gallery-actions'
import {
  formatGalleryDate,
  formatGallerySize,
  formatGallerySizeWithBytes,
} from '../../src/features/media/components/image-gallery-v2/image-gallery-format'

describe('image gallery shared actions and formatting', () => {
  it('resolves action availability in the shared stable order', () => {
    expect(
      getImageViewerActionButtons({
        showSaveToGallery: true,
        showShare: true,
        includeInfo: true,
        includeDelete: true,
      }).map((button) => button.action),
    ).toEqual(['download', 'open-external', 'info', 'save-to-gallery', 'share', 'delete'])

    expect(
      getImageViewerActionButtons({
        showSaveToGallery: false,
        showShare: false,
        includeInfo: false,
        includeDelete: true,
      }).map((button) => button.action),
    ).toEqual(['download', 'open-external', 'delete'])
  })

  it('formats common gallery sizes and empty values', () => {
    expect(formatGallerySize()).toBe('—')
    expect(formatGallerySize(0)).toBe('—')
    expect(formatGallerySize(512)).toBe('512 B')
    expect(formatGallerySize(1536)).toBe('1.5 KB')
    expect(formatGallerySizeWithBytes(1536)).toBe('1.5 KB (1,536 B)')
  })

  it('formats gallery dates with empty and invalid guards', () => {
    expect(formatGalleryDate()).toBe('—')
    expect(formatGalleryDate(Number.NaN)).toBe('—')
    expect(formatGalleryDate(1710000000000)).not.toBe('—')
  })
})
