import {describe, expect, it} from 'vitest'

import {
  isPointWithinHorizontalEdge,
  resolveInwardHorizontalDistance,
  resolvePhysicalHorizontalEdge,
  resolvePhysicalHorizontalOffset,
} from '../../src/utils/logical-direction'

describe('logical horizontal direction', () => {
  it('maps inline edges to physical edges', () => {
    expect(resolvePhysicalHorizontalEdge('start', 'ltr')).toBe('left')
    expect(resolvePhysicalHorizontalEdge('end', 'ltr')).toBe('right')
    expect(resolvePhysicalHorizontalEdge('start', 'rtl')).toBe('right')
    expect(resolvePhysicalHorizontalEdge('end', 'rtl')).toBe('left')
  })

  it('recognizes and measures inward gestures from either physical edge', () => {
    expect(isPointWithinHorizontalEdge(8, 400, 40, 'left')).toBe(true)
    expect(isPointWithinHorizontalEdge(392, 400, 40, 'right')).toBe(true)
    expect(resolveInwardHorizontalDistance(8, 108, 'left')).toBe(100)
    expect(resolveInwardHorizontalDistance(392, 292, 'right')).toBe(100)
    expect(resolvePhysicalHorizontalOffset(100, 'left')).toBe(100)
    expect(resolvePhysicalHorizontalOffset(100, 'right')).toBe(-100)
  })
})
