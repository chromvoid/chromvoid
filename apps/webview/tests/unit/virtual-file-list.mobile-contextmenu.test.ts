import {describe, expect, it, vi} from 'vitest'

import {createItemHandlers} from '../../src/features/file-manager/components/virtual-file-list/handlers/items'
import type {
  VirtualFileListHandlerContext,
  VirtualFileListPointerState,
  VirtualFileListSelectionState,
} from '../../src/features/file-manager/components/virtual-file-list/handlers/types'
import type {FileListItem} from '../../src/shared/contracts/file-manager'

const ITEM: FileListItem = {
  id: 7,
  path: '/report.pdf',
  name: 'report.pdf',
  isDir: false,
  size: 1024,
  lastModified: 1710000000000,
}

function createPointerState(): VirtualFileListPointerState {
  return {
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
  }
}

function createSelectionState(): VirtualFileListSelectionState {
  return {
    lastSelectionAnchorIndex: null,
    lastKeyboardAnchorIndex: null,
  }
}

function createHandlerHarness(options?: {
  mobile?: boolean
  selectedItems?: number[]
  selectionMode?: boolean
  pointerState?: Partial<VirtualFileListPointerState>
}) {
  let selectedItems = [...(options?.selectedItems ?? [])]
  let selectionMode = options?.selectionMode ?? false

  const pointerState = Object.assign(createPointerState(), options?.pointerState)
  const selectionState = createSelectionState()
  const focusItemById = vi.fn()
  const emitItemAction = vi.fn()
  const emitSelectionModeRequested = vi.fn((enabled: boolean) => {
    selectionMode = enabled
  })
  const emitSelectionChange = vi.fn((next: number[]) => {
    selectedItems = [...next]
  })

  const context: VirtualFileListHandlerContext = {
    getItems: () => [ITEM],
    getFilters: () =>
      ({
        query: '',
        sortBy: 'name',
        sortDirection: 'asc',
        viewMode: 'list',
        showHidden: true,
        fileTypes: [],
      }) as any,
    getSelectedItems: () => selectedItems,
    isSelectionMode: () => selectionMode,
    isMobileLayout: () => options?.mobile ?? true,
    emitSelectionModeRequested,
    emitSelectionChange,
    emitItemAction,
    applyTableSort: vi.fn(),
    emitNavigate: vi.fn(),
    getActiveItemId: () => null,
    setActiveItemId: vi.fn(),
    focusItemById,
    focusContainer: vi.fn(),
    getItemClientRect: () => null,
    ensureIndexVisible: vi.fn(),
    getViewMode: () => 'list',
    getItemHeight: () => 64,
    getViewportHeight: () => 640,
    getGridColumnsCount: () => 1,
    getCurrentPath: () => '/',
    normalizePath: (path: string) => path,
    getParentPath: () => '/',
    getLastSegment: () => '',
    afterUpdate: (callback: () => void) => callback(),
  }

  const handlers = createItemHandlers({
    pointerState,
    selectionState,
    context,
    focusItemById,
    getItems: () => [ITEM],
    emitItemAction,
  })

  return {
    handlers,
    pointerState,
    selectionState,
    emitItemAction,
    emitSelectionModeRequested,
    emitSelectionChange,
    focusItemById,
    getSelectedItems: () => selectedItems,
    isSelectionMode: () => selectionMode,
  }
}

