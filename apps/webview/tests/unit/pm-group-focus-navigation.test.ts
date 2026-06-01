import {Entry, Group, ManagerRoot} from '@project/passmanager'
import {html, nothing} from 'lit'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {PMEntryListItem} from '../../src/features/passmanager/components/card/entry-list-item'
import {PMGroupBase} from '../../src/features/passmanager/components/group/group/group-base'
import {pmActiveRowModel} from '../../src/features/passmanager/models/pm-active-row.model'
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
    const {restoredIndex, activeIndex, contextChanged} = this.model.syncKeyboardState(items, contextKey, group)
    if (restoredIndex !== null) {
      this.focusIndex(restoredIndex)
    } else if (contextChanged && shouldPreserveListFocus && activeIndex >= 0) {
      this.focusIndex(activeIndex)
    }

    const activeId = this.model.getActiveItemId()
    return html`<div class="test-list">${items.map((item) => this.renderRow(item, item.id === activeId))}</div>`
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

async function flush(element: TestPMGroupFocus) {
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
  return element.shadowRoot?.querySelector(`.group-row-wrap[data-row-id="${rowId}"] .group-row`) as HTMLElement | null
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
    pmActiveRowModel.clearAll()
    window.passmanager = originalPassmanager
    vi.restoreAllMocks()
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
