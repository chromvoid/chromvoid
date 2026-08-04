import {atom} from '@reatom/core'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {WorkspaceDashboardHeader} from '../../src/features/file-manager/components/workspace-dashboard-header'
import {createDefaultWorkspaceDashboardHeaderFilters} from '../../src/features/file-manager/components/workspace-dashboard-header.model'
import type {FileSearchFilterActions} from '../../src/features/file-manager/models/file-search-filters.model'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import type {UploadTask} from '../../src/types/upload-task'

let dashboardHeaderDefined = false

function ensureWorkspaceDashboardHeaderDefined() {
  if (dashboardHeaderDefined) return
  WorkspaceDashboardHeader.define()
  dashboardHeaderDefined = true
}

function initDesktopHeaderContext(selectionMode = atom(false)) {
  initAppContext(
    createMockAppContext({
      store: {
        layoutMode: atom<'mobile' | 'desktop'>('desktop'),
        selectionMode,
        wsStatus: atom<'connected' | 'connecting' | 'disconnected' | 'error'>('connected'),
        catalogStatus: atom<'idle' | 'syncing' | 'loading' | 'error'>('idle'),
        uploadTasks: atom<UploadTask[]>([]),
      } as any,
    }),
  )
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
    setMobileViewMode: vi.fn(),
    setMobileQuickFilter: vi.fn(),
    cycleMobileSort: vi.fn(),
    removeFileType: vi.fn(),
    toggleFileType: vi.fn(),
    ...overrides,
  }
}

async function renderDesktopHeader(selectionMode = atom(false), filterActions: FileSearchFilterActions | null = null) {
  initDesktopHeaderContext(selectionMode)
  ensureWorkspaceDashboardHeaderDefined()

  const header = document.createElement('workspace-dashboard-header') as WorkspaceDashboardHeader
  header.currentPath = '/Documents'
  header.filters = createDefaultWorkspaceDashboardHeaderFilters()
  header.totalFiles = 10
  header.filteredFiles = 8
  header.selectedCount = 0
  header.canDownloadSelection = false
  header.filterActions = filterActions
  document.body.appendChild(header)
  await header.updateComplete
  await Promise.resolve()
  await header.updateComplete
  return header
}

