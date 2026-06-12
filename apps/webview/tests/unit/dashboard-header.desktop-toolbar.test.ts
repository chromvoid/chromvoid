import {atom} from '@reatom/core'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {DashboardHeader} from '../../src/features/file-manager/components/dashboard-header'
import {createDefaultDashboardHeaderFilters} from '../../src/features/file-manager/components/dashboard-header.model'
import type {FileSearchFilterActions} from '../../src/features/file-manager/models/file-search-filters.model'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import type {UploadTask} from '../../src/types/upload-task'

let dashboardHeaderDefined = false

function ensureDashboardHeaderDefined() {
  if (dashboardHeaderDefined) return
  DashboardHeader.define()
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
    removeFileType: vi.fn(),
    toggleFileType: vi.fn(),
    ...overrides,
  }
}

async function renderDesktopHeader(selectionMode = atom(false), filterActions: FileSearchFilterActions | null = null) {
  initDesktopHeaderContext(selectionMode)
  ensureDashboardHeaderDefined()

  const header = document.createElement('dashboard-header') as DashboardHeader
  header.currentPath = '/Documents'
  header.filters = createDefaultDashboardHeaderFilters()
  header.totalFiles = 10
  header.filteredFiles = 8
  header.selectedCount = 0
  header.filterActions = filterActions
  document.body.appendChild(header)
  await header.updateComplete
  await Promise.resolve()
  await header.updateComplete
  return header
}

describe('DashboardHeader desktop shell toolbar', () => {
  afterEach(() => {
    clearAppContext()
    document.querySelectorAll('dashboard-header').forEach((el) => el.remove())
  })

  it('renders desktop dashboard content directly into desktop-shell-toolbar slots', async () => {
    const header = await renderDesktopHeader()

    const toolbar = header.shadowRoot?.querySelector('desktop-shell-toolbar')
    const leading = toolbar?.querySelector('[slot="leading"]')
    const start = toolbar?.querySelector('[slot="start"]')
    const center = toolbar?.querySelector('[slot="center"]')
    const actions = toolbar?.querySelector('[slot="actions"]')
    const end = toolbar?.querySelector('[slot="end"]')
    const removedWrapperSelector = ['dashboard-header', 'desktop-layout'].join('-')

    expect(toolbar).not.toBeNull()
    expect(toolbar?.hasAttribute('two-row')).toBe(true)
    expect(header.shadowRoot?.querySelector(removedWrapperSelector)).toBeNull()
    expect(leading?.querySelector('breadcrumbs-nav')).not.toBeNull()
    expect(start?.querySelector('[data-view-mode]')).not.toBeNull()
    expect(center?.querySelector('file-search')).not.toBeNull()
    expect(actions?.querySelector('[data-action="create-dir"]')).not.toBeNull()
    expect(actions?.querySelector('[data-action="upload"]')).not.toBeNull()
    expect(end?.querySelector('.sort-toggle')).not.toBeNull()
    expect(end?.querySelector('.selection-mode-toggle')).not.toBeNull()
  })

  it('keeps desktop view mode controls in the shell toolbar start slot', async () => {
    const setViewMode = vi.fn()
    const header = await renderDesktopHeader(atom(false), createFilterActions({setViewMode}))

    const toolbar = header.shadowRoot?.querySelector('desktop-shell-toolbar')
    const start = toolbar?.querySelector('[slot="start"]')
    const controls = [...(start?.querySelectorAll<HTMLElement>('[data-view-mode]') ?? [])]

    expect(controls.map((control) => control.dataset['viewMode'])).toEqual(['list', 'table', 'grid'])
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

  it('keeps desktop sort control near selection actions', async () => {
    const toggleSortDirection = vi.fn()
    const header = await renderDesktopHeader(atom(false), createFilterActions({toggleSortDirection}))

    const toolbar = header.shadowRoot?.querySelector('desktop-shell-toolbar')
    const end = toolbar?.querySelector('[slot="end"]')
    const sortToggle = end?.querySelector<HTMLElement>('.sort-toggle')

    expect(sortToggle).not.toBeNull()
    expect(sortToggle?.textContent).toContain('Sort: Name ↑')

    sortToggle?.click()

    expect(toggleSortDirection).toHaveBeenCalledTimes(1)
  })

  it('keeps selection mode toggle in the desktop shell toolbar actions', async () => {
    const selectionMode = atom(false)
    const header = await renderDesktopHeader(selectionMode)
    const onSelectionModeRequested = vi.fn()
    header.addEventListener('selection-mode-requested', onSelectionModeRequested)

    const toolbar = header.shadowRoot?.querySelector('desktop-shell-toolbar')
    const end = toolbar?.querySelector('[slot="end"]')
    const toggle = end?.querySelector<HTMLElement>('.selection-mode-toggle')

    expect(toggle).not.toBeNull()
    expect(toggle?.getAttribute('pressed')).toBeNull()

    toggle?.click()

    expect(onSelectionModeRequested).toHaveBeenCalledTimes(1)
    expect(onSelectionModeRequested.mock.calls[0]?.[0].detail).toEqual({enabled: true})

    selectionMode.set(true)
    await header.updateComplete

    expect(toggle?.getAttribute('pressed')).toBe('')
  })
})
