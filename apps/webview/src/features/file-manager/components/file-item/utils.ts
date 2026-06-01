import type {FileItemData} from 'root/shared/contracts/file-manager'
import {getLang, i18n} from 'root/i18n'
import {getDisplayFileExtension, resolveFileFormat} from 'root/utils/file-format-registry'

export const formatFileSize = (bytes?: number): string => {
  if (!bytes) return ''
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i]
}

export const formatDate = (timestamp?: number): string => {
  if (!timestamp) return ''
  return new Date(timestamp).toLocaleDateString(getLang(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export const getFileExtension = (name: string): string => {
  return getDisplayFileExtension(name)
}

export const getFileTypeClass = (item: FileItemData): string => {
  return resolveFileFormat(item).cssClass
}

export const getFileIcon = (item: FileItemData): string => {
  return resolveFileFormat(item).icon
}

export const isMobileTouch = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(hover: none) and (pointer: coarse)')?.matches

export const getInfoText = (item: FileItemData): string =>
  item.isDir ? i18n('node:dir') : `${formatFileSize(item.size)} • ${formatDate(item.lastModified)}`
