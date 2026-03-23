import type {SortOption, ViewMode} from 'root/shared/contracts/file-manager'
import {i18n} from 'root/i18n'

export const getSortLabel = (value: SortOption): string => {
  switch (value) {
    case 'name':
      return i18n('file-manager:name')
    case 'size':
      return i18n('file-manager:size')
    case 'date':
      return i18n('file-manager:modified')
    case 'type':
      return i18n('file-manager:type')
  }
}

export const getViewLabel = (value: ViewMode): string => {
  switch (value) {
    case 'list':
      return i18n('file-manager:view:list')
    case 'grid':
      return i18n('file-manager:view:grid')
    case 'table':
      return i18n('file-manager:view:table')
  }
}

export const getFileTypeLabel = (value: string): string => {
  switch (value) {
    case 'images':
      return i18n('file-manager:type:images')
    case 'documents':
      return i18n('file-manager:type:documents')
    case 'videos':
      return i18n('file-manager:type:videos')
    case 'audio':
      return i18n('file-manager:type:audio')
    case 'archives':
      return i18n('file-manager:type:archives')
    case 'code':
      return i18n('file-manager:type:code')
    default:
      return value
  }
}

export const getSortDirectionLabel = (sortBy: SortOption, sortDirection: 'asc' | 'desc'): string => {
  if (sortBy === 'name' || sortBy === 'type') {
    return i18n(sortDirection === 'asc' ? 'file-manager:sort-direction:az' : 'file-manager:sort-direction:za')
  }

  return i18n(
    sortDirection === 'asc' ? 'file-manager:sort-direction:asc' : 'file-manager:sort-direction:desc',
  )
}
