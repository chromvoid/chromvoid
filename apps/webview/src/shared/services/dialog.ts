// Реэкспортируем DialogService из локального модуля
// cv-dialog based сервис диалогов с Promise API
export {dialogService, DialogService} from './dialog-service.js'

// Для совместимости экспортируем также типы
export type {
  InputDialogOptions,
  ConfirmDialogOptions,
  SelectDialogOptions,
  InputDialogResult,
  ConfirmDialogResult,
  SelectDialogResult,
  DialogServiceInterface,
} from './dialog-types.js'

// Глобальная регистрация для удобства использования
import type {DialogService as DialogServiceType} from './dialog-service.js'

declare global {
  interface Window {
    dialogService: DialogServiceType
  }
}

// Импортируем для регистрации в window
import {dialogService} from './dialog-service.js'

// Регистрируем в window для глобального доступа
if (typeof window !== 'undefined') {
  window.dialogService = dialogService
}
