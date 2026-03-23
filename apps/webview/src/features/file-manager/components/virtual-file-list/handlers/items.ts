import type {FileListItem} from 'root/shared/contracts/file-manager'
import {
  getEventFromDetail,
  getItemFromDetail,
  handleItemSelect,
  isMacCtrlClick,
  isTouchActivationForItem,
} from './utils'
import type {
  VirtualFileListPointerState,
  VirtualFileListSelectionState,
  VirtualFileListHandlerContext,
} from './types'

export interface VirtualFileListItemHandlers {
  onFileItemClick: (e: CustomEvent) => void
  onFileItemDoubleClick: (e: CustomEvent) => void
  onFileItemContextMenu: (e: CustomEvent) => void
  onFileItemRename: (e: CustomEvent) => void
  onFileItemDownload: (e: CustomEvent) => void
  onFileItemDelete: (e: CustomEvent) => void
  onFileItemInfo: (e: CustomEvent) => void
  onTableRowClick: (e: Event) => void
  onTableRowDblClick: (e: Event) => void
  onTableRowContextMenu: (e: Event) => void
  onMoreButtonClick: (e: Event) => void
  onTableCheckboxClick: (e: Event) => void
  onContainerBackgroundClick: (e: MouseEvent) => void
  onItemDrop: (e: Event) => void
}

export interface VirtualFileListItemHandlersDeps {
  pointerState: VirtualFileListPointerState
  selectionState: VirtualFileListSelectionState
  context: VirtualFileListHandlerContext
  focusItemById: (id: number) => void
  getItems: () => FileListItem[]
  emitItemAction: (action: string, item?: FileListItem, event?: Event, source?: FileListItem, target?: FileListItem) => void
}

export const createItemHandlers = (deps: VirtualFileListItemHandlersDeps): VirtualFileListItemHandlers => {
  const {
    pointerState,
    selectionState,
    context,
    focusItemById,
    getItems,
    emitItemAction,
  } = deps

  return {
    onFileItemClick: (e: CustomEvent) => {
      const item = getItemFromDetail(e.detail)
      const rawEvent = getEventFromDetail(e.detail) ?? e
      const mouse = rawEvent as MouseEvent
      if (!item) return
      if (pointerState.lastLongPressItemId === item.id && Date.now() - pointerState.lastLongPressAtMs < 900) {
        pointerState.lastLongPressItemId = null
        return
      }
      if (isMacCtrlClick(mouse)) return
      if (mouse.shiftKey || mouse.ctrlKey || mouse.metaKey) {
        handleItemSelect(context, selectionState, item, mouse)
      } else if (context.isSelectionMode()) {
        const fakeMouse = {ctrlKey: true, metaKey: false, shiftKey: false} as MouseEvent
        handleItemSelect(context, selectionState, item, fakeMouse)
      } else if (isTouchActivationForItem(pointerState, item.id)) {
        emitItemAction('open', item, rawEvent)
        focusItemById(item.id)
        return
      }
      focusItemById(item.id)
    },
    onFileItemDoubleClick: (e: CustomEvent) => {
      const item = getItemFromDetail(e.detail)
      const rawEvent = getEventFromDetail(e.detail)
      if (!item) return
      emitItemAction('open', item, rawEvent)
    },
    onFileItemContextMenu: (e: CustomEvent) => {
      const item = getItemFromDetail(e.detail)
      const rawEvent = getEventFromDetail(e.detail)
      if (!item) return
      emitItemAction('context-menu', item, rawEvent)
      focusItemById(item.id)
    },
    onFileItemRename: (e: CustomEvent) => {
      const item = getItemFromDetail(e.detail) || (e.detail as {item?: FileListItem})?.item
      if (item) emitItemAction('rename', item)
    },
    onFileItemDownload: (e: CustomEvent) => {
      const item = getItemFromDetail(e.detail) || (e.detail as {item?: FileListItem})?.item
      if (item) emitItemAction('download', item)
    },
    onFileItemInfo: (e: CustomEvent) => {
      const item = getItemFromDetail(e.detail) || (e.detail as {item?: FileListItem})?.item
      if (item) emitItemAction('info', item)
    },
    onFileItemDelete: (e: CustomEvent) => {
      const item = getItemFromDetail(e.detail) || (e.detail as {item?: FileListItem})?.item
      if (item) emitItemAction('delete', item)
    },
    onTableRowClick: (e: Event) => {
      const target = e.currentTarget as HTMLElement
      const id = Number(target.getAttribute('data-id'))
      const item = getItems().find((i) => i.id === id)
      if (!item) return

      const mouse = e as MouseEvent
      if (pointerState.lastLongPressItemId === item.id && Date.now() - pointerState.lastLongPressAtMs < 900) {
        pointerState.lastLongPressItemId = null
        return
      }

      if (isMacCtrlClick(mouse)) return

      if (mouse.shiftKey || mouse.ctrlKey || mouse.metaKey) {
        handleItemSelect(context, selectionState, item, mouse)
      } else if (context.isSelectionMode()) {
        handleItemSelect(context, selectionState, item, {ctrlKey: true, metaKey: false, shiftKey: false} as MouseEvent)
      } else if (isTouchActivationForItem(pointerState, item.id)) {
        emitItemAction('open', item, mouse)
        focusItemById(item.id)
        return
      }
      focusItemById(item.id)
    },
    onTableRowDblClick: (e: Event) => {
      const target = e.currentTarget as HTMLElement
      const id = Number(target.getAttribute('data-id'))
      const item = getItems().find((i) => i.id === id)
      if (item) emitItemAction('open', item, e)
    },
    onTableRowContextMenu: (e: Event) => {
      e.preventDefault()
      const target = e.currentTarget as HTMLElement
      const id = Number(target.getAttribute('data-id'))
      const item = getItems().find((i) => i.id === id)
      if (!item) return
      emitItemAction('context-menu', item, e)
      focusItemById(item.id)
    },
    onMoreButtonClick: (e: Event) => {
      e.stopPropagation()
      const target = e.currentTarget as HTMLElement
      const id = Number(target.getAttribute('data-id'))
      const item = getItems().find((i) => i.id === id)
      if (item) {
        emitItemAction('context-menu', item, e)
        focusItemById(item.id)
      }
    },
    onTableCheckboxClick: (e: Event) => {
      e.stopPropagation()
      const target = e.currentTarget as HTMLElement
      const id = Number(target.getAttribute('data-id'))
      const item = getItems().find((i) => i.id === id)
      if (!item) return
      handleItemSelect(context, selectionState, item, {ctrlKey: true, metaKey: false, shiftKey: false} as MouseEvent)
      focusItemById(item.id)
    },
    onContainerBackgroundClick: (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const isInsideItem = target.closest('file-item, .file-item-wrapper') != null
      if (isInsideItem) return
      context.focusContainer()
    },
    onItemDrop: (e: Event) => {
      const {detail} = e as CustomEvent<{target: FileListItem; source: FileListItem}>
      if (!detail) return
      const {source, target} = detail
      if (!source || !target) return
      emitItemAction('move', source, undefined, source, target)
    },
  }
}
