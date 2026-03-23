import {XLitElement} from '@statx/lit'

import {css, html, nothing} from 'lit'

import {isTauriRuntime} from 'root/core/runtime/runtime'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {i18n} from 'root/i18n'
import {navigationModel} from 'root/app/navigation/navigation.model'
import {getAppContext} from 'root/shared/services/app-context'
import {
  hostLayoutPaintContainStyles,
  pageFadeInStyles,
  pageTransitionStyles,
  sharedStyles,
} from 'root/shared/ui/shared-styles'

import {ContextMenu} from './components/context-menu'
import {DashboardDropzone} from './components/dashboard-dropzone'
import {DashboardFileList} from './components/dashboard-file-list'
import {DashboardHeader} from './components/dashboard-header'
import {FileItem, type FileItemData} from './components/file-item'
import {FileItemMobile} from './components/file-item-mobile'
import {FileManagerDesktopLayout} from './components/file-manager-desktop-layout'
import {FileManagerMobileLayout} from './components/file-manager-mobile-layout'
import {FileFilterControlsMobile} from './components/file-filter-controls-mobile'
import {FileSearch} from './components/file-search'
import {UploadProgress} from './components/upload-progress'
import {VirtualFileList} from './components/virtual-file-list'
import {VirtualFileListMobile} from './components/virtual-file-list-mobile'
import {isMobileTouch} from './components/file-item/utils'

import {FileManagerModel} from './file-manager.model'

export const formatFormatSpace = (value: number) => {
  return (value / 1000).toFixed(2)
}

export class FileManager extends XLitElement {
  static define() {
    ContextMenu.define()
    if (isMobileTouch()) {
      FileItemMobile.define()
      VirtualFileListMobile.define()
    } else {
      FileItem.define()
      VirtualFileList.define()
    }
    FileSearch.define()
    FileFilterControlsMobile.define()
    DashboardHeader.define()

    DashboardDropzone.define()
    DashboardFileList.define()
    UploadProgress.define()
    FileManagerMobileLayout.define()
    FileManagerDesktopLayout.define()

    customElements.define('chromvoid-file-manager', this)
  }

