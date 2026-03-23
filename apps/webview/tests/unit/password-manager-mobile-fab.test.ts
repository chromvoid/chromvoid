import {state} from '@statx/core'
import {XLitElement} from '@statx/lit'
import {Entry, Group, ManagerRoot, filterValue, quickFilters} from '@project/passmanager'
import {html, nothing} from 'lit'

import {afterEach, describe, expect, it, vi} from 'vitest'

import {PMGroupModel} from '../../src/features/passmanager/components/group/group'
import {groupBy, sortDirection, sortField} from '../../src/features/passmanager/components/list/sort-controls'
import {PasswordManagerMobileLayout} from '../../src/features/passmanager/components/password-manager-mobile-layout'
import {pmModel} from '../../src/features/passmanager/password-manager.model'

type FakePassmanager = {
  id: string
  showElement: ReturnType<typeof state<any>>
  isEditMode: ReturnType<typeof state<boolean>>
  isLoading: ReturnType<typeof state<boolean>>
  isReadOnly: ReturnType<typeof state<boolean>>
  setShowElement: (...args: unknown[]) => void
  entriesList: () => Array<Entry | Group>
  getCardByID: (id: string) => Entry | Group | undefined
  export: () => void
  fullClean: () => void
  clean: () => void
  load: () => void
}

type PMEntryActionsElement = HTMLElement & {
  triggerEditAction?: () => void
  triggerMoveAction?: () => void
  triggerDeleteAction?: () => void
}

let mobileLayoutDefined = false
let originalPassmanager: unknown

class FakeEntryListItemMobile extends HTMLElement {
  set entry(entry: Entry) {
    this.dataset['entryId'] = entry.id
    this.textContent = entry.title || '(empty)'
  }

  focusRow() {}
}

class TestPMGroupMobile extends XLitElement {
  protected readonly model = new PMGroupModel()

  protected render() {
    const current = window.passmanager?.showElement?.()
    const isGroupLike =
      current instanceof Group ||
      (typeof current === 'object' && current !== null && 'isRoot' in current && (current as {isRoot: boolean}).isRoot)

    if (!isGroupLike) {
      return nothing
    }

    let rows
    try {
      rows = this.model.getUniqueRows(this.model.getVisibleRows(current as Group | ManagerRoot))
    } catch {
      return nothing
    }

    return html`
      <div class="test-rows">
        ${rows.map((row) => {
          switch (row.kind) {
            case 'group':
              return html`<div class="group-row-wrap"><span class="group-name">${row.item.name}</span></div>`
            case 'header':
              return html`<div class="group-header-row">
                <div class="group-header">${row.label} <span class="group-count">${row.count}</span></div>
              </div>`
            case 'entry':
              return html`<div class="entry-row">
                <pm-entry-list-item-mobile .entry=${row.item}></pm-entry-list-item-mobile>
              </div>`
          }
        })}
      </div>
    `
  }
}

class TestPasswordManagerMobileLayout extends PasswordManagerMobileLayout {
  static override styles = []
}

function defineStub(name: string, ctor: CustomElementConstructor) {
  if (!customElements.get(name)) {
    customElements.define(name, ctor)
  }
}

function ensureMobileLayoutDefined() {
  if (mobileLayoutDefined) return
  defineStub('pm-entry-list-item-mobile', FakeEntryListItemMobile)
  defineStub('pm-avatar-icon', class extends HTMLElement {})
  if (!customElements.get('pm-group-mobile')) {
    customElements.define('pm-group-mobile', TestPMGroupMobile)
  }
  if (!customElements.get('password-manager-mobile-layout')) {
    customElements.define('password-manager-mobile-layout', TestPasswordManagerMobileLayout)
  }
  mobileLayoutDefined = true
}

function createPassmanager(initialShowElement: unknown, items: Array<Entry | Group> = []): FakePassmanager {
  return {
    id: 'pm-mobile-layout-test',
    showElement: state<any>(initialShowElement),
    isEditMode: state(false),
    isLoading: state(false),
    isReadOnly: state(false),
    setShowElement: () => {},
    entriesList: () => items,
    getCardByID: (id: string) => items.find((item) => item.id === id),
    export: () => {},
    fullClean: () => {},
    clean: () => {},
    load: () => {},
  }
}

