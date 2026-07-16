import {afterEach, describe, expect, it, vi} from 'vitest'

import {WorkspaceDashboardHeader} from '../../src/features/file-manager/components/workspace-dashboard-header'
import {createDefaultWorkspaceDashboardHeaderFilters} from '../../src/features/file-manager/components/workspace-dashboard-header.model'
import {atom} from '@reatom/core'
import {
  MOBILE_FILE_PICKER_LIFECYCLE_END_EVENT,
  MOBILE_FILE_PICKER_LIFECYCLE_START_EVENT,
} from '@chromvoid/password-import'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import type {UploadTask} from '../../src/types/upload-task'

let dashboardHeaderDefined = false

function ensureWorkspaceDashboardHeaderDefined() {
  if (dashboardHeaderDefined) return
  WorkspaceDashboardHeader.define()
  dashboardHeaderDefined = true
}

function initHeaderContext(selectionEnabled = false, mode: 'mobile' | 'desktop' = 'mobile') {
  const layoutMode = atom<'mobile' | 'desktop'>(mode)
  const selectionMode = atom(selectionEnabled)
  const wsStatus = atom<'connected' | 'connecting' | 'disconnected' | 'error'>('connected')
  const catalogStatus = atom<'idle' | 'syncing' | 'loading' | 'error'>('idle')
  const uploadTasks = atom<UploadTask[]>([])

  initAppContext(
    createMockAppContext({
      store: {
        layoutMode,
        selectionMode,
        wsStatus,
        catalogStatus,
        uploadTasks,
      } as any,
    }),
  )
}

