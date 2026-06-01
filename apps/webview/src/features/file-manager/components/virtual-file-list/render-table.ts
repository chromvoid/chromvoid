import {html, nothing} from 'lit'
import {repeat} from 'lit/directives/repeat.js'

import {i18n} from 'root/i18n'
import {
  isFileListPlaceholderItem,
  type FileListItem,
  type FileListRenderItem,
  type FileListVisibleItem,
} from 'root/shared/contracts/file-manager'

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
  onDeleteExitAnimationEnd: (event: AnimationEvent, id: number) => void
}

export interface VirtualFileListTableProps {
  items: FileListVisibleItem[]
  filteredItems: FileListRenderItem[]
  totalItemsCount: number
  itemHeight: number
  virtualScrollTop: number
  viewportHeight: number
  sortBy: 'name' | 'size' | 'date'
  sortDirection: 'asc' | 'desc'
  selectedItems: number[]
  pendingExternalOpenIds: number[]
  selectionMode: boolean
  onSortName: VirtualFileListTableSortHandlers['onSortName']
  onSortSize: VirtualFileListTableSortHandlers['onSortSize']
  onSortDate: VirtualFileListTableSortHandlers['onSortDate']
  onRowClick: VirtualFileListTableRowHandlers['onRowClick']
  onRowDblClick: VirtualFileListTableRowHandlers['onRowDblClick']
  onRowContextMenu: VirtualFileListTableRowHandlers['onRowContextMenu']
  onCheckboxClick: VirtualFileListTableRowHandlers['onCheckboxClick']
  onMoreButtonClick: VirtualFileListTableRowHandlers['onMoreButtonClick']
  onDeleteExitAnimationEnd: VirtualFileListTableRowHandlers['onDeleteExitAnimationEnd']
  getAriaSort: (column: 'name' | 'size' | 'date') => 'none' | 'ascending' | 'descending'
}

const renderTablePlaceholderRow = (item: FileListVisibleItem): ReturnType<typeof html> => html`
  <div
    class="file-item-wrapper file-item-skeleton file-item-skeleton-table"
    role="row"
    aria-disabled="true"
    data-placeholder=${isFileListPlaceholderItem(item) ? item.placeholderKey : ''}
  >
    <div role="gridcell"></div>
    <div role="gridcell" class="table-primary-cell">
      <span class="skeleton-icon"></span>
      <span class="skeleton-lines">
        <span></span>
        <span></span>
      </span>
    </div>
    <div role="gridcell"><span class="skeleton-cell"></span></div>
    <div role="gridcell"><span class="skeleton-cell"></span></div>
    <div role="gridcell"></div>
  </div>
`

const renderTableRow = (item: FileListVisibleItem, params: VirtualFileListTableProps): ReturnType<typeof html> => {
  if (isFileListPlaceholderItem(item)) {
    return renderTablePlaceholderRow(item)
  }

  const selected = params.selectedItems.includes(item.id)
  const pendingExternalOpen = params.pendingExternalOpenIds.includes(item.id)
  const deleteExiting = item.deleteExiting === true

  return html`
    <div
      class="file-item-wrapper ${selected ? 'selected' : ''}"
      data-id=${item.id}
      ?data-delete-exiting=${deleteExiting}
      role="row"
      aria-selected=${selected ? 'true' : 'false'}
      aria-busy=${pendingExternalOpen ? 'true' : 'false'}
      aria-hidden=${deleteExiting ? 'true' : nothing}
      tabindex="-1"
      @click=${params.onRowClick}
      @dblclick=${params.onRowDblClick}
      @contextmenu=${params.onRowContextMenu}
      @animationend=${deleteExiting
        ? (event: AnimationEvent) => params.onDeleteExitAnimationEnd(event, item.id)
        : undefined}
    >
      <div role="gridcell">
        ${params.selectionMode
          ? html`
              <cv-checkbox
                class="selection-checkbox"
                ?checked=${selected}
                aria-label=${i18n('file-manager:select-item', {name: item.name})}
                tabindex="-1"
                data-id=${item.id}
                @click=${params.onCheckboxClick}
              ></cv-checkbox>
            `
          : nothing}
      </div>
      <div role="gridcell" class="table-primary-cell">
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
  const totalHeight = params.totalItemsCount * params.itemHeight
  const scrollTop = Math.max(0, params.virtualScrollTop)
  const startIndex = Math.floor(scrollTop / params.itemHeight)
  const offsetY = startIndex * params.itemHeight
  const rows = repeat(
    params.items,
    (item) => (isFileListPlaceholderItem(item) ? item.placeholderKey : item.id),
    (item) => renderTableRow(item, params),
  )

  return html`
    <div class="table-view" role="presentation">
      <div class="table-header" role="row">
        <div class="header-cell" role="columnheader" aria-label=${i18n('file-manager:select')}></div>
        <div
          class="header-cell sortable ${params.sortBy === 'name' ? 'active' : ''}"
          role="columnheader"
          aria-sort=${params.getAriaSort('name')}
          @click=${params.onSortName}
        >
          ${i18n('file-manager:name')}
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
          ${i18n('file-manager:size')}
        </div>
        <div
          class="header-cell sortable ${params.sortBy === 'date' ? 'active' : ''}"
          role="columnheader"
          aria-sort=${params.getAriaSort('date')}
          @click=${params.onSortDate}
        >
          ${i18n('file-manager:modified')}
        </div>
        <div class="header-cell" role="columnheader">${i18n('file-manager:actions-header')}</div>
      </div>
      <div class="virtual-spacer" data-total-height=${String(totalHeight)}>
        <div class="virtual-window" data-offset-y=${String(offsetY)}>${rows}</div>
      </div>
    </div>
  `
}