describe('WorkspaceDashboardHeader desktop shell toolbar', () => {
  afterEach(() => {
    clearAppContext()
    document.querySelectorAll('workspace-dashboard-header').forEach((el) => el.remove())
  })

  it('renders desktop dashboard content through the shared dashboard header slots', async () => {
    const header = await renderDesktopHeader()

    const toolbar = header.shadowRoot?.querySelector('dashboard-header')
    const center = toolbar?.querySelector('[slot="center"]')
    const removedWrapperSelector = ['workspace-dashboard-header', 'desktop-layout'].join('-')

    expect(toolbar).not.toBeNull()
    expect(toolbar?.hasAttribute('two-row')).toBe(false)
    expect(header.shadowRoot?.querySelector(removedWrapperSelector)).toBeNull()
    expect(center?.classList.contains('files-toolbar-row')).toBe(true)
    expect(center?.querySelector('breadcrumbs-nav')).not.toBeNull()
    expect(center?.querySelector('file-search')).not.toBeNull()
    expect(center?.querySelector('[data-view-mode]')).not.toBeNull()
    expect(center?.querySelector('.sort-toggle')).not.toBeNull()
    expect(center?.querySelector('.selection-mode-toggle')).not.toBeNull()
    expect(center?.querySelector('[data-action="create-dir"]')).not.toBeNull()
    expect(center?.querySelector('[data-action="create-note"]')).not.toBeNull()
    expect(center?.querySelector('[data-action="upload"]')).not.toBeNull()
  })

  it('renders generic workspace slots without file controls for non-Files surfaces', async () => {
    initDesktopHeaderContext()
    ensureWorkspaceDashboardHeaderDefined()

    const header = document.createElement('workspace-dashboard-header') as WorkspaceDashboardHeader
    header.surface = 'passwords'

    const title = document.createElement('span')
    title.slot = 'title'
    title.textContent = 'Notes'

    const subtitle = document.createElement('span')
    subtitle.slot = 'subtitle'
    subtitle.textContent = 'Quick notes'

    const center = document.createElement('div')
    center.slot = 'center'
    center.textContent = 'Controls'

    header.append(title, subtitle, center)
    document.body.appendChild(header)
    await header.updateComplete
    await Promise.resolve()
    await header.updateComplete

    const toolbar = header.shadowRoot?.querySelector('dashboard-header')
    const titleSlot = toolbar
      ?.querySelector('[slot="title"][data-slot-forwarder]')
      ?.querySelector<HTMLSlotElement>('slot[name="title"]')
    const subtitleSlot = toolbar
      ?.querySelector('[slot="subtitle"][data-slot-forwarder]')
      ?.querySelector<HTMLSlotElement>('slot[name="subtitle"]')
    const centerSlot = toolbar
      ?.querySelector('[slot="center"][data-slot-forwarder]')
      ?.querySelector<HTMLSlotElement>('slot[name="center"]')

    expect(toolbar).not.toBeNull()
    expect(toolbar?.getAttribute('surface')).toBe('passwords')
    expect(toolbar?.hasAttribute('two-row')).toBe(false)
    expect(titleSlot?.assignedElements()).toContain(title)
    expect(subtitleSlot?.assignedElements()).toContain(subtitle)
    expect(centerSlot?.assignedElements()).toContain(center)
    expect(header.shadowRoot?.querySelector('#file-input')).toBeNull()
    expect(header.shadowRoot?.querySelector('breadcrumbs-nav')).toBeNull()
    expect(header.shadowRoot?.querySelector('file-search')).toBeNull()
    expect(header.shadowRoot?.querySelector('[data-action="create-dir"]')).toBeNull()
  })

  it('renders the external Notes controls in one dedicated toolbar and preserves their action contracts', async () => {
    initDesktopHeaderContext()
    ensureWorkspaceDashboardHeaderDefined()

    const header = document.createElement('workspace-dashboard-header') as WorkspaceDashboardHeader
    const setSearchValue = vi.fn()
    const clearSearch = vi.fn()
    const setFilterValue = vi.fn()
    const activateSort = vi.fn()
    const setViewMode = vi.fn()
    const onCreateNote = vi.fn()
    header.surface = 'notes'
    header.controlsModel = {
      search: {
        value: () => '',
        placeholder: () => 'Search notes',
        ariaLabel: () => 'Search notes',
        setValue: setSearchValue,
        clear: clearSearch,
      },
      filters: {
        chips: () => [
          {key: 'all', label: 'All', count: 2, active: true},
          {key: 'dir:/Docs', label: 'Docs', count: 1, active: false},
        ],
        value: () => 'all',
        ariaLabel: () => 'Note filters',
        setValue: setFilterValue,
      },
      summary: {
        label: () => '2 notes',
      },
      sort: {
        label: () => 'Name',
        ariaLabel: () => 'Sort notes',
        title: () => 'Sort notes',
        mode: () => 'name',
        activate: activateSort,
      },
      viewMode: {
        value: () => 'list',
        ariaLabel: () => 'Notes view',
        options: () => [
          {value: 'list', icon: 'list', label: 'List'},
          {value: 'grid', icon: 'layout-grid', label: 'Grid'},
        ],
        setValue: setViewMode,
      },
    }
    header.addEventListener('create-note', onCreateNote)

    const title = document.createElement('span')
    title.slot = 'title'
    title.textContent = 'Notes'

    const subtitle = document.createElement('span')
    subtitle.slot = 'subtitle'
    subtitle.textContent = 'Quick notes'

    header.append(title, subtitle)
    document.body.appendChild(header)
    await header.updateComplete
    await Promise.resolve()
    await header.updateComplete

    const toolbar = header.shadowRoot?.querySelector('dashboard-header')
    const row = toolbar?.querySelector<HTMLElement>('[slot="center"].notes-toolbar-row')
    const search = row?.querySelector('cv-input.workspace-search')
    const chips = row?.querySelector('cv-chip-group.workspace-filter-chips')
    const sort = row?.querySelector<HTMLElement>('cv-button.workspace-sort-control')
    const view = row?.querySelector('cv-radio-group.workspace-view-switch')
    const create = row?.querySelector<HTMLElement>('cv-button.notes-create-action')
    const orderedControls = Array.from(
      row?.querySelectorAll(
        'cv-input.workspace-search, cv-chip-group.workspace-filter-chips, cv-button.workspace-sort-control, cv-radio-group.workspace-view-switch, cv-button.notes-create-action',
      ) ?? [],
    )
    const titleSlot = row
      ?.querySelector('.notes-toolbar-title')
      ?.querySelector<HTMLSlotElement>('slot[name="title"]')
    const subtitleSlot = row
      ?.querySelector('.notes-toolbar-subtitle')
      ?.querySelector<HTMLSlotElement>('slot[name="subtitle"]')

    expect(toolbar?.getAttribute('surface')).toBe('notes')
    expect(toolbar?.hasAttribute('two-row')).toBe(false)
    expect(titleSlot?.assignedElements()).toContain(title)
    expect(subtitleSlot?.assignedElements()).toContain(subtitle)
    expect(orderedControls).toEqual([search, chips, sort, view, create])
    expect(header.shadowRoot?.querySelector('.workspace-count-row')).toBeNull()
    expect(header.shadowRoot?.querySelector('.workspace-summary')).toBeNull()
    expect(create?.getAttribute('variant')).toBe('primary')
    expect(create?.getAttribute('aria-label')).toBe('Create note')
    expect(create?.getAttribute('title')).toBe('Create note')
    expect(create?.querySelector('cv-icon')?.getAttribute('name')).toBe('book-plus')

    search?.dispatchEvent(
      new CustomEvent('cv-input', {detail: {value: 'roadmap'}, bubbles: true, composed: true}),
    )
    search?.dispatchEvent(new CustomEvent('cv-clear', {detail: {}, bubbles: true, composed: true}))
    chips?.dispatchEvent(
      new CustomEvent('cv-input', {
        detail: {value: 'dir:/Docs', changedValue: 'dir:/Docs', selected: true, source: 'click'},
        bubbles: true,
        composed: true,
      }),
    )
    sort?.click()
    view?.dispatchEvent(
      new CustomEvent('cv-input', {detail: {value: 'grid'}, bubbles: true, composed: true}),
    )
    create?.click()

    expect(setSearchValue).toHaveBeenCalledWith('roadmap')
    expect(clearSearch).toHaveBeenCalledTimes(1)
    expect(setFilterValue).toHaveBeenCalledWith(
      'dir:/Docs',
      expect.objectContaining({changedValue: 'dir:/Docs', value: 'dir:/Docs'}),
    )
    expect(activateSort).toHaveBeenCalledTimes(1)
    expect(setViewMode).toHaveBeenCalledWith('grid')
    expect(onCreateNote).toHaveBeenCalledTimes(1)
  })

  it('renders generic workspace controls from a controls model and invokes model methods', async () => {
    initDesktopHeaderContext()
    ensureWorkspaceDashboardHeaderDefined()

    const header = document.createElement('workspace-dashboard-header') as WorkspaceDashboardHeader
    const setSearchValue = vi.fn()
    const clearSearch = vi.fn()
    const setFilterValue = vi.fn()
    const activateFilterLeadingAction = vi.fn()
    const activateSort = vi.fn()
    const setViewMode = vi.fn()
    header.surface = 'passwords'
    header.controlsModel = {
      search: {
        value: () => '',
        placeholder: () => 'Search',
        ariaLabel: () => 'Search notes',
        setValue: setSearchValue,
        clear: clearSearch,
      },
      filters: {
        chips: () => [
          {key: 'all', label: 'All', count: 2, active: true},
          {key: 'dir:/Docs', label: 'Docs', count: 1, active: false},
        ],
        value: () => 'all',
        ariaLabel: () => 'Filters',
        leadingAction: {
          id: 'manage-filters',
          icon: 'sliders',
          label: () => 'Manage',
          ariaLabel: () => 'Manage filters',
          activate: activateFilterLeadingAction,
        },
        setValue: setFilterValue,
      },
      summary: {
        label: () => '2 notes',
      },
      sort: {
        label: () => 'Name',
        ariaLabel: () => 'Sort',
        mode: () => 'name',
        activate: activateSort,
      },
      viewMode: {
        value: () => 'list',
        ariaLabel: () => 'View mode',
        options: () => [
          {value: 'list', icon: 'list', label: 'List'},
          {value: 'grid', icon: 'layout-grid', label: 'Grid'},
        ],
        setValue: setViewMode,
      },
    }

    document.body.appendChild(header)
    await header.updateComplete
    const dashboard = header.shadowRoot?.querySelector('dashboard-header') as
      | (HTMLElement & {updateComplete?: Promise<unknown>; shadowRoot: ShadowRoot | null})
      | null
    await dashboard?.updateComplete
    const shell = dashboard?.shadowRoot?.querySelector('desktop-shell-toolbar') as
      | (HTMLElement & {updateComplete?: Promise<unknown>; shadowRoot: ShadowRoot | null})
      | null
    await shell?.updateComplete

    const search = header.shadowRoot?.querySelector('cv-input.search-box') as
      | (HTMLElement & {value: string})
      | null
    search?.dispatchEvent(
      new CustomEvent('cv-input', {detail: {value: 'roadmap'}, bubbles: true, composed: true}),
    )
    search?.dispatchEvent(new CustomEvent('cv-clear', {detail: {}, bubbles: true, composed: true}))
    header.shadowRoot?.querySelector('cv-chip-group.filter-chips')?.dispatchEvent(
      new CustomEvent('cv-input', {
        detail: {value: 'dir:/Docs', changedValue: 'dir:/Docs', selected: true, source: 'click'},
        bubbles: true,
        composed: true,
      }),
    )
    header.shadowRoot?.querySelector<HTMLElement>('.sort-control')?.click()
    header.shadowRoot?.querySelector('cv-radio-group.view-switch')?.dispatchEvent(
      new CustomEvent('cv-input', {detail: {value: 'grid'}, bubbles: true, composed: true}),
    )
    header.shadowRoot?.querySelector<HTMLElement>('[data-filter-action="manage-filters"]')?.click()

    const filterLeadingAction = header.shadowRoot?.querySelector<HTMLElement>('[data-filter-action="manage-filters"]')
    const filterChipGroup = header.shadowRoot?.querySelector('cv-chip-group.filter-chips')
    expect(header.shadowRoot?.querySelector('.workspace-controls')).not.toBeNull()
    expect(shell?.shadowRoot?.querySelector('.center')?.hasAttribute('hidden')).toBe(false)
    expect(header.shadowRoot?.querySelector('.workspace-summary')?.textContent).toBe('2 notes')
    expect(header.shadowRoot?.querySelectorAll('.workspace-filter-chip')).toHaveLength(2)
    expect(filterLeadingAction?.nextElementSibling).toBe(filterChipGroup)
    expect(filterLeadingAction?.textContent?.trim()).toBe('Manage')
    expect(filterLeadingAction?.getAttribute('aria-label')).toBe('Manage filters')
    expect(filterLeadingAction?.querySelector('cv-icon')?.getAttribute('slot')).toBe('prefix')
    expect(header.shadowRoot?.querySelector('cv-chip-group.filter-chips')?.getAttribute('selection-mode')).toBe(
      'single',
    )
    expect(header.shadowRoot?.querySelectorAll('.workspace-view-button')).toHaveLength(2)
    expect(setSearchValue).toHaveBeenCalledWith('roadmap')
    expect(clearSearch).toHaveBeenCalledTimes(1)
    expect(setFilterValue).toHaveBeenCalledWith(
      'dir:/Docs',
      expect.objectContaining({changedValue: 'dir:/Docs', value: 'dir:/Docs'}),
    )
    expect(activateFilterLeadingAction).toHaveBeenCalledTimes(1)
    expect(activateSort).toHaveBeenCalledTimes(1)
    expect(setViewMode).toHaveBeenCalledWith('grid')
  })

  it('forwards multiple chip selection details through the generic filter model', async () => {
    initDesktopHeaderContext()
    ensureWorkspaceDashboardHeaderDefined()

    const header = document.createElement('workspace-dashboard-header') as WorkspaceDashboardHeader
    const setFilterValue = vi.fn()
    header.surface = 'passwords'
    header.controlsModel = {
      filters: {
        chips: () => [
          {key: '__all-tags', label: 'All', active: false},
          {key: 'work', label: 'Work', count: 2, active: true},
          {key: 'ssh', label: 'SSH', count: 1, active: true},
        ],
        value: () => 'work ssh',
        selectionMode: () => 'multiple',
        ariaLabel: () => 'Tags',
        setValue: setFilterValue,
      },
    }

    document.body.appendChild(header)
    await header.updateComplete

    const chipGroup = header.shadowRoot?.querySelector('cv-chip-group.workspace-filter-chips')
    chipGroup?.dispatchEvent(
      new CustomEvent('cv-input', {
        detail: {value: ['work', 'ssh'], changedValue: 'ssh', selected: true, source: 'click'},
        bubbles: true,
        composed: true,
      }),
    )

    expect(chipGroup?.getAttribute('selection-mode')).toBe('multiple')
    expect(setFilterValue).toHaveBeenCalledWith(
      'work ssh',
      expect.objectContaining({changedValue: 'ssh', value: ['work', 'ssh']}),
    )
  })

  it('renders compact summary items when a controls model provides them', async () => {
    initDesktopHeaderContext()
    ensureWorkspaceDashboardHeaderDefined()

    const header = document.createElement('workspace-dashboard-header') as WorkspaceDashboardHeader
    header.surface = 'passwords'
    header.controlsModel = {
      summary: {
        label: () => '1 group · 2 entries',
        items: () => [
          {id: 'groups', icon: 'folder', label: 'Groups', value: 1},
          {id: 'entries', icon: 'key', label: 'Entries', value: 2},
        ],
      },
    }

    document.body.appendChild(header)
    await header.updateComplete

    const summary = header.shadowRoot?.querySelector('.workspace-summary')
    const items = Array.from(header.shadowRoot?.querySelectorAll<HTMLElement>('.workspace-summary__item') ?? [])

    expect(summary?.getAttribute('aria-label')).toBe('1 group · 2 entries')
    expect(items.map((item) => item.dataset['summaryId'])).toEqual(['groups', 'entries'])
    expect(items.map((item) => item.querySelector('cv-icon')?.getAttribute('name'))).toEqual(['folder', 'key'])
    expect(items.map((item) => item.querySelector('.workspace-summary__value')?.textContent)).toEqual(['1', '2'])
  })

  it('renders slotted count actions and exposes search focus and clear methods', async () => {
    initDesktopHeaderContext()
    ensureWorkspaceDashboardHeaderDefined()

    const header = document.createElement('workspace-dashboard-header') as WorkspaceDashboardHeader
    const clearSearch = vi.fn()
    header.surface = 'notes'
    header.embedded = true
    header.controlsModel = {
      search: {
        value: () => 'vpn',
        placeholder: () => 'Search',
        ariaLabel: () => 'Search notes',
        setValue: vi.fn(),
        clear: clearSearch,
      },
      summary: {
        label: () => '2 notes',
      },
    }

    const countAction = document.createElement('button')
    countAction.slot = 'count-actions'
    countAction.className = 'workspace-count-action'
    countAction.textContent = 'Sort'
    header.append(countAction)

    document.body.appendChild(header)
    await header.updateComplete
    await Promise.resolve()
    await header.updateComplete

    const slot = header.shadowRoot?.querySelector<HTMLSlotElement>('slot[name="count-actions"]')
    const search = header.shadowRoot?.querySelector('cv-input.search-box') as
      | (HTMLElement & {focus: () => void})
      | null
    expect(search).not.toBeNull()
    const focusSearch = vi.spyOn(search!, 'focus')

    expect(header.shadowRoot?.querySelector('dashboard-header')).toBeNull()
    expect(header.shadowRoot?.querySelector('.notes-toolbar-row')).toBeNull()
    expect(header.shadowRoot?.querySelector('[data-action="create-note"]')).toBeNull()
    expect(header.shadowRoot?.querySelector('.workspace-controls')).not.toBeNull()
    expect(header.shadowRoot?.querySelector('.workspace-summary')?.textContent).toBe('2 notes')
    expect(header.shadowRoot?.querySelector('.workspace-count-actions')).not.toBeNull()
    expect(slot?.assignedElements()).toContain(countAction)

    header.focusInput()
    header.clear()

    expect(focusSearch).toHaveBeenCalledTimes(1)
    expect(clearSearch).toHaveBeenCalledTimes(1)
  })

  it('keeps desktop view mode controls in the compact toolbar row', async () => {
    const setViewMode = vi.fn()
    const header = await renderDesktopHeader(atom(false), createFilterActions({setViewMode}))

    const toolbar = header.shadowRoot?.querySelector('dashboard-header')
    const center = toolbar?.querySelector('[slot="center"]')
    const controls = [...(center?.querySelectorAll<HTMLElement>('[data-view-mode]') ?? [])]
    const icons = controls.map((control) => control.querySelector('[data-file-view-icon]'))

    expect(controls.map((control) => control.dataset['viewMode'])).toEqual(['list', 'grid', 'table'])
    expect(icons.map((icon) => icon?.getAttribute('data-file-view-icon'))).toEqual(['list', 'grid', 'table'])
    expect(controls.every((control) => control.querySelector('cv-icon') === null)).toBe(true)
    expect(controls[0]?.getAttribute('aria-pressed')).toBe('true')
    expect(controls[1]?.getAttribute('aria-label')).toBeTruthy()

    controls.find((control) => control.dataset['viewMode'] === 'table')?.click()

    expect(setViewMode).toHaveBeenCalledTimes(1)
    expect(setViewMode).toHaveBeenCalledWith('table')
  })

  it('keeps desktop create action event contract through the shell toolbar', async () => {
    const header = await renderDesktopHeader()
    const onCreateDir = vi.fn()
    header.addEventListener('create-dir', onCreateDir)

    header.shadowRoot?.querySelector<HTMLElement>('[data-action="create-dir"]')?.click()

    expect(onCreateDir).toHaveBeenCalledTimes(1)
  })

  it('exposes the desktop New Note action through the header event contract', async () => {
    const header = await renderDesktopHeader()
    const onCreateNote = vi.fn()
    header.addEventListener('create-note', onCreateNote)

    const action = header.shadowRoot?.querySelector<HTMLElement>('[data-action="create-note"]')
    expect(action?.textContent?.trim()).toBe('Note')
    expect(action?.querySelector('cv-icon')?.getAttribute('name')).toBe('file-plus')

    action?.click()

    expect(onCreateNote).toHaveBeenCalledTimes(1)
  })

  it('keeps desktop sort control near selection actions', async () => {
    const toggleSortDirection = vi.fn()
    const header = await renderDesktopHeader(atom(false), createFilterActions({toggleSortDirection}))

    const toolbar = header.shadowRoot?.querySelector('dashboard-header')
    const center = toolbar?.querySelector('[slot="center"]')
    const sortToggle = center?.querySelector<HTMLElement>('.sort-toggle')

    expect(sortToggle).not.toBeNull()
    expect(sortToggle?.textContent).toContain('Asc')
    expect(sortToggle?.getAttribute('aria-label')).toBe('Sort: Name ↑')
    expect(sortToggle?.querySelector('cv-icon')?.getAttribute('name')).toBe('arrow-up')

    sortToggle?.click()

    expect(toggleSortDirection).toHaveBeenCalledTimes(1)
  })

  it('keeps selection mode toggle in the compact desktop toolbar', async () => {
    const selectionMode = atom(false)
    const header = await renderDesktopHeader(selectionMode)
    const onSelectionModeRequested = vi.fn()
    header.addEventListener('selection-mode-requested', onSelectionModeRequested)

    const toolbar = header.shadowRoot?.querySelector('dashboard-header')
    const center = toolbar?.querySelector('[slot="center"]')
    const toggle = center?.querySelector<HTMLElement>('.selection-mode-toggle')

    expect(toggle).not.toBeNull()
    expect(toggle?.getAttribute('pressed')).toBeNull()
    expect(toggle?.querySelector('cv-icon')?.getAttribute('name')).toBe('square-check-big')
    expect(toggle?.textContent?.trim()).toBe('')

    toggle?.click()

    expect(onSelectionModeRequested).toHaveBeenCalledTimes(1)
    expect(onSelectionModeRequested.mock.calls[0]?.[0].detail).toEqual({enabled: true})

    selectionMode.set(true)
    await header.updateComplete

    expect(toggle?.getAttribute('pressed')).toBe('')
  })

  it('renders contextual selection actions and preserves their event contracts', async () => {
    const header = await renderDesktopHeader()
    const listeners = {
      move: vi.fn(),
      download: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
    }
    header.addEventListener('move-selected', listeners.move)
    header.addEventListener('download-selected', listeners.download)
    header.addEventListener('delete-selected', listeners.delete)
    header.addEventListener('clear-selection', listeners.clear)
    header.selectedCount = 3
    header.canDownloadSelection = true
    await header.updateComplete
    await Promise.resolve()
    await header.updateComplete

    const strip = header.shadowRoot?.querySelector('.files-context-strip')
    expect(strip?.getAttribute('role')).toBe('group')
    expect(strip?.textContent).toContain('Selected: 3')

    strip?.querySelector<HTMLElement>('[data-action="move-selected"]')?.click()
    strip?.querySelector<HTMLElement>('[data-action="download-selected"]')?.click()
    strip?.querySelector<HTMLElement>('[data-action="delete-selected"]')?.click()
    strip?.querySelector<HTMLElement>('[data-action="clear-selection"]')?.click()

    expect(listeners.move).toHaveBeenCalledTimes(1)
    expect(listeners.download).toHaveBeenCalledTimes(1)
    expect(listeners.delete).toHaveBeenCalledTimes(1)
    expect(listeners.clear).toHaveBeenCalledTimes(1)
  })

  it('disables Download for a directory-only selection', async () => {
    const header = await renderDesktopHeader()
    const onDownload = vi.fn()
    header.addEventListener('download-selected', onDownload)
    header.selectedCount = 1
    header.canDownloadSelection = false
    await header.updateComplete
    await Promise.resolve()
    await header.updateComplete

    const download = header.shadowRoot?.querySelector<HTMLElement>('[data-action="download-selected"]')
    expect(download?.hasAttribute('disabled')).toBe(true)

    download?.click()
    expect(onDownload).not.toHaveBeenCalled()
  })

  it('renders removable active filter pills in the contextual strip', async () => {
    const clearQuery = vi.fn()
    const hideHiddenFiles = vi.fn()
    const removeFileType = vi.fn()
    const reset = vi.fn()
    const header = await renderDesktopHeader(
      atom(false),
      createFilterActions({clearQuery, hideHiddenFiles, removeFileType, reset}),
    )
    header.filters = {
      ...createDefaultWorkspaceDashboardHeaderFilters(),
      query: 'report',
      showHidden: true,
      fileTypes: ['documents'],
    }
    await header.updateComplete
    await Promise.resolve()
    await header.updateComplete

    const strip = header.shadowRoot?.querySelector('.files-context-strip')
    expect(strip?.textContent).toContain('report')
    expect(strip?.textContent).toContain('Documents')
    expect(strip?.textContent).toContain('Show')

    strip?.querySelector<HTMLElement>('[aria-label="Clear search"]')?.click()
    strip?.querySelector<HTMLElement>('[aria-label="Hide hidden files"]')?.click()
    strip?.querySelector<HTMLElement>('[data-file-type="documents"]')?.click()
    strip?.querySelector<HTMLElement>('[data-action="reset-filters"]')?.click()

    expect(clearQuery).toHaveBeenCalledTimes(1)
    expect(hideHiddenFiles).toHaveBeenCalledTimes(1)
    expect(removeFileType).toHaveBeenCalledWith('documents')
    expect(reset).toHaveBeenCalledTimes(1)
  })
})
