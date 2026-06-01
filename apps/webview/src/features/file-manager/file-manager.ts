import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {css, nothing} from 'lit'

import {navigationModel} from 'root/app/navigation/navigation.model'
import type {
  FileListVisibleRange,
  FileListViewportSnapshot,
} from 'root/shared/contracts/file-manager'
import {getAppContext} from 'root/shared/services/app-context'
import {subscribeFileCommand, type FileCommand} from 'root/shared/services/file-command-service'
import {writeAndroidUnlockDebug} from 'root/shared/services/android-unlock-debug'
import {
  beginMobileFilePickerSession,
  type MobileFilePickerSession,
} from 'root/shared/services/mobile-file-picker-session'
import {
  hostLayoutPaintContainStyles,
  pageFadeInStyles,
  pageTransitionStyles,
  sharedStyles,
} from 'root/shared/ui/shared-styles'

import {ContextMenu, type ContextMenuItem} from './components/context-menu'
import {DashboardDropzone} from './components/dashboard-dropzone'
import {DashboardFileList} from './components/dashboard-file-list'
import {DashboardHeader} from './components/dashboard-header'
import {FileItem, type FileItemData} from './components/file-item'
import {FileItemMobile} from './components/file-item-mobile'
import {FileManagerDesktopLayout} from './components/file-manager-desktop-layout'
import {FileManagerMobileLayout} from './components/file-manager-mobile-layout'
import {FileFilterControlsMobile} from './components/file-filter-controls-mobile'
import {FileSearch} from './components/file-search'
import {FileMove, FileMoveMobile, FileMoveSheet} from './components/file-move'
import {UploadProgress} from './components/upload-progress'
import {VirtualFileList} from './components/virtual-file-list'
import {VirtualFileListMobile} from './components/virtual-file-list-mobile'
import {isMobileTouch} from './components/file-item/utils'

import {type FileManagerModel, getFileManagerModel} from './file-manager.model'
import type {FileDragPayload} from './models/file-move.model'

export const formatFormatSpace = (value: number) => {
  return (value / 1000).toFixed(2)
}

export class FileManager extends ReatomLitElement {
  static define() {
    ContextMenu.define()
    FileItem.define()
    FileItemMobile.define()
    if (isMobileTouch()) {
      VirtualFileListMobile.define()
    } else {
      VirtualFileList.define()
    }
    FileSearch.define()
    FileMove.define()
    FileMoveMobile.define()
    FileMoveSheet.define()
    FileFilterControlsMobile.define()
    DashboardHeader.define()

    DashboardDropzone.define()
    DashboardFileList.define()
    UploadProgress.define()
    FileManagerMobileLayout.define()
    FileManagerDesktopLayout.define()

    if (!customElements.get('chromvoid-file-manager')) {
      customElements.define('chromvoid-file-manager', this)
    }
  }

  private unregisterToolbarUploadTrigger?: () => void
  private unregisterBackHandler?: () => void
  private unsubscribeFileCommand?: () => void
  private filePickerSession: MobileFilePickerSession | null = null

  private ensureModel(): FileManagerModel {
    return getFileManagerModel(getAppContext())
  }

  focusDashboardCreateDirActionTarget(): boolean {
    const header = this.renderRoot.querySelector<DashboardHeader>('dashboard-header')
    return header?.focusCreateDirActionTarget() ?? false
  }

  static styles = [
    sharedStyles,
    pageTransitionStyles,
    pageFadeInStyles,
    hostLayoutPaintContainStyles,
    css`
      :host {
        height: 100%;
        min-height: 100%;
      }

      password-manager {
        display: block;
        height: 100%;
        width: 100%;
        min-height: 0;
      }

      file-manager-mobile-layout,
      file-manager-desktop-layout {
        height: 100%;
      }

      #file-input,
      #action-bar-file-input {
        display: none;
      }

      .dropzone-content {
        display: flex;
        flex: 1;
        min-height: 0;
      }

      .dropzone-file-list {
        flex: 1;
        min-height: 0;
      }
    `,
  ]

  connectedCallback(): void {
    super.connectedCallback()
    writeAndroidUnlockDebug('file-manager', 'connectedCallback:start')
    const model = this.ensureModel()
    model.connect()
    model.activatePendingDocumentReturnViewport()
    this.unregisterBackHandler = navigationModel.registerSurfaceBackHandler('files', this.handleSurfaceBack)
    this.unregisterToolbarUploadTrigger = model.registerToolbarUploadTrigger(() => {
      this.openActionBarFileInput()
    })
    writeAndroidUnlockDebug('file-manager', 'connectedCallback:model connected')
    this.unsubscribeFileCommand = subscribeFileCommand(this.handleFileCommand)
    writeAndroidUnlockDebug('file-manager', 'connectedCallback:listener added')
    void this.updateComplete.then(() => {
      writeAndroidUnlockDebug('file-manager', 'connectedCallback:updateComplete')
    })
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    writeAndroidUnlockDebug('file-manager', 'disconnectedCallback:start')
    this.unregisterBackHandler?.()
    this.unregisterBackHandler = undefined
    this.unregisterToolbarUploadTrigger?.()
    this.unregisterToolbarUploadTrigger = undefined
    this.endFilePickerSession()
    this.unsubscribeFileCommand?.()
    this.unsubscribeFileCommand = undefined
    this.ensureModel().cleanup()
    writeAndroidUnlockDebug('file-manager', 'disconnectedCallback:done')
  }

