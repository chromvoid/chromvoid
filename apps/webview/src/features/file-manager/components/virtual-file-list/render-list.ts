import {html, nothing} from 'lit'
import {repeat} from 'lit/directives/repeat.js'

import {
  isFileListPlaceholderItem,
  type FileListItem,
  type FileListVisibleItem,
  type ViewMode,
} from 'root/shared/contracts/file-manager'

export interface VirtualFileListItemCallbacks {
  onFileItemClick: (event: CustomEvent) => void
  onFileItemDoubleClick: (event: CustomEvent) => void
  onFileItemContextMenu: (event: CustomEvent) => void
  onFileItemRename: (event: CustomEvent) => void
  onFileItemDownload: (event: CustomEvent) => void
  onFileItemDelete: (event: CustomEvent) => void
  onFileItemInfo: (event: CustomEvent) => void
  onDeleteExitAnimationEnd: (event: AnimationEvent, id: number) => void
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
  item: FileListVisibleItem
  mobile: boolean
  selected: boolean
  active: boolean
  selectionMode: boolean
  pendingExternalOpen: boolean
  deleteExiting: boolean
  mediaActive?: boolean
  mediaPlaying?: boolean
  viewMode: ViewMode
  callbacks: VirtualFileListItemCallbacks
}

export const renderFilePlaceholder = (item: FileListVisibleItem, viewMode: ViewMode) => html`
  <div
    class="file-item-skeleton file-item-skeleton-${viewMode}"
    role=${viewMode === 'table' ? 'row' : 'option'}
    aria-disabled="true"
    data-placeholder=${isFileListPlaceholderItem(item) ? item.placeholderKey : ''}
  >
    <span class="skeleton-icon"></span>
    <span class="skeleton-lines">
      <span></span>
      <span></span>
    </span>
  </div>
`

export const renderFileItem = ({
  item,
  mobile,
  selected,
  active,
  selectionMode,
  pendingExternalOpen,
  deleteExiting,
  mediaActive = false,
  mediaPlaying = false,
  viewMode,
  callbacks,
}: RenderFileItemOptions) => {
  if (isFileListPlaceholderItem(item)) {
    return renderFilePlaceholder(item, viewMode)
  }

  const role = viewMode === 'list' || viewMode === 'grid' ? 'option' : undefined

  if (mobile) {
    return html`
      <file-item-mobile
        id=${`file-option-${item.id}`}
        .item=${item}
        .selected=${selected}
        .active=${active}
        .selectionMode=${selectionMode}
        .pendingExternalOpen=${pendingExternalOpen}
        .mediaActive=${mediaActive}
        .mediaPlaying=${mediaPlaying}
        .viewMode=${viewMode}
        role=${role ?? ''}
        aria-selected=${selected ? 'true' : 'false'}
        tabindex="-1"
        data-id=${item.id}
        ?data-delete-exiting=${deleteExiting}
        aria-hidden=${deleteExiting ? 'true' : nothing}
        data-mobile-dnd-target-id=${item.isDir ? item.path : nothing}
        @item-click=${callbacks.onFileItemClick}
        @item-double-click=${callbacks.onFileItemDoubleClick}
        @item-context-menu=${callbacks.onFileItemContextMenu}
        @item-info=${callbacks.onFileItemInfo}
        @item-rename=${callbacks.onFileItemRename}
        @item-download=${callbacks.onFileItemDownload}
        @item-delete=${callbacks.onFileItemDelete}
        @animationend=${deleteExiting
          ? (event: AnimationEvent) => callbacks.onDeleteExitAnimationEnd(event, item.id)
          : undefined}
        @item-drop=${callbacks.onFileItemDrop}
        @touchstart=${(event: TouchEvent) => callbacks.onTouchStart(event, item)}
        @touchmove=${callbacks.onTouchMove}
        @touchend=${callbacks.onTouchEnd}
        @touchcancel=${callbacks.onTouchEnd}
        @dragstart=${callbacks.onDragStart}
        @dragover=${callbacks.onDragOver}
        @dragleave=${callbacks.onDragLeave}
        @drop=${callbacks.onDrop}
      ></file-item-mobile>
    `
  }

  return html`
    <file-item-desktop
      id=${`file-option-${item.id}`}
      .item=${item}
      .selected=${selected}
      .active=${active}
      .selectionMode=${selectionMode}
      .pendingExternalOpen=${pendingExternalOpen}
      .mediaActive=${mediaActive}
      .mediaPlaying=${mediaPlaying}
      .viewMode=${viewMode}
      role=${role ?? ''}
      aria-selected=${selected ? 'true' : 'false'}
      tabindex="-1"
      data-id=${item.id}
      ?data-delete-exiting=${deleteExiting}
      aria-hidden=${deleteExiting ? 'true' : nothing}
      data-mobile-dnd-target-id=${item.isDir ? item.path : nothing}
      @item-click=${callbacks.onFileItemClick}
      @item-double-click=${callbacks.onFileItemDoubleClick}
      @item-context-menu=${callbacks.onFileItemContextMenu}
      @item-info=${callbacks.onFileItemInfo}
      @item-rename=${callbacks.onFileItemRename}
      @item-download=${callbacks.onFileItemDownload}
      @item-delete=${callbacks.onFileItemDelete}
      @animationend=${deleteExiting
        ? (event: AnimationEvent) => callbacks.onDeleteExitAnimationEnd(event, item.id)
        : undefined}
      @item-drop=${callbacks.onFileItemDrop}
      @touchstart=${(event: TouchEvent) => callbacks.onTouchStart(event, item)}
      @touchmove=${callbacks.onTouchMove}
      @touchend=${callbacks.onTouchEnd}
      @touchcancel=${callbacks.onTouchEnd}
      @dragstart=${callbacks.onDragStart}
      @dragover=${callbacks.onDragOver}
      @dragleave=${callbacks.onDragLeave}
      @drop=${callbacks.onDrop}
    ></file-item-desktop>
  `
}

