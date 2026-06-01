import {afterEach, describe, expect, it, vi} from 'vitest'

import {Entry, Group, ManagerRoot, filterValue, quickFilters} from '@project/passmanager'
import {navigationModel} from '../../src/app/navigation/navigation.model'
import {CommandBar} from '../../src/features/file-manager/components/command-bar'
import {atom} from '@reatom/core'
import {groupBy, sortDirection, sortField} from '../../src/features/passmanager/components/list/sort-controls'
import {pmMobileChromeModel} from '../../src/features/passmanager/models/pm-mobile-chrome.model'
import {pmSelectionModeModel} from '../../src/features/passmanager/models/pm-selection-mode.model'
import {MobileTopToolbar} from '../../src/features/shell/components/mobile-top-toolbar'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {openCommandPalette} from '../../src/shared/services/command-palette'
import {transientBackModel} from '../../src/shared/services/transient-back.model'
import type {SearchFilters} from '../../src/shared/contracts/file-manager'

const DEFAULT_FILTERS: SearchFilters = {
  query: '',
  sortBy: 'name',
  sortDirection: 'asc',
  viewMode: 'list',
  showHidden: false,
  fileTypes: [],
}

type FakePassmanager = {
  id: string
  showElement: ReturnType<typeof atom<any>>
  isEditMode: ReturnType<typeof atom<boolean>>
  isLoading: ReturnType<typeof atom<boolean>>
  isReadOnly: ReturnType<typeof atom<boolean>>
  getCardByID: (id: string) => Entry | Group | undefined
}

let defined = false
let toolbarDefined = false
let originalPassmanager: typeof window.passmanager

function ensureDefined() {
  if (defined) return
  CommandBar.define()
  defined = true
}

function ensureToolbarDefined() {
  if (toolbarDefined) return
  MobileTopToolbar.define()
  toolbarDefined = true
}

function getOverflowTrigger(toolbar: MobileTopToolbar) {
  return toolbar.shadowRoot
    ?.querySelector('cv-menu-button.overflow-menu')
    ?.shadowRoot?.querySelector('[part="trigger"]') as HTMLButtonElement | null
}

function getOverflowMenu(toolbar: MobileTopToolbar) {
  return toolbar.shadowRoot?.querySelector('cv-menu-button.overflow-menu') as HTMLElementTagNameMap['cv-menu-button'] | null
}

