import {getLang} from 'root/i18n'
import {formatGalleryDate} from '../image-gallery-v2/image-gallery-format'

const EMPTY_VALUE = '—'

export {
  formatGalleryDate as formatDate,
  formatGallerySize as formatSize,
  formatGallerySizeWithBytes as formatSizeWithBytes,
} from '../image-gallery-v2/image-gallery-format'

export function formatDecimal(value: number, maximumFractionDigits: number): string {
  return new Intl.NumberFormat(getLang(), {
    maximumFractionDigits,
  }).format(value)
}

export function formatDateString(value?: string | null): string {
  if (!value) return EMPTY_VALUE

  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return value

  return formatGalleryDate(timestamp)
}
