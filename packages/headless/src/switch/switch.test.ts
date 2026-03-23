import {describe, expect, it} from 'vitest'
import {createSwitch} from './index'

describe('createSwitch', () => {
  it('toggles off to on and back to off', () => {
    const control = createSwitch({
      idBase: 'switch-toggle',
      isOn: false,
    })

    expect(control.state.isOn()).toBe(false)
    control.actions.toggle()
    expect(control.state.isOn()).toBe(true)
    control.actions.toggle()
    expect(control.state.isOn()).toBe(false)
  })

  it('toggles on Space key interaction', () => {
    const control = createSwitch({
      idBase: 'switch-space',
      isOn: false,
    })

    control.actions.handleKeyDown({key: ' ', preventDefault: () => {}})

    expect(control.state.isOn()).toBe(true)
  })

  it('toggles on Enter key interaction', () => {
    const control = createSwitch({
      idBase: 'switch-enter',
      isOn: false,
    })

    control.actions.handleKeyDown({key: 'Enter', preventDefault: () => {}})

    expect(control.state.isOn()).toBe(true)
  })

  it('does not toggle when disabled', () => {
    const control = createSwitch({
      idBase: 'switch-disabled',
      isOn: false,
      isDisabled: true,
    })

    control.actions.toggle()
    control.actions.handleClick()
    control.actions.handleKeyDown({key: 'Enter', preventDefault: () => {}})
    control.actions.handleKeyDown({key: ' ', preventDefault: () => {}})

    expect(control.state.isOn()).toBe(false)
  })

  it('maps aria-checked and disabled contract values', () => {
    const control = createSwitch({
      idBase: 'switch-aria',
      isOn: true,
    })

    expect(control.contracts.getSwitchProps()).toMatchObject({
      role: 'switch',
      tabindex: '0',
      'aria-checked': 'true',
      'aria-disabled': 'false',
    })

    control.actions.setDisabled(true)

    expect(control.contracts.getSwitchProps()).toMatchObject({
      tabindex: '-1',
      'aria-disabled': 'true',
    })
  })

  it('maps aria-checked to false after toggle off', () => {
    const control = createSwitch({
      idBase: 'switch-aria-off',
      isOn: true,
    })

    expect(control.contracts.getSwitchProps()['aria-checked']).toBe('true')

    control.actions.toggle()

    expect(control.contracts.getSwitchProps()['aria-checked']).toBe('false')
  })

  it('toggles on click interaction', () => {
    const control = createSwitch({
      idBase: 'switch-click',
      isOn: false,
    })

    control.actions.handleClick()
    expect(control.state.isOn()).toBe(true)

    control.actions.handleClick()
    expect(control.state.isOn()).toBe(false)
  })

  it('does not toggle on keyboard when disabled', () => {
    const control = createSwitch({
      idBase: 'switch-kbd-disabled',
      isOn: false,
      isDisabled: true,
    })

    const prevented: string[] = []
    const makeEvent = (key: string) => ({
      key,
      preventDefault: () => {
        prevented.push(key)
      },
    })

    control.actions.handleKeyDown(makeEvent(' '))
    control.actions.handleKeyDown(makeEvent('Enter'))

    expect(control.state.isOn()).toBe(false)
    expect(prevented).toEqual([])
  })

  it('calls preventDefault on Space and Enter', () => {
    const control = createSwitch({
      idBase: 'switch-prevent',
      isOn: false,
    })

    const prevented: string[] = []
    const makeEvent = (key: string) => ({
      key,
      preventDefault: () => {
        prevented.push(key)
      },
    })

    control.actions.handleKeyDown(makeEvent(' '))
    control.actions.handleKeyDown(makeEvent('Enter'))
    control.actions.handleKeyDown(makeEvent('Tab'))

    expect(prevented).toEqual([' ', 'Enter'])
  })

  it('does not respond to unrelated keys', () => {
    const control = createSwitch({
      idBase: 'switch-unrelated',
      isOn: false,
    })

    control.actions.handleKeyDown({key: 'Tab', preventDefault: () => {}})
    control.actions.handleKeyDown({key: 'ArrowDown', preventDefault: () => {}})
    control.actions.handleKeyDown({key: 'Escape', preventDefault: () => {}})

    expect(control.state.isOn()).toBe(false)
  })

  it('fires onCheckedChange callback on toggle', () => {
    const changes: boolean[] = []
    const control = createSwitch({
      idBase: 'switch-callback',
      isOn: false,
      onCheckedChange: (value) => changes.push(value),
    })

    control.actions.toggle()
    control.actions.toggle()

    expect(changes).toEqual([true, false])
  })

  it('fires onCheckedChange callback on setOn', () => {
    const changes: boolean[] = []
    const control = createSwitch({
      idBase: 'switch-seton-cb',
      isOn: false,
      onCheckedChange: (value) => changes.push(value),
    })

    control.actions.setOn(true)
    control.actions.setOn(false)

    expect(changes).toEqual([true, false])
  })

  it('includes aria-labelledby when ariaLabelledBy option is set', () => {
    const control = createSwitch({
      idBase: 'switch-label',
      ariaLabelledBy: 'label-id',
    })

    expect(control.contracts.getSwitchProps()['aria-labelledby']).toBe('label-id')
  })

  it('omits aria-labelledby when ariaLabelledBy option is not set', () => {
    const control = createSwitch({
      idBase: 'switch-no-label',
    })

    expect(control.contracts.getSwitchProps()['aria-labelledby']).toBeUndefined()
  })

  it('includes aria-describedby when ariaDescribedBy option is set', () => {
    const control = createSwitch({
      idBase: 'switch-desc',
      ariaDescribedBy: 'desc-id',
    })

    expect(control.contracts.getSwitchProps()['aria-describedby']).toBe('desc-id')
  })

  it('omits aria-describedby when ariaDescribedBy option is not set', () => {
    const control = createSwitch({
      idBase: 'switch-no-desc',
    })

    expect(control.contracts.getSwitchProps()['aria-describedby']).toBeUndefined()
  })

  it('generates correct id in contract props', () => {
    const control = createSwitch({
      idBase: 'my-switch',
    })

    expect(control.contracts.getSwitchProps().id).toBe('my-switch-root')
  })

  it('does not fire onCheckedChange when disabled toggle is attempted', () => {
    const changes: boolean[] = []
    const control = createSwitch({
      idBase: 'switch-disabled-cb',
      isOn: false,
      isDisabled: true,
      onCheckedChange: (value) => changes.push(value),
    })

    control.actions.toggle()
    control.actions.handleClick()
    control.actions.handleKeyDown({key: ' ', preventDefault: () => {}})
    control.actions.handleKeyDown({key: 'Enter', preventDefault: () => {}})

    expect(changes).toEqual([])
  })

  it('setDisabled updates the disabled state', () => {
    const control = createSwitch({
      idBase: 'switch-set-disabled',
      isDisabled: false,
    })

    expect(control.state.isDisabled()).toBe(false)
    control.actions.setDisabled(true)
    expect(control.state.isDisabled()).toBe(true)
    control.actions.setDisabled(false)
    expect(control.state.isDisabled()).toBe(false)
  })

  it('uses default option values', () => {
    const control = createSwitch()

    expect(control.state.isOn()).toBe(false)
    expect(control.state.isDisabled()).toBe(false)
    expect(control.contracts.getSwitchProps().id).toBe('switch-root')
  })
})
