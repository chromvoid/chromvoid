import {html, type TemplateResult} from 'lit'
import {announce, InertManager, findFirstFocusableElement} from '@chromvoid/ui'
import {
  createDialogController,
  type CustomDialogOptions as ControllerCustomDialogOptions,
  type DialogController,
} from '@chromvoid/uikit/dialog'
import {i18n} from 'root/i18n'
import type {
  InputDialogOptions,
  ConfirmDialogOptions,
  AlertDialogOptions,
  SelectDialogOptions,
  InputDialogResult,
  ConfirmDialogResult,
  SelectDialogResult,
  DialogServiceInterface,
  ValidationResult,
  ValidatorFunction,
} from './dialog-types.js'
import {CvInputDialog} from './cv-input-dialog.js'
import {CvConfirmDialog} from './cv-confirm-dialog.js'
import {transientBackModel} from './transient-back.model.js'
import {AdaptiveModalSurface} from '../ui/adaptive-modal-surface.js'

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

function getSelectDialogResult(options: SelectDialogOptions, selectedValues: ReadonlySet<string>): SelectDialogResult {
  const orderedValues = options.options
    .filter((option) => !option.disabled && selectedValues.has(option.value))
    .map((option) => option.value)

  if (options.multiple) {
    return orderedValues
  }

  return orderedValues[0] ?? null
}

const INVALID_CATALOG_NAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/

function validateCatalogRenameName(value: string, isFolder: boolean): ValidationResult {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return {
      valid: false,
      message: i18n(isFolder ? 'dialogs:folder-name-empty' : 'dialogs:file-name-empty'),
    }
  }

  if (INVALID_CATALOG_NAME_CHARS.test(trimmed)) {
    return {
      valid: false,
      message: i18n(isFolder ? 'dialogs:folder-name-invalid' : 'dialogs:file-name-invalid'),
    }
  }

  return {valid: true}
}

async function waitForElementUpdate(element: Element | null | undefined): Promise<void> {
  const updateComplete = (element as {updateComplete?: unknown} | null | undefined)?.updateComplete
  if (updateComplete && typeof (updateComplete as Promise<unknown>).then === 'function') {
    await updateComplete
  }
}

export function validateRenameFileName(value: string): ValidationResult {
  return validateCatalogRenameName(value, false)
}

export function validateRenameFolderName(value: string): ValidationResult {
  return validateCatalogRenameName(value, true)
}


/*** Service for working with dialogues.
* showInputDialog / showConfirmDialog - use web components (cv-input-dialog, cv-confirm-dialog).
showCustomDialog - thin wrapper over generic dialog controller from uikit.
*/
export class DialogService implements DialogServiceInterface {
  private readonly inertManager = new InertManager()
  private readonly dialogController: DialogController
  private inputDialogPrewarmed = false
  private inputDialogPrewarmPromise: Promise<void> | null = null

  constructor() {
    AdaptiveModalSurface.define()
    this.dialogController = createDialogController({
      announce,
      setInertExcept: (element) => this.inertManager.setInertExcept(element),
      restoreInert: () => this.inertManager.restoreAll(),
      findFirstFocusable: findFirstFocusableElement,
      createCustomDialogElement: () => document.createElement('adaptive-modal-surface') as AdaptiveModalSurface,
    })
    transientBackModel.register(() => this.closeTopDialog(), {priority: 100})
    CvInputDialog.define()
    CvConfirmDialog.define()
  }

  // ================================================================================================================================================================================================================================================================ Basic methods =======

  prewarmInputDialog(options: Partial<InputDialogOptions> = {}): Promise<void> {
    if (this.inputDialogPrewarmed) {
      return Promise.resolve()
    }
    if (this.inputDialogPrewarmPromise) {
      return this.inputDialogPrewarmPromise
    }
    if (typeof document === 'undefined') {
      return Promise.resolve()
    }

    this.inputDialogPrewarmPromise = this.runInputDialogPrewarm(options)
      .then(() => {
        this.inputDialogPrewarmed = true
      })
      .finally(() => {
        this.inputDialogPrewarmPromise = null
      })

    return this.inputDialogPrewarmPromise
  }

  private async runInputDialogPrewarm(options: Partial<InputDialogOptions>): Promise<void> {
    const dialog = new CvInputDialog()
    dialog.configure({
      title: options.title ?? '',
      label: options.label ?? '',
      placeholder: options.placeholder ?? '',
      value: options.value ?? '',
      type: options.type ?? 'text',
      required: options.required ?? false,
      size: options.size,
      closable: options.closable,
      noHeader: options.noHeader,
    })

    document.body.append(dialog)

    try {
      await waitForElementUpdate(dialog)
      const surface = dialog.shadowRoot?.querySelector('adaptive-modal-surface')
      await waitForElementUpdate(surface)
      const sheet = surface?.shadowRoot?.querySelector('cv-bottom-sheet')
      const directDialog = surface?.shadowRoot?.querySelector('cv-dialog')
      await waitForElementUpdate(sheet)
      await waitForElementUpdate(directDialog)
      await waitForElementUpdate(sheet?.shadowRoot?.querySelector('cv-dialog'))
    } finally {
      dialog.remove()
    }
  }

