import {XLitElement} from '@statx/lit'
import {html, nothing} from 'lit'

import {i18n} from 'root/i18n'
import type {FileItemData, FileListItem, SearchFilters} from 'root/shared/contracts/file-manager'
import {type SortOption} from 'root/shared/contracts/file-manager'

import type {FileItem} from './file-item'
import {virtualFileListStyles} from './virtual-file-list/virtual-file-list.styles'
import {renderGridView} from './virtual-file-list/render-grid'
import {renderFileItem, renderListView} from './virtual-file-list/render-list'
import {renderTableView} from './virtual-file-list/render-table'
import {
  getLastSegment,
  getParentPath,
  normalizePath,
} from './virtual-file-list/virtual-file-list.model-helpers'
import {VirtualFileListModel} from '../models/virtual-file-list.model'
import {VirtualFileListHandlers} from './virtual-file-list/handlers'

export type {FileListItem} from 'root/shared/contracts/file-manager'

export class VirtualFileListBase extends XLitElement {
  static get properties() {
    return {
      items: {type: Array},
      filters: {type: Object},
      itemHeight: {type: Number, attribute: 'item-height'},
      containerHeight: {type: Number, attribute: 'container-height'},
      selectedItems: {type: Array, attribute: 'selected-items'},
      selectionMode: {type: Boolean, attribute: 'selection-mode'},
      currentPath: {type: String, attribute: 'current-path'},
      mobile: {type: Boolean},
    }
  }

  declare items: FileListItem[]
  declare filters: SearchFilters
  declare itemHeight: number
  declare containerHeight: number
  declare selectedItems: number[]
  declare selectionMode: boolean
  declare currentPath: string
  declare mobile: boolean

  constructor() {
    super()
    this.items = []
    this.filters = {
      query: '',
      sortBy: 'name',
      sortDirection: 'asc',
      viewMode: 'list',
      showHidden: true,
      fileTypes: [],
    }
    this.itemHeight = 80
    this.containerHeight = 400
    this.selectedItems = []
    this.selectionMode = false
    this.currentPath = '/'
    this.mobile = false
  }

  protected readonly model = new VirtualFileListModel()
  protected readonly handlers = new VirtualFileListHandlers({
    getItems: () => this.getFilteredItems(),
    getFilters: () => this.filters,
    getSelectedItems: () => this.selectedItems,
    isSelectionMode: () => this.selectionMode,
    emitSelectionModeRequested: (enabled: boolean) => this.dispatchSelectionModeRequested(enabled),
    emitSelectionChange: (selectedItems: number[]) => this.dispatchSelectionChange(selectedItems),
    emitItemAction: (
      action: string,
      item: FileListItem | undefined,
      event: Event | undefined,
      source: FileListItem | undefined,
      target: FileListItem | undefined,
    ) => this.dispatchItemAction(action, item, event, source, target),
    emitFiltersChange: (next: SearchFilters) => this.dispatchFiltersChange(next),
    emitNavigate: (path: string) => this.dispatchNavigate(path),
    getActiveItemId: () => this.model.activeItemId(),
    setActiveItemId: (id: number | null) => this.setActiveItemId(id),
    focusItemById: (id: number) => this.focusItemById(id),
    focusContainer: () => this.focusContainer(),
    getItemClientRect: (id: number) => this.getItemClientRect(id),
    ensureIndexVisible: (index: number) => this.ensureIndexVisible(index),
    getViewMode: () => this.filters.viewMode,
    getItemHeight: () => this.itemHeight,
    getViewportHeight: () => this.model.viewportHeight(),
    getGridColumnsCount: () => this.getGridColumnsCount(),
    getCurrentPath: () => this.currentPath,
    normalizePath: (path: string) => normalizePath(path),
    getParentPath: (path: string) => getParentPath(path),
    getLastSegment: (path: string) => getLastSegment(path),
    afterUpdate: (callback: () => void) => {
      void this.updateComplete.then(() => callback())
    },
  })

  static styles = virtualFileListStyles

