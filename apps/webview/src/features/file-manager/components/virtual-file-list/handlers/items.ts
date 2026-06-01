import type {FileListItem} from 'root/shared/contracts/file-manager'
import {FILE_ITEM_HOST_OR_ROW_SELECTOR} from '../item-host-selectors'
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
  emitItemAction: (
    action: string,
    item?: FileListItem,
    event?: Event,
    source?: FileListItem,
    target?: FileListItem,
    payload?: unknown,
  ) => void
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

  const handleMobileContextMenuSelection = (item: FileListItem, event: Event) => {
    if (!context.isMobileLayout()) {
      return false
    }

    event.preventDefault()
    event.stopPropagation()

    const now = Date.now()
    const isDuplicateLongPress =
      pointerState.lastLongPressItemId === item.id && now - pointerState.lastLongPressAtMs < 900

    const filtered = getItems()
    const currentIndex = filtered.findIndex((candidate) => candidate.id === item.id)
    if (currentIndex >= 0) {
      selectionState.lastSelectionAnchorIndex = currentIndex
      selectionState.lastKeyboardAnchorIndex = currentIndex
    }

    focusItemById(item.id)

    if (isDuplicateLongPress) {
      return true
    }

    if (!context.isSelectionMode()) {
      context.emitSelectionModeRequested(true)
      context.emitSelectionChange([item.id])
    } else {
      const selected = [...context.getSelectedItems()]
      const index = selected.indexOf(item.id)
      if (index >= 0) {
        selected.splice(index, 1)
      } else {
        selected.push(item.id)
      }
      context.emitSelectionChange(selected)
    }

    pointerState.lastLongPressAtMs = now
    pointerState.lastLongPressItemId = item.id

    return true
  }

  const isMobileSelectionActive = () => {
    return (
      context.isMobileLayout() &&
      (context.isSelectionMode() || context.getSelectedItems().length > 0)
    )
  }

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
      } else if (context.isSelectionMode() || isMobileSelectionActive()) {
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
      if (isMobileSelectionActive()) {
        rawEvent?.preventDefault()
        rawEvent?.stopPropagation()
        return
      }
      emitItemAction('open', item, rawEvent)
    },
    onFileItemContextMenu: (e: CustomEvent) => {
      const item = getItemFromDetail(e.detail)
      const rawEvent = getEventFromDetail(e.detail) ?? e
      if (!item) return
      if (handleMobileContextMenuSelection(item, rawEvent)) return
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
      } else if (context.isSelectionMode() || isMobileSelectionActive()) {
        handleItemSelect(
          context,
          selectionState,
          item,
          {ctrlKey: true, metaKey: false, shiftKey: false} as MouseEvent,
        )
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
      if (item && isMobileSelectionActive()) {
        e.preventDefault()
        e.stopPropagation()
        return
      }
      if (item) emitItemAction('open', item, e)
    },
    onTableRowContextMenu: (e: Event) => {
      e.preventDefault()
      const target = e.currentTarget as HTMLElement
      const id = Number(target.getAttribute('data-id'))
      const item = getItems().find((i) => i.id === id)
      if (!item) return
      if (handleMobileContextMenuSelection(item, e)) return
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
      const isInsideItem = target.closest(FILE_ITEM_HOST_OR_ROW_SELECTOR) != null
      if (isInsideItem) return
      context.focusContainer()
    },
    onItemDrop: (e: Event) => {
      const {detail} = e as CustomEvent<{target: FileListItem; source: FileListItem; payload?: unknown}>
      if (!detail) return
      const {source, target, payload} = detail
      if (!source || !target) return
      emitItemAction('move', source, undefined, source, target, payload)
    },
  }
}
