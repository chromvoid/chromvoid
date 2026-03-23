import type {TemplateResult} from 'lit'
import {announce, InertManager, findFirstFocusableElement} from '@chromvoid/ui'
import {
  createDialogController,
  type CustomDialogOptions as ControllerCustomDialogOptions,
  type DialogController,
} from '@chromvoid/uikit'
import type {
  InputDialogOptions,
  ConfirmDialogOptions,
  SelectDialogOptions,
  InputDialogResult,
  ConfirmDialogResult,
  SelectDialogResult,
  DialogServiceInterface,
  ValidatorFunction,
} from './dialog-types.js'
import {CvInputDialog} from './cv-input-dialog.js'
import {CvConfirmDialog} from './cv-confirm-dialog.js'

type DialogResult<T> = T | null

interface CustomDialogOptions {
  title?: string
  content: TemplateResult | string
  footer?: TemplateResult
  size?: 's' | 'm' | 'l' | 'xl'
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'
  closable?: boolean
  noHeader?: boolean
  noFooter?: boolean
  dialogClass?: string
}

// Локальные стили-оверрайды для showCustomDialog поверх generic controller из uikit.
const customDialogStyles = `
  cv-dialog.cv-managed-dialog {
    --cv-color-surface-elevated: var(--cv-color-surface, #ffffff);
    --cv-color-border: var(--cv-color-border, var(--cv-alpha-black-10));
    --cv-color-text: var(--cv-color-text, #1f2937);
    --cv-color-text-muted: var(--cv-color-text-muted, #64748b);
    --cv-color-primary: var(--cv-color-primary, #6366f1);
    --cv-dialog-border-radius: var(--cv-radius-2, 12px);
    --cv-dialog-max-height: calc(100dvh - 32px);
    --cv-dialog-title-font-size: var(--cv-font-size-lg, 1.125rem);
  }

  cv-dialog.cv-managed-dialog::part(header) {
    padding: var(--app-spacing-4, 1rem) var(--app-spacing-5, 1.25rem) 0;
  }

  cv-dialog.cv-managed-dialog::part(title) {
    margin: 0;
    font-size: var(--cv-font-size-lg, 1.125rem);
    color: var(--cv-color-text, #1f2937);
  }

  cv-dialog.cv-managed-dialog::part(description) {
    display: none;
  }

  cv-dialog.cv-managed-dialog > .cv-dialog-controller-body {
    padding: var(--app-spacing-5, 1.25rem);
    line-height: var(--line-height-relaxed, 1.625);
  }

  cv-dialog.cv-managed-dialog > .cv-dialog-controller-footer {
    display: flex;
    gap: var(--app-spacing-3, 0.75rem);
    justify-content: flex-end;
    padding: var(--app-spacing-4, 1rem) var(--app-spacing-5, 1.25rem);
    border-top: 1px solid var(--cv-color-border, var(--cv-alpha-black-10));
    background: var(--cv-color-surface-2, #f8fafc);
  }

  @media (max-width: 640px) {
    cv-dialog.cv-managed-dialog > .cv-dialog-controller-footer {
      flex-direction: row;
      gap: var(--app-spacing-2, 0.5rem);
      width: 100%;
    }

    cv-dialog.cv-managed-dialog > .cv-dialog-controller-footer > * {
      flex: 1 1 0;
    }
  }

  @media (max-width: 660px) {
    cv-dialog.cv-managed-dialog.pm-move-sheet::part(overlay) {
      place-items: end center;
      padding: 0 6px 6px;
    }

    cv-dialog.cv-managed-dialog.pm-move-sheet::part(content) {
      inline-size: calc(100vw - 12px);
      max-height: 82vh;
      border-radius: 16px 16px 10px 10px;
    }
  }
`

let stylesInjected = false
function injectStyles() {
  if (stylesInjected || typeof document === 'undefined') return
  const style = document.createElement('style')
  style.textContent = customDialogStyles
  style.id = 'chromvoid-dialog-styles'
  document.head.appendChild(style)
  stylesInjected = true
}

/**
 * Сервис для работы с диалогами.
 * showInputDialog / showConfirmDialog — используют веб-компоненты (cv-input-dialog, cv-confirm-dialog).
 * showCustomDialog — thin wrapper над generic dialog controller из uikit.
 */
export class DialogService implements DialogServiceInterface {
  private readonly inertManager = new InertManager()
  private readonly dialogController: DialogController

  constructor() {
    this.dialogController = createDialogController({
      announce,
      setInertExcept: (element) => this.inertManager.setInertExcept(element),
      restoreInert: () => this.inertManager.restoreAll(),
      findFirstFocusable: findFirstFocusableElement,
    })
    injectStyles()
    CvInputDialog.define()
    CvConfirmDialog.define()
  }

  // ========== Основные методы ==========

  async showInputDialog(options: InputDialogOptions): Promise<InputDialogResult> {
    const dialog = new CvInputDialog()
    dialog.configure(options)
    return this.dialogController.present({
      element: dialog,
      title: options.title || 'Ввод данных',
      show: () => dialog.show(),
      close: () => dialog.close(),
    })
  }