  private resizeDebounceTimer: number | null = null
  private listContainer?: HTMLElement
  private rafPending = false
  private pendingScrollTop = 0
  private listResizeObserver: ResizeObserver | null = null

  override connectedCallback() {
    super.connectedCallback()
    if (window.matchMedia?.('(hover: none) and (pointer: coarse)')?.matches) {
      this.itemHeight = 64
    }
    this.updateViewportHeight()
    void this.updateComplete.then(() => this.updateViewportHeight())
    window.addEventListener('resize', this.onWindowResize)
    this.addEventListener('swipe-open', this.onSwipeOpen)
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    window.removeEventListener('resize', this.onWindowResize)
    this.removeEventListener('swipe-open', this.onSwipeOpen)
    this.handlers.dispose()
    if (this.resizeDebounceTimer) {
      clearTimeout(this.resizeDebounceTimer)
      this.resizeDebounceTimer = null
    }
    if (this.listResizeObserver) {
      try {
        this.listResizeObserver.disconnect()
      } catch {
        // ignore
      }
      this.listResizeObserver = null
    }
    if (this.listContainer) {
      this.listContainer.removeEventListener('scroll', this.onScroll)
    }
  }

  private onWindowResize = () => {
    if (this.resizeDebounceTimer) {
      clearTimeout(this.resizeDebounceTimer)
    }
    this.resizeDebounceTimer = window.setTimeout(() => {
      this.updateViewportHeight()
    }, 100)
  }

  private updateViewportHeight() {
    if (!this.listContainer) {
      this.listContainer = this.renderRoot.querySelector('.list-container') as HTMLElement | undefined
      if (this.listContainer) {
        this.listContainer.addEventListener('scroll', this.onScroll, {passive: true})
      }
    }
    if (!this.listContainer) return

    if (!this.listResizeObserver && typeof ResizeObserver !== 'undefined') {
      this.listResizeObserver = new ResizeObserver(() => this.updateViewportHeight())
      try {
        this.listResizeObserver.observe(this.listContainer)
      } catch {
        // ignore observe failures
      }
    }

    const newHeight = this.listContainer.clientHeight
    this.model.setViewportHeight(newHeight)
  }

  private onScroll = (event: Event) => {
    const target = event.target as HTMLElement
    this.pendingScrollTop = target.scrollTop
    if (this.rafPending) return
    this.rafPending = true
    requestAnimationFrame(() => {
      this.model.setVirtualScrollTop(this.pendingScrollTop)
      this.maybeUpdateActiveFromScroll(this.pendingScrollTop)
      this.rafPending = false
    })
  }

  private maybeUpdateActiveFromScroll(scrollTop: number) {
    if (this.filters.viewMode !== 'list' && this.filters.viewMode !== 'table') return

    const rootActive = (this.renderRoot as ShadowRoot | null)?.activeElement
    if (rootActive instanceof HTMLElement) {
      const focusedInside =
        rootActive.classList.contains('list-container') || rootActive.closest?.('.file-item-wrapper') != null
      if (!focusedInside) return
    } else {
      return
    }

    const filtered = this.getFilteredItems()
    if (filtered.length === 0) return

    const startIndex = Math.floor(scrollTop / this.itemHeight)
    const endIndex = Math.min(
      filtered.length,
      startIndex + Math.ceil(this.model.viewportHeight() / this.itemHeight) + 2,
    )
    const activeId = this.model.activeItemId()

    if (activeId == null) return
    const activeIndex = filtered.findIndex((i) => i.id === activeId)
    if (activeIndex === -1) return
    if (activeIndex < startIndex || activeIndex >= endIndex) {
      const fallback = filtered[startIndex]?.id
      if (fallback != null) {
        this.setActiveItemId(fallback)
      }
    }
  }

  protected getFilteredItems() {
    return this.model.getFilteredItems(this.items, this.filters)
  }

  private getVisibleItems() {
    return this.model.getVisibleItems(
      this.getFilteredItems(),
      this.filters.viewMode,
      this.itemHeight,
      this.model.virtualScrollTop(),
      this.model.viewportHeight(),
    )
  }

