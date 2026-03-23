import {html} from 'lit'

import type {FileListItem, ViewMode} from 'root/shared/contracts/file-manager'

export interface VirtualFileListItemCallbacks {
  onFileItemClick: (event: CustomEvent) => void
  onFileItemDoubleClick: (event: CustomEvent) => void
  onFileItemContextMenu: (event: CustomEvent) => void
  onFileItemRename: (event: CustomEvent) => void
  onFileItemDownload: (event: CustomEvent) => void
  onFileItemDelete: (event: CustomEvent) => void
  onFileItemInfo: (event: CustomEvent) => void
  onFileItemDrop: (event: Event) => void
  onTouchStart: (event: TouchEvent, item: FileListItem) => void
  onTouchMove: (event: TouchEvent) => void
  onTouchEnd: (event: TouchEvent) => void
  onTouchCancel: (event: TouchEvent) => void
  onDragStart: (event: DragEvent) => void
  onDragOver: (event: DragEvent) => void
  onDragLeave: (event: DragEvent) => void
  onDrop: (event: DragEvent) => void
}

interface RenderFileItemOptions {
  item: FileListItem
  selected: boolean
  active: boolean
  selectionMode: boolean
  viewMode: ViewMode
  callbacks: VirtualFileListItemCallbacks
}

export const renderFileItem = ({
  item,
  selected,
  active,
  selectionMode,
  viewMode,
  callbacks,
}: RenderFileItemOptions) => {
  const role = viewMode === 'list' || viewMode === 'grid' ? 'option' : undefined

  return html`
    <file-item
      id=${`file-option-${item.id}`}
      .item=${item}
      .selected=${selected}
      .active=${active}
      .selectionMode=${selectionMode}
      .viewMode=${viewMode}
      role=${role ?? ''}
      aria-selected=${selected ? 'true' : 'false'}
      tabindex="-1"
      data-id=${item.id}
      @item-click=${callbacks.onFileItemClick}
      @item-double-click=${callbacks.onFileItemDoubleClick}
      @item-context-menu=${callbacks.onFileItemContextMenu}
      @item-info=${callbacks.onFileItemInfo}
      @item-rename=${callbacks.onFileItemRename}
      @item-download=${callbacks.onFileItemDownload}
      @item-delete=${callbacks.onFileItemDelete}
      @item-drop=${callbacks.onFileItemDrop}
      @touchstart=${(event: TouchEvent) => callbacks.onTouchStart(event, item)}
      @touchmove=${callbacks.onTouchMove}
      @touchend=${callbacks.onTouchEnd}
      @touchcancel=${callbacks.onTouchEnd}
      @dragstart=${callbacks.onDragStart}
      @dragover=${callbacks.onDragOver}
      @dragleave=${callbacks.onDragLeave}
      @drop=${callbacks.onDrop}
    ></file-item>
  `
}

interface RenderListViewParams {
  items: FileListItem[]
  itemHeight: number
  virtualScrollTop: number
  selectedItems: number[]
  selectionMode: boolean
  activeItemId: number | null
  viewMode: ViewMode
  callbacks: VirtualFileListItemCallbacks
}

export const renderListView = ({
  items,
  itemHeight,
  virtualScrollTop,
  selectedItems,
  selectionMode,
  activeItemId,
  viewMode,
  callbacks,
}: RenderListViewParams) => {
  const scrollTop = Math.max(0, virtualScrollTop)
  const startIndex = Math.floor(scrollTop / itemHeight)
  const totalHeight = Math.max(0, items.length * itemHeight)
  const offsetY = startIndex * itemHeight

  const renderItem = (item: FileListItem) =>
    renderFileItem({
      item,
      selected: selectedItems.includes(item.id),
      active: activeItemId === item.id,
      selectionMode,
      viewMode,
      callbacks,
    })

  return html`
    <div class="list-view">
      <div style="height: ${totalHeight}px;">
        <div style="transform: translateY(${offsetY}px);">${items.map(renderItem)}</div>
      </div>
    </div>
  `
}
