import {describe, expect, it, vi} from 'vitest'
import {createInput} from './index'

describe('createInput', () => {
  // --- State defaults ---

  it('set initial value via options and verify state.value()', () => {
    const input = createInput({value: 'hello'})
    expect(input.state.value()).toBe('hello')
  })

  it('defaults value to empty string', () => {
    const input = createInput()
    expect(input.state.value()).toBe('')
  })

  it('defaults type to text', () => {
    const input = createInput()
    expect(input.state.type()).toBe('text')
  })

  it('defaults disabled to false', () => {
    const input = createInput()
    expect(input.state.disabled()).toBe(false)
  })

  it('defaults readonly to false', () => {
    const input = createInput()
    expect(input.state.readonly()).toBe(false)
  })

  it('defaults required to false', () => {
    const input = createInput()
    expect(input.state.required()).toBe(false)
  })

  it('defaults placeholder to empty string', () => {
    const input = createInput()
    expect(input.state.placeholder()).toBe('')
  })

  it('defaults clearable to false', () => {
    const input = createInput()
    expect(input.state.clearable()).toBe(false)
  })

  it('defaults passwordToggle to false', () => {
    const input = createInput()
    expect(input.state.passwordToggle()).toBe(false)
  })

  it('defaults passwordVisible to false', () => {
    const input = createInput()
    expect(input.state.passwordVisible()).toBe(false)
  })

  it('defaults focused to false', () => {
    const input = createInput()
    expect(input.state.focused()).toBe(false)
  })

  // --- handleInput ---

  it('handleInput(v) updates value and calls onInput', () => {
    const onInput = vi.fn()
    const input = createInput({onInput})

    input.actions.handleInput('world')
    expect(input.state.value()).toBe('world')
    expect(onInput).toHaveBeenCalledWith('world')
  })

  it('handleInput(v) is no-op when disabled', () => {
    const onInput = vi.fn()
    const input = createInput({disabled: true, onInput})

    input.actions.handleInput('blocked')
    expect(input.state.value()).toBe('')
    expect(onInput).not.toHaveBeenCalled()
  })

  it('handleInput(v) is no-op when readonly', () => {
    const onInput = vi.fn()
    const input = createInput({readonly: true, onInput})

    input.actions.handleInput('blocked')
    expect(input.state.value()).toBe('')
    expect(onInput).not.toHaveBeenCalled()
  })

  // --- clear ---

  it('clear() sets value to "" and calls onClear', () => {
    const onClear = vi.fn()
    const input = createInput({value: 'hello', onClear})

    input.actions.clear()
    expect(input.state.value()).toBe('')
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('clear() is no-op when disabled', () => {
    const onClear = vi.fn()
    const input = createInput({value: 'hello', disabled: true, onClear})

    input.actions.clear()
    expect(input.state.value()).toBe('hello')
    expect(onClear).not.toHaveBeenCalled()
  })

  it('clear() is no-op when readonly', () => {
    const onClear = vi.fn()
    const input = createInput({value: 'hello', readonly: true, onClear})

    input.actions.clear()
    expect(input.state.value()).toBe('hello')
    expect(onClear).not.toHaveBeenCalled()
  })

  it('clear() does not call onInput (invariant 15)', () => {
    const onInput = vi.fn()
    const onClear = vi.fn()
    const input = createInput({value: 'hello', onInput, onClear})

    input.actions.clear()
    expect(onInput).not.toHaveBeenCalled()
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  // --- Escape key ---

  it('Escape key clears value when clearable and filled', () => {
    const onClear = vi.fn()
    const input = createInput({value: 'hello', clearable: true, onClear})

    input.actions.handleKeyDown({key: 'Escape'})
    expect(input.state.value()).toBe('')
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('Escape key does nothing when not clearable', () => {
    const onClear = vi.fn()
    const input = createInput({value: 'hello', clearable: false, onClear})

    input.actions.handleKeyDown({key: 'Escape'})
    expect(input.state.value()).toBe('hello')
    expect(onClear).not.toHaveBeenCalled()
  })

  it('Escape key does nothing when value is empty', () => {
    const onClear = vi.fn()
    const input = createInput({value: '', clearable: true, onClear})

    input.actions.handleKeyDown({key: 'Escape'})
    expect(input.state.value()).toBe('')
    expect(onClear).not.toHaveBeenCalled()
  })

  it('Escape key does nothing when disabled', () => {
    const onClear = vi.fn()
    const input = createInput({value: 'hello', clearable: true, disabled: true, onClear})

    input.actions.handleKeyDown({key: 'Escape'})
    expect(input.state.value()).toBe('hello')
    expect(onClear).not.toHaveBeenCalled()
  })

  it('Escape key does nothing when readonly', () => {
    const onClear = vi.fn()
    const input = createInput({value: 'hello', clearable: true, readonly: true, onClear})

    input.actions.handleKeyDown({key: 'Escape'})
    expect(input.state.value()).toBe('hello')
    expect(onClear).not.toHaveBeenCalled()
  })

  // --- Password toggle ---

  it('togglePasswordVisibility() toggles passwordVisible when type is password and toggle enabled', () => {
    const input = createInput({type: 'password', passwordToggle: true})

    expect(input.state.passwordVisible()).toBe(false)
    input.actions.togglePasswordVisibility()
    expect(input.state.passwordVisible()).toBe(true)
    input.actions.togglePasswordVisibility()
    expect(input.state.passwordVisible()).toBe(false)
  })

  it('togglePasswordVisibility() is no-op when type is not password', () => {
    const input = createInput({type: 'text', passwordToggle: true})

    input.actions.togglePasswordVisibility()
    expect(input.state.passwordVisible()).toBe(false)
  })

  it('togglePasswordVisibility() is no-op when password toggle is disabled', () => {
    const input = createInput({type: 'password', passwordToggle: false})

    input.actions.togglePasswordVisibility()
    expect(input.state.passwordVisible()).toBe(false)
  })

  // --- resolvedType ---

  it('resolvedType returns "text" when password is visible', () => {
    const input = createInput({type: 'password', passwordToggle: true})

    input.actions.togglePasswordVisibility()
    expect(input.state.resolvedType()).toBe('text')
  })

  it('resolvedType returns "password" when password is not visible', () => {
    const input = createInput({type: 'password', passwordToggle: true})

    expect(input.state.resolvedType()).toBe('password')
  })

  it('resolvedType equals type for non-password types', () => {
    const input = createInput({type: 'email'})
    expect(input.state.resolvedType()).toBe('email')

    input.actions.setType('url')
    expect(input.state.resolvedType()).toBe('url')

    input.actions.setType('tel')
    expect(input.state.resolvedType()).toBe('tel')

    input.actions.setType('search')
    expect(input.state.resolvedType()).toBe('search')
  })

  // --- setType resets passwordVisible ---

  it('setType resets passwordVisible to false', () => {
    const input = createInput({type: 'password', passwordToggle: true})

    input.actions.togglePasswordVisibility()
    expect(input.state.passwordVisible()).toBe(true)

    input.actions.setType('text')
    expect(input.state.passwordVisible()).toBe(false)
  })

  it('setType back to password keeps passwordVisible false', () => {
    const input = createInput({type: 'password', passwordToggle: true})

    input.actions.togglePasswordVisibility()
    expect(input.state.passwordVisible()).toBe(true)

    input.actions.setType('password')
    expect(input.state.passwordVisible()).toBe(false)
  })

  // --- setPasswordToggle resets passwordVisible ---

  it('setPasswordToggle(false) resets passwordVisible to false', () => {
    const input = createInput({type: 'password', passwordToggle: true})

    input.actions.togglePasswordVisibility()
    expect(input.state.passwordVisible()).toBe(true)

    input.actions.setPasswordToggle(false)
    expect(input.state.passwordVisible()).toBe(false)
  })

  // --- filled ---

  it('filled is true when value is non-empty, false when empty', () => {
    const input = createInput({value: 'hello'})
    expect(input.state.filled()).toBe(true)

    input.actions.setValue('')
    expect(input.state.filled()).toBe(false)
  })

  // --- showClearButton ---

  it('showClearButton reflects clearable && filled && !disabled && !readonly', () => {
    const input = createInput({value: 'hello', clearable: true})
    expect(input.state.showClearButton()).toBe(true)

    // not filled
    input.actions.setValue('')
    expect(input.state.showClearButton()).toBe(false)

    // filled but disabled
    input.actions.setValue('hello')
    input.actions.setDisabled(true)
    expect(input.state.showClearButton()).toBe(false)

    // filled but readonly
    input.actions.setDisabled(false)
    input.actions.setReadonly(true)
    expect(input.state.showClearButton()).toBe(false)

    // not clearable
    input.actions.setReadonly(false)
    input.actions.setClearable(false)
    expect(input.state.showClearButton()).toBe(false)
  })

  // --- showPasswordToggle ---

  it('showPasswordToggle reflects type === "password" && passwordToggle', () => {
    const input = createInput({type: 'password', passwordToggle: true})
    expect(input.state.showPasswordToggle()).toBe(true)

    input.actions.setPasswordToggle(false)
    expect(input.state.showPasswordToggle()).toBe(false)

    input.actions.setPasswordToggle(true)
    input.actions.setType('text')
    expect(input.state.showPasswordToggle()).toBe(false)
  })

  // --- getInputProps ---

  it('getInputProps() returns correct aria-disabled, aria-readonly, aria-required', () => {
    const input = createInput({disabled: true, readonly: true, required: true})
    const props = input.contracts.getInputProps()

    expect(props['aria-disabled']).toBe('true')
    expect(props['aria-readonly']).toBe('true')
    expect(props['aria-required']).toBe('true')
  })

  it('getInputProps() omits aria attributes when false', () => {
    const input = createInput()
    const props = input.contracts.getInputProps()

    expect(props['aria-disabled']).toBeUndefined()
    expect(props['aria-readonly']).toBeUndefined()
    expect(props['aria-required']).toBeUndefined()
  })

  it('getInputProps() returns tabindex "-1" when disabled, "0" otherwise', () => {
    const input = createInput()
    expect(input.contracts.getInputProps().tabindex).toBe('0')

    input.actions.setDisabled(true)
    expect(input.contracts.getInputProps().tabindex).toBe('-1')

    input.actions.setDisabled(false)
    expect(input.contracts.getInputProps().tabindex).toBe('0')
  })

  it('getInputProps() returns resolvedType as the type attribute', () => {
    const input = createInput({type: 'password', passwordToggle: true})
    expect(input.contracts.getInputProps().type).toBe('password')

    input.actions.togglePasswordVisibility()
    expect(input.contracts.getInputProps().type).toBe('text')
  })

  it('getInputProps() returns correct id', () => {
    const input = createInput({idBase: 'my-input'})
    expect(input.contracts.getInputProps().id).toBe('my-input-input')
  })

  it('getInputProps() returns placeholder when set, omitted when empty', () => {
    const input = createInput({placeholder: 'Enter text'})
    expect(input.contracts.getInputProps().placeholder).toBe('Enter text')

    input.actions.setPlaceholder('')
    expect(input.contracts.getInputProps().placeholder).toBeUndefined()
  })

  it('getInputProps() returns disabled and readonly native attributes', () => {
    const input = createInput({disabled: true, readonly: true})
    const props = input.contracts.getInputProps()

    expect(props.disabled).toBe(true)
    expect(props.readonly).toBe(true)
  })

  it('getInputProps() returns autocomplete "off" when type is password', () => {
    const input = createInput({type: 'password'})
    expect(input.contracts.getInputProps().autocomplete).toBe('off')

    input.actions.setType('text')
    expect(input.contracts.getInputProps().autocomplete).toBeUndefined()
  })

  // --- getClearButtonProps ---

  it('getClearButtonProps() returns hidden: true when clear button should not show', () => {
    const input = createInput({clearable: false, value: 'hello'})
    const props = input.contracts.getClearButtonProps()

    expect(props.hidden).toBe(true)
    expect(props['aria-hidden']).toBe('true')
  })

  it('getClearButtonProps() returns hidden: false when clear button should show', () => {
    const input = createInput({clearable: true, value: 'hello'})
    const props = input.contracts.getClearButtonProps()

    expect(props.hidden).toBeUndefined()
    expect(props['aria-hidden']).toBeUndefined()
  })

  it('getClearButtonProps() returns correct role and aria-label', () => {
    const input = createInput({clearable: true, value: 'hello'})
    const props = input.contracts.getClearButtonProps()

    expect(props.role).toBe('button')
    expect(props['aria-label']).toBe('Clear input')
  })

  it('getClearButtonProps() returns tabindex "-1"', () => {
    const input = createInput({clearable: true, value: 'hello'})
    expect(input.contracts.getClearButtonProps().tabindex).toBe('-1')
  })

  // --- getPasswordToggleProps ---

  it('getPasswordToggleProps() returns correct aria-pressed reflecting visibility', () => {
    const input = createInput({type: 'password', passwordToggle: true})

    expect(input.contracts.getPasswordToggleProps()['aria-pressed']).toBe('false')

    input.actions.togglePasswordVisibility()
    expect(input.contracts.getPasswordToggleProps()['aria-pressed']).toBe('true')
  })

  it('getPasswordToggleProps() returns correct aria-label based on visibility', () => {
    const input = createInput({type: 'password', passwordToggle: true})

    expect(input.contracts.getPasswordToggleProps()['aria-label']).toBe('Show password')

    input.actions.togglePasswordVisibility()
    expect(input.contracts.getPasswordToggleProps()['aria-label']).toBe('Hide password')
  })

  it('getPasswordToggleProps() returns hidden: true when toggle should not show', () => {
    const input = createInput({type: 'text', passwordToggle: false})
    const props = input.contracts.getPasswordToggleProps()

    expect(props.hidden).toBe(true)
    expect(props['aria-hidden']).toBe('true')
  })

  it('getPasswordToggleProps() returns hidden: false when toggle should show', () => {
    const input = createInput({type: 'password', passwordToggle: true})
    const props = input.contracts.getPasswordToggleProps()

    expect(props.hidden).toBeUndefined()
    expect(props['aria-hidden']).toBeUndefined()
  })

  it('getPasswordToggleProps() returns correct role', () => {
    const input = createInput({type: 'password', passwordToggle: true})
    expect(input.contracts.getPasswordToggleProps().role).toBe('button')
  })

  it('getPasswordToggleProps() returns tabindex "0" when visible, "-1" when hidden', () => {
    const input = createInput({type: 'password', passwordToggle: true})
    expect(input.contracts.getPasswordToggleProps().tabindex).toBe('0')

    input.actions.setPasswordToggle(false)
    expect(input.contracts.getPasswordToggleProps().tabindex).toBe('-1')
  })

  // --- setValue bypasses disabled/readonly ---

  it('setValue works even when disabled (programmatic/controlled update)', () => {
    const onInput = vi.fn()
    const input = createInput({disabled: true, onInput})

    input.actions.setValue('programmatic')
    expect(input.state.value()).toBe('programmatic')
    expect(onInput).toHaveBeenCalledWith('programmatic')
  })

  it('setValue works even when readonly (programmatic/controlled update)', () => {
    const onInput = vi.fn()
    const input = createInput({readonly: true, onInput})

    input.actions.setValue('programmatic')
    expect(input.state.value()).toBe('programmatic')
    expect(onInput).toHaveBeenCalledWith('programmatic')
  })

  // --- setFocused ---

  it('setFocused correctly updates focused state', () => {
    const input = createInput()

    expect(input.state.focused()).toBe(false)
    input.actions.setFocused(true)
    expect(input.state.focused()).toBe(true)
    input.actions.setFocused(false)
    expect(input.state.focused()).toBe(false)
  })

  // --- Additional action tests ---

  it('setDisabled updates disabled state', () => {
    const input = createInput()
    input.actions.setDisabled(true)
    expect(input.state.disabled()).toBe(true)
    input.actions.setDisabled(false)
    expect(input.state.disabled()).toBe(false)
  })

  it('setReadonly updates readonly state', () => {
    const input = createInput()
    input.actions.setReadonly(true)
    expect(input.state.readonly()).toBe(true)
    input.actions.setReadonly(false)
    expect(input.state.readonly()).toBe(false)
  })

  it('setRequired updates required state', () => {
    const input = createInput()
    input.actions.setRequired(true)
    expect(input.state.required()).toBe(true)
    input.actions.setRequired(false)
    expect(input.state.required()).toBe(false)
  })

  it('setPlaceholder updates placeholder', () => {
    const input = createInput()
    input.actions.setPlaceholder('Type here')
    expect(input.state.placeholder()).toBe('Type here')
  })

  it('setClearable updates clearable state', () => {
    const input = createInput()
    input.actions.setClearable(true)
    expect(input.state.clearable()).toBe(true)
    input.actions.setClearable(false)
    expect(input.state.clearable()).toBe(false)
  })

  it('setType updates type', () => {
    const input = createInput()
    input.actions.setType('email')
    expect(input.state.type()).toBe('email')
  })

  // --- Invariant: passwordVisible false when type !== password or toggle off ---

  it('passwordVisible is false when type changes away from password', () => {
    const input = createInput({type: 'password', passwordToggle: true})

    input.actions.togglePasswordVisibility()
    expect(input.state.passwordVisible()).toBe(true)

    input.actions.setType('email')
    expect(input.state.passwordVisible()).toBe(false)
    expect(input.state.type()).toBe('email')
  })
})
