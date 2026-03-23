import {state} from '@statx/core'

import {afterEach, describe, expect, it} from 'vitest'

import {DashboardHeader} from '../../src/features/file-manager/components/dashboard-header'
import {createDefaultDashboardHeaderFilters} from '../../src/features/file-manager/components/dashboard-header.model'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {UploadTask} from '../../src/types/upload-task'

let dashboardHeaderDefined = false

function ensureDashboardHeaderDefined() {
  if (dashboardHeaderDefined) return
  DashboardHeader.define()
  dashboardHeaderDefined = true
}

function initHeaderContext(selectionEnabled = false) {
  const layoutMode = state<'mobile' | 'desktop'>('mobile')
  const selectionMode = state(selectionEnabled)
  const wsStatus = state<'connected' | 'connecting' | 'disconnected' | 'error'>('connected')
  const catalogStatus = state<'idle' | 'syncing' | 'loading' | 'error'>('idle')
  const uploadTasks = state<UploadTask[]>([])

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

  it('renders filters/create/upload FAB stack in normal mobile mode without top filters slot', async () => {
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
    const fabLayer = header.shadowRoot?.querySelector('.mobile-fab-actions')
    const topFiltersSlot = header.shadowRoot?.querySelector('[slot="filters"]')
    const createButton = header.shadowRoot?.querySelector('[data-action="create-dir"]')
    const uploadButton = header.shadowRoot?.querySelector('[data-action="upload"]')
    const createIcon = createButton?.querySelector('cv-icon')
    const uploadIcon = uploadButton?.querySelector('cv-icon')
    const actions = Array.from(header.shadowRoot?.querySelectorAll('.mobile-fab-actions [data-action]') ?? [])
      .map((el) => el.getAttribute('data-action'))

    expect(layout?.hasAttribute('fab-mode')).toBe(true)
    expect(layout?.hasAttribute('selection-mode')).toBe(false)
    expect(fabLayer).toBeTruthy()
    expect(topFiltersSlot).toBeNull()
    expect(actions).toEqual(['filters', 'create-dir', 'upload'])
    expect(createButton?.getAttribute('variant')).toBe('default')
    expect(uploadButton?.getAttribute('variant')).toBe('default')
    expect(createButton?.classList.contains('action-btn-mobile-fab-primary')).toBe(true)
    expect(uploadButton?.classList.contains('action-btn-mobile-fab-primary')).toBe(true)
    expect(createIcon?.getAttribute('color')).toBe('primary')
    expect(uploadIcon?.getAttribute('color')).toBe('primary')
  })

  it('renders only top selection toolbar in selection mode and hides FAB stack', async () => {
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
    const fabLayer = header.shadowRoot?.querySelector('.mobile-fab-actions')
    const selectionToolbar = header.shadowRoot?.querySelector('.selection-toolbar')
    const mobileActions = header.shadowRoot?.querySelectorAll('[data-action]')

    expect(layout?.hasAttribute('selection-mode')).toBe(true)
    expect(layout?.hasAttribute('fab-mode')).toBe(false)
    expect(selectionToolbar).toBeTruthy()
    expect(fabLayer).toBeNull()
    expect(mobileActions?.length ?? 0).toBe(0)
  })
})
