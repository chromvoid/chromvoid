/**
 * Regression test: shared contracts must remain importable and type-compatible.
 * If this file fails to compile, a contract was accidentally renamed or removed.
 */
import {describe, expect, it} from 'vitest'

import type {
  FileItemData,
  FileListItem,
  SearchFilters,
  SortDirection,
  SortOption,
  ViewMode,
} from '../../src/shared/contracts/file-manager'

describe('shared/contracts/file-manager exports', () => {
  it('SearchFilters satisfies expected shape', () => {
    const filters: SearchFilters = {
      query: '',
      sortBy: 'name',
      sortDirection: 'asc',
      viewMode: 'list',
      showHidden: false,
      fileTypes: [],
    }
    expect(filters).toBeDefined()
  })

  it('SortOption accepts known values', () => {
    const options: SortOption[] = ['name', 'size', 'date', 'type']
    expect(options).toHaveLength(4)
  })

  it('SortDirection accepts known values', () => {
    const dirs: SortDirection[] = ['asc', 'desc']
    expect(dirs).toHaveLength(2)
  })

  it('ViewMode accepts known values', () => {
    const modes: ViewMode[] = ['list', 'grid', 'table']
    expect(modes).toHaveLength(3)
  })

  it('FileItemData satisfies expected shape', () => {
    const item: FileItemData = {
      id: 1,
      path: '/test.txt',
      name: 'test.txt',
      isDir: false,
    }
    expect(item).toBeDefined()
  })

  it('FileListItem extends FileItemData', () => {
    const item: FileListItem = {
      id: 2,
      path: '/dir',
      name: 'dir',
      isDir: true,
      filtered: false,
      selected: true,
    }
    expect(item.id).toBe(2)
    expect(item.filtered).toBe(false)
    expect(item.selected).toBe(true)
  })
})
