import {afterEach, describe, expect, it, vi} from 'vitest'

import {VirtualFileList} from '../../src/features/file-manager/components/virtual-file-list'
import {createDefaultFileSearchFilters} from '../../src/features/file-manager/models/file-search-filters.model'
import type {FileSearchFilterActions} from '../../src/features/file-manager/models/file-search-filters.model'
import type {FileListItem} from '../../src/shared/contracts/file-manager'

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

  it('dispatches one composed empty-action contract for each desktop empty-state action', async () => {
    VirtualFileList.define()
    const element = document.createElement('virtual-file-list') as VirtualFileList
    element.items = []
    element.itemsPreFiltered = true
    const events: CustomEvent<{action: string}>[] = []
    const onEmptyAction = (event: Event) => events.push(event as CustomEvent<{action: string}>)
    document.body.addEventListener('empty-action', onEmptyAction)
    document.body.append(element)
    await settle(element)

    const actions = element.shadowRoot?.querySelectorAll<HTMLElement>('[data-empty-action]') ?? []
    for (const action of actions) {
      action.click()
    }

    expect(events.map((event) => event.detail)).toEqual([
      {action: 'upload'},
      {action: 'create-dir'},
      {action: 'create-note'},
    ])
    expect(events.every((event) => event.bubbles && event.composed)).toBe(true)

    document.body.removeEventListener('empty-action', onEmptyAction)
  })

  it('keeps desktop empty actions out of the mobile empty state', async () => {
    VirtualFileList.define()
    const element = document.createElement('virtual-file-list') as VirtualFileList
    element.mobile = true
    element.items = []
    element.itemsPreFiltered = true
    document.body.append(element)
    await settle(element)

    expect(element.shadowRoot?.querySelector('[data-empty-action]')).toBeNull()
  })

  it('selects and clears all currently filtered table items from the header checkbox', async () => {
    VirtualFileList.define()
    const matching: FileListItem = {
      id: 1,
      path: '/report.pdf',
      name: 'report.pdf',
      isDir: false,
    }
    const other: FileListItem = {
      id: 2,
      path: '/notes.txt',
      name: 'notes.txt',
      isDir: false,
    }
    const element = document.createElement('virtual-file-list') as VirtualFileList
    element.items = [matching, other]
    element.filters = {
      ...createDefaultFileSearchFilters(),
      query: 'report',
      viewMode: 'table',
    }
    const selectionChanges: number[][] = []
    const selectionModeRequests: boolean[] = []
    element.addEventListener('selection-change', (event) => {
      selectionChanges.push((event as CustomEvent<{selectedItems: number[]}>).detail.selectedItems)
    })
    element.addEventListener('selection-mode-requested', (event) => {
      selectionModeRequests.push((event as CustomEvent<{enabled: boolean}>).detail.enabled)
    })
    document.body.append(element)
    await settle(element)

    const selectAll = element.shadowRoot?.querySelector<HTMLElement>('.table-select-all')
    const selectionChangeCount = selectionChanges.length
    const selectionModeRequestCount = selectionModeRequests.length
    const spaceEvent = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      composed: true,
      cancelable: true,
    })
    selectAll?.dispatchEvent(spaceEvent)

    expect(spaceEvent.defaultPrevented).toBe(false)
    expect(selectionModeRequests).toHaveLength(selectionModeRequestCount)
    expect(selectionChanges).toHaveLength(selectionChangeCount)

    selectAll?.click()

    expect(selectionModeRequests).toEqual([true])
    expect(selectionChanges.at(-1)).toEqual([matching.id])

    element.selectionMode = true
    element.selectedItems = [matching.id]
    await settle(element)
    element.shadowRoot?.querySelector<HTMLElement>('.table-select-all')?.click()

    expect(selectionChanges.at(-1)).toEqual([])
  })

  it('routes the table Type header through the shared table-sort action', async () => {
    VirtualFileList.define()
    const applyTableSort = vi.fn()
    const element = document.createElement('virtual-file-list') as VirtualFileList
    element.items = [
      {
        id: 1,
        path: '/report.pdf',
        name: 'report.pdf',
        isDir: false,
      },
    ]
    element.itemsPreFiltered = true
    element.filters = {
      ...createDefaultFileSearchFilters(),
      viewMode: 'table',
    }
    element.filterActions = createFilterActions({applyTableSort})
    document.body.append(element)
    await settle(element)

    const typeSortButton = [
      ...(element.shadowRoot?.querySelectorAll<HTMLElement>('.table-sort-button') ?? []),
    ].find((button) => button.textContent?.includes('Type'))
    const itemAction = vi.fn()
    element.addEventListener('item-action', itemAction)
    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      composed: true,
      cancelable: true,
    })
    typeSortButton?.dispatchEvent(enterEvent)

    expect(enterEvent.defaultPrevented).toBe(false)
    expect(itemAction).not.toHaveBeenCalled()
    expect(applyTableSort).not.toHaveBeenCalled()

    typeSortButton?.click()

    expect(applyTableSort).toHaveBeenCalledWith('type')
  })

  it('routes the compact table Info action through the shared item-action contract', async () => {
    VirtualFileList.define()
    const item: FileListItem = {
      id: 1,
      path: '/report.pdf',
      name: 'report.pdf',
      isDir: false,
    }
    const element = document.createElement('virtual-file-list') as VirtualFileList
    element.items = [item]
    element.itemsPreFiltered = true
    element.filters = {
      ...createDefaultFileSearchFilters(),
      viewMode: 'table',
    }
    const itemAction = vi.fn()
    element.addEventListener('item-action', itemAction)
    document.body.append(element)
    await settle(element)

    element.shadowRoot?.querySelector<HTMLElement>('.table-info-button')?.click()

    expect(itemAction).toHaveBeenCalledTimes(1)
    expect(itemAction).toHaveBeenCalledWith(
      expect.objectContaining({detail: expect.objectContaining({action: 'info', item})}),
    )
  })

  it('provides a grid focus entry and keeps Arrow and Enter on the table row path', async () => {
    VirtualFileList.define()
    const first: FileListItem = {
      id: 1,
      path: '/first.txt',
      name: 'first.txt',
      isDir: false,
    }
    const second: FileListItem = {
      id: 2,
      path: '/second.txt',
      name: 'second.txt',
      isDir: false,
    }
    const element = document.createElement('virtual-file-list') as VirtualFileList
    element.items = [first, second]
    element.itemsPreFiltered = true
    element.filters = {
      ...createDefaultFileSearchFilters(),
      viewMode: 'table',
    }
    const itemAction = vi.fn()
    element.addEventListener('item-action', itemAction)
    document.body.append(element)
    await settle(element)

    const container = element.shadowRoot?.querySelector<HTMLElement>('.list-container')
    expect(container?.tabIndex).toBe(0)
    expect(container?.getAttribute('aria-activedescendant')).toBe('file-option-1')

    container?.focus()
    expect(element.shadowRoot?.activeElement).toBe(container)

    const arrowEvent = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      composed: true,
      cancelable: true,
    })
    container?.dispatchEvent(arrowEvent)
    await settle(element)
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    await settle(element)

    const secondRow = element.shadowRoot?.querySelector<HTMLElement>('#file-option-2')
    expect(arrowEvent.defaultPrevented).toBe(true)
    expect(container?.getAttribute('aria-activedescendant')).toBe('file-option-2')
    expect(secondRow?.classList.contains('active')).toBe(true)
    expect(element.shadowRoot?.activeElement).toBe(secondRow)

    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      composed: true,
      cancelable: true,
    })
    secondRow?.dispatchEvent(enterEvent)

    expect(enterEvent.defaultPrevented).toBe(true)
    expect(itemAction).toHaveBeenCalledWith(
      expect.objectContaining({detail: expect.objectContaining({action: 'open', item: second})}),
    )
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

  it('does not render the file status summary locally', async () => {
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
    expect(element.shadowRoot?.querySelector('.status-bar')).toBeNull()
  })

  it('does not render the mobile file status summary locally', async () => {
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

    expect(summary).toBeNull()
    expect(element.shadowRoot?.querySelector('.status-bar')).toBeNull()
  })
})
