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

  it('toggles mobile quick filters without clearing existing filter state', () => {
    let filters: SearchFilters = {
      ...createDefaultFileSearchFilters(),
      query: 'daily',
      sortBy: 'date',
      sortDirection: 'desc',
      viewMode: 'grid',
      fileTypes: ['documents'],
    }
    const actions = createFileSearchFilterActions({
      read: () => filters,
      write: (next) => {
        filters = next
      },
    })

    actions.setMobileQuickFilter('markdown')
    expect(filters).toMatchObject({
      query: 'daily',
      sortBy: 'date',
      sortDirection: 'desc',
      viewMode: 'grid',
      fileTypes: ['documents', 'markdown'],
    })

    actions.setMobileQuickFilter('images')
    expect(filters).toMatchObject({query: 'daily', fileTypes: ['documents', 'markdown', 'images']})

    actions.setMobileQuickFilter('markdown')
    expect(filters).toMatchObject({query: 'daily', fileTypes: ['documents', 'images']})

    actions.setMobileQuickFilter('all')
    expect(filters).toMatchObject({query: 'daily', fileTypes: []})
  })

  it('keeps mobile view controls limited to list and grid while preserving table elsewhere', () => {
    let filters: SearchFilters = createDefaultFileSearchFilters({viewMode: 'table'})
    const actions = createFileSearchFilterActions({
      read: () => filters,
      write: (next) => {
        filters = next
      },
    })

    actions.setMobileViewMode('grid')
    expect(filters.viewMode).toBe('grid')

    actions.setMobileViewMode('list')
    expect(filters.viewMode).toBe('list')

    actions.setViewMode('table')
    expect(filters.viewMode).toBe('table')
  })

  it('cycles the mobile sort control through name, date, and size', () => {
    let filters: SearchFilters = createDefaultFileSearchFilters()
    const actions = createFileSearchFilterActions({
      read: () => filters,
      write: (next) => {
        filters = next
      },
    })

    actions.cycleMobileSort()
    expect(filters.sortBy).toBe('date')

    actions.cycleMobileSort()
    expect(filters.sortBy).toBe('size')

    actions.cycleMobileSort()
    expect(filters.sortBy).toBe('name')
  })

  it('resets to injected default filters', () => {
    let filters: SearchFilters = {
      ...createDefaultFileSearchFilters({showHidden: true}),
      query: 'report',
      fileTypes: ['documents'],
    }
    const actions = createFileSearchFilterActions({
      read: () => filters,
      write: (next) => {
        filters = next
      },
      getDefaults: () => createDefaultFileSearchFilters({showHidden: true}),
    })

    actions.reset()

    expect(filters).toEqual({
      query: '',
      sortBy: 'name',
      sortDirection: 'asc',
      viewMode: 'list',
      showHidden: true,
      fileTypes: [],
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

    const hiddenByDefault = createDefaultFileSearchFilters({showHidden: true})
    expect(hasNonDefaultFileSearchFilters(hiddenByDefault, hiddenByDefault)).toBe(false)
    expect(hasMobileFilterBadge(hiddenByDefault, hiddenByDefault)).toBe(false)
    expect(hasContentFiltering(hiddenByDefault, hiddenByDefault)).toBe(false)
    expect(hasContentFiltering({...hiddenByDefault, showHidden: false}, hiddenByDefault)).toBe(true)
  })
})
