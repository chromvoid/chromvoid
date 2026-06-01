import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {css} from 'lit'

import type {FileItemEventType} from './file-item/handlers'

import {i18n} from 'root/i18n'
import type {FileItemData, ViewMode} from 'root/shared/contracts/file-manager'

import {fileItemStyles} from './file-item/file-item.styles'
import {
  applySwipeCloseVisual,
  applySwipeFinishVisual,
  applySwipeMoveVisual,
  emitItemClick,
  emitItemContextMenu,
  emitItemDelete,
  emitItemDoubleClick,
  emitItemDownload,
  emitItemInfo,
  emitItemMore,
  emitItemRename,
  emitSwipeAction,
  onDragLeave,
  onDragOver,
  onDragStart,
  onDrop,
  onTouchEnd,
  onTouchMove,
  onTouchStart,
  setupTouchDragDrop,
  type TouchDragDropBinding,
} from './file-item/handlers'
import type {FileItemRenderData} from './file-item/render'
import {FileItemModel} from '../models/file-item.model'

export type {FileItemData} from 'root/shared/contracts/file-manager'

export abstract class FileItemBase extends ReatomLitElement {
  static get properties() {
    return {
      item: {type: Object},
      selected: {type: Boolean, reflect: true},
      active: {type: Boolean, reflect: true},
      selectionMode: {type: Boolean, attribute: 'selection-mode', reflect: true},
      dragOver: {type: Boolean, attribute: 'drag-over', reflect: true},
      pendingExternalOpen: {type: Boolean, attribute: 'pending-external-open', reflect: true},
      mediaActive: {type: Boolean, attribute: 'media-active', reflect: true},
      mediaPlaying: {type: Boolean, attribute: 'media-playing', reflect: true},
      viewMode: {type: String, attribute: 'view-mode', reflect: true},
    }
  }

  declare item: FileItemData
  declare selected: boolean
  declare active: boolean
  declare selectionMode: boolean
  declare dragOver: boolean
  declare pendingExternalOpen: boolean
  declare mediaActive: boolean
  declare mediaPlaying: boolean
  declare viewMode: ViewMode

  static styles = [
    fileItemStyles,
    css`
      .missing-item {
        padding: 12px;
        color: var(--cv-color-danger);
        border: 1px solid var(--cv-color-danger);
      }
    `,
  ]

  protected readonly model = new FileItemModel()
  protected touchDropBinding?: TouchDragDropBinding

  constructor() {
    super()
    this.selected = false
    this.active = false
    this.selectionMode = false
    this.dragOver = false
    this.pendingExternalOpen = false
    this.mediaActive = false
    this.mediaPlaying = false
    this.viewMode = 'list'
  }

  protected get dragEnabled(): boolean {
    return true
  }

  protected get showSwipeActions(): boolean {
    return false
  }

  protected emitEvent = <T>(type: string, detail: T, composed = false) => {
    this.dispatchEvent(new CustomEvent(type, {detail, bubbles: true, composed}))
  }

  protected readonly onClick = (event: Event) => {
    emitItemClick(this.model, this.item, this.emitEvent, event)
  }

  protected readonly onDoubleClick = (event: Event) => {
    emitItemDoubleClick(this.item, this.emitEvent, event)
  }

  protected readonly onContextMenu = (event: Event) => {
    emitItemContextMenu(this.item, this.emitEvent, event)
  }

  protected readonly onMore = (event: Event) => {
    emitItemMore(this.item, this.emitEvent, event)
  }

  protected readonly onInfo = (event: Event) => {
    emitItemInfo(this.item, this.emitEvent, event)
  }

  protected readonly onRename = (event: Event) => {
    emitItemRename(this.item, this.emitEvent, event)
  }

  protected readonly onDownload = (event: Event) => {
    emitItemDownload(this.item, this.emitEvent, event)
  }

  protected readonly onDelete = (event: Event) => {
    emitItemDelete(this.item, this.emitEvent, event)
  }

  protected readonly onSwipeRename = (event: Event) => {
    emitSwipeAction(this.item, 'rename', this.emitEvent, event)
    this.model.closeSwipe()
    applySwipeCloseVisual(this.shadowRoot)
  }

  protected readonly onSwipeDelete = (event: Event) => {
    emitSwipeAction(this.item, 'delete', this.emitEvent, event)
    this.model.closeSwipe()
    applySwipeCloseVisual(this.shadowRoot)
  }

