import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {
  GUIDANCE_PROGRESS_STORAGE_KEY,
  localGuidanceProgressStore,
} from '../../src/core/guidance/guidance.progress-store'

describe('localGuidanceProgressStore', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('roundtrips valid progress records', () => {
    localGuidanceProgressStore.save([
      {
        id: 'files.empty-state',
        version: 1,
        state: 'dismissed',
        seenAt: 10,
        dismissedAt: 20,
      },
    ])

    expect(localGuidanceProgressStore.load()).toEqual([
      {
        id: 'files.empty-state',
        version: 1,
        state: 'dismissed',
        seenAt: 10,
        dismissedAt: 20,
      },
    ])
  })

  it('returns an empty list for missing, malformed, or invalid storage data', () => {
    expect(localGuidanceProgressStore.load()).toEqual([])

    localStorage.setItem(GUIDANCE_PROGRESS_STORAGE_KEY, '{')
    expect(localGuidanceProgressStore.load()).toEqual([])

    localStorage.setItem(
      GUIDANCE_PROGRESS_STORAGE_KEY,
      JSON.stringify([{id: '', version: 1, state: 'seen'}, {id: 'ok', version: 1, state: 'seen'}]),
    )
    expect(localGuidanceProgressStore.load()).toEqual([{id: 'ok', version: 1, state: 'seen'}])
  })

  it('clears only the guidance progress key', () => {
    localStorage.setItem('other', 'kept')
    localGuidanceProgressStore.save([{id: 'a', version: 1, state: 'seen'}])

    localGuidanceProgressStore.clear()

    expect(localGuidanceProgressStore.load()).toEqual([])
    expect(localStorage.getItem('other')).toBe('kept')
  })
})
