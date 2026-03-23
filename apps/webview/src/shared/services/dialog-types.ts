// Базовые типы для диалоговых компонентов

export type DialogSize = 's' | 'm' | 'l' | 'xl'
export type DialogVariant = 'default' | 'success' | 'warning' | 'danger' | 'info'

// Валидаторы (определены раньше для использования в InputDialogOptions)
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

// События диалогов
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

// Результаты диалогов
export type InputDialogResult = string | null
export type ConfirmDialogResult = boolean
export type SelectDialogResult = string | string[] | null

// Интерфейс для сервиса диалогов
export interface DialogServiceInterface {
  showInputDialog(options: InputDialogOptions): Promise<InputDialogResult>
  showConfirmDialog(options: ConfirmDialogOptions): Promise<ConfirmDialogResult>
  showSelectDialog(options: SelectDialogOptions): Promise<SelectDialogResult>
}

// Общие валидаторы для имен файлов/папок
export const FileValidators = {
  required: (value: string): ValidationResult => ({
    valid: value.trim().length > 0,
    message: value.trim().length === 0 ? 'Это поле обязательно для заполнения' : undefined,
  }),

  maxLength:
    (max: number) =>
    (value: string): ValidationResult => ({
      valid: value.length <= max,
      message: value.length > max ? `Максимальная длина: ${max} символов` : undefined,
    }),

  fileName: (value: string): ValidationResult => {
    const trimmed = value.trim()

    if (trimmed.length === 0) {
      return {valid: false, message: 'Имя файла не может быть пустым'}
    }

    // Запрещенные символы для имен файлов
    const invalidChars = /[<>:"/\\|?*\u0000-\u001f]/
    if (invalidChars.test(trimmed)) {
      return {
        valid: false,
        message: 'Имя файла содержит недопустимые символы: < > : " / \\ | ? *',
      }
    }

    // Запрещенные имена в Windows
    const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i
    if (reservedNames.test(trimmed)) {
      return {
        valid: false,
        message: 'Это имя зарезервировано системой и не может быть использовано',
      }
    }

    // Нельзя начинать или заканчивать точкой или пробелом
    if (
      trimmed.startsWith('.') ||
      trimmed.endsWith('.') ||
      trimmed.startsWith(' ') ||
      trimmed.endsWith(' ')
    ) {
      return {
        valid: false,
        message: 'Имя файла не может начинаться или заканчиваться точкой или пробелом',
      }
    }

    return {valid: true}
  },

  folderName: (value: string): ValidationResult => {
    // Валидация папки такая же как для файла
    return FileValidators.fileName(value)
  },
}

// Комбинированный валидатор
export function combineValidators(...validators: ValidatorFunction[]): ValidatorFunction {
  return (value: string) => {
    for (const validator of validators) {
      const result = validator(value)

      // Поддержка как ValidationResult, так и string | null
      if (typeof result === 'string') {
        return {valid: false, message: result}
      } else if (result && !result.valid) {
        return result
      } else if (result === null && validators.indexOf(validator) === 0) {
        // Если первый валидатор возвращает null, считаем что это ошибка
        return {valid: false}
      }
    }

    return {valid: true}
  }
}
