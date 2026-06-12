import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {nothing, type PropertyValues} from 'lit'

import {i18n} from 'root/i18n'
import {renderGuidanceInline} from 'root/features/guidance/render-guidance-inline'
import {mediaPlaybackModel} from 'root/features/media/models/media-playback.model'
import {getAppContext} from 'root/shared/services/app-context'
import {ScrollEdgeAffordanceModel} from 'root/shared/ui/scroll-edge-affordance.model'
import type {
  FileItemData,
  FileListItem,
  FileListRenderItem,
  FileListVisibleItem,
  FileListVisibleRange,
  FileListViewportRestoreState,
  FileListViewportSnapshot,
  SearchFilters,
} from 'root/shared/contracts/file-manager'
import {
  isFileListPlaceholderItem,
  isRealFileListItem,
} from 'root/shared/contracts/file-manager'
import {type SortOption} from 'root/shared/contracts/file-manager'
import {
  createDefaultFileSearchFilters,
  createFileSearchFilterActions,
  hasContentFiltering,
  type FileSearchFilterActions,
} from '../models/file-search-filters.model'

import {virtualFileListStyles} from './virtual-file-list/virtual-file-list.styles'
import {renderGridView} from './virtual-file-list/render-grid'
import {renderFileItem, renderListView} from './virtual-file-list/render-list'
import {renderTableView} from './virtual-file-list/render-table'
import {
  FILE_ITEM_HOST_SELECTOR,
  getFileItemHostByIdSelector,
  isFileItemHostElement,
} from './virtual-file-list/item-host-selectors'
import {
  getLastSegment,
  getParentPath,
  normalizePath,
} from './virtual-file-list/virtual-file-list.model-helpers'
import {VirtualFileListFocusController} from './virtual-file-list/focus-controller'
import {VirtualFileListModel} from '../models/virtual-file-list.model'
import type {FileDeletionMotionModel} from '../models/file-deletion-motion.model'
import {VirtualFileListHandlers} from './virtual-file-list/handlers'
import {getFileManagerModel} from '../file-manager.model'
import type {PMSummaryRailItem} from '../../passmanager/components/summary-rail'

export type {FileListItem} from 'root/shared/contracts/file-manager'

type FileItemHost = HTMLElement & {closeSwipe?: () => void}

const DESKTOP_LIST_ITEM_HEIGHT = 96

export class VirtualFileListBase extends ReatomLitElement {
  static get properties() {
    return {
      items: {type: Array},
      filters: {type: Object},
      itemHeight: {type: Number, attribute: 'item-height'},
      containerHeight: {type: Number, attribute: 'container-height'},
      selectedItems: {type: Array, attribute: 'selected-items'},
      selectionMode: {type: Boolean, attribute: 'selection-mode'},
      pendingExternalOpenIds: {type: Array, attribute: 'pending-external-open-ids'},
      currentPath: {type: String, attribute: 'current-path'},
      mobile: {type: Boolean},
      restoreViewport: {type: Object, attribute: false},
      itemsPreFiltered: {type: Boolean, attribute: 'items-pre-filtered'},
      deletionMotion: {attribute: false},
      filterActions: {attribute: false},
    }
  }

  declare items: FileListRenderItem[]
  declare filters: SearchFilters
  declare itemHeight: number
  declare containerHeight: number
  declare selectedItems: number[]
  declare selectionMode: boolean
  declare pendingExternalOpenIds: number[]
  declare currentPath: string
  declare mobile: boolean
  declare restoreViewport: FileListViewportRestoreState | null
  declare itemsPreFiltered: boolean
  declare deletionMotion: FileDeletionMotionModel | null
  declare filterActions: FileSearchFilterActions | null

  constructor() {
    super()
    this.items = []
    this.filters = createDefaultFileSearchFilters()
    this.itemHeight = 80
    this.containerHeight = 400
    this.selectedItems = []
    this.selectionMode = false
    this.pendingExternalOpenIds = []
    this.currentPath = '/'
    this.mobile = false
    this.restoreViewport = null
    this.itemsPreFiltered = false
    this.deletionMotion = null
    this.filterActions = null
    this.legacyFilterActions = createFileSearchFilterActions({
      read: () => this.filters,
      write: (next) => this.dispatchFiltersChange(next),
    })
  }

