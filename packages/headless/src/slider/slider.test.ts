import {describe, expect, it, vi} from 'vitest'
import {createSlider} from './index'
import {expectRoleAndAria} from '../testing/apg-contract-harness'

describe('createSlider', () => {
  it('clamps value at boundaries', () => {
    const slider = createSlider({
      idBase: 'slider-bounds',
      min: 0,
      max: 10,
      value: 20,
    })

    expect(slider.state.value()).toBe(10)
    slider.actions.setValue(-10)
    expect(slider.state.value()).toBe(0)
  })

  it('increments and decrements by step', () => {
    const slider = createSlider({
      idBase: 'slider-step',
      min: 0,
      max: 10,
      step: 2,
      value: 4,
    })

    slider.actions.increment()
    expect(slider.state.value()).toBe(6)
    slider.actions.decrement()
    expect(slider.state.value()).toBe(4)
  })

  it('supports large-step and home/end keys', () => {
    const slider = createSlider({
      idBase: 'slider-keys',
      min: 0,
      max: 100,
      step: 5,
      largeStep: 20,
      value: 50,
    })

    slider.actions.handleKeyDown({key: 'PageUp'})
    expect(slider.state.value()).toBe(70)
    slider.actions.handleKeyDown({key: 'PageDown'})
    expect(slider.state.value()).toBe(50)

    slider.actions.handleKeyDown({key: 'Home'})
    expect(slider.state.value()).toBe(0)
    slider.actions.handleKeyDown({key: 'End'})
    expect(slider.state.value()).toBe(100)
  })

  it('supports vertical orientation keyboard parity', () => {
    const slider = createSlider({
      idBase: 'slider-vertical',
      orientation: 'vertical',
      min: 0,
      max: 10,
      value: 5,
    })

    slider.actions.handleKeyDown({key: 'ArrowUp'})
    expect(slider.state.value()).toBe(6)
    slider.actions.handleKeyDown({key: 'ArrowDown'})
    expect(slider.state.value()).toBe(5)
  })

  it('snaps setValue to nearest step', () => {
    const slider = createSlider({
      idBase: 'slider-snap',
      min: 0,
      max: 10,
      step: 2,
      value: 0,
    })

    slider.actions.setValue(3.1)
    expect(slider.state.value()).toBe(4)
  })

  it('prevents value changes when disabled', () => {
    const slider = createSlider({
      idBase: 'slider-disabled',
      min: 0,
      max: 10,
      value: 5,
      isDisabled: true,
    })

    slider.actions.increment()
    slider.actions.handleKeyDown({key: 'End'})

    expect(slider.state.value()).toBe(5)
    expect(slider.contracts.getThumbProps()).toMatchObject({
      tabindex: '-1',
      'aria-disabled': 'true',
    })
  })

  it('calls onValueChange when value updates', () => {
    const onValueChange = vi.fn()
    const slider = createSlider({
      idBase: 'slider-callback',
      min: 0,
      max: 10,
      value: 5,
      onValueChange,
    })

    slider.actions.increment()
    slider.actions.increment()

    expect(onValueChange).toHaveBeenCalledTimes(2)
    expect(onValueChange).toHaveBeenLastCalledWith(7)
  })

  it('exposes slider role and aria value contract', () => {
    const slider = createSlider({
      idBase: 'slider-aria',
      min: 0,
      max: 10,
      value: 3,
      orientation: 'vertical',
      ariaLabel: 'Volume',
    })

    expectRoleAndAria(slider.contracts.getThumbProps(), 'slider', {
      'aria-valuenow': '3',
      'aria-valuemin': '0',
      'aria-valuemax': '10',
      'aria-orientation': 'vertical',
      'aria-label': 'Volume',
    })
  })

  it('handles ArrowRight/ArrowLeft for horizontal keyboard navigation', () => {
    const slider = createSlider({
      idBase: 'slider-horiz',
      min: 0,
      max: 10,
      step: 1,
      value: 5,
    })

    slider.actions.handleKeyDown({key: 'ArrowRight'})
    expect(slider.state.value()).toBe(6)
    slider.actions.handleKeyDown({key: 'ArrowLeft'})
    expect(slider.state.value()).toBe(5)
  })

  it('computes percentage correctly', () => {
    const slider = createSlider({
      idBase: 'slider-pct',
      min: 0,
      max: 200,
      value: 50,
    })

    expect(slider.state.percentage()).toBe(25)
    slider.actions.setValue(100)
    expect(slider.state.percentage()).toBe(50)
    slider.actions.setFirst()
    expect(slider.state.percentage()).toBe(0)
    slider.actions.setLast()
    expect(slider.state.percentage()).toBe(100)
  })

  it('defaults largeStep to 10% of range', () => {
    const slider = createSlider({
      idBase: 'slider-default-large',
      min: 0,
      max: 100,
      step: 1,
      value: 50,
    })

    slider.actions.incrementLarge()
    expect(slider.state.value()).toBe(60)
    slider.actions.decrementLarge()
    expect(slider.state.value()).toBe(50)
  })

  it('does not call onValueChange when disabled', () => {
    const onValueChange = vi.fn()
    const slider = createSlider({
      idBase: 'slider-disabled-cb',
      min: 0,
      max: 10,
      value: 5,
      isDisabled: true,
      onValueChange,
    })

    slider.actions.increment()
    slider.actions.setValue(8)
    slider.actions.handleKeyDown({key: 'End'})

    expect(onValueChange).not.toHaveBeenCalled()
    expect(slider.state.value()).toBe(5)
  })

  it('formats aria-valuetext via formatValueText', () => {
    const slider = createSlider({
      idBase: 'slider-vtext',
      min: 0,
      max: 100,
      value: 42,
      formatValueText: (v) => `${v}%`,
    })

    const thumbProps = slider.contracts.getThumbProps()
    expect(thumbProps['aria-valuetext']).toBe('42%')

    slider.actions.setValue(75)
    const updated = slider.contracts.getThumbProps()
    expect(updated['aria-valuetext']).toBe('75%')
    expect(updated['aria-valuenow']).toBe('75')
  })

  it('dynamically toggles disabled state', () => {
    const slider = createSlider({
      idBase: 'slider-toggle',
      min: 0,
      max: 10,
      value: 5,
    })

    expect(slider.state.isDisabled()).toBe(false)
    slider.actions.increment()
    expect(slider.state.value()).toBe(6)

    slider.actions.setDisabled(true)
    expect(slider.state.isDisabled()).toBe(true)
    slider.actions.increment()
    expect(slider.state.value()).toBe(6)

    slider.actions.setDisabled(false)
    slider.actions.increment()
    expect(slider.state.value()).toBe(7)
  })
})
