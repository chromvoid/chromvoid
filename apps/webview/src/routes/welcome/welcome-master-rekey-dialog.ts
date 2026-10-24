import {html} from '@chromvoid/uikit/reatom-lit'
import {i18n} from 'root/i18n'
import {dialogService} from 'root/shared/services/dialog'
import {WelcomeMasterRekeyForm} from './welcome-master-rekey-form'
import type {WelcomeMasterRekeyDialogResult} from './welcome-master-rekey-dialog.model'

export async function openWelcomeMasterRekeyDialog(): Promise<WelcomeMasterRekeyDialogResult | null> {
  WelcomeMasterRekeyForm.define()

  return dialogService.showCustomDialog<WelcomeMasterRekeyDialogResult>(
    {
      title: i18n('changepwd:title'),
      content: html`<welcome-master-rekey-form></welcome-master-rekey-form>`,
      noFooter: true,
      size: 'm',
      dialogClass: 'welcome-master-rekey-dialog',
    },
    (dialog, resolve) => {
      dialog.addEventListener('welcome-master-rekey-submit', (event) => {
        const submitEvent = event as CustomEvent<WelcomeMasterRekeyDialogResult>
        resolve(submitEvent.detail)
      })
      dialog.addEventListener('welcome-master-rekey-cancel', () => resolve(null))

      window.requestAnimationFrame(() => {
        dialog.querySelector<WelcomeMasterRekeyForm>('welcome-master-rekey-form')?.focusCurrent()
      })
    },
  )
}
