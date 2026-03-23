import {describe, expect, it, vi} from 'vitest'
import {createListbox} from './index'

describe('createListbox', () => {
  it('sets first enabled option as active by default', () => {
    const listbox = createListbox({
      options: [{id: 'a', disabled: true}, {id: 'b'}, {id: 'c'}],
    })

    expect(listbox.state.activeId()).toBe('b')
  })

  it('moves active option and skips disabled items', () => {
    const listbox = createListbox({
      options: [{id: 'a'}, {id: 'b', disabled: true}, {id: 'c'}],
    })

    listbox.actions.setActive('a')
    listbox.actions.moveNext()

    expect(listbox.state.activeId()).toBe('c')
  })

  it('supports selection follows focus in single-select mode', () => {
    const listbox = createListbox({
      options: [{id: 'a'}, {id: 'b'}],
      selectionMode: 'single',
      selectionFollowsFocus: true,
    })

    listbox.actions.setActive('b')

    expect(listbox.state.selectedIds()).toEqual(['b'])
  })

  it('toggles selection in multi-select mode', () => {
    const listbox = createListbox({
      options: [{id: 'a'}, {id: 'b'}],
      selectionMode: 'multiple',
    })

    listbox.actions.toggleSelected('a')
    listbox.actions.toggleSelected('b')
    listbox.actions.toggleSelected('a')

    expect(listbox.state.selectedIds()).toEqual(['b'])
  })

  it('handles Ctrl+A in multi-select mode', () => {
    const listbox = createListbox({
      options: [{id: 'a'}, {id: 'b'}, {id: 'c', disabled: true}],
      selectionMode: 'multiple',
    })

    listbox.actions.handleKeyDown({
      key: 'a',
      ctrlKey: true,
      shiftKey: false,
      metaKey: false,
      altKey: false,
    })

    expect(listbox.state.selectedIds()).toEqual(['a', 'b'])
  })

  it('returns aria-activedescendant on root when strategy is aria-activedescendant', () => {
    const listbox = createListbox({
      options: [{id: 'a'}, {id: 'b'}],
      focusStrategy: 'aria-activedescendant',
      idBase: 'test',
    })

    listbox.actions.setActive('b')
    const rootProps = listbox.contracts.getRootProps()

    expect(rootProps.tabindex).toBe('0')
    expect(rootProps['aria-activedescendant']).toBe('test-option-b')
  })

  it('returns roving tabindex option props for active item', () => {
    const listbox = createListbox({
      options: [{id: 'a'}, {id: 'b'}],
      focusStrategy: 'roving-tabindex',
      idBase: 'r',
    })

    listbox.actions.setActive('b')

    expect(listbox.contracts.getRootProps().tabindex).toBe('-1')
    expect(listbox.contracts.getOptionProps('a').tabindex).toBe('-1')
    expect(listbox.contracts.getOptionProps('b').tabindex).toBe('0')
  })

  it('sets aria-disabled for disabled option props', () => {
    const listbox = createListbox({
      options: [{id: 'a', disabled: true}],
    })

    expect(listbox.contracts.getOptionProps('a')['aria-disabled']).toBe('true')
  })

  it('supports typeahead cycling for repeated same-character input', () => {
    const listbox = createListbox({
      options: [
        {id: 'a', label: 'Apple'},
        {id: 'b', label: 'Apricot'},
        {id: 'c', label: 'Banana'},
      ],
      initialActiveId: 'a',
    })

    listbox.actions.handleKeyDown({
      key: 'a',
      ctrlKey: false,
      shiftKey: false,
      metaKey: false,
      altKey: false,
    })
    expect(listbox.state.activeId()).toBe('b')

    listbox.actions.handleKeyDown({
      key: 'a',
      ctrlKey: false,
      shiftKey: false,
      metaKey: false,
      altKey: false,
    })
    expect(listbox.state.activeId()).toBe('a')
  })

  it('supports buffered typeahead query within timeout window', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    const listbox = createListbox({
      options: [
        {id: 'a', label: 'Alpha'},
        {id: 'b', label: 'Banana'},
        {id: 'c', label: 'Cobra'},
        {id: 'd', label: 'Delta'},
      ],
      initialActiveId: 'a',
      typeahead: {timeoutMs: 400},
    })

    try {
      listbox.actions.handleKeyDown({
        key: 'c',
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
        altKey: false,
      })
      expect(listbox.state.activeId()).toBe('c')

      vi.advanceTimersByTime(100)

      listbox.actions.handleKeyDown({
        key: 'o',
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
        altKey: false,
      })
      expect(listbox.state.activeId()).toBe('c')
    } finally {
      vi.useRealTimers()
    }
  })

  it('resets typeahead buffer after timeout', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    const listbox = createListbox({
      options: [
        {id: 'a', label: 'Alpha'},
        {id: 'b', label: 'Beta'},
        {id: 'c', label: 'Beetle'},
      ],
      initialActiveId: 'a',
      typeahead: {timeoutMs: 300},
    })

    try {
      listbox.actions.handleKeyDown({
        key: 'b',
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
        altKey: false,
      })
      expect(listbox.state.activeId()).toBe('b')

      vi.advanceTimersByTime(350)

      listbox.actions.handleKeyDown({
        key: 'e',
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
        altKey: false,
      })
      expect(listbox.state.activeId()).toBe('b')
    } finally {
      vi.useRealTimers()
    }
  })

  it('skips disabled options during typeahead', () => {
    const listbox = createListbox({
      options: [
        {id: 'a', label: 'Alpha'},
        {id: 'b', label: 'Berry', disabled: true},
        {id: 'c', label: 'Blue'},
      ],
      initialActiveId: 'a',
    })

    listbox.actions.handleKeyDown({
      key: 'b',
      ctrlKey: false,
      shiftKey: false,
      metaKey: false,
      altKey: false,
    })

    expect(listbox.state.activeId()).toBe('c')
  })

  it('does not apply range selection by default on Shift+Arrow', () => {
    const listbox = createListbox({
      options: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
      selectionMode: 'multiple',
      initialActiveId: 'a',
    })

    listbox.actions.handleKeyDown({
      key: 'ArrowDown',
      ctrlKey: false,
      shiftKey: true,
      metaKey: false,
      altKey: false,
    })

    expect(listbox.state.activeId()).toBe('b')
    expect(listbox.state.selectedIds()).toEqual([])
  })

  it('supports range selection with Shift+Arrow in multi-select mode', () => {
    const listbox = createListbox({
      options: [{id: 'a'}, {id: 'b'}, {id: 'c'}, {id: 'd'}],
      selectionMode: 'multiple',
      rangeSelection: true,
      initialActiveId: 'b',
    })

    listbox.actions.handleKeyDown({
      key: 'ArrowDown',
      ctrlKey: false,
      shiftKey: true,
      metaKey: false,
      altKey: false,
    })
    expect(listbox.state.activeId()).toBe('c')
    expect(listbox.state.selectedIds()).toEqual(['b', 'c'])

    listbox.actions.handleKeyDown({
      key: 'ArrowDown',
      ctrlKey: false,
      shiftKey: true,
      metaKey: false,
      altKey: false,
    })
    expect(listbox.state.activeId()).toBe('d')
    expect(listbox.state.selectedIds()).toEqual(['b', 'c', 'd'])

    listbox.actions.handleKeyDown({
      key: 'ArrowUp',
      ctrlKey: false,
      shiftKey: true,
      metaKey: false,
      altKey: false,
    })
    expect(listbox.state.activeId()).toBe('c')
    expect(listbox.state.selectedIds()).toEqual(['b', 'c'])
  })

  it('supports Shift+Space range selection from anchor', () => {
    const listbox = createListbox({
      options: [{id: 'a'}, {id: 'b'}, {id: 'c'}, {id: 'd'}],
      selectionMode: 'multiple',
      rangeSelection: true,
      initialActiveId: 'b',
    })

    listbox.actions.toggleSelected('b')
    listbox.actions.setActive('d')

    listbox.actions.handleKeyDown({
      key: ' ',
      ctrlKey: false,
      shiftKey: true,
      metaKey: false,
      altKey: false,
    })

    expect(listbox.state.selectedIds()).toEqual(['b', 'c', 'd'])
  })

  it('skips disabled options in Shift+Arrow range selection', () => {
    const listbox = createListbox({
      options: [{id: 'a'}, {id: 'b', disabled: true}, {id: 'c'}, {id: 'd'}],
      selectionMode: 'multiple',
      rangeSelection: true,
      initialActiveId: 'a',
    })

    listbox.actions.handleKeyDown({
      key: 'ArrowDown',
      ctrlKey: false,
      shiftKey: true,
      metaKey: false,
      altKey: false,
    })
    expect(listbox.state.activeId()).toBe('c')
    expect(listbox.state.selectedIds()).toEqual(['a', 'c'])

    listbox.actions.handleKeyDown({
      key: 'ArrowDown',
      ctrlKey: false,
      shiftKey: true,
      metaKey: false,
      altKey: false,
    })
    expect(listbox.state.activeId()).toBe('d')
    expect(listbox.state.selectedIds()).toEqual(['a', 'c', 'd'])
  })

  it('supports horizontal range selection parity via Shift+ArrowRight', () => {
    const listbox = createListbox({
      options: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
      selectionMode: 'multiple',
      rangeSelection: true,
      orientation: 'horizontal',
      initialActiveId: 'a',
    })

    listbox.actions.handleKeyDown({
      key: 'ArrowRight',
      ctrlKey: false,
      shiftKey: true,
      metaKey: false,
      altKey: false,
    })

    expect(listbox.state.activeId()).toBe('b')
    expect(listbox.state.selectedIds()).toEqual(['a', 'b'])
  })

  it('navigates with ArrowRight/ArrowLeft in horizontal orientation', () => {
    const listbox = createListbox({
      options: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
      orientation: 'horizontal',
      initialActiveId: 'a',
    })

    listbox.actions.handleKeyDown({
      key: 'ArrowRight',
      ctrlKey: false,
      shiftKey: false,
      metaKey: false,
      altKey: false,
    })
    expect(listbox.state.activeId()).toBe('b')

    listbox.actions.handleKeyDown({
      key: 'ArrowLeft',
      ctrlKey: false,
      shiftKey: false,
      metaKey: false,
      altKey: false,
    })
    expect(listbox.state.activeId()).toBe('a')

    listbox.actions.handleKeyDown({
      key: 'ArrowDown',
      ctrlKey: false,
      shiftKey: false,
      metaKey: false,
      altKey: false,
    })
    expect(listbox.state.activeId()).toBe('a')
  })

  it('returns tabindex -1 on all options under aria-activedescendant strategy', () => {
    const listbox = createListbox({
      options: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
      focusStrategy: 'aria-activedescendant',
      idBase: 'ad',
    })

    listbox.actions.setActive('b')

    expect(listbox.contracts.getOptionProps('a').tabindex).toBe('-1')
    expect(listbox.contracts.getOptionProps('b').tabindex).toBe('-1')
    expect(listbox.contracts.getOptionProps('c').tabindex).toBe('-1')

    const rootProps = listbox.contracts.getRootProps()
    expect(rootProps.tabindex).toBe('0')
    expect(rootProps['aria-activedescendant']).toBe('ad-option-b')
  })

  it('disables typeahead when typeahead option is false', () => {
    const listbox = createListbox({
      options: [
        {id: 'a', label: 'Alpha'},
        {id: 'b', label: 'Beta'},
      ],
      initialActiveId: 'a',
      typeahead: false,
    })

    listbox.actions.handleKeyDown({
      key: 'b',
      ctrlKey: false,
      shiftKey: false,
      metaKey: false,
      altKey: false,
    })

    expect(listbox.state.activeId()).toBe('a')
  })

  it('prevents disabled option from becoming selected via toggleSelected', () => {
    const listbox = createListbox({
      options: [{id: 'a'}, {id: 'b', disabled: true}],
      selectionMode: 'multiple',
    })

    listbox.actions.toggleSelected('b')

    expect(listbox.state.selectedIds()).toEqual([])
  })

  it('prevents disabled option from becoming selected via selectOnly', () => {
    const listbox = createListbox({
      options: [{id: 'a'}, {id: 'b', disabled: true}],
    })

    listbox.actions.selectOnly('b')

    expect(listbox.state.selectedIds()).toEqual([])
  })

  it('maintains at-most-one selection in single mode', () => {
    const listbox = createListbox({
      options: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
      selectionMode: 'single',
    })

    listbox.actions.selectOnly('a')
    expect(listbox.state.selectedIds()).toEqual(['a'])

    listbox.actions.selectOnly('b')
    expect(listbox.state.selectedIds()).toEqual(['b'])

    listbox.actions.toggleSelected('c')
    expect(listbox.state.selectedIds()).toEqual(['c'])
    expect(listbox.state.selectedIds().length).toBeLessThanOrEqual(1)
  })

  it('prevents disabled option from becoming active via setActive', () => {
    const listbox = createListbox({
      options: [{id: 'a'}, {id: 'b', disabled: true}],
      initialActiveId: 'a',
    })

    listbox.actions.setActive('b')

    expect(listbox.state.activeId()).toBe('a')
  })

  it('does not emit aria-activedescendant on root for roving-tabindex strategy', () => {
    const listbox = createListbox({
      options: [{id: 'a'}, {id: 'b'}],
      focusStrategy: 'roving-tabindex',
    })

    listbox.actions.setActive('b')
    const rootProps = listbox.contracts.getRootProps()

    expect(rootProps['aria-activedescendant']).toBeUndefined()
  })

  it('supports Ctrl+A only in multiple mode (no-op in single)', () => {
    const listbox = createListbox({
      options: [{id: 'a'}, {id: 'b'}],
      selectionMode: 'single',
    })

    listbox.actions.handleKeyDown({
      key: 'a',
      ctrlKey: true,
      shiftKey: false,
      metaKey: false,
      altKey: false,
    })

    expect(listbox.state.selectedIds()).toEqual([])
  })

  it('disables typeahead via object form { enabled: false }', () => {
    const listbox = createListbox({
      options: [
        {id: 'a', label: 'Alpha'},
        {id: 'b', label: 'Beta'},
      ],
      initialActiveId: 'a',
      typeahead: {enabled: false},
    })

    listbox.actions.handleKeyDown({
      key: 'b',
      ctrlKey: false,
      shiftKey: false,
      metaKey: false,
      altKey: false,
    })

    expect(listbox.state.activeId()).toBe('a')
  })

  it('range selection config via object form { enabled: true }', () => {
    const listbox = createListbox({
      options: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
      selectionMode: 'multiple',
      rangeSelection: {enabled: true},
      initialActiveId: 'a',
    })

    listbox.actions.handleKeyDown({
      key: 'ArrowDown',
      ctrlKey: false,
      shiftKey: true,
      metaKey: false,
      altKey: false,
    })

    expect(listbox.state.activeId()).toBe('b')
    expect(listbox.state.selectedIds()).toEqual(['a', 'b'])
  })

  it('Home and End navigate to first and last enabled options', () => {
    const listbox = createListbox({
      options: [
        {id: 'a', disabled: true},
        {id: 'b'},
        {id: 'c'},
        {id: 'd'},
        {id: 'e', disabled: true},
      ],
      initialActiveId: 'c',
    })

    listbox.actions.handleKeyDown({
      key: 'Home',
      ctrlKey: false,
      shiftKey: false,
      metaKey: false,
      altKey: false,
    })
    expect(listbox.state.activeId()).toBe('b')

    listbox.actions.handleKeyDown({
      key: 'End',
      ctrlKey: false,
      shiftKey: false,
      metaKey: false,
      altKey: false,
    })
    expect(listbox.state.activeId()).toBe('d')
  })

  // --- Default focus strategy ---

  it('defaults to aria-activedescendant focus strategy', () => {
    const listbox = createListbox({
      options: [{id: 'a'}, {id: 'b'}],
    })

    expect(listbox.state.focusStrategy).toBe('aria-activedescendant')
    expect(listbox.contracts.getRootProps().tabindex).toBe('0')
  })

  // --- Virtual scroll: aria-setsize / aria-posinset ---

  it('returns aria-setsize and aria-posinset in getOptionProps', () => {
    const listbox = createListbox({
      options: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
      idBase: 'vs',
    })

    const propsA = listbox.contracts.getOptionProps('a')
    const propsB = listbox.contracts.getOptionProps('b')
    const propsC = listbox.contracts.getOptionProps('c')

    expect(propsA['aria-setsize']).toBe('3')
    expect(propsA['aria-posinset']).toBe('1')
    expect(propsB['aria-setsize']).toBe('3')
    expect(propsB['aria-posinset']).toBe('2')
    expect(propsC['aria-setsize']).toBe('3')
    expect(propsC['aria-posinset']).toBe('3')
  })

  it('aria-setsize reflects total flat count when groups are used', () => {
    const listbox = createListbox({
      options: [
        {id: 'a', groupId: 'g1'},
        {id: 'b', groupId: 'g1'},
        {id: 'c', groupId: 'g2'},
        {id: 'd'},
      ],
      groups: [
        {id: 'g1', label: 'Group 1'},
        {id: 'g2', label: 'Group 2'},
      ],
    })

    expect(listbox.contracts.getOptionProps('a')['aria-setsize']).toBe('4')
    expect(listbox.contracts.getOptionProps('c')['aria-setsize']).toBe('4')
    expect(listbox.contracts.getOptionProps('d')['aria-setsize']).toBe('4')
  })

  it('aria-posinset is 1-based and reflects flat declaration order', () => {
    const listbox = createListbox({
      options: [
        {id: 'x', groupId: 'g1'},
        {id: 'y'},
        {id: 'z', groupId: 'g1'},
      ],
      groups: [{id: 'g1', label: 'Group 1'}],
    })

    expect(listbox.contracts.getOptionProps('x')['aria-posinset']).toBe('1')
    expect(listbox.contracts.getOptionProps('y')['aria-posinset']).toBe('2')
    expect(listbox.contracts.getOptionProps('z')['aria-posinset']).toBe('3')
  })

  // --- optionCount on state ---

  it('exposes optionCount on state', () => {
    const listbox = createListbox({
      options: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
    })

    expect(listbox.state.optionCount).toBe(3)
  })

  // --- groups on state ---

  it('exposes groups on state (empty when no groups)', () => {
    const listbox = createListbox({
      options: [{id: 'a'}],
    })

    expect(listbox.state.groups).toEqual([])
  })

  it('exposes groups on state when groups are provided', () => {
    const groups = [
      {id: 'g1', label: 'Group 1'},
      {id: 'g2', label: 'Group 2'},
    ]
    const listbox = createListbox({
      options: [{id: 'a', groupId: 'g1'}],
      groups,
    })

    expect(listbox.state.groups).toEqual(groups)
  })

  // --- Group contracts ---

  it('getGroupProps returns correct role and aria-labelledby', () => {
    const listbox = createListbox({
      options: [{id: 'a', groupId: 'fruits'}],
      groups: [{id: 'fruits', label: 'Fruits'}],
      idBase: 'lb',
    })

    const groupProps = listbox.contracts.getGroupProps('fruits')

    expect(groupProps.role).toBe('group')
    expect(groupProps.id).toBe('fruits')
    expect(groupProps['aria-labelledby']).toBe('lb-group-fruits-label')
  })

  it('getGroupLabelProps returns matching label id and role presentation', () => {
    const listbox = createListbox({
      options: [{id: 'a', groupId: 'fruits'}],
      groups: [{id: 'fruits', label: 'Fruits'}],
      idBase: 'lb',
    })

    const labelProps = listbox.contracts.getGroupLabelProps('fruits')

    expect(labelProps.id).toBe('lb-group-fruits-label')
    expect(labelProps.role).toBe('presentation')
  })

  it('getGroupProps throws for unknown groupId', () => {
    const listbox = createListbox({
      options: [{id: 'a'}],
      groups: [{id: 'fruits', label: 'Fruits'}],
    })

    expect(() => listbox.contracts.getGroupProps('unknown')).toThrow()
  })

  it('getGroupLabelProps throws for unknown groupId', () => {
    const listbox = createListbox({
      options: [{id: 'a'}],
      groups: [{id: 'fruits', label: 'Fruits'}],
    })

    expect(() => listbox.contracts.getGroupLabelProps('unknown')).toThrow()
  })

  it('getGroupOptions returns options belonging to a group in declaration order', () => {
    const listbox = createListbox({
      options: [
        {id: 'apple', label: 'Apple', groupId: 'fruits'},
        {id: 'carrot', label: 'Carrot', groupId: 'vegs'},
        {id: 'banana', label: 'Banana', groupId: 'fruits'},
        {id: 'pea', label: 'Pea', groupId: 'vegs'},
      ],
      groups: [
        {id: 'fruits', label: 'Fruits'},
        {id: 'vegs', label: 'Vegetables'},
      ],
    })

    const fruitOptions = listbox.contracts.getGroupOptions('fruits')
    expect(fruitOptions.map((o) => o.id)).toEqual(['apple', 'banana'])

    const vegOptions = listbox.contracts.getGroupOptions('vegs')
    expect(vegOptions.map((o) => o.id)).toEqual(['carrot', 'pea'])
  })

  it('getUngroupedOptions returns options not assigned to any group', () => {
    const listbox = createListbox({
      options: [
        {id: 'apple', groupId: 'fruits'},
        {id: 'water'},
        {id: 'banana', groupId: 'fruits'},
        {id: 'juice'},
      ],
      groups: [{id: 'fruits', label: 'Fruits'}],
    })

    const ungrouped = listbox.contracts.getUngroupedOptions()
    expect(ungrouped.map((o) => o.id)).toEqual(['water', 'juice'])
  })

  it('treats options with unknown groupId as ungrouped', () => {
    const listbox = createListbox({
      options: [
        {id: 'a', groupId: 'known'},
        {id: 'b', groupId: 'nonexistent'},
        {id: 'c'},
      ],
      groups: [{id: 'known', label: 'Known'}],
    })

    const ungrouped = listbox.contracts.getUngroupedOptions()
    expect(ungrouped.map((o) => o.id)).toEqual(['b', 'c'])

    const knownOptions = listbox.contracts.getGroupOptions('known')
    expect(knownOptions.map((o) => o.id)).toEqual(['a'])
  })

  // --- Navigation crosses group boundaries ---

  it('navigates linearly across group boundaries', () => {
    const listbox = createListbox({
      options: [
        {id: 'a', groupId: 'g1'},
        {id: 'b', groupId: 'g1'},
        {id: 'c', groupId: 'g2'},
        {id: 'd', groupId: 'g2'},
      ],
      groups: [
        {id: 'g1', label: 'Group 1'},
        {id: 'g2', label: 'Group 2'},
      ],
      initialActiveId: 'b',
    })

    listbox.actions.moveNext()
    expect(listbox.state.activeId()).toBe('c')

    listbox.actions.movePrev()
    expect(listbox.state.activeId()).toBe('b')
  })

  // --- Typeahead across groups ---

  it('typeahead operates across group boundaries', () => {
    const listbox = createListbox({
      options: [
        {id: 'a', label: 'Apple', groupId: 'fruits'},
        {id: 'b', label: 'Banana', groupId: 'fruits'},
        {id: 'c', label: 'Avocado', groupId: 'vegs'},
      ],
      groups: [
        {id: 'fruits', label: 'Fruits'},
        {id: 'vegs', label: 'Vegetables'},
      ],
      initialActiveId: 'a',
    })

    // Type 'a' - should cycle to next 'A' match across groups
    listbox.actions.handleKeyDown({
      key: 'a',
      ctrlKey: false,
      shiftKey: false,
      metaKey: false,
      altKey: false,
    })

    expect(listbox.state.activeId()).toBe('c')
  })

  // --- Range selection across groups ---

  it('range selection operates across group boundaries', () => {
    const listbox = createListbox({
      options: [
        {id: 'a', groupId: 'g1'},
        {id: 'b', groupId: 'g1'},
        {id: 'c', groupId: 'g2'},
      ],
      groups: [
        {id: 'g1', label: 'Group 1'},
        {id: 'g2', label: 'Group 2'},
      ],
      selectionMode: 'multiple',
      rangeSelection: true,
      initialActiveId: 'a',
    })

    listbox.actions.handleKeyDown({
      key: 'ArrowDown',
      ctrlKey: false,
      shiftKey: true,
      metaKey: false,
      altKey: false,
    })
    listbox.actions.handleKeyDown({
      key: 'ArrowDown',
      ctrlKey: false,
      shiftKey: true,
      metaKey: false,
      altKey: false,
    })

    expect(listbox.state.activeId()).toBe('c')
    expect(listbox.state.selectedIds()).toEqual(['a', 'b', 'c'])
  })
})
