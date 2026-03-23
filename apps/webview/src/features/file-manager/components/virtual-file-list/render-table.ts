import {html, nothing} from 'lit'

import {i18n} from 'root/i18n'
import type {FileListItem} from 'root/shared/contracts/file-manager'

import {formatDate, formatFileSize} from './virtual-file-list.model-helpers'

export interface VirtualFileListTableSortHandlers {
  onSortName: () => void
  onSortSize: () => void
  onSortDate: () => void
}

export interface VirtualFileListTableRowHandlers {
  onRowClick: (e: Event) => void
  onRowDblClick: (e: Event) => void
  onRowContextMenu: (e: Event) => void
  onCheckboxClick: (e: Event) => void
  onMoreButtonClick: (e: Event) => void
}

export interface VirtualFileListTableProps {
  items: FileListItem[]
  filteredItems: FileListItem[]
  itemHeight: number
  virtualScrollTop: number
  viewportHeight: number
  sortBy: 'name' | 'size' | 'date'
  sortDirection: 'asc' | 'desc'
  selectedItems: number[]
  selectionMode: boolean
  onSortName: VirtualFileListTableSortHandlers['onSortName']
  onSortSize: VirtualFileListTableSortHandlers['onSortSize']
  onSortDate: VirtualFileListTableSortHandlers['onSortDate']
  onRowClick: VirtualFileListTableRowHandlers['onRowClick']
  onRowDblClick: VirtualFileListTableRowHandlers['onRowDblClick']
  onRowContextMenu: VirtualFileListTableRowHandlers['onRowContextMenu']
  onCheckboxClick: VirtualFileListTableRowHandlers['onCheckboxClick']
  onMoreButtonClick: VirtualFileListTableRowHandlers['onMoreButtonClick']
  getAriaSort: (column: 'name' | 'size' | 'date') => 'none' | 'ascending' | 'descending'
}

const renderTableRow = (item: FileListItem, params: VirtualFileListTableProps): ReturnType<typeof html> => {
  const selected = params.selectedItems.includes(item.id)

  return html`
    <div
      class="file-item-wrapper ${selected ? 'selected' : ''}"
      data-id=${item.id}
      role="row"
      aria-selected=${selected ? 'true' : 'false'}
      tabindex="-1"
      @click=${params.onRowClick}
      @dblclick=${params.onRowDblClick}
      @contextmenu=${params.onRowContextMenu}
    >
      <div role="gridcell">
        ${params.selectionMode
          ? html`
              <cv-checkbox
                class="selection-checkbox"
                ?checked=${selected}
                aria-label=${i18n('file-manager:select-item' as any, {name: item.name})}
                tabindex="-1"
                data-id=${item.id}
                @click=${params.onCheckboxClick}
              ></cv-checkbox>
            `
          : nothing}
      </div>
      <div role="gridcell" style="display: flex; align-items: center; gap: 8px;">
        <cv-icon name=${item.isDir ? 'folder-fill' : 'file-earmark-text'}></cv-icon>
        <span>${item.name}</span>
      </div>
      <div role="gridcell">${item.isDir ? '—' : formatFileSize(item.size || 0)}</div>
      <div role="gridcell">${formatDate(item.lastModified)}</div>
      <div role="gridcell">
        <cv-button
          size="small"
          variant="ghost"
          tabindex="-1"
          @click=${params.onMoreButtonClick}
          data-id=${item.id}
        >
          <cv-icon name="three-dots"></cv-icon>
        </cv-button>
      </div>
    </div>
  `
}

export const renderTableView = (params: VirtualFileListTableProps) => {
  const filtered = params.filteredItems
  const totalHeight = filtered.length * params.itemHeight
  const scrollTop = Math.max(0, params.virtualScrollTop)
  const startIndex = Math.floor(scrollTop / params.itemHeight)
  const offsetY = startIndex * params.itemHeight
  const rows = params.items.map((item) => renderTableRow(item, params))

  return html`
    <div class="table-view" role="presentation">
      <div class="table-header" role="row">
        <div class="header-cell" role="columnheader" aria-label=${i18n('file-manager:select' as any)}></div>
        <div
          class="header-cell sortable ${params.sortBy === 'name' ? 'active' : ''}"
          role="columnheader"
          aria-sort=${params.getAriaSort('name')}
          @click=${params.onSortName}
        >
          ${i18n('file-manager:name' as any)}
          ${params.sortBy === 'name'
            ? html`
                <cv-icon
                  name=${params.sortDirection === 'asc' ? 'sort-alpha-down' : 'sort-alpha-up'}
                ></cv-icon>
              `
            : ''}
        </div>
        <div
          class="header-cell sortable ${params.sortBy === 'size' ? 'active' : ''}"
          role="columnheader"
          aria-sort=${params.getAriaSort('size')}
          @click=${params.onSortSize}
        >
          ${i18n('file-manager:size' as any)}
        </div>
        <div
          class="header-cell sortable ${params.sortBy === 'date' ? 'active' : ''}"
          role="columnheader"
          aria-sort=${params.getAriaSort('date')}
          @click=${params.onSortDate}
        >
          ${i18n('file-manager:modified' as any)}
        </div>
        <div class="header-cell" role="columnheader">${i18n('file-manager:actions-header' as any)}</div>
      </div>
      <div style="height: ${totalHeight}px;">
        <div style="transform: translateY(${offsetY}px);">${rows}</div>
      </div>
    </div>
  `
}
