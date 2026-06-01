import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {sortStorage} from '@project/passmanager/sort-storage'

describe('sort storage view mode persistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('loads view mode from the canonical pm_view_mode key', () => {
    localStorage.setItem('pm_view_mode', 'dense')

    expect(sortStorage.loadSettings().viewMode).toBe('dense')
  })

  it('normalizes the legacy pm-view-mode key to pm_view_mode', () => {
    localStorage.setItem('pm-view-mode', 'compact')

    expect(sortStorage.loadSettings().viewMode).toBe('compact')
    expect(localStorage.getItem('pm_view_mode')).toBe('compact')
    expect(localStorage.getItem('pm-view-mode')).toBeNull()
  })

  it('falls back to default for invalid persisted view mode', () => {
    localStorage.setItem('pm_view_mode', 'legacy')

    expect(sortStorage.loadSettings().viewMode).toBe('default')
  })
})
