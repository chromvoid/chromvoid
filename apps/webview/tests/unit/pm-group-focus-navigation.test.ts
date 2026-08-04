import {
  Entry,
  Group,
  ManagerRoot,
  filterValue,
  quickFilters,
  selectedCredentialTagFilters,
} from '@project/passmanager'
import {html, nothing} from 'lit'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {PMEntryListItem} from '../../src/features/passmanager/components/card/entry-list-item'
import {PMGroupBase} from '../../src/features/passmanager/components/group/group/group-base'
import {PMGroup} from '../../src/features/passmanager/components/group/group/group'
import {PMGroupModel} from '../../src/features/passmanager/components/group/group/group.model'
import {groupBy, sortDirection, sortField} from '../../src/features/passmanager/components/list/sort-controls'
import {pmActiveRowModel} from '../../src/features/passmanager/models/pm-active-row.model'
import {pmEntryMoveModel} from '../../src/features/passmanager/models/pm-entry-move-model'
import {setPassmanagerRoot} from '../../src/features/passmanager/models/pm-root.adapter'
import {pmModel} from '../../src/features/passmanager/password-manager.model'

function createGroup(id: string, name: string) {
  return new Group({
    id,
    name,
    entries: [],
    createdTs: Date.now(),
    updatedTs: Date.now(),
  } as any)
}

function createEntry(parent: Group | ManagerRoot, id: string, title = id) {
  return new Entry(
    parent as Group,
    {
      id,
      title,
      username: `${id}@example.com`,
      urls: [],
      createdTs: Date.now(),
      updatedTs: Date.now(),
      otps: [],
    } as any,
  )
}

function createManagerRoot(currentGroup: Group, allGroups: Group[]) {
  const root = new ManagerRoot({} as any)
  root.entries.set(allGroups)
  root.showElement.set(currentGroup)
  return root
}

class TestPMGroupFocus extends PMGroupBase {
  static styles = []

  protected override render() {
    if (!window.passmanager) return nothing

    const group = this.getCurrentGroup()
    if (!group) return nothing

    const items = this.model.getUniqueRows(this.model.getVisibleRows(group))
    if (!items.length) {
      this.model.resetKeyboardState()
      return this.renderEmptyState()
    }

    const shouldPreserveListFocus = this.getListFocusState()
    const contextKey = this.model.getListContextKey(group, items.length)
    const {restoredIndex, activeIndex, contextChanged} = this.model.syncKeyboardState(
      items,
      contextKey,
      group,
    )
    if (restoredIndex !== null) {
      this.focusIndex(restoredIndex)
    } else if (contextChanged && shouldPreserveListFocus && activeIndex >= 0) {
      this.focusIndex(activeIndex)
    }

    const activeId = this.model.getActiveItemId()
    return html`<div class="test-list">
      ${items.map((item) => this.renderRow(item, item.id === activeId))}
    </div>`
  }

  private focusIndex(index: number) {
    requestAnimationFrame(() => {
      const row = this.getRowElementByIndex(index)
      row?.scrollIntoView?.({block: 'nearest'})
      if (row?.classList.contains('entry-row')) {
        const entryItem = row.querySelector('pm-entry-list-item') as PMEntryListItem | null
        entryItem?.focusRow()
        return
      }

      if (row?.classList.contains('group-row-wrap')) {
        const inner = row.querySelector('.group-row') as HTMLElement | null
        inner?.focus()
      }
    })
  }

  private getRowElementByIndex(index: number) {
    const itemId = this.model.getKeyboardItemIdByIndex(index)
    if (!itemId) return null

    return this.renderRoot.querySelector(
      `.entry-row[data-row-id="${itemId}"], .group-row-wrap[data-row-id="${itemId}"], .group-header-row[data-row-id="${itemId}"]`,
    ) as HTMLElement | null
  }

  private getListFocusState() {
    const active = this.renderRoot instanceof ShadowRoot ? this.renderRoot.activeElement : null
    if (!(active instanceof HTMLElement)) return false

    if (active.matches('.group-row, pm-entry-list-item')) {
      return true
    }

    return active.closest('.entry-row, .group-row-wrap, .group-row') != null
  }
}