  private handleNavigate = (e: CustomEvent) => {
    this.ensureModel().handleNavigate(e.detail.path)
  }

  private handleFiltersChange = (e: CustomEvent) => {
    this.ensureModel().handleFiltersChange(e.detail)
  }

  private handleSelectionChange = (e: CustomEvent) => {
    this.ensureModel().handleSelectionChange(e.detail.selectedItems)
  }

  private handleSelectionModeRequested = (e: CustomEvent) => {
    const enabled = Boolean(e.detail?.enabled)
    this.ensureModel().setSelectionMode(enabled)
  }

  private handleViewportStateChange(e: CustomEvent<FileListViewportSnapshot>) {
    this.ensureModel().saveFileListViewportSnapshot(e.detail)
  }

  private handleViewportStateRestored(e: CustomEvent<{revision?: number}>) {
    const revision = Number(e.detail?.revision)
    if (Number.isFinite(revision)) {
      this.ensureModel().clearFileListViewportRestore(revision)
    }
  }

  private handleVisibleRangeChange(e: CustomEvent<FileListVisibleRange>) {
    this.ensureModel().ensureVisibleRangeLoaded(e.detail)
  }

  private handleSurfaceBack = () => {
    if (navigationModel.resolvedOverlay().kind !== 'closed') {
      return false
    }

    return this.ensureModel().handleMobileBack()
  }

  private handleCreateDir = () => {
    void this.ensureModel().handleCreateDir()
  }

  private onUploadRequested = (e: CustomEvent) => {
    const files: FileList | undefined = e.detail?.files
    if (files && files.length > 0) {
      void this.ensureModel().handleFileUpload(files)
    }
  }

  private onUploadPathsRequested = (e: CustomEvent) => {
    const paths: string[] | undefined = e.detail?.paths
    if (Array.isArray(paths) && paths.length > 0) {
      void this.ensureModel().handlePathUpload(paths)
    }
  }

  private onNativeUploadRequested = () => {
    void this.ensureModel().handleNativeUpload()
  }

  private onActionBarFileChange = (e: Event) => {
    this.endFilePickerSession()
    const files = (e.target as HTMLInputElement).files
    if (files && files.length > 0) {
      void this.ensureModel().handleFileUpload(files)
    }
  }

  private openActionBarFileInput() {
    const input = this.renderRoot.querySelector<HTMLInputElement>('#action-bar-file-input')
    if (!input) return

    this.beginFilePickerSession()
    try {
      input.click()
    } catch {
      this.endFilePickerSession()
    }
  }

  private beginFilePickerSession() {
    this.endFilePickerSession()
    this.filePickerSession = beginMobileFilePickerSession()
  }

  private endFilePickerSession() {
    this.filePickerSession?.end()
    this.filePickerSession = null
  }

  private handleDeleteSelected = () => {
    void this.ensureModel().handleDeleteSelected()
  }

  private handleClearSelection = () => {
    getAppContext().store.setSelectedItems([])
  }

