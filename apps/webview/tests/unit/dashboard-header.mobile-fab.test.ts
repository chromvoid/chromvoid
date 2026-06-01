import {afterEach, describe, expect, it, vi} from 'vitest'

import {DashboardHeader} from '../../src/features/file-manager/components/dashboard-header'
import {createDefaultDashboardHeaderFilters} from '../../src/features/file-manager/components/dashboard-header.model'
import {atom} from '@reatom/core'
import {
  MOBILE_FILE_PICKER_LIFECYCLE_END_EVENT,
  MOBILE_FILE_PICKER_LIFECYCLE_START_EVENT,
} from '@chromvoid/password-import'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {UploadTask} from '../../src/types/upload-task'

let dashboardHeaderDefined = false

function ensureDashboardHeaderDefined() {
  if (dashboardHeaderDefined) return
  DashboardHeader.define()
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

describe('DashboardHeader mobile FAB layout', () => {
  afterEach(() => {
    clearAppContext()
    document.querySelectorAll('dashboard-header').forEach((el) => el.remove())
  })

  it('keeps normal mobile mode minimal without selection toolbar or action stack', async () => {
    initHeaderContext(false)
    ensureDashboardHeaderDefined()

    const header = document.createElement('dashboard-header') as DashboardHeader
    header.currentPath = '/'
    header.filters = createDefaultDashboardHeaderFilters()
    header.totalFiles = 10
    header.filteredFiles = 10
    header.selectedCount = 0
    document.body.appendChild(header)
    await header.updateComplete

    const layout = header.shadowRoot?.querySelector('dashboard-header-mobile-layout')
    const breadcrumbs = header.shadowRoot?.querySelector('breadcrumbs-nav')
    const fabLayer = header.shadowRoot?.querySelector('.mobile-fab-actions')
    const selectionToolbar = header.shadowRoot?.querySelector('.selection-toolbar')
    const topFiltersSlot = header.shadowRoot?.querySelector('[slot="filters"]')
    const createButton = header.shadowRoot?.querySelector('[data-action="create-dir"]')
    const uploadButton = header.shadowRoot?.querySelector('[data-action="upload"]')
    const createIcon = createButton?.querySelector('cv-icon')
    const uploadIcon = uploadButton?.querySelector('cv-icon')
    const actions = Array.from(header.shadowRoot?.querySelectorAll('.mobile-fab-actions [data-action]') ?? [])
      .map((el) => el.getAttribute('data-action'))

    expect(layout).toBeNull()
    expect(breadcrumbs).toBeNull()
    expect(selectionToolbar).toBeNull()
    expect(fabLayer).toBeNull()
    expect(actions).toEqual([])
    expect(topFiltersSlot).toBeNull()
    expect(createButton).toBeNull()
    expect(uploadButton).toBeNull()
    expect(createIcon).toBeUndefined()
    expect(uploadIcon).toBeUndefined()
  })

  it('does not render a dashboard selection toolbar in mobile selection mode', async () => {
    initHeaderContext(true)
    ensureDashboardHeaderDefined()

    const header = document.createElement('dashboard-header') as DashboardHeader
    header.currentPath = '/'
    header.filters = createDefaultDashboardHeaderFilters()
    header.totalFiles = 10
    header.filteredFiles = 10
    header.selectedCount = 1
    document.body.appendChild(header)
    await header.updateComplete

    const layout = header.shadowRoot?.querySelector('dashboard-header-mobile-layout')
    const breadcrumbs = header.shadowRoot?.querySelector('breadcrumbs-nav')
    const fabLayer = header.shadowRoot?.querySelector('.mobile-fab-actions')
    const selectionToolbar = header.shadowRoot?.querySelector('.selection-toolbar')
    const mobileActions = header.shadowRoot?.querySelectorAll('[data-action]')

    expect(layout).toBeNull()
    expect(breadcrumbs).toBeNull()
    expect(selectionToolbar).toBeNull()
    expect(fabLayer).toBeNull()
    expect(mobileActions?.length ?? 0).toBe(0)
  })

  it('wraps standard upload file input in a mobile file-picker lifecycle session', async () => {
    initHeaderContext(false, 'desktop')
    ensureDashboardHeaderDefined()
    const start = vi.fn()
    const end = vi.fn()
    window.addEventListener(MOBILE_FILE_PICKER_LIFECYCLE_START_EVENT, start)
    window.addEventListener(MOBILE_FILE_PICKER_LIFECYCLE_END_EVENT, end)

    const header = document.createElement('dashboard-header') as DashboardHeader
    header.currentPath = '/'
    header.filters = createDefaultDashboardHeaderFilters()
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
