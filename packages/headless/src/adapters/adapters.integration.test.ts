import {describe, expect, it} from 'vitest'
import {createCommandPalette} from '../command-palette'
import {createListbox} from '../listbox'
import {createMenu} from '../menu'
import {createPopover} from '../popover'
import {createSelect} from '../select'

interface KeyboardIntentEvent {
  key: string
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
}

const keyboardEvent = (key: string): KeyboardIntentEvent => ({
  key,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
})

const bindListboxLikeAdapter = (model: ReturnType<typeof createListbox>) => ({
  rootProps: model.contracts.getRootProps(),
  getItemProps: (id: string) => model.contracts.getOptionProps(id),
  onKeyDown: (event: KeyboardIntentEvent) => model.actions.handleKeyDown(event),
  onItemClick: (id: string) => {
    model.actions.setActive(id)
    if (model.state.selectionMode === 'multiple') {
      model.actions.toggleSelected(id)
      return
    }
    model.actions.selectOnly(id)
  },
})

const bindMenuLikeAdapter = (model: ReturnType<typeof createMenu>) => ({
  getTriggerProps: () => model.contracts.getTriggerProps(),
  getMenuProps: () => model.contracts.getMenuProps(),
  getItemProps: (id: string) => model.contracts.getItemProps(id),
  onTriggerKeyDown: (key: string) => model.actions.handleTriggerKeyDown({key}),
  onMenuKeyDown: (event: KeyboardIntentEvent) => model.actions.handleMenuKeyDown(event),
  onItemClick: (id: string) => model.actions.select(id),
  onTriggerClick: () => model.actions.toggle('pointer'),
})

const bindSelectLikeAdapter = (model: ReturnType<typeof createSelect>) => ({
  getTriggerProps: () => model.contracts.getTriggerProps(),
  getListboxProps: () => model.contracts.getListboxProps(),
  getOptionProps: (id: string) => model.contracts.getOptionProps(id),
  onTriggerClick: () => model.contracts.getTriggerProps().onClick(),
  onTriggerKeyDown: (key: string) => model.actions.handleTriggerKeyDown({key}),
  onListboxKeyDown: (event: KeyboardIntentEvent) => model.actions.handleListboxKeyDown(event),
  onOptionClick: (id: string) => model.contracts.getOptionProps(id).onClick(),
})

const bindPopoverLikeAdapter = (model: ReturnType<typeof createPopover>) => ({
  getTriggerProps: () => model.contracts.getTriggerProps(),
  getContentProps: () => model.contracts.getContentProps(),
  onTriggerClick: () => model.contracts.getTriggerProps().onClick(),
  onTriggerKeyDown: (key: string) => model.actions.handleTriggerKeyDown({key}),
  onContentKeyDown: (key: string) => model.actions.handleContentKeyDown({key}),
  onPointerDownOutside: () => model.contracts.getContentProps().onPointerDownOutside(),
})

const bindCommandPaletteLikeAdapter = (model: ReturnType<typeof createCommandPalette>) => ({
  getTriggerProps: () => model.contracts.getTriggerProps(),
  getDialogProps: () => model.contracts.getDialogProps(),
  getOptionProps: (id: string) => model.contracts.getOptionProps(id),
  onGlobalKeyDown: (event: KeyboardIntentEvent) => model.actions.handleGlobalKeyDown(event),
  onDialogKeyDown: (event: KeyboardIntentEvent) => model.actions.handlePaletteKeyDown(event),
  onTriggerClick: () => model.contracts.getTriggerProps().onClick(),
  onOptionClick: (id: string) => model.contracts.getOptionProps(id).onClick(),
})

