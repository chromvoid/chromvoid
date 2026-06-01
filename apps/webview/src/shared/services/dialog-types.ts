import {i18n} from 'root/i18n'

// Basic types for dialogue components

export type DialogSize = 's' | 'm' | 'l' | 'xl'
export type DialogVariant = 'default' | 'success' | 'warning' | 'danger' | 'info'

// Validators (defined earlier for use in InputDialogOptions)
export interface ValidationResult {
  valid: boolean
  message?: string
}

export type ValidatorFunction = (value: string) => ValidationResult | string | null

export interface BaseDialogOptions {
  title?: string
  size?: DialogSize
  variant?: DialogVariant
  closable?: boolean
  noHeader?: boolean
  noFooter?: boolean
}

export interface InputDialogOptions extends BaseDialogOptions {
  label?: string
  placeholder?: string
  value?: string
  helpText?: string
  validator?: ValidatorFunction
  confirmText?: string
  cancelText?: string
  required?: boolean
  maxLength?: number
  type?: 'text' | 'password' | 'email' | 'url'
}

export interface ConfirmDialogOptions extends BaseDialogOptions {
  message?: string
  confirmText?: string
  cancelText?: string
  confirmVariant?: 'primary' | 'danger' | 'success'
}

export interface AlertDialogOptions extends BaseDialogOptions {
  message?: string
  confirmText?: string
}

export interface SelectDialogOptions extends BaseDialogOptions {
  options: Array<{
    value: string
    label: string
    disabled?: boolean
  }>
  multiple?: boolean
  placeholder?: string
  confirmText?: string
  cancelText?: string
}

// Developments of dialogues
export interface DialogShowEvent extends CustomEvent<void> {
  type: 'dialog-show'
}

export interface DialogCloseEvent extends CustomEvent<void> {
  type: 'dialog-close'
}

export interface DialogConfirmEvent extends CustomEvent<string | string[] | boolean> {
  type: 'dialog-confirm'
  detail: string | string[] | boolean
}

export interface DialogCancelEvent extends CustomEvent<void> {
  type: 'dialog-cancel'
}

// Results of the dialogues
export type InputDialogResult = string | null
export type ConfirmDialogResult = boolean
export type SelectDialogResult = string | string[] | null

// Interface for dialogue service
export interface DialogServiceInterface {
  prewarmInputDialog(options?: Partial<InputDialogOptions>): Promise<void>
  showInputDialog(options: InputDialogOptions): Promise<InputDialogResult>
  showConfirmDialog(options: ConfirmDialogOptions): Promise<ConfirmDialogResult>
  showAlertDialog(options: AlertDialogOptions): Promise<void>
  showSelectDialog(options: SelectDialogOptions): Promise<SelectDialogResult>
  closeTopDialog(): boolean
}

// Common validators for file names/folders
export const FileValidators = {
  required: (value: string): ValidationResult => ({
    valid: value.trim().length > 0,
    message: value.trim().length === 0 ? i18n('dialogs:field-required') : undefined,
  }),

  maxLength:
    (max: number) =>
    (value: string): ValidationResult => ({
      valid: value.length <= max,
      message: value.length > max ? i18n('dialogs:max-length', {max}) : undefined,
    }),

  fileName: (value: string): ValidationResult => {
    const trimmed = value.trim()

    if (trimmed.length === 0) {
      return {valid: false, message: i18n('dialogs:file-name-empty')}
    }

    // Prohibited characters for file names
    const invalidChars = /[<>:"/\\|?*\u0000-\u001f]/
    if (invalidChars.test(trimmed)) {
      return {
        valid: false,
        message: i18n('dialogs:file-name-invalid'),
      }
    }

    // Prohibited names in Windows
    const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i
    if (reservedNames.test(trimmed)) {
      return {
        valid: false,
        message: i18n('dialogs:file-name-reserved'),
      }
    }

    // You cannot start or end with a point or a gap.
    if (
      trimmed.startsWith('.') ||
      trimmed.endsWith('.') ||
      trimmed.startsWith(' ') ||
      trimmed.endsWith(' ')
    ) {
      return {
        valid: false,
        message: i18n('dialogs:file-name-dot-space'),
      }
    }

    return {valid: true}
  },

  folderName: (value: string): ValidationResult => {
    // Validation of the folder is the same as for the file
    return FileValidators.fileName(value)
  },
}

// Combined validator
export function combineValidators(...validators: ValidatorFunction[]): ValidatorFunction {
  return (value: string) => {
    for (const validator of validators) {
      const result = validator(value)

      // Support for both ValidationResult and string | null
      if (typeof result === 'string') {
        return {valid: false, message: result}
      } else if (result && !result.valid) {
        return result
      } else if (result === null && validators.indexOf(validator) === 0) {
        // If the first validator returns the null, we assume it is a mistake.
        return {valid: false}
      }
    }

    return {valid: true}
  }
}
