import {atom} from '@reatom/core'

import type {AppContext} from 'root/shared/services/app-context'
import {getAppContext} from 'root/shared/services/app-context'
import {writeAndroidUnlockDebug} from 'root/shared/services/android-unlock-debug'
import {
  DEFAULT_SESSION_SETTINGS,
  loadSessionSettings,
  sessionSettingsState,
} from 'root/core/session/session-settings'

import {FileUploadFlow} from './upload-flow.model'
import {FileDownloadFlow} from './download-flow.model'
import {FileMediaInspectionFlow} from './media-inspection-flow.model'
import {FileListViewportModel} from './models/file-list-viewport.model'
import {FileListModel} from './models/file-list.model'
import {FileActionsModel} from './models/file-actions.model'
import {FileDeletionMotionModel} from './models/file-deletion-motion.model'
import {FileMoveModel, type FileDragPayload} from './models/file-move.model'
import {FileManagerMobileToolbarModel} from './models/file-manager-mobile-toolbar.model'
import type {FileManagerMobileToolbarAction} from './models/file-manager-mobile-toolbar.model'
import {
  createDefaultFileSearchFilters,
  createFileSearchFilterActions,
  hasNonDefaultFileSearchFilters,
} from './models/file-search-filters.model'
import type {FileManagerActionDescriptor} from './models/file-action-descriptors'
import {
  subscribeFileManagerCommand,
  type FileManagerCommand,
} from './services/file-manager-commands'
import {openFileMoveDialog} from './services/file-move-dialog'
import type {
  FileItemData,
  FileListVisibleRange,
  FileListViewportSnapshot,
  SearchFilters,
} from 'root/shared/contracts/file-manager'

let sharedFileManagerModel: FileManagerModel | undefined
let sharedFileManagerCtx: AppContext | undefined

export class FileManagerModel {
  readonly isLoading = atom(false)

  private readonly ctx: AppContext
  private readonly viewport = new FileListViewportModel()
  private readonly mediaInspection: FileMediaInspectionFlow
  private readonly fileList: FileListModel
  private readonly upload: FileUploadFlow
  private readonly download: FileDownloadFlow
  private readonly actions: FileActionsModel
  readonly deletionMotion = new FileDeletionMotionModel()
  readonly fileMove: FileMoveModel
  private readonly mobileToolbar: FileManagerMobileToolbarModel
  readonly fileItems: FileListModel['fileItems']
  readonly renderItems: FileListModel['renderItems']
  readonly totalCount: FileListModel['totalCount']
  readonly filteredCount: FileListModel['filteredCount']
  readonly selectedCount: FileListModel['selectedCount']
  readonly searchFilterActions = createFileSearchFilterActions({
    read: () => this.searchFilters(),
    write: (next) => this.commitSearchFilters(next),
    getDefaults: () => this.getDefaultSearchFilters(),
  })

  private connected = false
  private unsubscribeCommands?: () => void
  private unsubscribeSessionSettings?: () => void
  private currentShowHiddenDefault = DEFAULT_SESSION_SETTINGS.show_hidden_files

