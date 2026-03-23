import type {GroupBy, SortDirection, SortField} from '../service/types'

/**
 * Сервис для сохранения и восстановления настроек сортировки
 */
class SortStorageService {
  private readonly STORAGE_PREFIX = 'pm-'

  private getKey(setting: string): string {
    return `${this.STORAGE_PREFIX}${setting}`
  }

  /**
   * Загружает настройки сортировки из localStorage
   */
  loadSettings(): {
    sortField: SortField
    sortDirection: SortDirection
    groupBy: GroupBy
  } {
    const defaults = {
      sortField: 'name' as SortField,
      sortDirection: 'asc' as SortDirection,
      groupBy: 'none' as GroupBy,
    }

    try {
      const sortField = localStorage.getItem(this.getKey('sort-field')) as SortField
      const sortDirection = localStorage.getItem(this.getKey('sort-direction')) as SortDirection
      const groupBy = localStorage.getItem(this.getKey('group-by')) as GroupBy

      return {
        sortField: this.isValidSortField(sortField) ? sortField : defaults.sortField,
        sortDirection: this.isValidSortDirection(sortDirection) ? sortDirection : defaults.sortDirection,
        groupBy: this.isValidGroupBy(groupBy) ? groupBy : defaults.groupBy,
      }
    } catch {
      return defaults
    }
  }

  /**
   * Сохраняет настройки сортировки в localStorage
   */
  saveSettings(settings: {sortField?: SortField; sortDirection?: SortDirection; groupBy?: GroupBy}): void {
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
    } catch {
      // Игнорируем ошибки localStorage (приватный режим, переполнение и т.д.)
    }
  }

  private isValidSortField(value: string | null): value is SortField {
    return value !== null && ['name', 'username', 'modified', 'created', 'website'].includes(value)
  }

  private isValidSortDirection(value: string | null): value is SortDirection {
    return value !== null && ['asc', 'desc'].includes(value)
  }

  private isValidGroupBy(value: string | null): value is GroupBy {
    return value !== null && ['none', 'folder', 'website', 'modified', 'security'].includes(value)
  }

  /**
   * Очищает все сохраненные настройки
   */
  clear(): void {
    try {
      localStorage.removeItem(this.getKey('sort-field'))
      localStorage.removeItem(this.getKey('sort-direction'))
      localStorage.removeItem(this.getKey('group-by'))
    } catch {
      // Игнорируем ошибки
    }
  }
}

// Экспортируем singleton
export const sortStorage = new SortStorageService()
