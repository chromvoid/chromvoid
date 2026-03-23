import {XLitElement} from '@statx/lit'

export type {SearchFilters, SortDirection, SortOption, ViewMode} from 'root/shared/contracts/file-manager'
import type {SearchFilters} from 'root/shared/contracts/file-manager'

export const DEFAULT_FILTERS: SearchFilters = {
  query: '',
  sortBy: 'name',
  sortDirection: 'asc',
  viewMode: 'list',
  showHidden: false,
  fileTypes: [],
}

export class FileSearchBase extends XLitElement {
  static get properties() {
    return {
      filters: {type: Object},
      totalFiles: {type: Number, attribute: 'total-files'},
      filteredFiles: {type: Number, attribute: 'filtered-files'},
    }
  }

  declare filters: SearchFilters
  declare totalFiles: number
  declare filteredFiles: number

  constructor() {
    super()
    this.filters = DEFAULT_FILTERS
    this.totalFiles = 0
    this.filteredFiles = 0
  }

  protected emit(next: SearchFilters) {
    this.dispatchEvent(new CustomEvent('filters-change', {detail: next, bubbles: true}))
  }
}
