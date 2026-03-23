import {describe, expect, it} from 'vitest'
import {createMenuButton} from './index'

describe('createMenuButton', () => {
  it('toggles visibility via trigger click', () => {
    const model = createMenuButton({
      idBase: 'menu-button-click',
      items: [{id: 'a'}, {id: 'b'}],
    })

    expect(model.state.isOpen()).toBe(false)
    model.contracts.getTriggerProps().onClick()
    expect(model.state.isOpen()).toBe(true)
    model.contracts.getTriggerProps().onClick()
    expect(model.state.isOpen()).toBe(false)
  })

  it('opens with ArrowDown and focuses first item', () => {
    const model = createMenuButton({
      idBase: 'menu-button-down',
      items: [{id: 'a'}, {id: 'b'}],
    })

    model.actions.handleKeyDown({key: 'ArrowDown'})

    expect(model.state.isOpen()).toBe(true)
    expect(model.state.activeId()).toBe('a')
  })

  it('opens with ArrowUp and focuses last item', () => {
    const model = createMenuButton({
      idBase: 'menu-button-up',
      items: [{id: 'a'}, {id: 'b'}],
    })

    model.actions.handleKeyDown({key: 'ArrowUp'})

    expect(model.state.isOpen()).toBe(true)
    expect(model.state.activeId()).toBe('b')
  })

  it('closes on Escape and sets restore target to trigger', () => {
    const model = createMenuButton({
      idBase: 'menu-button-escape',
      items: [{id: 'a'}, {id: 'b'}],
      initialOpen: true,
    })

    model.actions.handleKeyDown({key: 'Escape'})

    expect(model.state.isOpen()).toBe(false)
    expect(model.state.restoreTargetId()).toBe('menu-button-escape-trigger')
  })

  it('closes on outside click intent', () => {
    const model = createMenuButton({
      idBase: 'menu-button-outside',
      items: [{id: 'a'}],
      initialOpen: true,
    })

    model.actions.handleOutsidePointer()
    expect(model.state.isOpen()).toBe(false)
  })

  it('closes on item selection and restores focus target', () => {
    const model = createMenuButton({
      idBase: 'menu-button-select',
      items: [{id: 'a'}, {id: 'b'}],
      initialOpen: true,
      initialActiveId: 'b',
    })

    model.actions.select('b')

    expect(model.state.isOpen()).toBe(false)
    expect(model.state.restoreTargetId()).toBe('menu-button-select-trigger')
  })

  it('opens with Enter and focuses first item', () => {
    const model = createMenuButton({
      idBase: 'menu-button-enter',
      items: [{id: 'a'}, {id: 'b'}],
    })

    model.actions.handleKeyDown({key: 'Enter'})

    expect(model.state.isOpen()).toBe(true)
    expect(model.state.activeId()).toBe('a')
  })

  it('opens with Space and focuses first item', () => {
    const model = createMenuButton({
      idBase: 'menu-button-space',
      items: [{id: 'a'}, {id: 'b'}],
    })

    model.actions.handleKeyDown({key: ' '})

    expect(model.state.isOpen()).toBe(true)
    expect(model.state.activeId()).toBe('a')
  })

  it('Enter resets activeId to first after close-reopen cycle', () => {
    const model = createMenuButton({
      idBase: 'menu-button-reset',
      items: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
    })

    model.actions.handleKeyDown({key: 'ArrowDown'})
    expect(model.state.activeId()).toBe('a')

    model.actions.handleKeyDown({key: 'ArrowDown'})
    expect(model.state.activeId()).toBe('b')

    model.actions.handleKeyDown({key: 'Escape'})
    expect(model.state.isOpen()).toBe(false)

    model.actions.handleKeyDown({key: 'Enter'})
    expect(model.state.isOpen()).toBe(true)
    expect(model.state.activeId()).toBe('a')
  })

  it('closes on Tab without setting restore target', () => {
    const model = createMenuButton({
      idBase: 'menu-button-tab',
      items: [{id: 'a'}],
      initialOpen: true,
    })

    model.actions.handleKeyDown({key: 'Tab'})

    expect(model.state.isOpen()).toBe(false)
    expect(model.state.restoreTargetId()).toBeNull()
  })

  it('cycles focus through items with ArrowDown/ArrowUp', () => {
    const model = createMenuButton({
      idBase: 'menu-button-cycle',
      items: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
      initialOpen: true,
      initialActiveId: 'a',
    })

    model.actions.handleKeyDown({key: 'ArrowDown'})
    expect(model.state.activeId()).toBe('b')

    model.actions.handleKeyDown({key: 'ArrowDown'})
    expect(model.state.activeId()).toBe('c')

    model.actions.handleKeyDown({key: 'ArrowDown'})
    expect(model.state.activeId()).toBe('a')

    model.actions.handleKeyDown({key: 'ArrowUp'})
    expect(model.state.activeId()).toBe('c')
  })

  it('skips disabled items during keyboard navigation', () => {
    const model = createMenuButton({
      idBase: 'menu-button-disabled',
      items: [{id: 'a'}, {id: 'b', disabled: true}, {id: 'c'}],
      initialOpen: true,
      initialActiveId: 'a',
    })

    model.actions.handleKeyDown({key: 'ArrowDown'})
    expect(model.state.activeId()).toBe('c')

    model.actions.handleKeyDown({key: 'ArrowUp'})
    expect(model.state.activeId()).toBe('a')
  })

  it('returns ARIA contracts for trigger/menu/item', () => {
    const model = createMenuButton({
      idBase: 'menu-button-a11y',
      items: [{id: 'a'}],
      ariaLabel: 'Actions menu',
    })

    expect(model.contracts.getTriggerProps()).toMatchObject({
      role: 'button',
      'aria-haspopup': 'menu',
      'aria-expanded': 'false',
      'aria-controls': 'menu-button-a11y-menu',
      'aria-label': 'Actions menu',
    })
    expect(model.contracts.getMenuProps()).toMatchObject({
      role: 'menu',
      hidden: true,
    })
    expect(model.contracts.getItemProps('a')).toMatchObject({
      role: 'menuitem',
    })
  })

  it('updates ARIA attributes when opened and closed', () => {
    const model = createMenuButton({
      idBase: 'menu-button-aria-update',
      items: [{id: 'a'}],
    })

    expect(model.contracts.getTriggerProps()['aria-expanded']).toBe('false')
    expect(model.contracts.getMenuProps().hidden).toBe(true)

    model.actions.open()
    expect(model.contracts.getTriggerProps()['aria-expanded']).toBe('true')
    expect(model.contracts.getMenuProps().hidden).toBe(false)

    model.actions.close()
    expect(model.contracts.getTriggerProps()['aria-expanded']).toBe('false')
    expect(model.contracts.getMenuProps().hidden).toBe(true)
  })

  it('does not close on select when closeOnSelect is false', () => {
    const model = createMenuButton({
      idBase: 'menu-button-keep-open',
      items: [{id: 'a'}, {id: 'b'}],
      initialOpen: true,
      closeOnSelect: false,
    })

    model.actions.select('a')
    expect(model.state.isOpen()).toBe(true)
  })
})