  private model?: FileManagerModel
  private ensureModel(): FileManagerModel {
    if (!this.model) {
      this.model = new FileManagerModel(getAppContext())
    }
    return this.model
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
        background: var(--cv-color-hover);
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
    `,
  ]

  connectedCallback(): void {
    super.connectedCallback?.()
    this.ensureModel().connect()
    window.addEventListener('file-action', this.handleGlobalFileAction as EventListener)
  }

  disconnectedCallback(): void {
    super.disconnectedCallback?.()
    this.model?.cleanup()
    window.removeEventListener('file-action', this.handleGlobalFileAction as EventListener)
  }

  private onErrorClose = () => {
    this.ensureModel().clearError()
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
    getAppContext().store.setSelectionMode(enabled)
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

  private onUploadClick = () => {
    void this.handleUploadClick()
  }

  private async handleUploadClick() {
    const {store} = getAppContext()
    const canUseNative =
      isTauriRuntime() &&
      getRuntimeCapabilities().supports_native_path_io &&
      store.remoteSessionState() === 'inactive'

    if (canUseNative) {
      try {
        const {open} = await import('@tauri-apps/plugin-dialog')
        const selected = await open({multiple: true, directory: false})
        const paths = Array.isArray(selected) ? selected : selected ? [selected] : []
        if (paths.length > 0) {
          void this.ensureModel().handlePathUpload(paths)
        }
        return
      } catch {
        // fall through to file input
      }
    }

    const input = this.renderRoot.querySelector<HTMLInputElement>('#action-bar-file-input')
    input?.click()
  }

  private onActionBarFileChange = (e: Event) => {
    const files = (e.target as HTMLInputElement).files
    if (files && files.length > 0) {
      void this.ensureModel().handleFileUpload(files)
    }
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
    }

    try {
      switch (detail.action) {
        case 'open':
          if (detail.item) {
            void model.handleOpen(detail.item)
          }
          break
        case 'context-menu':
          if (detail.item && detail.event instanceof MouseEvent) {
            this.showContextMenu(detail.item, detail.event)
          }
          break
        case 'rename':
          if (detail.item) void model.handleRename(detail.item)
          break
        case 'download':
          if (detail.item) void model.handleDownload(detail.item)
          break
        case 'open-external':
          if (detail.item) void model.handleOpenExternal(detail.item)
          break
        case 'delete':
          if (detail.item) void model.handleDelete(detail.item)
          break
        case 'download-selected':
          void model.handleDownloadSelected()
          break
        case 'delete-selected':
          void model.handleDeleteSelected()
          break
        case 'move':
          if (detail.source && detail.target) {
            void model.handleMove(detail.source, detail.target)
          }
          break
        case 'share':
          if (detail.item) void model.handleShare(detail.item)
          break
        case 'info':
          if (detail.item) model.openDetailsPanel(detail.item)
          break
      }
    } catch (error) {
      getAppContext().store.pushNotification(
        'error',
        `Ошибка: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  private handleGlobalFileAction = (e: Event) => {
    const detail = (e as CustomEvent).detail as {action?: string; fileId?: number} | undefined
    if (!detail?.action || typeof detail.fileId !== 'number') return
    const model = this.ensureModel()
    const item = model.getFileItemById(detail.fileId)
    if (!item) return
    this.handleItemAction(
      new CustomEvent('item-action', {
        detail: {action: detail.action, item},
      }),
    )
  }

  getMobileToolbarActions() {
    return [
      {id: 'create-dir', icon: 'folder-plus', label: i18n('file-manager:create-folder' as any)},
      {id: 'upload', icon: 'upload', label: i18n('file-manager:upload-files' as any)},
    ]
  }

  executeMobileCommand(actionId: string): boolean {
    switch (actionId) {
      case 'create-dir':
        this.handleCreateDir()
        return true
      case 'upload':
        this.onUploadClick()
        return true
      default:
        return false
    }
  }

  private showContextMenu(item: FileItemData, event: MouseEvent) {
    const menu = this.renderRoot.querySelector<ContextMenu>('context-menu')
    menu?.show(event.clientX, event.clientY, this.ensureModel().getContextMenuItems(item))
  }

  private renderSlottedContent(isMobileLayout: boolean) {
    const {state, store} = getAppContext()
    const stateData = state.data()
    if (!stateData) return nothing

    const model = this.ensureModel()

    const fileItems = model.fileItems()
    const filteredCount = model.filteredCount()

    return html`
      ${model.error()
        ? html`
            <div class="error-banner">
              <span>${model.error()}</span>
              <button @click=${this.onErrorClose}>${i18n('button:close' as any)}</button>
            </div>
          `
        : ''}

      <dashboard-header
        slot="header"
        .currentPath=${model.currentPath()}
        .filters=${model.searchFilters()}
        .totalFiles=${fileItems.length}
        .filteredFiles=${filteredCount}
        .selectedCount=${model.selectedCount()}
        @navigate=${this.handleNavigate}
        @filters-change=${this.handleFiltersChange}
        @create-dir=${this.handleCreateDir}
        @upload-requested=${this.onUploadRequested}
        @upload-paths-requested=${this.onUploadPathsRequested}
        @delete-selected=${this.handleDeleteSelected}
        @clear-selection=${this.handleClearSelection}
        @selection-mode-requested=${this.handleSelectionModeRequested}
      ></dashboard-header>

      <dashboard-dropzone
        slot="dropzone"
        .active=${!isMobileLayout && model.isDragActive()}
        .loading=${model.isLoading()}
      >
        <div style="flex:1; min-height:0; display:flex;">
          <dashboard-file-list
            style="flex:1; min-height:0;"
            .items=${fileItems}
            .filters=${model.searchFilters()}
            .selectedItems=${model.selectedItems()}
            .selectionMode=${store.selectionMode()}
            .containerHeight=${this.getLayoutContainerHeight()}
            .currentPath=${model.currentPath()}
            .mobile=${isMobileLayout}
            @selection-change=${this.handleSelectionChange}
            @selection-mode-requested=${this.handleSelectionModeRequested}
            @item-action=${this.handleItemAction}
            @filters-change=${this.handleFiltersChange}
            @navigate=${this.handleNavigate}
          ></dashboard-file-list>
        </div>
      </dashboard-dropzone>

      <context-menu slot="context-menu"></context-menu>
      <upload-progress slot="upload-progress"></upload-progress>
      ${isMobileLayout ? html`<input id="action-bar-file-input" type="file" multiple @change=${this.onActionBarFileChange} />` : nothing}
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
