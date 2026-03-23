import {describe, expect, it, vi} from 'vitest'
import {expectRoleAndAria} from '../testing/apg-contract-harness'
import {createContextMenu} from './index'

describe('createContextMenu', () => {
  // --- Spec: pointer context menu open with coordinate capture ---
  it('opens at coordinates from target context menu handler', () => {
    const model = createContextMenu({
      idBase: 'ctx-open',
      items: [{id: 'copy'}, {id: 'paste'}],
    })

    let prevented = false
    model.contracts.getTargetProps().onContextMenu({
      clientX: 120,
      clientY: 44,
      preventDefault: () => {
        prevented = true
      },
    })

    expect(prevented).toBe(true)
    expect(model.state.isOpen()).toBe(true)
    expect(model.state.anchorX()).toBe(120)
    expect(model.state.anchorY()).toBe(44)
    expect(model.state.openedBy()).toBe('pointer')
  })

  // --- Spec: menu role contract and escape close ---
  it('exposes menu role contract and closes on Escape', () => {
    const model = createContextMenu({
      idBase: 'ctx-contracts',
      items: [{id: 'copy'}],
    })

    model.actions.openAt(0, 0)
    const menu = model.contracts.getMenuProps()

    expectRoleAndAria(menu, 'menu')
    model.actions.handleKeyDown({key: 'Escape'})
    expect(model.state.isOpen()).toBe(false)
  })

  // --- Spec: keyboard invocation (Shift+F10) ---
  it('supports keyboard invocation from target via Shift+F10', () => {
    const model = createContextMenu({
      idBase: 'ctx-kbd-shift-f10',
      items: [{id: 'copy'}],
    })

    model.actions.handleTargetKeyDown({key: 'F10', shiftKey: true})
    expect(model.state.isOpen()).toBe(true)
    expect(model.state.openedBy()).toBe('keyboard')

    model.actions.handleOutsidePointer()
    expect(model.state.isOpen()).toBe(false)
  })

  // --- Spec: keyboard invocation (ContextMenu key) ---
  it('supports keyboard invocation from target via ContextMenu key', () => {
    const model = createContextMenu({
      idBase: 'ctx-kbd-contextmenu',
      items: [{id: 'copy'}],
    })

    model.actions.handleTargetKeyDown({key: 'ContextMenu'})
    expect(model.state.isOpen()).toBe(true)
    expect(model.state.openedBy()).toBe('keyboard')
  })

  // --- Spec: open source state transitions ---
  it('openedBy resets to null on close', () => {
    const model = createContextMenu({
      idBase: 'ctx-openedby-reset',
      items: [{id: 'copy'}],
    })

    model.actions.openAt(10, 20, 'pointer')
    expect(model.state.openedBy()).toBe('pointer')

    model.actions.close()
    expect(model.state.openedBy()).toBe(null)
  })

  it('openedBy resets to null after select-close', () => {
    const model = createContextMenu({
      idBase: 'ctx-openedby-select',
      items: [{id: 'copy'}],
      closeOnSelect: true,
    })

    model.actions.openAt(0, 0, 'pointer')
    expect(model.state.openedBy()).toBe('pointer')

    model.actions.select('copy')
    expect(model.state.isOpen()).toBe(false)
    expect(model.state.openedBy()).toBe(null)
  })

  it('openAt defaults to programmatic source when not specified', () => {
    const model = createContextMenu({
      idBase: 'ctx-default-source',
      items: [{id: 'copy'}],
    })

    model.actions.openAt(50, 60)
    expect(model.state.openedBy()).toBe('programmatic')
  })

  // --- Spec: restoreTargetId invariants ---
  it('restoreTargetId is assigned to target id on close', () => {
    const model = createContextMenu({
      idBase: 'ctx-restore-close',
      items: [{id: 'copy'}],
    })

    model.actions.openAt(0, 0)
    expect(model.state.restoreTargetId()).toBe(null)

    model.actions.close()
    expect(model.state.restoreTargetId()).toBe('ctx-restore-close-target')
  })

  it('restoreTargetId is assigned to target id on select-close', () => {
    const model = createContextMenu({
      idBase: 'ctx-restore-select',
      items: [{id: 'copy'}],
      closeOnSelect: true,
    })

    model.actions.openAt(0, 0)
    model.actions.select('copy')
    expect(model.state.isOpen()).toBe(false)
    expect(model.state.restoreTargetId()).toBe('ctx-restore-select-target')
  })

  // --- Spec: Tab inside menu closes and restores target ---
  it('Tab inside menu closes menu', () => {
    const model = createContextMenu({
      idBase: 'ctx-tab-close',
      items: [{id: 'copy'}],
    })

    model.actions.openAt(0, 0)
    expect(model.state.isOpen()).toBe(true)

    model.actions.handleKeyDown({key: 'Tab'})
    expect(model.state.isOpen()).toBe(false)
    expect(model.state.restoreTargetId()).toBe('ctx-tab-close-target')
  })

  // --- Spec: outside pointer close policy ---
  it('outside pointer closes menu by default', () => {
    const model = createContextMenu({
      idBase: 'ctx-outside-default',
      items: [{id: 'copy'}],
    })

    model.actions.openAt(0, 0)
    model.actions.handleOutsidePointer()
    expect(model.state.isOpen()).toBe(false)
  })

  it('outside pointer does not close when closeOnOutsidePointer is false', () => {
    const model = createContextMenu({
      idBase: 'ctx-outside-disabled',
      items: [{id: 'copy'}],
      closeOnOutsidePointer: false,
    })

    model.actions.openAt(0, 0)
    model.actions.handleOutsidePointer()
    expect(model.state.isOpen()).toBe(true)
  })

  // --- Spec: data-anchor-x / data-anchor-y reflect anchor atom state ---
  it('menu props reflect anchor coordinates as data attributes', () => {
    const model = createContextMenu({
      idBase: 'ctx-anchor-data',
      items: [{id: 'copy'}],
    })

    model.actions.openAt(250, 310, 'pointer')
    const menu = model.contracts.getMenuProps()

    expect(menu['data-anchor-x']).toBe('250')
    expect(menu['data-anchor-y']).toBe('310')
  })

  // --- Spec: hidden attribute on menu ---
  it('menu hidden attribute reflects open state', () => {
    const model = createContextMenu({
      idBase: 'ctx-hidden',
      items: [{id: 'copy'}],
    })

    expect(model.contracts.getMenuProps().hidden).toBe(true)

    model.actions.openAt(0, 0)
    expect(model.contracts.getMenuProps().hidden).toBe(false)

    model.actions.close()
    expect(model.contracts.getMenuProps().hidden).toBe(true)
  })

  // --- Spec: item role contract ---
  it('item props expose menuitem role and active marker', () => {
    const model = createContextMenu({
      idBase: 'ctx-item',
      items: [{id: 'copy'}, {id: 'paste'}],
    })

    model.actions.openAt(0, 0)
    const itemProps = model.contracts.getItemProps('copy')

    expect(itemProps.role).toBe('menuitem')
    expect(itemProps.tabindex).toBe('-1')
    expect(typeof itemProps.onClick).toBe('function')
  })

  it('item props reflect aria-disabled for disabled items', () => {
    const model = createContextMenu({
      idBase: 'ctx-disabled-item',
      items: [{id: 'copy', disabled: true}, {id: 'paste'}],
    })

    const disabledItem = model.contracts.getItemProps('copy')
    const enabledItem = model.contracts.getItemProps('paste')

    expect(disabledItem['aria-disabled']).toBe('true')
    expect(enabledItem['aria-disabled']).toBeUndefined()
  })

  // --- Spec: item data-active reflects active state ---
  it('item data-active reflects active state', () => {
    const model = createContextMenu({
      idBase: 'ctx-data-active',
      items: [{id: 'copy'}, {id: 'paste'}],
    })

    model.actions.openAt(0, 0)
    // After open, first enabled item is active
    expect(model.contracts.getItemProps('copy')['data-active']).toBe('true')
    expect(model.contracts.getItemProps('paste')['data-active']).toBe('false')

    // Navigate down
    model.actions.handleKeyDown({key: 'ArrowDown'})
    expect(model.contracts.getItemProps('copy')['data-active']).toBe('false')
    expect(model.contracts.getItemProps('paste')['data-active']).toBe('true')
  })

  // --- Spec: item onClick triggers select ---
  it('item onClick triggers select', () => {
    const model = createContextMenu({
      idBase: 'ctx-item-click',
      items: [{id: 'copy'}, {id: 'paste'}],
      closeOnSelect: true,
    })

    model.actions.openAt(0, 0)
    model.contracts.getItemProps('paste').onClick()

    expect(model.state.isOpen()).toBe(false)
    expect(model.state.restoreTargetId()).toBe('ctx-item-click-target')
  })

  // --- Spec: target contract ---
  it('target props include id and contextmenu/keydown handlers', () => {
    const model = createContextMenu({
      idBase: 'ctx-target',
      items: [{id: 'copy'}],
    })

    const target = model.contracts.getTargetProps()
    expect(target.id).toBe('ctx-target-target')
    expect(typeof target.onContextMenu).toBe('function')
    expect(typeof target.onKeyDown).toBe('function')
  })

  // --- Spec: pointer context menu calls preventDefault ---
  it('pointer context menu handler calls preventDefault when available', () => {
    const model = createContextMenu({
      idBase: 'ctx-prevent',
      items: [{id: 'copy'}],
    })

    let prevented = false
    model.contracts.getTargetProps().onContextMenu({
      clientX: 0,
      clientY: 0,
      preventDefault: () => {
        prevented = true
      },
    })
    expect(prevented).toBe(true)

    model.actions.close()

    model.contracts.getTargetProps().onContextMenu({
      clientX: 0,
      clientY: 0,
    })
    expect(model.state.isOpen()).toBe(true)
  })

  // --- Spec: aria-label forwarded to menu ---
  it('aria-label is forwarded to menu props', () => {
    const model = createContextMenu({
      idBase: 'ctx-label',
      items: [{id: 'copy'}],
      ariaLabel: 'File actions',
    })

    const menu = model.contracts.getMenuProps()
    expect(menu['aria-label']).toBe('File actions')
  })

  // --- Spec: menu delegates keyboard to menu keyboard intents ---
  it('delegates arrow keys to menu navigation', () => {
    const model = createContextMenu({
      idBase: 'ctx-nav',
      items: [{id: 'copy'}, {id: 'paste'}, {id: 'delete'}],
    })

    model.actions.openAt(0, 0)

    model.actions.handleKeyDown({key: 'ArrowDown'})
    const activeAfterDown = model.state.activeId()
    expect(activeAfterDown).toBeTruthy()

    model.actions.handleKeyDown({key: 'ArrowUp'})
    expect(model.state.activeId()).toBeTruthy()
  })

  // --- handleKeyDown is no-op when menu closed ---
  it('handleKeyDown is no-op when menu is closed', () => {
    const model = createContextMenu({
      idBase: 'ctx-closed-noop',
      items: [{id: 'copy'}],
    })

    model.actions.handleKeyDown({key: 'ArrowDown'})
    expect(model.state.isOpen()).toBe(false)
    expect(model.state.activeId()).toBe(null)
  })

  // ---------------------------------------------------------------------------
  // Separator support
  // ---------------------------------------------------------------------------
  describe('separators', () => {
    it('separators are excluded from navigation', () => {
      const model = createContextMenu({
        idBase: 'ctx-sep-nav',
        items: [
          {id: 'cut'},
          {id: 'sep-1', type: 'separator'},
          {id: 'paste'},
        ],
      })

      model.actions.openAt(0, 0)
      expect(model.state.activeId()).toBe('cut')

      model.actions.handleKeyDown({key: 'ArrowDown'})
      expect(model.state.activeId()).toBe('paste')
    })

    it('getSeparatorProps returns separator role', () => {
      const model = createContextMenu({
        idBase: 'ctx-sep-props',
        items: [
          {id: 'cut'},
          {id: 'sep-1', type: 'separator'},
          {id: 'paste'},
        ],
      })

      const sepProps = model.contracts.getSeparatorProps('sep-1')
      expect(sepProps.role).toBe('separator')
      expect(sepProps.id).toBe('ctx-sep-props-separator-sep-1')
    })

    it('separators cannot be selected', () => {
      const model = createContextMenu({
        idBase: 'ctx-sep-select',
        items: [
          {id: 'cut'},
          {id: 'sep-1', type: 'separator'},
          {id: 'paste'},
        ],
      })

      model.actions.openAt(0, 0)
      model.actions.select('sep-1')
      // Separator selection is a no-op
      expect(model.state.isOpen()).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // Group label support
  // ---------------------------------------------------------------------------
  describe('group labels', () => {
    it('group labels are excluded from navigation', () => {
      const model = createContextMenu({
        idBase: 'ctx-grp-nav',
        items: [
          {id: 'grp-edit', type: 'group-label', label: 'Edit'},
          {id: 'cut'},
          {id: 'copy'},
        ],
      })

      model.actions.openAt(0, 0)
      // Group labels are skipped; first active item should be 'cut'
      expect(model.state.activeId()).toBe('cut')
    })

    it('getGroupLabelProps returns presentation role', () => {
      const model = createContextMenu({
        idBase: 'ctx-grp-props',
        items: [
          {id: 'grp-edit', type: 'group-label', label: 'Edit'},
          {id: 'cut'},
        ],
      })

      const grpProps = model.contracts.getGroupLabelProps('grp-edit')
      expect(grpProps.role).toBe('presentation')
      expect(grpProps.id).toBe('ctx-grp-props-group-grp-edit')
      expect(grpProps['aria-label']).toBe('Edit')
    })
  })

  // ---------------------------------------------------------------------------
  // Checkable items - checkbox
  // ---------------------------------------------------------------------------
  describe('checkbox items', () => {
    it('checkbox items toggle checked state on select', () => {
      const model = createContextMenu({
        idBase: 'ctx-chk',
        items: [
          {id: 'bold', type: 'checkbox', checked: false},
          {id: 'italic', type: 'checkbox', checked: true},
        ],
        closeOnSelect: false,
      })

      model.actions.openAt(0, 0)
      model.actions.select('bold')
      expect(model.state.checkedIds()).toContain('bold')

      model.actions.select('italic')
      expect(model.state.checkedIds()).not.toContain('italic')
    })

    it('checkbox item props include menuitemcheckbox role and aria-checked', () => {
      const model = createContextMenu({
        idBase: 'ctx-chk-props',
        items: [
          {id: 'bold', type: 'checkbox', checked: true},
          {id: 'italic', type: 'checkbox', checked: false},
        ],
      })

      const boldProps = model.contracts.getItemProps('bold')
      expect(boldProps.role).toBe('menuitemcheckbox')
      expect(boldProps['aria-checked']).toBe('true')

      const italicProps = model.contracts.getItemProps('italic')
      expect(italicProps.role).toBe('menuitemcheckbox')
      expect(italicProps['aria-checked']).toBe('false')
    })
  })

  // ---------------------------------------------------------------------------
  // Checkable items - radio
  // ---------------------------------------------------------------------------
  describe('radio items', () => {
    it('radio items enforce single selection within a group', () => {
      const model = createContextMenu({
        idBase: 'ctx-radio',
        items: [
          {id: 'small', type: 'radio', group: 'size', checked: true},
          {id: 'medium', type: 'radio', group: 'size', checked: false},
          {id: 'large', type: 'radio', group: 'size', checked: false},
        ],
        closeOnSelect: false,
      })

      model.actions.openAt(0, 0)
      expect(model.state.checkedIds()).toContain('small')
      expect(model.state.checkedIds()).not.toContain('medium')

      model.actions.select('medium')
      expect(model.state.checkedIds()).toContain('medium')
      expect(model.state.checkedIds()).not.toContain('small')
    })

    it('radio item props include menuitemradio role and aria-checked', () => {
      const model = createContextMenu({
        idBase: 'ctx-radio-props',
        items: [
          {id: 'small', type: 'radio', group: 'size', checked: true},
          {id: 'medium', type: 'radio', group: 'size', checked: false},
        ],
      })

      const smallProps = model.contracts.getItemProps('small')
      expect(smallProps.role).toBe('menuitemradio')
      expect(smallProps['aria-checked']).toBe('true')

      const mediumProps = model.contracts.getItemProps('medium')
      expect(mediumProps.role).toBe('menuitemradio')
      expect(mediumProps['aria-checked']).toBe('false')
    })
  })

  // ---------------------------------------------------------------------------
  // Typeahead character navigation
  // ---------------------------------------------------------------------------
  describe('typeahead', () => {
    it('printable characters navigate to matching item by label prefix', () => {
      const model = createContextMenu({
        idBase: 'ctx-typeahead',
        items: [
          {id: 'cut', label: 'Cut'},
          {id: 'copy', label: 'Copy'},
          {id: 'paste', label: 'Paste'},
        ],
      })

      model.actions.openAt(0, 0)
      // Type 'p' should navigate to 'paste'
      model.actions.handleKeyDown({key: 'p'})
      expect(model.state.activeId()).toBe('paste')
    })

    it('typeahead accumulates buffer for multi-character prefix', () => {
      const model = createContextMenu({
        idBase: 'ctx-typeahead-multi',
        items: [
          {id: 'cut', label: 'Cut'},
          {id: 'copy', label: 'Copy'},
          {id: 'clear', label: 'Clear'},
        ],
      })

      model.actions.openAt(0, 0)
      // Type 'c' should go to first 'c' item = 'cut'
      model.actions.handleKeyDown({key: 'c'})
      expect(model.state.activeId()).toBe('cut')

      // Type 'l' rapidly (within timeout) should match 'cl' = 'clear'
      model.actions.handleKeyDown({key: 'l'})
      expect(model.state.activeId()).toBe('clear')
    })

    it('typeahead ignores modifier key combinations', () => {
      const model = createContextMenu({
        idBase: 'ctx-typeahead-mod',
        items: [
          {id: 'cut', label: 'Cut'},
          {id: 'paste', label: 'Paste'},
        ],
      })

      model.actions.openAt(0, 0)
      const initialActive = model.state.activeId()

      // Ctrl+P should not trigger typeahead
      model.actions.handleKeyDown({key: 'p', ctrlKey: true})
      expect(model.state.activeId()).toBe(initialActive)
    })

    it('typeahead is no-op when menu is closed', () => {
      const model = createContextMenu({
        idBase: 'ctx-typeahead-closed',
        items: [
          {id: 'cut', label: 'Cut'},
          {id: 'paste', label: 'Paste'},
        ],
      })

      model.actions.handleKeyDown({key: 'p'})
      expect(model.state.isOpen()).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // Long-press on touch
  // ---------------------------------------------------------------------------
  describe('long-press touch', () => {
    it('opens menu after long-press duration', () => {
      vi.useFakeTimers()
      const model = createContextMenu({
        idBase: 'ctx-longpress',
        items: [{id: 'copy'}],
      })

      model.actions.handleTouchStart({clientX: 100, clientY: 200})

      // Before threshold, menu should be closed
      vi.advanceTimersByTime(400)
      expect(model.state.isOpen()).toBe(false)

      // After threshold (default 500ms), menu should open
      vi.advanceTimersByTime(200)
      expect(model.state.isOpen()).toBe(true)
      expect(model.state.anchorX()).toBe(100)
      expect(model.state.anchorY()).toBe(200)
      expect(model.state.openedBy()).toBe('pointer')

      vi.useRealTimers()
    })

    it('cancels long-press on touch move', () => {
      vi.useFakeTimers()
      const model = createContextMenu({
        idBase: 'ctx-longpress-move',
        items: [{id: 'copy'}],
      })

      model.actions.handleTouchStart({clientX: 100, clientY: 200})
      vi.advanceTimersByTime(300)
      model.actions.handleTouchMove()

      vi.advanceTimersByTime(300)
      expect(model.state.isOpen()).toBe(false)

      vi.useRealTimers()
    })

    it('cancels long-press on touch end before threshold', () => {
      vi.useFakeTimers()
      const model = createContextMenu({
        idBase: 'ctx-longpress-end',
        items: [{id: 'copy'}],
      })

      model.actions.handleTouchStart({clientX: 100, clientY: 200})
      vi.advanceTimersByTime(300)
      model.actions.handleTouchEnd()

      vi.advanceTimersByTime(300)
      expect(model.state.isOpen()).toBe(false)

      vi.useRealTimers()
    })

    it('uses configurable long-press duration', () => {
      vi.useFakeTimers()
      const model = createContextMenu({
        idBase: 'ctx-longpress-custom',
        items: [{id: 'copy'}],
        longPressDuration: 800,
      })

      model.actions.handleTouchStart({clientX: 50, clientY: 50})

      vi.advanceTimersByTime(600)
      expect(model.state.isOpen()).toBe(false)

      vi.advanceTimersByTime(300)
      expect(model.state.isOpen()).toBe(true)

      vi.useRealTimers()
    })
  })

  // ---------------------------------------------------------------------------
  // Sub-menus
  // ---------------------------------------------------------------------------
  describe('sub-menus', () => {
    it('sub-menu item has aria-haspopup and aria-expanded', () => {
      const model = createContextMenu({
        idBase: 'ctx-sub',
        items: [
          {id: 'cut'},
          {
            id: 'more',
            type: 'submenu',
            children: [{id: 'select-all'}, {id: 'deselect'}],
          },
        ],
      })

      model.actions.openAt(0, 0)
      const moreProps = model.contracts.getItemProps('more')
      expect(moreProps['aria-haspopup']).toBe('menu')
      expect(moreProps['aria-expanded']).toBe('false')
    })

    it('ArrowRight opens sub-menu when active item has children', () => {
      const model = createContextMenu({
        idBase: 'ctx-sub-open',
        items: [
          {id: 'cut'},
          {
            id: 'more',
            type: 'submenu',
            children: [{id: 'select-all'}, {id: 'deselect'}],
          },
        ],
      })

      model.actions.openAt(0, 0)
      // Navigate to 'more'
      model.actions.handleKeyDown({key: 'ArrowDown'})
      expect(model.state.activeId()).toBe('more')

      // ArrowRight should open sub-menu
      model.actions.handleKeyDown({key: 'ArrowRight'})
      expect(model.state.openSubmenuId()).toBe('more')
      expect(model.state.submenuActiveId()).toBe('select-all')
    })

    it('ArrowLeft closes sub-menu and returns to parent', () => {
      const model = createContextMenu({
        idBase: 'ctx-sub-close',
        items: [
          {id: 'cut'},
          {
            id: 'more',
            type: 'submenu',
            children: [{id: 'select-all'}, {id: 'deselect'}],
          },
        ],
      })

      model.actions.openAt(0, 0)
      model.actions.handleKeyDown({key: 'ArrowDown'})
      model.actions.handleKeyDown({key: 'ArrowRight'})
      expect(model.state.openSubmenuId()).toBe('more')

      model.actions.handleKeyDown({key: 'ArrowLeft'})
      expect(model.state.openSubmenuId()).toBe(null)
      expect(model.state.activeId()).toBe('more')
    })

    it('Escape from sub-menu closes sub-menu, not parent', () => {
      const model = createContextMenu({
        idBase: 'ctx-sub-esc',
        items: [
          {id: 'cut'},
          {
            id: 'more',
            type: 'submenu',
            children: [{id: 'select-all'}, {id: 'deselect'}],
          },
        ],
      })

      model.actions.openAt(0, 0)
      model.actions.handleKeyDown({key: 'ArrowDown'})
      model.actions.handleKeyDown({key: 'ArrowRight'})
      expect(model.state.openSubmenuId()).toBe('more')

      model.actions.handleKeyDown({key: 'Escape'})
      expect(model.state.openSubmenuId()).toBe(null)
      expect(model.state.isOpen()).toBe(true)
      expect(model.state.activeId()).toBe('more')
    })

    it('getSubmenuProps returns menu props for sub-menu', () => {
      const model = createContextMenu({
        idBase: 'ctx-sub-props',
        items: [
          {id: 'cut'},
          {
            id: 'more',
            type: 'submenu',
            children: [{id: 'select-all'}, {id: 'deselect'}],
          },
        ],
      })

      const subProps = model.contracts.getSubmenuProps('more')
      expect(subProps.id).toBe('ctx-sub-props-submenu-more')
      expect(subProps.role).toBe('menu')
      expect(subProps.hidden).toBe(true)

      model.actions.openAt(0, 0)
      model.actions.handleKeyDown({key: 'ArrowDown'})
      model.actions.handleKeyDown({key: 'ArrowRight'})

      const openSubProps = model.contracts.getSubmenuProps('more')
      expect(openSubProps.hidden).toBe(false)
    })

    it('selecting sub-menu item closes entire menu', () => {
      const model = createContextMenu({
        idBase: 'ctx-sub-select',
        items: [
          {id: 'cut'},
          {
            id: 'more',
            type: 'submenu',
            children: [{id: 'select-all'}, {id: 'deselect'}],
          },
        ],
        closeOnSelect: true,
      })

      model.actions.openAt(0, 0)
      model.actions.handleKeyDown({key: 'ArrowDown'})
      model.actions.handleKeyDown({key: 'ArrowRight'})

      model.actions.select('select-all')
      expect(model.state.isOpen()).toBe(false)
      expect(model.state.openSubmenuId()).toBe(null)
    })
  })
})
