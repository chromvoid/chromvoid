import {wrap} from '@reatom/core'

import {CatalogEventType} from 'root/core/catalog/local-catalog/types'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {dialogService} from 'root/shared/services/dialog'
import {emitFileOpenCommand} from 'root/shared/services/file-command-service'
import type {AppContext} from 'root/shared/services/app-context'
import {i18n} from 'root/i18n'
import {canShareFiles} from 'root/shared/services/share'
import type {FileItemData, SearchFilters} from 'root/shared/contracts/file-manager'
import {getOpenActionPresentation, resolveFileFormat} from 'root/utils/file-format-registry'
import {writeAndroidUnlockDebug} from 'root/shared/services/android-unlock-debug'
import {DEFAULT_SESSION_SETTINGS, loadSessionSettings} from 'root/core/session/session-settings'

import type {FileDownloadFlow} from '../download-flow.model'
import type {FileMediaInspectionFlow} from '../media-inspection-flow.model'
import type {FileListModel} from './file-list.model'
import type {FileListViewportModel} from './file-list-viewport.model'
import type {FileMoveModel} from './file-move.model'
import type {FileDeletionMotionModel} from './file-deletion-motion.model'
import type {FileManagerActionDescriptor, FileManagerActionId} from './file-action-descriptors'

type NotificationKind = 'success' | 'error' | 'warning' | 'info'

type LoadingSignal = {
  set(value: boolean): void
}

const MARKDOWN_MIME_TYPE = 'text/markdown'

function formatMediaFileOpenTracePayload(payload: Record<string, unknown>): string {
  try {
    return JSON.stringify(payload)
  } catch {
    return String(payload)
  }
}

function traceMediaFileOpen(event: string, meta: Record<string, unknown>): void {
  writeAndroidUnlockDebug('media-playback/file-open', event, meta)
  console.info(
    '[media-playback][file-open]',
    formatMediaFileOpenTracePayload({
      event,
      ...meta,
    }),
  )
}

const normalizeMarkdownFileName = (name: string): string => {
  const trimmed = name.trim()
  return /\.md$/i.test(trimmed) ? trimmed.replace(/\.md$/i, '.md') : `${trimmed}.md`
}

async function* emptyByteSource(): AsyncIterable<Uint8Array> {}

export class FileActionsModel {
  constructor(
    private readonly ctx: AppContext,
    private readonly deps: {
      isLoading: LoadingSignal
      fileList: FileListModel
      viewport: FileListViewportModel
      mediaInspection: FileMediaInspectionFlow
      download: FileDownloadFlow
      fileMove: FileMoveModel
      deletionMotion: FileDeletionMotionModel
      openMoveDialogForItem: (item: FileItemData) => Promise<boolean>
    },
  ) {}

  getActionsForItem(item: FileItemData): FileManagerActionDescriptor[] {
    const format = resolveFileFormat(item)
    const openPresentation = getOpenActionPresentation(format)
    const externalOpenPending = this.isExternalOpenPending(item.id)
    const sharePending = this.isSharePending(item.id)
    const primaryOpenUsesSystem = this.doesPrimaryOpenUseSystem(item)

    return [
      {
        id: 'open',
        label: i18n(openPresentation.labelKey),
        icon: openPresentation.icon,
        disabled: primaryOpenUsesSystem && externalOpenPending,
      },
      {
        id: 'open-external',
        label: i18n('file-manager:open-in-system'),
        icon: 'box-arrow-up-right',
        disabled: item.isDir || externalOpenPending,
        shortcutId: 'files.openExternal',
      },
      ...(canShareFiles() && !item.isDir
        ? ([
            {
              id: 'share',
              label: i18n('button:share'),
              icon: 'share-2',
              disabled: sharePending,
            },
          ] satisfies FileManagerActionDescriptor[])
        : []),
      {
        id: 'rename',
        label: i18n('button:rename'),
        icon: 'pencil',
        shortcutId: 'files.rename',
        separatorBefore: true,
      },
      {
        id: 'move',
        label: i18n('file-manager:move:action'),
        icon: 'folder-symlink',
        disabled: !this.deps.fileMove.canOpenMoveDialogForItems([item]),
      },
      {
        id: 'download',
        label: i18n('button:download'),
        icon: 'download',
        disabled: item.isDir,
      },
      {
        id: 'delete',
        label: i18n('button:delete'),
        icon: 'trash',
        shortcutId: 'files.delete',
        separatorBefore: true,
      },
    ]
  }