  async showInputDialog(options: InputDialogOptions): Promise<InputDialogResult> {
    const dialog = new CvInputDialog()
    dialog.configure(options)
    return this.dialogController.present({
      element: dialog,
      title: options.title || i18n('dialogs:input-title'),
      show: () => dialog.show(),
      close: () => dialog.close(),
      autoFocus: false,
    })
  }

  async showConfirmDialog(options: ConfirmDialogOptions): Promise<ConfirmDialogResult> {
    const dialog = new CvConfirmDialog()
    dialog.configure(options)
    const result = await this.dialogController.present({
      element: dialog,
      title: options.title || i18n('dialogs:confirm-title'),
      show: () => dialog.show(),
      close: () => dialog.close(),
    })
    return result ?? false
  }

  async showAlertDialog(options: AlertDialogOptions): Promise<void> {
    const dialog = new CvConfirmDialog()
    dialog.configure({...options, mode: 'alert'})
    await this.dialogController.present({
      element: dialog,
      title: options.title || i18n('dialogs:confirm-title'),
      show: () => dialog.show(),
      close: () => dialog.close(),
    })
  }

  async showSelectDialog(options: SelectDialogOptions): Promise<SelectDialogResult> {
    const selectionMode = options.multiple ? 'multiple' : 'single'
    const inputName = `cv-select-dialog-${Math.random().toString(36).slice(2)}`

    const content = html`
      <div class="select-dialog">
        ${options.placeholder
          ? html`<p class="select-dialog-placeholder">${options.placeholder}</p>`
          : null}
        <div class="select-dialog-options" role=${selectionMode === 'multiple' ? 'group' : 'radiogroup'}>
          ${options.options.map(
            (option) => html`
              <label class="select-dialog-option ${option.disabled ? 'disabled' : ''}">
                <input
                  class="select-dialog-option-input"
                  type=${selectionMode === 'multiple' ? 'checkbox' : 'radio'}
                  name=${inputName}
                  value=${option.value}
                  ?disabled=${option.disabled}
                />
                <span class="select-dialog-option-label">${option.label}</span>
              </label>
            `,
          )}
        </div>
      </div>
    `

    const footer = html`
      <div class="select-dialog-actions">
        <cv-button unstyled type="button" class="select-dialog-action" data-action="cancel">
          ${options.cancelText || i18n('button:cancel')}
        </cv-button>
        <cv-button unstyled type="button" class="select-dialog-action primary" data-action="confirm">
          ${options.confirmText || i18n('button:ok')}
        </cv-button>
      </div>
    `

    const result = await this.showCustomDialog<SelectDialogResult>(
      {
        title: options.title || i18n('dialogs:confirm-title'),
        content,
        footer,
        size: options.size,
        closable: options.closable,
        noHeader: options.noHeader,
        noFooter: options.noFooter,
        dialogClass: 'cv-select-sheet',
      },
      (dialog, resolve) => {
        const selectedValues = new Set<string>()

        const getConfirmButton = () =>
          dialog.querySelector<HTMLButtonElement>('.select-dialog-action[data-action="confirm"]')

        const updateConfirmState = () => {
          const confirmButton = getConfirmButton()
          const selection = getSelectDialogResult(options, selectedValues)
          const hasSelection = Array.isArray(selection) ? selection.length > 0 : selection !== null
          if (confirmButton) {
            confirmButton.disabled = !hasSelection
          }
        }

        updateConfirmState()

        dialog.addEventListener('change', (event) => {
          const target = event.target
          if (!(target instanceof HTMLInputElement) || !target.classList.contains('select-dialog-option-input')) {
            return
          }

          if (selectionMode === 'multiple') {
            if (target.checked) {
              selectedValues.add(target.value)
            } else {
              selectedValues.delete(target.value)
            }
          } else {
            selectedValues.clear()
            if (target.checked) {
              selectedValues.add(target.value)
            }
          }

          updateConfirmState()
        })

        dialog.addEventListener('click', (event) => {
          const target = event.target
          if (!(target instanceof Element)) {
            return
          }

          const actionButton = target.closest<HTMLButtonElement>('.select-dialog-action')
          if (!actionButton) {
            return
          }

          const action = actionButton.dataset['action']
          if (action === 'cancel') {
            resolve(null)
            return
          }

          if (action === 'confirm') {
            const selection = getSelectDialogResult(options, selectedValues)
            if (selection === null || (Array.isArray(selection) && selection.length === 0)) {
              return
            }

            resolve(selection)
          }
        })
      },
    )

    return result
  }