  private handleItemAction = (e: CustomEvent) => {
    const model = this.ensureModel()
    const detail = e.detail as {
      action?: string
      item?: FileItemData
      event?: Event
      source?: FileItemData
      target?: FileItemData
      payload?: FileDragPayload
    }

    try {
      switch (detail.action) {
        case 'context-menu':
          if (detail.item && detail.event instanceof MouseEvent) {
            this.showContextMenu(detail.item, detail.event)
          }
          break
        case 'open':
        case 'rename':
        case 'download':
        case 'open-external':
        case 'delete':
        case 'share':
        case 'save-to-gallery':
        case 'info':
          if (detail.item) model.executeFileAction(detail.action, detail.item)
          break
        case 'download-selected':
          void model.handleDownloadSelected()
          break
        case 'delete-selected':
          void model.handleDeleteSelected()
          break
        case 'move':
          if (detail.item) {
            model.executeFileAction(detail.action, detail.item)
          } else if (detail.target && detail.payload) {
            void model.handleDroppedMove(detail.target, detail.payload)
          } else if (detail.source && detail.target) {
            void model.handleMove(detail.source, detail.target)
          }
          break
      }
    } catch (error) {
      getAppContext().store.pushNotification(
        'error',
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  private handleFileCommand = (command: FileCommand) => {
    if (command.kind !== 'action') return
    const model = this.ensureModel()
    const item = model.getFileItemById(command.fileId)
    if (!item) return
    this.handleItemAction(
      new CustomEvent('item-action', {
        detail: {action: command.action, item},
      }),
    )
  }

  handleGlobalFileAction(event: CustomEvent<{action?: string; fileId?: number}>) {
    const action = event.detail?.action
    const fileId = event.detail?.fileId
    if (typeof action !== 'string' || typeof fileId !== 'number') {
      return
    }

    this.handleFileCommand({kind: 'action', action, fileId})
  }

  private showContextMenu(item: FileItemData, event: MouseEvent) {
    const menu = this.renderRoot.querySelector<ContextMenu>('context-menu')
    const model = this.ensureModel()
    const items: ContextMenuItem[] = []

    for (const descriptor of model.getActionDescriptors(item)) {
      if (descriptor.separatorBefore) {
        items.push({
          id: `separator-${descriptor.id}`,
          label: '',
          icon: '',
          action: () => {},
          separator: true,
        })
      }

      items.push({
        id: descriptor.id,
        label: descriptor.label,
        icon: descriptor.icon,
        disabled: descriptor.disabled,
        shortcutId: descriptor.shortcutId,
        action: () => {
          model.executeFileAction(descriptor.id, item)
        },
      })
    }

    menu?.show(event.clientX, event.clientY, items)
  }

  private renderSlottedContent(isMobileLayout: boolean) {
    const {state, store} = getAppContext()
    const stateData = state.data()
    if (!stateData) return nothing

    const model = this.ensureModel()

    const renderItems = model.renderItems()
    const filteredCount = model.filteredCount()

    return html`
      <dashboard-header
        slot="header"
        .currentPath=${model.currentPath()}
        .filters=${model.searchFilters()}
        .filterActions=${model.searchFilterActions}
        .totalFiles=${model.totalCount()}
        .filteredFiles=${filteredCount}
        .selectedCount=${model.selectedCount()}
        @navigate=${this.handleNavigate}
        @filters-change=${this.handleFiltersChange}
        @create-dir=${this.handleCreateDir}
        @upload-requested=${this.onUploadRequested}
        @upload-paths-requested=${this.onUploadPathsRequested}
        @native-upload-requested=${this.onNativeUploadRequested}
        @delete-selected=${this.handleDeleteSelected}
        @clear-selection=${this.handleClearSelection}
        @selection-mode-requested=${this.handleSelectionModeRequested}
      ></dashboard-header>

      <dashboard-dropzone
        slot="dropzone"
        .active=${!isMobileLayout && model.isDragActive()}
        .loading=${model.isLoading()}
      >
        <div class="dropzone-content">
          <dashboard-file-list
            class="dropzone-file-list"
            .items=${renderItems}
            .filters=${model.searchFilters()}
            .filterActions=${model.searchFilterActions}
            .selectedItems=${model.selectedItems()}
            .selectionMode=${store.selectionMode()}
            .pendingExternalOpenIds=${model.externalOpenPendingIds()}
            .containerHeight=${this.getLayoutContainerHeight()}
            .currentPath=${model.currentPath()}
            .mobile=${isMobileLayout}
            .restoreViewport=${model.fileListViewportRestore()}
            .itemsPreFiltered=${true}
            .deletionMotion=${model.deletionMotion}
            @selection-change=${this.handleSelectionChange}
            @selection-mode-requested=${this.handleSelectionModeRequested}
            @item-action=${this.handleItemAction}
            @filters-change=${this.handleFiltersChange}
            @navigate=${this.handleNavigate}
            @viewport-state-change=${this.handleViewportStateChange}
            @viewport-state-restored=${this.handleViewportStateRestored}
            @visible-range-change=${this.handleVisibleRangeChange}
          ></dashboard-file-list>
        </div>
      </dashboard-dropzone>

      <context-menu slot="context-menu"></context-menu>
      <upload-progress slot="upload-progress"></upload-progress>
      ${isMobileLayout
        ? html`<input
            id="action-bar-file-input"
            type="file"
            multiple
            @change=${this.onActionBarFileChange}
          />`
        : nothing}
    `
  }

  private getLayoutContainerHeight(): number {
    const layout = this.renderRoot?.querySelector('file-manager-desktop-layout, file-manager-mobile-layout')
    if (layout?.shadowRoot) {
      const catalogContent = layout.shadowRoot.querySelector('.catalog-content')
      if (catalogContent) return catalogContent.clientHeight
    }
    return 0
  }

  render() {
    const {state, store} = getAppContext()
    const stateData = state.data()
    if (!stateData) return nothing

    const isShowPM = navigationModel.currentSurface() === 'passwords'
    const layoutMode = store.layoutMode()

    const isMobileLayout = layoutMode === 'mobile'
    const content = this.renderSlottedContent(isMobileLayout)

    if (isMobileLayout) {
      return html`
        <file-manager-mobile-layout ?data-pm-open=${isShowPM}> ${content} </file-manager-mobile-layout>
      `
    }

    return html`
      <file-manager-desktop-layout ?data-pm-open=${isShowPM}> ${content} </file-manager-desktop-layout>
    `
  }
}

FileManager.define()
