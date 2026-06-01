import {getLang} from 'root/i18n'

const EMPTY_VALUE = '—'

export function formatGalleryDate(timestamp?: number): string {
  if (!timestamp || !Number.isFinite(timestamp)) return EMPTY_VALUE
  return new Date(timestamp).toLocaleDateString(getLang(), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatGallerySize(bytes?: number): string {
  if (!bytes || bytes <= 0) return EMPTY_VALUE

  const sizes = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = Math.round((bytes / Math.pow(1024, index)) * 100) / 100
  return `${value} ${sizes[index]}`
}

export function formatGallerySizeWithBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return EMPTY_VALUE

  return `${formatGallerySize(bytes)} (${new Intl.NumberFormat(getLang()).format(bytes)} B)`
}
