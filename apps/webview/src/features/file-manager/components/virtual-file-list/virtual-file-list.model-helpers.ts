import type {FileListItem, SearchFilters} from 'root/shared/contracts/file-manager'
import {getLang} from 'root/i18n'

const FILE_TYPE_EXTENSIONS: Record<string, string[]> = {
  images: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'],
  documents: ['pdf', 'doc', 'docx', 'txt', 'rtf'],
  videos: ['mp4', 'avi', 'mkv', 'mov', 'wmv'],
  audio: ['mp3', 'wav', 'flac', 'aac'],
  archives: ['zip', 'rar', '7z', 'tar', 'gz'],
  code: ['js', 'ts', 'html', 'css', 'py', 'java', 'cpp'],
}

export const getFileExtension = (filename: string): string => {
  const lastDot = filename.lastIndexOf('.')
  return lastDot > 0 ? filename.slice(lastDot + 1) : ''
}

export const getFileTypeExtensions = (fileTypes: readonly string[]): string[] =>
  fileTypes.flatMap((type) => FILE_TYPE_EXTENSIONS[type] ?? [])

export const filterAndSortItems = (items: FileListItem[], filters: SearchFilters): FileListItem[] => {
  let filtered = [...items]

  if (!filters.showHidden) {
    filtered = filtered.filter((item) => item.isDir || !item.name.startsWith('.'))
  }

  if (filters.query) {
    const query = filters.query.toLowerCase()
    filtered = filtered.filter(
      (item) => item.name.toLowerCase().includes(query) || item.path.toLowerCase().includes(query),
    )
  }

  if (filters.fileTypes.length > 0) {
    const typeExtensions = getFileTypeExtensions(filters.fileTypes)
    filtered = filtered.filter((item) => {
      if (item.isDir) return true
      const ext = getFileExtension(item.name).toLowerCase()
      return typeExtensions.includes(ext)
    })
  }

  filtered.sort((a, b) => {
    const mult = filters.sortDirection === 'asc' ? 1 : -1

    if (a.isDir !== b.isDir) {
      return a.isDir ? -1 : 1
    }

    switch (filters.sortBy) {
      case 'name':
        return a.name.localeCompare(b.name) * mult
      case 'size':
        return ((a.size || 0) - (b.size || 0)) * mult
      case 'date':
        return ((a.lastModified || 0) - (b.lastModified || 0)) * mult
      case 'type': {
        const extA = getFileExtension(a.name)
        const extB = getFileExtension(b.name)
        return extA.localeCompare(extB) * mult
      }
      default:
        return 0
    }
  })

  return filtered
}

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
  if (!bytes) return '—'
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${Math.round((bytes / Math.pow(1024, i)) * 100) / 100} ${sizes[i]}`
}

export const formatDate = (timestamp?: number): string => {
  if (!timestamp) return '—'
  return new Date(timestamp).toLocaleDateString(getLang(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}
