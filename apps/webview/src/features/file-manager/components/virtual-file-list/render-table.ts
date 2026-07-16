import {html, nothing} from 'lit'
import {repeat} from 'lit/directives/repeat.js'

import {i18n} from 'root/i18n'
import {
  isFileListPlaceholderItem,
  isRealFileListItem,
  type FileListRenderItem,
  type FileListVisibleItem,
  type SortOption,
} from 'root/shared/contracts/file-manager'

import {getFileIcon, getFileTableTypeLabel, getFileTypeClass, isDotfile} from '../file-item/utils'
import {formatDate, formatFileSize} from './virtual-file-list.model-helpers'

export interface VirtualFileListTableSortHandlers {
  onSortName: () => void
  onSortType: () => void
  onSortSize: () => void
  onSortDate: () => void
}

export interface VirtualFileListTableRowHandlers {
  onSelectAll: (event: Event) => void
  onRowClick: (event: Event) => void
  onRowDblClick: (event: Event) => void
  onRowContextMenu: (event: Event) => void
  onCheckboxClick: (event: Event) => void
  onInfoButtonClick: (event: Event) => void
  onMoreButtonClick: (event: Event) => void
  onDeleteExitAnimationEnd: (event: AnimationEvent, id: number) => void
}

export interface VirtualFileListTableProps {
  items: FileListVisibleItem[]
  filteredItems: FileListRenderItem[]
  totalItemsCount: number
  itemHeight: number
  virtualScrollTop: number
  viewportHeight: number
  sortBy: SortOption
  sortDirection: 'asc' | 'desc'
  selectedItems: number[]
  pendingExternalOpenIds: number[]
  selectionMode: boolean
  activeItemId: number | null
  onSortName: VirtualFileListTableSortHandlers['onSortName']
  onSortType: VirtualFileListTableSortHandlers['onSortType']
  onSortSize: VirtualFileListTableSortHandlers['onSortSize']
  onSortDate: VirtualFileListTableSortHandlers['onSortDate']
  onSelectAll: VirtualFileListTableRowHandlers['onSelectAll']
  onRowClick: VirtualFileListTableRowHandlers['onRowClick']
  onRowDblClick: VirtualFileListTableRowHandlers['onRowDblClick']
  onRowContextMenu: VirtualFileListTableRowHandlers['onRowContextMenu']
  onCheckboxClick: VirtualFileListTableRowHandlers['onCheckboxClick']
  onInfoButtonClick: VirtualFileListTableRowHandlers['onInfoButtonClick']
  onMoreButtonClick: VirtualFileListTableRowHandlers['onMoreButtonClick']
  onDeleteExitAnimationEnd: VirtualFileListTableRowHandlers['onDeleteExitAnimationEnd']
  getAriaSort: (column: SortOption) => 'none' | 'ascending' | 'descending'
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
    <div role="gridcell"><span class="skeleton-cell"></span></div>
    <div role="gridcell"></div>
  </div>
`

const renderTableRow = (
  item: FileListVisibleItem,
  params: VirtualFileListTableProps,
): ReturnType<typeof html> => {
  if (isFileListPlaceholderItem(item)) {
    return renderTablePlaceholderRow(item)
  }

  const selected = params.selectedItems.includes(item.id)
  const active = params.activeItemId === item.id
  const pendingExternalOpen = params.pendingExternalOpenIds.includes(item.id)
  const deleteExiting = item.deleteExiting === true
  const typeLabel = getFileTableTypeLabel(item)

  return html`
    <div
      id=${`file-option-${item.id}`}
      class="file-item-wrapper${selected ? ' selected' : ''}${active ? ' active' : ''}"
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
      <div class="table-selection-cell" role="gridcell">
        <cv-checkbox
          class="selection-checkbox"
          ?checked=${selected}
          aria-label=${i18n('file-manager:select-item', {name: item.name})}
          tabindex="-1"
          data-id=${item.id}
          @click=${params.onCheckboxClick}
        ></cv-checkbox>
      </div>
      <div role="gridcell" class="table-primary-cell">
        <cv-icon
          class=${`table-file-icon ${item.isDir ? 'folder' : getFileTypeClass(item)}`}
          name=${getFileIcon(item)}
        ></cv-icon>
        <span class="table-file-name" title=${item.name}><bdi dir="auto">${item.name}</bdi></span>
        ${isDotfile(item)
          ? html`
              <span class="hidden-badge" title=${i18n('file-manager:hidden-files')}>
                ${i18n('file-manager:hidden-files')}
              </span>
            `
          : nothing}
        ${pendingExternalOpen
          ? html`
              <span class="table-open-status" role="status">
                <cv-spinner size="xs" aria-hidden="true"></cv-spinner>
                <span>${i18n('file-manager:preparing-file')}</span>
              </span>
            `
          : nothing}
      </div>
      <div role="gridcell" class="table-type-cell" title=${typeLabel}>
        <bdi dir=${item.isDir ? 'auto' : 'ltr'}>${typeLabel}</bdi>
      </div>
      <div role="gridcell" class="table-size-cell">
        <bdi dir="ltr">${item.isDir ? '—' : formatFileSize(item.size || 0)}</bdi>
      </div>
      <div role="gridcell" class="table-date-cell"><bdi dir="ltr">${formatDate(item.lastModified)}</bdi></div>
      <div role="gridcell" class="table-actions">
        <cv-button
          unstyled
          class="table-action-button table-info-button"
          title=${i18n('file-manager:info')}
          button-tabindex="-1"
          @click=${params.onInfoButtonClick}
          data-id=${item.id}
        >
          <cv-icon name="info-circle"></cv-icon>
        </cv-button>
        <cv-button
          unstyled
          class="table-action-button"
          title=${i18n('file-manager:more')}
          button-tabindex="-1"
          @click=${params.onMoreButtonClick}
          data-id=${item.id}
        >
          <cv-icon name="three-dots"></cv-icon>
        </cv-button>
      </div>
    </div>
  `
}

const renderSortHeader = (
  params: VirtualFileListTableProps,
  column: SortOption,
  label: string,
  onSort: () => void,
) => html`
  <div
    class="header-cell sortable${params.sortBy === column ? ' active' : ''}"
    role="columnheader"
    aria-sort=${params.getAriaSort(column)}
  >
    <button class="table-sort-button" type="button" @click=${onSort}>
      <span>${label}</span>
      ${params.sortBy === column
        ? html`<cv-icon name=${params.sortDirection === 'asc' ? 'chevron-up' : 'chevron-down'}></cv-icon>`
        : nothing}
    </button>
  </div>
`

export const renderTableView = (params: VirtualFileListTableProps) => {
  const totalHeight = params.totalItemsCount * params.itemHeight
  const scrollTop = Math.max(0, params.virtualScrollTop)
  const startIndex = Math.floor(scrollTop / params.itemHeight)
  const offsetY = startIndex * params.itemHeight
  const selectableItems = params.filteredItems.filter(isRealFileListItem)
  const selected = new Set(params.selectedItems)
  const selectedVisibleCount = selectableItems.reduce(
    (count, item) => count + (selected.has(item.id) ? 1 : 0),
    0,
  )
  const allSelected = selectableItems.length > 0 && selectedVisibleCount === selectableItems.length
  const partiallySelected = selectedVisibleCount > 0 && !allSelected
  const rows = repeat(
    params.items,
    (item) => (isFileListPlaceholderItem(item) ? item.placeholderKey : item.id),
    (item) => renderTableRow(item, params),
  )

  return html`
    <div class="table-view" role="presentation" data-selection-mode=${String(params.selectionMode)}>
      <div class="table-header" role="row">
        <div class="header-cell table-selection-cell" role="columnheader">
          <cv-checkbox
            class="table-select-all"
            ?checked=${allSelected}
            .indeterminate=${partiallySelected}
            aria-label=${i18n('file-manager:select')}
            title=${i18n('file-manager:select')}
            @click=${params.onSelectAll}
          ></cv-checkbox>
        </div>
        ${renderSortHeader(params, 'name', i18n('file-manager:name'), params.onSortName)}
        ${renderSortHeader(params, 'type', i18n('file-manager:type'), params.onSortType)}
        ${renderSortHeader(params, 'size', i18n('file-manager:size'), params.onSortSize)}
        ${renderSortHeader(params, 'date', i18n('file-manager:modified'), params.onSortDate)}
        <div
          class="header-cell table-actions-header"
          role="columnheader"
          aria-label=${i18n('file-manager:actions-header')}
        ></div>
      </div>
      <div class="virtual-spacer" data-total-height=${String(totalHeight)}>
        <div class="virtual-window" data-offset-y=${String(offsetY)}>${rows}</div>
      </div>
    </div>
  `
}
