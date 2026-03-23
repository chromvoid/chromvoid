import {describe, expect, it, vi} from 'vitest'
import {createSliderMultiThumb} from './index'

describe('createSliderMultiThumb', () => {
  it('moves thumbs independently with keyboard', () => {
    const slider = createSliderMultiThumb({
      idBase: 'multi-keyboard',
      values: [20, 80],
      min: 0,
      max: 100,
      step: 5,
    })

    slider.actions.handleKeyDown(0, {key: 'ArrowRight'})
    expect(slider.state.values()).toEqual([25, 80])

    slider.actions.handleKeyDown(1, {key: 'ArrowLeft'})
    expect(slider.state.values()).toEqual([25, 75])
  })

  it('prevents thumb crossing', () => {
    const slider = createSliderMultiThumb({
      idBase: 'multi-crossing',
      values: [40, 50],
      min: 0,
      max: 100,
      step: 5,
    })

    slider.actions.setValue(0, 60)
    expect(slider.state.values()).toEqual([50, 50])

    slider.actions.setValue(1, 10)
    expect(slider.state.values()).toEqual([50, 50])
  })

  it('enforces global boundaries', () => {
    const slider = createSliderMultiThumb({
      idBase: 'multi-bounds',
      values: [10, 90],
      min: 0,
      max: 100,
      step: 5,
    })

    slider.actions.setValue(0, -100)
    slider.actions.setValue(1, 1000)

    expect(slider.state.values()).toEqual([0, 100])
  })

  it('handles Home/End against adjacent thumb bounds', () => {
    const slider = createSliderMultiThumb({
      idBase: 'multi-home-end',
      values: [20, 60],
      min: 0,
      max: 100,
      step: 10,
    })

    slider.actions.handleKeyDown(1, {key: 'Home'})
    expect(slider.state.values()).toEqual([20, 20])

    slider.actions.handleKeyDown(0, {key: 'End'})
    expect(slider.state.values()).toEqual([20, 20])
  })

  it('snaps all thumbs to step', () => {
    const slider = createSliderMultiThumb({
      idBase: 'multi-snap',
      values: [13, 87],
      min: 0,
      max: 100,
      step: 10,
    })

    expect(slider.state.values()).toEqual([10, 90])
  })

  it('updates per-thumb aria min/max with adjacent values', () => {
    const slider = createSliderMultiThumb({
      idBase: 'multi-aria',
      values: [20, 80],
      min: 0,
      max: 100,
      step: 5,
    })

    expect(slider.contracts.getThumbProps(0)).toMatchObject({
      'aria-valuemin': '0',
      'aria-valuemax': '80',
    })
    expect(slider.contracts.getThumbProps(1)).toMatchObject({
      'aria-valuemin': '20',
      'aria-valuemax': '100',
    })

    slider.actions.setValue(0, 35)

    expect(slider.contracts.getThumbProps(1)).toMatchObject({
      'aria-valuemin': '35',
      'aria-valuemax': '100',
    })
  })

  it('blocks all actions when disabled', () => {
    const slider = createSliderMultiThumb({
      idBase: 'multi-disabled',
      values: [20, 80],
      min: 0,
      max: 100,
      step: 5,
      isDisabled: true,
    })

    slider.actions.setValue(0, 50)
    expect(slider.state.values()).toEqual([20, 80])

    slider.actions.increment(0)
    expect(slider.state.values()).toEqual([20, 80])

    slider.actions.decrement(1)
    expect(slider.state.values()).toEqual([20, 80])

    slider.actions.incrementLarge(0)
    expect(slider.state.values()).toEqual([20, 80])

    slider.actions.decrementLarge(1)
    expect(slider.state.values()).toEqual([20, 80])

    slider.actions.handleKeyDown(0, {key: 'ArrowRight'})
    expect(slider.state.values()).toEqual([20, 80])
  })

  it('re-enables actions after setDisabled(false)', () => {
    const slider = createSliderMultiThumb({
      idBase: 'multi-reenable',
      values: [20, 80],
      min: 0,
      max: 100,
      step: 5,
      isDisabled: true,
    })

    slider.actions.setDisabled(false)
    slider.actions.increment(0)
    expect(slider.state.values()).toEqual([25, 80])
  })

  it('handles PageUp/PageDown for large step increments', () => {
    const slider = createSliderMultiThumb({
      idBase: 'multi-page',
      values: [20, 80],
      min: 0,
      max: 100,
      step: 1,
      largeStep: 10,
    })

    slider.actions.handleKeyDown(0, {key: 'PageUp'})
    expect(slider.state.values()).toEqual([30, 80])

    slider.actions.handleKeyDown(1, {key: 'PageDown'})
    expect(slider.state.values()).toEqual([30, 70])
  })

  it('PageUp/PageDown respects adjacent thumb bounds', () => {
    const slider = createSliderMultiThumb({
      idBase: 'multi-page-bounds',
      values: [45, 50],
      min: 0,
      max: 100,
      step: 1,
      largeStep: 10,
    })

    slider.actions.handleKeyDown(0, {key: 'PageUp'})
    expect(slider.state.values()[0]).toBeLessThanOrEqual(slider.state.values()[1]!)
  })

  it('updates activeThumbIndex on setValue', () => {
    const slider = createSliderMultiThumb({
      idBase: 'multi-active',
      values: [20, 80],
      min: 0,
      max: 100,
      step: 5,
    })

    slider.actions.setValue(1, 70)
    expect(slider.state.activeThumbIndex()).toBe(1)

    slider.actions.increment(0)
    expect(slider.state.activeThumbIndex()).toBe(0)
  })

  it('updates activeThumbIndex via setActiveThumb', () => {
    const slider = createSliderMultiThumb({
      idBase: 'multi-set-active',
      values: [20, 80],
      min: 0,
      max: 100,
      step: 5,
    })

    slider.actions.setActiveThumb(1)
    expect(slider.state.activeThumbIndex()).toBe(1)

    slider.actions.setActiveThumb(0)
    expect(slider.state.activeThumbIndex()).toBe(0)
  })

  it('ignores setActiveThumb for out-of-range index', () => {
    const slider = createSliderMultiThumb({
      idBase: 'multi-active-oob',
      values: [20, 80],
      min: 0,
      max: 100,
      step: 5,
    })

    slider.actions.setActiveThumb(5)
    expect(slider.state.activeThumbIndex()).toBe(0)
  })

  it('maintains ordering invariant with 3+ thumbs', () => {
    const slider = createSliderMultiThumb({
      idBase: 'multi-3thumb',
      values: [10, 50, 90],
      min: 0,
      max: 100,
      step: 5,
    })

    expect(slider.state.values()).toEqual([10, 50, 90])

    // Thumb 0 cannot exceed thumb 1
    slider.actions.setValue(0, 60)
    expect(slider.state.values()[0]).toBeLessThanOrEqual(slider.state.values()[1]!)

    // Thumb 2 cannot go below thumb 1
    slider.actions.setValue(2, 30)
    expect(slider.state.values()[2]).toBeGreaterThanOrEqual(slider.state.values()[1]!)

    // Thumb 1 is bounded by thumb 0 and thumb 2
    slider.actions.setValue(1, 5)
    expect(slider.state.values()[1]).toBeGreaterThanOrEqual(slider.state.values()[0]!)

    slider.actions.setValue(1, 95)
    expect(slider.state.values()[1]).toBeLessThanOrEqual(slider.state.values()[2]!)
  })

  it('correct aria-valuemin/max for 3 thumbs', () => {
    const slider = createSliderMultiThumb({
      idBase: 'multi-3aria',
      values: [20, 50, 80],
      min: 0,
      max: 100,
      step: 5,
    })

    expect(slider.contracts.getThumbProps(0)).toMatchObject({
      'aria-valuemin': '0',
      'aria-valuemax': '50',
    })
    expect(slider.contracts.getThumbProps(1)).toMatchObject({
      'aria-valuemin': '20',
      'aria-valuemax': '80',
    })
    expect(slider.contracts.getThumbProps(2)).toMatchObject({
      'aria-valuemin': '50',
      'aria-valuemax': '100',
    })
  })

  it('applies getThumbAriaLabel to thumb props', () => {
    const labels = ['Minimum price', 'Maximum price']
    const slider = createSliderMultiThumb({
      idBase: 'multi-label',
      values: [20, 80],
      min: 0,
      max: 100,
      step: 5,
      getThumbAriaLabel: (index) => labels[index],
    })

    expect(slider.contracts.getThumbProps(0)['aria-label']).toBe('Minimum price')
    expect(slider.contracts.getThumbProps(1)['aria-label']).toBe('Maximum price')
  })

  it('applies formatValueText to thumb props', () => {
    const slider = createSliderMultiThumb({
      idBase: 'multi-valuetext',
      values: [20, 80],
      min: 0,
      max: 100,
      step: 5,
      formatValueText: (value, index) => `$${value}`,
    })

    expect(slider.contracts.getThumbProps(0)['aria-valuetext']).toBe('$20')
    expect(slider.contracts.getThumbProps(1)['aria-valuetext']).toBe('$80')
  })

  it('calls onValuesChange when values change', () => {
    const onChange = vi.fn()
    const slider = createSliderMultiThumb({
      idBase: 'multi-callback',
      values: [20, 80],
      min: 0,
      max: 100,
      step: 5,
      onValuesChange: onChange,
    })

    slider.actions.setValue(0, 30)
    expect(onChange).toHaveBeenCalledWith([30, 80])

    onChange.mockClear()
    slider.actions.increment(1)
    expect(onChange).toHaveBeenCalledWith([30, 85])
  })

  it('all thumbs have tabindex=0 when not disabled', () => {
    const slider = createSliderMultiThumb({
      idBase: 'multi-tabindex',
      values: [20, 80],
      min: 0,
      max: 100,
      step: 5,
    })

    expect(slider.contracts.getThumbProps(0).tabindex).toBe('0')
    expect(slider.contracts.getThumbProps(1).tabindex).toBe('0')
  })

  it('all thumbs have tabindex=-1 when disabled', () => {
    const slider = createSliderMultiThumb({
      idBase: 'multi-tabindex-disabled',
      values: [20, 80],
      min: 0,
      max: 100,
      step: 5,
      isDisabled: true,
    })

    expect(slider.contracts.getThumbProps(0).tabindex).toBe('-1')
    expect(slider.contracts.getThumbProps(1).tabindex).toBe('-1')
  })

  it('each thumb has role=slider and aria-orientation', () => {
    const slider = createSliderMultiThumb({
      idBase: 'multi-role',
      values: [20, 80],
      min: 0,
      max: 100,
      step: 5,
      orientation: 'vertical',
    })

    const thumb0 = slider.contracts.getThumbProps(0)
    const thumb1 = slider.contracts.getThumbProps(1)

    expect(thumb0.role).toBe('slider')
    expect(thumb1.role).toBe('slider')
    expect(thumb0['aria-orientation']).toBe('vertical')
    expect(thumb1['aria-orientation']).toBe('vertical')
  })

  it('throws for invalid thumb index in getThumbProps', () => {
    const slider = createSliderMultiThumb({
      idBase: 'multi-throw',
      values: [20, 80],
      min: 0,
      max: 100,
      step: 5,
    })

    expect(() => slider.contracts.getThumbProps(5)).toThrow()
    expect(() => slider.contracts.getThumbProps(-1)).toThrow()
  })

  it('getRootProps returns correct attributes', () => {
    const slider = createSliderMultiThumb({
      idBase: 'multi-root',
      values: [20, 80],
      min: 0,
      max: 100,
      step: 5,
      orientation: 'horizontal',
    })

    const root = slider.contracts.getRootProps()
    expect(root.id).toBe('multi-root-root')
    expect(root['data-orientation']).toBe('horizontal')
    expect(root['aria-disabled']).toBeUndefined()
  })

  it('getRootProps reflects disabled state', () => {
    const slider = createSliderMultiThumb({
      idBase: 'multi-root-dis',
      values: [20, 80],
      isDisabled: true,
    })

    expect(slider.contracts.getRootProps()['aria-disabled']).toBe('true')
  })

  it('getTrackProps returns correct attributes', () => {
    const slider = createSliderMultiThumb({
      idBase: 'multi-track',
      values: [20, 80],
      orientation: 'vertical',
    })

    const track = slider.contracts.getTrackProps()
    expect(track.id).toBe('multi-track-track')
    expect(track['data-orientation']).toBe('vertical')
  })

  it('onKeyDown via getThumbProps delegates to handleKeyDown', () => {
    const slider = createSliderMultiThumb({
      idBase: 'multi-onkey',
      values: [20, 80],
      min: 0,
      max: 100,
      step: 5,
    })

    const thumb0 = slider.contracts.getThumbProps(0)
    thumb0.onKeyDown({key: 'ArrowRight'})
    expect(slider.state.values()).toEqual([25, 80])
  })

  it('initializes with sorted values when given unordered input', () => {
    const slider = createSliderMultiThumb({
      idBase: 'multi-sort',
      values: [80, 20],
      min: 0,
      max: 100,
      step: 5,
    })

    expect(slider.state.values()).toEqual([20, 80])
  })
})
