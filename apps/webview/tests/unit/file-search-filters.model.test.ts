import {describe, expect, it, vi} from 'vitest'

import {
  createDefaultFileSearchFilters,
  createFileSearchFilterActions,
  hasContentFiltering,
  hasMobileFilterBadge,
  hasNonDefaultFileSearchFilters,
} from '../../src/features/file-manager/models/file-search-filters.model'
import type {SearchFilters} from '../../src/shared/contracts/file-manager'

describe('file search filter actions', () => {
  it('updates filters through the provided write boundary', () => {
    let filters: SearchFilters = createDefaultFileSearchFilters()
    const write = vi.fn((next: SearchFilters) => {
      filters = next
    })
    const actions = createFileSearchFilterActions({
      read: () => filters,
      write,
    })

    actions.setSortBy('date')
    actions.toggleSortDirection()
    actions.cycleViewMode()
    actions.toggleFileType('documents')
    actions.clearQuery()

    expect(write).toHaveBeenCalledTimes(5)
    expect(filters).toEqual({
      query: '',
      sortBy: 'date',
      sortDirection: 'desc',
      viewMode: 'grid',
      showHidden: false,
      fileTypes: ['documents'],
    })
  })

  it('uses table-sort semantics for sortable headers', () => {
    let filters: SearchFilters = {
      ...createDefaultFileSearchFilters(),
      sortBy: 'name',
      sortDirection: 'asc',
    }
    const actions = createFileSearchFilterActions({
      read: () => filters,
      write: (next) => {
        filters = next
      },
    })

    actions.applyTableSort('name')
    expect(filters.sortDirection).toBe('desc')

    actions.applyTableSort('size')
    expect(filters).toMatchObject({
      sortBy: 'size',
      sortDirection: 'asc',
    })
  })

  it('derives UI filter state from default filters', () => {
    const defaults = createDefaultFileSearchFilters()

    expect(hasNonDefaultFileSearchFilters(defaults)).toBe(false)
    expect(hasMobileFilterBadge(defaults)).toBe(false)
    expect(hasContentFiltering(defaults)).toBe(false)

    expect(hasNonDefaultFileSearchFilters({...defaults, query: 'report'})).toBe(true)
    expect(hasMobileFilterBadge({...defaults, query: 'report'})).toBe(false)
    expect(hasContentFiltering({...defaults, query: 'report'})).toBe(true)
  })
})