describe('adapter integration behavior', () => {
  it('connects listbox keyboard and pointer bindings to model state', () => {
    const listbox = createListbox({
      options: [{id: 'a'}, {id: 'b'}, {id: 'c', disabled: true}],
      selectionMode: 'multiple',
      idBase: 'adapter-listbox',
    })
    const adapter = bindListboxLikeAdapter(listbox)

    expect(adapter.rootProps.role).toBe('listbox')
    expect(adapter.getItemProps('a').role).toBe('option')

    adapter.onKeyDown(keyboardEvent('ArrowDown'))
    expect(listbox.state.activeId()).toBe('b')

    adapter.onKeyDown(keyboardEvent(' '))
    expect(listbox.state.selectedIds()).toEqual(['b'])

    adapter.onItemClick('a')
    expect(listbox.state.activeId()).toBe('a')
    expect(listbox.state.selectedIds()).toEqual(['b', 'a'])

    adapter.onItemClick('c')
    expect(listbox.state.activeId()).toBe('a')
    expect(listbox.state.selectedIds()).toEqual(['b', 'a'])
  })

  it('connects menu bindings for trigger, keyboard navigation, and pointer selection', () => {
    const menu = createMenu({
      items: [{id: 'new'}, {id: 'open'}, {id: 'delete', disabled: true}],
      idBase: 'adapter-menu',
    })
    const adapter = bindMenuLikeAdapter(menu)

    expect(adapter.getTriggerProps()['aria-haspopup']).toBe('menu')
    expect(adapter.getMenuProps().role).toBe('menu')
    expect(adapter.getItemProps('open').role).toBe('menuitem')

    adapter.onTriggerKeyDown('ArrowDown')
    expect(menu.state.isOpen()).toBe(true)
    expect(menu.state.activeId()).toBe('new')

    adapter.onMenuKeyDown(keyboardEvent('ArrowDown'))
    expect(menu.state.activeId()).toBe('open')

    adapter.onMenuKeyDown(keyboardEvent('Enter'))
    expect(menu.state.selectedId()).toBe('open')
    expect(menu.state.isOpen()).toBe(false)

    adapter.onTriggerClick()
    expect(menu.state.isOpen()).toBe(true)
    expect(menu.state.openedBy()).toBe('pointer')

    adapter.onItemClick('delete')
    expect(menu.state.selectedId()).toBe('open')
  })

  it('covers select + popover + command-palette composition with keyboard and pointer flows', () => {
    const select = createSelect({
      idBase: 'adapter-select',
      options: [
        {id: 'light', label: 'Light'},
        {id: 'dark', label: 'Dark'},
      ],
      placeholder: 'Choose theme',
    })

    const popover = createPopover({idBase: 'adapter-popover'})

    const executed: string[] = []
    const commandPalette = createCommandPalette({
      idBase: 'adapter-palette',
      commands: [
        {id: 'theme-light', label: 'Theme: Light'},
        {id: 'close-panel', label: 'Close panel'},
      ],
      onExecute: (id) => {
        executed.push(id)

        if (id === 'theme-light') {
          select.actions.select('light')
          return
        }

        if (id === 'close-panel') {
          popover.actions.close('programmatic')
        }
      },
    })

    const selectAdapter = bindSelectLikeAdapter(select)
    const popoverAdapter = bindPopoverLikeAdapter(popover)
    const paletteAdapter = bindCommandPaletteLikeAdapter(commandPalette)

    expect(selectAdapter.getTriggerProps()['aria-haspopup']).toBe('listbox')
    expect(popoverAdapter.getTriggerProps()['aria-haspopup']).toBe('dialog')
    expect(paletteAdapter.getDialogProps().role).toBe('dialog')

    selectAdapter.onTriggerKeyDown('ArrowDown')
    expect(select.state.isOpen()).toBe(true)
    expect(select.state.activeId()).toBe('light')

    selectAdapter.onListboxKeyDown(keyboardEvent('ArrowDown'))
    expect(select.state.activeId()).toBe('dark')

    selectAdapter.onListboxKeyDown(keyboardEvent('Enter'))
    expect(select.state.selectedId()).toBe('dark')
    expect(select.state.selectedLabel()).toBe('Dark')
    expect(select.state.isOpen()).toBe(false)

    popoverAdapter.onTriggerKeyDown('Enter')
    expect(popover.state.isOpen()).toBe(true)
    expect(popover.state.openedBy()).toBe('keyboard')

    paletteAdapter.onGlobalKeyDown({
      ...keyboardEvent('k'),
      metaKey: true,
    })
    expect(commandPalette.state.isOpen()).toBe(true)

    paletteAdapter.onDialogKeyDown(keyboardEvent('Enter'))
    expect(executed).toEqual(['theme-light'])
    expect(select.state.selectedId()).toBe('light')
    expect(commandPalette.state.lastExecutedId()).toBe('theme-light')
    expect(commandPalette.state.isOpen()).toBe(false)

    paletteAdapter.onTriggerClick()
    expect(commandPalette.state.isOpen()).toBe(true)

    paletteAdapter.onOptionClick('close-panel')
    expect(executed).toEqual(['theme-light', 'close-panel'])
    expect(popover.state.isOpen()).toBe(false)
    expect(commandPalette.state.lastExecutedId()).toBe('close-panel')

    popoverAdapter.onTriggerClick()
    expect(popover.state.isOpen()).toBe(true)
    expect(popover.state.openedBy()).toBe('pointer')

    popoverAdapter.onPointerDownOutside()
    expect(popover.state.isOpen()).toBe(false)
    expect(popover.state.lastDismissIntent()).toBe('outside-pointer')

    selectAdapter.onTriggerClick()
    expect(select.state.isOpen()).toBe(true)
    selectAdapter.onOptionClick('dark')
    expect(select.state.selectedId()).toBe('dark')
    expect(select.state.isOpen()).toBe(false)
  })
})
