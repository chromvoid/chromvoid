import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {
  normalizeStoredGroupBy,
  normalizeStoredViewMode,
} from '../../src/features/passmanager/components/list/sort-controls'

function persistedData(key: string): unknown {
  const value = localStorage.getItem(key)
  expect(value).not.toBeNull()
  return JSON.parse(value ?? '{}')['data']
}

function persistedRecord(data: string): string {
  return JSON.stringify({
    data,
    id: 1,
    timestamp: Date.now(),
    to: Date.now() + 60_000,
    version: 0,
  })
}

describe('sort controls group storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('normalizes legacy folder grouping from localStorage to none', () => {
    localStorage.setItem('pm_group_by', 'folder')
    localStorage.setItem('pm-group-by', 'folder')

    expect(normalizeStoredGroupBy()).toBe('none')
    expect(persistedData('pm_group_by')).toBe('none')
    expect(localStorage.getItem('pm-group-by')).toBe('none')
  })

  it('converts raw canonical grouping to the Reatom localStorage record format', () => {
    localStorage.setItem('pm_group_by', 'security')

    expect(normalizeStoredGroupBy()).toBe('security')
    expect(persistedData('pm_group_by')).toBe('security')
  })

  it('keeps an existing Reatom grouping record intact', () => {
    const stored = persistedRecord('website')
    localStorage.setItem('pm_group_by', stored)

    expect(normalizeStoredGroupBy()).toBe('website')
    expect(localStorage.getItem('pm_group_by')).toBe(stored)
  })

  it('migrates raw legacy view mode to the canonical Reatom localStorage record format', () => {
    localStorage.setItem('pm-view-mode', 'compact')

    expect(normalizeStoredViewMode()).toBe('compact')
    expect(persistedData('pm_view_mode')).toBe('compact')
    expect(localStorage.getItem('pm-view-mode')).toBeNull()
  })

  it('initializes the persisted grouping atom from raw canonical storage without storage warnings', async () => {
    vi.resetModules()
    localStorage.setItem('pm_group_by', 'security')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const {groupBy} = await import('../../src/features/passmanager/components/list/sort-controls')

    expect(groupBy()).toBe('security')
    expect(warn).not.toHaveBeenCalledWith('Error in storage withLocalStorage')
  })
})
