import {afterEach, describe, expect, it} from 'vitest'

import {pmListViewportModel} from '../../src/features/passmanager/models/pm-list-viewport.model'

describe('PM list viewport model', () => {
  afterEach(() => {
    pmListViewportModel.clearAll()
  })

  it('remembers scroll independently for each list context', () => {
    pmListViewportModel.saveScrollTop('root|default', 420.5)
    pmListViewportModel.saveScrollTop('group-a|default', 96)

    expect(pmListViewportModel.getScrollTop('root|default')).toBe(420.5)
    expect(pmListViewportModel.getScrollTop('group-a|default')).toBe(96)
    expect(pmListViewportModel.getScrollTop('group-b|default')).toBeNull()
  })

  it('normalizes invalid viewport values and clears session state', () => {
    pmListViewportModel.saveScrollTop('root|default', -20)
    pmListViewportModel.saveScrollTop('ignored', Number.NaN)

    expect(pmListViewportModel.getScrollTop('root|default')).toBe(0)
    expect(pmListViewportModel.getScrollTop('ignored')).toBeNull()

    pmListViewportModel.clearAll()
    expect(pmListViewportModel.getScrollTop('root|default')).toBeNull()
  })
})
