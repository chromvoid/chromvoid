import {ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

export type {SearchFilters, SortDirection, SortOption, ViewMode} from 'root/shared/contracts/file-manager'
import type {SearchFilters} from 'root/shared/contracts/file-manager'
import {
  createDefaultFileSearchFilters,
  createFileSearchFilterActions,
  type FileSearchFilterActions,
} from '../models/file-search-filters.model'

export const DEFAULT_FILTERS: SearchFilters = createDefaultFileSearchFilters()

export class FileSearchBase extends ReatomLitElement {
  static get properties() {
    return {
      filters: {type: Object},
      filterActions: {attribute: false},
      totalFiles: {type: Number, attribute: 'total-files'},
      filteredFiles: {type: Number, attribute: 'filtered-files'},
    }
  }

  declare filters: SearchFilters
  declare filterActions: FileSearchFilterActions | null
  declare totalFiles: number
  declare filteredFiles: number
  private readonly legacyFilterActions: FileSearchFilterActions

  constructor() {
    super()
    this.filters = DEFAULT_FILTERS
    this.filterActions = null
    this.totalFiles = 0
    this.filteredFiles = 0
    this.legacyFilterActions = createFileSearchFilterActions({
      read: () => this.filters,
      write: (next) => this.emit(next),
    })
  }

  protected emit(next: SearchFilters) {
    this.dispatchEvent(new CustomEvent('filters-change', {detail: next, bubbles: true}))
  }

  protected getFilterActions(): FileSearchFilterActions {
    return this.filterActions ?? this.legacyFilterActions
  }
}
