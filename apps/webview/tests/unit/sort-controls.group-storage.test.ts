import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {normalizeStoredGroupBy} from '../../src/features/passmanager/components/list/sort-controls'

describe('sort controls group storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('normalizes legacy folder grouping from localStorage to none', () => {
    localStorage.setItem('pm_group_by', 'folder')
    localStorage.setItem('pm-group-by', 'folder')

    expect(normalizeStoredGroupBy()).toBe('none')
    expect(localStorage.getItem('pm_group_by')).toBe('none')
    expect(localStorage.getItem('pm-group-by')).toBe('none')
  })
})
