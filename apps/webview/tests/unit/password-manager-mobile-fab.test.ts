import {
  Entry,
  Group,
  ManagerRoot,
  filterValue,
  quickFilters,
  selectedCredentialTagFilters,
} from '@project/passmanager'
import {ImportDialog} from '@chromvoid/password-import/ui/import-dialog'
import {ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {html, nothing} from 'lit'

import {afterEach, describe, expect, it, vi} from 'vitest'

import {atom} from '@reatom/core'
import {PMEntryModel} from '../../src/features/passmanager/components/card/entry/entry.model'
import {PMGroupModel} from '../../src/features/passmanager/components/group/group'
import {groupBy, sortDirection, sortField} from '../../src/features/passmanager/components/list/sort-controls'
import {PasswordManagerMobileLayout} from '../../src/features/passmanager/components/password-manager-layout/password-manager-mobile-layout'
import {pmEntryEditorModel} from '../../src/features/passmanager/models/pm-entry-editor.model'
import {pmMobileChromeModel} from '../../src/features/passmanager/models/pm-mobile-chrome.model'
import {pmModel} from '../../src/features/passmanager/password-manager.model'

type FakePassmanager = {
  id: string
  showElement: ReturnType<typeof atom<any>>
  isEditMode: ReturnType<typeof atom<boolean>>
  isLoading: ReturnType<typeof atom<boolean>>
  isReadOnly: ReturnType<typeof atom<boolean>>
  setShowElement: (...args: unknown[]) => void
  entriesList: () => Array<Entry | Group>
  getCardByID: (id: string) => Entry | Group | undefined
  export: () => void
  fullClean: () => void
  clean: () => void
  load: () => void
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

class TestPMGroupMobile extends ReatomLitElement {
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
  defineStub('pm-entry', class extends HTMLElement {})
  defineStub('pm-group-create-desktop', class extends HTMLElement {})
  if (!customElements.get('pm-group-mobile')) {
    customElements.define('pm-group-mobile', TestPMGroupMobile)
  }
  if (!customElements.get('password-manager-mobile-layout')) {
    customElements.define('password-manager-mobile-layout', TestPasswordManagerMobileLayout)
  }
  ImportDialog.define()
  mobileLayoutDefined = true
}

function createPassmanager(initialShowElement: unknown, items: Array<Entry | Group> = []): FakePassmanager {
  return {
    id: 'pm-mobile-layout-test',
    showElement: atom<any>(initialShowElement),
    isEditMode: atom(false),
    isLoading: atom(false),
    isReadOnly: atom(false),
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
  root.entries = atom<Array<Entry | Group>>([])
  root.isLoading = atom(false)
  root.isReadOnly = atom(false)
  root.isEditMode = atom(false)
  root.showElement = atom<any>(root)
  root.updatedTs = atom(Date.now())
  root.createdTs = atom(Date.now())
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

describe('PasswordManagerMobileLayout FAB actions', () => {
  afterEach(() => {
    document.querySelectorAll('password-manager-mobile-layout').forEach((el) => el.remove())
    ;(window as any).passmanager = originalPassmanager
    pmEntryEditorModel.reset()
    filterValue.set('')
    quickFilters.set([])
    selectedCredentialTagFilters.set([])
    sortField.set('name')
    sortDirection.set('asc')
    groupBy.set('none')
    pmMobileChromeModel.closeSortGroupSheet()
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('exposes readonly list toolbar actions through the shared mobile chrome model', async () => {
    ensureMobileLayoutDefined()
    originalPassmanager = (window as any).passmanager
    const pm = createPassmanager(createRootLike())
    pm.isReadOnly.set(true)
    ;(window as any).passmanager = pm

    const layout = document.createElement('password-manager-mobile-layout') as PasswordManagerMobileLayout
    document.body.appendChild(layout)
    await layout.updateComplete

    expect(pmMobileChromeModel.getToolbarActions()).toEqual([
      {id: 'pm-create-group', icon: 'folder-plus', label: 'Create group', disabled: true},
      {id: 'pm-create-entry', icon: 'plus-lg', label: 'Create entry', disabled: true},
    ])
  })

  it('exposes readonly entry toolbar actions through the shared mobile chrome model', async () => {
    ensureMobileLayoutDefined()
    originalPassmanager = (window as any).passmanager
    const pm = createPassmanager(createEntryForStateCheck())
    pm.isReadOnly.set(true)
    ;(window as any).passmanager = pm

    const layout = document.createElement('password-manager-mobile-layout') as PasswordManagerMobileLayout
    document.body.appendChild(layout)
    await layout.updateComplete

    expect(pmMobileChromeModel.getToolbarActions()).toEqual([
      {id: 'pm-entry-copy-all', icon: 'cloud-download', label: 'Copy all data'},
      {id: 'pm-entry-delete', icon: 'trash', label: 'Delete entry', disabled: true},
      {id: 'pm-entry-move', icon: 'folder-symlink', label: 'Move entry', disabled: true},
    ])
  })

  it('keeps list command context but shows the command button only outside inline-search lists', async () => {
    ensureMobileLayoutDefined()
    originalPassmanager = (window as any).passmanager
    const pm = createPassmanager(createRootLike())
    ;(window as any).passmanager = pm

    const layout = document.createElement('password-manager-mobile-layout') as PasswordManagerMobileLayout
    document.body.appendChild(layout)
    await layout.updateComplete

    expect(pmMobileChromeModel.getToolbarContext().showCommand).toBe(false)
    expect(pmMobileChromeModel.getCommandContext().kind).toBe('passwords-list')

    pm.showElement.set(createEntryForStateCheck())
    await Promise.resolve()
    await layout.updateComplete
    expect(pmMobileChromeModel.getToolbarContext().showCommand).toBe(false)
    expect(pmMobileChromeModel.getCommandContext().kind).toBe('passwords-entry')

    pm.showElement.set('createEntry')
    await Promise.resolve()
    await layout.updateComplete
    expect(pmMobileChromeModel.getToolbarContext().showCommand).toBe(false)
    expect(pmMobileChromeModel.getCommandContext().kind).toBe('none')

    pm.showElement.set('createGroup')
    await Promise.resolve()
    await layout.updateComplete
    expect(pmMobileChromeModel.getToolbarContext().showCommand).toBe(false)
    expect(pmMobileChromeModel.getCommandContext().kind).toBe('none')

    pm.showElement.set('importDialog')
    await Promise.resolve()
    await layout.updateComplete
    expect(pmMobileChromeModel.getToolbarContext().showCommand).toBe(false)
    expect(pmMobileChromeModel.getCommandContext().kind).toBe('none')
  })

  it('does not expose toolbar actions while the password import surface is open', async () => {
    ensureMobileLayoutDefined()
    originalPassmanager = (window as any).passmanager
    const pm = createPassmanager('importDialog')
    ;(window as any).passmanager = pm

    const layout = document.createElement('password-manager-mobile-layout') as PasswordManagerMobileLayout
    document.body.appendChild(layout)
    await flushLayout(layout)

    expect(pmMobileChromeModel.getToolbarActions()).toEqual([])
    expect(pmMobileChromeModel.executeCommand('pm-import-help')).toBe(false)
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

    expect(pmMobileChromeModel.getToolbarContext()).toEqual({
      title: 'Credentials',
      canGoBack: false,
      backDisabled: false,
      showCommand: false,
      maxVisible: 3,
    })

    pm.showElement.set(group)
    await Promise.resolve()
    await layout.updateComplete
    expect(pmMobileChromeModel.getToolbarContext().showCommand).toBe(false)
    expect(pmMobileChromeModel.getToolbarContext().canGoBack).toBe(true)

    const entry = createEntryWithParent(group, 'Context Entry')
    pm.showElement.set(entry)
    await Promise.resolve()
    await layout.updateComplete
    expect(pmMobileChromeModel.getToolbarContext()).toEqual({
      title: 'Context Entry',
      canGoBack: true,
      backDisabled: false,
      showCommand: false,
      maxVisible: 3,
      overflowFromIndex: 2,
    })

    pmEntryEditorModel.openSurface(entry.id, 'title')
    await Promise.resolve()
    await layout.updateComplete
    expect(pmMobileChromeModel.getToolbarContext().title).toBe('Context Entry')
    expect(pmMobileChromeModel.getToolbarContext().canGoBack).toBe(true)
    expect(pmMobileChromeModel.getToolbarContext().showCommand).toBe(false)

    pmEntryEditorModel.closeSurface(entry.id)
    pm.showElement.set('createEntry')
    await Promise.resolve()
    await layout.updateComplete
    expect(pmMobileChromeModel.getToolbarContext()).toEqual({
      title: 'Create entry',
      canGoBack: true,
      backDisabled: false,
      showCommand: false,
      maxVisible: 3,
    })
  })

  it('keeps only frequent list actions in the mobile toolbar', async () => {
    ensureMobileLayoutDefined()
    originalPassmanager = (window as any).passmanager
    const pm = createPassmanager(createRootLike())
    ;(window as any).passmanager = pm

    const layout = document.createElement('password-manager-mobile-layout') as PasswordManagerMobileLayout
    document.body.appendChild(layout)
    await layout.updateComplete

    expect(pmMobileChromeModel.getToolbarActions().map((action) => action.id)).toEqual([
      'pm-create-group',
      'pm-create-entry',
    ])

    pm.showElement.set(createEntryForStateCheck())
    await Promise.resolve()
    await layout.updateComplete

    expect(pmMobileChromeModel.getToolbarActions().map((action) => action.id)).toEqual([
      'pm-entry-copy-all',
      'pm-entry-delete',
      'pm-entry-move',
    ])
  })

  it('provides command context and active filters state', async () => {
    ensureMobileLayoutDefined()
    originalPassmanager = (window as any).passmanager
    const pm = createPassmanager(createRootLike())
    ;(window as any).passmanager = pm

    const layout = document.createElement('password-manager-mobile-layout') as PasswordManagerMobileLayout
    document.body.appendChild(layout)
    await layout.updateComplete

    let context = pmMobileChromeModel.getCommandContext()
    expect(context.kind).toBe('passwords-list')
    expect(context.hasActiveFilters).toBe(false)

    selectedCredentialTagFilters.set(['work'])
    expect(pmMobileChromeModel.getCommandContext().hasActiveFilters).toBe(true)
    expect(pmMobileChromeModel.getToolbarActions().map((action) => action.id)).toContain(
      'pm-search-clear-query',
    )
    expect(pmMobileChromeModel.executeCommand('pm-search-clear-query')).toBe(true)
    expect(selectedCredentialTagFilters()).toEqual([])

    filterValue.set('mail')
    quickFilters.set(['otp'])
    selectedCredentialTagFilters.set(['work'])
    sortField.set('modified')
    await Promise.resolve()
    await layout.updateComplete

    context = pmMobileChromeModel.getCommandContext()
    expect(context.query).toBe('mail')
    expect(context.quickFilters).toEqual(['otp'])
    expect(context.sortField).toBe('modified')
    expect(context.hasActiveFilters).toBe(true)
    expect(pmMobileChromeModel.getToolbarContext().maxVisible).toBe(4)
    const toolbarActions = pmMobileChromeModel.getToolbarActions()
    expect(toolbarActions.map((action) => action.id)).toEqual([
      'pm-create-group',
      'pm-create-entry',
      'pm-search-clear-query',
    ])
    expect(toolbarActions.find((action) => action.id === 'pm-search-clear-query')).toMatchObject({
      tone: 'accent',
    })

    pm.showElement.set(createEntryForStateCheck())
    await Promise.resolve()
    await layout.updateComplete
    expect(pmMobileChromeModel.getCommandContext().kind).toBe('passwords-entry')

    pmEntryEditorModel.openSurface('entry-for-fab-state', 'title')
    await Promise.resolve()
    await layout.updateComplete
    expect(pmMobileChromeModel.getCommandContext().kind).toBe('none')
  })

  it('executes mobile command actions through the shared mobile chrome model', async () => {
    ensureMobileLayoutDefined()
    originalPassmanager = (window as any).passmanager
    const pm = createPassmanager(createRootLike())
    ;(window as any).passmanager = pm

    const onCreateEntrySpy = vi.spyOn(pmModel, 'onCreateEntry').mockImplementation(() => {})
    const onCreateGroupSpy = vi.spyOn(pmModel, 'onCreateGroup').mockImplementation(() => {})
    const onExportSpy = vi.spyOn(pmModel, 'onExport').mockImplementation(() => {})
    const onImportSpy = vi.spyOn(pmModel, 'onImport').mockResolvedValue(undefined)
    const onCleanSpy = vi.spyOn(pmModel, 'onFullClean').mockImplementation(() => {})
    const openOtpSpy = vi.spyOn(pmModel, 'openOtpView').mockImplementation(() => {})

    const layout = document.createElement('password-manager-mobile-layout') as PasswordManagerMobileLayout
    document.body.appendChild(layout)
    await layout.updateComplete

    expect(pmMobileChromeModel.executeCommand('pm-create-entry')).toBe(true)
    expect(pmMobileChromeModel.executeCommand('pm-create-group')).toBe(true)
    expect(pmMobileChromeModel.executeCommand('pm-export')).toBe(false)
    expect(pmMobileChromeModel.executeCommand('pm-import')).toBe(false)
    expect(pmMobileChromeModel.executeCommand('pm-clean')).toBe(false)
    expect(pmMobileChromeModel.executeCommand('pm-otp-view')).toBe(false)

    expect(onCreateEntrySpy).toHaveBeenCalledTimes(1)
    expect(onCreateGroupSpy).toHaveBeenCalledTimes(1)
    expect(onExportSpy).not.toHaveBeenCalled()
    expect(onImportSpy).not.toHaveBeenCalled()
    expect(onCleanSpy).not.toHaveBeenCalled()
    expect(openOtpSpy).not.toHaveBeenCalled()

    expect(pmMobileChromeModel.executeCommand('pm-search-set-query', {query: 'bank'})).toBe(true)
    expect(filterValue()).toBe('bank')

    expect(pmMobileChromeModel.executeCommand('pm-toggle-quick-filter', {query: 'otp'})).toBe(true)
    expect(quickFilters()).toEqual(['otp'])

    expect(pmMobileChromeModel.executeCommand('pm-toggle-quick-filter', {query: 'favorites'})).toBe(true)
    expect(quickFilters()).toEqual(['otp', 'favorites'])

    expect(pmMobileChromeModel.executeCommand('pm-sort-direction-toggle')).toBe(true)
    expect(sortDirection()).toBe('desc')

    expect(pmMobileChromeModel.executeCommand('pm-sort-field-website')).toBe(true)
    expect(sortField()).toBe('website')

    expect(pmMobileChromeModel.executeCommand('pm-group-by-folder')).toBe(false)
    expect(groupBy()).toBe('none')

    expect(pmMobileChromeModel.executeCommand('pm-group-by-website')).toBe(true)
    expect(groupBy()).toBe('website')

    selectedCredentialTagFilters.set(['work'])
    expect(pmMobileChromeModel.executeCommand('pm-search-clear-query')).toBe(true)
    expect(filterValue()).toBe('')
    expect(quickFilters()).toEqual([])
    expect(selectedCredentialTagFilters()).toEqual([])
    expect(sortField()).toBe('name')
    expect(sortDirection()).toBe('asc')
    expect(groupBy()).toBe('none')

    const entry = createEntryForStateCheck()
    pm.showElement.set(entry)
    await flushLayout(layout)

    const moveSpy = vi.spyOn(PMEntryModel.prototype, 'moveEntryCard').mockResolvedValue(undefined)
    const deleteSpy = vi.spyOn(PMEntryModel.prototype, 'deleteEntryCard').mockImplementation(() => {})

    expect(pmMobileChromeModel.executeCommand('pm-entry-move')).toBe(true)
    expect(pmMobileChromeModel.executeCommand('pm-entry-delete')).toBe(true)
    expect(pmMobileChromeModel.executeCommand('pm-entry-edit')).toBe(true)
    expect(pmMobileChromeModel.executeCommand('pm-export')).toBe(false)
    expect(pmMobileChromeModel.executeCommand('pm-import')).toBe(false)
    expect(pmMobileChromeModel.executeCommand('pm-clean')).toBe(false)
    expect(pmEntryEditorModel.isActiveForEntry(entry.id)).toBe(true)
    expect(moveSpy).toHaveBeenCalledTimes(1)
    expect(deleteSpy).toHaveBeenCalledTimes(1)
    expect(onExportSpy).not.toHaveBeenCalled()
    expect(onImportSpy).not.toHaveBeenCalled()
    expect(onCleanSpy).not.toHaveBeenCalled()

    pmEntryEditorModel.openSurface(entry.id, 'title')
    await Promise.resolve()
    await layout.updateComplete
    expect(pmMobileChromeModel.executeCommand('pm-entry-edit')).toBe(false)
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

    expect(pmMobileChromeModel.executeCommand('pm-sort-field-website')).toBe(true)
    await flushLayout(layout)
    expect(getRenderedMobileRows(layout)).toEqual(['entry:Zulu', 'entry:Alpha'])

    expect(pmMobileChromeModel.executeCommand('pm-group-by-website')).toBe(true)
    await flushLayout(layout)
    expect(getRenderedMobileRows(layout)).toEqual([
      'header:alpha.test 1',
      'entry:Zulu',
      'header:zeta.test 1',
      'entry:Alpha',
    ])
  })

  it('keeps non-transient toolbar back handling outside the shared model', async () => {
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

    expect(pmMobileChromeModel.handleBack()).toBe(false)
    expect(pm.showElement()).toBe(entry)

    pm.showElement.set(entry)
    pmEntryEditorModel.openSurface(entry.id, 'note')
    await Promise.resolve()
    await layout.updateComplete
    expect(pmMobileChromeModel.handleBack()).toBe(true)
    expect(pmEntryEditorModel.active()).toBe(false)

    pm.showElement.set('createGroup')
    await Promise.resolve()
    await layout.updateComplete
    expect(pmMobileChromeModel.handleBack()).toBe(false)
    expect(pm.showElement()).toBe('createGroup')

    pm.showElement.set('importDialog')
    await Promise.resolve()
    await layout.updateComplete
    expect(pmMobileChromeModel.handleBack()).toBe(false)
    expect(pm.showElement()).toBe('importDialog')

    pm.showElement.set(root)
    await Promise.resolve()
    await layout.updateComplete
    expect(pmMobileChromeModel.handleBack()).toBe(false)
  })
})
