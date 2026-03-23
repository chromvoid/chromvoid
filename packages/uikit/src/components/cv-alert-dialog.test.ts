import {afterEach, describe, expect, it} from 'vitest'

import {CVAlertDialog} from './cv-alert-dialog'

const settle = async (element: CVAlertDialog) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
}

afterEach(() => {
  document.body.innerHTML = ''
  document.body.style.overflow = ''
})

describe('cv-alert-dialog', () => {
  it('opens from trigger and closes from cancel button', async () => {
    CVAlertDialog.define()

    const dialog = document.createElement('cv-alert-dialog') as CVAlertDialog
    document.body.append(dialog)
    await settle(dialog)

    const trigger = dialog.shadowRoot?.querySelector('[part="trigger"]') as HTMLButtonElement
    const overlay = dialog.shadowRoot?.querySelector('[part="overlay"]') as HTMLElement
    const cancel = dialog.shadowRoot?.querySelector('[part="cancel"]') as HTMLButtonElement

    trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(dialog)
    expect(dialog.open).toBe(true)
    expect(overlay.hidden).toBe(false)

    cancel.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(dialog)
    expect(dialog.open).toBe(false)
    expect(overlay.hidden).toBe(true)
  })

  it('closes on Escape by default', async () => {
    CVAlertDialog.define()

    const dialog = document.createElement('cv-alert-dialog') as CVAlertDialog
    dialog.open = true
    document.body.append(dialog)
    await settle(dialog)

    const content = dialog.shadowRoot?.querySelector('[part="content"]') as HTMLElement
    content.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
    await settle(dialog)

    expect(dialog.open).toBe(false)
  })

  it('keeps dialog open when closeOnAction is false', async () => {
    CVAlertDialog.define()

    const dialog = document.createElement('cv-alert-dialog') as CVAlertDialog
    dialog.closeOnAction = false
    dialog.open = true

    let actionCount = 0
    dialog.addEventListener('cv-action', () => {
      actionCount += 1
    })

    document.body.append(dialog)
    await settle(dialog)

    const action = dialog.shadowRoot?.querySelector('[part="action"]') as HTMLButtonElement
    action.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(dialog)

    expect(actionCount).toBe(1)
    expect(dialog.open).toBe(true)
  })

  it('closes on overlay outside pointer', async () => {
    CVAlertDialog.define()

    const dialog = document.createElement('cv-alert-dialog') as CVAlertDialog
    dialog.open = true
    document.body.append(dialog)
    await settle(dialog)

    const overlay = dialog.shadowRoot?.querySelector('[part="overlay"]') as HTMLElement
    overlay.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}))
    await settle(dialog)

    expect(dialog.open).toBe(false)
  })
})
