import {describe, expect, it} from 'vitest'
import {createRadioGroup} from './index'

describe('createRadioGroup', () => {
  it('keeps single selection behavior when selecting different items', () => {
    const group = createRadioGroup({
      idBase: 'radio-single',
      items: [{id: 'a'}, {id: 'b'}],
    })

    group.actions.select('a')
    expect(group.state.value()).toBe('a')

    group.actions.select('b')
    expect(group.state.value()).toBe('b')
    expect(group.contracts.getRadioProps('a')['aria-checked']).toBe('false')
    expect(group.contracts.getRadioProps('b')['aria-checked']).toBe('true')
  })

  it('handles arrow navigation with wrapping and selection follows focus', () => {
    const group = createRadioGroup({
      idBase: 'radio-wrap',
      items: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
      initialValue: 'c',
    })

    group.actions.handleKeyDown({key: 'ArrowRight'})

    expect(group.state.activeId()).toBe('a')
    expect(group.state.value()).toBe('a')
  })

  it('skips disabled radios during navigation', () => {
    const group = createRadioGroup({
      idBase: 'radio-disabled-skip',
      items: [{id: 'a'}, {id: 'b', disabled: true}, {id: 'c'}],
      initialValue: 'a',
    })

    group.actions.handleKeyDown({key: 'ArrowRight'})

    expect(group.state.activeId()).toBe('c')
    expect(group.state.value()).toBe('c')
  })

  it('supports Home and End key behavior', () => {
    const group = createRadioGroup({
      idBase: 'radio-home-end',
      items: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
      initialValue: 'b',
    })

    group.actions.handleKeyDown({key: 'End'})
    expect(group.state.activeId()).toBe('c')
    expect(group.state.value()).toBe('c')

    group.actions.handleKeyDown({key: 'Home'})
    expect(group.state.activeId()).toBe('a')
    expect(group.state.value()).toBe('a')
  })

  it('initializes first enabled radio as tabbable when no selection provided', () => {
    const group = createRadioGroup({
      idBase: 'radio-no-selection',
      items: [{id: 'a', disabled: true}, {id: 'b'}, {id: 'c'}],
    })

    expect(group.state.value()).toBeNull()
    expect(group.state.activeId()).toBe('b')
    expect(group.contracts.getRadioProps('b').tabindex).toBe('0')
  })

  it('initializes selected radio as tabbable when selection provided', () => {
    const group = createRadioGroup({
      idBase: 'radio-selection',
      items: [{id: 'a'}, {id: 'b'}],
      initialValue: 'b',
    })

    expect(group.state.value()).toBe('b')
    expect(group.state.activeId()).toBe('b')
    expect(group.contracts.getRadioProps('b').tabindex).toBe('0')
    expect(group.contracts.getRadioProps('a').tabindex).toBe('-1')
  })

  it('group-level disabled blocks all interactions', () => {
    const group = createRadioGroup({
      idBase: 'radio-group-disabled',
      items: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
      isDisabled: true,
    })

    group.actions.select('b')
    expect(group.state.value()).toBeNull()

    group.actions.handleKeyDown({key: 'ArrowRight'})
    expect(group.state.activeId()).toBe('a')

    expect(group.contracts.getRootProps()['aria-disabled']).toBe('true')
  })

  it('returns aria-describedby in getRadioProps when item has describedBy', () => {
    const group = createRadioGroup({
      idBase: 'radio-desc',
      items: [
        {id: 'a', describedBy: 'desc-a'},
        {id: 'b'},
      ],
    })

    const propsA = group.contracts.getRadioProps('a')
    expect(propsA['aria-describedby']).toBe('radio-desc-radio-a-desc')

    const propsB = group.contracts.getRadioProps('b')
    expect(propsB['aria-describedby']).toBeUndefined()
  })
})
