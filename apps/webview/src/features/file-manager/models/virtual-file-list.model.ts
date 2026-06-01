import {atom} from '@reatom/core'

import {
  type FileListRenderItem,
  type FileListVisibleItem,
  type SearchFilters,
  type ViewMode,
} from 'root/shared/contracts/file-manager'

import {VirtualFileListDataModel} from './virtual-file-list-data.model'
import {
  type GridViewportMetrics,
  type VirtualFileListMetrics,
  VirtualFileListViewportModel,
} from './virtual-file-list-viewport.model'

export type {GridViewportMetrics, VirtualFileListMetrics} from './virtual-file-list-viewport.model'

export class VirtualFileListModel {
  readonly data = new VirtualFileListDataModel()
  readonly viewport = new VirtualFileListViewportModel()
  readonly virtualScrollTop = this.viewport.virtualScrollTop
  readonly viewportHeight = this.viewport.viewportHeight
  readonly gridColumns = this.viewport.gridColumns
  readonly gridRowHeight = this.viewport.gridRowHeight
  readonly dragOverIndex = this.viewport.dragOverIndex
  readonly activeItemId = atom<number | null>(null, 'file.virtualList.activeItemId')

  setVirtualScrollTop(value: number) {
    this.viewport.setVirtualScrollTop(value)
  }

  setViewportHeight(value: number) {
    this.viewport.setViewportHeight(value)
  }

  setGridViewportMetrics(metrics: GridViewportMetrics) {
    this.viewport.setGridViewportMetrics(metrics)
  }

  setDragOverIndex(index: number) {
    this.viewport.setDragOverIndex(index)
  }

  clearDragOverIndex() {
    this.viewport.clearDragOverIndex()
  }

  setActiveItemId(id: number | null) {
    if (this.activeItemId() === id) return
    this.activeItemId.set(id)
  }

  getFilteredItems(
    items: readonly FileListRenderItem[],
    filters: SearchFilters,
    itemsPreFiltered = false,
  ): FileListRenderItem[] {
    return this.data.getFilteredItems(items, filters, itemsPreFiltered)
  }

  getVisibleItems(
    filtered: readonly FileListRenderItem[],
    viewMode: ViewMode,
    itemHeight: number,
    virtualScrollTop: number,
    viewportHeight: number,
    gridColumns = this.gridColumns(),
    gridRowHeight = this.gridRowHeight(),
  ): FileListVisibleItem[] {
    return this.viewport.getVisibleItems(
      filtered,
      viewMode,
      itemHeight,
      virtualScrollTop,
      viewportHeight,
      gridColumns,
      gridRowHeight,
    )
  }

  getVisibleRange(
    totalItemsCount: number,
    viewMode: ViewMode,
    itemHeight: number,
    virtualScrollTop: number,
    viewportHeight: number,
    gridColumns = this.gridColumns(),
    gridRowHeight = this.gridRowHeight(),
  ): {startIndex: number; endIndex: number} {
    return this.viewport.getVisibleRange(
      totalItemsCount,
      viewMode,
      itemHeight,
      virtualScrollTop,
      viewportHeight,
      gridColumns,
      gridRowHeight,
    )
  }

  getVirtualMetrics(
    totalItemsCount: number,
    viewMode: ViewMode,
    itemHeight: number,
    virtualScrollTop: number,
    gridColumns = this.gridColumns(),
    gridRowHeight = this.gridRowHeight(),
  ): VirtualFileListMetrics {
    return this.viewport.getVirtualMetrics(
      totalItemsCount,
      viewMode,
      itemHeight,
      virtualScrollTop,
      gridColumns,
      gridRowHeight,
    )
  }

  getGridScrollTopForIndex(index: number, viewportHeight: number, currentScrollTop: number): number {
    return this.viewport.getGridScrollTopForIndex(index, viewportHeight, currentScrollTop)
  }
}