describe('WorkspaceDashboardHeader mobile action menu layout', () => {
  afterEach(() => {
    clearAppContext()
    document.querySelectorAll('workspace-dashboard-header').forEach((el) => el.remove())
  })

  it('renders the mobile vault header and duplicated toolbar action menu without selection actions', async () => {
    initHeaderContext(false)
    ensureWorkspaceDashboardHeaderDefined()
    const commandSpy = vi.fn()

    const header = document.createElement('workspace-dashboard-header') as WorkspaceDashboardHeader
    header.currentPath = '/'
    header.filters = createDefaultWorkspaceDashboardHeaderFilters()
    header.totalFiles = 10
    header.filteredFiles = 10
    header.selectedCount = 0
    header.quickFilterChips = [
      {key: 'all', label: 'All', active: true},
      {key: 'markdown', label: 'Notes', active: false},
      {key: 'images', label: 'Images', active: false},
    ]
    header.mobileViewMode = 'list'
    header.mobileToolbarActions = [
      {id: 'create-note', icon: 'book-plus', label: 'Create note'},
      {id: 'create-dir', icon: 'folder-plus', label: 'Create folder'},
      {id: 'upload', icon: 'upload', label: 'Upload files'},
    ]
    header.mobileSelectionActions = []
    header.addEventListener('mobile-command', commandSpy as EventListener)
    document.body.appendChild(header)
    await header.updateComplete

    const layout = header.shadowRoot?.querySelector('.workspace-mobile-shell')
    const mobileTitle = header.shadowRoot?.querySelector('.mobile-title')
    const mobileSubtitle = header.shadowRoot?.querySelector('.mobile-subtitle')
    const breadcrumbs = header.shadowRoot?.querySelector('breadcrumbs-nav')
    const actionMenu = header.shadowRoot?.querySelector('cv-menu-button.mobile-action-menu')
    const selectionToolbar = header.shadowRoot?.querySelector('.mobile-selection-bar')
    const controls = header.shadowRoot?.querySelector('.workspace-controls')
    const search = header.shadowRoot?.querySelector('cv-input.workspace-search')
    const createButton = header.shadowRoot?.querySelector('[data-action="create-dir"]')
    const desktopUploadButton = header.shadowRoot?.querySelector('[data-action="upload"]')
    const chipGroup = header.shadowRoot?.querySelector('cv-chip-group.workspace-filter-chips')
    const chips = Array.from(header.shadowRoot?.querySelectorAll('cv-chip.workspace-filter-chip') ?? [])
      .map((el) => el.getAttribute('value'))
    const chipCounts = header.shadowRoot?.querySelectorAll('.workspace-filter-chip__count')
    const sortControl = header.shadowRoot?.querySelector('cv-button.workspace-sort-control')
    const viewToggle = header.shadowRoot?.querySelector('cv-radio-group.workspace-view-switch')
    const viewModes = Array.from(header.shadowRoot?.querySelectorAll('cv-radio.workspace-view-button') ?? [])
      .map((el) => el.getAttribute('value'))

    expect(layout).not.toBeNull()
    expect(controls).not.toBeNull()
    expect(mobileTitle).toBeNull()
    expect(mobileSubtitle).toBeNull()
    expect(breadcrumbs).toBeNull()
    expect(selectionToolbar).toBeNull()
    expect(actionMenu).not.toBeNull()
    expect(search).not.toBeNull()
    expect(search?.classList.contains('search-box')).toBe(true)
    expect(chipGroup).not.toBeNull()
    expect(chipGroup?.classList.contains('filter-chips')).toBe(true)
    expect(chips).toEqual(['all', 'markdown', 'images'])
    expect(chipCounts?.length).toBe(0)
    expect(sortControl).not.toBeNull()
    expect(sortControl?.classList.contains('sort-control')).toBe(true)
    expect(viewToggle).not.toBeNull()
    expect(viewToggle?.classList.contains('view-switch')).toBe(true)
    expect(viewModes).toEqual(['list', 'grid'])
    expect(
      Array.from(actionMenu?.querySelectorAll('cv-menu-item') ?? []).map((item) =>
        item.getAttribute('value'),
      ),
    ).toEqual(['create-note', 'create-dir', 'upload'])
    expect(createButton).toBeNull()
    expect(desktopUploadButton).toBeNull()

    actionMenu?.dispatchEvent(
      new CustomEvent('cv-input', {
        detail: {value: 'create-dir', open: false},
        bubbles: true,
        composed: true,
      }),
    )

    expect(commandSpy).toHaveBeenCalledTimes(1)
    expect((commandSpy.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({actionId: 'create-dir'})
  })

  it('renders a bottom selection bar instead of the FAB in mobile selection mode', async () => {
    initHeaderContext(true)
    ensureWorkspaceDashboardHeaderDefined()

    const header = document.createElement('workspace-dashboard-header') as WorkspaceDashboardHeader
    header.currentPath = '/'
    header.filters = createDefaultWorkspaceDashboardHeaderFilters()
    header.totalFiles = 10
    header.filteredFiles = 10
    header.selectedCount = 1
    header.quickFilterChips = [
      {key: 'all', label: 'All', active: true},
      {key: 'markdown', label: 'Notes', active: false},
      {key: 'images', label: 'Images', active: false},
    ]
    header.mobileViewMode = 'list'
    header.mobileToolbarActions = [
      {id: 'create-note', icon: 'book-plus', label: 'Create note'},
      {id: 'create-dir', icon: 'folder-plus', label: 'Create folder'},
      {id: 'upload', icon: 'upload', label: 'Upload files'},
    ]
    header.mobileSelectionActions = [
      {id: 'share-selected', icon: 'share-2', label: 'Share', disabled: true},
      {id: 'move-selected', icon: 'folder-symlink', label: 'Move'},
      {id: 'delete-selected', icon: 'trash-2', label: 'Delete'},
      {id: 'selection-done', icon: 'x', label: 'Clear'},
    ]
    document.body.appendChild(header)
    await header.updateComplete

    const layout = header.shadowRoot?.querySelector('.workspace-mobile-shell')
    const breadcrumbs = header.shadowRoot?.querySelector('breadcrumbs-nav')
    const actionMenu = header.shadowRoot?.querySelector('cv-menu-button.mobile-action-menu')
    const selectionToolbar = header.shadowRoot?.querySelector('.mobile-selection-bar')
    const mobileActions = Array.from(
      header.shadowRoot?.querySelectorAll('.mobile-selection-action[data-action]') ?? [],
    ).map((el) => el.getAttribute('data-action'))

    expect(layout).not.toBeNull()
    expect(breadcrumbs).toBeNull()
    expect(actionMenu).toBeNull()
    expect(selectionToolbar).not.toBeNull()
    expect(mobileActions).toEqual(['share-selected', 'move-selected', 'delete-selected', 'selection-done'])
  })

  it('delegates mobile search, chip, sort, and view controls to filter actions', async () => {
    initHeaderContext(false)
    ensureWorkspaceDashboardHeaderDefined()
    const patchFilters = vi.fn()
    const setMobileQuickFilter = vi.fn()
    const cycleMobileSort = vi.fn()
    const setMobileViewMode = vi.fn()

    const header = document.createElement('workspace-dashboard-header') as WorkspaceDashboardHeader
    header.currentPath = '/'
    header.filters = createDefaultWorkspaceDashboardHeaderFilters()
    header.totalFiles = 10
    header.filteredFiles = 10
    header.selectedCount = 0
    header.quickFilterChips = [
      {key: 'all', label: 'All', active: true},
      {key: 'markdown', label: 'Notes', active: false},
      {key: 'images', label: 'Images', active: false},
    ]
    header.mobileViewMode = 'list'
    header.mobileSelectionActions = []
    header.filterActions = {
      setFilters: vi.fn(),
      patchFilters,
      reset: vi.fn(),
      clearQuery: vi.fn(),
      hideHiddenFiles: vi.fn(),
      toggleShowHidden: vi.fn(),
      toggleSortDirection: vi.fn(),
      setSortBy: vi.fn(),
      applyTableSort: vi.fn(),
      cycleViewMode: vi.fn(),
      setViewMode: vi.fn(),
      setMobileViewMode,
      setMobileQuickFilter,
      cycleMobileSort,
      removeFileType: vi.fn(),
      toggleFileType: vi.fn(),
    }
    document.body.appendChild(header)
    await header.updateComplete

    header.shadowRoot?.querySelector('cv-input.workspace-search')?.dispatchEvent(
      new CustomEvent('cv-input', {detail: {value: 'daily'}, bubbles: true, composed: true}),
    )
    const chipGroup = header.shadowRoot?.querySelector('cv-chip-group.workspace-filter-chips') as
      | (HTMLElement & {value?: string})
      | null
    expect(chipGroup?.getAttribute('selection-mode')).toBe('multiple')
    expect(chipGroup?.value).toBe('all')

    chipGroup?.dispatchEvent(
      new CustomEvent('cv-input', {
        detail: {value: ['all', 'markdown'], changedValue: 'markdown', selected: true},
        bubbles: true,
        composed: true,
      }),
    )
    header.shadowRoot?.querySelector<HTMLElement>('.workspace-sort-control')?.click()
    header.shadowRoot?.querySelector('cv-radio-group.workspace-view-switch')?.dispatchEvent(
      new CustomEvent('cv-input', {detail: {value: 'grid'}, bubbles: true, composed: true}),
    )

    expect(patchFilters).toHaveBeenCalledWith({query: 'daily'})
    expect(setMobileQuickFilter).toHaveBeenCalledWith('markdown')
    expect(cycleMobileSort).toHaveBeenCalledTimes(1)
    expect(setMobileViewMode).toHaveBeenCalledWith('grid')
  })

  it('serializes multiple active mobile quick filters and delegates the changed chip', async () => {
    initHeaderContext(false)
    ensureWorkspaceDashboardHeaderDefined()
    const setMobileQuickFilter = vi.fn()

    const header = document.createElement('workspace-dashboard-header') as WorkspaceDashboardHeader
    header.currentPath = '/'
    header.filters = {
      ...createDefaultWorkspaceDashboardHeaderFilters(),
      fileTypes: ['markdown', 'images'],
    }
    header.totalFiles = 10
    header.filteredFiles = 5
    header.selectedCount = 0
    header.quickFilterChips = [
      {key: 'all', label: 'All', active: false},
      {key: 'markdown', label: 'Notes', active: true},
      {key: 'images', label: 'Images', active: true},
    ]
    header.mobileViewMode = 'list'
    header.mobileSelectionActions = []
    header.filterActions = {
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
      setMobileViewMode: vi.fn(),
      setMobileQuickFilter,
      cycleMobileSort: vi.fn(),
      removeFileType: vi.fn(),
      toggleFileType: vi.fn(),
    }
    document.body.appendChild(header)
    await header.updateComplete

    const chipGroup = header.shadowRoot?.querySelector('cv-chip-group.workspace-filter-chips') as
      | (HTMLElement & {value?: string})
      | null
    expect(chipGroup?.getAttribute('selection-mode')).toBe('multiple')
    expect(chipGroup?.value).toBe('markdown images')

    chipGroup?.dispatchEvent(
      new CustomEvent('cv-input', {
        detail: {value: ['markdown'], changedValue: 'images', selected: false},
        bubbles: true,
        composed: true,
      }),
    )

    expect(setMobileQuickFilter).toHaveBeenCalledWith('images')
  })

  it('delegates bottom selection actions through the mobile command event', async () => {
    initHeaderContext(true)
    ensureWorkspaceDashboardHeaderDefined()
    const commandSpy = vi.fn()

    const header = document.createElement('workspace-dashboard-header') as WorkspaceDashboardHeader
    header.currentPath = '/'
    header.filters = createDefaultWorkspaceDashboardHeaderFilters()
    header.totalFiles = 10
    header.filteredFiles = 10
    header.selectedCount = 1
    header.quickFilterChips = []
    header.mobileViewMode = 'list'
    header.mobileSelectionActions = [
      {id: 'share-selected', icon: 'share-2', label: 'Share', disabled: true},
      {id: 'move-selected', icon: 'folder-symlink', label: 'Move'},
      {id: 'delete-selected', icon: 'trash-2', label: 'Delete'},
      {id: 'selection-done', icon: 'x', label: 'Clear'},
    ]
    header.addEventListener('mobile-command', commandSpy as EventListener)
    document.body.appendChild(header)
    await header.updateComplete

    header.shadowRoot?.querySelector<HTMLElement>('[data-action="move-selected"]')?.click()

    expect(commandSpy).toHaveBeenCalledTimes(1)
    expect((commandSpy.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({actionId: 'move-selected'})
  })

  it('wraps standard upload file input in a mobile file-picker lifecycle session', async () => {
    initHeaderContext(false, 'desktop')
    ensureWorkspaceDashboardHeaderDefined()
    const start = vi.fn()
    const end = vi.fn()
    window.addEventListener(MOBILE_FILE_PICKER_LIFECYCLE_START_EVENT, start)
    window.addEventListener(MOBILE_FILE_PICKER_LIFECYCLE_END_EVENT, end)

    const header = document.createElement('workspace-dashboard-header') as WorkspaceDashboardHeader
    header.currentPath = '/'
    header.filters = createDefaultWorkspaceDashboardHeaderFilters()
    header.totalFiles = 10
    header.filteredFiles = 10
    header.selectedCount = 0
    document.body.appendChild(header)
    await header.updateComplete

    header.shadowRoot?.querySelector<HTMLElement>('[data-action="upload"]')?.click()
    window.dispatchEvent(new Event('focus'))

    expect(start).toHaveBeenCalledTimes(1)
    expect(end).toHaveBeenCalledTimes(1)

    window.removeEventListener(MOBILE_FILE_PICKER_LIFECYCLE_START_EVENT, start)
    window.removeEventListener(MOBILE_FILE_PICKER_LIFECYCLE_END_EVENT, end)
  })
})