interface RenderListViewParams {
  items: FileListVisibleItem[]
  totalItemsCount: number
  mobile: boolean
  itemHeight: number
  virtualScrollTop: number
  selectedItems: number[]
  pendingExternalOpenIds?: number[]
  mediaActiveItemId?: number | null
  mediaPlaying?: boolean
  selectionMode: boolean
  activeItemId: number | null
  viewMode: ViewMode
  callbacks: VirtualFileListItemCallbacks
}

export const renderListView = ({
  items,
  totalItemsCount,
  mobile,
  itemHeight,
  virtualScrollTop,
  selectedItems,
  pendingExternalOpenIds = [],
  mediaActiveItemId = null,
  mediaPlaying = false,
  selectionMode,
  activeItemId,
  viewMode,
  callbacks,
}: RenderListViewParams) => {
  const scrollTop = Math.max(0, virtualScrollTop)
  const startIndex = Math.floor(scrollTop / itemHeight)
  const totalHeight = Math.max(0, totalItemsCount * itemHeight)
  const offsetY = startIndex * itemHeight

  const renderItem = (item: FileListVisibleItem) => {
    if (isFileListPlaceholderItem(item)) {
      return renderFileItem({
        item,
        mobile,
        selected: false,
        active: false,
        selectionMode,
        pendingExternalOpen: false,
        deleteExiting: false,
        mediaActive: false,
        mediaPlaying: false,
        viewMode,
        callbacks,
      })
    }

    return renderFileItem({
      item,
      mobile,
      selected: selectedItems.includes(item.id),
      active: activeItemId === item.id,
      selectionMode,
      pendingExternalOpen: pendingExternalOpenIds.includes(item.id),
      deleteExiting: item.deleteExiting === true,
      mediaActive: mediaActiveItemId === item.id,
      mediaPlaying: mediaPlaying && mediaActiveItemId === item.id,
      viewMode,
      callbacks,
    })
  }

  return html`
    <div class="list-view">
      <div class="virtual-spacer" data-total-height=${String(totalHeight)}>
        <div class="virtual-window" data-offset-y=${String(offsetY)}>
          ${repeat(
            items,
            (item) => (isFileListPlaceholderItem(item) ? item.placeholderKey : item.id),
            renderItem,
          )}
        </div>
      </div>
    </div>
  `
}