  executeAction(actionId: string, item: FileItemData): boolean {
    switch (actionId as FileManagerActionId) {
      case 'open':
        void this.handleOpen(item)
        return true
      case 'open-external':
        if (item.isDir || this.isExternalOpenPending(item.id)) return false
        void this.handleOpenExternal(item)
        return true
      case 'share':
        if (item.isDir || this.isSharePending(item.id)) return false
        void this.handleShare(item)
        return true
      case 'rename':
        void this.handleRename(item)
        return true
      case 'move':
        if (!this.deps.fileMove.canOpenMoveDialogForItems([item])) return false
        void this.deps.openMoveDialogForItem(item)
        return true
      case 'download':
        if (item.isDir) return false
        void this.handleDownload(item)
        return true
      case 'delete':
        void this.handleDelete(item)
        return true
      case 'save-to-gallery':
        if (item.isDir) return false
        void this.handleSaveToGallery(item)
        return true
      case 'info':
        if (item.isDir) return false
        this.openDetailsPanel(item)
        return true
      default:
        return false
    }
  }

  async handleMove(source: FileItemData, target: FileItemData): Promise<void> {
    if (!target?.isDir) return
    await this.deps.fileMove.moveItems([source], target.path || '/')
  }

  async handleItemOpen(item: FileItemData): Promise<void> {
    const {catalog, store} = this.ctx
    if (!item.isDir) return

    const currentPath = this.currentPath()
    const newPath = this.buildDirectoryPath(currentPath, item.name)
    if (newPath === currentPath) return

    try {
      if (catalog?.catalog) {
        catalog.catalog.getChildren(newPath)
        store.setCurrentPath(newPath)
      }
    } catch {
      this.showNotification('error', i18n('file-manager:open-folder-failed', {name: item.name}))
    }
  }

  async handleOpen(item: FileItemData): Promise<void> {
    const resolvedItem = await this.deps.mediaInspection.ensureBeforeOpen(item, (nodeId) =>
      this.deps.fileList.getFileItemById(nodeId),
    )
    const format = resolveFileFormat(resolvedItem)

    switch (format.openBehavior.kind) {
      case 'folder':
        await this.handleItemOpen(resolvedItem)
        return
      case 'document':
        this.prepareDocumentReturnViewport(resolvedItem.id)
        emitFileOpenCommand({kind: 'document', mode: format.openBehavior.mode, fileId: resolvedItem.id})
        return
      case 'gallery':
        emitFileOpenCommand({kind: 'gallery', fileId: resolvedItem.id})
        return
      case 'video':
        emitFileOpenCommand({kind: 'video', fileId: resolvedItem.id, fileName: resolvedItem.name})
        return
      case 'audio':
        traceMediaFileOpen('audioFileOpen', {
          fileId: resolvedItem.id,
          mimeType: resolvedItem.mimeType ?? null,
          mediaInfoKind: resolvedItem.mediaInfo?.kind ?? null,
          size: resolvedItem.size ?? null,
        })
        emitFileOpenCommand({kind: 'audio', fileId: resolvedItem.id, fileName: resolvedItem.name})
        return
      case 'preview':
        if (this.doesPrimaryOpenUseSystem(resolvedItem)) {
          await this.handleOpenExternal(resolvedItem)
          return
        }
        emitFileOpenCommand({kind: 'preview', fileId: resolvedItem.id})
        return
    }
  }

  handleShare(item: FileItemData): Promise<void> {
    return this.deps.download.handleShare(item)
  }

  shareFileById(item: {
    fileId: number
    fileName: string
    mimeType?: string
    lastModified?: number
  }): Promise<void> {
    return this.deps.download.shareFileById(item)
  }

  async handleShareSelected(): Promise<void> {
    const caps = getRuntimeCapabilities()
    if (!caps.mobile || !caps.supports_native_share || !canShareFiles()) return

    const items = this.deps.fileList.getSelectedFileItems().filter((item) => !item.isDir)
    if (items.length === 0) return

    await this.deps.download.shareFilesBatch(
      items.map((item) => ({
        fileId: item.id,
        fileName: item.name,
        mimeType: item.mimeType,
        lastModified: item.lastModified,
      })),
    )
  }

  handleSaveToGallery(item: FileItemData): Promise<void> {
    return this.deps.download.handleSaveToGallery(item)
  }

  handleOpenExternal(item: FileItemData): Promise<void> {
    return this.deps.download.handleOpenExternal(item)
  }

