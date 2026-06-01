import {atom, computed} from '@reatom/core'

import {
  isRealFileListItem,
  type FileListItem,
  type FileListRenderItem,
  type SearchFilters,
} from 'root/shared/contracts/file-manager'

import {filterAndSortItems} from '../components/virtual-file-list/virtual-file-list.model-helpers'

const DEFAULT_FILTERS: SearchFilters = {
  query: '',
  sortBy: 'name',
  sortDirection: 'asc',
  viewMode: 'list',
  showHidden: true,
  fileTypes: [],
}

export class VirtualFileListDataModel {
  readonly items = atom<readonly FileListRenderItem[]>([], 'file.virtualList.items')
  readonly filters = atom<SearchFilters>(DEFAULT_FILTERS, 'file.virtualList.filters')
  readonly itemsPreFiltered = atom(false, 'file.virtualList.itemsPreFiltered')

  readonly filteredItems = computed<FileListRenderItem[]>(() => {
    const items = this.items()
    if (this.itemsPreFiltered()) {
      return [...items]
    }
    return filterAndSortItems(items.filter(isRealFileListItem), this.filters())
  }, 'file.virtualList.filteredItems')

  readonly actionItems = computed<FileListItem[]>(() => {
    return this.filteredItems().filter(isRealFileListItem)
  }, 'file.virtualList.actionItems')

  setInputs(
    items: readonly FileListRenderItem[],
    filters: SearchFilters,
    itemsPreFiltered: boolean,
  ): void {
    if (this.items() !== items) {
      this.items.set(items)
    }
    if (this.filters() !== filters) {
      this.filters.set(filters)
    }
    if (this.itemsPreFiltered() !== itemsPreFiltered) {
      this.itemsPreFiltered.set(itemsPreFiltered)
    }
  }

  getFilteredItems(
    items: readonly FileListRenderItem[],
    filters: SearchFilters,
    itemsPreFiltered = false,
  ): FileListRenderItem[] {
    this.setInputs(items, filters, itemsPreFiltered)
    return this.filteredItems()
  }
}
