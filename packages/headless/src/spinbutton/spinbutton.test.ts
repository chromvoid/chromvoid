import {describe, expect, it, vi} from 'vitest'
import {createSpinbutton} from './index'

describe('createSpinbutton', () => {
  describe('increment/decrement behavior', () => {
    it('increments value by step', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        min: 0,
        max: 10,
        step: 2,
        value: 4,
      })

      control.actions.increment()
      expect(control.state.value()).toBe(6)
    })

    it('decrements value by step', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        min: 0,
        max: 10,
        step: 2,
        value: 6,
      })

      control.actions.decrement()
      expect(control.state.value()).toBe(4)
    })

    it('clamps at max boundary during increment', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        min: 0,
        max: 10,
        step: 1,
        value: 9,
      })

      control.actions.increment()
      expect(control.state.value()).toBe(10)

      control.actions.increment()
      expect(control.state.value()).toBe(10)
    })

    it('clamps at min boundary during decrement', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        min: 0,
        max: 10,
        step: 3,
        value: 0,
      })

      control.actions.decrement()
      expect(control.state.value()).toBe(0)
    })
  })

  describe('large step (PageUp/PageDown) behavior', () => {
    it('incrementLarge increases by largeStep', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        min: 0,
        max: 100,
        step: 1,
        largeStep: 10,
        value: 40,
      })

      control.actions.incrementLarge()
      expect(control.state.value()).toBe(50)
    })

    it('decrementLarge decreases by largeStep', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        min: 0,
        max: 100,
        step: 1,
        largeStep: 10,
        value: 50,
      })

      control.actions.decrementLarge()
      expect(control.state.value()).toBe(40)
    })

    it('defaults largeStep to 10 * step per APG spec', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        min: 0,
        max: 200,
        step: 5,
        value: 50,
      })

      expect(control.state.largeStep()).toBe(50)

      control.actions.incrementLarge()
      expect(control.state.value()).toBe(100)
    })

    it('clamps incrementLarge at max', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        min: 0,
        max: 100,
        step: 1,
        largeStep: 10,
        value: 95,
      })

      control.actions.incrementLarge()
      expect(control.state.value()).toBe(100)
    })

    it('clamps decrementLarge at min', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        min: 0,
        max: 100,
        step: 1,
        largeStep: 10,
        value: 5,
      })

      control.actions.decrementLarge()
      expect(control.state.value()).toBe(0)
    })
  })

  describe('Home/End behavior with defined/undefined boundaries', () => {
    it('Home sets value to min when min is defined', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        min: 10,
        max: 50,
        value: 30,
      })

      control.actions.setFirst()
      expect(control.state.value()).toBe(10)
    })

    it('End sets value to max when max is defined', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        min: 10,
        max: 50,
        value: 30,
      })

      control.actions.setLast()
      expect(control.state.value()).toBe(50)
    })

    it('Home has no effect when min is not defined', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        value: 30,
      })

      control.actions.setFirst()
      expect(control.state.value()).toBe(30)
    })

    it('End has no effect when max is not defined', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        value: 30,
      })

      control.actions.setLast()
      expect(control.state.value()).toBe(30)
    })
  })

  describe('value clamping and snapping', () => {
    it('snaps setValue to nearest step', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        min: 0,
        max: 10,
        step: 2,
        value: 0,
      })

      control.actions.setValue(3.3)
      expect(control.state.value()).toBe(4)
    })

    it('clamps setValue above max to max', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        min: 0,
        max: 10,
        step: 1,
        value: 5,
      })

      control.actions.setValue(99)
      expect(control.state.value()).toBe(10)
    })

    it('clamps setValue below min to min', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        min: 5,
        max: 50,
        step: 1,
        value: 20,
      })

      control.actions.setValue(-10)
      expect(control.state.value()).toBe(5)
    })

    it('initial value is clamped and snapped', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        min: 0,
        max: 10,
        step: 3,
        value: 7,
      })

      // 7 snapped to step=3 from min=0: nearest is 6
      expect(control.state.value()).toBe(6)
    })

    it('is truly unbounded when min/max are not provided', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        value: -250,
        step: 5,
      })

      expect(control.state.value()).toBe(-250)

      control.actions.setValue(1234)
      expect(control.state.value()).toBe(1235)
    })
  })

  describe('boundary button semantics', () => {
    it('disables increment button at max boundary only', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        min: 0,
        max: 10,
        value: 10,
      })

      expect(control.contracts.getIncrementButtonProps()['aria-disabled']).toBe('true')
      expect(control.contracts.getDecrementButtonProps()['aria-disabled']).toBeUndefined()
    })

    it('disables decrement button at min boundary only', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        min: 0,
        max: 10,
        value: 0,
      })

      expect(control.contracts.getIncrementButtonProps()['aria-disabled']).toBeUndefined()
      expect(control.contracts.getDecrementButtonProps()['aria-disabled']).toBe('true')
    })

    it('does not disable increment/decrement by bounds when range is unbounded', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        value: 1000,
      })

      expect(control.contracts.getIncrementButtonProps()['aria-disabled']).toBeUndefined()
      expect(control.contracts.getDecrementButtonProps()['aria-disabled']).toBeUndefined()
    })
  })

  describe('disabled and read-only state enforcement', () => {
    it('disabled prevents increment', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        min: 0,
        max: 10,
        value: 5,
        isDisabled: true,
      })

      control.actions.increment()
      expect(control.state.value()).toBe(5)
    })

    it('disabled prevents decrement', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        min: 0,
        max: 10,
        value: 5,
        isDisabled: true,
      })

      control.actions.decrement()
      expect(control.state.value()).toBe(5)
    })

    it('disabled prevents setValue', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        min: 0,
        max: 10,
        value: 5,
        isDisabled: true,
      })

      control.actions.setValue(8)
      expect(control.state.value()).toBe(5)
    })

    it('disabled prevents incrementLarge and decrementLarge', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        min: 0,
        max: 100,
        value: 50,
        isDisabled: true,
      })

      control.actions.incrementLarge()
      expect(control.state.value()).toBe(50)

      control.actions.decrementLarge()
      expect(control.state.value()).toBe(50)
    })

    it('disabled prevents setFirst and setLast', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        min: 0,
        max: 100,
        value: 50,
        isDisabled: true,
      })

      control.actions.setFirst()
      expect(control.state.value()).toBe(50)

      control.actions.setLast()
      expect(control.state.value()).toBe(50)
    })

    it('readOnly prevents all value mutations', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        min: 0,
        max: 100,
        value: 50,
        isReadOnly: true,
      })

      control.actions.increment()
      expect(control.state.value()).toBe(50)

      control.actions.decrement()
      expect(control.state.value()).toBe(50)

      control.actions.setValue(80)
      expect(control.state.value()).toBe(50)

      control.actions.incrementLarge()
      expect(control.state.value()).toBe(50)

      control.actions.decrementLarge()
      expect(control.state.value()).toBe(50)

      control.actions.setFirst()
      expect(control.state.value()).toBe(50)

      control.actions.setLast()
      expect(control.state.value()).toBe(50)
    })

    it('setDisabled toggles disabled state at runtime', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        min: 0,
        max: 10,
        value: 5,
      })

      control.actions.setDisabled(true)
      control.actions.increment()
      expect(control.state.value()).toBe(5)

      control.actions.setDisabled(false)
      control.actions.increment()
      expect(control.state.value()).toBe(6)
    })

    it('setReadOnly toggles read-only state at runtime', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        min: 0,
        max: 10,
        value: 5,
      })

      control.actions.setReadOnly(true)
      control.actions.increment()
      expect(control.state.value()).toBe(5)

      control.actions.setReadOnly(false)
      control.actions.increment()
      expect(control.state.value()).toBe(6)
    })
  })

  describe('keyboard interaction parity with APG', () => {
    it('ArrowUp increments by step', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        min: 0,
        max: 10,
        step: 1,
        value: 5,
      })

      control.actions.handleKeyDown({key: 'ArrowUp'})
      expect(control.state.value()).toBe(6)
    })

    it('ArrowDown decrements by step', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        min: 0,
        max: 10,
        step: 1,
        value: 5,
      })

      control.actions.handleKeyDown({key: 'ArrowDown'})
      expect(control.state.value()).toBe(4)
    })

    it('PageUp increments by large step', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        min: 0,
        max: 100,
        step: 1,
        largeStep: 10,
        value: 40,
      })

      control.actions.handleKeyDown({key: 'PageUp'})
      expect(control.state.value()).toBe(50)
    })

    it('PageDown decrements by large step', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        min: 0,
        max: 100,
        step: 1,
        largeStep: 10,
        value: 50,
      })

      control.actions.handleKeyDown({key: 'PageDown'})
      expect(control.state.value()).toBe(40)
    })

    it('Home sets value to min', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        min: 10,
        max: 50,
        value: 30,
      })

      control.actions.handleKeyDown({key: 'Home'})
      expect(control.state.value()).toBe(10)
    })

    it('End sets value to max', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        min: 10,
        max: 50,
        value: 30,
      })

      control.actions.handleKeyDown({key: 'End'})
      expect(control.state.value()).toBe(50)
    })

    it('calls preventDefault on handled keys', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        min: 0,
        max: 100,
        value: 50,
      })

      const keys = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End']
      for (const key of keys) {
        const preventDefault = vi.fn()
        control.actions.handleKeyDown({key, preventDefault})
        expect(preventDefault, `preventDefault for ${key}`).toHaveBeenCalledTimes(1)
      }
    })

    it('does not call preventDefault on unhandled keys', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        min: 0,
        max: 100,
        value: 50,
      })

      const preventDefault = vi.fn()
      control.actions.handleKeyDown({key: 'Tab', preventDefault})
      expect(preventDefault).not.toHaveBeenCalled()
    })

    it('keyboard does not mutate value when disabled', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        min: 0,
        max: 100,
        value: 50,
        isDisabled: true,
      })

      control.actions.handleKeyDown({key: 'ArrowUp'})
      control.actions.handleKeyDown({key: 'ArrowDown'})
      control.actions.handleKeyDown({key: 'PageUp'})
      control.actions.handleKeyDown({key: 'PageDown'})
      control.actions.handleKeyDown({key: 'Home'})
      control.actions.handleKeyDown({key: 'End'})
      expect(control.state.value()).toBe(50)
    })
  })

  describe('ARIA contracts', () => {
    it('returns correct spinbutton props with defined boundaries', () => {
      const control = createSpinbutton({
        idBase: 'qty',
        min: 1,
        max: 9,
        value: 3,
        isReadOnly: true,
        ariaLabel: 'Quantity',
      })

      const props = control.contracts.getSpinbuttonProps()
      expect(props).toMatchObject({
        id: 'qty-root',
        role: 'spinbutton',
        tabindex: '0',
        'aria-valuenow': '3',
        'aria-valuemin': '1',
        'aria-valuemax': '9',
        'aria-readonly': 'true',
        'aria-label': 'Quantity',
      })
      expect(props['aria-disabled']).toBeUndefined()
    })

    it('omits aria-valuemin and aria-valuemax when boundaries are not defined', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        value: 50,
      })

      const props = control.contracts.getSpinbuttonProps()
      expect(props['aria-valuemin']).toBeUndefined()
      expect(props['aria-valuemax']).toBeUndefined()
    })

    it('sets aria-disabled when disabled', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        value: 5,
        isDisabled: true,
      })

      const props = control.contracts.getSpinbuttonProps()
      expect(props['aria-disabled']).toBe('true')
      expect(props['aria-readonly']).toBeUndefined()
    })

    it('sets tabindex -1 when disabled', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        value: 5,
        isDisabled: true,
      })

      expect(control.contracts.getSpinbuttonProps().tabindex).toBe('-1')
    })

    it('sets tabindex 0 when enabled', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        value: 5,
      })

      expect(control.contracts.getSpinbuttonProps().tabindex).toBe('0')
    })

    it('provides aria-valuetext via formatValueText', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        min: 0,
        max: 100,
        value: 42,
        formatValueText: (v) => `${v}%`,
      })

      expect(control.contracts.getSpinbuttonProps()['aria-valuetext']).toBe('42%')
    })

    it('aria-valuetext is undefined when formatValueText is not provided', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        value: 42,
      })

      expect(control.contracts.getSpinbuttonProps()['aria-valuetext']).toBeUndefined()
    })

    it('increment button props are correct', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        min: 0,
        max: 10,
        value: 5,
      })

      const props = control.contracts.getIncrementButtonProps()
      expect(props.id).toBe('sb-increment')
      expect(props.tabindex).toBe('-1')
      expect(props['aria-label']).toBe('Increment value')
      expect(props['aria-disabled']).toBeUndefined()
      expect(typeof props.onClick).toBe('function')
    })

    it('decrement button props are correct', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        min: 0,
        max: 10,
        value: 5,
      })

      const props = control.contracts.getDecrementButtonProps()
      expect(props.id).toBe('sb-decrement')
      expect(props.tabindex).toBe('-1')
      expect(props['aria-label']).toBe('Decrement value')
      expect(props['aria-disabled']).toBeUndefined()
    })

    it('button props show aria-disabled when control is disabled', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        value: 5,
        isDisabled: true,
      })

      expect(control.contracts.getIncrementButtonProps()['aria-disabled']).toBe('true')
      expect(control.contracts.getDecrementButtonProps()['aria-disabled']).toBe('true')
    })

    it('button props show aria-disabled when control is readOnly', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        value: 5,
        isReadOnly: true,
      })

      expect(control.contracts.getIncrementButtonProps()['aria-disabled']).toBe('true')
      expect(control.contracts.getDecrementButtonProps()['aria-disabled']).toBe('true')
    })

    it('aria-valuenow updates after mutation', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        min: 0,
        max: 10,
        step: 1,
        value: 5,
      })

      control.actions.increment()
      expect(control.contracts.getSpinbuttonProps()['aria-valuenow']).toBe('6')
    })
  })

  describe('onValueChange callback', () => {
    it('fires when value changes', () => {
      const onChange = vi.fn()
      const control = createSpinbutton({
        idBase: 'sb',
        min: 0,
        max: 10,
        step: 1,
        value: 5,
        onValueChange: onChange,
      })

      control.actions.increment()
      expect(onChange).toHaveBeenCalledWith(6)
    })

    it('does not fire when value does not change', () => {
      const onChange = vi.fn()
      const control = createSpinbutton({
        idBase: 'sb',
        min: 0,
        max: 10,
        step: 1,
        value: 10,
        onValueChange: onChange,
      })

      control.actions.increment()
      expect(onChange).not.toHaveBeenCalled()
    })

    it('does not fire when disabled', () => {
      const onChange = vi.fn()
      const control = createSpinbutton({
        idBase: 'sb',
        min: 0,
        max: 10,
        step: 1,
        value: 5,
        isDisabled: true,
        onValueChange: onChange,
      })

      control.actions.increment()
      expect(onChange).not.toHaveBeenCalled()
    })
  })

  describe('invariants', () => {
    it('step > 0 is enforced (invalid step defaults to 1)', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        min: 0,
        max: 10,
        step: -5,
        value: 0,
      })

      expect(control.state.step()).toBe(1)
      control.actions.increment()
      expect(control.state.value()).toBe(1)
    })

    it('step of 0 falls back to 1', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        min: 0,
        max: 10,
        step: 0,
        value: 0,
      })

      expect(control.state.step()).toBe(1)
    })

    it('min <= value <= max after all operations', () => {
      const control = createSpinbutton({
        idBase: 'sb',
        min: 5,
        max: 15,
        step: 3,
        value: 5,
      })

      // Decrement at minimum
      control.actions.decrement()
      expect(control.state.value()).toBeGreaterThanOrEqual(5)
      expect(control.state.value()).toBeLessThanOrEqual(15)

      // Increment past maximum
      control.actions.setValue(14)
      control.actions.increment()
      expect(control.state.value()).toBeGreaterThanOrEqual(5)
      expect(control.state.value()).toBeLessThanOrEqual(15)
    })
  })
})