  protected readonly onTouchStart = (event: TouchEvent) => {
    onTouchStart(this.model, this.item, this.emitEvent, event)
  }

  protected readonly onTouchMove = (event: TouchEvent) => {
    const state = onTouchMove(this.model, event, this.viewMode)
    if (!state) return
    if (state.preventDefault) {
      event.preventDefault()
    }
    applySwipeMoveVisual(this.shadowRoot, state.offset)
  }

  protected readonly onTouchEnd = () => {
    const state = onTouchEnd(this.model)
    if (!state) return
    applySwipeFinishVisual(this.shadowRoot, state)
    if (state.emitSwipeOpen) {
      this.emitEvent('swipe-open', undefined, true)
    }
  }

  protected readonly onDragStart = (event: DragEvent) => {
    onDragStart(this.item, event)
  }

  protected readonly onDragOver = (event: DragEvent) => {
    onDragOver(
      this.item,
      (value) => {
        this.dragOver = value
      },
      event,
    )
  }

  protected readonly onDragLeave = () => {
    onDragLeave((value) => {
      this.dragOver = value
    })
  }

  protected readonly onDrop = (event: DragEvent) => {
    onDrop(this.item, this.emitItemDropEvent, event)
  }

  protected onThumbnailError(event: Event) {
    const image = event.currentTarget as HTMLImageElement | null
    this.model.handleThumbnailRenderError(image?.currentSrc || image?.src || null)
  }

  protected readonly emitItemDropEvent: <T>(type: FileItemEventType, detail: T, _composed?: boolean) => void =
    <T>(type: FileItemEventType, detail: T) => {
      this.emitEvent(type, detail)
    }

  closeSwipe() {
    if (!this.model.closeSwipe()) return
    applySwipeCloseVisual(this.shadowRoot)
  }

  protected setupTouchDragDrop() {
    const dragHandle = this.shadowRoot?.querySelector('.drag-handle') as HTMLElement | null
    if (!dragHandle) return

    this.touchDropBinding = setupTouchDragDrop({
      item: this.item,
      dragHandle,
      model: this.model,
      onTouchDragStateChange: (value) => {
        this.classList.toggle('touch-dragging', value)
      },
    })
  }

  connectedCallback() {
    super.connectedCallback()
    this.setupTouchDragDrop()
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this.touchDropBinding?.destroy()
    this.touchDropBinding = undefined
    this.model.dispose()
  }

  protected abstract renderItem(data: FileItemRenderData): unknown

  override willUpdate(changedProperties: Map<string, unknown>) {
    super.willUpdate(changedProperties)
    if (changedProperties.has('item') || changedProperties.has('viewMode')) {
      this.model.setThumbnailTarget(this.item, this.viewMode)
    }
  }

  render() {
    if (!this.item) {
      return html`<div class="missing-item">${i18n('file-manager:file-item-missing')}</div>`
    }

    return this.renderItem({
      item: this.item,
      selected: this.selected,
      selectionMode: this.selectionMode,
      pendingExternalOpen: this.pendingExternalOpen,
      mediaActive: this.mediaActive,
      mediaPlaying: this.mediaPlaying,
      viewMode: this.viewMode,
      dragEnabled: this.dragEnabled ? 'true' : 'false',
      showSwipeActions: this.showSwipeActions,
      thumbnailUrl: this.model.thumbnailUrl(),
      callbacks: {
        onClick: this.onClick,
        onDoubleClick: this.onDoubleClick,
        onContextMenu: this.onContextMenu,
        onTouchStart: this.onTouchStart,
        onTouchMove: this.onTouchMove,
        onTouchEnd: this.onTouchEnd,
        onTouchCancel: this.onTouchEnd,
        onDragStart: this.onDragStart,
        onDragOver: this.onDragOver,
        onDragLeave: this.onDragLeave,
        onDrop: this.onDrop,
        onMoreClick: this.onMore,
        onInfoClick: this.onInfo,
        onRenameClick: this.onRename,
        onDownloadClick: this.onDownload,
        onDeleteClick: this.onDelete,
        onSwipeRename: this.onSwipeRename,
        onSwipeDelete: this.onSwipeDelete,
        onThumbnailError: this.onThumbnailError,
      },
    })
  }
}