class TestPMGroupDesktopEmptyState extends PMGroup {
  static override styles = []
}

async function flush(element: HTMLElement & {updateComplete?: Promise<unknown>}) {
  await Promise.resolve()
  await element.updateComplete
  await new Promise((resolve) => setTimeout(resolve, 0))
  await Promise.resolve()
}

function getEntryHost(element: TestPMGroupFocus, rowId: string) {
  return element.shadowRoot?.querySelector(
    `.entry-row[data-row-id="${rowId}"] pm-entry-list-item`,
  ) as PMEntryListItem | null
}

function getEntryRow(element: TestPMGroupFocus, rowId: string) {
  return getEntryHost(element, rowId)?.shadowRoot?.querySelector('.list-item') as HTMLElement | null
}

function getFolderRow(element: TestPMGroupFocus, rowId: string) {
  return element.shadowRoot?.querySelector(
    `.group-row-wrap[data-row-id="${rowId}"] .group-row`,
  ) as HTMLElement | null
}

function getEntryWrapper(element: TestPMGroupFocus, rowId: string) {
  return element.shadowRoot?.querySelector(`.entry-row[data-row-id="${rowId}"]`) as HTMLElement | null
}

function isEntryFocused(element: TestPMGroupFocus, rowId: string) {
  const host = getEntryHost(element, rowId)
  const active = host?.shadowRoot?.activeElement as HTMLElement | null
  return active?.classList.contains('list-item') ?? false
}

