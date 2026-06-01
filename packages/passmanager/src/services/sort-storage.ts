import type {GroupBy, SortDirection, SortField, ViewMode} from '../service/types'

/*** Service to save and restore sorting settings
*/
class SortStorageService {
  private readonly STORAGE_PREFIX = 'pm-'
  private readonly VIEW_MODE_KEYS = ['pm_view_mode', 'pm-view-mode'] as const

  private getKey(setting: string): string {
    return `${this.STORAGE_PREFIX}${setting}`
  }

  /*** Downloads sorting settings from localStorage
*/
  loadSettings(): {
    sortField: SortField
    sortDirection: SortDirection
    groupBy: GroupBy
    viewMode: ViewMode
  } {
    const defaults = {
      sortField: 'name' as SortField,
      sortDirection: 'asc' as SortDirection,
      groupBy: 'none' as GroupBy,
      viewMode: 'default' as ViewMode,
    }

    try {
      const sortField = localStorage.getItem(this.getKey('sort-field')) as SortField
      const sortDirection = localStorage.getItem(this.getKey('sort-direction')) as SortDirection
      const groupBy = localStorage.getItem(this.getKey('group-by')) as GroupBy
      const viewMode = this.loadViewMode()

      return {
        sortField: this.isValidSortField(sortField) ? sortField : defaults.sortField,
        sortDirection: this.isValidSortDirection(sortDirection) ? sortDirection : defaults.sortDirection,
        groupBy: this.isValidGroupBy(groupBy) ? groupBy : defaults.groupBy,
        viewMode: this.isValidViewMode(viewMode) ? viewMode : defaults.viewMode,
      }
    } catch {
      return defaults
    }
  }

  /*** Saves sorting settings in localStorage
*/
  saveSettings(settings: {sortField?: SortField; sortDirection?: SortDirection; groupBy?: GroupBy; viewMode?: ViewMode}): void {
    try {
      if (settings.sortField) {
        localStorage.setItem(this.getKey('sort-field'), settings.sortField)
      }
      if (settings.sortDirection) {
        localStorage.setItem(this.getKey('sort-direction'), settings.sortDirection)
      }
      if (settings.groupBy) {
        localStorage.setItem(this.getKey('group-by'), settings.groupBy)
      }
      if (settings.viewMode) {
        localStorage.setItem('pm_view_mode', settings.viewMode)
        localStorage.removeItem('pm-view-mode')
      }
    } catch {
      // Ignore localStorage errors (private mode, overflow, etc.)
    }
  }

  private loadViewMode(): ViewMode | null {
    for (const key of this.VIEW_MODE_KEYS) {
      const value = localStorage.getItem(key)
      if (!this.isValidViewMode(value)) {
        continue
      }

      if (key !== 'pm_view_mode') {
        localStorage.setItem('pm_view_mode', value)
        localStorage.removeItem(key)
      }

      return value
    }

    return null
  }

  private isValidSortField(value: string | null): value is SortField {
    return value !== null && ['name', 'username', 'modified', 'created', 'website'].includes(value)
  }

  private isValidSortDirection(value: string | null): value is SortDirection {
    return value !== null && ['asc', 'desc'].includes(value)
  }

  private isValidGroupBy(value: string | null): value is GroupBy {
    return value !== null && ['none', 'website', 'modified', 'security'].includes(value)
  }

  private isValidViewMode(value: string | null): value is ViewMode {
    return value !== null && ['default', 'compact', 'dense'].includes(value)
  }

  /*** Clears all saved settings
*/
  clear(): void {
    try {
      localStorage.removeItem(this.getKey('sort-field'))
      localStorage.removeItem(this.getKey('sort-direction'))
      localStorage.removeItem(this.getKey('group-by'))
      localStorage.removeItem('pm_view_mode')
      localStorage.removeItem('pm-view-mode')
    } catch {
      // Ignore mistakes
    }
  }
}

// Export singleton
export const sortStorage = new SortStorageService()