  constructor(ctx: AppContext = getAppContext()) {
    this.ctx = ctx
    this.mediaInspection = new FileMediaInspectionFlow(ctx)
    this.fileList = new FileListModel(ctx, this.mediaInspection)
    this.fileItems = this.fileList.fileItems
    this.renderItems = this.fileList.renderItems
    this.totalCount = this.fileList.totalCount
    this.filteredCount = this.fileList.filteredCount
    this.selectedCount = this.fileList.selectedCount
    this.fileMove = new FileMoveModel(ctx, {
      fileList: this.fileList,
      isLoading: this.isLoading,
      ensureVisibleRangeLoaded: () => this.fileList.ensureVisibleRangeLoaded(),
    })
    this.upload = new FileUploadFlow(ctx, () => this.currentPath())
    this.download = new FileDownloadFlow(ctx)
    this.actions = new FileActionsModel(ctx, {
      isLoading: this.isLoading,
      fileList: this.fileList,
      viewport: this.viewport,
      mediaInspection: this.mediaInspection,
      download: this.download,
      fileMove: this.fileMove,
      deletionMotion: this.deletionMotion,
      openMoveDialogForItem: (item) => this.openMoveDialogForItem(item),
    })
    this.mobileToolbar = new FileManagerMobileToolbarModel(this.fileList, this.actions, {
      selectionMode: () => this.ctx.store.selectionMode(),
      hasActiveSearchFilters: () => this.hasActiveSearchFilters(),
      handleMobileBack: () => this.handleMobileBack(),
      handleShareSelected: () => this.handleShareSelected(),
      handleDownloadSelected: () => this.handleDownloadSelected(),
      handleDeleteSelected: () => this.handleDeleteSelected(),
      handleMoveSelected: () => {
        void this.openMoveDialogForSelectedItems()
      },
      handleCreateMarkdownNote: () => this.handleCreateMarkdownNote(),
      handleCreateDir: () => this.handleCreateDir(),
      handleToolbarUpload: () => this.handleToolbarUpload(),
      resetSearchFilters: () => this.resetSearchFilters(),
      executeFileAction: (actionId, item) => this.executeFileAction(actionId, item),
    })
  }

  get isDragActive() {
    return this.upload.isDragActive
  }

  get fileListViewportRestore() {
    return this.viewport.restore
  }

  get externalOpenPendingIds() {
    return this.download.externalOpenPendingIds
  }

  get currentPath() {
    return this.ctx.store.currentPath
  }

  get searchFilters() {
    return this.ctx.store.searchFilters
  }

  get selectedItems() {
    return this.ctx.store.selectedNodeIds
  }

  connect(): void {
    if (this.connected) return
    this.connected = true
    writeAndroidUnlockDebug('file-manager-model', 'connect:start')

    this.unsubscribeCommands = subscribeFileManagerCommand((command) => this.onFileManagerCommand(command))
    writeAndroidUnlockDebug('file-manager-model', 'connect:command listener added')
    this.setupSessionSettingsSync()
    void this.ensureSessionSettingsLoaded()
    this.fileList.connect()
    void this.fileList.ensureVisibleRangeLoaded()
    writeAndroidUnlockDebug('file-manager-model', 'connect:catalog subscription setup')

    this.upload.connect()
  }

  cleanup(): void {
    if (!this.connected) return
    this.connected = false

    this.fileList.cleanup()
    this.upload.cleanup()
    this.unsubscribeCommands?.()
    this.unsubscribeCommands = undefined
    this.unsubscribeSessionSettings?.()
    this.unsubscribeSessionSettings = undefined
  }

  handleNavigate(path: string): void {
    const {store} = this.ctx
    this.deletionMotion.resetForPath(path)
    store.setCurrentPath(path)
    this.fileList.validateCurrentPath()
    void this.fileList.ensureVisibleRangeLoaded()
  }

  handleFiltersChange(filters: SearchFilters): void {
    this.searchFilterActions.setFilters(filters)
  }

  private commitSearchFilters(filters: SearchFilters): void {
    const {store} = this.ctx
    store.setSearchFilters(filters)
    void this.fileList.ensureVisibleRangeLoaded()
  }

  private getDefaultSearchFilters(): SearchFilters {
    return createDefaultFileSearchFilters({
      showHidden: sessionSettingsState().show_hidden_files,
    })
  }

  private setupSessionSettingsSync(): void {
    if (this.unsubscribeSessionSettings) return

    this.unsubscribeSessionSettings = sessionSettingsState.subscribe((settings) => {
      const nextDefault = settings.show_hidden_files
      const previousDefault = this.currentShowHiddenDefault
      this.currentShowHiddenDefault = nextDefault

      const filters = this.searchFilters()
      if (filters.showHidden === nextDefault || filters.showHidden !== previousDefault) {
        return
      }

      this.commitSearchFilters({...filters, showHidden: nextDefault})
    })
  }

