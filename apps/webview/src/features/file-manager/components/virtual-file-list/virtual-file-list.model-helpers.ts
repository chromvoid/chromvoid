import {getLang} from 'root/i18n'
import {formatFileSize as formatBytes} from 'root/utils/format-file-size'
export {
  filterAndSortFileItems as filterAndSortItems,
  getFileExtension,
  getFileTypeExtensions,
} from 'root/shared/services/file-list-filtering'

export const normalizePath = (path: string): string => {
  const raw = (path || '/').trim()
  if (raw === '' || raw === '/') return '/'

  let normalized = raw
  while (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1)
  }
  return normalized
}

export const getParentPath = (path: string): string => {
  const normalized = normalizePath(path)
  if (normalized === '/') return '/'
  const idx = normalized.lastIndexOf('/')
  return idx <= 0 ? '/' : normalized.slice(0, idx)
}

export const getLastSegment = (path: string): string => {
  const normalized = normalizePath(path)
  const idx = normalized.lastIndexOf('/')
  return idx >= 0 ? normalized.slice(idx + 1) : normalized
}

export const formatFileSize = (bytes?: number): string => {
  if (bytes == null) return '—'
  return formatBytes(bytes, {empty: '—'})
}

export const formatDate = (timestamp?: number): string => {
  if (!timestamp) return '—'
  return new Date(timestamp).toLocaleDateString(getLang(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}
