import {afterEach, describe, expect, it, vi} from 'vitest'

import {i18n} from '../../src/i18n'
import {
  openWelcomeMasterRekeyDialog,
  WelcomeMasterRekeyDialogModel,
  WelcomeMasterRekeyForm,
  type WelcomeMasterRekeyDialogResult,
} from '../../src/routes/welcome/welcome-master-rekey-dialog'
import {dialogService} from '../../src/shared/services/dialog-service'

async function settle(element?: {updateComplete?: Promise<unknown>} | null): Promise<void> {
  await element?.updateComplete
  await Promise.resolve()
  await element?.updateComplete
}

function mountForm(): Promise<WelcomeMasterRekeyForm> {
  WelcomeMasterRekeyForm.define()
  const form = document.createElement('welcome-master-rekey-form') as WelcomeMasterRekeyForm
  document.body.append(form)
  return settle(form).then(() => form)
}

function setInputValue(form: WelcomeMasterRekeyForm, index: number, value: string): void {
  const input = form.shadowRoot?.querySelectorAll('cv-input')[index]
  input?.dispatchEvent(new CustomEvent('cv-input', {detail: {value}, bubbles: true, composed: true}))
}

function submitForm(form: WelcomeMasterRekeyForm): Event {
  const event = new Event('submit', {bubbles: true, cancelable: true})
  form.shadowRoot?.querySelector('form')?.dispatchEvent(event)
  return event
}

describe('welcome master rekey dialog', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('validates required current and new password fields', () => {
    const model = new WelcomeMasterRekeyDialogModel()

    expect(model.submit()).toBeNull()
    expect(model.state().error).toBe(i18n('welcome:master-required'))

    model.setCurrentPassword('current master password')
    expect(model.submit()).toBeNull()
    expect(model.state().error).toBe(i18n('welcome:master-required'))
  })

  it('validates password policy and confirmation mismatch', () => {
    const model = new WelcomeMasterRekeyDialogModel()
    model.setCurrentPassword('current master password')

    model.setNewMasterPassword('short')
    model.setConfirmPassword('short')
    expect(model.submit()).toBeNull()
    expect(model.state().error).toBe(i18n('welcome:master-too-short'))

    model.setNewMasterPassword('current master password')
    model.setConfirmPassword('current master password')
    expect(model.submit()).toBeNull()
    expect(model.state().error).toBe(i18n('changepwd:same-password'))

    model.setNewMasterPassword('new master password')
    model.setConfirmPassword('different master password')
    expect(model.submit()).toBeNull()
    expect(model.state().error).toBe(i18n('welcome:master-mismatch'))
  })

  it('returns a submit payload when all fields are valid', () => {
    const model = new WelcomeMasterRekeyDialogModel()

    model.setCurrentPassword('current master password')
    model.setNewMasterPassword('new master password')
    model.setConfirmPassword('new master password')

    expect(model.submit()).toEqual({
      currentPassword: 'current master password',
      newMasterPassword: 'new master password',
    })
  })

  it('emits cancel and submit events from the form', async () => {
    const form = await mountForm()
    const cancel = vi.fn()
    const submit = vi.fn((event: Event) => (event as CustomEvent<WelcomeMasterRekeyDialogResult>).detail)
    form.addEventListener('welcome-master-rekey-cancel', cancel)
    form.addEventListener('welcome-master-rekey-submit', submit)

    form.shadowRoot?.querySelector('cv-button[variant="default"]')?.dispatchEvent(
      new MouseEvent('click', {bubbles: true, composed: true}),
    )
    expect(cancel).toHaveBeenCalledTimes(1)

    setInputValue(form, 0, 'current master password')
    setInputValue(form, 1, 'new master password')
    setInputValue(form, 2, 'new master password')
    await settle(form)
    const submitEvent = submitForm(form)

    expect(submitEvent.defaultPrevented).toBe(true)
    expect(submit).toHaveBeenCalledTimes(1)
    expect(submit.mock.results[0]?.value).toEqual({
      currentPassword: 'current master password',
      newMasterPassword: 'new master password',
    })
  })

  it('resolves null when the dialog is cancelled', async () => {
    vi.spyOn(dialogService, 'showCustomDialog').mockImplementation(((_options, handler) => {
      return new Promise((resolve) => {
        const dialog = document.createElement('div')
        handler(dialog, resolve)
        dialog.dispatchEvent(new CustomEvent('welcome-master-rekey-cancel'))
      })
    }) as typeof dialogService.showCustomDialog)

    await expect(openWelcomeMasterRekeyDialog()).resolves.toBeNull()
  })

  it('resolves the submitted payload from the dialog event', async () => {
    vi.spyOn(dialogService, 'showCustomDialog').mockImplementation(((_options, handler) => {
      return new Promise((resolve) => {
        const dialog = document.createElement('div')
        handler(dialog, resolve)
        dialog.dispatchEvent(
          new CustomEvent<WelcomeMasterRekeyDialogResult>('welcome-master-rekey-submit', {
            detail: {
              currentPassword: 'current master password',
              newMasterPassword: 'new master password',
            },
          }),
        )
      })
    }) as typeof dialogService.showCustomDialog)

    await expect(openWelcomeMasterRekeyDialog()).resolves.toEqual({
      currentPassword: 'current master password',
      newMasterPassword: 'new master password',
    })
  })
})
