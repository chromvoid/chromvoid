import type {FileListItem, SearchFilters, SortOption} from 'root/shared/contracts/file-manager'

export interface VirtualFileListHandlerContext {
  getItems: () => FileListItem[]
  getFilters: () => SearchFilters
  getSelectedItems: () => number[]
  isSelectionMode: () => boolean
  emitSelectionModeRequested: (enabled: boolean) => void
  emitSelectionChange: (selectedItems: number[]) => void
  emitItemAction: (action: string, item?: FileListItem, event?: Event, source?: FileListItem, target?: FileListItem) => void
  emitFiltersChange: (next: SearchFilters) => void
  emitNavigate: (path: string) => void
  getActiveItemId: () => number | null
  setActiveItemId: (id: number | null) => void
  focusItemById: (id: number) => void
  focusContainer: () => void
  getItemClientRect: (id: number) => DOMRect | null
  ensureIndexVisible: (index: number) => void
  getViewMode: () => SearchFilters['viewMode']
  getItemHeight: () => number
  getViewportHeight: () => number
  getGridColumnsCount: () => number
  getCurrentPath: () => string
  normalizePath: (path: string) => string
  getParentPath: (path: string) => string
  getLastSegment: (path: string) => string
  afterUpdate: (callback: () => void) => void
}

export type KeyboardSortableColumn = 'name' | 'size' | 'date'

export const NAV_KEYS = [
  'ArrowDown',
  'ArrowUp',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageDown',
  'PageUp',
] as const

export type NavKey = (typeof NAV_KEYS)[number]

export interface VirtualFileListPointerState {
  lastPointerType: string | null
  lastPointerDownAtMs: number
  lastPointerDownItemId: number | null
  touchLongPressTimer: number | null
  touchLongPressPointerId: number | null
  touchLongPressItemId: number | null
  touchLongPressStartX: number
  touchLongPressStartY: number
  lastLongPressAtMs: number
  lastLongPressItemId: number | null
}

export interface VirtualFileListSelectionState {
  lastSelectionAnchorIndex: number | null
  lastKeyboardAnchorIndex: number | null
}

export type KeyboardSortHandler = (option: SortOption) => void