  protected readonly model = new VirtualFileListModel()
  private readonly scrollEdge = new ScrollEdgeAffordanceModel()
  private readonly legacyFilterActions: FileSearchFilterActions
  protected readonly handlers = new VirtualFileListHandlers({
    getItems: () => this.getActionItems(),
    getFilters: () => this.filters,
    getSelectedItems: () => this.selectedItems,
    isSelectionMode: () => this.selectionMode,
    isMobileLayout: () => this.mobile,
    emitSelectionModeRequested: (enabled: boolean) => this.dispatchSelectionModeRequested(enabled),
    emitSelectionChange: (selectedItems: number[]) => this.dispatchSelectionChange(selectedItems),
    emitItemAction: (
      action: string,
      item: FileListItem | undefined,
      event: Event | undefined,
      source: FileListItem | undefined,
      target: FileListItem | undefined,
      payload: unknown,
    ) => this.dispatchItemAction(action, item, event, source, target, payload),
    applyTableSort: (option: SortOption) => this.getFilterActions().applyTableSort(option),
    emitNavigate: (path: string) => this.dispatchNavigate(path),
    getActiveItemId: () => this.model.activeItemId(),
    setActiveItemId: (id: number | null) => this.setActiveItemId(id),
    focusItemById: (id: number) => this.focusItemById(id),
    focusContainer: () => this.focusContainer(),
    getItemClientRect: (id: number) => this.getItemClientRect(id),
    ensureIndexVisible: (index: number) => this.ensureIndexVisible(index),
    getViewMode: () => this.filters.viewMode,
    getItemHeight: () => this.getEffectiveItemHeight(),
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
  private readonly focusController = new VirtualFileListFocusController({
    getActionItems: () => this.getActionItems(),
    getFilters: () => this.filters,
    getItemHeight: () => this.getEffectiveItemHeight(),
    getViewportHeight: () => this.model.viewportHeight(),
    getCurrentPath: () => this.currentPath,
    getActiveItemId: () => this.model.activeItemId(),
    setActiveItemId: (id) => this.setActiveItemId(id),
    getScrollTop: () => this.listContainer?.scrollTop ?? this.model.virtualScrollTop(),
    setScrollTop: (scrollTop) => {
      if (this.listContainer) {
        this.listContainer.scrollTop = scrollTop
      }
    },
    setVirtualScrollTop: (scrollTop) => this.model.setVirtualScrollTop(scrollTop),
    getGridScrollTopForIndex: (index, viewportHeight, currentScrollTop) =>
      this.model.getGridScrollTopForIndex(index, viewportHeight, currentScrollTop),
    updateViewportHeight: () => this.updateViewportHeight(),
    isFocusInsideList: () => this.isFocusInsideList(),
    focusRenderedItemById: (id) => this.focusRenderedItemById(id),
    focusContainer: () => this.focusContainer(),
    focusListContainer: () => this.focusListContainer(),
    setSelectionAnchor: (index) => this.handlers.setSelectionAnchor(index),
    setKeyboardAnchor: (index) => this.handlers.setKeyboardAnchor(index),
    dispatchSelectionChange: (selectedItems) => this.dispatchSelectionChange(selectedItems),
    dispatchViewportStateRestored: (revision) => this.dispatchViewportStateRestored(revision),
    getAppliedViewportRestoreRevision: () => this.appliedViewportRestoreRevision,
    setAppliedViewportRestoreRevision: (revision) => {
      this.appliedViewportRestoreRevision = revision
    },
    afterUpdate: (callback) => {
      void this.updateComplete.then(() => callback())
    },
  })

  static styles = virtualFileListStyles

  private resizeDebounceTimer: number | null = null
  private listContainer?: HTMLElement
  private rafPending = false
  private pendingScrollTop = 0
  private viewportHeightRaf: number | null = null
  private listResizeObserver: ResizeObserver | null = null
  private appliedViewportRestoreRevision: number | null = null
  private lastVisibleRangeKey = ''
  private previousVisibleRows: FileListVisibleItem[] = []
  private readonly fallbackGridCardHeight = 200
  private readonly fallbackTouchGridCardHeight = 160
  private readonly fallbackGridGap = 16

  override connectedCallback() {
    super.connectedCallback()
    this.getFileMoveModel()?.registerMobileDropZone(this.renderRoot as ShadowRoot)
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
    this.getFileMoveModel()?.unregisterMobileDropZone(this.renderRoot as ShadowRoot)
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
    if (this.viewportHeightRaf !== null) {
      cancelAnimationFrame(this.viewportHeightRaf)
      this.viewportHeightRaf = null
    }
    if (this.listContainer) {
      this.listContainer.removeEventListener('scroll', this.onScroll)
    }
    this.scrollEdge.dispose()
  }

  private onWindowResize = () => {
    if (this.resizeDebounceTimer) {
      clearTimeout(this.resizeDebounceTimer)
    }
    this.resizeDebounceTimer = window.setTimeout(() => {
      this.scheduleViewportHeightUpdate()
    }, 100)
  }

  private scheduleViewportHeightUpdate() {
    if (this.viewportHeightRaf !== null) return

    this.viewportHeightRaf = requestAnimationFrame(() => {
      this.viewportHeightRaf = null
      this.updateViewportHeight()
    })
  }

  private updateViewportHeight() {
    if (!this.listContainer) {
      this.listContainer = this.renderRoot.querySelector('.list-container') as HTMLElement | undefined
      if (this.listContainer) {
        this.listContainer.addEventListener('scroll', this.onScroll, {passive: true})
        this.scrollEdge.bindScroller(this.listContainer)
      }
    }
    if (!this.listContainer) return

    if (!this.listResizeObserver && typeof ResizeObserver !== 'undefined') {
      this.listResizeObserver = new ResizeObserver(() => this.scheduleViewportHeightUpdate())
      try {
        this.listResizeObserver.observe(this.listContainer)
      } catch {
        // ignore observe failures
      }
    }

    const newHeight = this.listContainer.clientHeight
    this.model.setViewportHeight(newHeight)
    this.updateGridViewportMetrics()
    this.scrollEdge.scheduleMeasure()
  }

  private onScroll = (event: Event) => {
    const target = event.target as HTMLElement
    this.pendingScrollTop = target.scrollTop
    if (this.rafPending) return
    this.rafPending = true
    requestAnimationFrame(() => {
      this.model.setVirtualScrollTop(this.pendingScrollTop)
      this.focusController.maybeUpdateActiveFromScroll(this.pendingScrollTop)
      this.dispatchVisibleRangeChange()
      this.rafPending = false
    })
  }

  private isFocusInsideList(): boolean {
    const rootActive = (this.renderRoot as ShadowRoot | null)?.activeElement
    if (rootActive instanceof HTMLElement) {
      return rootActive.classList.contains('list-container') || rootActive.closest?.('.file-item-wrapper') != null
    }
    return false
  }

  protected getFilteredItems(): FileListRenderItem[] {
    return this.model.getFilteredItems(this.items, this.filters, this.itemsPreFiltered)
  }

  private getActionItems(): FileListItem[] {
    return this.getFilteredItems().filter(isRealFileListItem)
  }

  private getEffectiveItemHeight(): number {
    if (!this.mobile && this.filters.viewMode === 'list') {
      return DESKTOP_LIST_ITEM_HEIGHT
    }

    return this.itemHeight
  }

  private getVisibleItems(filteredItems: readonly FileListRenderItem[]): FileListVisibleItem[] {
    const itemHeight = this.getEffectiveItemHeight()

    return this.model.getVisibleItems(
      filteredItems,
      this.filters.viewMode,
      itemHeight,
      this.model.virtualScrollTop(),
      this.model.viewportHeight(),
      this.model.gridColumns(),
      this.model.gridRowHeight(),
    )
  }

  private setActiveItemId(id: number | null) {
    this.model.setActiveItemId(id)
  }

  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed)

    if (changed.has('currentPath')) {
      this.deletionMotion?.resetForPath(normalizePath(this.currentPath))
    }

    const filteredItems = this.getFilteredItems()
    const visibleItems = this.getVisibleItems(filteredItems)

    if (this.filters.viewMode === 'list' || this.filters.viewMode === 'table') {
      this.deletionMotion?.syncVisibleExits(visibleItems, this.previousVisibleRows, filteredItems)
      this.previousVisibleRows = visibleItems
      return
    }

    this.deletionMotion?.syncVisibleExits([], [], filteredItems)
    this.previousVisibleRows = []
  }

