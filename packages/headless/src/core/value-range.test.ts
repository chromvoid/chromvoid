import {describe, expect, it} from 'vitest'
import {
  calculateValueRangePercentage,
  clampValue,
  constrainValueToRange,
  createValueRange,
  decrementValue,
  decrementValueLarge,
  incrementValue,
  incrementValueLarge,
  normalizeValueRange,
  snapValueToStep,
} from './value-range'

describe('value-range primitives', () => {
  it('normalizes bounds and defaults for invalid step values', () => {
    const range = normalizeValueRange({
      min: 20,
      max: 10,
      step: 0,
    })

    expect(range).toEqual({
      min: 10,
      max: 20,
      step: 1,
      largeStep: 1,
    })
  })

  it('clamps values with min/max ordering normalized', () => {
    expect(clampValue(5, 10, 20)).toBe(10)
    expect(clampValue(25, 20, 10)).toBe(20)
    expect(clampValue(15, 10, 20)).toBe(15)
  })

  it('snaps to nearest step and keeps within boundaries', () => {
    const range = normalizeValueRange({
      min: 0,
      max: 10,
      step: 2,
    })

    expect(snapValueToStep(2.9, range)).toBe(2)
    expect(snapValueToStep(3.1, range)).toBe(4)
    expect(snapValueToStep(11, range)).toBe(10)
  })

  it('calculates percentage for normalized and clamped values', () => {
    expect(calculateValueRangePercentage(5, 0, 10)).toBe(50)
    expect(calculateValueRangePercentage(20, 10, 0)).toBe(100)
    expect(calculateValueRangePercentage(-10, 0, 10)).toBe(0)
  })

  it('increments and decrements by step with clamping', () => {
    const range = normalizeValueRange({
      min: 0,
      max: 5,
      step: 1,
    })

    expect(incrementValue(4, range)).toBe(5)
    expect(incrementValue(5, range)).toBe(5)
    expect(decrementValue(1, range)).toBe(0)
    expect(decrementValue(0, range)).toBe(0)
  })

  it('applies large-step behavior with clamping', () => {
    const range = normalizeValueRange({
      min: 0,
      max: 100,
      step: 5,
      largeStep: 20,
    })

    expect(incrementValueLarge(10, range)).toBe(30)
    expect(decrementValueLarge(10, range)).toBe(0)
    expect(incrementValueLarge(95, range)).toBe(100)
  })

  it('computes default large-step as 10 percent of range', () => {
    const range = normalizeValueRange({
      min: 0,
      max: 200,
      step: 1,
    })

    expect(range.largeStep).toBe(20)
    expect(constrainValueToRange(213, range)).toBe(200)
  })

  it('exposes signal-first state and updates through actions', async () => {
    const model = createValueRange({
      min: 0,
      max: 20,
      step: 2,
      largeStep: 6,
      initialValue: 3,
      idBase: 'test-range',
    })

    const snapshots: Array<{value: number; percentage: number}> = []
    const unsubscribe = model.state.value.subscribe(() => {
      snapshots.push({
        value: model.state.value(),
        percentage: model.state.percentage(),
      })
    })

    model.actions.increment()
    await Promise.resolve()
    model.actions.incrementLarge()
    await Promise.resolve()
    model.actions.setLast()
    await Promise.resolve()
    unsubscribe()

    expect(model.state.value()).toBe(20)
    expect(snapshots.at(0)).toEqual({value: 4, percentage: 20})
    expect(snapshots.at(-1)).toEqual({value: 20, percentage: 100})
  })
})