  private async ensureSessionSettingsLoaded(): Promise<void> {
    try {
      await loadSessionSettings()
    } catch (error) {
      console.warn('Failed to load session settings for Files', error)
    }
  }

  ensureVisibleRangeLoaded(range: FileListVisibleRange): void {
    void this.fileList.ensureVisibleRangeLoaded(range)
  }

  hasActiveSearchFilters(filters: SearchFilters = this.searchFilters()): boolean {
    return hasNonDefaultFileSearchFilters(filters, this.getDefaultSearchFilters())
  }

  resetSearchFilters(): void {
    this.searchFilterActions.setFilters(this.getDefaultSearchFilters())
  }

  handleSelectionChange(selectedNodeIds: number[]): void {
    const {store} = this.ctx
    store.setSelectedItems(selectedNodeIds)
  }

  saveFileListViewportSnapshot(snapshot: FileListViewportSnapshot): void {
    this.viewport.saveSnapshot(snapshot)
  }

  clearFileListViewportRestore(revision: number): void {
    this.viewport.clearRestore(revision)
  }

  activatePendingDocumentReturnViewport(): void {
    this.viewport.activatePendingDocumentReturn(this.currentPath())
  }

  setSelectionMode(enabled: boolean): void {
    this.ctx.store.setSelectionMode(enabled)
  }

  exitSelectionMode(): void {
    this.setSelectionMode(false)
  }

  handleMobileBack(): boolean {
    if (this.ctx.store.selectionMode()) {
      this.exitSelectionMode()
      return true
    }

    if (this.selectedItems().length === 0) {
      return false
    }

    this.ctx.store.setSelectedItems([])
    return true
  }

  getFileItemById(nodeId: number): FileItemData | null {
    return this.fileList.getFileItemById(nodeId)
  }

  getDisabledMoveTargetPaths(items: FileItemData[]): string[] {
    return this.fileMove.getDisabledTargetPaths(items)
  }

  handleMove(source: FileItemData, target: FileItemData): Promise<void> {
    return this.actions.handleMove(source, target)
  }

  async handleDroppedMove(target: FileItemData, payload: FileDragPayload): Promise<void> {
    if (!target.isDir) return
    await this.fileMove.dropToTarget(target.path || '/', payload)
  }

  async openMoveDialogForItem(item: FileItemData): Promise<boolean> {
    if (!this.fileMove.canOpenMoveDialogForItems([item])) return false

    const targetPath = await openFileMoveDialog({
      itemId: item.id,
      selectedPath: this.fileMove.getItemParentPath(item),
      disabledPaths: this.fileMove.getDisabledTargetPaths([item]),
      useMobilePicker: this.isMobileLayout(),
      onConfirm: (nextTargetPath) => this.fileMove.moveItemById(item.id, nextTargetPath),
    })

    return targetPath !== null
  }

  async openMoveDialogForSelectedItems(): Promise<boolean> {
    const items = this.fileList.getSelectedFileItems()
    if (!this.fileMove.canOpenMoveDialogForItems(items)) return false

    const targetPath = await openFileMoveDialog({
      selectedPath: this.currentPath(),
      disabledPaths: this.fileMove.getDisabledTargetPaths(items),
      useMobilePicker: this.isMobileLayout(),
      onConfirm: (nextTargetPath) =>
        this.fileMove.moveItemsByIds(
          items.map((item) => item.id),
          nextTargetPath,
        ),
    })

    return targetPath !== null
  }

  handleItemOpen(item: FileItemData): Promise<void> {
    return this.actions.handleItemOpen(item)
  }

  handleOpen(item: FileItemData): Promise<void> {
    return this.actions.handleOpen(item)
  }

  handleShare(item: FileItemData): Promise<void> {
    return this.actions.handleShare(item)
  }

