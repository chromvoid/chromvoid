import {action, computed} from '@reatom/core'

import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {i18n} from 'root/i18n'
import {canShareFiles} from 'root/shared/services/share'

import type {FileListModel} from './file-list.model'

export type FileManagerMobileAction = {
  id: string
  icon: string
  label: string
  disabled?: boolean
}

export class FileManagerMobileActionsModel {
  readonly addActions = computed<FileManagerMobileAction[]>(() => this.getAddActions())
  readonly selectionBarActions = computed<FileManagerMobileAction[]>(() =>
    this.getSelectionBarActions(),
  )

  constructor(
    private readonly fileList: FileListModel,
    private readonly handlers: {
      handleMobileBack: () => boolean
      handleShareSelected: () => void | Promise<void>
      handleDeleteSelected: () => void | Promise<void>
      handleMoveSelected: () => void | Promise<void>
      handleCreateMarkdownNote: () => void | Promise<void>
      handleCreateDir: () => void | Promise<void>
      handleToolbarUpload: () => void | Promise<void>
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
      default:
        return false
    }
  }, 'FileManagerMobileActionsModel.executeCommand')

  private getAddActions(): FileManagerMobileAction[] {
    return [
      {id: 'create-note', icon: 'book-plus', label: i18n('file-manager:create-note')},
      {id: 'create-dir', icon: 'folder-plus', label: i18n('file-manager:create-folder')},
      {id: 'upload', icon: 'upload', label: i18n('file-manager:upload-files')},
    ]
  }

  private getSelectionBarActions(): FileManagerMobileAction[] {
    const selectedItems = this.fileList.getSelectedFileItems()
    const selectedFiles = selectedItems.filter((item) => !item.isDir)
    const selectedCount = selectedItems.length
    const shareAvailable = this.canUseNativeFileShare()

    return [
      {
        id: 'share-selected',
        icon: 'share-2',
        label: i18n('button:share'),
        disabled: !shareAvailable || selectedFiles.length === 0,
      },
      {
        id: 'move-selected',
        icon: 'folder-symlink',
        label: i18n('file-manager:move:action'),
        disabled: selectedCount === 0,
      },
      {
        id: 'delete-selected',
        icon: 'trash-2',
        label: i18n('button:delete'),
        disabled: selectedCount === 0,
      },
      {
        id: 'selection-done',
        icon: 'x',
        label: i18n('file-manager:selection-clear'),
      },
    ]
  }

  private canUseNativeFileShare(): boolean {
    const caps = getRuntimeCapabilities()
    return caps.mobile && caps.supports_native_share && canShareFiles()
  }
}
