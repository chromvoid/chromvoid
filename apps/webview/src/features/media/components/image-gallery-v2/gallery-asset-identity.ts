import type {GalleryAssetKey, GalleryDisplayVariant, GalleryImage} from './gallery.types'

export function getGalleryAssetVersion(image: Pick<GalleryImage, 'lastModified'>): number {
  return image.lastModified ?? 0
}

export function getGalleryAssetKey(
  image: Pick<GalleryImage, 'id' | 'lastModified'>,
  variant: GalleryDisplayVariant,
): GalleryAssetKey {
  return `${image.id}:${variant}:${getGalleryAssetVersion(image)}`
}
