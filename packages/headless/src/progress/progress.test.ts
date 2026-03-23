import {describe, expect, it} from 'vitest'
import {expectRoleAndAria} from '../testing/apg-contract-harness'
import {createProgress} from './index'

describe('createProgress', () => {
  it('maps progressbar aria value contract in determinate mode', () => {
    const progress = createProgress({
      idBase: 'progress-determinate',
      min: 0,
      max: 10,
      value: 3,
      ariaLabel: 'Upload progress',
    })

    expectRoleAndAria(progress.contracts.getProgressProps(), 'progressbar', {
      'aria-valuenow': '3',
      'aria-valuemin': '0',
      'aria-valuemax': '10',
      'aria-valuetext': '30%',
      'aria-label': 'Upload progress',
    })
  })

  it('omits aria value attributes in indeterminate mode', () => {
    const progress = createProgress({
      idBase: 'progress-indeterminate',
      value: 50,
      isIndeterminate: true,
    })

    const props = progress.contracts.getProgressProps()
    expect(props['aria-valuenow']).toBeUndefined()
    expect(props['aria-valuemin']).toBeUndefined()
    expect(props['aria-valuemax']).toBeUndefined()
    expect(props['aria-valuetext']).toBeUndefined()
  })

  it('uses valueText static override over formatValueText and percentage', () => {
    const progress = createProgress({
      idBase: 'progress-valuetext',
      min: 0,
      max: 100,
      value: 42,
      valueText: 'Step 2 of 5',
      formatValueText: (v) => `${v} items`,
    })

    const props = progress.contracts.getProgressProps()
    expect(props['aria-valuetext']).toBe('Step 2 of 5')
  })

  it('uses formatValueText when valueText is not set', () => {
    const progress = createProgress({
      idBase: 'progress-formatter',
      min: 0,
      max: 200,
      value: 100,
      formatValueText: (v) => `${v} of 200 files`,
    })

    const props = progress.contracts.getProgressProps()
    expect(props['aria-valuetext']).toBe('100 of 200 files')
  })

  it('falls back to rounded percentage when neither valueText nor formatValueText is set', () => {
    const progress = createProgress({
      idBase: 'progress-percentage',
      min: 0,
      max: 3,
      value: 1,
    })

    const props = progress.contracts.getProgressProps()
    expect(props['aria-valuetext']).toBe('33%')
  })

  it('toggles aria attributes when switching between determinate and indeterminate', () => {
    const progress = createProgress({
      idBase: 'progress-toggle',
      min: 0,
      max: 100,
      value: 50,
    })

    expect(progress.contracts.getProgressProps()['aria-valuenow']).toBe('50')

    progress.actions.setIndeterminate(true)
    const indeterminateProps = progress.contracts.getProgressProps()
    expect(indeterminateProps['aria-valuenow']).toBeUndefined()
    expect(indeterminateProps['aria-valuemin']).toBeUndefined()
    expect(indeterminateProps['aria-valuemax']).toBeUndefined()
    expect(indeterminateProps['aria-valuetext']).toBeUndefined()

    progress.actions.setIndeterminate(false)
    expect(progress.contracts.getProgressProps()['aria-valuenow']).toBe('50')
  })

  it('fires onValueChange only when value actually changes', () => {
    const changes: number[] = []
    const progress = createProgress({
      idBase: 'progress-callback',
      min: 0,
      max: 100,
      value: 0,
      onValueChange: (v) => changes.push(v),
    })

    progress.actions.setValue(50)
    progress.actions.setValue(50) // same value, no callback
    progress.actions.setValue(100)
    progress.actions.decrement() // 100 -> 99
    progress.actions.increment() // 99 -> 100

    expect(changes).toEqual([50, 100, 99, 100])
  })

  it('computes isComplete as false when indeterminate regardless of value', () => {
    const progress = createProgress({
      idBase: 'progress-complete',
      min: 0,
      max: 100,
      value: 100,
      isIndeterminate: true,
    })

    expect(progress.state.isComplete()).toBe(false)

    progress.actions.setIndeterminate(false)
    expect(progress.state.isComplete()).toBe(true)
  })

  it('increments/decrements with clamping and reports completion', () => {
    const changes: number[] = []
    const progress = createProgress({
      idBase: 'progress-step',
      min: 0,
      max: 3,
      step: 1,
      value: 1,
      onValueChange: (value) => changes.push(value),
    })

    progress.actions.increment()
    progress.actions.increment()
    progress.actions.increment()
    expect(progress.state.value()).toBe(3)
    expect(progress.state.isComplete()).toBe(true)

    progress.actions.decrement()
    expect(progress.state.value()).toBe(2)
    expect(progress.state.isComplete()).toBe(false)
    expect(changes).toEqual([2, 3, 2])
  })
})