  private setActiveItemId(id: number | null) {
    this.model.setActiveItemId(id)
  }

  protected renderStatusBarRight(): unknown {
    return nothing
  }

  render() {
    const filteredItems = this.getFilteredItems()
    const visibleItems = this.getVisibleItems()
    const hasActiveFilters = this.hasActiveFilters()
    const containerRole = this.filters.viewMode === 'table' ? 'grid' : 'listbox'
    const activeItemId = this.model.activeItemId() ?? filteredItems[0]?.id ?? null

    const fileItemCallbacks = {
      onFileItemClick: this.handlers.onFileItemClick,
      onFileItemDoubleClick: this.handlers.onFileItemDoubleClick,
      onFileItemContextMenu: this.handlers.onFileItemContextMenu,
      onFileItemRename: this.handlers.onFileItemRename,
      onFileItemDownload: this.handlers.onFileItemDownload,
      onFileItemDelete: this.handlers.onFileItemDelete,
      onFileItemInfo: this.handlers.onFileItemInfo,
      onFileItemDrop: () => {},
      onTouchStart: this.handlers.onTouchStart,
      onTouchMove: this.handlers.onTouchMove,
      onTouchEnd: this.handlers.onTouchEnd,
      onTouchCancel: this.handlers.onTouchEnd,
      onDragStart: (_event: DragEvent) => {},
      onDragOver: (_event: DragEvent) => {},
      onDragLeave: (_event: DragEvent) => {},
      onDrop: (_event: DragEvent) => {},
    }

    return html`
      <div
        class="list-container"
        tabindex=${containerRole === 'listbox' ? '0' : '-1'}
        @pointerdown=${this.handlers.onPointerDown}
        @pointermove=${this.handlers.onPointerMove}
        @pointerup=${this.handlers.onPointerUp}
        @pointercancel=${this.handlers.onPointerCancel}
        @keydown=${this.handlers.onContainerKeyDown}
        @click=${this.handlers.onContainerBackgroundClick}
        @item-drop=${this.handlers.onItemDrop}
        role=${containerRole}
        aria-multiselectable="true"
        aria-activedescendant=${containerRole === 'listbox' && activeItemId != null
          ? `file-option-${activeItemId}`
          : nothing}
        aria-label=${i18n('file-manager:files' as any)}
      >
        ${filteredItems.length === 0
          ? html`
              <div class="empty-state">
                <cv-icon name="folder-x"></cv-icon>
                <h3>
                  ${hasActiveFilters
                    ? i18n('file-manager:no-files-found' as any)
                    : i18n('file-manager:folder-empty' as any)}
                </h3>
                ${hasActiveFilters
                  ? html`
                      <p>${i18n('file-manager:change-search-or-filters' as any)}</p>
                      <cv-button variant="ghost" size="medium" @click=${this.onClearFiltersClick}
                        >${i18n('file-manager:clear-filters' as any)}</cv-button
                      >
                    `
                  : nothing}
              </div>
            `
          : html`
              ${this.filters.viewMode === 'list'
                ? renderListView({
                    items: visibleItems,
                    itemHeight: this.itemHeight,
                    virtualScrollTop: this.model.virtualScrollTop(),
                    selectedItems: this.selectedItems,
                    activeItemId,
                    selectionMode: this.selectionMode,
                    viewMode: this.filters.viewMode,
                    callbacks: fileItemCallbacks,
                  })
                : ''}
              ${this.filters.viewMode === 'grid'
                ? renderGridView(visibleItems, (item) =>
                    renderFileItem({
                      item,
                      selected: this.selectedItems.includes(item.id),
                      active: activeItemId === item.id,
                      selectionMode: this.selectionMode,
                      viewMode: this.filters.viewMode,
                      callbacks: fileItemCallbacks,
                    }),
                  )
                : ''}
              ${this.filters.viewMode === 'table'
                ? renderTableView({
                    items: visibleItems,
                    filteredItems: this.getFilteredItems(),
                    itemHeight: this.itemHeight,
                    virtualScrollTop: this.model.virtualScrollTop(),
                    viewportHeight: this.model.viewportHeight(),
                    sortBy: this.filters.sortBy === 'type' ? 'name' : this.filters.sortBy,
                    sortDirection: this.filters.sortDirection,
                    selectedItems: this.selectedItems,
                    selectionMode: this.selectionMode,
                    onSortName: this.handlers.onSortName,
                    onSortSize: this.handlers.onSortSize,
                    onSortDate: this.handlers.onSortDate,
                    onRowClick: this.handlers.onTableRowClick,
                    onRowDblClick: this.handlers.onTableRowDblClick,
                    onRowContextMenu: this.handlers.onTableRowContextMenu,
                    onCheckboxClick: this.handlers.onTableCheckboxClick,
                    onMoreButtonClick: this.handlers.onMoreButtonClick,
                    getAriaSort: this.getAriaSort,
                  })
                : ''}
            `}
      </div>
      <div class="status-bar">
        <div class="status-left">
          <span
            >${i18n('file-manager:items-count' as any, {
              count: String(this.getFilteredItems().length),
            })}</span
          >
          <span class="status-sep">|</span>
          <span>${this.getSelectionStatusText()}</span>
        </div>
        ${this.renderStatusBarRight()}
      </div>
    `
  }

