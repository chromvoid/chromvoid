import {describe, expect, it} from 'vitest'
import {expectAriaLinkage, expectRoleAndAria} from '../testing/apg-contract-harness'
import {createPopover} from './index'

describe('createPopover', () => {
  it('opens and closes via keyboard handlers', () => {
    const popover = createPopover({idBase: 'popover-kbd'})

    popover.actions.handleTriggerKeyDown({key: 'Enter'})
    expect(popover.state.isOpen()).toBe(true)
    expect(popover.state.openedBy()).toBe('keyboard')

    popover.actions.handleContentKeyDown({key: 'Escape'})
    expect(popover.state.isOpen()).toBe(false)
    expect(popover.state.lastDismissIntent()).toBe('escape')
    expect(popover.state.restoreTargetId()).toBe('popover-kbd-trigger')
  })

  it('keeps trigger/content role and aria linkage', () => {
    const popover = createPopover({idBase: 'popover-contracts'})
    const trigger = popover.contracts.getTriggerProps()
    const content = popover.contracts.getContentProps()

    expectRoleAndAria(trigger, 'button', {'aria-haspopup': 'dialog'})
    expectRoleAndAria(content, 'dialog', {'aria-modal': 'false'})
    expectAriaLinkage(trigger, 'aria-controls', content)
  })

  it('honors outside pointer and outside focus close policies', () => {
    const popover = createPopover({
      idBase: 'popover-outside',
      initialOpen: true,
      closeOnOutsidePointer: false,
      closeOnOutsideFocus: false,
    })

    popover.actions.handleOutsidePointer()
    popover.actions.handleOutsideFocus()
    expect(popover.state.isOpen()).toBe(true)

    const closable = createPopover({idBase: 'popover-outside-closable', initialOpen: true})
    closable.actions.handleOutsidePointer()
    expect(closable.state.isOpen()).toBe(false)

    closable.actions.open()
    closable.actions.handleOutsideFocus()
    expect(closable.state.isOpen()).toBe(false)
    expect(closable.state.lastDismissIntent()).toBe('outside-focus')
  })

  describe('useNativePopover', () => {
    it('content props include popover="manual" and no hidden when useNativePopover is true', () => {
      const popover = createPopover({idBase: 'popover-native', useNativePopover: true})
      const content = popover.contracts.getContentProps()

      expect(content).toHaveProperty('popover', 'manual')
      expect(content).not.toHaveProperty('hidden')
    })

    it('trigger props include popovertarget when useNativePopover is true', () => {
      const popover = createPopover({idBase: 'popover-native-trigger', useNativePopover: true})
      const trigger = popover.contracts.getTriggerProps()

      expect(trigger).toHaveProperty('popovertarget', 'popover-native-trigger-content')
      expect(trigger).toHaveProperty('popovertargetaction', 'toggle')
    })

    it('content props include hidden and no popover when useNativePopover is false', () => {
      const popover = createPopover({idBase: 'popover-manual'})
      const content = popover.contracts.getContentProps()

      expect(content).toHaveProperty('hidden', true)
      expect(content).not.toHaveProperty('popover')
    })

    it('exposes useNativePopover state signal', () => {
      const native = createPopover({idBase: 'popover-signal-native', useNativePopover: true})
      expect(native.state.useNativePopover()).toBe(true)

      const manual = createPopover({idBase: 'popover-signal-manual'})
      expect(manual.state.useNativePopover()).toBe(false)
    })
  })

  describe('handleNativeToggle', () => {
    it('syncs state from open to closed when native fires toggle with "closed"', () => {
      const popover = createPopover({idBase: 'popover-toggle-close', initialOpen: true, useNativePopover: true})
      expect(popover.state.isOpen()).toBe(true)

      popover.actions.handleNativeToggle('closed')
      expect(popover.state.isOpen()).toBe(false)
    })

    it('syncs state from closed to open when native fires toggle with "open"', () => {
      const popover = createPopover({idBase: 'popover-toggle-open', useNativePopover: true})
      expect(popover.state.isOpen()).toBe(false)

      popover.actions.handleNativeToggle('open')
      expect(popover.state.isOpen()).toBe(true)
      expect(popover.state.openedBy()).toBe('programmatic')
    })

    it('is idempotent when state is already in sync', () => {
      const popover = createPopover({idBase: 'popover-toggle-noop', initialOpen: true, useNativePopover: true})

      popover.actions.handleNativeToggle('open')
      expect(popover.state.isOpen()).toBe(true)

      const closed = createPopover({idBase: 'popover-toggle-noop2', useNativePopover: true})
      closed.actions.handleNativeToggle('closed')
      expect(closed.state.isOpen()).toBe(false)
    })
  })
})
