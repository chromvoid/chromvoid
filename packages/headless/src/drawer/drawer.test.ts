import {describe, expect, it} from 'vitest'
import {createDrawer} from './index'

describe('createDrawer', () => {
  // ── placement defaults and options ──────────────────────────
  it('defaults placement to end', () => {
    const drawer = createDrawer()
    expect(drawer.state.placement()).toBe('end')
  })

  it('accepts placement option', () => {
    const drawer = createDrawer({placement: 'start'})
    expect(drawer.state.placement()).toBe('start')
  })

  it('accepts all four placement values', () => {
    const placements = ['start', 'end', 'top', 'bottom'] as const
    for (const p of placements) {
      const drawer = createDrawer({placement: p})
      expect(drawer.state.placement()).toBe(p)
    }
  })

  // ── setPlacement action ─────────────────────────────────────
  it('setPlacement updates placement at runtime', () => {
    const drawer = createDrawer({placement: 'end'})
    drawer.actions.setPlacement('start')
    expect(drawer.state.placement()).toBe('start')
  })

  it('setPlacement does not affect isOpen state', () => {
    const drawer = createDrawer({initialOpen: true})
    expect(drawer.state.isOpen()).toBe(true)
    drawer.actions.setPlacement('top')
    expect(drawer.state.isOpen()).toBe(true)

    const closed = createDrawer({initialOpen: false})
    expect(closed.state.isOpen()).toBe(false)
    closed.actions.setPlacement('bottom')
    expect(closed.state.isOpen()).toBe(false)
  })

  it('setPlacement does not affect ARIA attributes', () => {
    const drawer = createDrawer({initialOpen: true})
    const before = drawer.contracts.getPanelProps()
    const roleBefore = before.role
    const modalBefore = before['aria-modal']
    const labelBefore = before['aria-labelledby']
    const descBefore = before['aria-describedby']

    drawer.actions.setPlacement('bottom')

    const after = drawer.contracts.getPanelProps()
    expect(after.role).toBe(roleBefore)
    expect(after['aria-modal']).toBe(modalBefore)
    expect(after['aria-labelledby']).toBe(labelBefore)
    expect(after['aria-describedby']).toBe(descBefore)
  })

  // ── getPanelProps ───────────────────────────────────────────
  it('getPanelProps returns data-placement matching current placement', () => {
    const drawer = createDrawer({placement: 'top'})
    expect(drawer.contracts.getPanelProps()['data-placement']).toBe('top')
  })

  it('getPanelProps reflects placement change after setPlacement', () => {
    const drawer = createDrawer({placement: 'end'})
    expect(drawer.contracts.getPanelProps()['data-placement']).toBe('end')
    drawer.actions.setPlacement('start')
    expect(drawer.contracts.getPanelProps()['data-placement']).toBe('start')
  })

  it('getPanelProps includes all dialog content attributes', () => {
    const drawer = createDrawer({idBase: 'dr'})
    const panel = drawer.contracts.getPanelProps()
    expect(panel.id).toBe('dr-content')
    expect(panel.role).toBe('dialog')
    expect(panel.tabindex).toBe('-1')
    expect(panel['aria-modal']).toBe('true')
    expect(panel['aria-labelledby']).toBe('dr-title')
    expect(panel['aria-describedby']).toBe('dr-description')
    expect(typeof panel.onKeyDown).toBe('function')
  })

  // ── idBase defaults to 'drawer' ─────────────────────────────
  it('defaults idBase to drawer', () => {
    const drawer = createDrawer()
    const trigger = drawer.contracts.getTriggerProps()
    expect(trigger.id).toBe('drawer-trigger')
    const panel = drawer.contracts.getPanelProps()
    expect(panel.id).toBe('drawer-content')
    const title = drawer.contracts.getTitleProps()
    expect(title.id).toBe('drawer-title')
    const desc = drawer.contracts.getDescriptionProps()
    expect(desc.id).toBe('drawer-description')
  })

  it('custom idBase propagates to all generated ids', () => {
    const drawer = createDrawer({idBase: 'my-drawer'})
    expect(drawer.contracts.getTriggerProps().id).toBe('my-drawer-trigger')
    expect(drawer.contracts.getPanelProps().id).toBe('my-drawer-content')
    expect(drawer.contracts.getTitleProps().id).toBe('my-drawer-title')
    expect(drawer.contracts.getDescriptionProps().id).toBe('my-drawer-description')
    expect(drawer.contracts.getCloseButtonProps().id).toBe('my-drawer-close')
    expect(drawer.contracts.getHeaderCloseButtonProps().id).toBe('my-drawer-header-close')
  })

  // ── delegated dialog behaviors ──────────────────────────────
  it('opens and closes via actions', () => {
    const drawer = createDrawer({initialOpen: false})
    expect(drawer.state.isOpen()).toBe(false)
    drawer.actions.open('programmatic')
    expect(drawer.state.isOpen()).toBe(true)
    drawer.actions.close('programmatic')
    expect(drawer.state.isOpen()).toBe(false)
  })

  it('toggles open state', () => {
    const drawer = createDrawer({initialOpen: false})
    drawer.actions.toggle()
    expect(drawer.state.isOpen()).toBe(true)
    drawer.actions.toggle()
    expect(drawer.state.isOpen()).toBe(false)
  })

  it('starts open when initialOpen is true', () => {
    const drawer = createDrawer({initialOpen: true})
    expect(drawer.state.isOpen()).toBe(true)
  })

  it('dismisses on Escape key by default', () => {
    const drawer = createDrawer({initialOpen: true})
    drawer.actions.handleKeyDown({key: 'Escape'})
    expect(drawer.state.isOpen()).toBe(false)
  })

  it('does not dismiss on Escape when closeOnEscape is false', () => {
    const drawer = createDrawer({initialOpen: true, closeOnEscape: false})
    drawer.actions.handleKeyDown({key: 'Escape'})
    expect(drawer.state.isOpen()).toBe(true)
  })

  it('supports outside pointer dismissal', () => {
    const drawer = createDrawer({initialOpen: true})
    drawer.actions.handleOutsidePointer()
    expect(drawer.state.isOpen()).toBe(false)
  })

  it('does not dismiss on outside pointer when closeOnOutsidePointer is false', () => {
    const drawer = createDrawer({initialOpen: true, closeOnOutsidePointer: false})
    drawer.actions.handleOutsidePointer()
    expect(drawer.state.isOpen()).toBe(true)
  })

  it('supports outside focus dismissal', () => {
    const drawer = createDrawer({initialOpen: true})
    drawer.actions.handleOutsideFocus()
    expect(drawer.state.isOpen()).toBe(false)
  })

  it('does not dismiss on outside focus when closeOnOutsideFocus is false', () => {
    const drawer = createDrawer({initialOpen: true, closeOnOutsideFocus: false})
    drawer.actions.handleOutsideFocus()
    expect(drawer.state.isOpen()).toBe(true)
  })

  it('tracks modal focus trap and scroll lock state', () => {
    const modal = createDrawer({initialOpen: true, isModal: true})
    expect(modal.state.isFocusTrapped()).toBe(true)
    expect(modal.state.shouldLockScroll()).toBe(true)

    const nonModal = createDrawer({initialOpen: true, isModal: false})
    expect(nonModal.state.isFocusTrapped()).toBe(false)
    expect(nonModal.state.shouldLockScroll()).toBe(false)
  })

  it('defaults to modal mode', () => {
    const drawer = createDrawer({initialOpen: true})
    expect(drawer.state.isModal()).toBe(true)
    expect(drawer.state.isFocusTrapped()).toBe(true)
  })

  it('returns focus to trigger on close', () => {
    const drawer = createDrawer({idBase: 'dr-restore', initialOpen: false})
    drawer.actions.open('keyboard')
    drawer.actions.close('escape')
    expect(drawer.state.restoreTargetId()).toBe('dr-restore-trigger')
  })

  it('returns focus to custom trigger id', () => {
    const drawer = createDrawer({initialOpen: false})
    drawer.actions.setTriggerId('my-trigger')
    drawer.actions.open('keyboard')
    drawer.actions.close('escape')
    expect(drawer.state.restoreTargetId()).toBe('my-trigger')
  })

  it('exposes initial focus target id in state', () => {
    const drawer = createDrawer({initialFocusId: 'email-input'})
    expect(drawer.state.initialFocusTargetId()).toBe('email-input')
  })

  it('exposes initial focus target in panel props', () => {
    const drawer = createDrawer({initialFocusId: 'email-input'})
    const panel = drawer.contracts.getPanelProps()
    expect(panel['data-initial-focus']).toBe('email-input')
  })

  // ── trigger handlers ────────────────────────────────────────
  it('opens via trigger click handler', () => {
    const drawer = createDrawer({initialOpen: false})
    drawer.actions.handleTriggerClick()
    expect(drawer.state.isOpen()).toBe(true)
  })

  it('opens via trigger keyboard Enter', () => {
    const drawer = createDrawer({initialOpen: false})
    drawer.actions.handleTriggerKeyDown({key: 'Enter'})
    expect(drawer.state.isOpen()).toBe(true)
  })

  it('opens via trigger keyboard Space', () => {
    const drawer = createDrawer({initialOpen: false})
    drawer.actions.handleTriggerKeyDown({key: ' '})
    expect(drawer.state.isOpen()).toBe(true)
  })

  // ── trigger props contract ──────────────────────────────────
  it('trigger props include required aria attributes', () => {
    const drawer = createDrawer()
    const trigger = drawer.contracts.getTriggerProps()
    expect(trigger.role).toBe('button')
    expect(trigger.tabindex).toBe('0')
    expect(trigger['aria-haspopup']).toBe('dialog')
    expect(typeof trigger.onClick).toBe('function')
    expect(typeof trigger.onKeyDown).toBe('function')
  })

  it('reflects aria-expanded toggle on trigger', () => {
    const drawer = createDrawer({initialOpen: false})
    expect(drawer.contracts.getTriggerProps()['aria-expanded']).toBe('false')
    drawer.actions.open()
    expect(drawer.contracts.getTriggerProps()['aria-expanded']).toBe('true')
    drawer.actions.close()
    expect(drawer.contracts.getTriggerProps()['aria-expanded']).toBe('false')
  })

  // ── overlay props ───────────────────────────────────────────
  it('overlay props reflect open state', () => {
    const drawer = createDrawer({initialOpen: false})
    expect(drawer.contracts.getOverlayProps().hidden).toBe(true)
    expect(drawer.contracts.getOverlayProps()['data-open']).toBe('false')
    drawer.actions.open()
    expect(drawer.contracts.getOverlayProps().hidden).toBe(false)
    expect(drawer.contracts.getOverlayProps()['data-open']).toBe('true')
  })

  // ── type option (alertdialog) ───────────────────────────────
  it('defaults type to dialog', () => {
    const drawer = createDrawer()
    expect(drawer.state.type()).toBe('dialog')
    expect(drawer.contracts.getPanelProps().role).toBe('dialog')
  })

  it('type alertdialog produces role alertdialog', () => {
    const drawer = createDrawer({type: 'alertdialog'})
    expect(drawer.state.type()).toBe('alertdialog')
    expect(drawer.contracts.getPanelProps().role).toBe('alertdialog')
  })

  // ── close button contracts ──────────────────────────────────
  it('close button closes the drawer', () => {
    const drawer = createDrawer({initialOpen: true})
    drawer.contracts.getCloseButtonProps().onClick()
    expect(drawer.state.isOpen()).toBe(false)
  })

  it('header close button has aria-label Close and closes the drawer', () => {
    const drawer = createDrawer({initialOpen: true})
    const hdr = drawer.contracts.getHeaderCloseButtonProps()
    expect(hdr['aria-label']).toBe('Close')
    hdr.onClick()
    expect(drawer.state.isOpen()).toBe(false)
  })

  // ── non-modal aria-modal ────────────────────────────────────
  it('non-modal drawer has aria-modal false', () => {
    const drawer = createDrawer({isModal: false})
    expect(drawer.contracts.getPanelProps()['aria-modal']).toBe('false')
  })
})
