import {html} from 'lit'

import {i18n} from 'root/i18n'
import type {FileItemData, ViewMode} from 'root/shared/contracts/file-manager'

import {getFileExtension, getFileIcon, getFileTypeClass, getInfoText} from './utils'

interface FileItemRenderCallbacks {
  onClick: (event: Event) => void
  onDoubleClick: (event: Event) => void
  onContextMenu: (event: Event) => void
  onTouchStart: (event: TouchEvent) => void
  onTouchMove: (event: TouchEvent) => void
  onTouchEnd: (event: TouchEvent) => void
  onTouchCancel: (event: TouchEvent) => void
  onDragStart: (event: DragEvent) => void
  onDragOver: (event: DragEvent) => void
  onDragLeave: (event: DragEvent) => void
  onDrop: (event: DragEvent) => void
  onMoreClick: (event: Event) => void
  onInfoClick: (event: Event) => void
  onRenameClick: (event: Event) => void
  onDownloadClick: (event: Event) => void
  onDeleteClick: (event: Event) => void
  onSwipeRename: (event: Event) => void
  onSwipeDelete: (event: Event) => void
}

interface FileItemRenderData {
  item: FileItemData
  selected: boolean
  selectionMode: boolean
  viewMode: ViewMode
  dragEnabled: 'true' | 'false'
  showSwipeActions: boolean
  callbacks: FileItemRenderCallbacks
}

const renderFileItemMain = (data: FileItemRenderData) => {
  const {item, selected, selectionMode, dragEnabled, callbacks} = data
  const fileExt = !item.isDir ? getFileExtension(item.name) : ''
  const fileTypeClass = item.isDir ? 'folder' : getFileTypeClass(item.name)
  const showSelectionIndicator = selectionMode || selected

  return html`
    <div
      class="file-item"
      draggable=${dragEnabled}
      @click=${callbacks.onClick}
      @dblclick=${callbacks.onDoubleClick}
      @contextmenu=${callbacks.onContextMenu}
      @touchstart=${callbacks.onTouchStart}
      @touchmove=${callbacks.onTouchMove}
      @touchend=${callbacks.onTouchEnd}
      @touchcancel=${callbacks.onTouchEnd}
      @dragstart=${callbacks.onDragStart}
      @dragover=${callbacks.onDragOver}
      @dragleave=${callbacks.onDragLeave}
      @drop=${callbacks.onDrop}
    >
      <cv-icon
        class=${`icon drag-handle ${fileTypeClass}`}
        name=${getFileIcon(item.name, item.isDir)}
      ></cv-icon>

      ${showSelectionIndicator
        ? html`
            <div class="selection-indicator ${selected ? 'is-selected' : ''}" aria-hidden="true">
              ${selected ? html`<cv-icon name="check" size="s"></cv-icon>` : ''}
            </div>
          `
        : ''}

      <div class="info">
        <div class="name">${item.name}</div>
        <div class="meta">${getInfoText(item)}</div>
      </div>

      ${!item.isDir && fileExt ? html`<div class="file-type">${fileExt}</div>` : ''}

      <div class="actions">
        <button
          class="action-btn more"
          title=${i18n('file-manager:more' as any)}
          tabindex="-1"
          @click=${callbacks.onMoreClick}
        >
          <cv-icon name="three-dots"></cv-icon>
        </button>
        ${!item.isDir
          ? html`
              <button
                class="action-btn"
                title=${i18n('file-manager:info' as any)}
                tabindex="-1"
                @click=${callbacks.onInfoClick}
              >
                <cv-icon name="info-circle"></cv-icon>
              </button>
            `
          : ''}
        <button
          class="action-btn"
          title=${i18n('action:rename' as any)}
          tabindex="-1"
          @click=${callbacks.onRenameClick}
        >
          <cv-icon name="pencil"></cv-icon>
        </button>
        ${!item.isDir
          ? html`
              <button
                class="action-btn"
                title=${i18n('action:download' as any)}
                tabindex="-1"
                @click=${callbacks.onDownloadClick}
              >
                <cv-icon name="download"></cv-icon>
              </button>
            `
          : ''}
        <button
          class="action-btn"
          title=${i18n('action:delete' as any)}
          tabindex="-1"
          @click=${callbacks.onDeleteClick}
        >
          <cv-icon name="trash"></cv-icon>
        </button>
      </div>
    </div>
  `
}

const renderSwipeActions = (data: FileItemRenderData) => html`
  <div class="swipe-actions-left">
    <button class="swipe-action" @click=${data.callbacks.onSwipeRename}>
      <cv-icon name="pencil"></cv-icon>
    </button>
  </div>
  <div class="swipe-actions-right">
    <button class="swipe-action" @click=${data.callbacks.onSwipeDelete}>
      <cv-icon name="trash"></cv-icon>
    </button>
  </div>
`

export const renderFileItem = (data: FileItemRenderData) => {
  const content = renderFileItemMain(data)

  if (data.showSwipeActions) {
    return html` <div class="swipe-container">${renderSwipeActions(data)} ${content}</div> `
  }

  return content
}