function setupStore() {
  navigationModel.disconnect()
  window.history.replaceState({}, '', '/dashboard?surface=files&path=%2F')

  const filtersState = atom<SearchFilters>({...DEFAULT_FILTERS})
  const store = {
    layoutMode: atom<'mobile' | 'desktop'>('mobile'),
    showRemoteStoragePage: atom(false),
    showGatewayPage: atom(false),
    showRemotePage: atom(false),
    showSettingsPage: atom(false),
    isShowPasswordManager: atom(false),
    searchFilters: filtersState,
    setSearchFilters(next: SearchFilters | ((prev: SearchFilters) => SearchFilters)) {
      if (typeof next === 'function') {
        filtersState.set(next(filtersState()))
      } else {
        filtersState.set(next)
      }
    },
  }

  initAppContext(
    createMockAppContext({
      store: store as any,
    }),
  )

  navigationModel.reset()
  return store
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

function createGroup(id: string, name = id) {
  return new Group({
    id,
    name,
    entries: [],
    createdTs: Date.now(),
    updatedTs: Date.now(),
  } as any)
}

function createEntry(parent: Group, id: string, title = id) {
  return new Entry(
    parent as any,
    {
      id,
      title,
      username: '',
      urls: [],
      createdTs: Date.now(),
      updatedTs: Date.now(),
      otps: [],
    } as any,
  )
}

function setPassmanagerContext(showElement: unknown, items: Array<Entry | Group> = []): FakePassmanager {
  const passmanager = {
    id: 'command-bar-passwords-context',
    showElement: atom<any>(showElement),
    isEditMode: atom(false),
    isLoading: atom(false),
    isReadOnly: atom(false),
    getCardByID: (id: string) => items.find((item) => item.id === id),
  }

  window.passmanager = passmanager as typeof window.passmanager
  return passmanager
}

function getCommandIds(bar: CommandBar): string[] {
  return ((bar as any).getFilteredCommands() as Array<{id: string}>).map((command) => command.id)
}

async function flush() {
  await Promise.resolve()
}

describe('CommandBar mobile context', () => {
  afterEach(() => {
    navigationModel.disconnect()
    document.querySelectorAll('command-bar').forEach((el) => el.remove())
    pmSelectionModeModel.exit()
    filterValue.set('')
    quickFilters.set([])
    sortField.set('name')
    sortDirection.set('asc')
    groupBy.set('none')
    pmMobileChromeModel.closeSortGroupSheet()
    localStorage.clear()
    window.passmanager = originalPassmanager
    clearAppContext()
    vi.restoreAllMocks()
  })

  it('opens in files context and keeps file actions', async () => {
    ensureDefined()
    setupStore()

    const bar = document.createElement('command-bar') as CommandBar
    document.body.appendChild(bar)
    await bar.updateComplete

    openCommandPalette({mode: 'all', source: 'mobile-tab'})
    await bar.updateComplete

    expect(bar.hasAttribute('open')).toBe(true)
    expect(getCommandIds(bar)).toContain('action-new-note')
    expect(getCommandIds(bar)).toContain('action-new-folder')
    expect(getCommandIds(bar)).toContain('action-upload')
  })

  it('closes through the transient back registry without changing navigation', async () => {
    ensureDefined()
    setupStore()

    const bar = document.createElement('command-bar') as CommandBar
    document.body.appendChild(bar)
    await bar.updateComplete

    openCommandPalette({mode: 'all', source: 'mobile-tab'})
    await bar.updateComplete

    expect(bar.hasAttribute('open')).toBe(true)
    expect(transientBackModel.consumeBack()).toBe(true)
    await bar.updateComplete

    expect(bar.hasAttribute('open')).toBe(false)
    expect(navigationModel.currentSurface()).toBe('files')
    expect(navigationModel.filesPath()).toBe('/')
  })

  it('resolves passwords-list context and exposes list/filter command set', async () => {
    ensureDefined()
    setupStore()
    navigationModel.navigateToSurface('passwords')
    originalPassmanager = window.passmanager
    setPassmanagerContext(createRootLike())
    filterValue.set('mail')
    quickFilters.set(['otp'])
    sortField.set('modified')
    sortDirection.set('desc')
    groupBy.set('website')

    const bar = document.createElement('command-bar') as CommandBar
    document.body.appendChild(bar)
    await bar.updateComplete

    openCommandPalette({mode: 'all', source: 'mobile-toolbar'})
    await bar.updateComplete

    const ids = getCommandIds(bar)
    expect(ids).toContain('pm-create-entry')
    expect(ids).toContain('pm-create-group')
    expect(ids).toContain('pm-filter-recent')
    expect(ids).toContain('pm-filter-otp')
    expect(ids).toContain('pm-filter-ssh')
    expect(ids).toContain('pm-filter-card')
    expect(ids).toContain('pm-sort-direction-toggle')
    expect(ids).toContain('pm-group-by-website')
    expect(ids).not.toContain('pm-filter-files')
    expect(ids).not.toContain('pm-filter-favorites')
    expect(ids).not.toContain('pm-filter-nopass')
    expect(ids).not.toContain('pm-group-by-folder')
    expect(ids).not.toContain('pm-otp-view')
    expect(ids).not.toContain('pm-import')
    expect(ids).not.toContain('pm-export')
    expect(ids).not.toContain('pm-clean')
  })

  it('resolves passwords-entry context and shows entry actions', async () => {
    ensureDefined()
    setupStore()
    navigationModel.navigateToSurface('passwords')
    originalPassmanager = window.passmanager
    const group = createGroup('entry-context-group')
    const entry = createEntry(group, 'entry-context-entry', 'Entry Context')
    setPassmanagerContext(entry, [group, entry])

    const bar = document.createElement('command-bar') as CommandBar
    document.body.appendChild(bar)
    await bar.updateComplete

    openCommandPalette({mode: 'all', source: 'mobile-toolbar'})
    await bar.updateComplete

    const ids = getCommandIds(bar)
    expect(ids).toContain('pm-entry-copy-all')
    expect(ids).toContain('pm-entry-edit')
    expect(ids).toContain('pm-entry-move')
    expect(ids).toContain('pm-entry-delete')
    expect(ids).not.toContain('pm-create-entry')
    expect(ids).not.toContain('pm-import')
    expect(ids).not.toContain('pm-export')
    expect(ids).not.toContain('pm-clean')
  })

  it('filters mode shows only filter commands for passwords-list', async () => {
    ensureDefined()
    setupStore()
    navigationModel.navigateToSurface('passwords')
    originalPassmanager = window.passmanager
    setPassmanagerContext(createRootLike())

    const bar = document.createElement('command-bar') as CommandBar
    document.body.appendChild(bar)
    await bar.updateComplete

    openCommandPalette({mode: 'filters', source: 'fab'})
    await bar.updateComplete

    const ids = getCommandIds(bar)
    expect(ids).toContain('pm-sort-direction-toggle')
    expect(ids).toContain('pm-group-by-none')
    expect(ids).not.toContain('pm-create-entry')
  })

  it('toggles the card password quick filter from the mobile command menu', async () => {
    ensureDefined()
    setupStore()
    navigationModel.navigateToSurface('passwords')
    originalPassmanager = window.passmanager
    setPassmanagerContext(createRootLike())

    const bar = document.createElement('command-bar') as CommandBar
    document.body.appendChild(bar)
    await bar.updateComplete

    openCommandPalette({mode: 'filters', source: 'mobile-toolbar'})
    await bar.updateComplete

    const ids = getCommandIds(bar)
    expect(ids).toContain('pm-filter-card')
    expect(ids).not.toContain('pm-filter-files')
    expect(ids).not.toContain('pm-filter-favorites')
    expect(ids).not.toContain('pm-filter-nopass')

    const cardFilterButton = bar.shadowRoot?.querySelector('[data-command-id="pm-filter-card"]') as
      | HTMLButtonElement
      | null
    expect(cardFilterButton?.textContent).toContain('Cards')

    cardFilterButton?.click()
    await bar.updateComplete

    expect(quickFilters()).toEqual(['card'])
    expect(bar.hasAttribute('open')).toBe(false)
  })

  it('search mode in passwords-list focuses search command', async () => {
    ensureDefined()
    setupStore()
    navigationModel.navigateToSurface('passwords')
    originalPassmanager = window.passmanager
    setPassmanagerContext(createRootLike())

    const bar = document.createElement('command-bar') as CommandBar
    document.body.appendChild(bar)
    await bar.updateComplete

    openCommandPalette({mode: 'search', source: 'keyboard'})
    await bar.updateComplete

    const ids = getCommandIds(bar)
    expect(ids).toEqual(['search-passwords'])
    ;(bar as any).query.set('bank')
    await bar.updateComplete
    expect(getCommandIds(bar)).toEqual(['search-passwords'])
  })

  it('reopens passwords search mode with the current query prefilled', async () => {
    ensureDefined()
    setupStore()
    navigationModel.navigateToSurface('passwords')
    originalPassmanager = window.passmanager
    setPassmanagerContext(createRootLike())
    filterValue.set('bank')

    const bar = document.createElement('command-bar') as CommandBar
    document.body.appendChild(bar)
    await bar.updateComplete

    openCommandPalette({mode: 'search', source: 'mobile-toolbar'})
    await bar.updateComplete

    expect((bar as any).query()).toBe('bank')
    expect(getCommandIds(bar)).toEqual(['search-passwords'])
  })

  it('keeps passwords search open after switching from files when the same navigation snapshot re-emits', async () => {
    ensureDefined()
    setupStore()
    originalPassmanager = window.passmanager

    const bar = document.createElement('command-bar') as CommandBar
    document.body.appendChild(bar)
    await bar.updateComplete

    openCommandPalette({mode: 'search', source: 'mobile-toolbar'})
    await bar.updateComplete
    expect(bar.hasAttribute('open')).toBe(true)

    ;(bar as any).model.close()
    await bar.updateComplete
    expect(bar.hasAttribute('open')).toBe(false)

    navigationModel.navigateToSurface('passwords')
    setPassmanagerContext(createRootLike())
    await flush()

    openCommandPalette({mode: 'search', source: 'mobile-toolbar'})
    await bar.updateComplete

    expect(bar.hasAttribute('open')).toBe(true)
    expect(getCommandIds(bar)).toEqual(['search-passwords'])

    navigationModel.snapshot.set({...navigationModel.snapshot()})
    await flush()
    await bar.updateComplete

    expect(bar.hasAttribute('open')).toBe(true)
  })

  it('keeps the magnifier able to reopen search after opening sort/group outside the toolbar', async () => {
    ensureDefined()
    ensureToolbarDefined()
    setupStore()
    navigationModel.navigateToSurface('passwords')
    originalPassmanager = window.passmanager
    setPassmanagerContext(createRootLike())

    const bar = document.createElement('command-bar') as CommandBar
    document.body.appendChild(bar)
    await bar.updateComplete

    const toolbar = document.createElement('mobile-top-toolbar') as MobileTopToolbar
    toolbar.showCommand = true
    toolbar.maxVisible = 3
    toolbar.actions = pmMobileChromeModel.getToolbarActions()
    toolbar.addEventListener('mobile-toolbar-command', () => {
      openCommandPalette({mode: 'search', source: 'mobile-toolbar'})
    })
    toolbar.addEventListener('mobile-toolbar-action', (event) => {
      const actionId = (event as CustomEvent<{actionId?: string}>).detail?.actionId
      if (!actionId) return
      pmMobileChromeModel.executeCommand(actionId)
      toolbar.actions = pmMobileChromeModel.getToolbarActions()
      toolbar.commandActive = pmMobileChromeModel.getCommandContext().query.trim().length > 0
    })

    document.body.appendChild(toolbar)
    await toolbar.updateComplete

    expect(toolbar.shadowRoot?.querySelector('[data-action="pm-sort-group"]')).toBeNull()
    expect(pmMobileChromeModel.executeCommand('pm-sort-group')).toBe(true)
    toolbar.actions = pmMobileChromeModel.getToolbarActions()
    toolbar.commandActive = pmMobileChromeModel.getCommandContext().query.trim().length > 0
    await toolbar.updateComplete
    await bar.updateComplete

    expect(getOverflowMenu(toolbar)).toBeNull()
    expect(pmMobileChromeModel.sortGroupSheetOpen()).toBe(true)
    expect(bar.hasAttribute('open')).toBe(false)

    pmMobileChromeModel.setGroupBy('website')
    pmMobileChromeModel.closeSortGroupSheet()
    toolbar.actions = pmMobileChromeModel.getToolbarActions()
    toolbar.commandActive = pmMobileChromeModel.getCommandContext().query.trim().length > 0
    await toolbar.updateComplete

    expect(groupBy()).toBe('website')
    expect(getOverflowMenu(toolbar)).toBeNull()
    expect(toolbar.shadowRoot?.querySelector('[data-action="mobile-command"]')).not.toBeNull()

    ;(toolbar.shadowRoot?.querySelector('[data-action="mobile-command"]') as HTMLButtonElement | null)?.click()
    await toolbar.updateComplete
    await bar.updateComplete

    expect(bar.hasAttribute('open')).toBe(true)
  })

  it('updates and persists passwords sort grouping through the mobile chrome model', () => {
    setupStore()
    navigationModel.navigateToSurface('passwords')
    originalPassmanager = window.passmanager
    setPassmanagerContext(createRootLike())

    expect(pmMobileChromeModel.executeCommand('pm-sort-group')).toBe(true)
    expect(pmMobileChromeModel.sortGroupSheetOpen()).toBe(true)

    pmMobileChromeModel.setSortField('modified')
    pmMobileChromeModel.toggleSortDirection()
    pmMobileChromeModel.setGroupBy('security')

    expect(sortField()).toBe('modified')
    expect(sortDirection()).toBe('desc')
    expect(groupBy()).toBe('security')
    expect(localStorage.getItem('pm-sort-field')).toBe('modified')
    expect(localStorage.getItem('pm-sort-direction')).toBe('desc')
    expect(localStorage.getItem('pm-group-by')).toBe('security')

    pmMobileChromeModel.resetSortGrouping()

    expect(sortField()).toBe('name')
    expect(sortDirection()).toBe('asc')
    expect(groupBy()).toBe('none')
    expect(localStorage.getItem('pm-sort-field')).toBe('name')
    expect(localStorage.getItem('pm-sort-direction')).toBe('asc')
    expect(localStorage.getItem('pm-group-by')).toBe('none')
  })

  it('does not open from mobile trigger in none context', async () => {
    ensureDefined()
    setupStore()
    navigationModel.navigateToSurface('settings')
    originalPassmanager = window.passmanager

    const bar = document.createElement('command-bar') as CommandBar
    document.body.appendChild(bar)
    await bar.updateComplete

    openCommandPalette({mode: 'all', source: 'mobile-toolbar'})
    await bar.updateComplete

    expect(bar.hasAttribute('open')).toBe(false)
  })

  it('keeps passwords selection mode hidden from the mobile palette', async () => {
    ensureDefined()
    setupStore()
    navigationModel.navigateToSurface('passwords')
    originalPassmanager = window.passmanager

    const root = createRootLike()
    const group = createGroup('selection-context-group')
    const entry = createEntry(group, 'selection-context-entry', 'Selection Entry')
    setPassmanagerContext(root, [group, entry])
    pmSelectionModeModel.enterWithEntry(entry.id)

    const bar = document.createElement('command-bar') as CommandBar
    document.body.appendChild(bar)
    await bar.updateComplete

    openCommandPalette({mode: 'all', source: 'mobile-toolbar'})
    await bar.updateComplete

    expect(bar.hasAttribute('open')).toBe(false)
  })

  it('closes when navigation snapshot changes', async () => {
    ensureDefined()
    setupStore()

    const bar = document.createElement('command-bar') as CommandBar
    document.body.appendChild(bar)
    await bar.updateComplete

    openCommandPalette({mode: 'all', source: 'mobile-tab'})
    await bar.updateComplete
    expect(bar.hasAttribute('open')).toBe(true)

    navigationModel.navigateFilesPath('/archive')
    await flush()

    expect(bar.hasAttribute('open')).toBe(false)
  })

  it('closes when layout mode changes', async () => {
    ensureDefined()
    const store = setupStore()

    const bar = document.createElement('command-bar') as CommandBar
    document.body.appendChild(bar)
    await bar.updateComplete

    openCommandPalette({mode: 'all', source: 'mobile-tab'})
    await bar.updateComplete
    expect(bar.hasAttribute('open')).toBe(true)

    store.layoutMode.set('desktop')
    await flush()

    expect(bar.hasAttribute('open')).toBe(false)
  })
})
