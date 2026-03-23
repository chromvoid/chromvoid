import {describe, expect, it, vi} from 'vitest'
import {createCombobox} from './index'

describe('createCombobox', () => {
  it('opens on input update and applies filtering', () => {
    const combobox = createCombobox({
      options: [
        {id: 'a', label: 'Alpha'},
        {id: 'b', label: 'Beta'},
      ],
    })

    combobox.actions.setInputValue('be')

    expect(combobox.state.isOpen()).toBe(true)
    expect(combobox.contracts.getVisibleOptions().map((option) => option.id)).toEqual(['b'])
    expect(combobox.state.activeId()).toBe('b')
  })

  it('opens and navigates with ArrowDown', () => {
    const combobox = createCombobox({
      options: [
        {id: 'a', label: 'Alpha'},
        {id: 'b', label: 'Beta'},
      ],
    })

    combobox.actions.handleKeyDown({
      key: 'ArrowDown',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })

    expect(combobox.state.isOpen()).toBe(true)
    expect(combobox.state.activeId()).toBe('a')

    combobox.actions.handleKeyDown({
      key: 'ArrowDown',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })

    expect(combobox.state.activeId()).toBe('b')
  })

  it('skips disabled options during navigation', () => {
    const combobox = createCombobox({
      options: [
        {id: 'a', label: 'Alpha'},
        {id: 'b', label: 'Beta', disabled: true},
        {id: 'c', label: 'Gamma'},
      ],
    })

    combobox.actions.handleKeyDown({
      key: 'ArrowDown',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })
    combobox.actions.handleKeyDown({
      key: 'ArrowDown',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })

    expect(combobox.state.activeId()).toBe('c')
  })

  it('commits active option on Enter', () => {
    const combobox = createCombobox({
      options: [
        {id: 'a', label: 'Alpha'},
        {id: 'b', label: 'Beta'},
      ],
    })

    combobox.actions.setActive('b')
    combobox.actions.open()

    combobox.actions.handleKeyDown({
      key: 'Enter',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })

    expect(combobox.state.selectedId()).toBe('b')
    expect(combobox.state.inputValue()).toBe('Beta')
    expect(combobox.state.isOpen()).toBe(false)
  })

  it('closes on Escape', () => {
    const combobox = createCombobox({
      options: [{id: 'a', label: 'Alpha'}],
      initialOpen: true,
      initialSelectedId: 'a',
    })

    combobox.actions.handleKeyDown({
      key: 'Escape',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })

    expect(combobox.state.isOpen()).toBe(false)
    expect(combobox.state.selectedId()).toBe('a')
  })

  it('provides aria-activedescendant through input props', () => {
    const combobox = createCombobox({
      options: [
        {id: 'a', label: 'Alpha'},
        {id: 'b', label: 'Beta'},
      ],
      idBase: 'search',
    })

    combobox.actions.open()
    combobox.actions.setActive('b')
    const inputProps = combobox.contracts.getInputProps()

    expect(inputProps.role).toBe('combobox')
    expect(inputProps['aria-activedescendant']).toBe('search-option-b')
  })

  it('uses custom filter hook when provided', () => {
    const combobox = createCombobox({
      options: [
        {id: 'a', label: 'Alpha'},
        {id: 'b', label: 'Beta'},
      ],
      filter(option, value) {
        return option.label.startsWith(value)
      },
    })

    combobox.actions.setInputValue('B')

    expect(combobox.contracts.getVisibleOptions().map((option) => option.id)).toEqual(['b'])
  })

  it('initializes from selected id', () => {
    const combobox = createCombobox({
      options: [
        {id: 'a', label: 'Alpha'},
        {id: 'b', label: 'Beta'},
      ],
      initialSelectedId: 'b',
    })

    expect(combobox.state.selectedId()).toBe('b')
    expect(combobox.state.inputValue()).toBe('Beta')
    expect(combobox.state.activeId()).toBe('b')
  })

  it('supports typeahead cycling across repeated same-character input', () => {
    const combobox = createCombobox({
      options: [
        {id: 'a', label: 'Apple'},
        {id: 'b', label: 'Apricot'},
        {id: 'c', label: 'Banana'},
      ],
      initialOpen: true,
    })

    combobox.actions.setActive('a')

    combobox.actions.handleKeyDown({
      key: 'a',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })
    expect(combobox.state.activeId()).toBe('b')

    combobox.actions.handleKeyDown({
      key: 'a',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })
    expect(combobox.state.activeId()).toBe('a')
  })

  it('resets typeahead buffer after timeout window', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    const combobox = createCombobox({
      options: [
        {id: 'a', label: 'Cobra'},
        {id: 'b', label: 'Orange'},
        {id: 'c', label: 'Octopus'},
      ],
      typeahead: {timeoutMs: 300},
      initialOpen: true,
    })

    try {
      combobox.actions.setActive('a')

      combobox.actions.handleKeyDown({
        key: 'o',
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      })
      expect(combobox.state.activeId()).toBe('b')

      vi.advanceTimersByTime(350)

      combobox.actions.handleKeyDown({
        key: 'c',
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      })
      expect(combobox.state.activeId()).toBe('a')
    } finally {
      vi.useRealTimers()
    }
  })

  it('skips disabled options during typeahead matching', () => {
    const combobox = createCombobox({
      options: [
        {id: 'a', label: 'Alpha'},
        {id: 'b', label: 'Blueberry', disabled: true},
        {id: 'c', label: 'Blue'},
      ],
      initialOpen: true,
    })

    combobox.actions.handleKeyDown({
      key: 'b',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })

    expect(combobox.state.activeId()).toBe('c')
  })

  it('navigates to first option on Home and last on End', () => {
    const combobox = createCombobox({
      options: [
        {id: 'a', label: 'Alpha'},
        {id: 'b', label: 'Beta'},
        {id: 'c', label: 'Gamma'},
      ],
    })

    combobox.actions.open()
    combobox.actions.setActive('b')

    combobox.actions.handleKeyDown({
      key: 'End',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })
    expect(combobox.state.activeId()).toBe('c')
    expect(combobox.state.isOpen()).toBe(true)

    combobox.actions.handleKeyDown({
      key: 'Home',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })
    expect(combobox.state.activeId()).toBe('a')
  })

  it('tracks hasSelection computed correctly', () => {
    const combobox = createCombobox({
      options: [
        {id: 'a', label: 'Alpha'},
        {id: 'b', label: 'Beta'},
      ],
    })

    expect(combobox.state.hasSelection()).toBe(false)

    combobox.actions.select('a')
    expect(combobox.state.hasSelection()).toBe(true)

    combobox.actions.clearSelection()
    expect(combobox.state.hasSelection()).toBe(false)
  })

  it('rejects commit of disabled option via select()', () => {
    const combobox = createCombobox({
      options: [
        {id: 'a', label: 'Alpha', disabled: true},
        {id: 'b', label: 'Beta'},
      ],
    })

    combobox.actions.open()

    // select() must reject disabled option
    combobox.actions.select('a')
    expect(combobox.state.selectedId()).toBe(null)
    expect(combobox.state.inputValue()).toBe('')
  })

  it('rejects setActive on disabled option and preserves current activeId', () => {
    const combobox = createCombobox({
      options: [
        {id: 'a', label: 'Alpha', disabled: true},
        {id: 'b', label: 'Beta'},
      ],
    })

    combobox.actions.open()
    // open() auto-activates first enabled option
    expect(combobox.state.activeId()).toBe('b')

    // setActive() must reject disabled option — activeId stays unchanged
    combobox.actions.setActive('a')
    expect(combobox.state.activeId()).toBe('b')
  })

  it('commitActive is a no-op when activeId is null', () => {
    const combobox = createCombobox({
      options: [
        {id: 'a', label: 'Alpha', disabled: true},
      ],
    })

    // All options disabled → activeId must be null
    combobox.actions.open()
    expect(combobox.state.activeId()).toBe(null)

    combobox.actions.commitActive()
    expect(combobox.state.selectedId()).toBe(null)
    expect(combobox.state.inputValue()).toBe('')
  })

  it('handles open and close transitions', () => {
    const combobox = createCombobox({
      options: [{id: 'a', label: 'Alpha'}],
    })

    expect(combobox.state.isOpen()).toBe(false)

    combobox.actions.open()
    expect(combobox.state.isOpen()).toBe(true)

    combobox.actions.close()
    expect(combobox.state.isOpen()).toBe(false)
  })

  it('provides coherent active-descendant between input and option props', () => {
    const combobox = createCombobox({
      options: [
        {id: 'a', label: 'Alpha'},
        {id: 'b', label: 'Beta'},
      ],
      idBase: 'test',
    })

    combobox.actions.open()
    combobox.actions.setActive('b')

    const inputProps = combobox.contracts.getInputProps()
    const optionAProps = combobox.contracts.getOptionProps('a')
    const optionBProps = combobox.contracts.getOptionProps('b')

    // Input must reference the active option's DOM id
    expect(inputProps['aria-activedescendant']).toBe(optionBProps.id)

    // Active option must have data-active true, inactive false
    expect(optionBProps['data-active']).toBe('true')
    expect(optionAProps['data-active']).toBe('false')

    // Controls linkage
    expect(inputProps['aria-controls']).toBe(combobox.contracts.getListboxProps().id)
  })

  it('does not expose aria-activedescendant when popup is closed', () => {
    const combobox = createCombobox({
      options: [
        {id: 'a', label: 'Alpha'},
        {id: 'b', label: 'Beta'},
      ],
      initialSelectedId: 'b',
    })

    // Popup is closed; activeId is 'b' from init, but aria-activedescendant should be absent
    expect(combobox.state.isOpen()).toBe(false)
    expect(combobox.state.activeId()).toBe('b')

    const inputProps = combobox.contracts.getInputProps()
    expect(inputProps['aria-activedescendant']).toBeUndefined()
  })

  it('exposes aria-activedescendant when popup is open and active option exists', () => {
    const combobox = createCombobox({
      options: [
        {id: 'a', label: 'Alpha'},
        {id: 'b', label: 'Beta'},
      ],
      idBase: 'cb',
    })

    combobox.actions.open()
    combobox.actions.setActive('a')

    const inputProps = combobox.contracts.getInputProps()
    expect(inputProps['aria-activedescendant']).toBe('cb-option-a')
  })

  it('navigates with ArrowUp', () => {
    const combobox = createCombobox({
      options: [
        {id: 'a', label: 'Alpha'},
        {id: 'b', label: 'Beta'},
        {id: 'c', label: 'Gamma'},
      ],
    })

    combobox.actions.open()
    combobox.actions.setActive('c')

    combobox.actions.handleKeyDown({
      key: 'ArrowUp',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })

    expect(combobox.state.activeId()).toBe('b')
  })

  it('sets activeId to null when filtering yields zero results', () => {
    const combobox = createCombobox({
      options: [
        {id: 'a', label: 'Alpha'},
        {id: 'b', label: 'Beta'},
      ],
    })

    combobox.actions.open()
    expect(combobox.state.activeId()).toBe('a')

    combobox.actions.setInputValue('zzz')
    expect(combobox.contracts.getVisibleOptions()).toEqual([])
    expect(combobox.state.activeId()).toBe(null)
  })

  it('revalidates activeId when filter removes the currently active option', () => {
    const combobox = createCombobox({
      options: [
        {id: 'a', label: 'Alpha'},
        {id: 'b', label: 'Beta'},
      ],
    })

    combobox.actions.open()
    combobox.actions.setActive('b')
    expect(combobox.state.activeId()).toBe('b')

    combobox.actions.setInputValue('al')
    expect(combobox.contracts.getVisibleOptions().map((o) => o.id)).toEqual(['a'])
    expect(combobox.state.activeId()).toBe('a')
  })

  it('rejects setActive on a non-visible (filtered out) option', () => {
    const combobox = createCombobox({
      options: [
        {id: 'a', label: 'Alpha'},
        {id: 'b', label: 'Beta'},
      ],
    })

    combobox.actions.setInputValue('al')
    expect(combobox.contracts.getVisibleOptions().map((o) => o.id)).toEqual(['a'])

    combobox.actions.setActive('b')
    expect(combobox.state.activeId()).toBe('a')
  })

  it('uses startsWith match mode when configured', () => {
    const combobox = createCombobox({
      options: [
        {id: 'a', label: 'Alpha'},
        {id: 'b', label: 'Beta'},
      ],
      matchMode: 'startsWith',
    })

    combobox.actions.setInputValue('ta')
    expect(combobox.contracts.getVisibleOptions()).toEqual([])
    expect(combobox.state.activeId()).toBe(null)

    combobox.actions.setInputValue('be')
    expect(combobox.contracts.getVisibleOptions().map((option) => option.id)).toEqual(['b'])
    expect(combobox.state.activeId()).toBe('b')
  })

  it('keeps popup open on commit when closeOnSelect is false', () => {
    const combobox = createCombobox({
      options: [
        {id: 'a', label: 'Alpha'},
        {id: 'b', label: 'Beta'},
      ],
      closeOnSelect: false,
    })

    combobox.actions.open()
    combobox.actions.setActive('b')

    combobox.actions.handleKeyDown({
      key: 'Enter',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })

    expect(combobox.state.selectedId()).toBe('b')
    expect(combobox.state.inputValue()).toBe('Beta')
    expect(combobox.state.isOpen()).toBe(true)
  })

  it('wraps navigation from last to first and first to last', () => {
    const combobox = createCombobox({
      options: [
        {id: 'a', label: 'Alpha'},
        {id: 'b', label: 'Beta'},
      ],
    })

    combobox.actions.open()
    combobox.actions.setActive('b')

    // ArrowDown from last wraps to first
    combobox.actions.handleKeyDown({
      key: 'ArrowDown',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })
    expect(combobox.state.activeId()).toBe('a')

    // ArrowUp from first wraps to last
    combobox.actions.handleKeyDown({
      key: 'ArrowUp',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })
    expect(combobox.state.activeId()).toBe('b')
  })

  describe('select-only mode', () => {
    const key = (k: string) => ({key: k, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false})

    it('setInputValue is a no-op', () => {
      const combobox = createCombobox({
        options: [
          {id: 'a', label: 'Alpha'},
          {id: 'b', label: 'Beta'},
        ],
        type: 'select-only',
      })

      combobox.actions.setInputValue('test')
      expect(combobox.state.inputValue()).toBe('')
      expect(combobox.state.isOpen()).toBe(false)
    })

    it('Space opens popup when closed', () => {
      const combobox = createCombobox({
        options: [
          {id: 'a', label: 'Alpha'},
          {id: 'b', label: 'Beta'},
        ],
        type: 'select-only',
      })

      expect(combobox.state.isOpen()).toBe(false)
      combobox.actions.handleKeyDown(key(' '))
      expect(combobox.state.isOpen()).toBe(true)
    })

    it('Space commits active option when open', () => {
      const combobox = createCombobox({
        options: [
          {id: 'a', label: 'Alpha'},
          {id: 'b', label: 'Beta'},
        ],
        type: 'select-only',
        initialOpen: true,
      })

      combobox.actions.setActive('b')
      combobox.actions.handleKeyDown(key(' '))

      expect(combobox.state.selectedId()).toBe('b')
      expect(combobox.state.inputValue()).toBe('Beta')
      expect(combobox.state.isOpen()).toBe(false)
    })

    it('Enter opens popup when closed', () => {
      const combobox = createCombobox({
        options: [
          {id: 'a', label: 'Alpha'},
          {id: 'b', label: 'Beta'},
        ],
        type: 'select-only',
      })

      expect(combobox.state.isOpen()).toBe(false)
      combobox.actions.handleKeyDown(key('Enter'))
      expect(combobox.state.isOpen()).toBe(true)
    })

    it('aria-autocomplete is absent from input props', () => {
      const combobox = createCombobox({
        options: [{id: 'a', label: 'Alpha'}],
        type: 'select-only',
      })

      const inputProps = combobox.contracts.getInputProps()
      expect(inputProps['aria-autocomplete']).toBeUndefined()
    })

    it('type-to-select via printable characters', () => {
      const combobox = createCombobox({
        options: [
          {id: 'a', label: 'Alpha'},
          {id: 'b', label: 'Beta'},
          {id: 'c', label: 'Gamma'},
        ],
        type: 'select-only',
        initialOpen: true,
      })

      combobox.actions.handleKeyDown(key('b'))
      expect(combobox.state.activeId()).toBe('b')
    })

    it('inputValue syncs with selected option label on commit', () => {
      const combobox = createCombobox({
        options: [
          {id: 'a', label: 'Alpha'},
          {id: 'b', label: 'Beta'},
        ],
        type: 'select-only',
      })

      combobox.actions.open()
      combobox.actions.setActive('a')
      combobox.actions.commitActive()

      expect(combobox.state.selectedId()).toBe('a')
      expect(combobox.state.inputValue()).toBe('Alpha')
    })

    it('all options are always visible (no filtering)', () => {
      const combobox = createCombobox({
        options: [
          {id: 'a', label: 'Alpha'},
          {id: 'b', label: 'Beta'},
        ],
        type: 'select-only',
      })

      // Even though inputValue is empty, all options are visible
      const visible = combobox.contracts.getVisibleOptions()
      expect(visible.length).toBe(2)
    })

    it('keyboard navigation works: ArrowDown/ArrowUp when closed opens popup', () => {
      const combobox = createCombobox({
        options: [
          {id: 'a', label: 'Alpha'},
          {id: 'b', label: 'Beta'},
        ],
        type: 'select-only',
      })

      combobox.actions.handleKeyDown(key('ArrowDown'))
      expect(combobox.state.isOpen()).toBe(true)
      expect(combobox.state.activeId()).toBe('a')
    })

    it('exposes type signal', () => {
      const combobox = createCombobox({
        options: [{id: 'a', label: 'Alpha'}],
        type: 'select-only',
      })

      expect(combobox.state.type()).toBe('select-only')
    })

    it('editable mode exposes type signal as editable', () => {
      const combobox = createCombobox({
        options: [{id: 'a', label: 'Alpha'}],
      })

      expect(combobox.state.type()).toBe('editable')
    })
  })

  describe('multi-select', () => {
    const key = (k: string) => ({key: k, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false})

    it('toggleOption adds and removes from selectedIds', () => {
      const combobox = createCombobox({
        options: [
          {id: 'a', label: 'Alpha'},
          {id: 'b', label: 'Beta'},
        ],
        multiple: true,
      })

      combobox.actions.toggleOption('a')
      expect(combobox.state.selectedIds()).toEqual(['a'])

      combobox.actions.toggleOption('b')
      expect(combobox.state.selectedIds()).toEqual(['a', 'b'])

      combobox.actions.toggleOption('a')
      expect(combobox.state.selectedIds()).toEqual(['b'])
    })

    it('commitActive toggles instead of replacing', () => {
      const combobox = createCombobox({
        options: [
          {id: 'a', label: 'Alpha'},
          {id: 'b', label: 'Beta'},
        ],
        multiple: true,
        initialOpen: true,
      })

      combobox.actions.setActive('a')
      combobox.actions.commitActive()
      expect(combobox.state.selectedIds()).toEqual(['a'])

      combobox.actions.setActive('b')
      combobox.actions.commitActive()
      expect(combobox.state.selectedIds()).toEqual(['a', 'b'])

      // Toggle off 'a'
      combobox.actions.setActive('a')
      combobox.actions.commitActive()
      expect(combobox.state.selectedIds()).toEqual(['b'])
    })

    it('selectedId equals selectedIds[0]', () => {
      const combobox = createCombobox({
        options: [
          {id: 'a', label: 'Alpha'},
          {id: 'b', label: 'Beta'},
        ],
        multiple: true,
      })

      expect(combobox.state.selectedId()).toBe(null)

      combobox.actions.toggleOption('b')
      expect(combobox.state.selectedId()).toBe('b')

      combobox.actions.toggleOption('a')
      expect(combobox.state.selectedId()).toBe('b')

      combobox.actions.toggleOption('b')
      expect(combobox.state.selectedId()).toBe('a')
    })

    it('getOptionProps returns aria-selected true for all selected options', () => {
      const combobox = createCombobox({
        options: [
          {id: 'a', label: 'Alpha'},
          {id: 'b', label: 'Beta'},
          {id: 'c', label: 'Gamma'},
        ],
        multiple: true,
      })

      combobox.actions.toggleOption('a')
      combobox.actions.toggleOption('c')

      expect(combobox.contracts.getOptionProps('a')['aria-selected']).toBe('true')
      expect(combobox.contracts.getOptionProps('b')['aria-selected']).toBe('false')
      expect(combobox.contracts.getOptionProps('c')['aria-selected']).toBe('true')
    })

    it('getListboxProps returns aria-multiselectable true', () => {
      const combobox = createCombobox({
        options: [{id: 'a', label: 'Alpha'}],
        multiple: true,
      })

      expect(combobox.contracts.getListboxProps()['aria-multiselectable']).toBe('true')
    })

    it('getListboxProps does not return aria-multiselectable in single mode', () => {
      const combobox = createCombobox({
        options: [{id: 'a', label: 'Alpha'}],
      })

      expect(combobox.contracts.getListboxProps()['aria-multiselectable']).toBeUndefined()
    })

    it('closeOnSelect defaults to false', () => {
      const combobox = createCombobox({
        options: [
          {id: 'a', label: 'Alpha'},
          {id: 'b', label: 'Beta'},
        ],
        multiple: true,
        initialOpen: true,
      })

      combobox.actions.setActive('a')
      combobox.actions.commitActive()

      // Popup should stay open
      expect(combobox.state.isOpen()).toBe(true)
    })

    it('removeSelected removes specific id', () => {
      const combobox = createCombobox({
        options: [
          {id: 'a', label: 'Alpha'},
          {id: 'b', label: 'Beta'},
        ],
        multiple: true,
      })

      combobox.actions.toggleOption('a')
      combobox.actions.toggleOption('b')
      expect(combobox.state.selectedIds()).toEqual(['a', 'b'])

      combobox.actions.removeSelected('a')
      expect(combobox.state.selectedIds()).toEqual(['b'])
    })

    it('removeSelected is a no-op for non-selected id', () => {
      const combobox = createCombobox({
        options: [
          {id: 'a', label: 'Alpha'},
          {id: 'b', label: 'Beta'},
        ],
        multiple: true,
      })

      combobox.actions.toggleOption('a')
      combobox.actions.removeSelected('b')
      expect(combobox.state.selectedIds()).toEqual(['a'])
    })

    it('toggleOption is a no-op in single mode', () => {
      const combobox = createCombobox({
        options: [
          {id: 'a', label: 'Alpha'},
          {id: 'b', label: 'Beta'},
        ],
      })

      combobox.actions.toggleOption('a')
      expect(combobox.state.selectedIds()).toEqual([])
      expect(combobox.state.selectedId()).toBe(null)
    })

    it('inputValue is not overwritten on commit in multi editable mode', () => {
      const combobox = createCombobox({
        options: [
          {id: 'a', label: 'Alpha'},
          {id: 'b', label: 'Beta'},
        ],
        multiple: true,
        initialOpen: true,
      })

      combobox.actions.setInputValue('al')
      combobox.actions.setActive('a')
      combobox.actions.commitActive()

      // inputValue should NOT be overwritten to the label
      expect(combobox.state.inputValue()).toBe('al')
      expect(combobox.state.selectedIds()).toEqual(['a'])
    })

    it('select(id) calls toggleOption in multi mode', () => {
      const combobox = createCombobox({
        options: [
          {id: 'a', label: 'Alpha'},
          {id: 'b', label: 'Beta'},
        ],
        multiple: true,
      })

      combobox.actions.select('a')
      combobox.actions.select('b')
      expect(combobox.state.selectedIds()).toEqual(['a', 'b'])

      combobox.actions.select('a')
      expect(combobox.state.selectedIds()).toEqual(['b'])
    })

    it('exposes multiple signal', () => {
      const combobox = createCombobox({
        options: [{id: 'a', label: 'Alpha'}],
        multiple: true,
      })

      expect(combobox.state.multiple()).toBe(true)
    })

    it('multiple defaults to false', () => {
      const combobox = createCombobox({
        options: [{id: 'a', label: 'Alpha'}],
      })

      expect(combobox.state.multiple()).toBe(false)
    })

    it('initialSelectedIds initializes multi-select state', () => {
      const combobox = createCombobox({
        options: [
          {id: 'a', label: 'Alpha'},
          {id: 'b', label: 'Beta'},
          {id: 'c', label: 'Gamma'},
        ],
        multiple: true,
        initialSelectedIds: ['a', 'c'],
      })

      expect(combobox.state.selectedIds()).toEqual(['a', 'c'])
      expect(combobox.state.selectedId()).toBe('a')
      expect(combobox.state.hasSelection()).toBe(true)
    })

    it('hasSelection is true when selectedIds is non-empty', () => {
      const combobox = createCombobox({
        options: [
          {id: 'a', label: 'Alpha'},
          {id: 'b', label: 'Beta'},
        ],
        multiple: true,
      })

      expect(combobox.state.hasSelection()).toBe(false)

      combobox.actions.toggleOption('a')
      expect(combobox.state.hasSelection()).toBe(true)

      combobox.actions.toggleOption('a')
      expect(combobox.state.hasSelection()).toBe(false)
    })

    it('select-only multi mode keeps inputValue empty', () => {
      const combobox = createCombobox({
        options: [
          {id: 'a', label: 'Alpha'},
          {id: 'b', label: 'Beta'},
        ],
        type: 'select-only',
        multiple: true,
        initialOpen: true,
      })

      combobox.actions.setActive('a')
      combobox.actions.commitActive()

      expect(combobox.state.selectedIds()).toEqual(['a'])
      expect(combobox.state.inputValue()).toBe('')
    })
  })

  describe('clearable', () => {
    it('clear() resets selection and input value', () => {
      const combobox = createCombobox({
        options: [
          {id: 'a', label: 'Alpha'},
          {id: 'b', label: 'Beta'},
        ],
        initialSelectedId: 'a',
      })

      expect(combobox.state.selectedId()).toBe('a')
      expect(combobox.state.inputValue()).toBe('Alpha')

      combobox.actions.clear()

      expect(combobox.state.selectedId()).toBe(null)
      expect(combobox.state.selectedIds()).toEqual([])
      expect(combobox.state.inputValue()).toBe('')
    })

    it('clearSelection() resets selection but preserves input value', () => {
      const combobox = createCombobox({
        options: [
          {id: 'a', label: 'Alpha'},
          {id: 'b', label: 'Beta'},
        ],
        initialSelectedId: 'a',
      })

      expect(combobox.state.selectedId()).toBe('a')
      expect(combobox.state.inputValue()).toBe('Alpha')

      combobox.actions.clearSelection()

      expect(combobox.state.selectedId()).toBe(null)
      expect(combobox.state.selectedIds()).toEqual([])
      expect(combobox.state.inputValue()).toBe('Alpha')
    })

    it('clear() works in multi-select mode', () => {
      const combobox = createCombobox({
        options: [
          {id: 'a', label: 'Alpha'},
          {id: 'b', label: 'Beta'},
        ],
        multiple: true,
      })

      combobox.actions.toggleOption('a')
      combobox.actions.toggleOption('b')
      combobox.actions.setInputValue('test')

      combobox.actions.clear()

      expect(combobox.state.selectedIds()).toEqual([])
      expect(combobox.state.selectedId()).toBe(null)
      expect(combobox.state.inputValue()).toBe('')
    })

    it('hasSelection is false after clear()', () => {
      const combobox = createCombobox({
        options: [{id: 'a', label: 'Alpha'}],
        initialSelectedId: 'a',
      })

      expect(combobox.state.hasSelection()).toBe(true)
      combobox.actions.clear()
      expect(combobox.state.hasSelection()).toBe(false)
    })
  })

  describe('option groups', () => {
    const fruitGroup = {
      id: 'fruits',
      label: 'Fruits',
      options: [
        {id: 'apple', label: 'Apple'},
        {id: 'banana', label: 'Banana'},
      ],
    }
    const vegGroup = {
      id: 'vegs',
      label: 'Vegetables',
      options: [
        {id: 'carrot', label: 'Carrot'},
        {id: 'potato', label: 'Potato'},
      ],
    }

    it('getVisibleOptions returns grouped structure', () => {
      const combobox = createCombobox({
        options: [fruitGroup, vegGroup],
      })

      const visible = combobox.contracts.getVisibleOptions()
      expect(visible).toEqual([
        {id: 'fruits', label: 'Fruits', options: [
          {id: 'apple', label: 'Apple'},
          {id: 'banana', label: 'Banana'},
        ]},
        {id: 'vegs', label: 'Vegetables', options: [
          {id: 'carrot', label: 'Carrot'},
          {id: 'potato', label: 'Potato'},
        ]},
      ])
    })

    it('empty groups are filtered out', () => {
      const combobox = createCombobox({
        options: [fruitGroup, vegGroup],
      })

      combobox.actions.setInputValue('car')
      const visible = combobox.contracts.getVisibleOptions()

      // Fruits group should be gone (no match), only vegs with carrot
      expect(visible).toEqual([
        {id: 'vegs', label: 'Vegetables', options: [
          {id: 'carrot', label: 'Carrot'},
        ]},
      ])
    })

    it('getGroupProps returns correct ARIA', () => {
      const combobox = createCombobox({
        options: [fruitGroup],
        idBase: 'cb',
      })

      const groupProps = combobox.contracts.getGroupProps('fruits')
      expect(groupProps.role).toBe('group')
      expect(groupProps['aria-labelledby']).toBeDefined()

      const labelProps = combobox.contracts.getGroupLabelProps('fruits')
      expect(labelProps.role).toBe('presentation')
      expect(groupProps['aria-labelledby']).toBe(labelProps.id)
    })

    it('navigation crosses group boundaries seamlessly', () => {
      const combobox = createCombobox({
        options: [fruitGroup, vegGroup],
      })

      combobox.actions.open()
      // First option should be 'apple'
      expect(combobox.state.activeId()).toBe('apple')

      combobox.actions.moveNext()
      expect(combobox.state.activeId()).toBe('banana')

      combobox.actions.moveNext()
      expect(combobox.state.activeId()).toBe('carrot')

      combobox.actions.moveNext()
      expect(combobox.state.activeId()).toBe('potato')

      // Wraps back to first
      combobox.actions.moveNext()
      expect(combobox.state.activeId()).toBe('apple')
    })

    it('getFlatVisibleOptions returns flat list', () => {
      const combobox = createCombobox({
        options: [fruitGroup, vegGroup],
      })

      const flat = combobox.contracts.getFlatVisibleOptions()
      expect(flat.map((o) => o.id)).toEqual(['apple', 'banana', 'carrot', 'potato'])
    })

    it('mixed flat and grouped options work together', () => {
      const combobox = createCombobox({
        options: [
          {id: 'standalone', label: 'Standalone'},
          fruitGroup,
        ],
      })

      const visible = combobox.contracts.getVisibleOptions()
      expect(visible).toEqual([
        {id: 'standalone', label: 'Standalone'},
        {id: 'fruits', label: 'Fruits', options: [
          {id: 'apple', label: 'Apple'},
          {id: 'banana', label: 'Banana'},
        ]},
      ])

      const flat = combobox.contracts.getFlatVisibleOptions()
      expect(flat.map((o) => o.id)).toEqual(['standalone', 'apple', 'banana'])
    })

    it('disabled options within groups are skipped during navigation', () => {
      const combobox = createCombobox({
        options: [{
          id: 'fruits',
          label: 'Fruits',
          options: [
            {id: 'apple', label: 'Apple'},
            {id: 'banana', label: 'Banana', disabled: true},
            {id: 'cherry', label: 'Cherry'},
          ],
        }],
      })

      combobox.actions.open()
      expect(combobox.state.activeId()).toBe('apple')

      combobox.actions.moveNext()
      expect(combobox.state.activeId()).toBe('cherry')
    })

    it('getOptionProps works for options inside groups', () => {
      const combobox = createCombobox({
        options: [fruitGroup],
        idBase: 'cb',
      })

      const props = combobox.contracts.getOptionProps('apple')
      expect(props.id).toBe('cb-option-apple')
      expect(props.role).toBe('option')
    })

    it('select works for options inside groups', () => {
      const combobox = createCombobox({
        options: [fruitGroup],
      })

      combobox.actions.select('banana')
      expect(combobox.state.selectedId()).toBe('banana')
      expect(combobox.state.inputValue()).toBe('Banana')
    })
  })
})
