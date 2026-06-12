import {afterEach, describe, expect, it, vi} from 'vitest'

import {VirtualFileList} from '../../src/features/file-manager/components/virtual-file-list'
import {createDefaultFileSearchFilters} from '../../src/features/file-manager/models/file-search-filters.model'
import type {FileSearchFilterActions} from '../../src/features/file-manager/models/file-search-filters.model'

async function settle(element: VirtualFileList) {
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete

  const nested = element.shadowRoot?.querySelector<HTMLElement & {updateComplete?: Promise<unknown>}>(
    'pm-summary-rail',
  )
  await nested?.updateComplete
}

function createFilterActions(overrides: Partial<FileSearchFilterActions> = {}): FileSearchFilterActions {
  return {
    setFilters: vi.fn(),
    patchFilters: vi.fn(),
    reset: vi.fn(),
    clearQuery: vi.fn(),
    hideHiddenFiles: vi.fn(),
    toggleShowHidden: vi.fn(),
    toggleSortDirection: vi.fn(),
    setSortBy: vi.fn(),
    applyTableSort: vi.fn(),
    cycleViewMode: vi.fn(),
    setViewMode: vi.fn(),
    removeFileType: vi.fn(),
    toggleFileType: vi.fn(),
    ...overrides,
  }
}

describe('virtual-file-list filters', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('resets filters through provided filter actions from the empty state', async () => {
    VirtualFileList.define()
    const reset = vi.fn()
    const element = document.createElement('virtual-file-list') as VirtualFileList
    element.items = []
    element.itemsPreFiltered = true
    element.filters = {
      ...createDefaultFileSearchFilters(),
      query: 'report',
    }
    element.filterActions = createFilterActions({reset})
    document.body.append(element)
    await settle(element)

    const clearButton = [...(element.shadowRoot?.querySelectorAll<HTMLElement>('cv-button') ?? [])].find(
      (button) => button.textContent?.includes('Clear filters'),
    )
    clearButton?.click()

    expect(reset).toHaveBeenCalledTimes(1)
  })

  it('renders filtered empty state instead of permanent skeletons when only unloaded filtered slots remain', async () => {
    VirtualFileList.define()
    const element = document.createElement('virtual-file-list') as VirtualFileList
    element.items = [null, null]
    element.itemsPreFiltered = true
    element.filters = {
      ...createDefaultFileSearchFilters(),
      query: 'missing',
    }
    document.body.append(element)
    await settle(element)

    expect(element.shadowRoot?.querySelector('cv-empty-state')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('.file-item-skeleton')).toBeNull()
  })

  it('does not render the desktop file status summary locally', async () => {
    VirtualFileList.define()
    const element = document.createElement('virtual-file-list') as VirtualFileList
    element.items = []
    element.selectedItems = [1, 2]
    document.body.append(element)
    await settle(element)

    const summary = element.shadowRoot?.querySelector<HTMLElement & {updateComplete?: Promise<unknown>}>(
      'pm-summary-rail.status-summary',
    )

    expect(summary).toBeNull()
    expect(element.shadowRoot?.querySelector('.status-right')).toBeNull()
    expect(element.shadowRoot?.querySelector('.status-bar')).toBeNull()
  })

  it('keeps the mobile file status summary local', async () => {
    VirtualFileList.define()
    const element = document.createElement('virtual-file-list') as VirtualFileList
    element.mobile = true
    element.items = []
    element.selectedItems = [1, 2]
    document.body.append(element)
    await settle(element)

    const summary = element.shadowRoot?.querySelector<HTMLElement & {updateComplete?: Promise<unknown>}>(
      'pm-summary-rail.status-summary',
    )

    expect(summary).not.toBeNull()
    expect(element.shadowRoot?.querySelector('.status-bar')).not.toBeNull()
    expect(summary?.shadowRoot?.textContent).toContain('Items')
    expect(summary?.shadowRoot?.textContent).toContain('Selected')
    expect(summary?.shadowRoot?.textContent).toContain('2')
    expect(element.shadowRoot?.querySelector('.status-left')).toBeNull()
  })
})