  private hasActiveFilters(): boolean {
    if (this.filters.query.trim() !== '' || this.filters.fileTypes.length > 0 || !this.filters.showHidden) {
      return true
    }
    return false
  }

  override updated(changed: Map<string, unknown>) {
    super.updated(changed)
    if (changed.has('items') || changed.has('filters') || changed.has('currentPath')) {
      const filtered = this.getFilteredItems()
      const active = this.model.activeItemId()
      if (filtered.length === 0) {
        if (active != null) this.setActiveItemId(null)
      } else if (active == null || !filtered.some((item) => item.id === active)) {
        this.setActiveItemId(filtered[0]?.id ?? null)
      }
    }

    if (!changed.has('currentPath')) return
    const prevRaw = changed.get('currentPath') as string | undefined
    const prev = prevRaw ? normalizePath(prevRaw) : undefined
    const current = normalizePath(this.currentPath)
    this.focusContainer()

    const filtered = this.getFilteredItems()
    if (filtered.length === 0) return

    if (prev) {
      const parentOfPrev = getParentPath(prev)
      if (current === parentOfPrev) {
        const childName = getLastSegment(prev)
        let targetIndex = filtered.findIndex((i) => normalizePath(i.path) === prev)
        if (targetIndex < 0) {
          targetIndex = filtered.findIndex((i) => i.isDir && i.name === childName)
        }
        if (targetIndex < 0) targetIndex = 0
        const targetId = filtered[targetIndex]?.id
        if (targetId == null) return
        this.handlers.setSelectionAnchor(null)
        this.dispatchSelectionChange([])
        this.ensureIndexVisible(targetIndex)
        this.focusItemById(targetId)
        return
      }
    }

    const firstId = filtered[0]?.id
    if (firstId == null) return
    this.handlers.setSelectionAnchor(null)
    this.dispatchSelectionChange([])
    this.ensureIndexVisible(0)
    this.focusItemById(firstId)
  }

  private onSwipeOpen = (event: Event) => {
    const path = event.composedPath()
    const source = path.find((el) => el instanceof HTMLElement && el.tagName === 'FILE-ITEM') as
      | FileItem
      | undefined
    const items = this.renderRoot.querySelectorAll<FileItem>('file-item')
    for (const item of items) {
      if (item !== source && typeof item.closeSwipe === 'function') {
        item.closeSwipe()
      }
    }
  }

  private onClearFiltersClick = () => {
    this.dispatchEvent(new CustomEvent('clear-filters', {bubbles: true}))
  }

