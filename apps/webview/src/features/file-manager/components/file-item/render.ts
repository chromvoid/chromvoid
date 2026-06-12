import {html, nothing} from 'lit'

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
  onThumbnailError: (event: Event) => void
}

export interface FileItemRenderData {
  item: FileItemData
  selected: boolean
  selectionMode: boolean
  pendingExternalOpen: boolean
  mediaActive: boolean
  mediaPlaying: boolean
  viewMode: ViewMode
  dragEnabled: 'true' | 'false'
  showSwipeActions: boolean
  thumbnailUrl: string | null
  callbacks: FileItemRenderCallbacks
}

const renderSelectionIndicator = ({selected, selectionMode}: FileItemRenderData) => {
  if (!selectionMode && !selected) return nothing

  return html`
    <div class="selection-indicator ${selected ? 'is-selected' : ''}" aria-hidden="true">
      ${selected ? html`<cv-icon name="check" size="s"></cv-icon>` : nothing}
    </div>
  `
}

const renderFileType = (item: FileItemData, fileExt: string) => {
  if (item.isDir || !fileExt) return nothing

  return html`<div class="file-type">${fileExt}</div>`
}

const renderMediaActiveSpectrum = ({mediaPlaying}: FileItemRenderData) => html`
  <span class="media-active-spectrum${mediaPlaying ? ' is-playing' : ''}" aria-hidden="true">
    <span></span>
    <span></span>
    <span></span>
  </span>
`

const renderActions = ({item, callbacks}: FileItemRenderData) => html`
  <div class="actions">
    <cv-button unstyled
      class="action-btn more"
      title=${i18n('file-manager:more')}
      button-tabindex="-1"
      @click=${callbacks.onMoreClick}
    >
      <cv-icon name="three-dots"></cv-icon>
    </cv-button>
    ${!item.isDir
      ? html`
          <cv-button unstyled
            class="action-btn"
            title=${i18n('file-manager:info')}
            button-tabindex="-1"
            @click=${callbacks.onInfoClick}
          >
            <cv-icon name="info-circle"></cv-icon>
          </cv-button>
        `
      : nothing}
    <cv-button unstyled class="action-btn" title=${i18n('action:rename')} button-tabindex="-1" @click=${callbacks.onRenameClick}>
      <cv-icon name="pencil"></cv-icon>
    </cv-button>
    ${!item.isDir
      ? html`
          <cv-button unstyled
            class="action-btn"
            title=${i18n('action:download')}
            button-tabindex="-1"
            @click=${callbacks.onDownloadClick}
          >
            <cv-icon name="download"></cv-icon>
          </cv-button>
        `
      : nothing}
    <cv-button unstyled class="action-btn" title=${i18n('action:delete')} button-tabindex="-1" @click=${callbacks.onDeleteClick}>
      <cv-icon name="trash"></cv-icon>
    </cv-button>
  </div>
`

const renderLeadingVisual = (data: FileItemRenderData, fileTypeClass: string) => {
  const {item, thumbnailUrl, callbacks} = data
  const showThumbnail = !item.isDir && thumbnailUrl !== null
  if (showThumbnail) {
    return html`
      <div class=${`thumbnail-shell drag-handle ${fileTypeClass} has-image`} aria-hidden="true">
        <img
          class="thumbnail-image"
          src=${thumbnailUrl}
          alt=""
          loading="lazy"
          decoding="async"
          @error=${callbacks.onThumbnailError}
        />
      </div>
    `
  }

  const showMediaSpectrum = data.mediaActive && !item.isDir

  return html`
    <div
      class=${`thumbnail-shell drag-handle ${fileTypeClass}${showMediaSpectrum ? ' is-media-active' : ''}`}
      aria-hidden="true"
    >
      ${showMediaSpectrum
        ? renderMediaActiveSpectrum(data)
        : html`
            <cv-icon
              class=${`icon ${fileTypeClass}`}
              name=${getFileIcon(item)}
            ></cv-icon>
          `}
    </div>
  `
}

const renderFileItemMain = (data: FileItemRenderData, actions: unknown = nothing) => {
  const {item, dragEnabled, callbacks} = data
  const fileExt = !item.isDir ? getFileExtension(item.name) : ''
  const fileTypeClass = item.isDir ? 'folder' : getFileTypeClass(item)
  const mediaClass = data.mediaActive ? ` media-active${data.mediaPlaying ? ' media-playing' : ''}` : ''

  return html`
    <div
      class=${`file-item${mediaClass}`}
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
      aria-busy=${data.pendingExternalOpen ? 'true' : 'false'}
    >
      ${renderLeadingVisual(data, fileTypeClass)}
      ${renderSelectionIndicator(data)}

      <div class="info">
        <div class="name">${item.name}</div>
        <div class="meta">${getInfoText(item)}</div>
      </div>

      ${renderFileType(item, fileExt)} ${actions}
    </div>
  `
}

const renderSwipeActions = (data: FileItemRenderData) => html`
  <div class="swipe-actions-left">
    <cv-button unstyled class="swipe-action" @click=${data.callbacks.onSwipeRename}>
      <cv-icon name="pencil"></cv-icon>
    </cv-button>
  </div>
  <div class="swipe-actions-right">
    <cv-button unstyled class="swipe-action" @click=${data.callbacks.onSwipeDelete}>
      <cv-icon name="trash"></cv-icon>
    </cv-button>
  </div>
`

export const renderFileItem = (data: FileItemRenderData) => {
  const content = renderFileItemMain(data)

  if (data.showSwipeActions) {
    return html` <div class="swipe-container">${renderSwipeActions(data)} ${content}</div> `
  }

  return content
}

export const renderDesktopFileItem = (data: FileItemRenderData) => {
  return renderFileItemMain(data, renderActions(data))
}

export const renderMobileFileItem = (data: FileItemRenderData) => {
  const content = renderFileItemMain(data)

  if (data.showSwipeActions) {
    return html` <div class="swipe-container">${renderSwipeActions(data)} ${content}</div> `
  }

  return content
}