  private getFileMoveModel() {
    try {
      return getFileManagerModel(getAppContext()).fileMove
    } catch {
      return null
    }
  }

  private syncVirtualStyles() {
    const filteredItems = this.getFilteredItems()
    const totalItemsCount =
      this.filters.viewMode === 'grid'
        ? filteredItems.length
        : (this.deletionMotion?.getTotalItemsCount(filteredItems.length) ?? filteredItems.length)
    const {totalHeight, offsetY} = this.model.getVirtualMetrics(
      totalItemsCount,
      this.filters.viewMode,
      this.getEffectiveItemHeight(),
      this.model.virtualScrollTop(),
      this.model.gridColumns(),
      this.model.gridRowHeight(),
    )

    this.style.setProperty('--virtual-total-height', `${totalHeight}px`)
    this.style.setProperty('--virtual-offset-y', `${offsetY}px`)
    this.style.setProperty('--file-list-item-height', `${this.getEffectiveItemHeight()}px`)
  }

  private syncMobileDndPointStyles() {
    const point = this.getFileMoveModel()?.mobileDnd.point()
    if (!point) return

    this.style.setProperty('--file-mobile-dnd-x', `${Math.round(point.x)}px`)
    this.style.setProperty('--file-mobile-dnd-y', `${Math.round(point.y)}px`)
  }

