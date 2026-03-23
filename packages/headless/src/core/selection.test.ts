import {describe, expect, it} from 'vitest'
import {normalizeSelection, selectOnly, selectRangeByOrder, toggleSelection} from './selection'

describe('selection primitives', () => {
  it('normalizes selection to one item in single mode', () => {
    const normalized = normalizeSelection(['a', 'b'], new Set(['a', 'b']), 'single')
    expect(normalized).toEqual(['a'])
  })

  it('normalizes and deduplicates selection in multiple mode', () => {
    const normalized = normalizeSelection(['a', 'a', 'b', 'x'], new Set(['a', 'b']), 'multiple')
    expect(normalized).toEqual(['a', 'b'])
  })

  it('toggles values in multiple mode', () => {
    const first = toggleSelection([], 'a', 'multiple', new Set(['a', 'b']))
    const second = toggleSelection(first, 'b', 'multiple', new Set(['a', 'b']))
    const third = toggleSelection(second, 'a', 'multiple', new Set(['a', 'b']))

    expect(first).toEqual(['a'])
    expect(second).toEqual(['a', 'b'])
    expect(third).toEqual(['b'])
  })

  it('returns one selected id in single mode toggle', () => {
    const selected = toggleSelection(['a'], 'b', 'single', new Set(['a', 'b']))
    expect(selected).toEqual(['b'])
  })

  it('selectOnly returns empty array for non-allowed id', () => {
    expect(selectOnly('x', new Set(['a']))).toEqual([])
  })

  it('selectRangeByOrder returns contiguous range', () => {
    expect(selectRangeByOrder(['a', 'b', 'c', 'd'], 'b', 'd')).toEqual(['b', 'c', 'd'])
    expect(selectRangeByOrder(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['b', 'c', 'd'])
  })
})
