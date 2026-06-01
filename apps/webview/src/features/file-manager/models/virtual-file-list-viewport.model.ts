import {atom} from '@reatom/core'

import {
  isRealFileListItem,
  type FileListRenderItem,
  type FileListVisibleItem,
  type ViewMode,
} from 'root/shared/contracts/file-manager'

export type VirtualFileListMetrics = {
  totalHeight: number
  offsetY: number
}

export type GridViewportMetrics = {
  columns: number
  rowHeight: number
}

const GRID_OVERSCAN_ROWS = 1

export class VirtualFileListViewportModel {
  readonly virtualScrollTop = atom(0, 'file.virtualList.virtualScrollTop')
  readonly viewportHeight = atom(400, 'file.virtualList.viewportHeight')
  readonly gridColumns = atom(1, 'file.virtualList.gridColumns')
  readonly gridRowHeight = atom(216, 'file.virtualList.gridRowHeight')
  readonly dragOverIndex = atom(-1, 'file.virtualList.dragOverIndex')

  setVirtualScrollTop(value: number): void {
    this.virtualScrollTop.set(value)
  }

  setViewportHeight(value: number): void {
    if (this.viewportHeight() !== value) {
      this.viewportHeight.set(value)
    }
  }

  setGridViewportMetrics(metrics: GridViewportMetrics): void {
    const columns = Math.max(1, Math.floor(metrics.columns))
    const rowHeight = Math.max(1, Math.floor(metrics.rowHeight))
    if (this.gridColumns() !== columns) {
      this.gridColumns.set(columns)
    }
    if (this.gridRowHeight() !== rowHeight) {
      this.gridRowHeight.set(rowHeight)
    }
  }

  setDragOverIndex(index: number): void {
    this.dragOverIndex.set(index)
  }

  clearDragOverIndex(): void {
    this.dragOverIndex.set(-1)
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
    const {startIndex, endIndex} = this.getVisibleRange(
      filtered.length,
      viewMode,
      itemHeight,
      virtualScrollTop,
      viewportHeight,
      gridColumns,
      gridRowHeight,
    )

    return filtered.slice(startIndex, endIndex).map((item, index) => {
      const virtualIndex = startIndex + index
      if (!isRealFileListItem(item)) {
        return {
          kind: 'placeholder',
          placeholderKey: `placeholder-${virtualIndex}`,
          virtualIndex,
        }
      }
      return {
        ...item,
        virtualIndex,
      }
    })
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
    if (totalItemsCount <= 0) return {startIndex: 0, endIndex: 0}

    if (viewMode === 'grid') {
      return this.getVisibleGridRange(
        totalItemsCount,
        virtualScrollTop,
        viewportHeight,
        gridColumns,
        gridRowHeight,
      )
    }

    const safeScrollTop = Math.max(0, virtualScrollTop)
    const startIndex = Math.floor(safeScrollTop / itemHeight)
    const endIndex = Math.min(totalItemsCount, startIndex + Math.ceil(viewportHeight / itemHeight) + 2)
    return {startIndex, endIndex}
  }

  getVirtualMetrics(
    totalItemsCount: number,
    viewMode: ViewMode,
    itemHeight: number,
    virtualScrollTop: number,
    gridColumns = this.gridColumns(),
    gridRowHeight = this.gridRowHeight(),
  ): VirtualFileListMetrics {
    if (viewMode === 'grid') {
      const safeColumns = Math.max(1, gridColumns)
      const safeRowHeight = Math.max(1, gridRowHeight)
      const startRow = this.getVisibleGridStartRow(virtualScrollTop, safeRowHeight)
      return {
        totalHeight: Math.ceil(totalItemsCount / safeColumns) * safeRowHeight,
        offsetY: startRow * safeRowHeight,
      }
    }

    const safeScrollTop = Math.max(0, virtualScrollTop)
    const startIndex = Math.floor(safeScrollTop / itemHeight)
    return {
      totalHeight: Math.max(0, totalItemsCount * itemHeight),
      offsetY: startIndex * itemHeight,
    }
  }

  getGridScrollTopForIndex(index: number, viewportHeight: number, currentScrollTop: number): number {
    const safeIndex = Math.max(0, index)
    const rowHeight = Math.max(1, this.gridRowHeight())
    const columns = Math.max(1, this.gridColumns())
    const rowTop = Math.floor(safeIndex / columns) * rowHeight
    const rowBottom = rowTop + rowHeight
    const viewTop = Math.max(0, currentScrollTop)
    const viewBottom = viewTop + Math.max(1, viewportHeight)

    if (rowTop < viewTop) {
      return rowTop
    }
    if (rowBottom > viewBottom) {
      return Math.max(0, rowBottom - viewportHeight)
    }
    return viewTop
  }

  private getVisibleGridRange(
    totalItemsCount: number,
    virtualScrollTop: number,
    viewportHeight: number,
    gridColumns: number,
    gridRowHeight: number,
  ): {startIndex: number; endIndex: number} {
    const safeColumns = Math.max(1, gridColumns)
    const safeRowHeight = Math.max(1, gridRowHeight)
    const startRow = this.getVisibleGridStartRow(virtualScrollTop, safeRowHeight)
    const visibleRows = Math.ceil(Math.max(1, viewportHeight) / safeRowHeight)
    const endRow = Math.ceil(totalItemsCount / safeColumns)
    const cappedEndRow = Math.min(endRow, startRow + visibleRows + GRID_OVERSCAN_ROWS * 2 + 1)

    return {
      startIndex: startRow * safeColumns,
      endIndex: Math.min(totalItemsCount, cappedEndRow * safeColumns),
    }
  }

  private getVisibleGridStartRow(virtualScrollTop: number, gridRowHeight: number): number {
    return Math.max(0, Math.floor(Math.max(0, virtualScrollTop) / gridRowHeight) - GRID_OVERSCAN_ROWS)
  }
}
