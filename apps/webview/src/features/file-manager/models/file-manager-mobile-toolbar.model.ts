import {action, computed} from '@reatom/core'

import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {i18n} from 'root/i18n'
import {canShareFiles} from 'root/shared/services/share'
import type {FileListItem} from 'root/shared/contracts/file-manager'

import type {FileActionsModel} from './file-actions.model'
import type {FileListModel} from './file-list.model'

export type FileManagerMobileToolbarAction = {
  id: string
  icon: string
  label: string
  disabled?: boolean
  active?: boolean
  tone?: 'accent'
}

export class FileManagerMobileToolbarModel {
  readonly actions = computed<FileManagerMobileToolbarAction[]>(() => this.getToolbarActions())

  constructor(
    private readonly fileList: FileListModel,
    private readonly fileActions: FileActionsModel,
    private readonly handlers: {
      selectionMode: () => boolean
      hasActiveSearchFilters: () => boolean
      handleMobileBack: () => boolean
      handleShareSelected: () => void | Promise<void>
      handleDownloadSelected: () => void | Promise<void>
      handleDeleteSelected: () => void | Promise<void>
      handleMoveSelected: () => void | Promise<void>
      handleCreateMarkdownNote: () => void | Promise<void>
      handleCreateDir: () => void | Promise<void>
      handleToolbarUpload: () => void | Promise<void>
      resetSearchFilters: () => void
      executeFileAction: (actionId: string, item: FileListItem) => boolean
    },
  ) {}

  readonly executeCommand = action((actionId: string): boolean => {
    if (actionId === 'selection-done') {
      this.handlers.handleMobileBack()
      return true
    }

    if (actionId === 'share-selected') {
      if (!this.canUseNativeFileShare()) return false
      void this.handlers.handleShareSelected()
      return true
    }

    if (actionId === 'download-selected') {
      void this.handlers.handleDownloadSelected()
      return true
    }

    if (actionId === 'delete-selected') {
      void this.handlers.handleDeleteSelected()
      return true
    }

    if (actionId === 'move-selected') {
      const selectedItems = this.fileList.getSelectedFileItems()
      if (selectedItems.length === 0) return false
      void this.handlers.handleMoveSelected()
      return true
    }

    const selectedItem = this.fileList.getSingleSelectedItem()
    if (selectedItem) {
      const action = this.fileActions.getActionsForItem(selectedItem).find((item) => item.id === actionId)
      if (action && !action.disabled) {
        return this.handlers.executeFileAction(action.id, selectedItem)
      }
    }

    switch (actionId) {
      case 'create-note':
        void this.handlers.handleCreateMarkdownNote()
        return true
      case 'create-dir':
        void this.handlers.handleCreateDir()
        return true
      case 'upload':
        void this.handlers.handleToolbarUpload()
        return true
      case 'filters-reset':
        this.handlers.resetSearchFilters()
        return true
      default:
        return false
    }
  }, 'FileManagerMobileToolbarModel.executeCommand')

  private getToolbarActions(): FileManagerMobileToolbarAction[] {
    if (this.isSelectionActive()) {
      return this.getSelectionToolbarActions()
    }

    const baseActions: FileManagerMobileToolbarAction[] = [
      {id: 'create-note', icon: 'book-plus', label: i18n('file-manager:create-note')},
      {id: 'create-dir', icon: 'folder-plus', label: i18n('file-manager:create-folder')},
      {id: 'upload', icon: 'upload', label: i18n('file-manager:upload-files')},
    ]

    if (!this.handlers.hasActiveSearchFilters()) {
      return baseActions
    }

    return [
      {
        id: 'filters-reset',
        icon: 'x',
        label: i18n('command-bar:reset-filters'),
        tone: 'accent',
      },
      ...baseActions,
    ]
  }

  private isSelectionActive(): boolean {
    return this.handlers.selectionMode() || this.fileList.selectedItems().length > 0
  }

  private getSelectionToolbarActions(): FileManagerMobileToolbarAction[] {
    const selectedItems = this.fileList.getSelectedFileItems()
    const doneAction: FileManagerMobileToolbarAction = {
      id: 'selection-done',
      icon: 'check-lg',
      label: i18n('button:done'),
    }

    if (selectedItems.length === 0) {
      return [doneAction]
    }

    if (selectedItems.length === 1) {
      const actions = this.getSingleSelectionActions(selectedItems[0]!)

      if (!this.canUseNativeFileShare()) {
        return [doneAction, ...actions]
      }

      const prioritizedActions = ['share', 'open']
        .map((actionId) => actions.find((action) => action.id === actionId))
        .filter((action): action is (typeof actions)[number] => action !== undefined)
      const remainingActions = actions.filter((action) => action.id !== 'share' && action.id !== 'open')

      return [doneAction, ...prioritizedActions, ...remainingActions]
    }

    return [
      doneAction,
      ...(this.canUseNativeFileShare()
        ? [
            {
              id: 'share-selected',
              icon: 'share-2',
              label: i18n('button:share'),
              disabled: !selectedItems.some((item) => !item.isDir),
            } satisfies FileManagerMobileToolbarAction,
          ]
        : []),
      {
        id: 'move-selected',
        icon: 'folder-symlink',
        label: i18n('file-manager:move:action'),
        disabled: selectedItems.length === 0,
      },
      {
        id: 'download-selected',
        icon: 'download',
        label: i18n('button:download'),
        disabled: !selectedItems.some((item) => !item.isDir),
      },
      {
        id: 'delete-selected',
        icon: 'trash',
        label: i18n('file-manager:delete-selected', {count: String(selectedItems.length)}),
      },
    ]
  }

  private getSingleSelectionActions(item: FileListItem): FileManagerMobileToolbarAction[] {
    return this.fileActions.getActionsForItem(item).map((action) => ({
      id: action.id,
      icon: action.icon,
      label: action.label,
      disabled: action.disabled,
    }))
  }

  private canUseNativeFileShare(): boolean {
    const caps = getRuntimeCapabilities()
    return caps.mobile && caps.supports_native_share && canShareFiles()
  }
}
