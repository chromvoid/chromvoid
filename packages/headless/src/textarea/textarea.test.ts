import {describe, expect, it, vi} from 'vitest'

import {createTextarea} from './index'

describe('createTextarea', () => {
  it('has expected default state', () => {
    const textarea = createTextarea()

    expect(textarea.state.value()).toBe('')
    expect(textarea.state.disabled()).toBe(false)
    expect(textarea.state.readonly()).toBe(false)
    expect(textarea.state.required()).toBe(false)
    expect(textarea.state.placeholder()).toBe('')
    expect(textarea.state.rows()).toBe(4)
    expect(textarea.state.cols()).toBe(20)
    expect(textarea.state.minLength()).toBeUndefined()
    expect(textarea.state.maxLength()).toBeUndefined()
    expect(textarea.state.resize()).toBe('vertical')
    expect(textarea.state.focused()).toBe(false)
    expect(textarea.state.filled()).toBe(false)
  })

  it('normalizes invalid options at creation', () => {
    const textarea = createTextarea({
      rows: -1,
      cols: 0,
      minLength: -5,
      maxLength: Number.NaN,
      resize: 'vertical',
    })

    expect(textarea.state.rows()).toBe(4)
    expect(textarea.state.cols()).toBe(20)
    expect(textarea.state.minLength()).toBeUndefined()
    expect(textarea.state.maxLength()).toBeUndefined()
    expect(textarea.state.resize()).toBe('vertical')
  })

  it('handleInput updates value and calls onInput', () => {
    const onInput = vi.fn()
    const textarea = createTextarea({onInput})

    textarea.actions.handleInput('hello')

    expect(textarea.state.value()).toBe('hello')
    expect(onInput).toHaveBeenCalledWith('hello')
    expect(textarea.state.filled()).toBe(true)
  })

  it('handleInput is no-op when disabled', () => {
    const onInput = vi.fn()
    const textarea = createTextarea({disabled: true, onInput, value: 'base'})

    textarea.actions.handleInput('blocked')

    expect(textarea.state.value()).toBe('base')
    expect(onInput).not.toHaveBeenCalled()
  })

  it('handleInput is no-op when readonly', () => {
    const onInput = vi.fn()
    const textarea = createTextarea({readonly: true, onInput, value: 'base'})

    textarea.actions.handleInput('blocked')

    expect(textarea.state.value()).toBe('base')
    expect(onInput).not.toHaveBeenCalled()
  })

  it('setValue updates while disabled and does not call onInput', () => {
    const onInput = vi.fn()
    const textarea = createTextarea({disabled: true, onInput})

    textarea.actions.setValue('programmatic')

    expect(textarea.state.value()).toBe('programmatic')
    expect(onInput).not.toHaveBeenCalled()
  })

  it('setValue updates while readonly and does not call onInput', () => {
    const onInput = vi.fn()
    const textarea = createTextarea({readonly: true, onInput})

    textarea.actions.setValue('programmatic')

    expect(textarea.state.value()).toBe('programmatic')
    expect(onInput).not.toHaveBeenCalled()
  })

  it('setRows and setCols update with valid positive integers', () => {
    const textarea = createTextarea()

    textarea.actions.setRows(7)
    textarea.actions.setCols(44)

    expect(textarea.state.rows()).toBe(7)
    expect(textarea.state.cols()).toBe(44)
  })

  it('setRows and setCols ignore invalid values', () => {
    const textarea = createTextarea({rows: 6, cols: 30})

    textarea.actions.setRows(0)
    textarea.actions.setRows(Number.NaN)
    textarea.actions.setCols(-1)
    textarea.actions.setCols(Number.POSITIVE_INFINITY)

    expect(textarea.state.rows()).toBe(6)
    expect(textarea.state.cols()).toBe(30)
  })

  it('setMinLength and setMaxLength update constraints and allow clearing', () => {
    const textarea = createTextarea()

    textarea.actions.setMinLength(2.9)
    textarea.actions.setMaxLength(120.4)

    expect(textarea.state.minLength()).toBe(2)
    expect(textarea.state.maxLength()).toBe(120)

    textarea.actions.setMinLength(undefined)
    textarea.actions.setMaxLength(undefined)

    expect(textarea.state.minLength()).toBeUndefined()
    expect(textarea.state.maxLength()).toBeUndefined()
  })

  it('setResize updates resize mode', () => {
    const textarea = createTextarea()

    textarea.actions.setResize('none')
    expect(textarea.state.resize()).toBe('none')

    textarea.actions.setResize('vertical')
    expect(textarea.state.resize()).toBe('vertical')
  })

  it('setFocused updates focus state', () => {
    const textarea = createTextarea()

    textarea.actions.setFocused(true)
    expect(textarea.state.focused()).toBe(true)

    textarea.actions.setFocused(false)
    expect(textarea.state.focused()).toBe(false)
  })

  it('getTextareaProps returns correct aria and native attributes', () => {
    const textarea = createTextarea({
      idBase: 'comment',
      value: 'hello',
      disabled: true,
      readonly: true,
      required: true,
      placeholder: 'Write comment',
      rows: 6,
      cols: 44,
      minLength: 3,
      maxLength: 120,
    })

    const props = textarea.contracts.getTextareaProps()

    expect(props.id).toBe('comment-textarea')
    expect(props['aria-disabled']).toBe('true')
    expect(props['aria-readonly']).toBe('true')
    expect(props['aria-required']).toBe('true')
    expect(props.disabled).toBe(true)
    expect(props.readonly).toBe(true)
    expect(props.required).toBe(true)
    expect(props.placeholder).toBe('Write comment')
    expect(props.tabindex).toBe('-1')
    expect(props.rows).toBe(6)
    expect(props.cols).toBe(44)
    expect(props.minlength).toBe(3)
    expect(props.maxlength).toBe(120)
  })

  it('getTextareaProps uses interactive tabindex when enabled', () => {
    const textarea = createTextarea({disabled: false})

    expect(textarea.contracts.getTextareaProps().tabindex).toBe('0')
  })

  it('getTextareaProps omits role to keep native textarea semantics', () => {
    const textarea = createTextarea()
    const props = textarea.contracts.getTextareaProps()

    expect('role' in props).toBe(false)
  })
})
