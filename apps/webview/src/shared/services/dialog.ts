// Re-export DialogService from the local module
// cv-dialog-based dialogue service with Promise API
export {
  dialogService,
  DialogService,
  validateRenameFileName,
  validateRenameFolderName,
} from './dialog-service.js'

// For compatibility, we also export types.
export type {
  InputDialogOptions,
  ConfirmDialogOptions,
  SelectDialogOptions,
  InputDialogResult,
  ConfirmDialogResult,
  SelectDialogResult,
  DialogServiceInterface,
} from './dialog-types.js'

// Global registration for usability
import type {DialogService as DialogServiceType} from './dialog-service.js'

declare global {
  interface Window {
    dialogService: DialogServiceType
  }
}

// Import for registration in window
import {dialogService} from './dialog-service.js'

// Register in the window for global access
if (typeof window !== 'undefined') {
  window.dialogService = dialogService
}
