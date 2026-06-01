import type {FileMediaInfo} from 'root/core/catalog/media-info'

export type SortOption = 'name' | 'size' | 'date' | 'type'
export type SortDirection = 'asc' | 'desc'
export type ViewMode = 'list' | 'grid' | 'table'

export type SearchFilters = {
  query: string
  sortBy: SortOption
  sortDirection: SortDirection
  viewMode: ViewMode
  showHidden: boolean
  fileTypes: string[]
}

export type FileItemData = {
  id: number
  path: string
  name: string
  isDir: boolean
  size?: number
  lastModified?: number
  sourceRevision?: number
  mediaInspectedRevision?: number
  mimeType?: string
  mediaInfo?: FileMediaInfo | null
}

export type FileListItem = FileItemData & {
  filtered?: boolean
  selected?: boolean
  deleteExiting?: true
}

export type FileListPlaceholderItem = {
  kind: 'placeholder'
  placeholderKey: string
  virtualIndex: number
}

export type FileListRenderItem = FileListItem | null
export type FileListVisibleItem = (FileListItem & {virtualIndex?: number}) | FileListPlaceholderItem

export const isFileListPlaceholderItem = (
  item: FileListVisibleItem,
): item is FileListPlaceholderItem => 'kind' in item && item.kind === 'placeholder'

export const isRealFileListItem = (
  item: FileListRenderItem | FileListVisibleItem | undefined,
): item is FileListItem => Boolean(item && !('kind' in item))

export type FileListVisibleRange = {
  startIndex: number
  endIndex: number
}

export type FileListViewportSnapshot = {
  path: string
  viewMode: ViewMode
  scrollTop: number
  activeItemId: number | null
  focusItemId: number | null
}

export type FileListViewportRestoreState = FileListViewportSnapshot & {
  revision: number
}