  async handleRename(item: FileItemData): Promise<void> {
    const {catalog} = this.ctx
    const currentPath = this.currentPath()
    const newNameRaw = item.isDir
      ? await wrap(dialogService.showRenameFolderDialog(item.name, currentPath))
      : await wrap(dialogService.showRenameFileDialog(item.name, currentPath))
    const newName = newNameRaw?.trim()
    if (!newName || newName === item.name) return

    try {
      this.deps.isLoading.set(true)
      await wrap(catalog.api.rename(item.id, newName))
      if (item.isDir) {
        await wrap(this.refreshCatalogBestEffort())
      } else {
        catalog.catalog.applyEvent({
          type: CatalogEventType.NODE_RENAMED,
          nodeId: item.id,
          timestamp: Date.now(),
          version: 0,
          metadata: {newName},
        })
      }
      this.showNotification('success', i18n('file-manager:renamed', {from: item.name, to: newName}))
    } catch (error) {
      this.showNotification(
        'error',
        i18n('file-manager:rename-failed', {
          message: error instanceof Error ? error.message : String(error),
        }),
      )
    } finally {
      this.deps.isLoading.set(false)
    }
  }

  async renameFileById(input: {
    fileId: number
    fileName: string
    newName: string
    currentPath?: string
  }): Promise<string | null> {
    const {catalog} = this.ctx
    const newName = input.newName.trim()
    if (!newName || newName === input.fileName) return null

    try {
      this.deps.isLoading.set(true)
      await wrap(catalog.api.rename(input.fileId, newName))
      catalog.catalog.applyEvent({
        type: CatalogEventType.NODE_RENAMED,
        nodeId: input.fileId,
        timestamp: Date.now(),
        version: 0,
        metadata: {newName},
      })
      this.showNotification('success', i18n('file-manager:renamed', {from: input.fileName, to: newName}))
      return newName
    } catch (error) {
      this.showNotification(
        'error',
        i18n('file-manager:rename-failed', {
          message: error instanceof Error ? error.message : String(error),
        }),
      )
      return null
    } finally {
      this.deps.isLoading.set(false)
    }
  }

  handleDownload(item: FileItemData): Promise<void> {
    return this.deps.download.handleDownload(item)
  }

  async handleDelete(item: FileItemData): Promise<void> {
    const {catalog, store} = this.ctx
    if (await wrap(this.shouldConfirmFileDeletion())) {
      const confirmed = await wrap(dialogService.showDeleteConfirmDialog([item.name], item.isDir))
      if (!confirmed) return
    }

    this.deps.deletionMotion.markPending([item])
    try {
      this.deps.isLoading.set(true)
      await wrap(catalog.api.delete(item.id))
      await wrap(this.refreshCatalogBestEffort())
      try {
        store.setSelectedItems([])
      } catch {
        // ignore
      }
      this.showNotification('success', i18n('file-manager:deleted', {name: item.name}))
    } catch (error) {
      this.showNotification(
        'error',
        i18n('file-manager:delete-failed', {
          message: error instanceof Error ? error.message : String(error),
        }),
      )
      this.deps.deletionMotion.clearPending([item.id])
    } finally {
      this.deps.isLoading.set(false)
    }
  }

  async handleDownloadSelected(): Promise<void> {
    const selected = this.ctx.store.selectedNodeIds()
    if (selected.length === 0) return
    const items = this.deps.fileList.fileItems().filter((item) => selected.includes(item.id))
    for (const item of items) {
      if (!item.isDir) {
        await this.handleDownload(item)
      }
    }
  }

  async handleDeleteSelected(): Promise<void> {
    const {catalog, store} = this.ctx
    const selected = this.ctx.store.selectedNodeIds()
    if (selected.length === 0) return

    const items = this.deps.fileList.fileItems().filter((item) => selected.includes(item.id))
    if (await wrap(this.shouldConfirmFileDeletion())) {
      const confirmed = await wrap(dialogService.showDeleteConfirmDialog(items.map((item) => item.name)))
      if (!confirmed) return
    }
    this.deps.deletionMotion.markPending(items)
    const failedIds: number[] = []
    for (const item of items) {
      try {
        await wrap(catalog.api.delete(item.id))
      } catch (error) {
        failedIds.push(item.id)
        this.showNotification(
          'error',
          i18n('file-manager:delete-item-failed', {
            name: item.name,
            message: error instanceof Error ? error.message : String(error),
          }),
        )
      }
    }
    this.deps.deletionMotion.clearPending(failedIds)
    await wrap(this.refreshCatalogBestEffort())
    if (failedIds.length > 0) {
      try {
        store.setSelectedItems(failedIds)
      } catch {
        // ignore
      }
      this.showNotification(
        failedIds.length === items.length ? 'error' : 'warning',
        i18n('file-manager:selected-delete-partial', {
          deleted: String(items.length - failedIds.length),
          failed: String(failedIds.length),
        }),
      )
      return
    }

    try {
      store.setSelectedItems([])
    } catch {
      // ignore
    }
    this.showNotification('success', i18n('file-manager:selected-deleted'))
  }