function createEntryForStateCheck() {
  return new Entry(
    createRootLike() as any,
    {
      id: 'entry-for-fab-state',
      title: 'Entry for FAB state',
      urls: [],
      username: '',
      createdTs: Date.now(),
      updatedTs: Date.now(),
      otps: [],
    } as any,
  )
}

function createRootLike() {
  const root = Object.create(ManagerRoot.prototype) as ManagerRoot & {
    entriesList: () => Array<Entry | Group>
    searched: () => Array<Entry | Group>
  }
  root.isRoot = true
  root.entries = state<Array<Entry | Group>>([])
  root.isLoading = state(false)
  root.isReadOnly = state(false)
  root.isEditMode = state(false)
  root.showElement = state<any>(root)
  root.updatedTs = state(Date.now())
  root.createdTs = state(Date.now())
  root.entriesList = () => root.entries()
  root.searched = () => root.entries()
  return root
}

function createEntryWithParent(parent: unknown, title = 'Entry for back chain') {
  return new Entry(
    parent as any,
    {
      id: `entry-${Math.random().toString(36).slice(2, 8)}`,
      title,
      urls: [],
      username: '',
      createdTs: Date.now(),
      updatedTs: Date.now(),
      otps: [],
    } as any,
  )
}

function createGroupWithEntries(name: string, entries: Entry[] = []) {
  return new Group({
    id: `group-${name}`,
    name,
    entries,
    createdTs: Date.now(),
    updatedTs: Date.now(),
  } as any)
}

async function flushLayout(layout: PasswordManagerMobileLayout) {
  await Promise.resolve()
  await layout.updateComplete
  await Promise.resolve()
}

function getRenderedMobileRows(layout: PasswordManagerMobileLayout): string[] {
  const group = layout.shadowRoot?.querySelector('pm-group-mobile') as HTMLElement | null
  const root = group?.shadowRoot
  if (!root) return []

  return Array.from(root.querySelectorAll('.group-header-row, .entry-row, .group-row-wrap')).map((row) => {
    const host = row as HTMLElement
    if (host.classList.contains('group-header-row')) {
      return `header:${host.querySelector('.group-header')?.textContent?.replace(/\s+/g, ' ').trim()}`
    }

    if (host.classList.contains('group-row-wrap')) {
      return `group:${host.querySelector('.group-name')?.textContent?.trim()}`
    }

    return `entry:${host.querySelector('pm-entry-list-item-mobile')?.textContent?.trim()}`
  })
}

function getAction(layout: PasswordManagerMobileLayout, action: string): HTMLElement | null {
  return layout.shadowRoot?.querySelector(`[data-action="${action}"]`) as HTMLElement | null
}

function isActionDisabled(el: HTMLElement | null): boolean {
  if (!el) return false
  const host = el as HTMLElement & {disabled?: boolean}
  return Boolean(host.disabled) || el.hasAttribute('disabled')
}

function getFabOrder(layout: PasswordManagerMobileLayout): string[] {
  const actions = layout.shadowRoot?.querySelector('mobile-action-bar')
  if (!actions) return []
  const order: string[] = []

  for (const child of Array.from(actions.children)) {
    const action = child.getAttribute('data-action')
    if (action) {
      order.push(action)
    }
  }

  return order
}

