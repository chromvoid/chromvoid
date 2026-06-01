import {html} from 'lit'
import {nothing} from 'lit'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {Entry, Group, ManagerRoot} from '@project/passmanager'
import {PMEntryModel} from '../../src/features/passmanager/components/card/entry/entry.model'
import {PMEntryListItemMobile} from '../../src/features/passmanager/components/card/entry-list-item/entry-list-item-mobile'
import {PMGroupBase} from '../../src/features/passmanager/components/group/group/group-base'
import {PMGroupListItemMobile} from '../../src/features/passmanager/components/group/group'
import type {PMGroupRowPresentation} from '../../src/features/passmanager/components/group/group/group.model'
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
      sshKeys: [],
    } as any,
  )
}

function createGroupPresentation(
  group: Group,
  overrides: Partial<PMGroupRowPresentation> = {},
): PMGroupRowPresentation {
  return {
    displayName: group.name.split('/').pop() || group.name,
    description: group.description ?? '',
    entryCount: group.entries().length,
    riskIndicator: null,
    ...overrides,
  }
}

function createPassmanagerRoot(currentItem: Group | ManagerRoot, items: Array<Entry | Group>) {
  const root = new ManagerRoot({} as any)
  root.entries.set(items)
  root.showElement.set(currentItem)
  ;(root as ManagerRoot & {isReadOnly: () => boolean}).isReadOnly = () => false
  return root as typeof window.passmanager
}

class TestPMGroupMobileRows extends PMGroupBase {
  static styles = []

  protected override renderEntryItem(item: Entry, active: boolean) {
    return html`
      <div class="entry-row" data-row-id=${item.id}>
        <pm-entry-list-item-mobile
          .entry=${item}
          .activeRow=${active}
          .rowTabIndex=${active ? 0 : -1}
          .manageActiveRowState=${true}
          .selectionStateManaged=${true}
          .selectionActive=${false}
          .selectedInSelectionMode=${false}
          @pm-entry-row-focus=${() => this.setActiveItemById(item.id)}
          @entry-delete=${this.handleEntryDelete}
        ></pm-entry-list-item-mobile>
      </div>
    `
  }

  protected override renderFolderItem(item: Group, active: boolean) {
    return html`
      <div class="group-row-wrap" data-row-id=${item.id}>
        <pm-group-list-item-mobile
          .group=${item}
          .presentation=${this.model.getGroupRowPresentation(item)}
          .activeRow=${active}
          .rowTabIndex=${active ? 0 : -1}
          .selectionActive=${false}
          .selectedInSelectionMode=${false}
          @pm-group-row-focus=${() => this.setActiveItemById(item.id)}
        ></pm-group-list-item-mobile>
      </div>
    `
  }

  protected override render() {
    if (!window.passmanager) return nothing

    const group = this.getCurrentGroup()
    if (!group) return nothing

    const items = this.model.getUniqueRows(this.model.getVisibleRows(group))
    if (!items.length) {
      this.model.resetKeyboardState()
      return nothing
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
      const itemId = this.model.getKeyboardItemIdByIndex(index)
      if (!itemId) return

      const entryItem = this.renderRoot.querySelector(
        `.entry-row[data-row-id="${itemId}"] pm-entry-list-item-mobile`,
      ) as PMEntryListItemMobile | null
      if (entryItem?.focusRow) {
        entryItem.focusRow()
        return
      }

      const groupItem = this.renderRoot.querySelector(
        `.group-row-wrap[data-row-id="${itemId}"] pm-group-list-item-mobile`,
      ) as PMGroupListItemMobile | null
      groupItem?.focusRow()
    })
  }

  private getListFocusState() {
    const active = this.renderRoot instanceof ShadowRoot ? this.renderRoot.activeElement : null
    if (!(active instanceof HTMLElement)) return false

    if (active.matches('pm-entry-list-item-mobile, pm-group-list-item-mobile')) {
      return true
    }

    return active.closest('.entry-row, .group-row-wrap') != null
  }
}

async function flush(element: HTMLElement & {updateComplete?: Promise<unknown>}) {
  await Promise.resolve()
  await element.updateComplete
  await new Promise((resolve) => setTimeout(resolve, 0))
  const nestedElements = element.shadowRoot?.querySelectorAll<
    HTMLElement & {updateComplete?: Promise<unknown>}
  >('pm-entry-list-item-mobile, pm-group-list-item-mobile')
  if (nestedElements?.length) {
    await Promise.all([...nestedElements].map((item) => item.updateComplete ?? Promise.resolve()))
  }
  await new Promise((resolve) => setTimeout(resolve, 0))
  await Promise.resolve()
}

