import type {FileListItem} from 'root/shared/contracts/file-manager'

import {
  type VirtualFileListHandlerContext,
  type VirtualFileListPointerState,
  type VirtualFileListSelectionState,
} from './handlers/types'
import {type VirtualFileListItemHandlers, createItemHandlers} from './handlers/items'
import {
  type VirtualFileListKeyboardHandlers,
  createKeyboardHandlers,
  getKeyboardCurrentIndex,
} from './handlers/keyboard'
import {type VirtualFileListPointerHandlers, createPointerHandlers} from './handlers/pointer'
import {handleHeaderSort} from './handlers/sort'

export type {VirtualFileListHandlerContext} from './handlers/types'

const createPointerState = (): VirtualFileListPointerState => ({
  lastPointerType: null,
  lastPointerDownAtMs: 0,
  lastPointerDownItemId: null,
  touchLongPressTimer: null,
  touchLongPressPointerId: null,
  touchLongPressItemId: null,
  touchLongPressStartX: 0,
  touchLongPressStartY: 0,
  lastLongPressAtMs: 0,
  lastLongPressItemId: null,
})

const createSelectionState = (): VirtualFileListSelectionState => ({
  lastSelectionAnchorIndex: null,
  lastKeyboardAnchorIndex: null,
})

export class VirtualFileListHandlers {
  private readonly pointerState = createPointerState()
  private readonly selectionState = createSelectionState()
  private readonly pointerHandlers: VirtualFileListPointerHandlers
  private readonly itemHandlers: VirtualFileListItemHandlers
  private readonly keyboardHandlers: VirtualFileListKeyboardHandlers

  constructor(private readonly context: VirtualFileListHandlerContext) {
    this.pointerHandlers = createPointerHandlers({
      pointerState: this.pointerState,
      selectionState: this.selectionState,
      getItems: () => this.context.getItems(),
      getSelectedItems: () => this.context.getSelectedItems(),
      isSelectionMode: () => this.context.isSelectionMode(),
      emitSelectionModeRequested: (enabled: boolean) => this.context.emitSelectionModeRequested(enabled),
      emitSelectionChange: (selectedItems: number[]) => this.context.emitSelectionChange(selectedItems),
      focusItemById: (id: number) => this.context.focusItemById(id),
    })

    this.itemHandlers = createItemHandlers({
      pointerState: this.pointerState,
      selectionState: this.selectionState,
      context: this.context,
      focusItemById: (id: number) => this.context.focusItemById(id),
      getItems: () => this.context.getItems(),
      emitItemAction: (
        action: string,
        item?: FileListItem,
        event?: Event,
        source?: FileListItem,
        target?: FileListItem,
      ) => this.emitItemAction(action, item, event, source, target),
    })

    this.keyboardHandlers = createKeyboardHandlers({
      getItems: () => this.context.getItems(),
      getSelectedItems: () => this.context.getSelectedItems(),
      emitSelectionChange: (selectedItems: number[]) => this.context.emitSelectionChange(selectedItems),
      emitNavigate: (path: string) => this.context.emitNavigate(path),
      emitItemAction: (
        action: string,
        item?: FileListItem,
        event?: Event,
        source?: FileListItem,
        target?: FileListItem,
      ) => this.emitItemAction(action, item, event, source, target),
      getActiveItemId: () => this.context.getActiveItemId(),
      setActiveItemId: (id: number | null) => this.context.setActiveItemId(id),
      getSelectionAnchor: () => this.selectionState.lastSelectionAnchorIndex,
      getKeyboardAnchor: () => this.selectionState.lastKeyboardAnchorIndex,
      focusItemById: (id: number) => this.context.focusItemById(id),
      getItemClientRect: (id: number) => this.context.getItemClientRect(id),
      ensureIndexVisible: (index: number) => this.context.ensureIndexVisible(index),
      getViewMode: () => this.context.getViewMode(),
      getItemHeight: (): number => this.context.getItemHeight(),
      getViewportHeight: (): number => this.context.getViewportHeight(),
      getGridColumnsCount: (): number => this.context.getGridColumnsCount(),
      getCurrentPath: () => this.context.getCurrentPath(),
      normalizePath: (path: string) => this.context.normalizePath(path),
      getParentPath: (path: string) => this.context.getParentPath(path),
      afterUpdate: (callback: () => void) => this.context.afterUpdate(callback),
      setSelectionAnchor: (index: number | null) => this.setSelectionAnchor(index),
      setKeyboardAnchor: (index: number | null) => this.setKeyboardAnchor(index),
    })
  }

