export type PassManagerDialogVariant = 'default' | 'success' | 'warning' | 'danger' | 'info'
export type PassManagerConfirmVariant = 'primary' | 'danger' | 'success'

export interface PassManagerConfirmOptions {
  title?: string
  message?: string
  confirmText?: string
  cancelText?: string
  variant?: PassManagerDialogVariant
  confirmVariant?: PassManagerConfirmVariant
}

export interface PassManagerAlertOptions {
  title?: string
  message?: string
  confirmText?: string
  variant?: PassManagerDialogVariant
}

export interface PassManagerDialogAdapter {
  confirm(options: PassManagerConfirmOptions): Promise<boolean> | boolean
  alert?(options: PassManagerAlertOptions): Promise<void> | void
}

let dialogAdapter: PassManagerDialogAdapter | null = null

export function setPassManagerDialogAdapter(adapter: PassManagerDialogAdapter | null): void {
  dialogAdapter = adapter
}

export function getPassManagerDialogAdapter(): PassManagerDialogAdapter | null {
  return dialogAdapter
}

export async function confirmPassManagerAction(options: PassManagerConfirmOptions): Promise<boolean> {
  try {
    return (await dialogAdapter?.confirm(options)) === true
  } catch {
    return false
  }
}

export async function showPassManagerAlert(options: PassManagerAlertOptions): Promise<void> {
  try {
    await dialogAdapter?.alert?.(options)
  } catch {}
}
