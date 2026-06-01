import {
  setPassManagerDialogAdapter,
  type PassManagerAlertOptions,
  type PassManagerConfirmOptions,
} from '@project/passmanager/dialog'
import {dialogService} from 'root/shared/services/dialog-service'
import type {DialogVariant} from 'root/shared/services/dialog-types'

function mapVariant(variant: PassManagerAlertOptions['variant']): DialogVariant {
  return variant ?? 'default'
}

export function initPassmanagerDialogAdapter(): void {
  setPassManagerDialogAdapter({
    confirm(options: PassManagerConfirmOptions) {
      return dialogService.showConfirmDialog({
        title: options.title,
        message: options.message,
        confirmText: options.confirmText,
        cancelText: options.cancelText,
        variant: mapVariant(options.variant),
        confirmVariant: options.confirmVariant,
      })
    },
    alert(options: PassManagerAlertOptions) {
      return dialogService.showAlertDialog({
        title: options.title,
        message: options.message,
        confirmText: options.confirmText,
        variant: mapVariant(options.variant),
      })
    },
  })
}