  /*** Shows custom dialogue with arbitrary content.
* For complex cases where you need a content querySelector.
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

  // ================================================================================================================================================================================================================================================================ Convenient methods =========

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
        return {valid: false, message: i18n('dialogs:folder-name-empty')}
      }
      const invalidChars = /[<>:"/\\|?*\u0000-\u001f]/
      if (invalidChars.test(trimmed)) {
        return {valid: false, message: i18n('dialogs:folder-name-invalid')}
      }
      return {valid: true}
    }

    return this.showInputDialog({
      title: i18n('dialogs:create-folder-title'),
      label: i18n('dialogs:folder-name-label'),
      placeholder: i18n('dialogs:folder-name-placeholder'),
      helpText: currentPath
        ? i18n('dialogs:folder-created-in', {path: currentPath})
        : i18n('dialogs:folder-created-root'),
      confirmText: i18n('button:create'),
      cancelText: i18n('button:cancel'),
      required: true,
      maxLength: 100,
      validator: folderNameValidator,
      size: 'm',
      variant: 'default',
    })
  }

  async showCreateMarkdownNoteDialog(currentPath = ''): Promise<string | null> {
    const markdownNameValidator: ValidatorFunction = (value: string) => {
      const trimmed = value.trim()
      if (trimmed.length === 0) {
        return {valid: false, message: i18n('dialogs:file-name-empty')}
      }
      const invalidChars = /[<>:"/\\|?*\u0000-\u001f]/
      if (invalidChars.test(trimmed)) {
        return {valid: false, message: i18n('dialogs:file-name-invalid')}
      }
      const dotIndex = trimmed.lastIndexOf('.')
      if (dotIndex > 0 && trimmed.slice(dotIndex).toLowerCase() !== '.md') {
        return {valid: false, message: i18n('dialogs:markdown-note-extension-invalid')}
      }
      return {valid: true}
    }

    return this.showInputDialog({
      title: i18n('dialogs:create-markdown-note-title'),
      label: i18n('dialogs:markdown-note-name-label'),
      placeholder: i18n('dialogs:markdown-note-name-placeholder'),
      helpText: currentPath
        ? i18n('dialogs:markdown-note-created-in', {path: currentPath})
        : i18n('dialogs:markdown-note-created-root'),
      confirmText: i18n('button:create'),
      cancelText: i18n('button:cancel'),
      required: true,
      maxLength: 100,
      validator: markdownNameValidator,
      size: 'm',
      variant: 'default',
    })
  }

  async showRenameDialog(currentName: string, isFolder: boolean, currentPath = ''): Promise<string | null> {
    const nameValidator: ValidatorFunction = (value: string) => {
      return validateCatalogRenameName(value, isFolder)
    }

    const displayPath = currentPath ? i18n('dialogs:path-suffix', {path: currentPath}) : ''
    const helpText = i18n(
      isFolder ? 'dialogs:rename-folder-help' : 'dialogs:rename-file-help',
      {suffix: displayPath},
    )

    return this.showInputDialog({
      title: i18n(isFolder ? 'dialogs:rename-folder-title' : 'dialogs:rename-file-title'),
      label: i18n('dialogs:new-name-label'),
      value: currentName,
      placeholder: i18n(isFolder ? 'dialogs:new-name-folder-placeholder' : 'dialogs:new-name-file-placeholder'),
      helpText,
      confirmText: i18n('button:rename'),
      cancelText: i18n('button:cancel'),
      required: true,
      maxLength: 255,
      validator: nameValidator,
      size: 'm',
      variant: 'default',
    })
  }

  async showDeleteConfirmDialog(itemNames: string[], isFolder = false): Promise<boolean> {
    const count = itemNames.length
    const title =
      count === 1
        ? i18n(isFolder ? 'dialogs:delete-folder-title' : 'dialogs:delete-file-title')
        : i18n('dialogs:delete-items-title')
    const message =
      count === 1
        ? i18n(isFolder ? 'dialogs:delete-folder-message' : 'dialogs:delete-file-message', {
            name: itemNames[0] ?? '',
          })
        : i18n('dialogs:delete-items-message', {count: String(count)})

    return this.showConfirmDialog({
      title,
      message,
      confirmText: i18n('button:delete'),
      cancelText: i18n('button:cancel'),
      confirmVariant: 'danger',
      size: 'm',
      variant: 'danger',
    })
  }

  // ================================================================================================================================================================================================================================================================

  closeAllDialogs() {
    this.dialogController.closeAll()
  }

  closeTopDialog(): boolean {
    return this.dialogController.closeTop()
  }

  getActiveDialogsCount(): number {
    return this.dialogController.getActiveCount()
  }
}

export const dialogService = new DialogService()
export {DialogService as DialogServiceClass}
