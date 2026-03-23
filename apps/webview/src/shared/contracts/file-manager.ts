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
}

export type FileListItem = FileItemData & {
  filtered?: boolean
  selected?: boolean
}