describe('PMGroup focus and selection sync', () => {
  let originalPassmanager: typeof window.passmanager

  beforeEach(() => {
    if (!customElements.get('pm-entry-list-item')) {
      PMEntryListItem.define()
    }
    if (!customElements.get('test-pm-group-focus')) {
      customElements.define('test-pm-group-focus', TestPMGroupFocus)
    }
    PMGroup.define()
    if (!customElements.get('test-pm-group-desktop-empty-state')) {
      customElements.define('test-pm-group-desktop-empty-state', TestPMGroupDesktopEmptyState)
    }

    originalPassmanager = window.passmanager
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: () => {},
    })
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      setTimeout(() => callback(0), 0)
      return 1
    })
  })

  afterEach(() => {
    document.querySelectorAll('test-pm-group-focus').forEach((el) => el.remove())
    document.querySelectorAll('test-pm-group-desktop-empty-state').forEach((el) => el.remove())
    pmActiveRowModel.clearAll()
    filterValue.set('')
    quickFilters.set([])
    selectedCredentialTagFilters.set([])
    sortField.set('name')
    sortDirection.set('asc')
    groupBy.set('none')
    pmEntryMoveModel.setDropTarget(null)
    setPassmanagerRoot(undefined)
    window.passmanager = originalPassmanager
    vi.restoreAllMocks()
  })

  it('marks only the actual empty credential list as a localized accessibility group', async () => {
    const group = createGroup('empty-parent', 'Empty Parent')
    window.passmanager = createManagerRoot(group, [group]) as typeof window.passmanager

    const element = document.createElement('test-pm-group-focus') as TestPMGroupFocus
    document.body.appendChild(element)
    await flush(element)

    const selector = '[id="passwords.empty-state"]'
    const marker = element.shadowRoot?.querySelector(selector)
    expect(marker?.tagName).toBe('DIV')
    expect(marker?.getAttribute('role')).toBe('group')
    expect(marker?.getAttribute('aria-label')).toBe('Empty')

    group.entries.set([createEntry(group, 'empty-parent-entry')])
    await flush(element)

    expect(element.shadowRoot?.querySelector(selector)).toBeNull()
  })

  it('treats only search, quick filters, and selected tags as content filters', () => {
    const model = new PMGroupModel()
    const group = createGroup('content-filter-parent', 'Content Filter Parent')
    group.entries.set([createEntry(group, 'content-filter-entry')])
    const root = createManagerRoot(group, [group])
    window.passmanager = root as typeof window.passmanager
    setPassmanagerRoot(root)

    expect(model.getEmptyStateKind()).toBe('empty')

    sortField.set('website')
    sortDirection.set('desc')
    groupBy.set('website')
    expect(model.getEmptyStateKind()).toBe('empty')

    filterValue.set('missing')
    expect(model.getEmptyStateKind()).toBe('filtered')
    filterValue.set('')

    quickFilters.set(['otp'])
    expect(model.getEmptyStateKind()).toBe('filtered')
    quickFilters.set([])

    selectedCredentialTagFilters.set(['work'])
    expect(model.getEmptyStateKind()).toBe('filtered')
  })

  it('clears content filters while preserving sorting and grouping choices', () => {
    const model = new PMGroupModel()
    filterValue.set('vault')
    quickFilters.set(['recent', 'otp'])
    selectedCredentialTagFilters.set(['work'])
    sortField.set('website')
    sortDirection.set('desc')
    groupBy.set('security')

    model.clearContentFilters()

    expect(filterValue()).toBe('')
    expect(quickFilters()).toEqual([])
    expect(selectedCredentialTagFilters()).toEqual([])
    expect(sortField()).toBe('website')
    expect(sortDirection()).toBe('desc')
    expect(groupBy()).toBe('security')
    expect(model.getEmptyStateKind()).toBe('empty')
  })

  it('renders the desktop filtered-empty state with one clear action that keeps sort and grouping', async () => {
    const group = createGroup('filtered-parent', 'Filtered Parent')
    group.entries.set([createEntry(group, 'filtered-entry')])
    const root = createManagerRoot(group, [group])
    window.passmanager = root as typeof window.passmanager
    setPassmanagerRoot(root)
    filterValue.set('no matches')
    quickFilters.set(['otp'])
    selectedCredentialTagFilters.set(['work'])
    sortField.set('website')
    sortDirection.set('desc')
    groupBy.set('security')

    const element = document.createElement(
      'test-pm-group-desktop-empty-state',
    ) as TestPMGroupDesktopEmptyState
    document.body.appendChild(element)
    await flush(element)

    const marker = element.shadowRoot?.querySelector('[id="passwords.empty-state"]')
    const emptyState = marker?.querySelector('cv-empty-state')
    const clearButton = emptyState?.querySelector('cv-button')

    expect(marker?.getAttribute('data-empty-kind')).toBe('filtered')
    expect(marker?.getAttribute('aria-label')).toBe('No matching credentials')
    expect(emptyState?.getAttribute('data-empty-kind')).toBe('filtered')
    expect(emptyState?.getAttribute('headline')).toBe('No matching credentials')
    expect(emptyState?.getAttribute('description')).toBe('Try another search or clear the active filters.')
    expect(marker?.closest('cv-guidance-anchor')).toBeNull()
    expect(clearButton?.textContent?.trim()).toBe('Clear filters')
    ;(clearButton as HTMLElement | null)?.click()
    await flush(element)

    expect(filterValue()).toBe('')
    expect(quickFilters()).toEqual([])
    expect(selectedCredentialTagFilters()).toEqual([])
    expect(sortField()).toBe('website')
    expect(sortDirection()).toBe('desc')
    expect(groupBy()).toBe('security')
    expect(element.shadowRoot?.querySelector('[id="passwords.empty-state"]')).toBeNull()
  })

  it('keeps a truly empty group in the empty state even when content filters are active', () => {
    const model = new PMGroupModel()
    const group = createGroup('truly-empty-parent', 'Truly Empty Parent')
    const root = createManagerRoot(group, [group])
    window.passmanager = root as typeof window.passmanager
    setPassmanagerRoot(root)
    filterValue.set('missing')
    quickFilters.set(['otp'])
    selectedCredentialTagFilters.set(['work'])

    expect(model.getEmptyStateKind()).toBe('empty')
  })

  it('keeps drag-and-drop handlers on the full cv-empty-state host', async () => {
    const group = createGroup('drop-empty-parent', 'Drop Empty Parent')
    const root = createManagerRoot(group, [group])
    window.passmanager = root as typeof window.passmanager
    setPassmanagerRoot(root)
    const payload = {domain: 'passmanager', kind: 'entry', id: 'dragged-entry'} as const
    vi.spyOn(pmEntryMoveModel, 'readDragPayload').mockReturnValue(payload)
    vi.spyOn(pmEntryMoveModel, 'canDropToTarget').mockReturnValue(true)
    const drop = vi.spyOn(pmEntryMoveModel, 'dropToTarget').mockResolvedValue(true)

    const element = document.createElement(
      'test-pm-group-desktop-empty-state',
    ) as TestPMGroupDesktopEmptyState
    document.body.appendChild(element)
    await flush(element)

    const emptyState = element.shadowRoot?.querySelector('cv-empty-state') as HTMLElement | null
    const dragover = new Event('dragover', {bubbles: true, cancelable: true})
    Object.defineProperty(dragover, 'dataTransfer', {value: null})
    emptyState?.dispatchEvent(dragover)

    expect(dragover.defaultPrevented).toBe(true)
    expect(emptyState?.classList.contains('drop-active')).toBe(true)
    expect(pmEntryMoveModel.dropTargetId()).toBe(group.id)

    const dropEvent = new Event('drop', {bubbles: true, cancelable: true})
    Object.defineProperty(dropEvent, 'dataTransfer', {value: null})
    emptyState?.dispatchEvent(dropEvent)

    expect(dropEvent.defaultPrevented).toBe(true)
    expect(drop).toHaveBeenCalledWith(group.id, payload)
    expect(emptyState?.classList.contains('drop-active')).toBe(false)
  })

  it('keeps only the active row tabbable and syncs focus-driven activation across folders and entries', async () => {
    const parent = createGroup('focus-parent', 'Parent')
    const child = createGroup('focus-child', 'Parent/Child')
    const entry = createEntry(parent, 'focus-entry', 'Focus Entry')
    parent.entries.set([entry])

    window.passmanager = createManagerRoot(parent, [parent, child]) as typeof window.passmanager

    const element = document.createElement('test-pm-group-focus') as TestPMGroupFocus
    document.body.appendChild(element)
    await flush(element)

    const folderRow = getFolderRow(element, child.id)
    const entryRow = getEntryRow(element, entry.id)
    expect(folderRow?.getAttribute('tabindex')).toBe('0')
    expect(entryRow?.getAttribute('tabindex')).toBe('-1')
    expect(getEntryWrapper(element, entry.id)?.classList.contains('active')).toBe(false)

    getEntryHost(element, entry.id)?.focusRow()
    await flush(element)

    expect(folderRow?.getAttribute('tabindex')).toBe('-1')
    expect(getEntryRow(element, entry.id)?.getAttribute('tabindex')).toBe('0')
    expect(isEntryFocused(element, entry.id)).toBe(true)
    expect(getEntryWrapper(element, entry.id)?.classList.contains('active')).toBe(false)
  })

  it('uses and focuses the remembered active row', async () => {
    const group = createGroup('restore-parent', 'Restore Parent')
    const first = createEntry(group, 'restore-first', 'Restore First')
    const second = createEntry(group, 'restore-second', 'Restore Second')
    group.entries.set([first, second])

    window.passmanager = createManagerRoot(group, [group]) as typeof window.passmanager
    pmActiveRowModel.setActive(group.id, second.id)

    const element = document.createElement('test-pm-group-focus') as TestPMGroupFocus
    document.body.appendChild(element)
    await flush(element)

    expect(getEntryRow(element, first.id)?.getAttribute('tabindex')).toBe('-1')
    expect(getEntryRow(element, second.id)?.getAttribute('tabindex')).toBe('0')
    expect(isEntryFocused(element, second.id)).toBe(true)
    expect(getEntryWrapper(element, second.id)?.classList.contains('active')).toBe(false)
  })

  it('falls back to the first row when the remembered active id is missing', async () => {
    const group = createGroup('delayed-focus-parent', 'Delayed Focus Parent')
    const first = createEntry(group, 'delayed-focus-first', 'Delayed Focus First')
    group.entries.set([first])

    window.passmanager = createManagerRoot(group, [group]) as typeof window.passmanager
    pmActiveRowModel.setActive(group.id, 'delayed-focus-target')

    const element = document.createElement('test-pm-group-focus') as TestPMGroupFocus
    document.body.appendChild(element)
    await flush(element)

    expect(getEntryRow(element, first.id)?.getAttribute('tabindex')).toBe('0')
    expect(isEntryFocused(element, first.id)).toBe(true)
    expect(pmActiveRowModel.getActive(group.id)).toBe(first.id)
  })

  it('does not change the active row on pointerenter alone', async () => {
    const group = createGroup('hover-parent', 'Hover Parent')
    const first = createEntry(group, 'hover-first', 'Hover First')
    const second = createEntry(group, 'hover-second', 'Hover Second')
    group.entries.set([first, second])

    window.passmanager = createManagerRoot(group, [group]) as typeof window.passmanager

    const element = document.createElement('test-pm-group-focus') as TestPMGroupFocus
    document.body.appendChild(element)
    await flush(element)

    const secondWrapper = element.shadowRoot?.querySelector(
      `.entry-row[data-row-id="${second.id}"]`,
    ) as HTMLElement | null
    secondWrapper?.dispatchEvent(new Event('pointerenter', {bubbles: true, composed: true}))
    await flush(element)

    expect(getEntryRow(element, first.id)?.getAttribute('tabindex')).toBe('0')
    expect(getEntryRow(element, second.id)?.getAttribute('tabindex')).toBe('-1')
    expect(getEntryWrapper(element, first.id)?.classList.contains('active')).toBe(false)
    expect(getEntryWrapper(element, second.id)?.classList.contains('active')).toBe(false)
  })

  it('focuses the first actionable row when the group context changes while list focus is preserved', async () => {
    const firstGroup = createGroup('context-first', 'Context/First')
    const firstEntry = createEntry(firstGroup, 'context-first-entry', 'First Group Entry')
    firstGroup.entries.set([firstEntry])

    const secondGroup = createGroup('context-second', 'Context/Second')
    const secondEntry = createEntry(secondGroup, 'context-second-entry', 'Second Group Entry')
    secondGroup.entries.set([secondEntry])

    const root = createManagerRoot(firstGroup, [firstGroup, secondGroup])
    window.passmanager = root as typeof window.passmanager

    const element = document.createElement('test-pm-group-focus') as TestPMGroupFocus
    document.body.appendChild(element)
    await flush(element)

    getEntryHost(element, firstEntry.id)?.focusRow()
    await flush(element)

    root.showElement.set(secondGroup)
    await flush(element)

    expect(getEntryRow(element, secondEntry.id)?.getAttribute('tabindex')).toBe('0')
    expect(isEntryFocused(element, secondEntry.id)).toBe(true)
    expect(getEntryWrapper(element, secondEntry.id)?.classList.contains('active')).toBe(false)
  })

  it('keeps openActiveItem and focused Enter target aligned after arrow navigation', async () => {
    const group = createGroup('open-parent', 'Open Parent')
    const first = createEntry(group, 'open-first', 'Open First')
    const second = createEntry(group, 'open-second', 'Open Second')
    group.entries.set([first, second])

    window.passmanager = createManagerRoot(group, [group]) as typeof window.passmanager
    const openSpy = vi.spyOn(pmModel, 'openItem').mockImplementation(() => {})

    const element = document.createElement('test-pm-group-focus') as TestPMGroupFocus
    document.body.appendChild(element)
    await flush(element)

    expect(element.moveKeyboardFocus(1)).toBe(true)
    await flush(element)

    const focusedRow = getEntryRow(element, second.id)
    focusedRow?.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, composed: true}))
    expect(openSpy).toHaveBeenNthCalledWith(1, second)

    expect(element.openActiveItem()).toBe(true)
    expect(openSpy).toHaveBeenNthCalledWith(2, second)
  })
})