  async handleCreateDir(): Promise<void> {
    const {catalog} = this.ctx
    const currentPath = this.currentPath()
    const displayPath = currentPath === '/' ? i18n('file-manager:root-directory') : currentPath

    const name = await wrap(dialogService.showCreateFolderDialog(displayPath))
    if (!name) return

    try {
      this.deps.isLoading.set(true)
      await wrap(catalog.api.createDir(name, currentPath === '/' ? undefined : currentPath))
      await wrap(this.refreshCatalogBestEffort())
      this.showNotification('success', i18n('file-manager:folder-created', {name}))
    } catch (error) {
      this.showNotification(
        'error',
        i18n('file-manager:create-folder-failed', {
          message: error instanceof Error ? error.message : String(error),
        }),
      )
    } finally {
      this.deps.isLoading.set(false)
    }
  }

  async handleCreateMarkdownNote(): Promise<void> {
    const {catalog} = this.ctx
    const currentPath = this.currentPath()
    const displayPath = currentPath === '/' ? i18n('file-manager:root-directory') : currentPath

    const rawName = await wrap(dialogService.showCreateMarkdownNoteDialog(displayPath))
    if (!rawName) return

    const name = normalizeMarkdownFileName(rawName)

    try {
      this.deps.isLoading.set(true)
      const uploaded = await wrap(catalog.api.upload({parentPath: currentPath === '/' ? undefined : currentPath, name}, 0, emptyByteSource(), {
        name,
        type: MARKDOWN_MIME_TYPE,
      }))
      await wrap(this.refreshCatalogBestEffort())
      this.prepareDocumentReturnViewport(uploaded.nodeId)
      emitFileOpenCommand({kind: 'document', mode: 'markdown', fileId: uploaded.nodeId})
      this.showNotification('success', i18n('file-manager:note-created', {name}))
    } catch (error) {
      this.showNotification(
        'error',
        i18n('file-manager:create-note-failed', {
          message: error instanceof Error ? error.message : String(error),
        }),
      )
    } finally {
      this.deps.isLoading.set(false)
    }
  }

  openDetailsPanel(item: FileItemData): void {
    if (item.isDir) return
    this.ctx.store.openDetailsPanel(item.id)
  }

  isExternalOpenPending(nodeId: number): boolean {
    return this.deps.download.isExternalOpenPending(nodeId)
  }

  isSharePending(nodeId: number): boolean {
    return this.deps.download.isSharePending(nodeId)
  }

  private currentPath(): string {
    return this.ctx.store.currentPath()
  }

  private async shouldConfirmFileDeletion(): Promise<boolean> {
    try {
      return (await wrap(loadSessionSettings())).confirm_file_deletion
    } catch (error) {
      console.warn('Failed to load file deletion confirmation setting', error)
      return DEFAULT_SESSION_SETTINGS.confirm_file_deletion
    }
  }

  private searchFilters(): SearchFilters {
    return this.ctx.store.searchFilters()
  }

  private prepareDocumentReturnViewport(fileId: number): void {
    this.deps.viewport.prepareDocumentReturn(fileId, this.currentPath(), this.searchFilters().viewMode)
  }

  private shouldOpenFallbackViaSystem(): boolean {
    const {platform} = getRuntimeCapabilities()
    return platform === 'macos' || platform === 'android'
  }

  private doesPrimaryOpenUseSystem(item: FileItemData): boolean {
    const format = resolveFileFormat(item)
    return (
      format.openBehavior.kind === 'preview' &&
      format.openBehavior.mode === 'fallback' &&
      this.shouldOpenFallbackViaSystem()
    )
  }

  private buildDirectoryPath(currentPath: string, itemName: string): string {
    const basePath = currentPath.endsWith('/') ? currentPath : currentPath + '/'
    const newPath = basePath + itemName + '/'
    return newPath.replace(/\/+/g, '/')
  }

  private showNotification(type: NotificationKind, message: string): void {
    this.ctx.store.pushNotification(type, message)
  }

  private async refreshCatalogBestEffort(): Promise<void> {
    try {
      await wrap(this.ctx.catalog.refresh())
    } catch {
      // best-effort refresh follows the previous `catch(() => {})` behavior
    }
  }
}
