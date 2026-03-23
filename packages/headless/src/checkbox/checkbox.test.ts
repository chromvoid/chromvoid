import {describe, expect, it, vi} from 'vitest'
import {createCheckbox} from './index'

describe('createCheckbox', () => {
  // --- Toggle behavior (false -> true -> false) ---

  it('toggles between false and true', () => {
    const checkbox = createCheckbox({idBase: 'cb-toggle'})

    expect(checkbox.state.checked()).toBe(false)
    checkbox.actions.toggle()
    expect(checkbox.state.checked()).toBe(true)
    checkbox.actions.toggle()
    expect(checkbox.state.checked()).toBe(false)
  })

  it('toggles via handleClick', () => {
    const checkbox = createCheckbox({idBase: 'cb-click'})

    expect(checkbox.state.checked()).toBe(false)
    checkbox.actions.handleClick()
    expect(checkbox.state.checked()).toBe(true)
    checkbox.actions.handleClick()
    expect(checkbox.state.checked()).toBe(false)
  })

  it('initializes with checked=true', () => {
    const checkbox = createCheckbox({idBase: 'cb-init-true', checked: true})

    expect(checkbox.state.checked()).toBe(true)
  })

  // --- Indeterminate (mixed) state ---

  it('supports mixed initialization and toggles mixed to true', () => {
    const checkbox = createCheckbox({
      idBase: 'cb-mixed',
      checked: 'mixed',
      allowMixed: true,
    })

    expect(checkbox.state.checked()).toBe('mixed')
    checkbox.actions.toggle()
    expect(checkbox.state.checked()).toBe(true)
  })

  it('auto-enables allowMixed when checked=mixed is passed', () => {
    const checkbox = createCheckbox({
      idBase: 'cb-mixed-auto',
      checked: 'mixed',
    })

    expect(checkbox.state.checked()).toBe('mixed')
  })

  it('normalizes mixed to false when allowMixed is disabled', () => {
    const checkbox = createCheckbox({
      idBase: 'cb-mixed-norm',
      checked: 'mixed',
      allowMixed: false,
    })

    expect(checkbox.state.checked()).toBe(false)
  })

  it('setChecked normalizes mixed when allowMixed is disabled', () => {
    const checkbox = createCheckbox({
      idBase: 'cb-set-mixed-norm',
      allowMixed: false,
    })

    checkbox.actions.setChecked('mixed')
    expect(checkbox.state.checked()).toBe(false)
  })

  it('setChecked allows mixed when allowMixed is enabled', () => {
    const checkbox = createCheckbox({
      idBase: 'cb-set-mixed-allow',
      allowMixed: true,
    })

    checkbox.actions.setChecked('mixed')
    expect(checkbox.state.checked()).toBe('mixed')
  })

  // --- Disabled state prevents state changes ---

  it('does not change value when disabled via toggle', () => {
    const checkbox = createCheckbox({
      idBase: 'cb-disabled-toggle',
      checked: false,
      isDisabled: true,
    })

    checkbox.actions.toggle()
    expect(checkbox.state.checked()).toBe(false)
  })

  it('does not change value when disabled via handleClick', () => {
    const checkbox = createCheckbox({
      idBase: 'cb-disabled-click',
      checked: false,
      isDisabled: true,
    })

    checkbox.actions.handleClick()
    expect(checkbox.state.checked()).toBe(false)
  })

  it('does not change value when disabled via handleKeyDown Space', () => {
    const checkbox = createCheckbox({
      idBase: 'cb-disabled-kbd',
      checked: false,
      isDisabled: true,
    })

    checkbox.actions.handleKeyDown({key: ' '})
    expect(checkbox.state.checked()).toBe(false)
  })

  it('does not preventDefault on Space when disabled', () => {
    const checkbox = createCheckbox({
      idBase: 'cb-disabled-pd',
      checked: false,
      isDisabled: true,
    })

    const preventDefault = vi.fn()
    checkbox.actions.handleKeyDown({key: ' ', preventDefault})
    expect(preventDefault).not.toHaveBeenCalled()
  })

  // --- Read-only state prevents state changes ---

  it('does not change value when read-only via toggle', () => {
    const checkbox = createCheckbox({
      idBase: 'cb-readonly-toggle',
      checked: false,
      isReadOnly: true,
    })

    checkbox.actions.toggle()
    expect(checkbox.state.checked()).toBe(false)
  })

  it('does not change value when read-only via handleClick', () => {
    const checkbox = createCheckbox({
      idBase: 'cb-readonly-click',
      checked: false,
      isReadOnly: true,
    })

    checkbox.actions.handleClick()
    expect(checkbox.state.checked()).toBe(false)
  })

  it('does not change value when read-only via handleKeyDown Space', () => {
    const checkbox = createCheckbox({
      idBase: 'cb-readonly-kbd',
      checked: false,
      isReadOnly: true,
    })

    checkbox.actions.handleKeyDown({key: ' '})
    expect(checkbox.state.checked()).toBe(false)
  })

  it('does not preventDefault on Space when read-only', () => {
    const checkbox = createCheckbox({
      idBase: 'cb-readonly-pd',
      checked: false,
      isReadOnly: true,
    })

    const preventDefault = vi.fn()
    checkbox.actions.handleKeyDown({key: ' ', preventDefault})
    expect(preventDefault).not.toHaveBeenCalled()
  })

  // --- Keyboard Space interaction ---

  it('toggles on Space key', () => {
    const checkbox = createCheckbox({idBase: 'cb-space'})

    checkbox.actions.handleKeyDown({key: ' '})
    expect(checkbox.state.checked()).toBe(true)

    checkbox.actions.handleKeyDown({key: 'Spacebar'})
    expect(checkbox.state.checked()).toBe(false)
  })

  it('calls preventDefault on Space when enabled', () => {
    const checkbox = createCheckbox({idBase: 'cb-space-pd'})

    const preventDefault = vi.fn()
    checkbox.actions.handleKeyDown({key: ' ', preventDefault})
    expect(preventDefault).toHaveBeenCalledOnce()
  })

  it('does not respond to non-Space keys', () => {
    const checkbox = createCheckbox({idBase: 'cb-other-keys'})

    checkbox.actions.handleKeyDown({key: 'Enter'})
    checkbox.actions.handleKeyDown({key: 'Tab'})
    checkbox.actions.handleKeyDown({key: 'ArrowDown'})
    checkbox.actions.handleKeyDown({key: 'Escape'})

    expect(checkbox.state.checked()).toBe(false)
  })

  // --- Correct aria-checked mapping for all states ---

  it('maps aria-checked to false for unchecked state', () => {
    const checkbox = createCheckbox({idBase: 'cb-aria-false', checked: false})

    expect(checkbox.contracts.getCheckboxProps()['aria-checked']).toBe('false')
  })

  it('maps aria-checked to true for checked state', () => {
    const checkbox = createCheckbox({idBase: 'cb-aria-true', checked: true})

    expect(checkbox.contracts.getCheckboxProps()['aria-checked']).toBe('true')
  })

  it('maps aria-checked to mixed for mixed state', () => {
    const checkbox = createCheckbox({
      idBase: 'cb-aria-mixed',
      checked: 'mixed',
      allowMixed: true,
    })

    expect(checkbox.contracts.getCheckboxProps()['aria-checked']).toBe('mixed')
  })

  it('updates aria-checked dynamically after toggle', () => {
    const checkbox = createCheckbox({idBase: 'cb-aria-dynamic'})

    expect(checkbox.contracts.getCheckboxProps()['aria-checked']).toBe('false')
    checkbox.actions.toggle()
    expect(checkbox.contracts.getCheckboxProps()['aria-checked']).toBe('true')
    checkbox.actions.toggle()
    expect(checkbox.contracts.getCheckboxProps()['aria-checked']).toBe('false')
  })

  // --- Full props contract ---

  it('returns complete props contract when enabled', () => {
    const checkbox = createCheckbox({
      idBase: 'cb-props',
      ariaLabelledBy: 'label-1',
      ariaDescribedBy: 'desc-1',
    })

    const props = checkbox.contracts.getCheckboxProps()

    expect(props).toMatchObject({
      id: 'cb-props-root',
      role: 'checkbox',
      tabindex: '0',
      'aria-checked': 'false',
      'aria-labelledby': 'label-1',
      'aria-describedby': 'desc-1',
    })
    expect(props['aria-disabled']).toBeUndefined()
    expect(props['aria-readonly']).toBeUndefined()
    expect(typeof props.onClick).toBe('function')
    expect(typeof props.onKeyDown).toBe('function')
  })

  it('returns aria-disabled and tabindex -1 when disabled', () => {
    const checkbox = createCheckbox({
      idBase: 'cb-props-disabled',
      isDisabled: true,
    })

    const props = checkbox.contracts.getCheckboxProps()

    expect(props.tabindex).toBe('-1')
    expect(props['aria-disabled']).toBe('true')
  })

  it('returns aria-readonly when read-only', () => {
    const checkbox = createCheckbox({
      idBase: 'cb-props-readonly',
      isReadOnly: true,
    })

    const props = checkbox.contracts.getCheckboxProps()

    expect(props['aria-readonly']).toBe('true')
    expect(props.tabindex).toBe('0')
  })

  // --- Dynamic state changes ---

  it('respects dynamically set disabled state', () => {
    const checkbox = createCheckbox({idBase: 'cb-dyn-disabled'})

    checkbox.actions.toggle()
    expect(checkbox.state.checked()).toBe(true)

    checkbox.actions.setDisabled(true)
    expect(checkbox.state.isDisabled()).toBe(true)

    checkbox.actions.toggle()
    expect(checkbox.state.checked()).toBe(true)

    const props = checkbox.contracts.getCheckboxProps()
    expect(props['aria-disabled']).toBe('true')
    expect(props.tabindex).toBe('-1')

    checkbox.actions.setDisabled(false)
    checkbox.actions.toggle()
    expect(checkbox.state.checked()).toBe(false)
  })

  it('respects dynamically set read-only state', () => {
    const checkbox = createCheckbox({idBase: 'cb-dyn-readonly'})

    checkbox.actions.setReadOnly(true)
    expect(checkbox.state.isReadOnly()).toBe(true)

    checkbox.actions.toggle()
    expect(checkbox.state.checked()).toBe(false)

    checkbox.actions.setReadOnly(false)
    checkbox.actions.toggle()
    expect(checkbox.state.checked()).toBe(true)
  })

  // --- onCheckedChange callback ---

  it('invokes onCheckedChange on toggle', () => {
    const onCheckedChange = vi.fn()
    const checkbox = createCheckbox({
      idBase: 'cb-callback',
      onCheckedChange,
    })

    checkbox.actions.toggle()
    expect(onCheckedChange).toHaveBeenCalledWith(true)

    checkbox.actions.toggle()
    expect(onCheckedChange).toHaveBeenCalledWith(false)
  })

  it('invokes onCheckedChange on setChecked', () => {
    const onCheckedChange = vi.fn()
    const checkbox = createCheckbox({
      idBase: 'cb-callback-set',
      onCheckedChange,
      allowMixed: true,
    })

    checkbox.actions.setChecked('mixed')
    expect(onCheckedChange).toHaveBeenCalledWith('mixed')

    checkbox.actions.setChecked(true)
    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })

  it('does not invoke onCheckedChange when disabled toggle is attempted', () => {
    const onCheckedChange = vi.fn()
    const checkbox = createCheckbox({
      idBase: 'cb-callback-disabled',
      isDisabled: true,
      onCheckedChange,
    })

    checkbox.actions.toggle()
    checkbox.actions.handleClick()
    checkbox.actions.handleKeyDown({key: ' '})

    expect(onCheckedChange).not.toHaveBeenCalled()
  })

  // --- Invariant: checked is always boolean | 'mixed' ---

  it('state.checked is always one of true, false, or mixed', () => {
    const checkbox = createCheckbox({
      idBase: 'cb-invariant',
      allowMixed: true,
    })

    const validValues = [true, false, 'mixed']

    expect(validValues).toContain(checkbox.state.checked())

    checkbox.actions.setChecked(true)
    expect(validValues).toContain(checkbox.state.checked())

    checkbox.actions.setChecked(false)
    expect(validValues).toContain(checkbox.state.checked())

    checkbox.actions.setChecked('mixed')
    expect(validValues).toContain(checkbox.state.checked())

    checkbox.actions.toggle()
    expect(validValues).toContain(checkbox.state.checked())
  })

  // --- Default options ---

  it('uses sensible defaults when no options provided', () => {
    const checkbox = createCheckbox()

    expect(checkbox.state.checked()).toBe(false)
    expect(checkbox.state.isDisabled()).toBe(false)
    expect(checkbox.state.isReadOnly()).toBe(false)

    const props = checkbox.contracts.getCheckboxProps()
    expect(props.id).toBe('checkbox-root')
    expect(props.role).toBe('checkbox')
  })
})