  protected dispatchSelectionChange(selectedItems: number[]) {
    this.dispatchEvent(new CustomEvent('selection-change', {detail: {selectedItems}, bubbles: true}))
  }

  private dispatchSelectionModeRequested(enabled: boolean) {
    this.dispatchEvent(new CustomEvent('selection-mode-requested', {detail: {enabled}, bubbles: true}))
  }

  private dispatchItemAction(
    action: string,
    item?: FileItemData,
    event?: Event,
    source?: FileItemData,
    target?: FileItemData,
  ) {
    this.dispatchEvent(
      new CustomEvent('item-action', {
        detail: {action, item, event, source, target},
        bubbles: true,
      }),
    )
  }

  protected dispatchFiltersChange(next: SearchFilters) {
    this.dispatchEvent(new CustomEvent('filters-change', {detail: next, bubbles: true}))
  }

  private dispatchNavigate(path: string) {
    this.dispatchEvent(new CustomEvent('navigate', {detail: {path}, bubbles: true}))
  }

  private focusItemById(id: number) {
    const filtered = this.getFilteredItems()
    const idx = filtered.findIndex((item) => item.id === id)
    if (idx >= 0) {
      this.ensureIndexVisible(idx)
    }

    this.setActiveItemId(id)
    requestAnimationFrame(() => {
      if (this.filters.viewMode === 'table') {
        const row = this.renderRoot.querySelector<HTMLElement>(`.file-item-wrapper[data-id="${id}"]`)
        row?.focus()
        return
      }
      const container = this.renderRoot.querySelector<HTMLElement>('.list-container')
      container?.focus()
    })
  }

  private ensureIndexVisible(index: number) {
    if (this.filters.viewMode === 'grid') {
      const filtered = this.getFilteredItems()
      const id = filtered[index]?.id
      if (id == null) return
      const row = this.renderRoot.querySelector<HTMLElement>(`file-item[data-id="${id}"]`)
      row?.scrollIntoView?.({block: 'nearest', inline: 'nearest'})
      return
    }

    this.updateViewportHeight()
    if (!this.listContainer) return
    const prevScrollTop = this.listContainer.scrollTop
    const rowTop = index * this.itemHeight
    const rowBottom = rowTop + this.itemHeight
    const viewTop = this.listContainer.scrollTop
    const viewBottom = viewTop + this.model.viewportHeight()
    if (rowTop < viewTop) {
      this.listContainer.scrollTop = rowTop
    } else if (rowBottom > viewBottom) {
      this.listContainer.scrollTop = rowBottom - this.model.viewportHeight()
    }

    const nextScrollTop = this.listContainer.scrollTop
    if (nextScrollTop !== prevScrollTop) {
      this.model.setVirtualScrollTop(nextScrollTop)
    }
  }

  private focusContainer() {
    requestAnimationFrame(() => {
      const container = this.renderRoot.querySelector<HTMLElement>('.list-container')
      container?.focus()
    })
  }

  private getGridColumnsCount(): number {
    const grid = this.renderRoot.querySelector('.grid-view') as HTMLElement | null
    if (!grid) return 1
    const style = window.getComputedStyle(grid)
    const cols = style.gridTemplateColumns
    if (!cols) return 1
    return cols.split(' ').length
  }

  protected getAriaSort(
    column: SortOption & ('name' | 'size' | 'date'),
  ): 'none' | 'ascending' | 'descending' {
    if (this.filters.sortBy !== column) return 'none'
    return this.filters.sortDirection === 'asc' ? 'ascending' : 'descending'
  }

  private getSelectionStatusText() {
    const count = this.selectedItems.length
    if (count === 0) return i18n('file-manager:selection:none' as any)
    return i18n('file-manager:selection:count' as any, {count: String(count)})
  }

  private getItemClientRect(id: number): DOMRect | null {
    const el = this.renderRoot.querySelector<HTMLElement>(
      `file-item[data-id="${id}"], .file-item-wrapper[data-id="${id}"]`,
    )
    return el?.getBoundingClientRect() ?? null
  }
}
