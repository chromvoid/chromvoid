import {afterEach, describe, expect, it} from 'vitest'

import {dialogService} from 'root/shared/services/dialog-service'

async function flushDom() {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((resolve) => window.setTimeout(resolve, 0))
  await Promise.resolve()
}

async function waitFor(check: () => boolean, label: string) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (check()) return
    await flushDom()
  }

  throw new Error(`Timed out waiting for ${label}`)
}

describe('dialogService', () => {
  afterEach(() => {
    ;(dialogService as any).dialogController.closeAll()
    document.body.innerHTML = ''
    document.body.style.overflow = ''
  })

  it('does not leave the app inert after confirm dialog closes', async () => {
    const appRoot = document.createElement('div')
    appRoot.id = 'app-root'
    document.body.append(appRoot)

    const resultPromise = dialogService.showConfirmDialog({
      title: 'Confirm',
      message: 'Leave inert only while dialog is open',
    })

    await waitFor(() => document.querySelector('cv-confirm-dialog') !== null, 'confirm dialog to mount')
    await waitFor(() => appRoot.hasAttribute('inert'), 'app root to become inert')

    const dialog = document.querySelector('cv-confirm-dialog') as {close: (value?: boolean | null) => void} | null
    expect(dialog).not.toBeNull()

    dialog?.close(false)

    await expect(resultPromise).resolves.toBe(false)
    await waitFor(() => document.querySelector('cv-confirm-dialog') === null, 'confirm dialog to unmount')
    await waitFor(() => !appRoot.hasAttribute('inert'), 'app root inert to be restored')

    expect(document.querySelector('[inert]')).toBeNull()
  })

  it('keeps input dialog open when focus temporarily leaves before confirm', async () => {
    const resultPromise = dialogService.showInputDialog({
      title: 'Unlock vault',
      label: 'Vault password',
      type: 'password',
      required: true,
    })

    await waitFor(() => document.querySelector('cv-input-dialog') !== null, 'input dialog to mount')

    const dialog = document.querySelector('cv-input-dialog') as HTMLElement & {shadowRoot: ShadowRoot | null}
    expect(dialog).not.toBeNull()

    const input = dialog.shadowRoot?.querySelector('cv-input') as HTMLElement | null
    expect(input).not.toBeNull()

    input?.dispatchEvent(
      new CustomEvent('cv-change', {
        detail: {value: 'secret'},
        bubbles: true,
        composed: true,
      }),
    )
    await flushDom()

    expect(document.querySelector('cv-input-dialog')).toBe(dialog)

    const inputEl = input as {value?: string}
    inputEl.value = 'secret'

    const confirmButton = dialog.shadowRoot?.querySelector('cv-button[variant="primary"]') as HTMLElement | null
    expect(confirmButton).not.toBeNull()

    confirmButton?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))

    await expect(resultPromise).resolves.toBe('secret')
  })
})