function getEntryHost(element: TestPMGroupMobileRows, rowId: string) {
  return element.shadowRoot?.querySelector(
    `.entry-row[data-row-id="${rowId}"] pm-entry-list-item-mobile`,
  ) as PMEntryListItemMobile | null
}

function getGroupHost(element: TestPMGroupMobileRows, rowId: string) {
  return element.shadowRoot?.querySelector(
    `.group-row-wrap[data-row-id="${rowId}"] pm-group-list-item-mobile`,
  ) as PMGroupListItemMobile | null
}

describe('PMGroup mobile row state', () => {
  let originalPassmanager: typeof window.passmanager

  beforeEach(() => {
    if (!customElements.get('pm-entry-list-item-mobile')) {
      PMEntryListItemMobile.define()
    }
    if (!customElements.get('pm-group-list-item-mobile')) {
      PMGroupListItemMobile.define()
    }
    if (!customElements.get('test-pm-group-mobile-rows')) {
      customElements.define('test-pm-group-mobile-rows', TestPMGroupMobileRows)
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
    document.body.innerHTML = ''
    pmActiveRowModel.clearAll()
    window.passmanager = originalPassmanager
    vi.restoreAllMocks()
  })

  it('keeps mobile entry active styling on the inner row instead of the wrapper', async () => {
    const parent = createGroup('entry-restore-parent', 'Entry Restore Parent')
    const second = createEntry(parent, 'entry-restore-second', 'Restore Second')
    parent.entries.set([second])

    window.passmanager = createPassmanagerRoot(parent, [parent])

    const wrapper = document.createElement('div')
    wrapper.className = 'entry-row'
    wrapper.dataset['rowId'] = second.id
    const secondHost = document.createElement('pm-entry-list-item-mobile') as PMEntryListItemMobile
    secondHost.entry = second
    secondHost.activeRow = true
    secondHost.rowTabIndex = 0
    secondHost.manageActiveRowState = true
    wrapper.appendChild(secondHost)
    document.body.appendChild(wrapper)
    await flush(secondHost)
    secondHost.focusRow()
    await flush(secondHost)

    const secondRow = secondHost?.shadowRoot?.querySelector('.list-item') as HTMLElement | null

    expect(secondRow?.getAttribute('tabindex')).toBe('0')
    expect(wrapper.classList.contains('active')).toBe(false)
    expect(secondRow?.classList.contains('active-row')).toBe(true)
    expect((secondHost?.shadowRoot?.activeElement as HTMLElement | null)?.classList.contains('list-item')).toBe(true)
  })

  it('uses the remembered active subgroup on the mobile group row component', async () => {
    const parent = createGroup('group-restore-parent', 'Group Restore Parent')
    const first = createGroup('group-restore-first', 'Group Restore Parent/First')
    const second = createGroup('group-restore-second', 'Group Restore Parent/Second')

    window.passmanager = createPassmanagerRoot(parent, [parent, first, second])
    pmActiveRowModel.setActive(parent.id, second.id)

    const element = document.createElement('test-pm-group-mobile-rows') as TestPMGroupMobileRows
    document.body.appendChild(element)
    await flush(element)

    const firstRow = getGroupHost(element, first.id)?.shadowRoot?.querySelector('.group-row') as HTMLElement | null
    const secondHost = getGroupHost(element, second.id)
    const secondRow = secondHost?.shadowRoot?.querySelector('.group-row') as HTMLElement | null

    expect(firstRow?.getAttribute('tabindex')).toBe('-1')
    expect(secondRow?.getAttribute('tabindex')).toBe('0')
    expect(secondRow?.classList.contains('active-row')).toBe(true)
    expect((secondHost?.shadowRoot?.activeElement as HTMLElement | null)?.classList.contains('group-row')).toBe(true)
  })

  it('uses the remembered active subgroup after returning to the root mobile list', async () => {
    const root = new ManagerRoot({} as any)
    const first = createGroup('root-restore-first', 'Root Restore First')
    const second = createGroup('root-restore-second', 'Root Restore Second')
    root.entries.set([first, second])
    root.showElement.set(root)
    ;(root as ManagerRoot & {isReadOnly: () => boolean}).isReadOnly = () => false
    window.passmanager = root as typeof window.passmanager
    pmActiveRowModel.setActive(root.id, second.id)

    const element = document.createElement('test-pm-group-mobile-rows') as TestPMGroupMobileRows
    document.body.appendChild(element)
    await flush(element)

    const firstRow = getGroupHost(element, first.id)?.shadowRoot?.querySelector('.group-row') as HTMLElement | null
    const secondHost = getGroupHost(element, second.id)
    const secondRow = secondHost?.shadowRoot?.querySelector('.group-row') as HTMLElement | null

    expect(firstRow?.getAttribute('tabindex')).toBe('-1')
    expect(secondRow?.getAttribute('tabindex')).toBe('0')
    expect(secondRow?.classList.contains('active-row')).toBe(true)
  })

  it('uses the remembered active entry row after returning from the mobile entry view', async () => {
    const parent = createGroup('entry-restore-list-parent', 'Entry Restore List Parent')
    const first = createEntry(parent, 'entry-restore-list-first', 'Alpha Entry')
    const second = createEntry(parent, 'entry-restore-list-second', 'Zulu Entry')
    parent.entries.set([first, second])
    window.passmanager = createPassmanagerRoot(parent, [parent])
    pmActiveRowModel.setActive(parent.id, second.id)

    const element = document.createElement('test-pm-group-mobile-rows') as TestPMGroupMobileRows
    document.body.appendChild(element)
    await flush(element)

    const wrappers = element.shadowRoot?.querySelectorAll('.entry-row') ?? []
    const secondHost = getEntryHost(element, second.id)
    const secondRow = secondHost?.shadowRoot?.querySelector('.list-item') as HTMLElement | null

    expect(wrappers).toHaveLength(2)
    expect(secondRow?.getAttribute('tabindex')).toBe('0')
    expect(secondRow?.classList.contains('active-row')).toBe(true)
  })

  it('falls back to the first actionable mobile row when the remembered item is missing', async () => {
    const parent = createGroup('delayed-restore-parent', 'Delayed Restore Parent')
    const first = createEntry(parent, 'delayed-restore-first', 'Delayed Restore First')
    const delayed = createEntry(parent, 'delayed-restore-target', 'Delayed Restore Target')
    parent.entries.set([first])
    window.passmanager = createPassmanagerRoot(parent, [parent])
    pmActiveRowModel.setActive(parent.id, delayed.id)

    const element = document.createElement('test-pm-group-mobile-rows') as TestPMGroupMobileRows
    document.body.appendChild(element)
    await flush(element)

    const firstRow = getEntryHost(element, first.id)?.shadowRoot?.querySelector('.list-item') as HTMLElement | null
    expect(firstRow?.getAttribute('tabindex')).toBe('0')
    expect(firstRow?.classList.contains('active-row')).toBe(true)
    expect(pmActiveRowModel.getActive(parent.id)).toBe(first.id)
  })

  it('syncs active group row state from pm-group-row-focus', async () => {
    const parent = createGroup('group-focus-parent', 'Group Focus Parent')
    const first = createGroup('group-focus-first', 'Group Focus Parent/First')
    const second = createGroup('group-focus-second', 'Group Focus Parent/Second')

    window.passmanager = createPassmanagerRoot(parent, [parent, first, second])

    const element = document.createElement('test-pm-group-mobile-rows') as TestPMGroupMobileRows
    document.body.appendChild(element)
    await flush(element)

    const firstRowBefore = getGroupHost(element, first.id)?.shadowRoot?.querySelector('.group-row') as HTMLElement | null
    const secondHost = getGroupHost(element, second.id)

    expect(firstRowBefore?.getAttribute('tabindex')).toBe('0')

    secondHost?.focusRow()
    await flush(element)

    const firstRowAfter = getGroupHost(element, first.id)?.shadowRoot?.querySelector('.group-row') as HTMLElement | null
    const secondRowAfter = secondHost?.shadowRoot?.querySelector('.group-row') as HTMLElement | null

    expect(firstRowAfter?.getAttribute('tabindex')).toBe('-1')
    expect(secondRowAfter?.getAttribute('tabindex')).toBe('0')
    expect(secondRowAfter?.classList.contains('active-row')).toBe(true)
  })

  it('routes mobile entry-delete events to the existing entry delete model without opening the row', async () => {
    const parent = createGroup('entry-swipe-delete-parent', 'Entry Swipe Delete Parent')
    const entry = createEntry(parent, 'entry-swipe-delete-target', 'Entry Swipe Delete Target')
    parent.entries.set([entry])
    window.passmanager = createPassmanagerRoot(parent, [parent])

    const deleteSpy = vi.spyOn(PMEntryModel.prototype, 'deleteEntryCard').mockImplementation(() => {})
    const openItemSpy = vi.spyOn(pmModel, 'openItem').mockImplementation(() => {})
    const element = document.createElement('test-pm-group-mobile-rows') as TestPMGroupMobileRows
    document.body.appendChild(element)
    await flush(element)

    getEntryHost(element, entry.id)?.dispatchEvent(
      new CustomEvent('entry-delete', {detail: entry, bubbles: true, composed: true}),
    )

    expect(deleteSpy).toHaveBeenCalledTimes(1)
    expect(deleteSpy).toHaveBeenCalledWith(entry)
    expect(openItemSpy).not.toHaveBeenCalled()
  })
})

describe('PMGroupListItemMobile visual state', () => {
  let originalPassmanager: typeof window.passmanager

  beforeEach(() => {
    if (!customElements.get('pm-group-list-item-mobile')) {
      PMGroupListItemMobile.define()
    }
    originalPassmanager = window.passmanager
  })

  afterEach(() => {
    document.body.innerHTML = ''
    window.passmanager = originalPassmanager
  })

  it('prefers selected state over active state while selection mode is active', async () => {
    const parent = createGroup('group-item-parent', 'Group Item Parent')
    const item = createGroup('group-item-child', 'Group Item Parent/Child')
    window.passmanager = createPassmanagerRoot(parent, [parent, item])

    const element = document.createElement('pm-group-list-item-mobile') as PMGroupListItemMobile
    element.group = item
    element.presentation = createGroupPresentation(item)
    element.activeRow = true
    element.rowTabIndex = 0
    document.body.appendChild(element)
    await flush(element)

    const activeRow = element.shadowRoot?.querySelector('.group-row') as HTMLElement | null
    expect(activeRow?.classList.contains('active-row')).toBe(true)
    expect(activeRow?.classList.contains('selected')).toBe(false)

    element.selectionActive = true
    element.selectedInSelectionMode = true
    await flush(element)

    const selectedRow = element.shadowRoot?.querySelector('.group-row') as HTMLElement | null
    expect(selectedRow?.classList.contains('active-row')).toBe(false)
    expect(selectedRow?.classList.contains('selected')).toBe(true)
  })

  it('renders the group description when it exists', async () => {
    const parent = createGroup('group-item-parent', 'Group Item Parent')
    const item = new Group({
      id: 'group-item-child',
      name: 'Group Item Parent/Child',
      description: 'Shared links and runbooks',
      entries: [],
      createdTs: Date.now(),
      updatedTs: Date.now(),
    })
    window.passmanager = createPassmanagerRoot(parent, [parent, item])

    const element = document.createElement('pm-group-list-item-mobile') as PMGroupListItemMobile
    element.group = item
    element.presentation = createGroupPresentation(item)
    element.rowTabIndex = 0
    document.body.appendChild(element)
    await flush(element)

    expect(element.shadowRoot?.querySelector('.group-description')?.textContent).toContain(
      'Shared links and runbooks',
    )
  })

  it('does not render a mobile drag handle slot', async () => {
    const parent = createGroup('group-item-parent-no-dnd', 'Group Item Parent No Dnd')
    const item = createGroup('group-item-child-no-dnd', 'Group Item Parent No Dnd/Child')
    window.passmanager = createPassmanagerRoot(parent, [parent, item])

    const element = document.createElement('pm-group-list-item-mobile') as PMGroupListItemMobile
    element.group = item
    element.presentation = createGroupPresentation(item)
    element.rowTabIndex = 0
    document.body.appendChild(element)
    await flush(element)

    expect(element.shadowRoot?.querySelector('.mobile-dnd-handle')).toBeNull()
  })

  it('renders a risk dot from row presentation without replacing the description', async () => {
    const parent = createGroup('group-item-parent-risk', 'Group Item Parent Risk')
    const item = new Group({
      id: 'group-item-child-risk',
      name: 'Group Item Parent Risk/Child',
      description: 'Shared links and runbooks',
      entries: [],
      createdTs: Date.now(),
      updatedTs: Date.now(),
    })
    window.passmanager = createPassmanagerRoot(parent, [parent, item])

    const element = document.createElement('pm-group-list-item-mobile') as PMGroupListItemMobile
    element.group = item
    element.presentation = createGroupPresentation(item, {
      riskIndicator: {
        severity: 'warning',
        count: 2,
        label: '2 reused passwords',
      },
    })
    element.rowTabIndex = 0
    document.body.appendChild(element)
    await flush(element)

    expect(element.shadowRoot?.querySelector('.group-description')?.textContent).toContain(
      'Shared links and runbooks',
    )
    const dot = element.shadowRoot?.querySelector('.group-risk-dot[data-severity="warning"]')
    expect(dot?.getAttribute('aria-label')).toBe('2 reused passwords')
    expect(element.shadowRoot?.querySelector('.group-chevron')).not.toBeNull()
  })
})
