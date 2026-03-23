import {describe, expect, it} from 'vitest'
import {createDialog} from './index'

describe('createDialog', () => {
  // ── open/close lifecycle via actions ──────────────────────────
  it('opens and closes via actions', () => {
    const dialog = createDialog({
      idBase: 'dialog-lifecycle',
      initialOpen: false,
    })

    expect(dialog.state.isOpen()).toBe(false)
    dialog.actions.open('programmatic')
    expect(dialog.state.isOpen()).toBe(true)
    dialog.actions.close('programmatic')
    expect(dialog.state.isOpen()).toBe(false)
  })

  it('toggles open state', () => {
    const dialog = createDialog({
      idBase: 'dialog-toggle',
      initialOpen: false,
    })

    dialog.actions.toggle()
    expect(dialog.state.isOpen()).toBe(true)
    dialog.actions.toggle()
    expect(dialog.state.isOpen()).toBe(false)
  })

  it('starts open when initialOpen is true', () => {
    const dialog = createDialog({
      idBase: 'dialog-init-open',
      initialOpen: true,
    })

    expect(dialog.state.isOpen()).toBe(true)
  })

  // ── Escape key dismissal ─────────────────────────────────────
  it('dismisses on Escape key by default', () => {
    const dialog = createDialog({
      idBase: 'dialog-escape',
      initialOpen: true,
    })

    dialog.actions.handleKeyDown({key: 'Escape'})

    expect(dialog.state.isOpen()).toBe(false)
    expect(dialog.state.restoreTargetId()).toBe('dialog-escape-trigger')
  })

  it('does not dismiss on Escape when closeOnEscape is false', () => {
    const dialog = createDialog({
      idBase: 'dialog-no-escape',
      initialOpen: true,
      closeOnEscape: false,
    })

    dialog.actions.handleKeyDown({key: 'Escape'})

    expect(dialog.state.isOpen()).toBe(true)
  })

  // ── outside click dismissal ──────────────────────────────────
  it('supports outside pointer dismissal', () => {
    const dialog = createDialog({
      idBase: 'dialog-outside',
      initialOpen: true,
    })

    dialog.actions.handleOutsidePointer()
    expect(dialog.state.isOpen()).toBe(false)
  })

  it('does not dismiss on outside pointer when closeOnOutsidePointer is false', () => {
    const dialog = createDialog({
      idBase: 'dialog-no-outside-ptr',
      initialOpen: true,
      closeOnOutsidePointer: false,
    })

    dialog.actions.handleOutsidePointer()
    expect(dialog.state.isOpen()).toBe(true)
  })

  // ── outside focus dismissal ──────────────────────────────────
  it('supports outside focus dismissal', () => {
    const dialog = createDialog({
      idBase: 'dialog-outside-focus',
      initialOpen: true,
    })

    dialog.actions.handleOutsideFocus()
    expect(dialog.state.isOpen()).toBe(false)
  })

  it('does not dismiss on outside focus when closeOnOutsideFocus is false', () => {
    const dialog = createDialog({
      idBase: 'dialog-no-outside-focus',
      initialOpen: true,
      closeOnOutsideFocus: false,
    })

    dialog.actions.handleOutsideFocus()
    expect(dialog.state.isOpen()).toBe(true)
  })

  // ── focus trap behavior ──────────────────────────────────────
  it('tracks modal focus trap and scroll lock state', () => {
    const modal = createDialog({
      idBase: 'dialog-modal',
      initialOpen: true,
      isModal: true,
    })

    expect(modal.state.isFocusTrapped()).toBe(true)
    expect(modal.state.shouldLockScroll()).toBe(true)

    const nonModal = createDialog({
      idBase: 'dialog-non-modal',
      initialOpen: true,
      isModal: false,
    })

    expect(nonModal.state.isFocusTrapped()).toBe(false)
    expect(nonModal.state.shouldLockScroll()).toBe(false)
  })

  it('defaults to modal mode (isModal: true)', () => {
    const dialog = createDialog({
      idBase: 'dialog-default-modal',
      initialOpen: true,
    })

    expect(dialog.state.isModal()).toBe(true)
    expect(dialog.state.isFocusTrapped()).toBe(true)
  })

  // ── scroll lock activation/deactivation ──────────────────────
  it('deactivates scroll lock when dialog closes', () => {
    const dialog = createDialog({
      idBase: 'dialog-scroll-lock',
      initialOpen: true,
      isModal: true,
    })

    expect(dialog.state.shouldLockScroll()).toBe(true)

    dialog.actions.close()
    expect(dialog.state.shouldLockScroll()).toBe(false)
  })

  it('activates scroll lock when modal dialog opens', () => {
    const dialog = createDialog({
      idBase: 'dialog-scroll-open',
      initialOpen: false,
      isModal: true,
    })

    expect(dialog.state.shouldLockScroll()).toBe(false)

    dialog.actions.open()
    expect(dialog.state.shouldLockScroll()).toBe(true)
  })

  // ── return focus to trigger on close ─────────────────────────
  it('returns focus to trigger on close', () => {
    const dialog = createDialog({
      idBase: 'dialog-restore',
      initialOpen: false,
    })

    dialog.actions.open('keyboard')
    expect(dialog.state.isOpen()).toBe(true)

    dialog.actions.close('escape')
    expect(dialog.state.isOpen()).toBe(false)
    expect(dialog.state.restoreTargetId()).toBe('dialog-restore-trigger')
  })

  it('returns focus to custom trigger id', () => {
    const dialog = createDialog({
      idBase: 'dialog-custom-trigger',
      initialOpen: false,
    })

    dialog.actions.setTriggerId('my-custom-trigger')
    dialog.actions.open('keyboard')
    dialog.actions.close('escape')
    expect(dialog.state.restoreTargetId()).toBe('my-custom-trigger')
  })

  // ── initial focus placement ──────────────────────────────────
  it('exposes initial focus target id in state', () => {
    const dialog = createDialog({
      idBase: 'dialog-init-focus',
      initialFocusId: 'email-input',
    })

    expect(dialog.state.initialFocusTargetId()).toBe('email-input')
  })

  it('exposes initial focus target in content props', () => {
    const dialog = createDialog({
      idBase: 'dialog-init-focus-props',
      initialFocusId: 'email-input',
    })

    const content = dialog.contracts.getContentProps()
    expect(content['data-initial-focus']).toBe('email-input')
  })

  it('defaults initial focus target to undefined', () => {
    const dialog = createDialog({
      idBase: 'dialog-no-init-focus',
    })

    expect(dialog.state.initialFocusTargetId()).toBeNull()

    const content = dialog.contracts.getContentProps()
    expect(content['data-initial-focus']).toBeUndefined()
  })

  // ── a11y contract linkage ────────────────────────────────────
  it('keeps trigger/content/title/description linkage consistent', () => {
    const dialog = createDialog({
      idBase: 'dialog-a11y',
      initialOpen: false,
    })

    const trigger = dialog.contracts.getTriggerProps()
    const content = dialog.contracts.getContentProps()
    const title = dialog.contracts.getTitleProps()
    const description = dialog.contracts.getDescriptionProps()

    expect(trigger['aria-controls']).toBe(content.id)
    expect(content['aria-labelledby']).toBe(title.id)
    expect(content['aria-describedby']).toBe(description.id)
    expect(content.role).toBe('dialog')
    expect(content['aria-modal']).toBe('true')
  })

  it('reflects aria-expanded toggle on trigger', () => {
    const dialog = createDialog({
      idBase: 'dialog-expanded',
      initialOpen: false,
    })

    expect(dialog.contracts.getTriggerProps()['aria-expanded']).toBe('false')

    dialog.actions.open()
    expect(dialog.contracts.getTriggerProps()['aria-expanded']).toBe('true')

    dialog.actions.close()
    expect(dialog.contracts.getTriggerProps()['aria-expanded']).toBe('false')
  })

  it('uses custom ariaLabelledBy and ariaDescribedBy ids', () => {
    const dialog = createDialog({
      idBase: 'dialog-custom-aria',
      ariaLabelledBy: 'custom-title',
      ariaDescribedBy: 'custom-desc',
    })

    const content = dialog.contracts.getContentProps()
    expect(content['aria-labelledby']).toBe('custom-title')
    expect(content['aria-describedby']).toBe('custom-desc')
  })

  // ── close button contract ────────────────────────────────────
  it('close button props include correct attributes and closes dialog', () => {
    const dialog = createDialog({
      idBase: 'dialog-close-btn',
      initialOpen: true,
    })

    const closeBtn = dialog.contracts.getCloseButtonProps()
    expect(closeBtn.role).toBe('button')
    expect(closeBtn.tabindex).toBe('0')
    expect(closeBtn.id).toBe('dialog-close-btn-close')

    closeBtn.onClick()
    expect(dialog.state.isOpen()).toBe(false)
  })

  // ── trigger click and keyboard handlers ──────────────────────
  it('opens via trigger click handler', () => {
    const dialog = createDialog({
      idBase: 'dialog-trigger-click',
      initialOpen: false,
    })

    dialog.actions.handleTriggerClick()
    expect(dialog.state.isOpen()).toBe(true)
  })

  it('opens via trigger keyboard Enter', () => {
    const dialog = createDialog({
      idBase: 'dialog-trigger-enter',
      initialOpen: false,
    })

    dialog.actions.handleTriggerKeyDown({key: 'Enter'})
    expect(dialog.state.isOpen()).toBe(true)
  })

  it('opens via trigger keyboard Space', () => {
    const dialog = createDialog({
      idBase: 'dialog-trigger-space',
      initialOpen: false,
    })

    dialog.actions.handleTriggerKeyDown({key: ' '})
    expect(dialog.state.isOpen()).toBe(true)
  })

  // ── overlay props ────────────────────────────────────────────
  it('overlay props reflect open state', () => {
    const dialog = createDialog({
      idBase: 'dialog-overlay',
      initialOpen: false,
    })

    expect(dialog.contracts.getOverlayProps().hidden).toBe(true)
    expect(dialog.contracts.getOverlayProps()['data-open']).toBe('false')

    dialog.actions.open()

    expect(dialog.contracts.getOverlayProps().hidden).toBe(false)
    expect(dialog.contracts.getOverlayProps()['data-open']).toBe('true')
  })

  // ── trigger props contract shape ─────────────────────────────
  it('trigger props include required aria attributes', () => {
    const dialog = createDialog({
      idBase: 'dialog-trigger-aria',
      initialOpen: false,
    })

    const trigger = dialog.contracts.getTriggerProps()
    expect(trigger.role).toBe('button')
    expect(trigger.tabindex).toBe('0')
    expect(trigger['aria-haspopup']).toBe('dialog')
    expect(typeof trigger.onClick).toBe('function')
    expect(typeof trigger.onKeyDown).toBe('function')
  })

  // ── type option (dialog / alertdialog) ─────────────────────
  it('defaults type to dialog and produces role: dialog in content props', () => {
    const dialog = createDialog({
      idBase: 'dialog-type-default',
    })

    expect(dialog.state.type()).toBe('dialog')
    expect(dialog.contracts.getContentProps().role).toBe('dialog')
  })

  it('type: alertdialog produces role: alertdialog in content props', () => {
    const dialog = createDialog({
      idBase: 'dialog-type-alert',
      type: 'alertdialog',
    })

    expect(dialog.state.type()).toBe('alertdialog')
    expect(dialog.contracts.getContentProps().role).toBe('alertdialog')
  })

  it('aria-describedby is present for alertdialog', () => {
    const dialog = createDialog({
      idBase: 'dialog-alert-desc',
      type: 'alertdialog',
    })

    const content = dialog.contracts.getContentProps()
    expect(content['aria-describedby']).toBe('dialog-alert-desc-description')
  })

  // ── header close button contract ───────────────────────────
  it('getHeaderCloseButtonProps returns correct shape with aria-label', () => {
    const dialog = createDialog({
      idBase: 'dialog-header-close',
    })

    const headerClose = dialog.contracts.getHeaderCloseButtonProps()
    expect(headerClose.id).toBe('dialog-header-close-header-close')
    expect(headerClose.role).toBe('button')
    expect(headerClose.tabindex).toBe('0')
    expect(headerClose['aria-label']).toBe('Close')
    expect(typeof headerClose.onClick).toBe('function')
  })

  it('getHeaderCloseButtonProps onClick closes the dialog', () => {
    const dialog = createDialog({
      idBase: 'dialog-header-close-action',
      initialOpen: true,
    })

    expect(dialog.state.isOpen()).toBe(true)
    dialog.contracts.getHeaderCloseButtonProps().onClick()
    expect(dialog.state.isOpen()).toBe(false)
  })
})