  private renderMobileDndFeedback() {
    const dnd = this.getFileMoveModel()?.mobileDnd
    if (!dnd) return nothing

    const active = dnd.active()
    const label = dnd.ghostLabel()
    const liveMessage = dnd.liveMessage()

    return html`
      <div class="mobile-dnd-live" role="status" aria-live="polite">${liveMessage}</div>
      ${active && label
        ? html`
            <div class="mobile-dnd-ghost" aria-hidden="true">
              <cv-icon name="folder-symlink"></cv-icon>
              <span>${label}</span>
            </div>
          `
        : nothing}
    `
  }

  private isFileItemDragEvent(event: DragEvent): boolean {
    return event.composedPath().some((target) => isFileItemHostElement(target))
  }

  private handleContainerDragOver(event: DragEvent) {
    if (this.isFileItemDragEvent(event)) return

    const model = this.getFileMoveModel()
    const targetPath = normalizePath(this.currentPath || '/')
    const payload = model?.readDragPayload(event.dataTransfer) ?? null
    if (!model?.canDropToTarget(targetPath, payload)) return

    event.preventDefault()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move'
    }
    model.setDropTarget(targetPath)
  }

  private handleContainerDragLeave(event: DragEvent) {
    if (event.currentTarget !== event.target) return
    this.getFileMoveModel()?.setDropTarget(null)
  }

  private handleContainerDrop(event: DragEvent) {
    if (this.isFileItemDragEvent(event)) return

    const model = this.getFileMoveModel()
    const targetPath = normalizePath(this.currentPath || '/')
    const payload = model?.readDragPayload(event.dataTransfer) ?? null
    model?.setDropTarget(null)
    if (!model || !payload || !model.canDropToTarget(targetPath, payload)) return

    event.preventDefault()
    void model.dropToTarget(targetPath, payload)
  }

  private onDeleteExitAnimationEnd(event: AnimationEvent, id: number): void {
    if (event.target !== event.currentTarget) return

    const before = this.captureVisibleRowRects()
    this.deletionMotion?.completeExit(id)
    this.dispatchEvent(new CustomEvent('delete-exit-complete', {detail: {id}, bubbles: true}))

    if (this.prefersReducedMotion()) return
    void this.updateComplete.then(() => this.animateCompaction(before))
  }

  private captureVisibleRowRects(): Map<number, DOMRect> {
    const rows = new Map<number, DOMRect>()
    const selector = 'file-item-desktop[data-id], file-item-mobile[data-id], .file-item-wrapper[data-id]'
    for (const element of this.renderRoot.querySelectorAll<HTMLElement>(selector)) {
      if (element.hasAttribute('data-delete-exiting')) continue
      const id = Number(element.dataset['id'])
      if (!Number.isFinite(id)) continue
      rows.set(id, element.getBoundingClientRect())
    }
    return rows
  }

  private animateCompaction(before: Map<number, DOMRect>): void {
    if (before.size === 0) return

    const selector = 'file-item-desktop[data-id], file-item-mobile[data-id], .file-item-wrapper[data-id]'
    for (const element of this.renderRoot.querySelectorAll<HTMLElement>(selector)) {
      if (element.hasAttribute('data-delete-exiting')) continue

      const id = Number(element.dataset['id'])
      const previous = before.get(id)
      if (!previous || typeof element.animate !== 'function') continue

      const next = element.getBoundingClientRect()
      const deltaX = previous.left - next.left
      const deltaY = previous.top - next.top
      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) continue

      element.animate(
        [
          {transform: `translate(${deltaX}px, ${deltaY}px)`},
          {transform: 'translate(0, 0)'},
        ],
        {
          duration: 180,
          easing: 'cubic-bezier(0, 0, 0.2, 1)',
        },
      )
    }
  }

  private prefersReducedMotion(): boolean {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  }

  render() {
    const filteredItems = this.getFilteredItems()
    const visibleItems = this.getVisibleItems(filteredItems)
    const decoratedRows =
      this.filters.viewMode === 'list' || this.filters.viewMode === 'table'
        ? (this.deletionMotion?.decorateVisibleRows(visibleItems, filteredItems) ?? {
            items: visibleItems,
            totalItemsCount: filteredItems.length,
          })
        : {
            items: visibleItems,
            totalItemsCount: filteredItems.length,
          }
    const actionItems = filteredItems.filter(isRealFileListItem)
    const hasOnlyPlaceholders = filteredItems.length > 0 && actionItems.length === 0
    const hasActiveFilters = this.hasActiveFilters()
    const shouldRenderEmptyState = decoratedRows.totalItemsCount === 0 || (hasOnlyPlaceholders && hasActiveFilters)
    const containerRole = this.filters.viewMode === 'table' ? 'grid' : 'listbox'
    const activeItemId = this.model.activeItemId() ?? actionItems[0]?.id ?? null
    const mediaActiveItemId = mediaPlaybackModel.currentTrackId()
    const mediaPlaying = mediaPlaybackModel.isPlaying()
    const itemHeight = this.getEffectiveItemHeight()
    const virtualMetrics = this.model.getVirtualMetrics(
      decoratedRows.totalItemsCount,
      this.filters.viewMode,
      itemHeight,
      this.model.virtualScrollTop(),
      this.model.gridColumns(),
      this.model.gridRowHeight(),
    )
    const hasScrollBlockStart = this.scrollEdge.hasBlockStartOverflow()
    const hasScrollBlockEnd = this.scrollEdge.hasBlockEndOverflow()

    const fileItemCallbacks = {
      onFileItemClick: this.handlers.onFileItemClick,
      onFileItemDoubleClick: this.handlers.onFileItemDoubleClick,
      onFileItemContextMenu: this.handlers.onFileItemContextMenu,
      onFileItemRename: this.handlers.onFileItemRename,
      onFileItemDownload: this.handlers.onFileItemDownload,
      onFileItemDelete: this.handlers.onFileItemDelete,
      onFileItemInfo: this.handlers.onFileItemInfo,
      onDeleteExitAnimationEnd: (event: AnimationEvent, id: number) => this.onDeleteExitAnimationEnd(event, id),
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
        class="scroll-edge-frame file-list-scroll-edge"
        data-scroll-block-start=${String(hasScrollBlockStart)}
        data-scroll-block-end=${String(hasScrollBlockEnd)}
      >
        <div
          class="list-container scroll-edge-scroller"
          data-mobile-dnd-target-id=${normalizePath(this.currentPath || '/')}
          tabindex=${containerRole === 'listbox' ? '0' : '-1'}
          @pointerdown=${this.handlers.onPointerDown}
          @pointermove=${this.handlers.onPointerMove}
          @pointerup=${this.handlers.onPointerUp}
          @pointercancel=${this.handlers.onPointerCancel}
          @keydown=${this.handlers.onContainerKeyDown}
          @click=${this.handlers.onContainerBackgroundClick}
          @item-drop=${this.handlers.onItemDrop}
          @dragover=${this.handleContainerDragOver}
          @dragleave=${this.handleContainerDragLeave}
          @drop=${this.handleContainerDrop}
          role=${containerRole}
          aria-multiselectable="true"
          aria-activedescendant=${containerRole === 'listbox' && activeItemId != null
            ? `file-option-${activeItemId}`
            : nothing}
          aria-label=${i18n('file-manager:files')}
        >
          ${shouldRenderEmptyState
            ? html`
                <cv-empty-state
                  icon="folder-x"
                  headline=${hasActiveFilters
                    ? i18n('file-manager:no-files-found')
                    : i18n('file-manager:folder-empty')}
                  description=${hasActiveFilters ? i18n('file-manager:change-search-or-filters') : ''}
                >
                  ${hasActiveFilters ? nothing : renderGuidanceInline('files.create-or-upload', 'files')}
                  ${hasActiveFilters
                    ? html`
                        <cv-button
                          slot="actions"
                          variant="ghost"
                          size="medium"
                          @click=${this.onClearFiltersClick}
                        >
                          ${i18n('file-manager:clear-filters')}
                        </cv-button>
                      `
                    : nothing}
                </cv-empty-state>
              `
            : html`
                ${this.filters.viewMode === 'list'
                  ? renderListView({
                      items: decoratedRows.items,
                      totalItemsCount: decoratedRows.totalItemsCount,
                      mobile: this.mobile,
                      itemHeight,
                      virtualScrollTop: this.model.virtualScrollTop(),
                      selectedItems: this.selectedItems,
                      pendingExternalOpenIds: this.pendingExternalOpenIds,
                      mediaActiveItemId,
                      mediaPlaying,
                      activeItemId,
                      selectionMode: this.selectionMode,
                      viewMode: this.filters.viewMode,
                      callbacks: fileItemCallbacks,
                    })
                  : nothing}
                ${this.filters.viewMode === 'grid'
                  ? renderGridView({
                      items: visibleItems,
                      totalHeight: virtualMetrics.totalHeight,
                      offsetY: virtualMetrics.offsetY,
                      renderItem: (item) =>
                        renderFileItem({
                          item,
                          mobile: this.mobile,
                          selected: isFileListPlaceholderItem(item) ? false : this.selectedItems.includes(item.id),
                          active: isFileListPlaceholderItem(item) ? false : activeItemId === item.id,
                          selectionMode: this.selectionMode,
                          pendingExternalOpen: isFileListPlaceholderItem(item)
                            ? false
                            : this.pendingExternalOpenIds.includes(item.id),
                          deleteExiting: false,
                          mediaActive: isFileListPlaceholderItem(item) ? false : mediaActiveItemId === item.id,
                          mediaPlaying:
                            !isFileListPlaceholderItem(item) && mediaPlaying && mediaActiveItemId === item.id,
                          viewMode: this.filters.viewMode,
                          callbacks: fileItemCallbacks,
                        }),
                    })
                  : ''}
                ${this.filters.viewMode === 'table'
                  ? renderTableView({
                    items: decoratedRows.items,
                    filteredItems,
                    totalItemsCount: decoratedRows.totalItemsCount,
                    itemHeight,
                    virtualScrollTop: this.model.virtualScrollTop(),
                    viewportHeight: this.model.viewportHeight(),
                    sortBy: this.filters.sortBy === 'type' ? 'name' : this.filters.sortBy,
                    sortDirection: this.filters.sortDirection,
                    selectedItems: this.selectedItems,
                    pendingExternalOpenIds: this.pendingExternalOpenIds,
                    selectionMode: this.selectionMode,
                    onSortName: this.handlers.onSortName,
                    onSortSize: this.handlers.onSortSize,
                    onSortDate: this.handlers.onSortDate,
                    onRowClick: this.handlers.onTableRowClick,
                    onRowDblClick: this.handlers.onTableRowDblClick,
                    onRowContextMenu: this.handlers.onTableRowContextMenu,
                    onCheckboxClick: this.handlers.onTableCheckboxClick,
                    onMoreButtonClick: this.handlers.onMoreButtonClick,
                    onDeleteExitAnimationEnd: (event: AnimationEvent, id: number) =>
                      this.onDeleteExitAnimationEnd(event, id),
                    getAriaSort: (column) => this.getAriaSort(column),
                  })
                  : ''}
              `}
        </div>
      </div>
      ${this.renderMobileDndFeedback()}
      ${this.mobile
        ? html`<div class="status-bar">${this.renderStatusSummary(filteredItems.length)}</div>`
        : nothing}
    `
  }

  private hasActiveFilters(): boolean {
    return hasContentFiltering(this.filters)
  }

  override updated(changed: Map<string, unknown>) {
    super.updated(changed)
    this.updateGridViewportMetrics()
    this.syncVirtualStyles()
    this.syncMobileDndPointStyles()
    this.dispatchVisibleRangeChange()
    this.scrollEdge.scheduleMeasure()

    if (changed.has('items') || changed.has('filters') || changed.has('currentPath')) {
      if (changed.has('filters') || changed.has('currentPath')) {
        this.handlers.clearAnchors()
      } else {
        this.handlers.pruneAnchors(this.getActionItems())
      }
      this.focusController.syncActiveForCurrentItems()
    }

    if (this.restoreViewportState()) return
    if (!changed.has('currentPath')) return

    const prevRaw = changed.get('currentPath') as string | undefined
    this.focusController.handlePathChanged(prevRaw)
  }

  private onSwipeOpen = (event: Event) => {
    const path = event.composedPath()
    const source = path.find((el) => isFileItemHostElement(el)) as FileItemHost | undefined
    const items = this.renderRoot.querySelectorAll<FileItemHost>(FILE_ITEM_HOST_SELECTOR)
    for (const item of items) {
      if (item !== source && typeof item.closeSwipe === 'function') {
        item.closeSwipe()
      }
    }
  }

  private onClearFiltersClick = () => {
    this.getFilterActions().reset()
  }

  protected dispatchSelectionChange(selectedItems: number[]) {
    this.dispatchEvent(new CustomEvent('selection-change', {detail: {selectedItems}, bubbles: true}))
  }

  private getViewportSnapshot(
    focusItemId: number | null = this.model.activeItemId(),
  ): FileListViewportSnapshot {
    this.updateViewportHeight()

    return {
      path: normalizePath(this.currentPath),
      viewMode: this.filters.viewMode,
      scrollTop: Math.max(0, this.listContainer?.scrollTop ?? this.model.virtualScrollTop()),
      activeItemId: this.model.activeItemId(),
      focusItemId,
    }
  }

  private dispatchViewportStateChange(focusItemId: number | null = this.model.activeItemId()) {
    this.dispatchEvent(
      new CustomEvent('viewport-state-change', {
        detail: this.getViewportSnapshot(focusItemId),
        bubbles: true,
      }),
    )
  }

  private dispatchViewportStateRestored(revision: number) {
    this.dispatchEvent(
      new CustomEvent('viewport-state-restored', {
        detail: {revision},
        bubbles: true,
      }),
    )
  }

  private dispatchVisibleRangeChange() {
    const filteredItems = this.getFilteredItems()
    const range = this.model.getVisibleRange(
      filteredItems.length,
      this.filters.viewMode,
      this.getEffectiveItemHeight(),
      this.model.virtualScrollTop(),
      this.model.viewportHeight(),
      this.model.gridColumns(),
      this.model.gridRowHeight(),
    )
    const key = `${this.currentPath}|${this.filters.viewMode}|${range.startIndex}|${range.endIndex}|${filteredItems.length}`
    if (key === this.lastVisibleRangeKey) return

    this.lastVisibleRangeKey = key
    const detail: FileListVisibleRange & {totalItems: number} = {
      ...range,
      totalItems: filteredItems.length,
    }
    this.dispatchEvent(new CustomEvent('visible-range-change', {detail, bubbles: true}))
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
    payload?: unknown,
  ) {
    if (action === 'open') {
      this.dispatchViewportStateChange(item?.id ?? null)
    }

    this.dispatchEvent(
      new CustomEvent('item-action', {
        detail: {action, item, event, source, target, payload},
        bubbles: true,
      }),
    )
  }

  protected dispatchFiltersChange(next: SearchFilters) {
    this.dispatchEvent(new CustomEvent('filters-change', {detail: next, bubbles: true}))
  }

  private getFilterActions(): FileSearchFilterActions {
    return this.filterActions ?? this.legacyFilterActions
  }

  private dispatchNavigate(path: string) {
    this.dispatchEvent(new CustomEvent('navigate', {detail: {path}, bubbles: true}))
  }

  private restoreViewportState(): boolean {
    return this.focusController.restoreViewportState(this.restoreViewport)
  }

  private focusRenderedItemById(id: number): boolean {
    const row =
      this.filters.viewMode === 'table'
        ? this.renderRoot.querySelector<HTMLElement>(`.file-item-wrapper[data-id="${id}"]`)
        : null
    const item = row ?? this.renderRoot.querySelector<HTMLElement>(getFileItemHostByIdSelector(id))
    return this.focusWithoutScroll(item)
  }

  private focusItemById(id: number) {
    this.focusController.focusItemById(id)
  }

  private focusWithoutScroll(element: HTMLElement | null | undefined): boolean {
    if (!element) return false

    element.focus({preventScroll: true})
    return true
  }

  private ensureIndexVisible(index: number) {
    this.focusController.ensureIndexVisible(index)
  }

  private focusContainer() {
    requestAnimationFrame(() => {
      this.focusListContainer()
    })
  }

  private focusListContainer() {
    const container = this.renderRoot.querySelector<HTMLElement>('.list-container')
    this.focusWithoutScroll(container)
  }

  private getGridColumnsCount(): number {
    this.updateGridViewportMetrics()
    return this.model.gridColumns()
  }

  private updateGridViewportMetrics() {
    if (this.filters.viewMode !== 'grid') {
      return
    }

    const grid = this.renderRoot.querySelector('.grid-view') as HTMLElement | null
    if (!grid) {
      this.model.setGridViewportMetrics(this.estimateGridViewportMetrics())
      return
    }

    const style = window.getComputedStyle(grid)
    const cols = style.gridTemplateColumns
    const columns = cols ? cols.split(' ').filter(Boolean).length : this.estimateGridViewportMetrics().columns
    const gap = Number.parseFloat(style.rowGap || style.gap || '')
    const item = grid.querySelector<HTMLElement>(FILE_ITEM_HOST_SELECTOR)
    const itemHeight = item?.getBoundingClientRect().height
    this.model.setGridViewportMetrics({
      columns,
      rowHeight: Math.max(
        1,
        Math.round((itemHeight && itemHeight > 0 ? itemHeight : this.getFallbackGridCardHeight()) + (Number.isFinite(gap) ? gap : this.fallbackGridGap)),
      ),
    })
  }

  private estimateGridViewportMetrics() {
    const width = Math.max(1, this.listContainer?.clientWidth ?? this.clientWidth ?? 1)
    const minColumnWidth = this.getEstimatedGridMinColumnWidth(width)
    const gap = this.getEstimatedGridGap(width)
    const columns = Math.max(1, Math.floor((width + gap) / (minColumnWidth + gap)))
    return {
      columns,
      rowHeight: this.getFallbackGridCardHeight() + gap,
    }
  }

  private getEstimatedGridMinColumnWidth(width: number) {
    if (width >= 1200) return 280
    if (width >= 900) return 250
    if (width >= 700) return 200
    if (width >= 600) return 180
    return 140
  }

  private getEstimatedGridGap(width: number) {
    if (width >= 1200) return 20
    if (width >= 700) return 12
    return 8
  }

  private getFallbackGridCardHeight() {
    return window.matchMedia?.('(hover: none) and (pointer: coarse)')?.matches
      ? this.fallbackTouchGridCardHeight
      : this.fallbackGridCardHeight
  }

  protected getAriaSort(
    column: SortOption & ('name' | 'size' | 'date'),
  ): 'none' | 'ascending' | 'descending' {
    if (this.filters.sortBy !== column) return 'none'
    return this.filters.sortDirection === 'asc' ? 'ascending' : 'descending'
  }

  private renderStatusSummary(visibleCount: number) {
    return html`
      <pm-summary-rail
        class="status-summary"
        .items=${this.getStatusSummaryItems(visibleCount)}
        .label=${i18n('file-manager:summary:label' as never)}
      ></pm-summary-rail>
    `
  }

  private getStatusSummaryItems(visibleCount: number): PMSummaryRailItem[] {
    const selectedCount = this.selectedItems.length
    return [
      {id: 'items', label: i18n('file-manager:summary:items' as never), value: visibleCount},
      {
        id: 'selected',
        label: i18n('file-manager:summary:selected' as never),
        value: selectedCount,
        tone: selectedCount > 0 ? 'primary' : 'neutral',
      },
    ]
  }

  private getItemClientRect(id: number): DOMRect | null {
    const el = this.renderRoot.querySelector<HTMLElement>(getFileItemHostByIdSelector(id))
    return el?.getBoundingClientRect() ?? null
  }
}
