import {describe, expect, it, vi} from 'vitest'
import {createAlertDialog} from './index'

describe('createAlertDialog', () => {
  it('handles open and close transitions', () => {
    const model = createAlertDialog({
      idBase: 'alert-dialog-lifecycle',
    })

    expect(model.state.isOpen()).toBe(false)
    model.actions.open()
    expect(model.state.isOpen()).toBe(true)
    model.actions.close()
    expect(model.state.isOpen()).toBe(false)
  })

  it('defaults initial focus target to cancel button', () => {
    const model = createAlertDialog({
      idBase: 'alert-dialog-focus',
    })

    const cancelId = model.contracts.getCancelButtonProps().id
    expect(model.state.initialFocusTargetId()).toBe(cancelId)
    expect(model.contracts.getDialogProps()['data-initial-focus']).toBe(cancelId)
  })

  it('allows overriding initial focus target', () => {
    const model = createAlertDialog({
      idBase: 'alert-dialog-custom-focus',
      initialFocusId: 'custom-element',
    })

    expect(model.state.initialFocusTargetId()).toBe('custom-element')
    expect(model.contracts.getDialogProps()['data-initial-focus']).toBe('custom-element')
  })

  it('traps focus while open and releases on close', () => {
    const model = createAlertDialog({
      idBase: 'alert-dialog-trap',
    })

    expect(model.state.isFocusTrapped()).toBe(false)

    model.actions.open()
    expect(model.state.isFocusTrapped()).toBe(true)

    model.actions.close()
    expect(model.state.isFocusTrapped()).toBe(false)
  })

  it('restores focus target on close', () => {
    const model = createAlertDialog({
      idBase: 'alert-dialog-restore',
      triggerId: 'danger-trigger',
    })

    model.actions.open()
    expect(model.state.isFocusTrapped()).toBe(true)

    model.actions.close()
    expect(model.state.restoreTargetId()).toBe('danger-trigger')
  })

  it('dismisses on Escape key', () => {
    const model = createAlertDialog({
      idBase: 'alert-dialog-escape',
      initialOpen: true,
    })

    model.actions.handleKeyDown({key: 'Escape'})

    expect(model.state.isOpen()).toBe(false)
  })

  it('exposes role alertdialog with aria-modal true', () => {
    const model = createAlertDialog({
      idBase: 'alert-dialog-role',
    })

    const props = model.contracts.getDialogProps()
    expect(props.role).toBe('alertdialog')
    expect(props['aria-modal']).toBe('true')
  })

  it('always provides mandatory aria-describedby', () => {
    const model = createAlertDialog({
      idBase: 'alert-dialog-a11y',
    })

    const props = model.contracts.getDialogProps()
    expect(typeof props['aria-describedby']).toBe('string')
    expect(props['aria-describedby']).toBe('alert-dialog-a11y-description')
  })

  it('uses custom aria-describedby when provided', () => {
    const model = createAlertDialog({
      idBase: 'alert-dialog-custom-desc',
      ariaDescribedBy: 'my-custom-description',
    })

    expect(model.contracts.getDialogProps()['aria-describedby']).toBe('my-custom-description')
  })

  it('always provides mandatory aria-labelledby', () => {
    const model = createAlertDialog({
      idBase: 'alert-dialog-label',
    })

    const props = model.contracts.getDialogProps()
    expect(typeof props['aria-labelledby']).toBe('string')
    expect(props['aria-labelledby']).toBe('alert-dialog-label-title')
  })

  it('uses custom aria-labelledby when provided', () => {
    const model = createAlertDialog({
      idBase: 'alert-dialog-custom-label',
      ariaLabelledBy: 'my-custom-title',
    })

    expect(model.contracts.getDialogProps()['aria-labelledby']).toBe('my-custom-title')
  })

  it('description props id matches dialog aria-describedby', () => {
    const model = createAlertDialog({idBase: 'alert-dialog-desc-link'})

    const dialogProps = model.contracts.getDialogProps()
    const descProps = model.contracts.getDescriptionProps()
    expect(descProps.id).toBe(dialogProps['aria-describedby'])
  })

  it('title props id matches dialog aria-labelledby', () => {
    const model = createAlertDialog({idBase: 'alert-dialog-title-link'})

    const dialogProps = model.contracts.getDialogProps()
    const titleProps = model.contracts.getTitleProps()
    expect(titleProps.id).toBe(dialogProps['aria-labelledby'])
  })

  it('supports cancel and action buttons behavior', () => {
    const onCancel = vi.fn()
    const onAction = vi.fn()
    const model = createAlertDialog({
      idBase: 'alert-dialog-buttons',
      initialOpen: true,
      onCancel,
      onAction,
    })

    model.contracts.getActionButtonProps().onClick()
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(model.state.isOpen()).toBe(false)

    model.actions.open()
    model.contracts.getCancelButtonProps().onClick()
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(model.state.isOpen()).toBe(false)
  })

  it('action button does not close when closeOnAction is false', () => {
    const onAction = vi.fn()
    const model = createAlertDialog({
      idBase: 'alert-dialog-no-close',
      initialOpen: true,
      onAction,
      closeOnAction: false,
    })

    model.contracts.getActionButtonProps().onClick()
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(model.state.isOpen()).toBe(true)
  })
})