describe('VirtualFileList mobile contextmenu fallback', () => {
  it('enters selection mode instead of opening the file context menu in mobile layout', () => {
    const harness = createHandlerHarness({mobile: true})
    const rawEvent = new MouseEvent('contextmenu', {bubbles: true, cancelable: true})
    const preventDefaultSpy = vi.spyOn(rawEvent, 'preventDefault')
    const stopPropagationSpy = vi.spyOn(rawEvent, 'stopPropagation')

    harness.handlers.onFileItemContextMenu(
      new CustomEvent('item-context-menu', {
        detail: {item: ITEM, event: rawEvent},
      }),
    )

    expect(preventDefaultSpy).toHaveBeenCalledTimes(1)
    expect(stopPropagationSpy).toHaveBeenCalledTimes(1)
    expect(harness.emitItemAction).not.toHaveBeenCalled()
    expect(harness.emitSelectionModeRequested).toHaveBeenCalledWith(true)
    expect(harness.emitSelectionChange).toHaveBeenCalledWith([ITEM.id])
    expect(harness.isSelectionMode()).toBe(true)
    expect(harness.getSelectedItems()).toEqual([ITEM.id])
    expect(harness.selectionState.lastSelectionAnchorIndex).toBe(0)
    expect(harness.selectionState.lastKeyboardAnchorIndex).toBe(0)
    expect(harness.pointerState.lastLongPressItemId).toBe(ITEM.id)
    expect(harness.focusItemById).toHaveBeenCalledWith(ITEM.id)
  })

  it('swallows the follow-up mobile contextmenu after a handled long press', () => {
    const now = Date.now()
    const harness = createHandlerHarness({
      mobile: true,
      selectedItems: [ITEM.id],
      selectionMode: true,
      pointerState: {
        lastLongPressAtMs: now,
        lastLongPressItemId: ITEM.id,
      },
    })
    const rawEvent = new MouseEvent('contextmenu', {bubbles: true, cancelable: true})

    harness.handlers.onFileItemContextMenu(
      new CustomEvent('item-context-menu', {
        detail: {item: ITEM, event: rawEvent},
      }),
    )

    expect(harness.emitItemAction).not.toHaveBeenCalled()
    expect(harness.emitSelectionModeRequested).not.toHaveBeenCalled()
    expect(harness.emitSelectionChange).not.toHaveBeenCalled()
    expect(harness.getSelectedItems()).toEqual([ITEM.id])
    expect(harness.focusItemById).toHaveBeenCalledWith(ITEM.id)
  })

  it('keeps desktop contextmenu behavior unchanged', () => {
    const harness = createHandlerHarness({mobile: false})
    const rawEvent = new MouseEvent('contextmenu', {bubbles: true, cancelable: true})

    harness.handlers.onFileItemContextMenu(
      new CustomEvent('item-context-menu', {
        detail: {item: ITEM, event: rawEvent},
      }),
    )

    expect(harness.emitSelectionModeRequested).not.toHaveBeenCalled()
    expect(harness.emitSelectionChange).not.toHaveBeenCalled()
    expect(harness.emitItemAction).toHaveBeenCalledWith('context-menu', ITEM, rawEvent)
    expect(harness.focusItemById).toHaveBeenCalledWith(ITEM.id)
  })

  it('uses the same mobile fallback for table rows', () => {
    const harness = createHandlerHarness({mobile: true})
    const row = document.createElement('div')
    row.setAttribute('data-id', String(ITEM.id))
    const rawEvent = new MouseEvent('contextmenu', {bubbles: true, cancelable: true})
    Object.defineProperty(rawEvent, 'currentTarget', {
      configurable: true,
      value: row,
    })

    harness.handlers.onTableRowContextMenu(rawEvent)

    expect(harness.emitItemAction).not.toHaveBeenCalled()
    expect(harness.emitSelectionModeRequested).toHaveBeenCalledWith(true)
    expect(harness.emitSelectionChange).toHaveBeenCalledWith([ITEM.id])
    expect(harness.getSelectedItems()).toEqual([ITEM.id])
    expect(harness.focusItemById).toHaveBeenCalledWith(ITEM.id)
  })
})

describe('VirtualFileList mobile selection taps', () => {
  it('toggles selection instead of opening when mobile selection is active without selection mode flag', () => {
    const harness = createHandlerHarness({
      mobile: true,
      selectedItems: [ITEM.id],
      selectionMode: false,
      pointerState: {
        lastPointerType: 'touch',
        lastPointerDownItemId: ITEM.id,
        lastPointerDownAtMs: Date.now(),
      },
    })
    const rawEvent = new MouseEvent('click', {bubbles: true, cancelable: true})

    harness.handlers.onFileItemClick(
      new CustomEvent('item-click', {
        detail: {item: ITEM, event: rawEvent},
      }),
    )

    expect(harness.emitItemAction).not.toHaveBeenCalled()
    expect(harness.emitSelectionChange).toHaveBeenCalledWith([])
    expect(harness.getSelectedItems()).toEqual([])
    expect(harness.focusItemById).toHaveBeenCalledWith(ITEM.id)
  })

  it('swallows mobile double click while selection is active', () => {
    const harness = createHandlerHarness({
      mobile: true,
      selectedItems: [ITEM.id],
      selectionMode: true,
    })
    const rawEvent = new MouseEvent('dblclick', {bubbles: true, cancelable: true})

    harness.handlers.onFileItemDoubleClick(
      new CustomEvent('item-double-click', {
        detail: {item: ITEM, event: rawEvent},
      }),
    )

    expect(harness.emitItemAction).not.toHaveBeenCalled()
    expect(rawEvent.defaultPrevented).toBe(true)
  })

  it('keeps desktop double click open behavior unchanged', () => {
    const harness = createHandlerHarness({
      mobile: false,
      selectedItems: [ITEM.id],
      selectionMode: true,
    })
    const rawEvent = new MouseEvent('dblclick', {bubbles: true, cancelable: true})

    harness.handlers.onFileItemDoubleClick(
      new CustomEvent('item-double-click', {
        detail: {item: ITEM, event: rawEvent},
      }),
    )

    expect(harness.emitItemAction).toHaveBeenCalledWith('open', ITEM, rawEvent)
  })
})
