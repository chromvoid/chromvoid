import {describe, expect, it, vi, beforeEach, afterEach} from 'vitest'
import {createMenu} from './index'

const mkEvent = (key: string, mods?: Partial<{shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean}>) => ({
  key,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...mods,
})

describe('createMenu', () => {
  // ---------------------------------------------------------------------------
  // Keyboard and pointer open paths
  // ---------------------------------------------------------------------------
  describe('open paths', () => {
    it('opens from pointer and tracks source', () => {
      const menu = createMenu({
        items: [{id: 'a'}, {id: 'b'}],
      })

      menu.actions.open('pointer')

      expect(menu.state.isOpen()).toBe(true)
      expect(menu.state.openedBy()).toBe('pointer')
      expect(menu.state.activeId()).toBe('a')
    })

    it('opens from keyboard and tracks source', () => {
      const menu = createMenu({
        items: [{id: 'a'}, {id: 'b'}],
      })

      menu.actions.open('keyboard')

      expect(menu.state.isOpen()).toBe(true)
      expect(menu.state.openedBy()).toBe('keyboard')
    })

    it('opens programmatically and tracks source', () => {
      const menu = createMenu({
        items: [{id: 'a'}, {id: 'b'}],
      })

      menu.actions.open()

      expect(menu.state.isOpen()).toBe(true)
      expect(menu.state.openedBy()).toBe('programmatic')
    })

    it('opens from trigger ArrowDown and sets first enabled item active', () => {
      const menu = createMenu({
        items: [{id: 'a'}, {id: 'b'}],
      })

      menu.actions.handleTriggerKeyDown({key: 'ArrowDown'})

      expect(menu.state.isOpen()).toBe(true)
      expect(menu.state.openedBy()).toBe('keyboard')
      expect(menu.state.activeId()).toBe('a')
    })

    it('opens from trigger ArrowDown skipping leading disabled items', () => {
      const menu = createMenu({
        items: [{id: 'a', disabled: true}, {id: 'b', disabled: true}, {id: 'c'}],
      })

      menu.actions.handleTriggerKeyDown({key: 'ArrowDown'})

      expect(menu.state.isOpen()).toBe(true)
      expect(menu.state.activeId()).toBe('c')
    })

    it('opens from trigger ArrowUp and sets last enabled item active', () => {
      const menu = createMenu({
        items: [{id: 'a'}, {id: 'b'}],
      })

      menu.actions.handleTriggerKeyDown({key: 'ArrowUp'})

      expect(menu.state.isOpen()).toBe(true)
      expect(menu.state.openedBy()).toBe('keyboard')
      expect(menu.state.activeId()).toBe('b')
    })

    it('opens from trigger ArrowUp skipping trailing disabled items', () => {
      const menu = createMenu({
        items: [{id: 'a'}, {id: 'b', disabled: true}, {id: 'c', disabled: true}],
      })

      menu.actions.handleTriggerKeyDown({key: 'ArrowUp'})

      expect(menu.state.isOpen()).toBe(true)
      expect(menu.state.activeId()).toBe('a')
    })
  })

  // ---------------------------------------------------------------------------
  // Trigger toggle behavior
  // ---------------------------------------------------------------------------
  describe('trigger toggle', () => {
    it('toggles from trigger Enter', () => {
      const menu = createMenu({
        items: [{id: 'a'}],
      })

      menu.actions.handleTriggerKeyDown({key: 'Enter'})
      expect(menu.state.isOpen()).toBe(true)

      menu.actions.handleTriggerKeyDown({key: 'Enter'})
      expect(menu.state.isOpen()).toBe(false)
    })

    it('toggles from trigger Space', () => {
      const menu = createMenu({
        items: [{id: 'a'}],
      })

      menu.actions.handleTriggerKeyDown({key: ' '})
      expect(menu.state.isOpen()).toBe(true)

      menu.actions.handleTriggerKeyDown({key: ' '})
      expect(menu.state.isOpen()).toBe(false)
    })

    it('toggle action tracks source correctly', () => {
      const menu = createMenu({
        items: [{id: 'a'}],
      })

      menu.actions.toggle('pointer')
      expect(menu.state.openedBy()).toBe('pointer')

      menu.actions.toggle('pointer')
      expect(menu.state.openedBy()).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // Navigation and disabled skip behavior
  // ---------------------------------------------------------------------------
  describe('navigation', () => {
    it('navigates with ArrowDown and skips disabled items', () => {
      const menu = createMenu({
        items: [{id: 'a'}, {id: 'b', disabled: true}, {id: 'c'}],
        initialOpen: true,
      })

      menu.actions.handleMenuKeyDown(mkEvent('ArrowDown'))

      // active starts at 'a' (first enabled), ArrowDown skips 'b' (disabled) to 'c'
      expect(menu.state.activeId()).toBe('c')
    })

    it('navigates with ArrowUp and skips disabled items', () => {
      const menu = createMenu({
        items: [{id: 'a'}, {id: 'b', disabled: true}, {id: 'c'}],
        initialOpen: true,
        initialActiveId: 'c',
      })

      menu.actions.handleMenuKeyDown(mkEvent('ArrowUp'))

      expect(menu.state.activeId()).toBe('a')
    })

    it('wraps around from last to first on ArrowDown', () => {
      const menu = createMenu({
        items: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
        initialOpen: true,
        initialActiveId: 'c',
      })

      menu.actions.handleMenuKeyDown(mkEvent('ArrowDown'))

      expect(menu.state.activeId()).toBe('a')
    })

    it('wraps around from first to last on ArrowUp', () => {
      const menu = createMenu({
        items: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
        initialOpen: true,
      })

      menu.actions.handleMenuKeyDown(mkEvent('ArrowUp'))

      expect(menu.state.activeId()).toBe('c')
    })

    it('Home moves to first enabled item', () => {
      const menu = createMenu({
        items: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
        initialOpen: true,
        initialActiveId: 'c',
      })

      menu.actions.handleMenuKeyDown(mkEvent('Home'))

      expect(menu.state.activeId()).toBe('a')
    })

    it('End moves to last enabled item', () => {
      const menu = createMenu({
        items: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
        initialOpen: true,
      })

      menu.actions.handleMenuKeyDown(mkEvent('End'))

      expect(menu.state.activeId()).toBe('c')
    })

    it('navigation does not change openedBy when already open', () => {
      const menu = createMenu({
        items: [{id: 'a'}, {id: 'b'}],
      })

      menu.actions.open('pointer')
      expect(menu.state.openedBy()).toBe('pointer')

      menu.actions.handleMenuKeyDown(mkEvent('ArrowDown'))
      expect(menu.state.openedBy()).toBe('pointer')
    })

    it('setActive rejects disabled item ids', () => {
      const menu = createMenu({
        items: [{id: 'a', disabled: true}, {id: 'b'}],
        initialOpen: true,
      })

      menu.actions.setActive('a')
      // 'a' is disabled, should not become active; stays at initial ('b')
      expect(menu.state.activeId()).toBe('b')
    })

    it('setActive accepts null to clear', () => {
      const menu = createMenu({
        items: [{id: 'a'}, {id: 'b'}],
        initialOpen: true,
      })

      expect(menu.state.activeId()).not.toBeNull()

      menu.actions.setActive(null)
      expect(menu.state.activeId()).toBeNull()
    })

    it('handles empty items list gracefully', () => {
      const menu = createMenu({
        items: [],
        initialOpen: true,
      })

      expect(menu.state.activeId()).toBeNull()

      menu.actions.moveNext()
      expect(menu.state.activeId()).toBeNull()

      menu.actions.movePrev()
      expect(menu.state.activeId()).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // Enter activation behavior
  // ---------------------------------------------------------------------------
  describe('activation', () => {
    it('selects active item on Enter and closes menu by default', () => {
      const menu = createMenu({
        items: [{id: 'a'}, {id: 'b'}],
        initialOpen: true,
        initialActiveId: 'b',
      })

      menu.actions.handleMenuKeyDown(mkEvent('Enter'))

      expect(menu.state.selectedId()).toBe('b')
      expect(menu.state.isOpen()).toBe(false)
    })

    it('does not select disabled item via select()', () => {
      const menu = createMenu({
        items: [{id: 'a', disabled: true}],
        initialOpen: true,
      })

      menu.actions.select('a')

      expect(menu.state.selectedId()).toBeNull()
    })

    it('does not close menu when closeOnSelect is false', () => {
      const menu = createMenu({
        items: [{id: 'a'}, {id: 'b'}],
        initialOpen: true,
        initialActiveId: 'a',
        closeOnSelect: false,
      })

      menu.actions.handleMenuKeyDown(mkEvent('Enter'))

      expect(menu.state.selectedId()).toBe('a')
      expect(menu.state.isOpen()).toBe(true)
    })

    it('hasSelection is true after selecting an item', () => {
      const menu = createMenu({
        items: [{id: 'a'}, {id: 'b'}],
        initialOpen: true,
        initialActiveId: 'a',
      })

      expect(menu.state.hasSelection()).toBe(false)

      menu.actions.select('a')
      expect(menu.state.hasSelection()).toBe(true)
    })

    it('Enter does nothing when no active item', () => {
      const menu = createMenu({
        items: [{id: 'a'}],
        initialOpen: true,
      })

      menu.actions.setActive(null)
      menu.actions.handleMenuKeyDown(mkEvent('Enter'))

      expect(menu.state.selectedId()).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // Escape dismissal behavior
  // ---------------------------------------------------------------------------
  describe('dismiss', () => {
    it('closes on Escape', () => {
      const menu = createMenu({
        items: [{id: 'a'}],
        initialOpen: true,
      })

      menu.actions.handleMenuKeyDown(mkEvent('Escape'))

      expect(menu.state.isOpen()).toBe(false)
    })

    it('close resets openedBy to null', () => {
      const menu = createMenu({
        items: [{id: 'a'}],
      })

      menu.actions.open('pointer')
      expect(menu.state.openedBy()).toBe('pointer')

      menu.actions.close()
      expect(menu.state.openedBy()).toBeNull()
    })

    it('close resets activeId to null', () => {
      const menu = createMenu({
        items: [{id: 'a'}, {id: 'b'}],
      })

      menu.actions.open('keyboard')
      expect(menu.state.activeId()).not.toBeNull()

      menu.actions.close()
      expect(menu.state.activeId()).toBeNull()
    })

    it('Escape dismiss resets activeId', () => {
      const menu = createMenu({
        items: [{id: 'a'}, {id: 'b'}],
        initialOpen: true,
        initialActiveId: 'b',
      })

      expect(menu.state.activeId()).toBe('b')

      menu.actions.handleMenuKeyDown(mkEvent('Escape'))

      expect(menu.state.isOpen()).toBe(false)
      expect(menu.state.activeId()).toBeNull()
      expect(menu.state.openedBy()).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // Roles/aria props contract checks
  // ---------------------------------------------------------------------------
  describe('aria contracts', () => {
    it('trigger exposes aria-haspopup="menu" and aria-controls', () => {
      const menu = createMenu({
        items: [{id: 'a'}],
        idBase: 'ctx',
        ariaLabel: 'Context menu',
      })

      const triggerProps = menu.contracts.getTriggerProps()

      expect(triggerProps.id).toBe('ctx-trigger')
      expect(triggerProps['aria-haspopup']).toBe('menu')
      expect(triggerProps['aria-controls']).toBe('ctx-menu')
      expect(triggerProps.tabindex).toBe('0')
      expect(triggerProps['aria-label']).toBe('Context menu')
    })

    it('trigger aria-expanded reflects open state', () => {
      const menu = createMenu({
        items: [{id: 'a'}],
      })

      expect(menu.contracts.getTriggerProps()['aria-expanded']).toBe('false')

      menu.actions.open()
      expect(menu.contracts.getTriggerProps()['aria-expanded']).toBe('true')

      menu.actions.close()
      expect(menu.contracts.getTriggerProps()['aria-expanded']).toBe('false')
    })

    it('menu exposes role="menu" and tabindex="-1"', () => {
      const menu = createMenu({
        items: [{id: 'a'}],
        idBase: 'ctx',
        ariaLabel: 'Context menu',
      })

      const menuProps = menu.contracts.getMenuProps()

      expect(menuProps.id).toBe('ctx-menu')
      expect(menuProps.role).toBe('menu')
      expect(menuProps.tabindex).toBe('-1')
      expect(menuProps['aria-label']).toBe('Context menu')
    })

    it('item exposes role="menuitem" and tabindex="-1"', () => {
      const menu = createMenu({
        items: [{id: 'a'}],
        idBase: 'ctx',
      })

      const itemProps = menu.contracts.getItemProps('a')

      expect(itemProps.id).toBe('ctx-item-a')
      expect(itemProps.role).toBe('menuitem')
      expect(itemProps.tabindex).toBe('-1')
    })

    it('disabled item exposes aria-disabled="true"', () => {
      const menu = createMenu({
        items: [{id: 'a', disabled: true}, {id: 'b'}],
      })

      expect(menu.contracts.getItemProps('a')['aria-disabled']).toBe('true')
      expect(menu.contracts.getItemProps('b')['aria-disabled']).toBeUndefined()
    })

    it('active item has data-active="true", others "false"', () => {
      const menu = createMenu({
        items: [{id: 'a'}, {id: 'b'}],
        initialOpen: true,
      })

      // Initial active is 'a'
      expect(menu.contracts.getItemProps('a')['data-active']).toBe('true')
      expect(menu.contracts.getItemProps('b')['data-active']).toBe('false')

      menu.actions.setActive('b')
      expect(menu.contracts.getItemProps('a')['data-active']).toBe('false')
      expect(menu.contracts.getItemProps('b')['data-active']).toBe('true')
    })

    it('getItemProps throws for unknown item id', () => {
      const menu = createMenu({
        items: [{id: 'a'}],
      })

      expect(() => menu.contracts.getItemProps('unknown')).toThrow('Unknown menu item id: unknown')
    })
  })

  // ---------------------------------------------------------------------------
  // Invariants
  // ---------------------------------------------------------------------------
  describe('invariants', () => {
    it('activeId is always null or enabled item id', () => {
      const menu = createMenu({
        items: [{id: 'a', disabled: true}, {id: 'b'}, {id: 'c'}],
        initialOpen: true,
      })

      // Initial active should be first enabled
      expect(menu.state.activeId()).toBe('b')

      // Navigate — should never land on disabled 'a'
      menu.actions.movePrev()
      expect(menu.state.activeId()).toBe('c') // wraps to last

      menu.actions.movePrev()
      expect(menu.state.activeId()).toBe('b') // skips 'a'
    })

    it('disabled items cannot become selected', () => {
      const menu = createMenu({
        items: [{id: 'a', disabled: true}, {id: 'b'}],
      })

      menu.actions.select('a')
      expect(menu.state.selectedId()).toBeNull()
    })

    it('close always resets openedBy to null', () => {
      const menu = createMenu({
        items: [{id: 'a'}],
      })

      menu.actions.open('pointer')
      menu.actions.close()
      expect(menu.state.openedBy()).toBeNull()

      menu.actions.open('keyboard')
      menu.actions.close()
      expect(menu.state.openedBy()).toBeNull()

      menu.actions.open()
      menu.actions.close()
      expect(menu.state.openedBy()).toBeNull()
    })

    it('selection via Enter closes menu and resets activeId', () => {
      const menu = createMenu({
        items: [{id: 'a'}, {id: 'b'}],
        initialOpen: true,
        initialActiveId: 'a',
      })

      menu.actions.handleMenuKeyDown(mkEvent('Enter'))

      expect(menu.state.selectedId()).toBe('a')
      expect(menu.state.isOpen()).toBe(false)
      expect(menu.state.activeId()).toBeNull()
      expect(menu.state.openedBy()).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // Typeahead
  // ---------------------------------------------------------------------------
  describe('typeahead', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('printable character moves active to matching item by label prefix', () => {
      const menu = createMenu({
        items: [
          {id: 'a', label: 'Apple'},
          {id: 'b', label: 'Banana'},
          {id: 'c', label: 'Cherry'},
        ],
        initialOpen: true,
      })

      menu.actions.handleMenuKeyDown(mkEvent('b'))

      expect(menu.state.activeId()).toBe('b')
    })

    it('typeahead buffer accumulates characters within timeout', () => {
      const menu = createMenu({
        items: [
          {id: 'a', label: 'Apple'},
          {id: 'b', label: 'Banana'},
          {id: 'c', label: 'Cherry'},
        ],
        initialOpen: true,
      })

      vi.setSystemTime(100)
      menu.actions.handleMenuKeyDown(mkEvent('c'))
      vi.setSystemTime(200)
      menu.actions.handleMenuKeyDown(mkEvent('h'))

      expect(menu.state.activeId()).toBe('c') // matches 'Cherry' via 'ch'
    })

    it('typeahead buffer resets after timeout', () => {
      const menu = createMenu({
        items: [
          {id: 'a', label: 'Apple'},
          {id: 'b', label: 'Banana'},
          {id: 'c', label: 'Cherry'},
        ],
        initialOpen: true,
        typeaheadTimeout: 500,
      })

      vi.setSystemTime(100)
      menu.actions.handleMenuKeyDown(mkEvent('c'))
      expect(menu.state.activeId()).toBe('c')

      // Advance past timeout
      vi.setSystemTime(700)
      menu.actions.handleMenuKeyDown(mkEvent('a'))

      expect(menu.state.activeId()).toBe('a') // reset buffer, matches 'Apple'
    })

    it('typeahead wraps around to beginning of list', () => {
      const menu = createMenu({
        items: [
          {id: 'a', label: 'Apple'},
          {id: 'b', label: 'Banana'},
          {id: 'c', label: 'Avocado'},
        ],
        initialOpen: true,
        initialActiveId: 'b',
      })

      menu.actions.handleMenuKeyDown(mkEvent('a'))

      // Should wrap and find 'Avocado' (c) first since searching from b+1=c
      expect(menu.state.activeId()).toBe('c')
    })

    it('repeated same character cycles through matching items', () => {
      const menu = createMenu({
        items: [
          {id: 'a', label: 'Apple'},
          {id: 'b', label: 'Apricot'},
          {id: 'c', label: 'Banana'},
        ],
        initialOpen: true,
      })

      // activeId starts at 'a' (Apple). Typing 'a' searches from index 1 (after 'a').
      vi.setSystemTime(100)
      menu.actions.handleMenuKeyDown(mkEvent('a'))
      expect(menu.state.activeId()).toBe('b') // Apricot (searches from a+1=b, finds Apricot)

      vi.setSystemTime(200)
      menu.actions.handleMenuKeyDown(mkEvent('a'))
      expect(menu.state.activeId()).toBe('a') // Apple (searches from b+1=c, wraps to a)
    })

    it('space is not treated as typeahead character', () => {
      const menu = createMenu({
        items: [
          {id: 'a', label: 'Apple'},
          {id: 'b', label: 'Banana'},
        ],
        initialOpen: true,
        initialActiveId: 'a',
      })

      // Space should trigger selection, not typeahead
      menu.actions.handleMenuKeyDown(mkEvent(' '))

      expect(menu.state.selectedId()).toBe('a')
    })

    it('modifier keys exclude character from typeahead', () => {
      const menu = createMenu({
        items: [
          {id: 'a', label: 'Apple'},
          {id: 'b', label: 'Banana'},
        ],
        initialOpen: true,
      })

      menu.actions.handleMenuKeyDown(mkEvent('b', {ctrlKey: true}))

      // Should not trigger typeahead, activeId stays at 'a'
      expect(menu.state.activeId()).toBe('a')
    })

    it('typeahead disabled when typeahead option is false', () => {
      const menu = createMenu({
        items: [
          {id: 'a', label: 'Apple'},
          {id: 'b', label: 'Banana'},
        ],
        typeahead: false,
        initialOpen: true,
      })

      menu.actions.handleMenuKeyDown(mkEvent('b'))

      expect(menu.state.activeId()).toBe('a')
    })

    it('typeahead skips disabled items', () => {
      const menu = createMenu({
        items: [
          {id: 'a', label: 'Apple'},
          {id: 'b', label: 'Banana', disabled: true},
          {id: 'c', label: 'Blueberry'},
        ],
        initialOpen: true,
      })

      menu.actions.handleMenuKeyDown(mkEvent('b'))

      expect(menu.state.activeId()).toBe('c')
    })

    it('typeahead within open submenu searches submenu children', () => {
      const menu = createMenu({
        items: [
          {id: 'parent', label: 'Parent', hasSubmenu: true},
          {id: 'other', label: 'Other'},
        ],
        initialOpen: true,
      })

      menu.actions.setSubmenuItems('parent', [
        {id: 'sub-a', label: 'Alpha'},
        {id: 'sub-b', label: 'Beta'},
      ])
      menu.actions.openSubmenu('parent')

      menu.actions.handleMenuKeyDown(mkEvent('b'))

      expect(menu.state.submenuActiveId()).toBe('sub-b')
    })
  })

  // ---------------------------------------------------------------------------
  // Checkable items
  // ---------------------------------------------------------------------------
  describe('checkable items', () => {
    it('checkbox item has role=menuitemcheckbox and aria-checked', () => {
      const menu = createMenu({
        items: [{id: 'a', type: 'checkbox', label: 'Option A'}],
        idBase: 'ctx',
      })

      const props = menu.contracts.getItemProps('a')

      expect(props.role).toBe('menuitemcheckbox')
      expect(props['aria-checked']).toBe('false')
    })

    it('checkbox toggle updates checkedIds', () => {
      const menu = createMenu({
        items: [{id: 'a', type: 'checkbox'}, {id: 'b', type: 'checkbox'}],
        initialOpen: true,
      })

      menu.actions.toggleCheck('a')

      expect(menu.state.checkedIds()).toContain('a')
      expect(menu.state.checkedIds()).not.toContain('b')

      menu.actions.toggleCheck('a')
      expect(menu.state.checkedIds()).not.toContain('a')
    })

    it('checkbox select does not close menu by default', () => {
      const menu = createMenu({
        items: [{id: 'a', type: 'checkbox'}],
        initialOpen: true,
        initialActiveId: 'a',
      })

      menu.actions.select('a')

      expect(menu.state.isOpen()).toBe(true)
      expect(menu.state.checkedIds()).toContain('a')
    })

    it('radio item has role=menuitemradio and aria-checked', () => {
      const menu = createMenu({
        items: [{id: 'a', type: 'radio', group: 'g1', label: 'Option A'}],
        idBase: 'ctx',
      })

      const props = menu.contracts.getItemProps('a')

      expect(props.role).toBe('menuitemradio')
      expect(props['aria-checked']).toBe('false')
    })

    it('radio selection updates checkedIds (only one in group)', () => {
      const menu = createMenu({
        items: [
          {id: 'a', type: 'radio', group: 'g1'},
          {id: 'b', type: 'radio', group: 'g1'},
          {id: 'c', type: 'radio', group: 'g1'},
        ],
        initialOpen: true,
      })

      menu.actions.select('a')
      expect(menu.state.checkedIds()).toContain('a')

      menu.actions.select('b')
      expect(menu.state.checkedIds()).toContain('b')
      expect(menu.state.checkedIds()).not.toContain('a')
    })

    it('radio select does not close menu by default', () => {
      const menu = createMenu({
        items: [{id: 'a', type: 'radio', group: 'g1'}],
        initialOpen: true,
        initialActiveId: 'a',
      })

      menu.actions.select('a')

      expect(menu.state.isOpen()).toBe(true)
    })

    it('initial checked: true items appear in checkedIds', () => {
      const menu = createMenu({
        items: [
          {id: 'a', type: 'checkbox', checked: true},
          {id: 'b', type: 'checkbox'},
          {id: 'c', type: 'radio', group: 'g1', checked: true},
        ],
      })

      expect(menu.state.checkedIds()).toContain('a')
      expect(menu.state.checkedIds()).not.toContain('b')
      expect(menu.state.checkedIds()).toContain('c')
    })

    it('toggleCheck toggles checkbox item', () => {
      const menu = createMenu({
        items: [{id: 'a', type: 'checkbox'}],
      })

      menu.actions.toggleCheck('a')
      expect(menu.state.checkedIds()).toContain('a')

      menu.actions.toggleCheck('a')
      expect(menu.state.checkedIds()).not.toContain('a')
    })

    it('toggleCheck on radio sets only that item in group', () => {
      const menu = createMenu({
        items: [
          {id: 'a', type: 'radio', group: 'g1', checked: true},
          {id: 'b', type: 'radio', group: 'g1'},
        ],
      })

      menu.actions.toggleCheck('b')

      expect(menu.state.checkedIds()).toContain('b')
      expect(menu.state.checkedIds()).not.toContain('a')
    })

    it('toggleCheck is no-op for normal items', () => {
      const menu = createMenu({
        items: [{id: 'a'}],
      })

      menu.actions.toggleCheck('a')
      expect(menu.state.checkedIds().size).toBe(0)
    })

    it('disabled checkable items cannot be toggled', () => {
      const menu = createMenu({
        items: [{id: 'a', type: 'checkbox', disabled: true}],
      })

      menu.actions.toggleCheck('a')
      expect(menu.state.checkedIds()).not.toContain('a')
    })

    it('aria-checked reflects checked state', () => {
      const menu = createMenu({
        items: [{id: 'a', type: 'checkbox'}],
      })

      expect(menu.contracts.getItemProps('a')['aria-checked']).toBe('false')

      menu.actions.toggleCheck('a')
      expect(menu.contracts.getItemProps('a')['aria-checked']).toBe('true')
    })

    it('normal items do not have aria-checked', () => {
      const menu = createMenu({
        items: [{id: 'a'}],
      })

      expect(menu.contracts.getItemProps('a')['aria-checked']).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------------------
  // Submenus
  // ---------------------------------------------------------------------------
  describe('submenus', () => {
    const mkSubmenuMenu = () => {
      const menu = createMenu({
        items: [
          {id: 'file', label: 'File', hasSubmenu: true},
          {id: 'edit', label: 'Edit'},
          {id: 'view', label: 'View', hasSubmenu: true},
        ],
        initialOpen: true,
      })

      menu.actions.setSubmenuItems('file', [
        {id: 'new', label: 'New'},
        {id: 'open', label: 'Open'},
        {id: 'save', label: 'Save'},
      ])
      menu.actions.setSubmenuItems('view', [
        {id: 'zoom-in', label: 'Zoom In'},
        {id: 'zoom-out', label: 'Zoom Out'},
      ])

      return menu
    }

    it('submenu item has aria-haspopup=menu and aria-expanded', () => {
      const menu = mkSubmenuMenu()

      const props = menu.contracts.getItemProps('file')

      expect(props['aria-haspopup']).toBe('menu')
      expect(props['aria-expanded']).toBe('false')
    })

    it('non-submenu item does not have aria-haspopup or aria-expanded', () => {
      const menu = mkSubmenuMenu()

      const props = menu.contracts.getItemProps('edit')

      expect(props['aria-haspopup']).toBeUndefined()
      expect(props['aria-expanded']).toBeUndefined()
    })

    it('ArrowRight opens submenu on submenu item', () => {
      const menu = mkSubmenuMenu()
      menu.actions.setActive('file')

      menu.actions.handleMenuKeyDown(mkEvent('ArrowRight'))

      expect(menu.state.openSubmenuId()).toBe('file')
      expect(menu.state.submenuActiveId()).toBe('new')
    })

    it('ArrowRight is no-op on non-submenu item', () => {
      const menu = mkSubmenuMenu()
      menu.actions.setActive('edit')

      menu.actions.handleMenuKeyDown(mkEvent('ArrowRight'))

      expect(menu.state.openSubmenuId()).toBeNull()
    })

    it('ArrowLeft closes submenu', () => {
      const menu = mkSubmenuMenu()
      menu.actions.setActive('file')
      menu.actions.openSubmenu('file')

      menu.actions.handleMenuKeyDown(mkEvent('ArrowLeft'))

      expect(menu.state.openSubmenuId()).toBeNull()
      expect(menu.state.submenuActiveId()).toBeNull()
      // activeId remains on the parent item
      expect(menu.state.activeId()).toBe('file')
    })

    it('Escape closes submenu (not entire menu)', () => {
      const menu = mkSubmenuMenu()
      menu.actions.setActive('file')
      menu.actions.openSubmenu('file')

      menu.actions.handleMenuKeyDown(mkEvent('Escape'))

      expect(menu.state.openSubmenuId()).toBeNull()
      expect(menu.state.isOpen()).toBe(true)
      expect(menu.state.activeId()).toBe('file')
    })

    it('submenu navigation: ArrowDown/ArrowUp on submenuActiveId', () => {
      const menu = mkSubmenuMenu()
      menu.actions.setActive('file')
      menu.actions.openSubmenu('file')

      expect(menu.state.submenuActiveId()).toBe('new')

      menu.actions.handleMenuKeyDown(mkEvent('ArrowDown'))
      expect(menu.state.submenuActiveId()).toBe('open')

      menu.actions.handleMenuKeyDown(mkEvent('ArrowDown'))
      expect(menu.state.submenuActiveId()).toBe('save')

      // Wraps around
      menu.actions.handleMenuKeyDown(mkEvent('ArrowDown'))
      expect(menu.state.submenuActiveId()).toBe('new')

      menu.actions.handleMenuKeyDown(mkEvent('ArrowUp'))
      expect(menu.state.submenuActiveId()).toBe('save')
    })

    it('submenu navigation: Home/End on submenuActiveId', () => {
      const menu = mkSubmenuMenu()
      menu.actions.setActive('file')
      menu.actions.openSubmenu('file')

      menu.actions.handleMenuKeyDown(mkEvent('End'))
      expect(menu.state.submenuActiveId()).toBe('save')

      menu.actions.handleMenuKeyDown(mkEvent('Home'))
      expect(menu.state.submenuActiveId()).toBe('new')
    })

    it('submenu item selection with Enter/Space', () => {
      const menu = mkSubmenuMenu()
      menu.actions.setActive('file')
      menu.actions.openSubmenu('file')

      menu.actions.handleMenuKeyDown(mkEvent('Enter'))

      expect(menu.state.selectedId()).toBe('new')
    })

    it('getSubmenuProps returns correct hidden state', () => {
      const menu = mkSubmenuMenu()

      const closedProps = menu.contracts.getSubmenuProps('file')
      expect(closedProps.hidden).toBe(true)
      expect(closedProps.role).toBe('menu')
      expect(closedProps.tabindex).toBe('-1')

      menu.actions.openSubmenu('file')

      const openProps = menu.contracts.getSubmenuProps('file')
      expect(openProps.hidden).toBe(false)
    })

    it('getSubmenuItemProps returns correct data-active based on submenuActiveId', () => {
      const menu = mkSubmenuMenu()
      menu.actions.openSubmenu('file')

      expect(menu.contracts.getSubmenuItemProps('file', 'new')['data-active']).toBe('true')
      expect(menu.contracts.getSubmenuItemProps('file', 'open')['data-active']).toBe('false')
    })

    it('only one submenu open at a time', () => {
      const menu = mkSubmenuMenu()

      menu.actions.openSubmenu('file')
      expect(menu.state.openSubmenuId()).toBe('file')

      menu.actions.openSubmenu('view')
      expect(menu.state.openSubmenuId()).toBe('view')
      expect(menu.state.submenuActiveId()).toBe('zoom-in')
    })

    it('closing menu resets submenu state', () => {
      const menu = mkSubmenuMenu()
      menu.actions.openSubmenu('file')

      menu.actions.close()

      expect(menu.state.openSubmenuId()).toBeNull()
      expect(menu.state.submenuActiveId()).toBeNull()
    })

    it('open resets submenu state', () => {
      const menu = mkSubmenuMenu()
      menu.actions.openSubmenu('file')

      menu.actions.close()
      menu.actions.open()

      expect(menu.state.openSubmenuId()).toBeNull()
      expect(menu.state.submenuActiveId()).toBeNull()
    })

    it('getSubmenuProps includes id and aria-label', () => {
      const menu = mkSubmenuMenu()

      const props = menu.contracts.getSubmenuProps('file')
      expect(props.id).toBe('menu-submenu-file')
      expect(props['aria-label']).toBe('File')
    })

    it('aria-expanded on submenu item reflects open state', () => {
      const menu = mkSubmenuMenu()

      expect(menu.contracts.getItemProps('file')['aria-expanded']).toBe('false')

      menu.actions.openSubmenu('file')
      expect(menu.contracts.getItemProps('file')['aria-expanded']).toBe('true')
    })
  })

  // ---------------------------------------------------------------------------
  // Submenu hover intent
  // ---------------------------------------------------------------------------
  describe('submenu hover intent', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('hover intent opens submenu after ~200ms delay', () => {
      const menu = createMenu({
        items: [
          {id: 'file', label: 'File', hasSubmenu: true},
          {id: 'edit', label: 'Edit'},
        ],
        initialOpen: true,
      })

      menu.actions.setSubmenuItems('file', [
        {id: 'new', label: 'New'},
      ])

      menu.actions.handleItemPointerEnter('file')
      expect(menu.state.openSubmenuId()).toBeNull() // not yet
      expect(menu.state.activeId()).toBe('file') // but activeId is set immediately

      vi.advanceTimersByTime(200)
      expect(menu.state.openSubmenuId()).toBe('file')
    })

    it('hover leave cancels pending submenu open', () => {
      const menu = createMenu({
        items: [
          {id: 'file', label: 'File', hasSubmenu: true},
          {id: 'edit', label: 'Edit'},
        ],
        initialOpen: true,
      })

      menu.actions.setSubmenuItems('file', [
        {id: 'new', label: 'New'},
      ])

      menu.actions.handleItemPointerEnter('file')
      vi.advanceTimersByTime(100)
      menu.actions.handleItemPointerLeave('file')
      vi.advanceTimersByTime(200)

      expect(menu.state.openSubmenuId()).toBeNull()
    })

    it('hover on non-submenu item closes open submenu', () => {
      const menu = createMenu({
        items: [
          {id: 'file', label: 'File', hasSubmenu: true},
          {id: 'edit', label: 'Edit'},
        ],
        initialOpen: true,
      })

      menu.actions.setSubmenuItems('file', [
        {id: 'new', label: 'New'},
      ])

      menu.actions.openSubmenu('file')
      expect(menu.state.openSubmenuId()).toBe('file')

      menu.actions.handleItemPointerEnter('edit')
      expect(menu.state.openSubmenuId()).toBeNull()
      expect(menu.state.activeId()).toBe('edit')
    })
  })

  // ---------------------------------------------------------------------------
  // Split button
  // ---------------------------------------------------------------------------
  describe('split button', () => {
    it('getSplitTriggerProps returns action button props', () => {
      const menu = createMenu({
        items: [{id: 'a'}],
        idBase: 'ctx',
        splitButton: true,
      })

      const props = menu.contracts.getSplitTriggerProps()

      expect(props.id).toBe('ctx-split-action')
      expect(props.tabindex).toBe('0')
      expect(props.role).toBe('button')
    })

    it('getSplitDropdownProps returns dropdown trigger props with aria-haspopup', () => {
      const menu = createMenu({
        items: [{id: 'a'}],
        idBase: 'ctx',
        splitButton: true,
        ariaLabel: 'More options',
      })

      const props = menu.contracts.getSplitDropdownProps()

      expect(props.id).toBe('ctx-split-dropdown')
      expect(props.tabindex).toBe('0')
      expect(props.role).toBe('button')
      expect(props['aria-haspopup']).toBe('menu')
      expect(props['aria-controls']).toBe('ctx-menu')
      expect(props['aria-expanded']).toBe('false')
      expect(props['aria-label']).toBe('More options')
    })

    it('split contracts throw when splitButton is not enabled', () => {
      const menu = createMenu({
        items: [{id: 'a'}],
      })

      expect(() => menu.contracts.getSplitTriggerProps()).toThrow()
      expect(() => menu.contracts.getSplitDropdownProps()).toThrow()
    })

    it('getTriggerProps in split mode returns same as getSplitDropdownProps', () => {
      const menu = createMenu({
        items: [{id: 'a'}],
        idBase: 'ctx',
        splitButton: true,
        ariaLabel: 'More options',
      })

      const triggerProps = menu.contracts.getTriggerProps()
      const splitDropdownProps = menu.contracts.getSplitDropdownProps()

      expect(triggerProps.id).toBe(splitDropdownProps.id)
      expect(triggerProps['aria-haspopup']).toBe(splitDropdownProps['aria-haspopup'])
      expect(triggerProps['aria-controls']).toBe(splitDropdownProps['aria-controls'])
    })

    it('dropdown area aria-expanded reflects open state', () => {
      const menu = createMenu({
        items: [{id: 'a'}],
        splitButton: true,
      })

      expect(menu.contracts.getSplitDropdownProps()['aria-expanded']).toBe('false')

      menu.actions.open()
      expect(menu.contracts.getSplitDropdownProps()['aria-expanded']).toBe('true')
    })
  })

  // ---------------------------------------------------------------------------
  // Group props
  // ---------------------------------------------------------------------------
  describe('group props', () => {
    it('getGroupProps returns role=group with optional aria-label', () => {
      const menu = createMenu({
        items: [
          {id: 'a', type: 'radio', group: 'g1'},
          {id: 'b', type: 'radio', group: 'g1'},
        ],
        groups: [{id: 'g1', type: 'radio', label: 'Options'}],
        idBase: 'ctx',
      })

      const props = menu.contracts.getGroupProps('g1')

      expect(props.id).toBe('ctx-group-g1')
      expect(props.role).toBe('group')
      expect(props['aria-label']).toBe('Options')
    })

    it('getGroupProps works without label', () => {
      const menu = createMenu({
        items: [{id: 'a', type: 'radio', group: 'g1'}],
        groups: [{id: 'g1', type: 'radio'}],
        idBase: 'ctx',
      })

      const props = menu.contracts.getGroupProps('g1')
      expect(props['aria-label']).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------------------
  // Menu props with aria-activedescendant
  // ---------------------------------------------------------------------------
  describe('menu props aria-activedescendant', () => {
    it('getMenuProps includes aria-activedescendant when menu is open and item is active', () => {
      const menu = createMenu({
        items: [{id: 'a'}, {id: 'b'}],
        idBase: 'ctx',
        initialOpen: true,
      })

      const props = menu.contracts.getMenuProps()
      expect(props['aria-activedescendant']).toBe('ctx-item-a')
    })

    it('getMenuProps omits aria-activedescendant when no item is active', () => {
      const menu = createMenu({
        items: [{id: 'a'}],
        idBase: 'ctx',
      })

      const props = menu.contracts.getMenuProps()
      expect(props['aria-activedescendant']).toBeUndefined()
    })
  })
})
