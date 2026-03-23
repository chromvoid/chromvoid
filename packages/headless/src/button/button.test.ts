import {describe, expect, it, vi} from 'vitest'
import {createButton} from './index'

describe('createButton', () => {
  it('triggers onPress on click', () => {
    const onPress = vi.fn()
    const button = createButton({
      idBase: 'button-click',
      onPress,
    })

    button.actions.handleClick()

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('triggers onPress on Enter keydown', () => {
    const onPress = vi.fn()
    const button = createButton({
      idBase: 'button-enter',
      onPress,
    })

    button.actions.handleKeyDown({key: 'Enter'})

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('triggers onPress on Space keyup only', () => {
    const onPress = vi.fn()
    const preventDefault = vi.fn()
    const button = createButton({
      idBase: 'button-space',
      onPress,
    })

    button.actions.handleKeyDown({key: ' ', preventDefault})
    expect(onPress).toHaveBeenCalledTimes(0)
    expect(preventDefault).toHaveBeenCalledTimes(1)

    button.actions.handleKeyUp({key: ' '})
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('reflects disabled state and blocks activation when disabled', () => {
    const onPress = vi.fn()
    const button = createButton({
      idBase: 'button-disabled',
      onPress,
      isDisabled: true,
    })

    button.actions.handleClick()
    button.actions.handleKeyDown({key: 'Enter'})
    button.actions.handleKeyUp({key: ' '})

    expect(onPress).not.toHaveBeenCalled()
    expect(button.contracts.getButtonProps()).toMatchObject({
      tabindex: '-1',
      'aria-disabled': 'true',
    })
  })

  it('reflects loading state and blocks activation when loading', () => {
    const onPress = vi.fn()
    const button = createButton({
      idBase: 'button-loading',
      onPress,
      isLoading: true,
    })

    button.actions.handleClick()
    button.actions.handleKeyDown({key: 'Enter'})
    button.actions.handleKeyUp({key: ' '})

    expect(onPress).not.toHaveBeenCalled()
    expect(button.contracts.getButtonProps()).toMatchObject({
      tabindex: '-1',
      'aria-disabled': 'true',
      'aria-busy': 'true',
    })
  })

  it('exposes aria-pressed only for toggle buttons', () => {
    const toggle = createButton({
      idBase: 'button-toggle',
      isPressed: false,
    })

    expect(toggle.contracts.getButtonProps()['aria-pressed']).toBe('false')
    toggle.actions.press()
    expect(toggle.state.isPressed()).toBe(true)
    expect(toggle.contracts.getButtonProps()['aria-pressed']).toBe('true')

    const regular = createButton({
      idBase: 'button-regular',
    })

    expect(regular.contracts.getButtonProps()['aria-pressed']).toBeUndefined()
  })

  it('returns enabled tabindex contract by default', () => {
    const button = createButton({
      idBase: 'button-tabindex',
    })

    expect(button.contracts.getButtonProps().tabindex).toBe('0')
  })

  it('does not call preventDefault on Space when disabled', () => {
    const onPress = vi.fn()
    const preventDefault = vi.fn()
    const button = createButton({
      idBase: 'button-disabled-space',
      onPress,
      isDisabled: true,
    })

    button.actions.handleKeyDown({key: ' ', preventDefault})
    expect(preventDefault).not.toHaveBeenCalled()
    expect(onPress).not.toHaveBeenCalled()
  })

  it('blocks Enter keydown when disabled', () => {
    const onPress = vi.fn()
    const button = createButton({
      idBase: 'button-disabled-enter',
      onPress,
      isDisabled: true,
    })

    button.actions.handleKeyDown({key: 'Enter'})
    expect(onPress).not.toHaveBeenCalled()
  })

  it('updates tabindex and aria-disabled when dynamically disabled via setDisabled', () => {
    const onPress = vi.fn()
    const button = createButton({
      idBase: 'button-dynamic-disable',
      onPress,
    })

    expect(button.contracts.getButtonProps().tabindex).toBe('0')
    expect(button.contracts.getButtonProps()['aria-disabled']).toBeUndefined()

    button.actions.setDisabled(true)

    expect(button.state.isDisabled()).toBe(true)
    expect(button.contracts.getButtonProps().tabindex).toBe('-1')
    expect(button.contracts.getButtonProps()['aria-disabled']).toBe('true')

    button.actions.handleClick()
    expect(onPress).not.toHaveBeenCalled()

    button.actions.setDisabled(false)

    expect(button.contracts.getButtonProps().tabindex).toBe('0')
    expect(button.contracts.getButtonProps()['aria-disabled']).toBeUndefined()

    button.actions.handleClick()
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('updates loading contract and activation gating via setLoading', () => {
    const onPress = vi.fn()
    const button = createButton({
      idBase: 'button-dynamic-loading',
      onPress,
    })

    expect(button.contracts.getButtonProps().tabindex).toBe('0')
    expect(button.contracts.getButtonProps()['aria-busy']).toBeUndefined()

    button.actions.setLoading(true)

    expect(button.state.isLoading()).toBe(true)
    expect(button.contracts.getButtonProps().tabindex).toBe('-1')
    expect(button.contracts.getButtonProps()['aria-disabled']).toBe('true')
    expect(button.contracts.getButtonProps()['aria-busy']).toBe('true')

    button.actions.handleClick()
    expect(onPress).not.toHaveBeenCalled()

    button.actions.setLoading(false)

    expect(button.state.isLoading()).toBe(false)
    expect(button.contracts.getButtonProps().tabindex).toBe('0')
    expect(button.contracts.getButtonProps()['aria-disabled']).toBeUndefined()
    expect(button.contracts.getButtonProps()['aria-busy']).toBeUndefined()

    button.actions.handleClick()
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('press action manually triggers onPress and respects disabled', () => {
    const onPress = vi.fn()
    const button = createButton({
      idBase: 'button-press-action',
      onPress,
    })

    button.actions.press()
    expect(onPress).toHaveBeenCalledTimes(1)

    button.actions.setDisabled(true)
    button.actions.press()
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('toggle button toggles isPressed on each activation', () => {
    const onPress = vi.fn()
    const button = createButton({
      idBase: 'button-toggle-cycle',
      isPressed: false,
      onPress,
    })

    expect(button.state.isPressed()).toBe(false)

    button.actions.press()
    expect(button.state.isPressed()).toBe(true)
    expect(onPress).toHaveBeenCalledTimes(1)

    button.actions.press()
    expect(button.state.isPressed()).toBe(false)
    expect(onPress).toHaveBeenCalledTimes(2)
  })

  it('returns correct role in getButtonProps', () => {
    const button = createButton({idBase: 'button-role'})
    expect(button.contracts.getButtonProps().role).toBe('button')
  })

  it('getButtonProps wires click and keyboard handlers', () => {
    const onPress = vi.fn()
    const button = createButton({idBase: 'button-props-wiring', onPress})
    const props = button.contracts.getButtonProps()

    props.onClick()
    expect(onPress).toHaveBeenCalledTimes(1)

    props.onKeyDown({key: 'Enter'})
    expect(onPress).toHaveBeenCalledTimes(2)

    props.onKeyUp({key: ' '})
    expect(onPress).toHaveBeenCalledTimes(3)
  })

  it('disabled toggle button does not change isPressed state', () => {
    const onPress = vi.fn()
    const button = createButton({
      idBase: 'button-toggle-disabled',
      isPressed: false,
      isDisabled: true,
      onPress,
    })

    expect(button.state.isPressed()).toBe(false)

    button.actions.press()
    expect(button.state.isPressed()).toBe(false)

    button.actions.handleClick()
    expect(button.state.isPressed()).toBe(false)

    button.actions.handleKeyDown({key: 'Enter'})
    expect(button.state.isPressed()).toBe(false)

    button.actions.handleKeyUp({key: ' '})
    expect(button.state.isPressed()).toBe(false)

    expect(onPress).not.toHaveBeenCalled()
  })

  it('loading toggle button does not change isPressed state', () => {
    const onPress = vi.fn()
    const button = createButton({
      idBase: 'button-toggle-loading',
      isPressed: false,
      isLoading: true,
      onPress,
    })

    expect(button.state.isPressed()).toBe(false)

    button.actions.press()
    button.actions.handleClick()
    button.actions.handleKeyDown({key: 'Enter'})
    button.actions.handleKeyUp({key: ' '})

    expect(button.state.isPressed()).toBe(false)
    expect(onPress).not.toHaveBeenCalled()
  })

  it('dynamically disabled toggle button stops toggling', () => {
    const onPress = vi.fn()
    const button = createButton({
      idBase: 'button-toggle-dynamic-disable',
      isPressed: false,
      onPress,
    })

    button.actions.press()
    expect(button.state.isPressed()).toBe(true)
    expect(onPress).toHaveBeenCalledTimes(1)

    button.actions.setDisabled(true)

    button.actions.press()
    expect(button.state.isPressed()).toBe(true)
    expect(onPress).toHaveBeenCalledTimes(1)

    button.actions.setDisabled(false)

    button.actions.press()
    expect(button.state.isPressed()).toBe(false)
    expect(onPress).toHaveBeenCalledTimes(2)
  })

  it('handles legacy Spacebar key value', () => {
    const onPress = vi.fn()
    const preventDefault = vi.fn()
    const button = createButton({
      idBase: 'button-spacebar-legacy',
      onPress,
    })

    button.actions.handleKeyDown({key: 'Spacebar', preventDefault})
    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(onPress).not.toHaveBeenCalled()

    button.actions.handleKeyUp({key: 'Spacebar'})
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('ignores non-activation keys', () => {
    const onPress = vi.fn()
    const preventDefault = vi.fn()
    const button = createButton({
      idBase: 'button-non-activation',
      onPress,
    })

    button.actions.handleKeyDown({key: 'Tab', preventDefault})
    button.actions.handleKeyDown({key: 'Escape', preventDefault})
    button.actions.handleKeyDown({key: 'a', preventDefault})
    button.actions.handleKeyDown({key: 'ArrowDown', preventDefault})

    button.actions.handleKeyUp({key: 'Tab'})
    button.actions.handleKeyUp({key: 'Escape'})
    button.actions.handleKeyUp({key: 'a'})
    button.actions.handleKeyUp({key: 'Enter'})

    expect(onPress).not.toHaveBeenCalled()
    expect(preventDefault).not.toHaveBeenCalled()
  })

  it('getButtonProps id follows idBase-root convention', () => {
    const button = createButton({idBase: 'my-btn'})
    expect(button.contracts.getButtonProps().id).toBe('my-btn-root')
  })

  it('getButtonProps disabled output blocks via wired handlers', () => {
    const onPress = vi.fn()
    const button = createButton({
      idBase: 'button-disabled-props',
      isDisabled: true,
      onPress,
    })
    const props = button.contracts.getButtonProps()

    expect(props.tabindex).toBe('-1')
    expect(props['aria-disabled']).toBe('true')

    props.onClick()
    props.onKeyDown({key: 'Enter'})
    props.onKeyUp({key: ' '})

    expect(onPress).not.toHaveBeenCalled()
  })

  it('setPressed still works while loading for controlled usage', () => {
    const button = createButton({
      idBase: 'button-set-pressed-loading',
      isPressed: false,
      isLoading: true,
    })

    button.actions.setPressed(true)
    expect(button.state.isPressed()).toBe(true)
    expect(button.contracts.getButtonProps()['aria-pressed']).toBe('true')

    button.actions.setPressed(false)
    expect(button.state.isPressed()).toBe(false)
    expect(button.contracts.getButtonProps()['aria-pressed']).toBe('false')
  })
})
