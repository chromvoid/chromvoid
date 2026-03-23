import {describe, expect, it} from 'vitest'
import {
  advanceTypeaheadState,
  createInitialTypeaheadState,
  findTypeaheadMatch,
  isTypeaheadEvent,
  normalizeTypeaheadText,
} from './typeahead'

describe('typeahead primitives', () => {
  it('normalizes text for typeahead matching', () => {
    expect(normalizeTypeaheadText('  Alpha  ')).toBe('alpha')
  })

  it('detects valid typeahead keyboard events', () => {
    expect(
      isTypeaheadEvent({
        key: 'a',
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      }),
    ).toBe(true)

    expect(
      isTypeaheadEvent({
        key: ' ',
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      }),
    ).toBe(false)

    expect(
      isTypeaheadEvent({
        key: 'a',
        shiftKey: false,
        ctrlKey: true,
        metaKey: false,
        altKey: false,
      }),
    ).toBe(false)
  })

  it('resets buffer when timeout expires', () => {
    const start = createInitialTypeaheadState()
    const first = advanceTypeaheadState(start, 'a', 100, 300)
    const second = advanceTypeaheadState(first.next, 'b', 500, 300)

    expect(first.query).toBe('a')
    expect(second.query).toBe('b')
  })

  it('keeps only one-char query for repeated same-char input', () => {
    const start = createInitialTypeaheadState()
    const first = advanceTypeaheadState(start, 'a', 100, 300)
    const second = advanceTypeaheadState(first.next, 'a', 150, 300)

    expect(first.query).toBe('a')
    expect(second.query).toBe('a')
  })

  it('finds wrapped match from start index', () => {
    const match = findTypeaheadMatch(
      'ap',
      [
        {id: 'a', text: 'apple'},
        {id: 'b', text: 'banana'},
        {id: 'c', text: 'apricot'},
      ],
      1,
    )

    expect(match).toBe('c')
  })

  it('returns null when there is no typeahead match', () => {
    const match = findTypeaheadMatch(
      'zz',
      [
        {id: 'a', text: 'apple'},
        {id: 'b', text: 'banana'},
      ],
      0,
    )

    expect(match).toBeNull()
  })
})
