import {action, atom, computed, wrap} from '@reatom/core'

import {navigationModel} from 'root/app/navigation/navigation.model'
import {dialogService, validateRenameFileName} from 'root/shared/services/dialog'

import {getFileManagerModel, type FileManagerModel} from '../file-manager.model'
import {
  markdownPreviewModel,
  type MarkdownPreviewData,
  type MarkdownPreviewModel,
} from './markdown-preview.model'

export type MarkdownDocumentRenameTarget = Pick<MarkdownPreviewData, 'fileId' | 'fileName'>

export type MarkdownDocumentRenameModelDeps = {
  previewModel?: Pick<
    MarkdownPreviewModel,
    'state' | 'dirty' | 'saving' | 'formatting' | 'save' | 'applyFileRename'
  >
  getFileManagerModel?: () => Pick<FileManagerModel, 'renameFileById'>
  showRenameFileDialog?: (currentName: string, currentPath?: string) => Promise<string | null>
  getCurrentPath?: () => string
}

export class MarkdownDocumentRenameModel {
  readonly editing = atom(false, 'markdown.documentRename.editing')
  readonly draftName = atom('', 'markdown.documentRename.draftName')
  readonly validationError = atom<string | null>(null, 'markdown.documentRename.validationError')
  readonly renaming = atom(false, 'markdown.documentRename.renaming')
  readonly canRename = computed(() => {
    const state = this.preview.state()
    return state.kind === 'ready' && !state.saving && !state.formatting && !this.renaming()
  }, 'markdown.documentRename.canRename')

  readonly state = {
    editing: this.editing,
    draftName: this.draftName,
    validationError: this.validationError,
    renaming: this.renaming,
    canRename: this.canRename,
  }

  private readonly preview: NonNullable<MarkdownDocumentRenameModelDeps['previewModel']>
  private readonly getFileManager: NonNullable<MarkdownDocumentRenameModelDeps['getFileManagerModel']>
  private readonly showRenameDialog: NonNullable<MarkdownDocumentRenameModelDeps['showRenameFileDialog']>
  private readonly getCurrentPath: NonNullable<MarkdownDocumentRenameModelDeps['getCurrentPath']>

  constructor(deps: MarkdownDocumentRenameModelDeps = {}) {
    this.preview = deps.previewModel ?? markdownPreviewModel
    this.getFileManager = deps.getFileManagerModel ?? (() => getFileManagerModel())
    this.showRenameDialog =
      deps.showRenameFileDialog ?? ((currentName, currentPath) => dialogService.showRenameFileDialog(currentName, currentPath))
    this.getCurrentPath = deps.getCurrentPath ?? (() => navigationModel.filesPath())
  }

  readonly startInlineRename = action((fileName: string): boolean => {
    if (!this.canRename()) {
      return false
    }

    this.draftName.set(fileName)
    this.validationError.set(null)
    this.editing.set(true)
    return true
  }, 'markdown.documentRename.startInlineRename')

  readonly updateDraftName = action((value: string): void => {
    this.draftName.set(value)
    if (this.validationError()) {
      this.validationError.set(null)
    }
  }, 'markdown.documentRename.updateDraftName')

  readonly cancelInlineRename = action((): void => {
    this.editing.set(false)
    this.draftName.set('')
    this.validationError.set(null)
  }, 'markdown.documentRename.cancelInlineRename')

  readonly reset = action((): void => {
    this.cancelInlineRename()
    this.renaming.set(false)
  }, 'markdown.documentRename.reset')

  async commitInlineRename(target: MarkdownDocumentRenameTarget | null | undefined): Promise<boolean> {
    if (!this.editing()) {
      return false
    }

    const renamed = await this.renameTarget(target, this.draftName())
    if (renamed) {
      this.cancelInlineRename()
    }
    return renamed
  }

  async openRenameDialog(target: MarkdownDocumentRenameTarget | null | undefined): Promise<boolean> {
    if (!target || !this.canRename()) {
      return false
    }

    const nextName = await wrap(this.showRenameDialog(target.fileName, this.getCurrentPath()))
    if (nextName == null) {
      return false
    }

    return this.renameTarget(target, nextName)
  }

  private async renameTarget(
    target: MarkdownDocumentRenameTarget | null | undefined,
    rawName: string,
  ): Promise<boolean> {
    if (!target) {
      return false
    }

    const validation = validateRenameFileName(rawName)
    if (!validation.valid) {
      this.validationError.set(validation.message ?? '')
      return false
    }

    const nextName = rawName.trim()
    if (nextName === target.fileName) {
      return true
    }
    if (!this.canRename()) {
      return false
    }

    this.renaming.set(true)
    this.validationError.set(null)
    try {
      if (this.preview.dirty()) {
        const saved = await wrap(this.preview.save())
        if (!saved) {
          return false
        }
      }

      const renamedName = await wrap(this.getFileManager().renameFileById({
        fileId: target.fileId,
        fileName: target.fileName,
        newName: nextName,
        currentPath: this.getCurrentPath(),
      }))
      if (!renamedName) {
        return false
      }

      this.preview.applyFileRename(target.fileId, renamedName)
      navigationModel.updateCurrentMarkdownDocumentFileName(target.fileId, renamedName)
      return true
    } finally {
      this.renaming.set(false)
    }
  }
}

export const markdownDocumentRenameModel = new MarkdownDocumentRenameModel()