  shareFileById(item: {
    fileId: number
    fileName: string
    mimeType?: string
    lastModified?: number
  }): Promise<void> {
    return this.actions.shareFileById(item)
  }

  handleShareSelected(): Promise<void> {
    return this.actions.handleShareSelected()
  }

  handleSaveToGallery(item: FileItemData): Promise<void> {
    return this.actions.handleSaveToGallery(item)
  }

  handleOpenExternal(item: FileItemData): Promise<void> {
    return this.actions.handleOpenExternal(item)
  }

  handleRename(item: FileItemData): Promise<void> {
    return this.actions.handleRename(item)
  }

  renameFileById(input: {
    fileId: number
    fileName: string
    newName: string
    currentPath?: string
  }): Promise<string | null> {
    return this.actions.renameFileById(input)
  }

  handleDownload(item: FileItemData): Promise<void> {
    return this.actions.handleDownload(item)
  }

  handleDelete(item: FileItemData): Promise<void> {
    return this.actions.handleDelete(item)
  }

  handleDownloadSelected(): Promise<void> {
    return this.actions.handleDownloadSelected()
  }

  handleDeleteSelected(): Promise<void> {
    return this.actions.handleDeleteSelected()
  }

  handleCreateDir(): Promise<void> {
    return this.actions.handleCreateDir()
  }

  handleCreateMarkdownNote(): Promise<void> {
    return this.actions.handleCreateMarkdownNote()
  }

  handleFileUpload(files: FileList): Promise<void> {
    return this.upload.handleFileUpload(files)
  }

  handlePathUpload(paths: string[]): Promise<void> {
    return this.upload.handlePathUpload(paths)
  }

  handleNativeUpload(): Promise<void> {
    return this.upload.handleNativeUpload()
  }

  getMobileToolbarActions(): FileManagerMobileToolbarAction[] {
    return this.mobileToolbar.actions()
  }

  executeMobileCommand(actionId: string): boolean {
    return this.mobileToolbar.executeCommand(actionId)
  }

  registerToolbarUploadTrigger(trigger: () => void): () => void {
    return this.upload.registerToolbarUploadTrigger(trigger)
  }

  openDetailsPanel(item: FileItemData): void {
    this.actions.openDetailsPanel(item)
  }

  getActionDescriptors(item: FileItemData): FileManagerActionDescriptor[] {
    return this.actions.getActionsForItem(item)
  }

  executeFileAction(actionId: string, item: FileItemData): boolean {
    return this.actions.executeAction(actionId, item)
  }

  private onFileManagerCommand(command: FileManagerCommand): void {
    if (command.kind === 'create-dir') {
      void this.handleCreateDir()
      return
    }

    if (command.kind === 'create-markdown-note') {
      void this.handleCreateMarkdownNote()
      return
    }

    if (command.kind === 'upload-files') {
      void this.handleFileUpload(command.files)
      return
    }

    if (command.kind === 'upload-paths') {
      void this.handlePathUpload(command.paths)
      return
    }

    if (command.kind === 'native-upload') {
      void this.handleNativeUpload()
    }
  }

  private handleToolbarUpload(): Promise<void> {
    return this.upload.handleToolbarUpload()
  }

  private isMobileLayout(): boolean {
    return (this.ctx.store as {layoutMode?: () => string}).layoutMode?.() === 'mobile'
  }

  isExternalOpenPending(nodeId: number): boolean {
    return this.actions.isExternalOpenPending(nodeId)
  }

  isSharePending(nodeId: number): boolean {
    return this.actions.isSharePending(nodeId)
  }
}

export function getFileManagerModel(ctx: AppContext = getAppContext()): FileManagerModel {
  if (!sharedFileManagerModel || sharedFileManagerCtx !== ctx) {
    sharedFileManagerCtx = ctx
    sharedFileManagerModel = new FileManagerModel(ctx)
  }

  return sharedFileManagerModel
}
