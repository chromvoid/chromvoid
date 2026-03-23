import type {FileItemData} from 'root/shared/contracts/file-manager'
import {getLang, i18n} from 'root/i18n'

const FILE_TYPE_EXTENSIONS: Record<'image' | 'document' | 'archive' | 'media' | 'code', string[]> = {
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff', 'avif'],
  document: ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt', 'xls', 'xlsx', 'ppt', 'pptx', 'csv'],
  archive: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'dmg', 'iso'],
  media: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'wma', 'mp4', 'avi', 'mkv', 'mov', 'wmv', 'webm', 'flv'],
  code: [
    'js',
    'ts',
    'jsx',
    'tsx',
    'html',
    'css',
    'scss',
    'less',
    'py',
    'java',
    'cpp',
    'c',
    'h',
    'go',
    'rs',
    'php',
    'rb',
    'swift',
    'kt',
    'json',
    'xml',
    'yaml',
    'yml',
    'md',
    'sh',
    'bash',
  ],
}

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
  const lastDot = name.lastIndexOf('.')
  return lastDot > 0 ? name.slice(lastDot + 1).toUpperCase() : ''
}

export const getFileTypeClass = (name: string): string => {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  for (const [type, extensions] of Object.entries(FILE_TYPE_EXTENSIONS)) {
    if (extensions.includes(ext)) {
      return `file-${type}`
    }
  }
  return 'file-default'
}

export const getFileIcon = (name: string, isDir: boolean): string => {
  if (isDir) return 'folder-fill'

  const ext = name.split('.').pop()?.toLowerCase() || ''

  if (FILE_TYPE_EXTENSIONS.image.includes(ext)) return 'file-earmark-image'
  if (['pdf'].includes(ext)) return 'file-earmark-pdf'
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return 'file-earmark-word'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'file-earmark-excel'
  if (['ppt', 'pptx'].includes(ext)) return 'file-earmark-ppt'
  if (FILE_TYPE_EXTENSIONS.document.includes(ext)) return 'file-earmark-text'
  if (FILE_TYPE_EXTENSIONS.archive.includes(ext)) return 'file-earmark-zip'
  if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'wma'].includes(ext)) return 'file-earmark-music'
  if (['mp4', 'avi', 'mkv', 'mov', 'wmv', 'webm', 'flv'].includes(ext)) return 'file-earmark-play'
  if (FILE_TYPE_EXTENSIONS.code.includes(ext)) return 'file-earmark-code'

  return 'file-earmark'
}

export const isMobileTouch = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(hover: none) and (pointer: coarse)')?.matches

export const getDragData = (item: FileItemData): string => JSON.stringify(item)

export const getInfoText = (item: FileItemData): string =>
  item.isDir ? i18n('node:dir') : `${formatFileSize(item.size)} • ${formatDate(item.lastModified)}`
