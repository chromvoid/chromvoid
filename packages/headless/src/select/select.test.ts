import {describe, expect, it} from 'vitest'
import {expectAriaLinkage, expectRoleAndAria} from '../testing/apg-contract-harness'
import {createSelect} from './index'

describe('createSelect', () => {
  it('opens from trigger keyboard and closes on Escape', () => {
    const model = createSelect({
      idBase: 'select-kbd',
      options: [{id: 'a'}, {id: 'b'}],
    })

    model.actions.handleTriggerKeyDown({key: 'ArrowDown'})
    expect(model.state.isOpen()).toBe(true)
    expect(model.state.activeId()).toBe('a')

    model.actions.handleListboxKeyDown({key: 'Escape'})
    expect(model.state.isOpen()).toBe(false)
    expect(model.state.restoreTargetId()).toBe('select-kbd-trigger')
  })

  it('keeps trigger as combobox with aria-controls linkage to listbox', () => {
    const model = createSelect({
      idBase: 'select-contracts',
      options: [{id: 'a'}],
    })

    const trigger = model.contracts.getTriggerProps()
    const listbox = model.contracts.getListboxProps()

    expectRoleAndAria(trigger, 'combobox', {'aria-haspopup': 'listbox'})
    expectRoleAndAria(listbox, 'listbox')
    expectAriaLinkage(trigger, 'aria-controls', listbox)
  })

  it('trigger aria-activedescendant references active option when open', () => {
    const model = createSelect({
      idBase: 'select-ad',
      options: [{id: 'a'}, {id: 'b'}],
    })

    // When closed, no aria-activedescendant
    expect(model.contracts.getTriggerProps()['aria-activedescendant']).toBeUndefined()

    // Open and focus first option
    model.actions.handleTriggerKeyDown({key: 'ArrowDown'})
    expect(model.state.isOpen()).toBe(true)

    const triggerProps = model.contracts.getTriggerProps()
    expect(triggerProps['aria-activedescendant']).toBe('select-ad.listbox-option-a')
  })

  it('selects active option on Enter and updates selected value state', () => {
    const onSelectedIdChange: Array<string | null> = []
    const model = createSelect({
      idBase: 'select-select',
      options: [
        {id: 'a', label: 'Alpha'},
        {id: 'b', label: 'Beta'},
      ],
      onSelectedIdChange: (id) => onSelectedIdChange.push(id),
    })

    model.actions.handleTriggerKeyDown({key: 'ArrowDown'})
    model.actions.handleListboxKeyDown({key: 'ArrowDown'})
    model.actions.handleListboxKeyDown({key: 'Enter'})

    expect(model.state.selectedId()).toBe('b')
    expect(model.state.selectedLabel()).toBe('Beta')
    expect(model.contracts.getValueText()).toBe('Beta')
    expect(model.state.isOpen()).toBe(false)
    expect(onSelectedIdChange).toEqual(['b'])
  })

  it('opens at last option on ArrowUp', () => {
    const model = createSelect({
      idBase: 'select-arrow-up',
      options: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
    })

    model.actions.handleTriggerKeyDown({key: 'ArrowUp'})
    expect(model.state.activeId()).toBe('c')
  })

  it('multi-select toggle via select() grows and shrinks selectedIds', () => {
    const model = createSelect({
      idBase: 'select-multi-toggle',
      selectionMode: 'multiple',
      closeOnSelect: false,
      options: [
        {id: 'a', label: 'Alpha'},
        {id: 'b', label: 'Beta'},
        {id: 'c', label: 'Gamma'},
      ],
    })

    model.actions.open()
    model.actions.select('a')
    model.actions.select('b')
    expect(model.state.selectedIds()).toEqual(['a', 'b'])

    // Toggle off 'a'
    model.actions.select('a')
    expect(model.state.selectedIds()).toEqual(['b'])
  })

  it('multi-select getValueText() returns comma-joined labels', () => {
    const model = createSelect({
      idBase: 'select-multi-text',
      selectionMode: 'multiple',
      closeOnSelect: false,
      options: [
        {id: 'a', label: 'Alpha'},
        {id: 'b', label: 'Beta'},
      ],
    })

    model.actions.open()
    model.actions.select('a')
    model.actions.select('b')
    expect(model.contracts.getValueText()).toBe('Alpha, Beta')
  })

  it('multi-select getListboxProps() includes aria-multiselectable', () => {
    const model = createSelect({
      idBase: 'select-multi-aria',
      selectionMode: 'multiple',
      options: [{id: 'a'}],
    })

    expect(model.contracts.getListboxProps()['aria-multiselectable']).toBe('true')
  })

  it('single-select getListboxProps() omits aria-multiselectable', () => {
    const model = createSelect({
      idBase: 'select-single-aria',
      options: [{id: 'a'}],
    })

    expect(model.contracts.getListboxProps()['aria-multiselectable']).toBeUndefined()
  })

  it('multi-select + closeOnSelect:false keeps popup open after select', () => {
    const model = createSelect({
      idBase: 'select-multi-open',
      selectionMode: 'multiple',
      closeOnSelect: false,
      options: [{id: 'a'}, {id: 'b'}],
    })

    model.actions.open()
    model.actions.select('a')
    expect(model.state.isOpen()).toBe(true)
  })

  it('selectedLabels computed returns ordered labels', () => {
    const model = createSelect({
      idBase: 'select-labels',
      selectionMode: 'multiple',
      closeOnSelect: false,
      options: [
        {id: 'a', label: 'Alpha'},
        {id: 'b', label: 'Beta'},
        {id: 'c', label: 'Gamma'},
      ],
    })

    model.actions.open()
    model.actions.select('b')
    model.actions.select('c')
    expect(model.state.selectedLabels()).toEqual(['Beta', 'Gamma'])
  })

  it('disabled blocks all interactions', () => {
    const model = createSelect({
      idBase: 'select-disabled',
      disabled: true,
      options: [{id: 'a'}, {id: 'b'}],
    })

    expect(model.state.disabled()).toBe(true)

    // open should be no-op
    model.actions.open()
    expect(model.state.isOpen()).toBe(false)

    // toggle should be no-op
    model.actions.toggle()
    expect(model.state.isOpen()).toBe(false)

    // select should be no-op
    model.actions.select('a')
    expect(model.state.selectedId()).toBe(null)

    // keyboard should be no-op
    model.actions.handleTriggerKeyDown({key: 'ArrowDown'})
    expect(model.state.isOpen()).toBe(false)
  })

  it('disabled getTriggerProps() includes aria-disabled', () => {
    const model = createSelect({
      idBase: 'select-disabled-aria',
      disabled: true,
      options: [{id: 'a'}],
    })

    expect(model.contracts.getTriggerProps()['aria-disabled']).toBe('true')
  })

  it('required getTriggerProps() includes aria-required', () => {
    const model = createSelect({
      idBase: 'select-required-aria',
      required: true,
      options: [{id: 'a'}],
    })

    expect(model.contracts.getTriggerProps()['aria-required']).toBe('true')
  })

  it('clear() is no-op when disabled', () => {
    const model = createSelect({
      idBase: 'select-disabled-clear',
      disabled: false,
      initialSelectedId: 'a',
      options: [{id: 'a', label: 'Alpha'}, {id: 'b'}],
    })

    expect(model.state.selectedId()).toBe('a')

    model.actions.setDisabled(true)
    model.actions.clear()
    expect(model.state.selectedId()).toBe('a')
  })

  it('setDisabled dynamically toggles disabled state', () => {
    const model = createSelect({
      idBase: 'select-set-disabled',
      options: [{id: 'a'}, {id: 'b'}],
    })

    expect(model.state.disabled()).toBe(false)

    model.actions.setDisabled(true)
    expect(model.state.disabled()).toBe(true)

    // Interactions blocked
    model.actions.open()
    expect(model.state.isOpen()).toBe(false)

    // Re-enable
    model.actions.setDisabled(false)
    expect(model.state.disabled()).toBe(false)

    // Interactions work again
    model.actions.open()
    expect(model.state.isOpen()).toBe(true)
  })

  it('setRequired dynamically toggles required state', () => {
    const model = createSelect({
      idBase: 'select-set-required',
      options: [{id: 'a'}],
    })

    expect(model.state.required()).toBe(false)
    expect(model.contracts.getTriggerProps()['aria-required']).toBeUndefined()

    model.actions.setRequired(true)
    expect(model.state.required()).toBe(true)
    expect(model.contracts.getTriggerProps()['aria-required']).toBe('true')
  })
})
