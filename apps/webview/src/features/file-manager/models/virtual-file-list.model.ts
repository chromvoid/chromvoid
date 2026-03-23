import {state} from '@statx/core'

import type {FileListItem, SearchFilters, ViewMode} from 'root/shared/contracts/file-manager'

import {filterAndSortItems} from '../components/virtual-file-list/virtual-file-list.model-helpers'

export interface VisibleFileListItem extends FileListItem {
  virtualIndex?: number
}

export class VirtualFileListModel {
  readonly virtualScrollTop = state(0)
  readonly viewportHeight = state(400)
  readonly dragOverIndex = state(-1)
  readonly activeItemId = state<number | null>(null)

  private cachedFilteredItems: FileListItem[] = []
  private lastItemsHash = ''
  private lastFiltersHash = ''

  setVirtualScrollTop(value: number) {
    this.virtualScrollTop.set(value)
  }

  setViewportHeight(value: number) {
    if (this.viewportHeight() !== value) {
      this.viewportHeight.set(value)
    }
  }

  setDragOverIndex(index: number) {
    this.dragOverIndex.set(index)
  }

  clearDragOverIndex() {
    this.dragOverIndex.set(-1)
  }

  setActiveItemId(id: number | null) {
    if (this.activeItemId() === id) return
    this.activeItemId.set(id)
  }

  getFilteredItems(items: FileListItem[], filters: SearchFilters): FileListItem[] {
    const itemsHash = JSON.stringify(items.map((item) => `${item.id}_${item.name}_${item.lastModified}`))
    const filtersHash = JSON.stringify(filters)

    if (itemsHash === this.lastItemsHash && filtersHash === this.lastFiltersHash) {
      return this.cachedFilteredItems
    }

    const filtered = filterAndSortItems(items, filters)
    this.cachedFilteredItems = filtered
    this.lastItemsHash = itemsHash
    this.lastFiltersHash = filtersHash

    return filtered
  }

  getVisibleItems(
    filtered: FileListItem[],
    viewMode: ViewMode,
    itemHeight: number,
    virtualScrollTop: number,
    viewportHeight: number,
  ): VisibleFileListItem[] {
    if (viewMode === 'grid') return filtered

    const safeScrollTop = Math.max(0, virtualScrollTop)
    const startIndex = Math.floor(safeScrollTop / itemHeight)
    const endIndex = Math.min(filtered.length, startIndex + Math.ceil(viewportHeight / itemHeight) + 2)

    return filtered.slice(startIndex, endIndex).map((item, index) => ({
      ...item,
      virtualIndex: startIndex + index,
    }))
  }
}
