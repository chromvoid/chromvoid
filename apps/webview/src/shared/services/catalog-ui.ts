import type {FileListItem, SearchFilters} from 'root/shared/contracts/file-manager'
import {filterAndSortFileItems} from './file-list-filtering'

export class CatalogUIService {
  filterAndSort(items: FileListItem[], filters: SearchFilters): FileListItem[] {
    return filterAndSortFileItems(items, filters)
  }
}
