import type {SearchFilters, SortOption, ViewMode} from 'root/shared/contracts/file-manager'

export type FileSearchFilterActions = {
  setFilters(next: SearchFilters): void
  patchFilters(patch: Partial<SearchFilters>): void
  reset(): void
  clearQuery(): void
  hideHiddenFiles(): void
  toggleShowHidden(): void
  toggleSortDirection(): void
  setSortBy(value: SortOption): void
  applyTableSort(value: SortOption): void
  cycleViewMode(): void
  setViewMode(value: ViewMode): void
  removeFileType(value: string): void
  toggleFileType(value: string): void
}

type FileSearchFilterActionsOptions = {
  read: () => SearchFilters
  write: (next: SearchFilters) => void
  getDefaults?: () => SearchFilters
}

export function createDefaultFileSearchFilters(defaults: Partial<SearchFilters> = {}): SearchFilters {
  return {
    query: defaults.query ?? '',
    sortBy: defaults.sortBy ?? 'name',
    sortDirection: defaults.sortDirection ?? 'asc',
    viewMode: defaults.viewMode ?? 'list',
    showHidden: defaults.showHidden ?? false,
    fileTypes: defaults.fileTypes ? [...defaults.fileTypes] : [],
  }
}

function cloneFilters(filters: SearchFilters): SearchFilters {
  return {
    ...filters,
    fileTypes: [...filters.fileTypes],
  }
}

export function hasNonDefaultFileSearchFilters(
  filters: SearchFilters,
  defaults = createDefaultFileSearchFilters(),
): boolean {
  return (
    filters.query !== defaults.query ||
    filters.sortBy !== defaults.sortBy ||
    filters.sortDirection !== defaults.sortDirection ||
    filters.viewMode !== defaults.viewMode ||
    filters.showHidden !== defaults.showHidden ||
    filters.fileTypes.length > 0
  )
}

export function hasMobileFilterBadge(
  filters: SearchFilters,
  defaults = createDefaultFileSearchFilters(),
): boolean {
  return (
    filters.sortBy !== defaults.sortBy ||
    filters.sortDirection !== defaults.sortDirection ||
    filters.viewMode !== defaults.viewMode ||
    filters.showHidden !== defaults.showHidden ||
    filters.fileTypes.length > 0
  )
}

export function hasContentFiltering(
  filters: SearchFilters,
  defaults = createDefaultFileSearchFilters(),
): boolean {
  return (
    filters.query.trim() !== '' ||
    filters.showHidden !== defaults.showHidden ||
    filters.fileTypes.length > 0
  )
}

export function createFileSearchFilterActions({
  read,
  write,
  getDefaults = createDefaultFileSearchFilters,
}: FileSearchFilterActionsOptions): FileSearchFilterActions {
  const setFilters = (next: SearchFilters): void => {
    write(cloneFilters(next))
  }

  const patchFilters = (patch: Partial<SearchFilters>): void => {
    const current = read()
    setFilters({
      ...current,
      ...patch,
      fileTypes: patch.fileTypes ? [...patch.fileTypes] : [...current.fileTypes],
    })
  }

  return {
    setFilters,
    patchFilters,
    reset(): void {
      setFilters(getDefaults())
    },
    clearQuery(): void {
      patchFilters({query: ''})
    },
    hideHiddenFiles(): void {
      patchFilters({showHidden: false})
    },
    toggleShowHidden(): void {
      patchFilters({showHidden: !read().showHidden})
    },
    toggleSortDirection(): void {
      patchFilters({sortDirection: read().sortDirection === 'asc' ? 'desc' : 'asc'})
    },
    setSortBy(value: SortOption): void {
      patchFilters({sortBy: value})
    },
    applyTableSort(value: SortOption): void {
      const current = read()
      const isSame = current.sortBy === value
      patchFilters({
        sortBy: value,
        sortDirection: isSame && current.sortDirection === 'asc' ? 'desc' : 'asc',
      })
    },
    cycleViewMode(): void {
      const current = read().viewMode
      const next: ViewMode = current === 'list' ? 'grid' : current === 'grid' ? 'table' : 'list'
      patchFilters({viewMode: next})
    },
    setViewMode(value: ViewMode): void {
      patchFilters({viewMode: value})
    },
    removeFileType(value: string): void {
      patchFilters({fileTypes: read().fileTypes.filter((type) => type !== value)})
    },
    toggleFileType(value: string): void {
      const current = read().fileTypes
      patchFilters({
        fileTypes: current.includes(value)
          ? current.filter((type) => type !== value)
          : [...current, value],
      })
    },
  }
}
