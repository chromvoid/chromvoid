import {describe, expect, it} from 'vitest'

import {PMMobileListWindowModel} from '../../src/features/passmanager/models/pm-mobile-list-window.model'
import type {PMListMutationRow} from '../../src/features/passmanager/models/pm-list-mutation-motion.model'

const row = (id: string, kind: PMListMutationRow['kind'] = 'entry'): PMListMutationRow =>
  ({id, kind} as PMListMutationRow)

describe('PM mobile list window model', () => {
  it('renders the visible range with two overscan rows on both sides', () => {
    const model = new PMMobileListWindowModel()
    const rows = Array.from({length: 20}, (_value, index) => row(`entry-${index}`))
    model.setViewportBlockSize(128)
    model.syncScrollTop(rows, 64 * 5, true)

    const window = model.getWindow(rows)

    expect(window.visibleRange).toEqual({first: 5, last: 6})
    expect(window.renderedRange).toEqual({first: 3, last: 8})
    expect(window.rows.map(({index}) => index)).toEqual([3, 4, 5, 6, 7, 8])
    expect(window.totalBlockSize).toBe(64 * 20)
    expect(window.offsetBlock).toBe(64 * 3)
  })

  it('computes prefix geometry for mixed actionable and header rows', () => {
    const model = new PMMobileListWindowModel()
    const rows = [row('header', 'header'), row('entry-1'), row('entry-2'), row('group', 'group')]
    model.setViewportBlockSize(64)
    model.syncScrollTop(rows, 42, true)

    const window = model.getWindow(rows)

    expect(window.visibleRange).toEqual({first: 1, last: 1})
    expect(window.totalBlockSize).toBe(42 + 64 * 3)
    expect(window.offsetBlock).toBe(0)
  })

  it('clamps stale scroll positions after a projection shrinks', () => {
    const model = new PMMobileListWindowModel()
    const rows = Array.from({length: 3}, (_value, index) => row(`entry-${index}`))
    model.setViewportBlockSize(128)

    model.syncScrollTop(rows, 10_000, true)

    expect(model.scrollTop()).toBe(64)
    expect(model.getWindow(rows).visibleRange).toEqual({first: 1, last: 2})
  })

  it('preserves the top anchor when measured row geometry replaces fallbacks', () => {
    const model = new PMMobileListWindowModel()
    const rows = [row('header', 'header'), row('entry-1'), row('entry-2')]
    model.setViewportBlockSize(64)
    model.syncScrollTop(rows, 50, true)

    const correction = model.syncMeasuredRowBlockSize('header', 50, rows, 50)

    expect(correction).toBe(58)
    expect(model.scrollTop()).toBe(58)
    expect(model.getWindow(rows).visibleRange?.first).toBe(1)
  })

  it('computes nearest and centered targets for offscreen rows', () => {
    const model = new PMMobileListWindowModel()
    const rows = Array.from({length: 10}, (_value, index) => row(`entry-${index}`))
    model.setViewportBlockSize(128)

    expect(model.getScrollTopForIndex(rows, 5, 'nearest', 0)).toBe(256)
    expect(model.getScrollTopForIndex(rows, 5, 'center', 0)).toBe(288)
    expect(model.getScrollTopForIndex(rows, 1, 'nearest', 0)).toBe(0)
  })

  it('returns an empty window without materializing rows', () => {
    const model = new PMMobileListWindowModel()

    expect(model.getWindow([])).toEqual({
      rows: [],
      renderedRange: null,
      visibleRange: null,
      totalBlockSize: 0,
      offsetBlock: 0,
    })
  })
})
