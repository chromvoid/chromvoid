import {describe, expect, it} from 'vitest'

import {stableStringify} from '../../src/core/pass-utils'

describe('stableStringify', () => {
  it('serializes objects with stable key order', () => {
    const a = {b: 1, a: 2, c: {y: 1, x: 2}}
    const b = {c: {x: 2, y: 1}, a: 2, b: 1}
    expect(stableStringify(a)).toBe(stableStringify(b))
  })

  it('handles arrays deterministically', () => {
    const a = {arr: [3, 2, 1]}
    const b = {arr: [3, 2, 1]}
    expect(stableStringify(a)).toBe(stableStringify(b))
  })
})