  get lastSelectionIndex() {
    return this.selectionState.lastSelectionAnchorIndex
  }

  get lastKeyboardIndex() {
    return this.selectionState.lastKeyboardAnchorIndex
  }

  setSelectionAnchor(value: number | null) {
    this.selectionState.lastSelectionAnchorIndex = value
  }

  setKeyboardAnchor(value: number | null) {
    this.selectionState.lastKeyboardAnchorIndex = value
  }

  getKeyboardCurrentIndex(filtered: FileListItem[]): number {
    return getKeyboardCurrentIndex(filtered, {
      getActiveItemId: () => this.context.getActiveItemId(),
      getSelectedItems: () => this.context.getSelectedItems(),
      getKeyboardAnchor: () => this.selectionState.lastKeyboardAnchorIndex,
    })
  }

  dispose() {
    this.pointerHandlers.dispose()
  }

  onSortName: () => void = () => handleHeaderSort(this.context, 'name')
  onSortSize: () => void = () => handleHeaderSort(this.context, 'size')
  onSortDate: () => void = () => handleHeaderSort(this.context, 'date')
  onPointerDown: (e: PointerEvent) => void = (e: PointerEvent) => this.pointerHandlers.onPointerDown(e)
  onPointerMove: (e: PointerEvent) => void = (e: PointerEvent) => this.pointerHandlers.onPointerMove(e)
  onPointerUp: (e: PointerEvent) => void = (e: PointerEvent) => this.pointerHandlers.onPointerUp(e)
  onPointerCancel: (e: PointerEvent) => void = (e: PointerEvent) => this.pointerHandlers.onPointerCancel(e)
  onTouchStart: (event: TouchEvent, item: FileListItem) => void = (event: TouchEvent, item: FileListItem) =>
    this.pointerHandlers.onTouchStart(item, event)
  onTouchMove: (_event?: TouchEvent) => void = (_event?: TouchEvent) =>
    this.pointerHandlers.onTouchMove(_event)
  onTouchEnd: (_event?: TouchEvent) => void = (_event?: TouchEvent) => this.pointerHandlers.onTouchEnd(_event)
  onItemDrop: (e: Event) => void = (e: Event) => this.itemHandlers.onItemDrop(e)
  onFileItemClick: (e: CustomEvent) => void = (e: CustomEvent) => this.itemHandlers.onFileItemClick(e)
  onFileItemDoubleClick: (e: CustomEvent) => void = (e: CustomEvent) => this.itemHandlers.onFileItemDoubleClick(e)
  onFileItemContextMenu: (e: CustomEvent) => void = (e: CustomEvent) => this.itemHandlers.onFileItemContextMenu(e)
  onFileItemRename: (e: CustomEvent) => void = (e: CustomEvent) => this.itemHandlers.onFileItemRename(e)
  onFileItemDownload: (e: CustomEvent) => void = (e: CustomEvent) => this.itemHandlers.onFileItemDownload(e)
  onFileItemDelete: (e: CustomEvent) => void = (e: CustomEvent) => this.itemHandlers.onFileItemDelete(e)
  onFileItemInfo: (e: CustomEvent) => void = (e: CustomEvent) => this.itemHandlers.onFileItemInfo(e)
  onTableRowClick: (e: Event) => void = (e: Event) => this.itemHandlers.onTableRowClick(e)
  onTableRowDblClick: (e: Event) => void = (e: Event) => this.itemHandlers.onTableRowDblClick(e)
  onTableRowContextMenu: (e: Event) => void = (e: Event) => this.itemHandlers.onTableRowContextMenu(e)
  onMoreButtonClick: (e: Event) => void = (e: Event) => this.itemHandlers.onMoreButtonClick(e)
  onTableCheckboxClick: (e: Event) => void = (e: Event) => this.itemHandlers.onTableCheckboxClick(e)
  onContainerBackgroundClick: (e: MouseEvent) => void = (e: MouseEvent) => this.itemHandlers.onContainerBackgroundClick(e)
  onContainerKeyDown: (e: KeyboardEvent) => void = (e: KeyboardEvent) => this.keyboardHandlers.onContainerKeyDown(e)

  private emitItemAction(
    action: string,
    item?: FileListItem,
    event?: Event,
    source?: FileListItem,
    target?: FileListItem,
  ) {
    this.context.emitItemAction(action, item, event, source, target)
  }
}
