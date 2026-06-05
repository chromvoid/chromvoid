import {describe, expect, it} from 'vitest'

import {CvConfirmDialog} from 'root/shared/services/cv-confirm-dialog'

function getDialogShell(dialog: CvConfirmDialog): Element {
  const shell = dialog.shadowRoot?.querySelector('cv-dialog')
  expect(shell).not.toBeNull()
  return shell!
}

describe('CvConfirmDialog behavior', () => {
  it('resolves show() with true when the confirm button is clicked', async () => {
    CvConfirmDialog.define()

    const dialog = document.createElement('cv-confirm-dialog') as CvConfirmDialog
    dialog.configure({
      title: 'SSH agent',
      message: 'Approve signing request',
      confirmText: 'Allow',
      cancelText: 'Deny',
    })

    document.body.append(dialog)
    await dialog.updateComplete

    const resultPromise = dialog.show()
    await dialog.updateComplete
    await Promise.resolve()
    await dialog.updateComplete

    const shell = getDialogShell(dialog)
    shell.dispatchEvent(new Event('cv-after-show', {bubbles: true, composed: true}))

    const confirmButton = dialog.shadowRoot?.querySelector('cv-button[variant="primary"]')
    expect(confirmButton).not.toBeNull()

    confirmButton?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))

    const unresolved = Symbol('unresolved')
    await expect(Promise.race([resultPromise, Promise.resolve(unresolved)])).resolves.toBe(unresolved)

    shell.dispatchEvent(new Event('cv-after-hide', {bubbles: true, composed: true}))

    await expect(resultPromise).resolves.toBe(true)
  })

  it('resolves show() with false when the cancel button is clicked', async () => {
    CvConfirmDialog.define()

    const dialog = document.createElement('cv-confirm-dialog') as CvConfirmDialog
    dialog.configure({
      title: 'SSH agent',
      message: 'Approve signing request',
      confirmText: 'Allow',
      cancelText: 'Deny',
    })

    document.body.append(dialog)
    await dialog.updateComplete

    const resultPromise = dialog.show()
    await dialog.updateComplete
    await Promise.resolve()
    await dialog.updateComplete

    const shell = getDialogShell(dialog)
    shell.dispatchEvent(new Event('cv-after-show', {bubbles: true, composed: true}))

    const cancelButton = dialog.shadowRoot?.querySelector('cv-button[variant="default"]')
    expect(cancelButton).not.toBeNull()

    cancelButton?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))

    const unresolved = Symbol('unresolved')
    await expect(Promise.race([resultPromise, Promise.resolve(unresolved)])).resolves.toBe(unresolved)

    shell.dispatchEvent(new Event('cv-after-hide', {bubbles: true, composed: true}))

    await expect(resultPromise).resolves.toBe(false)
  })

  it('resolves show() with null when the dialog closes implicitly', async () => {
    CvConfirmDialog.define()

    const dialog = document.createElement('cv-confirm-dialog') as CvConfirmDialog
    dialog.configure({
      title: 'SSH agent',
      message: 'Approve signing request',
      confirmText: 'Allow',
      cancelText: 'Deny',
    })

    document.body.append(dialog)
    await dialog.updateComplete

    const resultPromise = dialog.show()
    await dialog.updateComplete
    await Promise.resolve()
    await dialog.updateComplete

    const shell = getDialogShell(dialog)

    shell?.dispatchEvent(new Event('cv-after-show', {bubbles: true, composed: true}))
    shell?.dispatchEvent(
      new CustomEvent('cv-change', {
        detail: {open: false},
        bubbles: true,
        composed: true,
      }),
    )
    shell?.dispatchEvent(new Event('cv-after-hide', {bubbles: true, composed: true}))

    await expect(resultPromise).resolves.toBeNull()
  })

  it('does not reopen when closed before the deferred show update runs', async () => {
    CvConfirmDialog.define()

    const dialog = document.createElement('cv-confirm-dialog') as CvConfirmDialog
    dialog.configure({
      title: 'SSH agent',
      message: 'Approve signing request',
      confirmText: 'Allow',
      cancelText: 'Deny',
    })

    document.body.append(dialog)
    await dialog.updateComplete

    const resultPromise = dialog.show()
    dialog.close(false)

    await expect(resultPromise).resolves.toBe(false)
    await Promise.resolve()
    await dialog.updateComplete

    const shell = dialog.shadowRoot?.querySelector('cv-dialog') as
      | (HTMLElement & {open?: boolean})
      | null
    expect(shell?.open).toBe(false)
  })
})
