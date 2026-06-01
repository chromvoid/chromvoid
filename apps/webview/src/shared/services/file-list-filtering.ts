import type {FileListItem, SearchFilters} from 'root/shared/contracts/file-manager'
import {getFilterExtensions, resolveFileFormat} from 'root/utils/file-format-registry'

export const getFileExtension = (filename: string): string => {
  const lastDot = filename.lastIndexOf('.')
  return lastDot > 0 ? filename.slice(lastDot + 1) : ''
}

export const getFileTypeExtensions = (fileTypes: readonly string[]): string[] =>
  fileTypes.flatMap((type) => {
    if (
      type === 'images' ||
      type === 'documents' ||
      type === 'videos' ||
      type === 'audio' ||
      type === 'archives' ||
      type === 'code'
    ) {
      return [...getFilterExtensions(type)]
    }
    return []
  })

export const filterAndSortFileItems = <T extends FileListItem>(
  items: readonly T[],
  filters: SearchFilters,
): T[] => {
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
    const typeFilters = new Set(filters.fileTypes)
    filtered = filtered.filter((item) => {
      if (item.isDir) return true
      const groups = resolveFileFormat(item).filterGroups
      return groups.some((group) => typeFilters.has(group))
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