  async showConfirmDialog(options: ConfirmDialogOptions): Promise<ConfirmDialogResult> {
    const dialog = new CvConfirmDialog()
    dialog.configure(options)
    const result = await this.dialogController.present({
      element: dialog,
      title: options.title || 'Подтверждение',
      show: () => dialog.show(),
      close: () => dialog.close(),
    })
    return result ?? false
  }

  async showSelectDialog(_options: SelectDialogOptions): Promise<SelectDialogResult> {
    // TODO: Реализовать select диалог
    return null
  }

  /**
   * Показывает кастомный диалог с произвольным контентом.
   * Для сложных случаев, когда нужен querySelector по содержимому.
   */
  async showCustomDialog<T>(
    options: CustomDialogOptions,
    resultHandler: (dialog: HTMLElement, resolve: (value: DialogResult<T>) => void) => void,
  ): Promise<DialogResult<T>> {
    const controllerOptions: ControllerCustomDialogOptions = {
      title: options.title,
      content: options.content,
      footer: options.footer,
      size: options.size,
      closable: options.closable,
      noHeader: options.noHeader,
      noFooter: options.noFooter,
      className: options.dialogClass,
    }

    return this.dialogController.showCustom(controllerOptions, resultHandler)
  }

  // ========== Удобные методы ==========

  async showRenameFileDialog(currentName: string, currentPath = ''): Promise<string | null> {
    return this.showRenameDialog(currentName, false, currentPath)
  }

  async showRenameFolderDialog(currentName: string, currentPath = ''): Promise<string | null> {
    return this.showRenameDialog(currentName, true, currentPath)
  }

  async showCreateFolderDialog(currentPath = ''): Promise<string | null> {
    const folderNameValidator: ValidatorFunction = (value: string) => {
      const trimmed = value.trim()
      if (trimmed.length === 0) {
        return {valid: false, message: 'Имя папки не может быть пустым'}
      }
      const invalidChars = /[<>:"/\\|?*\u0000-\u001f]/
      if (invalidChars.test(trimmed)) {
        return {valid: false, message: 'Имя папки содержит недопустимые символы'}
      }
      return {valid: true}
    }

    return this.showInputDialog({
      title: 'Создание новой папки',
      label: 'Имя папки',
      placeholder: 'Введите имя папки...',
      helpText: currentPath
        ? `Папка будет создана в: ${currentPath}`
        : 'Папка будет создана в корневом каталоге',
      confirmText: 'Создать',
      cancelText: 'Отмена',
      required: true,
      maxLength: 100,
      validator: folderNameValidator,
      size: 'm',
      variant: 'default',
    })
  }

  async showRenameDialog(currentName: string, isFolder: boolean, currentPath = ''): Promise<string | null> {
    const nameValidator: ValidatorFunction = (value: string) => {
      const trimmed = value.trim()
      if (trimmed.length === 0) {
        return {valid: false, message: `Имя ${isFolder ? 'папки' : 'файла'} не может быть пустым`}
      }
      const invalidChars = /[<>:"/\\|?*\u0000-\u001f]/
      if (invalidChars.test(trimmed)) {
        return {valid: false, message: `Имя ${isFolder ? 'папки' : 'файла'} содержит недопустимые символы`}
      }
      return {valid: true}
    }

    const displayPath = currentPath ? ` в ${currentPath}` : ''
    const helpText = `${isFolder ? 'Папка' : 'Файл'} будет переименован${displayPath}`

    return this.showInputDialog({
      title: `Переименование ${isFolder ? 'папки' : 'файла'}`,
      label: 'Новое имя',
      value: currentName,
      placeholder: `Введите новое имя ${isFolder ? 'папки' : 'файла'}...`,
      helpText,
      confirmText: 'Переименовать',
      cancelText: 'Отмена',
      required: true,
      maxLength: 255,
      validator: nameValidator,
      size: 'm',
      variant: 'default',
    })
  }

  async showDeleteConfirmDialog(itemNames: string[], isFolder = false): Promise<boolean> {
    const count = itemNames.length
    const itemType = isFolder ? 'папку' : 'файл'
    const itemTypePlural = isFolder ? 'папки' : 'файлы'

    let message: string
    let title: string

    if (count === 1) {
      title = `Удаление ${itemType}`
      message = `Вы действительно хотите удалить ${itemType} "${itemNames[0]}"?\n\nЭто действие необратимо.`
    } else {
      title = `Удаление ${count} ${count < 5 ? itemTypePlural : isFolder ? 'папок' : 'файлов'}`
      message = `Вы действительно хотите удалить ${count} ${count < 5 ? itemTypePlural : isFolder ? 'папок' : 'файлов'}?\n\nЭто действие необратимо.`
    }

    return this.showConfirmDialog({
      title,
      message,
      confirmText: 'Удалить',
      cancelText: 'Отмена',
      confirmVariant: 'danger',
      size: 'm',
      variant: 'danger',
    })
  }

  // ========== Управление ==========

  closeAllDialogs() {
    this.dialogController.closeAll()
  }

  getActiveDialogsCount(): number {
    return this.dialogController.getActiveCount()
  }
}

export const dialogService = new DialogService()
export {DialogService as DialogServiceClass}
