import {describe, expect, it, vi} from 'vitest'
import {createNumber} from './index'

describe('createNumber', () => {
  describe('value management', () => {
    it('sets initial value via options', () => {
      const n = createNumber({value: 5, min: 0, max: 10})
      expect(n.state.value()).toBe(5)
    })

    it('defaults value to min when min is provided and no value given', () => {
      const n = createNumber({min: 3, max: 10})
      expect(n.state.value()).toBe(3)
    })

    it('defaults value to 0 when neither value nor min is provided', () => {
      const n = createNumber()
      expect(n.state.value()).toBe(0)
    })

    it('defaultValue defaults to min when min is provided', () => {
      const n = createNumber({min: 5, max: 20, value: 10})
      expect(n.state.defaultValue()).toBe(5)
    })

    it('defaultValue defaults to 0 when min is not provided', () => {
      const n = createNumber({value: 10})
      expect(n.state.defaultValue()).toBe(0)
    })

    it('defaultValue uses explicit defaultValue option', () => {
      const n = createNumber({min: 0, max: 100, value: 50, defaultValue: 25})
      expect(n.state.defaultValue()).toBe(25)
    })

    it('setValue updates value with clamping and snapping', () => {
      const n = createNumber({min: 0, max: 10, step: 2, value: 0})
      n.actions.setValue(3.3)
      expect(n.state.value()).toBe(4)
    })

    it('setValue clears draftText to null', () => {
      const n = createNumber({min: 0, max: 10, value: 5})
      n.actions.setDraftText('abc')
      expect(n.state.draftText()).toBe('abc')
      n.actions.setValue(8)
      expect(n.state.draftText()).toBeNull()
    })

    it('setValue works even when disabled (programmatic/controlled update)', () => {
      const n = createNumber({min: 0, max: 10, value: 5, disabled: true})
      n.actions.setValue(8)
      expect(n.state.value()).toBe(8)
    })

    it('setValue works even when readonly (programmatic/controlled update)', () => {
      const n = createNumber({min: 0, max: 10, value: 5, readonly: true})
      n.actions.setValue(8)
      expect(n.state.value()).toBe(8)
    })

    it('setValue fires onValueChange when value changes', () => {
      const onChange = vi.fn()
      const n = createNumber({min: 0, max: 10, value: 5, onValueChange: onChange})
      n.actions.setValue(8)
      expect(onChange).toHaveBeenCalledWith(8)
    })

    it('setValue does not fire onValueChange when value does not change', () => {
      const onChange = vi.fn()
      const n = createNumber({min: 0, max: 10, step: 1, value: 10, onValueChange: onChange})
      n.actions.setValue(11) // clamps to 10 — same as before
      expect(onChange).not.toHaveBeenCalled()
    })
  })

  describe('spinbutton behavior', () => {
    it('increment increases value by step', () => {
      const n = createNumber({min: 0, max: 10, step: 2, value: 4})
      n.actions.increment()
      expect(n.state.value()).toBe(6)
    })

    it('decrement decreases value by step', () => {
      const n = createNumber({min: 0, max: 10, step: 2, value: 6})
      n.actions.decrement()
      expect(n.state.value()).toBe(4)
    })

    it('incrementLarge increases value by largeStep', () => {
      const n = createNumber({min: 0, max: 100, step: 1, largeStep: 10, value: 40})
      n.actions.incrementLarge()
      expect(n.state.value()).toBe(50)
    })

    it('decrementLarge decreases value by largeStep', () => {
      const n = createNumber({min: 0, max: 100, step: 1, largeStep: 10, value: 50})
      n.actions.decrementLarge()
      expect(n.state.value()).toBe(40)
    })

    it('setFirst jumps to min', () => {
      const n = createNumber({min: 10, max: 50, value: 30})
      n.actions.setFirst()
      expect(n.state.value()).toBe(10)
    })

    it('setLast jumps to max', () => {
      const n = createNumber({min: 10, max: 50, value: 30})
      n.actions.setLast()
      expect(n.state.value()).toBe(50)
    })

    it('clamps value at boundaries', () => {
      const n = createNumber({min: 0, max: 10, step: 1, value: 10})
      n.actions.increment()
      expect(n.state.value()).toBe(10)
    })

    it('spinbutton actions clear draftText to null', () => {
      const n = createNumber({min: 0, max: 100, step: 1, value: 50})
      n.actions.setDraftText('some draft')

      n.actions.increment()
      expect(n.state.draftText()).toBeNull()

      n.actions.setDraftText('draft2')
      n.actions.decrement()
      expect(n.state.draftText()).toBeNull()

      n.actions.setDraftText('draft3')
      n.actions.incrementLarge()
      expect(n.state.draftText()).toBeNull()

      n.actions.setDraftText('draft4')
      n.actions.decrementLarge()
      expect(n.state.draftText()).toBeNull()

      n.actions.setDraftText('draft5')
      n.actions.setFirst()
      expect(n.state.draftText()).toBeNull()

      n.actions.setDraftText('draft6')
      n.actions.setLast()
      expect(n.state.draftText()).toBeNull()
    })

    it('disabled state prevents spinbutton mutations', () => {
      const n = createNumber({min: 0, max: 100, value: 50, disabled: true})
      n.actions.increment()
      expect(n.state.value()).toBe(50)
      n.actions.decrement()
      expect(n.state.value()).toBe(50)
    })

    it('readonly state prevents spinbutton mutations', () => {
      const n = createNumber({min: 0, max: 100, value: 50, readonly: true})
      n.actions.increment()
      expect(n.state.value()).toBe(50)
      n.actions.decrement()
      expect(n.state.value()).toBe(50)
    })
  })

  describe('draft text management', () => {
    it('handleInput sets draftText to the provided text', () => {
      const n = createNumber({value: 5})
      n.actions.handleInput('42')
      expect(n.state.draftText()).toBe('42')
    })

    it('handleInput is no-op when disabled', () => {
      const n = createNumber({value: 5, disabled: true})
      n.actions.handleInput('42')
      expect(n.state.draftText()).toBeNull()
    })

    it('handleInput is no-op when readonly', () => {
      const n = createNumber({value: 5, readonly: true})
      n.actions.handleInput('42')
      expect(n.state.draftText()).toBeNull()
    })

    it('commitDraft with valid numeric text parses and sets value', () => {
      const n = createNumber({min: 0, max: 100, value: 10})
      n.actions.setDraftText('42')
      n.actions.commitDraft()
      expect(n.state.value()).toBe(42)
      expect(n.state.draftText()).toBeNull()
    })

    it('commitDraft with empty string calls clear()', () => {
      const onClear = vi.fn()
      const n = createNumber({min: 0, max: 100, value: 50, defaultValue: 10, clearable: true, onClear})
      n.actions.setDraftText('')
      n.actions.commitDraft()
      expect(n.state.value()).toBe(10)
      expect(onClear).toHaveBeenCalled()
      expect(n.state.draftText()).toBeNull()
    })

    it('commitDraft with invalid text reverts (sets draftText to null, value unchanged)', () => {
      const n = createNumber({min: 0, max: 100, value: 50})
      n.actions.setDraftText('abc')
      n.actions.commitDraft()
      expect(n.state.value()).toBe(50)
      expect(n.state.draftText()).toBeNull()
    })

    it('commitDraft with draftText === null is no-op', () => {
      const onChange = vi.fn()
      const n = createNumber({value: 50, onValueChange: onChange})
      n.actions.commitDraft()
      expect(n.state.value()).toBe(50)
      expect(onChange).not.toHaveBeenCalled()
    })

    it('setFocused(false) triggers commitDraft', () => {
      const n = createNumber({min: 0, max: 100, value: 10})
      n.actions.setFocused(true)
      n.actions.setDraftText('75')
      n.actions.setFocused(false)
      expect(n.state.value()).toBe(75)
      expect(n.state.draftText()).toBeNull()
    })

    it('setDraftText sets draft text directly', () => {
      const n = createNumber({value: 5})
      n.actions.setDraftText('123')
      expect(n.state.draftText()).toBe('123')
    })

    it('setDraftText(null) clears draft', () => {
      const n = createNumber({value: 5})
      n.actions.setDraftText('123')
      n.actions.setDraftText(null)
      expect(n.state.draftText()).toBeNull()
    })
  })

  describe('clearable', () => {
    it('clear sets value to defaultValue and calls onClear', () => {
      const onClear = vi.fn()
      const n = createNumber({min: 0, max: 100, value: 50, defaultValue: 10, onClear})
      n.actions.clear()
      expect(n.state.value()).toBe(10)
      expect(onClear).toHaveBeenCalled()
    })

    it('clear is no-op when disabled', () => {
      const onClear = vi.fn()
      const n = createNumber({value: 50, defaultValue: 0, disabled: true, onClear})
      n.actions.clear()
      expect(n.state.value()).toBe(50)
      expect(onClear).not.toHaveBeenCalled()
    })

    it('clear is no-op when readonly', () => {
      const onClear = vi.fn()
      const n = createNumber({value: 50, defaultValue: 0, readonly: true, onClear})
      n.actions.clear()
      expect(n.state.value()).toBe(50)
      expect(onClear).not.toHaveBeenCalled()
    })

    it('clear clears draftText to null', () => {
      const n = createNumber({value: 50, defaultValue: 0})
      n.actions.setDraftText('draft')
      n.actions.clear()
      expect(n.state.draftText()).toBeNull()
    })

    it('Escape key clears value when clearable and filled', () => {
      const onClear = vi.fn()
      const n = createNumber({value: 50, defaultValue: 0, clearable: true, onClear})
      const event = {key: 'Escape', preventDefault: vi.fn()}
      n.actions.handleKeyDown(event)
      expect(n.state.value()).toBe(0)
      expect(onClear).toHaveBeenCalled()
      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('Escape key does nothing when not clearable', () => {
      const n = createNumber({value: 50, defaultValue: 0, clearable: false})
      const event = {key: 'Escape', preventDefault: vi.fn()}
      n.actions.handleKeyDown(event)
      expect(n.state.value()).toBe(50)
      expect(event.preventDefault).not.toHaveBeenCalled()
    })

    it('Escape key does nothing when value equals defaultValue (not filled)', () => {
      const n = createNumber({value: 0, defaultValue: 0, clearable: true})
      const event = {key: 'Escape', preventDefault: vi.fn()}
      n.actions.handleKeyDown(event)
      expect(n.state.value()).toBe(0)
      expect(event.preventDefault).not.toHaveBeenCalled()
    })

    it('Escape key does nothing when disabled', () => {
      const n = createNumber({value: 50, defaultValue: 0, clearable: true, disabled: true})
      const event = {key: 'Escape', preventDefault: vi.fn()}
      n.actions.handleKeyDown(event)
      expect(n.state.value()).toBe(50)
    })

    it('Escape key does nothing when readonly', () => {
      const n = createNumber({value: 50, defaultValue: 0, clearable: true, readonly: true})
      const event = {key: 'Escape', preventDefault: vi.fn()}
      n.actions.handleKeyDown(event)
      expect(n.state.value()).toBe(50)
    })

    it('onValueChange is not called from clear() if value already equals defaultValue', () => {
      const onChange = vi.fn()
      const n = createNumber({value: 0, defaultValue: 0, onValueChange: onChange})
      n.actions.clear()
      expect(onChange).not.toHaveBeenCalled()
    })
  })

  describe('keyboard', () => {
    it('Enter key calls commitDraft and prevents default', () => {
      const n = createNumber({min: 0, max: 100, value: 10})
      n.actions.setDraftText('42')
      const event = {key: 'Enter', preventDefault: vi.fn()}
      n.actions.handleKeyDown(event)
      expect(n.state.value()).toBe(42)
      expect(n.state.draftText()).toBeNull()
      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('ArrowUp delegates to spinbutton increment', () => {
      const n = createNumber({min: 0, max: 10, step: 1, value: 5})
      const event = {key: 'ArrowUp', preventDefault: vi.fn()}
      n.actions.handleKeyDown(event)
      expect(n.state.value()).toBe(6)
      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('ArrowDown delegates to spinbutton decrement', () => {
      const n = createNumber({min: 0, max: 10, step: 1, value: 5})
      const event = {key: 'ArrowDown', preventDefault: vi.fn()}
      n.actions.handleKeyDown(event)
      expect(n.state.value()).toBe(4)
      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('PageUp delegates to spinbutton large step', () => {
      const n = createNumber({min: 0, max: 100, step: 1, largeStep: 10, value: 40})
      const event = {key: 'PageUp', preventDefault: vi.fn()}
      n.actions.handleKeyDown(event)
      expect(n.state.value()).toBe(50)
    })

    it('PageDown delegates to spinbutton large step', () => {
      const n = createNumber({min: 0, max: 100, step: 1, largeStep: 10, value: 50})
      const event = {key: 'PageDown', preventDefault: vi.fn()}
      n.actions.handleKeyDown(event)
      expect(n.state.value()).toBe(40)
    })

    it('Home delegates to spinbutton setFirst', () => {
      const n = createNumber({min: 10, max: 50, value: 30})
      const event = {key: 'Home', preventDefault: vi.fn()}
      n.actions.handleKeyDown(event)
      expect(n.state.value()).toBe(10)
    })

    it('End delegates to spinbutton setLast', () => {
      const n = createNumber({min: 10, max: 50, value: 30})
      const event = {key: 'End', preventDefault: vi.fn()}
      n.actions.handleKeyDown(event)
      expect(n.state.value()).toBe(50)
    })

    it('spinbutton key handlers clear draftText', () => {
      const n = createNumber({min: 0, max: 100, step: 1, value: 50})
      n.actions.setDraftText('draft')
      n.actions.handleKeyDown({key: 'ArrowUp'})
      expect(n.state.draftText()).toBeNull()
    })
  })

  describe('focus', () => {
    it('setFocused(true) sets focused to true', () => {
      const n = createNumber()
      n.actions.setFocused(true)
      expect(n.state.focused()).toBe(true)
    })

    it('setFocused(false) sets focused to false and commits draft', () => {
      const n = createNumber({min: 0, max: 100, value: 10})
      n.actions.setFocused(true)
      n.actions.setDraftText('50')
      n.actions.setFocused(false)
      expect(n.state.focused()).toBe(false)
      expect(n.state.value()).toBe(50)
      expect(n.state.draftText()).toBeNull()
    })

    it('defaults to not focused', () => {
      const n = createNumber()
      expect(n.state.focused()).toBe(false)
    })
  })

  describe('derived state', () => {
    it('filled is true when value differs from defaultValue', () => {
      const n = createNumber({value: 5, defaultValue: 0})
      expect(n.state.filled()).toBe(true)
    })

    it('filled is false when value equals defaultValue', () => {
      const n = createNumber({value: 0, defaultValue: 0})
      expect(n.state.filled()).toBe(false)
    })

    it('showClearButton reflects clearable && filled && !isDisabled && !isReadOnly', () => {
      const n = createNumber({value: 5, defaultValue: 0, clearable: true})
      expect(n.state.showClearButton()).toBe(true)

      // Not filled
      n.actions.setValue(0)
      expect(n.state.showClearButton()).toBe(false)

      // Filled again
      n.actions.setValue(5)
      expect(n.state.showClearButton()).toBe(true)

      // Disabled
      n.actions.setDisabled(true)
      expect(n.state.showClearButton()).toBe(false)

      // Re-enable, make readonly
      n.actions.setDisabled(false)
      n.actions.setReadOnly(true)
      expect(n.state.showClearButton()).toBe(false)

      // Remove readonly, remove clearable
      n.actions.setReadOnly(false)
      n.actions.setClearable(false)
      expect(n.state.showClearButton()).toBe(false)
    })
  })

  describe('contracts', () => {
    it('getInputProps returns correct role and inputmode', () => {
      const n = createNumber({value: 5})
      const props = n.contracts.getInputProps()
      expect(props.role).toBe('spinbutton')
      expect(props.inputmode).toBe('decimal')
    })

    it('getInputProps returns correct id', () => {
      const n = createNumber({idBase: 'qty', value: 5})
      const props = n.contracts.getInputProps()
      expect(props.id).toBe('qty-input')
    })

    it('getInputProps returns aria-valuenow as string', () => {
      const n = createNumber({value: 42})
      const props = n.contracts.getInputProps()
      expect(props['aria-valuenow']).toBe('42')
    })

    it('getInputProps returns aria-valuemin and aria-valuemax when defined', () => {
      const n = createNumber({min: 5, max: 95, value: 50})
      const props = n.contracts.getInputProps()
      expect(props['aria-valuemin']).toBe('5')
      expect(props['aria-valuemax']).toBe('95')
    })

    it('getInputProps omits aria-valuemin and aria-valuemax when not defined', () => {
      const n = createNumber({value: 50})
      const props = n.contracts.getInputProps()
      expect(props['aria-valuemin']).toBeUndefined()
      expect(props['aria-valuemax']).toBeUndefined()
    })

    it('getInputProps returns aria-disabled true when disabled', () => {
      const n = createNumber({value: 5, disabled: true})
      const props = n.contracts.getInputProps()
      expect(props['aria-disabled']).toBe('true')
    })

    it('getInputProps returns aria-readonly true when readonly', () => {
      const n = createNumber({value: 5, readonly: true})
      const props = n.contracts.getInputProps()
      expect(props['aria-readonly']).toBe('true')
    })

    it('getInputProps returns aria-required true when required', () => {
      const n = createNumber({value: 5, required: true})
      const props = n.contracts.getInputProps()
      expect(props['aria-required']).toBe('true')
    })

    it('getInputProps returns tabindex -1 when disabled, 0 otherwise', () => {
      const n = createNumber({value: 5})
      expect(n.contracts.getInputProps().tabindex).toBe('0')

      n.actions.setDisabled(true)
      expect(n.contracts.getInputProps().tabindex).toBe('-1')
    })

    it('getInputProps returns placeholder when non-empty, omitted when empty', () => {
      const n = createNumber({value: 5, placeholder: 'Enter number'})
      expect(n.contracts.getInputProps().placeholder).toBe('Enter number')

      n.actions.setPlaceholder('')
      expect(n.contracts.getInputProps().placeholder).toBeUndefined()
    })

    it('getInputProps returns autocomplete off', () => {
      const n = createNumber({value: 5})
      expect(n.contracts.getInputProps().autocomplete).toBe('off')
    })

    it('getInputProps returns aria-valuetext from formatValueText', () => {
      const n = createNumber({value: 42, formatValueText: (v) => `${v}%`})
      expect(n.contracts.getInputProps()['aria-valuetext']).toBe('42%')
    })

    it('getInputProps omits aria-valuetext when formatValueText not provided', () => {
      const n = createNumber({value: 42})
      expect(n.contracts.getInputProps()['aria-valuetext']).toBeUndefined()
    })

    it('getInputProps returns aria-label when provided', () => {
      const n = createNumber({value: 5, ariaLabel: 'Quantity'})
      expect(n.contracts.getInputProps()['aria-label']).toBe('Quantity')
    })

    it('getInputProps returns aria-labelledby when provided', () => {
      const n = createNumber({value: 5, ariaLabelledBy: 'label-id'})
      expect(n.contracts.getInputProps()['aria-labelledby']).toBe('label-id')
    })

    it('getInputProps returns aria-describedby when provided', () => {
      const n = createNumber({value: 5, ariaDescribedBy: 'desc-id'})
      expect(n.contracts.getInputProps()['aria-describedby']).toBe('desc-id')
    })

    it('getIncrementButtonProps returns hidden true when stepper is false', () => {
      const n = createNumber({value: 5})
      const props = n.contracts.getIncrementButtonProps()
      expect(props.hidden).toBe(true)
      expect(props['aria-hidden']).toBe('true')
    })

    it('getIncrementButtonProps returns no hidden when stepper is true', () => {
      const n = createNumber({value: 5, stepper: true})
      const props = n.contracts.getIncrementButtonProps()
      expect(props.hidden).toBeUndefined()
      expect(props['aria-hidden']).toBeUndefined()
    })

    it('getDecrementButtonProps returns hidden true when stepper is false', () => {
      const n = createNumber({value: 5})
      const props = n.contracts.getDecrementButtonProps()
      expect(props.hidden).toBe(true)
      expect(props['aria-hidden']).toBe('true')
    })

    it('getDecrementButtonProps returns no hidden when stepper is true', () => {
      const n = createNumber({value: 5, stepper: true})
      const props = n.contracts.getDecrementButtonProps()
      expect(props.hidden).toBeUndefined()
      expect(props['aria-hidden']).toBeUndefined()
    })

    it('getIncrementButtonProps has correct id, tabindex, aria-label', () => {
      const n = createNumber({idBase: 'num', value: 5, stepper: true})
      const props = n.contracts.getIncrementButtonProps()
      expect(props.id).toBe('num-increment')
      expect(props.tabindex).toBe('-1')
      expect(props['aria-label']).toBe('Increment value')
    })

    it('getDecrementButtonProps has correct id, tabindex, aria-label', () => {
      const n = createNumber({idBase: 'num', value: 5, stepper: true})
      const props = n.contracts.getDecrementButtonProps()
      expect(props.id).toBe('num-decrement')
      expect(props.tabindex).toBe('-1')
      expect(props['aria-label']).toBe('Decrement value')
    })

    it('getIncrementButtonProps has aria-disabled at max', () => {
      const n = createNumber({min: 0, max: 10, value: 10, stepper: true})
      expect(n.contracts.getIncrementButtonProps()['aria-disabled']).toBe('true')
      expect(n.contracts.getDecrementButtonProps()['aria-disabled']).toBeUndefined()
    })

    it('getDecrementButtonProps has aria-disabled at min', () => {
      const n = createNumber({min: 0, max: 10, value: 0, stepper: true})
      expect(n.contracts.getDecrementButtonProps()['aria-disabled']).toBe('true')
      expect(n.contracts.getIncrementButtonProps()['aria-disabled']).toBeUndefined()
    })

    it('getIncrementButtonProps has onClick handler', () => {
      const n = createNumber({min: 0, max: 10, value: 5, stepper: true})
      const props = n.contracts.getIncrementButtonProps()
      expect(typeof props.onClick).toBe('function')
      props.onClick()
      expect(n.state.value()).toBe(6)
    })

    it('getDecrementButtonProps has onClick handler', () => {
      const n = createNumber({min: 0, max: 10, value: 5, stepper: true})
      const props = n.contracts.getDecrementButtonProps()
      expect(typeof props.onClick).toBe('function')
      props.onClick()
      expect(n.state.value()).toBe(4)
    })

    it('getClearButtonProps returns hidden true when showClearButton is false', () => {
      const n = createNumber({value: 0, defaultValue: 0, clearable: true})
      const props = n.contracts.getClearButtonProps()
      expect(props.hidden).toBe(true)
      expect(props['aria-hidden']).toBe('true')
    })

    it('getClearButtonProps returns no hidden when showClearButton is true', () => {
      const n = createNumber({value: 5, defaultValue: 0, clearable: true})
      const props = n.contracts.getClearButtonProps()
      expect(props.hidden).toBeUndefined()
      expect(props['aria-hidden']).toBeUndefined()
    })

    it('getClearButtonProps has correct aria-label', () => {
      const n = createNumber({value: 5, clearable: true})
      expect(n.contracts.getClearButtonProps()['aria-label']).toBe('Clear value')
    })

    it('getClearButtonProps has role button, tabindex -1', () => {
      const n = createNumber({value: 5, clearable: true})
      const props = n.contracts.getClearButtonProps()
      expect(props.role).toBe('button')
      expect(props.tabindex).toBe('-1')
    })

    it('getClearButtonProps onClick calls clear', () => {
      const onClear = vi.fn()
      const n = createNumber({value: 50, defaultValue: 0, clearable: true, onClear})
      n.contracts.getClearButtonProps().onClick()
      expect(n.state.value()).toBe(0)
      expect(onClear).toHaveBeenCalled()
    })
  })

  describe('stepper', () => {
    it('stepper buttons hidden by default (stepper defaults to false)', () => {
      const n = createNumber({value: 5})
      expect(n.state.stepper()).toBe(false)
      expect(n.contracts.getIncrementButtonProps().hidden).toBe(true)
      expect(n.contracts.getDecrementButtonProps().hidden).toBe(true)
    })

    it('setStepper(true) makes stepper buttons visible', () => {
      const n = createNumber({value: 5})
      n.actions.setStepper(true)
      expect(n.state.stepper()).toBe(true)
      expect(n.contracts.getIncrementButtonProps().hidden).toBeUndefined()
      expect(n.contracts.getDecrementButtonProps().hidden).toBeUndefined()
    })

    it('setStepper(false) hides stepper buttons', () => {
      const n = createNumber({value: 5, stepper: true})
      n.actions.setStepper(false)
      expect(n.state.stepper()).toBe(false)
      expect(n.contracts.getIncrementButtonProps().hidden).toBe(true)
      expect(n.contracts.getDecrementButtonProps().hidden).toBe(true)
    })
  })

  describe('state setters', () => {
    it('setDisabled updates disabled state', () => {
      const n = createNumber({value: 5})
      expect(n.state.isDisabled()).toBe(false)
      n.actions.setDisabled(true)
      expect(n.state.isDisabled()).toBe(true)
      n.actions.setDisabled(false)
      expect(n.state.isDisabled()).toBe(false)
    })

    it('setReadOnly updates readonly state', () => {
      const n = createNumber({value: 5})
      expect(n.state.isReadOnly()).toBe(false)
      n.actions.setReadOnly(true)
      expect(n.state.isReadOnly()).toBe(true)
      n.actions.setReadOnly(false)
      expect(n.state.isReadOnly()).toBe(false)
    })

    it('setRequired updates required state', () => {
      const n = createNumber({value: 5})
      expect(n.state.required()).toBe(false)
      n.actions.setRequired(true)
      expect(n.state.required()).toBe(true)
    })

    it('setClearable updates clearable state', () => {
      const n = createNumber({value: 5})
      expect(n.state.clearable()).toBe(false)
      n.actions.setClearable(true)
      expect(n.state.clearable()).toBe(true)
    })

    it('setPlaceholder updates placeholder', () => {
      const n = createNumber({value: 5})
      n.actions.setPlaceholder('Type here')
      expect(n.state.placeholder()).toBe('Type here')
    })
  })

  describe('proxied state signals', () => {
    it('exposes min, max, step, largeStep, hasMin, hasMax', () => {
      const n = createNumber({min: 1, max: 99, step: 2, largeStep: 20, value: 50})
      expect(n.state.min()).toBe(1)
      expect(n.state.max()).toBe(99)
      expect(n.state.step()).toBe(2)
      expect(n.state.largeStep()).toBe(20)
      expect(n.state.hasMin()).toBe(true)
      expect(n.state.hasMax()).toBe(true)
    })

    it('hasMin and hasMax false when not provided', () => {
      const n = createNumber({value: 50})
      expect(n.state.hasMin()).toBe(false)
      expect(n.state.hasMax()).toBe(false)
    })
  })
})