describe('PasswordManagerMobileLayout FAB actions', () => {
  afterEach(() => {
    document.querySelectorAll('password-manager-mobile-layout').forEach((el) => el.remove())
    ;(window as any).passmanager = originalPassmanager
    filterValue.set('')
    quickFilters.set([])
    sortField.set('name')
    sortDirection.set('asc')
    groupBy.set('none')
    vi.restoreAllMocks()
  })

  it('renders list/group FAB stack and disables only create actions in readonly', async () => {
    ensureMobileLayoutDefined()
    originalPassmanager = (window as any).passmanager
    const pm = createPassmanager(createRootLike())
    pm.isReadOnly.set(true)
    ;(window as any).passmanager = pm

    const layout = document.createElement('password-manager-mobile-layout') as PasswordManagerMobileLayout
    document.body.appendChild(layout)
    await layout.updateComplete

    expect(getFabOrder(layout)).toEqual(['pm-more', 'pm-filters', 'pm-create-group', 'pm-create-entry'])
    expect(layout.shadowRoot?.querySelector('mobile-action-bar')?.hasAttribute('hidden')).toBe(false)

    const createGroup = getAction(layout, 'pm-create-group') as any
    const createEntry = getAction(layout, 'pm-create-entry') as any
    const filters = getAction(layout, 'pm-filters') as any
    const more = getAction(layout, 'pm-more') as any
    expect(isActionDisabled(createGroup)).toBe(true)
    expect(isActionDisabled(createEntry)).toBe(true)
    expect(isActionDisabled(filters)).toBe(false)
    expect(isActionDisabled(more)).toBe(false)
  })

  it('renders entry FAB stack and disables entry actions in readonly', async () => {
    ensureMobileLayoutDefined()
    originalPassmanager = (window as any).passmanager
    const pm = createPassmanager(createEntryForStateCheck())
    pm.isReadOnly.set(true)
    ;(window as any).passmanager = pm

    const layout = document.createElement('password-manager-mobile-layout') as PasswordManagerMobileLayout
    document.body.appendChild(layout)
    await layout.updateComplete

    expect(getFabOrder(layout)).toEqual(['pm-more', 'pm-entry-edit', 'pm-entry-move', 'pm-entry-delete'])

    const edit = getAction(layout, 'pm-entry-edit') as any
    const move = getAction(layout, 'pm-entry-move') as any
    const remove = getAction(layout, 'pm-entry-delete') as any
    const more = getAction(layout, 'pm-more') as any
    expect(isActionDisabled(edit)).toBe(true)
    expect(isActionDisabled(move)).toBe(true)
    expect(isActionDisabled(remove)).toBe(true)
    expect(isActionDisabled(more)).toBe(false)
  })

  it('shows FAB lane only in list/group and entry contexts', async () => {
    ensureMobileLayoutDefined()
    originalPassmanager = (window as any).passmanager
    const pm = createPassmanager(createRootLike())
    ;(window as any).passmanager = pm

    const layout = document.createElement('password-manager-mobile-layout') as PasswordManagerMobileLayout
    document.body.appendChild(layout)
    await layout.updateComplete

    const isHidden = () => layout.shadowRoot?.querySelector('mobile-action-bar')?.hasAttribute('hidden') ?? false

    expect(isHidden()).toBe(false)

    pm.showElement.set(createEntryForStateCheck())
    await Promise.resolve()
    await layout.updateComplete
    expect(isHidden()).toBe(false)

    pm.showElement.set('createEntry')
    await Promise.resolve()
    await layout.updateComplete
    expect(isHidden()).toBe(true)

    pm.showElement.set('createGroup')
    await Promise.resolve()
    await layout.updateComplete
    expect(isHidden()).toBe(true)

    pm.showElement.set('importDialog')
    await Promise.resolve()
    await layout.updateComplete
    expect(isHidden()).toBe(true)

    pm.showElement.set(Object.create(Group.prototype))
    pm.isEditMode.set(true)
    await Promise.resolve()
    await layout.updateComplete
    expect(isHidden()).toBe(true)

    pm.isEditMode.set(false)
    await Promise.resolve()
    await layout.updateComplete
    expect(isHidden()).toBe(false)
  })

  it('wires list FAB actions and opens command palette in filters mode', async () => {
    ensureMobileLayoutDefined()
    originalPassmanager = (window as any).passmanager
    ;(window as any).passmanager = createPassmanager(createRootLike())

    const onCreateEntrySpy = vi.spyOn(pmModel, 'onCreateEntry').mockImplementation(() => {})
    const onCreateGroupSpy = vi.spyOn(pmModel, 'onCreateGroup').mockImplementation(() => {})
    const commandOpenSpy = vi.fn()
    window.addEventListener('command-bar:open', commandOpenSpy as EventListener)

    try {
      const layout = document.createElement('password-manager-mobile-layout') as PasswordManagerMobileLayout
      document.body.appendChild(layout)
      await layout.updateComplete

      const createGroup = getAction(layout, 'pm-create-group')
      const createEntry = getAction(layout, 'pm-create-entry')
      const filters = getAction(layout, 'pm-filters')
      createGroup?.click()
      createEntry?.click()
      filters?.click()

      expect(onCreateGroupSpy).toHaveBeenCalledTimes(1)
      expect(onCreateEntrySpy).toHaveBeenCalledTimes(1)
      expect(commandOpenSpy).toHaveBeenCalledTimes(1)
      expect((commandOpenSpy.mock.calls[0]?.[0] as CustomEvent | undefined)?.detail).toMatchObject({
        mode: 'filters',
        source: 'fab',
      })
    } finally {
      window.removeEventListener('command-bar:open', commandOpenSpy as EventListener)
    }
  })

  it('wires entry FAB actions to pm-entry-mobile methods', async () => {
    ensureMobileLayoutDefined()
    originalPassmanager = (window as any).passmanager
    ;(window as any).passmanager = createPassmanager(createEntryForStateCheck())

    const layout = document.createElement('password-manager-mobile-layout') as PasswordManagerMobileLayout
    document.body.appendChild(layout)
    await layout.updateComplete

    const entryEl = layout.shadowRoot?.querySelector('pm-entry-mobile') as PMEntryActionsElement | null
    expect(entryEl).toBeTruthy()

    const editSpy = vi.fn()
    const moveSpy = vi.fn()
    const deleteSpy = vi.fn()
    if (entryEl) {
      entryEl.triggerEditAction = editSpy
      entryEl.triggerMoveAction = moveSpy
      entryEl.triggerDeleteAction = deleteSpy
    }

    getAction(layout, 'pm-entry-edit')?.click()
    getAction(layout, 'pm-entry-move')?.click()
    getAction(layout, 'pm-entry-delete')?.click()

    expect(editSpy).toHaveBeenCalledTimes(1)
    expect(moveSpy).toHaveBeenCalledTimes(1)
    expect(deleteSpy).toHaveBeenCalledTimes(1)
  })

  it('keeps only secondary actions inside More dropdown for both contexts', async () => {
    ensureMobileLayoutDefined()
    originalPassmanager = (window as any).passmanager
    const pm = createPassmanager(createRootLike())
    ;(window as any).passmanager = pm

    const layout = document.createElement('password-manager-mobile-layout') as PasswordManagerMobileLayout
    document.body.appendChild(layout)
    await layout.updateComplete

    const getDropdownItems = () =>
      Array.from(
        layout.shadowRoot
          ?.querySelector('cv-menu-button[data-action="pm-more"]')
          ?.querySelectorAll('cv-menu-item[data-action]') ?? [],
      ).map((item) => item.getAttribute('data-action'))

    expect(getDropdownItems()).toEqual(['pm-export', 'pm-import', 'pm-clean'])

    pm.showElement.set(createEntryForStateCheck())
    await Promise.resolve()
    await layout.updateComplete

    expect(getDropdownItems()).toEqual(['pm-export', 'pm-import', 'pm-clean'])
  })

  it('provides toolbar context for list, entry, create and edit states', async () => {
    ensureMobileLayoutDefined()
    originalPassmanager = (window as any).passmanager
    const root = createRootLike()
    const group = new Group({
      id: 'toolbar-group',
      name: 'Toolbar Group',
      entries: [],
      createdTs: Date.now(),
      updatedTs: Date.now(),
    } as any)
    const pm = createPassmanager(root)
    ;(window as any).passmanager = pm

    const layout = document.createElement('password-manager-mobile-layout') as PasswordManagerMobileLayout
    document.body.appendChild(layout)
    await layout.updateComplete

    expect(layout.getMobileToolbarContext()).toEqual({
      title: 'Root',
      canGoBack: false,
      backDisabled: false,
      showCommand: true,
    })

    pm.showElement.set(group)
    await Promise.resolve()
    await layout.updateComplete
    expect(layout.getMobileToolbarContext().showCommand).toBe(true)
    expect(layout.getMobileToolbarContext().canGoBack).toBe(true)

    const entry = createEntryWithParent(group, 'Context Entry')
    pm.showElement.set(entry)
    await Promise.resolve()
    await layout.updateComplete
    expect(layout.getMobileToolbarContext()).toEqual({
      title: 'Context Entry',
      canGoBack: true,
      backDisabled: false,
      showCommand: true,
    })

    pm.isEditMode.set(true)
    await Promise.resolve()
    await layout.updateComplete
    expect(layout.getMobileToolbarContext().title).toBe('Edit entry')
    expect(layout.getMobileToolbarContext().canGoBack).toBe(true)
    expect(layout.getMobileToolbarContext().showCommand).toBe(false)

    pm.isEditMode.set(false)
    pm.showElement.set('createEntry')
    await Promise.resolve()
    await layout.updateComplete
    expect(layout.getMobileToolbarContext()).toEqual({
      title: 'Create entry',
      canGoBack: true,
      backDisabled: false,
      showCommand: false,
    })
  })

  it('provides command context and active filters state', async () => {
    ensureMobileLayoutDefined()
    originalPassmanager = (window as any).passmanager
    const pm = createPassmanager(createRootLike())
    ;(window as any).passmanager = pm

    const layout = document.createElement('password-manager-mobile-layout') as PasswordManagerMobileLayout
    document.body.appendChild(layout)
    await layout.updateComplete

    let context = layout.getMobileCommandContext()
    expect(context.kind).toBe('passwords-list')
    expect(context.hasActiveFilters).toBe(false)

    filterValue.set('mail')
    quickFilters.set(['otp'])
    sortField.set('modified')
    await Promise.resolve()
    await layout.updateComplete

    context = layout.getMobileCommandContext()
    expect(context.query).toBe('mail')
    expect(context.quickFilters).toEqual(['otp'])
    expect(context.sortField).toBe('modified')
    expect(context.hasActiveFilters).toBe(true)

    pm.showElement.set(createEntryForStateCheck())
    await Promise.resolve()
    await layout.updateComplete
    expect(layout.getMobileCommandContext().kind).toBe('passwords-entry')

    pm.isEditMode.set(true)
    await Promise.resolve()
    await layout.updateComplete
    expect(layout.getMobileCommandContext().kind).toBe('none')
  })

  it('executes mobile command actions through provider API', async () => {
    ensureMobileLayoutDefined()
    originalPassmanager = (window as any).passmanager
    const pm = createPassmanager(createRootLike())
    ;(window as any).passmanager = pm

    const onCreateEntrySpy = vi.spyOn(pmModel, 'onCreateEntry').mockImplementation(() => {})
    const onCreateGroupSpy = vi.spyOn(pmModel, 'onCreateGroup').mockImplementation(() => {})
    const onExportSpy = vi.spyOn(pmModel, 'onExport').mockImplementation(() => {})
    const onImportSpy = vi.spyOn(pmModel, 'onImport').mockResolvedValue(undefined)
    const onCleanSpy = vi.spyOn(pmModel, 'onFullClean').mockImplementation(() => {})

    const layout = document.createElement('password-manager-mobile-layout') as PasswordManagerMobileLayout
    document.body.appendChild(layout)
    await layout.updateComplete

    expect(layout.executeMobileCommand('pm-create-entry')).toBe(true)
    expect(layout.executeMobileCommand('pm-create-group')).toBe(true)
    expect(layout.executeMobileCommand('pm-export')).toBe(true)
    expect(layout.executeMobileCommand('pm-import')).toBe(true)
    expect(layout.executeMobileCommand('pm-clean')).toBe(true)

    expect(onCreateEntrySpy).toHaveBeenCalledTimes(1)
    expect(onCreateGroupSpy).toHaveBeenCalledTimes(1)
    expect(onExportSpy).toHaveBeenCalledTimes(1)
    expect(onImportSpy).toHaveBeenCalledTimes(1)
    expect(onCleanSpy).toHaveBeenCalledTimes(1)

    expect(layout.executeMobileCommand('pm-search-set-query', {query: 'bank'})).toBe(true)
    expect(filterValue()).toBe('bank')

    expect(layout.executeMobileCommand('pm-search-clear-query')).toBe(true)
    expect(filterValue()).toBe('')

    expect(layout.executeMobileCommand('pm-toggle-quick-filter', {query: 'otp'})).toBe(true)
    expect(quickFilters()).toEqual(['otp'])

    expect(layout.executeMobileCommand('pm-toggle-quick-filter', {query: 'favorites'})).toBe(true)
    expect(quickFilters()).toEqual(['otp', 'favorites'])

    expect(layout.executeMobileCommand('pm-sort-direction-toggle')).toBe(true)
    expect(sortDirection()).toBe('desc')

    expect(layout.executeMobileCommand('pm-sort-field-website')).toBe(true)
    expect(sortField()).toBe('website')

    expect(layout.executeMobileCommand('pm-group-by-folder')).toBe(true)
    expect(groupBy()).toBe('folder')

    const entry = createEntryForStateCheck()
    pm.showElement.set(entry)
    await Promise.resolve()
    await layout.updateComplete

    const entryEl = layout.shadowRoot?.querySelector('pm-entry-mobile') as PMEntryActionsElement | null
    const editSpy = vi.fn()
    const moveSpy = vi.fn()
    const deleteSpy = vi.fn()
    if (entryEl) {
      entryEl.triggerEditAction = editSpy
      entryEl.triggerMoveAction = moveSpy
      entryEl.triggerDeleteAction = deleteSpy
    }

    expect(layout.executeMobileCommand('pm-entry-edit')).toBe(true)
    expect(layout.executeMobileCommand('pm-entry-move')).toBe(true)
    expect(layout.executeMobileCommand('pm-entry-delete')).toBe(true)
    expect(editSpy).toHaveBeenCalledTimes(1)
    expect(moveSpy).toHaveBeenCalledTimes(1)
    expect(deleteSpy).toHaveBeenCalledTimes(1)

    pm.isEditMode.set(true)
    await Promise.resolve()
    await layout.updateComplete
    expect(layout.executeMobileCommand('pm-entry-edit')).toBe(false)
  })

  it('re-renders visible mobile rows after sort and group commands', async () => {
    ensureMobileLayoutDefined()
    originalPassmanager = (window as any).passmanager

    const group = createGroupWithEntries('Accounts')
    const alpha = new Entry(
      group as any,
      {
        id: 'entry-alpha-mobile',
        title: 'Alpha',
        username: '',
        urls: [{value: 'https://zeta.test', match: 'host'}],
        createdTs: Date.now(),
        updatedTs: Date.now(),
        otps: [],
      } as any,
    )
    const zulu = new Entry(
      group as any,
      {
        id: 'entry-zulu-mobile',
        title: 'Zulu',
        username: '',
        urls: [{value: 'https://alpha.test', match: 'host'}],
        createdTs: Date.now(),
        updatedTs: Date.now(),
        otps: [],
      } as any,
    )
    group.entries.set([zulu, alpha])

    const pm = createPassmanager(group, [group])
    ;(window as any).passmanager = pm

    const layout = document.createElement('password-manager-mobile-layout') as PasswordManagerMobileLayout
    document.body.appendChild(layout)
    await flushLayout(layout)

    expect(getRenderedMobileRows(layout)).toEqual(['entry:Alpha', 'entry:Zulu'])

    expect(layout.executeMobileCommand('pm-sort-field-website')).toBe(true)
    await flushLayout(layout)
    expect(getRenderedMobileRows(layout)).toEqual(['entry:Zulu', 'entry:Alpha'])

    expect(layout.executeMobileCommand('pm-group-by-website')).toBe(true)
    await flushLayout(layout)
    expect(getRenderedMobileRows(layout)).toEqual([
      'header:alpha.test 1',
      'entry:Zulu',
      'header:zeta.test 1',
      'entry:Alpha',
    ])
  })

  it('handles toolbar back chain for edit, entry, create/import and root contexts', async () => {
    ensureMobileLayoutDefined()
    originalPassmanager = (window as any).passmanager
    const root = createRootLike()
    const parentGroup = new Group({
      id: 'backchain-parent-group',
      name: 'Backchain Parent Group',
      entries: [],
      createdTs: Date.now(),
      updatedTs: Date.now(),
    } as any)
    const pm = createPassmanager(root)
    ;(window as any).passmanager = pm

    const layout = document.createElement('password-manager-mobile-layout') as PasswordManagerMobileLayout
    document.body.appendChild(layout)
    await layout.updateComplete

    const entry = createEntryWithParent(parentGroup, 'Backchain Entry')
    pm.showElement.set(entry)
    await Promise.resolve()
    await layout.updateComplete

    expect(layout.handleMobileToolbarBack()).toBe(false)
    expect(pm.showElement()).toBe(entry)

    pm.showElement.set(entry)
    pm.isEditMode.set(true)
    await Promise.resolve()
    await layout.updateComplete
    expect(layout.handleMobileToolbarBack()).toBe(false)
    expect(pm.isEditMode()).toBe(true)

    pm.showElement.set('createGroup')
    await Promise.resolve()
    await layout.updateComplete
    expect(layout.handleMobileToolbarBack()).toBe(false)
    expect(pm.showElement()).toBe('createGroup')

    pm.showElement.set('importDialog')
    await Promise.resolve()
    await layout.updateComplete
    expect(layout.handleMobileToolbarBack()).toBe(false)
    expect(pm.showElement()).toBe('importDialog')

    pm.showElement.set(root)
    await Promise.resolve()
    await layout.updateComplete
    expect(layout.handleMobileToolbarBack()).toBe(false)
  })
})
