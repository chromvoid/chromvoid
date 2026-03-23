import type {FileListItem, SearchFilters} from 'root/shared/contracts/file-manager'
import {type NavKey, NAV_KEYS} from './types'

export interface VirtualFileListKeyboardHandlers {
  onContainerKeyDown: (e: KeyboardEvent) => void
}

export interface VirtualFileListKeyboardHandlersDeps {
  getItems: () => FileListItem[]
  getSelectedItems: () => number[]
  emitSelectionChange: (selectedItems: number[]) => void
  emitNavigate: (path: string) => void
  emitItemAction: (action: string, item?: FileListItem, event?: Event, source?: FileListItem, target?: FileListItem) => void
  getActiveItemId: () => number | null
  getSelectionAnchor: () => number | null
  getKeyboardAnchor: () => number | null
  setActiveItemId: (id: number | null) => void
  focusItemById: (id: number) => void
  getItemClientRect: (id: number) => DOMRect | null
  ensureIndexVisible: (index: number) => void
  getViewMode: () => SearchFilters['viewMode']
  getItemHeight: () => number
  getViewportHeight: () => number
  getGridColumnsCount: () => number
  getCurrentPath: () => string
  normalizePath: (path: string) => string
  getParentPath: (path: string) => string
  afterUpdate: (callback: () => void) => void
  setSelectionAnchor: (index: number | null) => void
  setKeyboardAnchor: (index: number | null) => void
}

export const getKeyboardCurrentIndex = (
  filtered: FileListItem[],
  context: {
    getActiveItemId: () => number | null
    getSelectedItems: () => number[]
    getKeyboardAnchor: () => number | null
  },
) => {
  const activeId = context.getActiveItemId()
  if (activeId != null) {
    const idx = filtered.findIndex((item) => item.id === activeId)
    if (idx >= 0) return idx
  }

  const selected = context.getSelectedItems()
  if (context.getKeyboardAnchor() != null) return context.getKeyboardAnchor()!
  if (selected.length > 0) {
    const last = selected[selected.length - 1]
    const idx = filtered.findIndex((item) => item.id === last)
    if (idx >= 0) return idx
  }

  return 0
}

export const createKeyboardHandlers = (deps: VirtualFileListKeyboardHandlersDeps): VirtualFileListKeyboardHandlers => {
  const isNavKey = (value: string): value is NavKey => {
    return (NAV_KEYS as readonly string[]).includes(value)
  }

  const getCurrentIndex = (filtered: FileListItem[]) =>
    getKeyboardCurrentIndex(filtered, {
      getActiveItemId: () => deps.getActiveItemId(),
      getSelectedItems: () => deps.getSelectedItems(),
      getKeyboardAnchor: () => deps.getKeyboardAnchor(),
    })

  return {
    onContainerKeyDown: (e: KeyboardEvent) => {
      const key = e.key
      const navKey = isNavKey(key) ? key : null

      if (key === 'a' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        const ids = deps.getItems().map((item) => item.id)
        deps.emitSelectionChange(ids)
        return
      }

      if (key === 'ContextMenu' || (key === 'F10' && e.shiftKey)) {
        const filtered = deps.getItems()
        if (filtered.length === 0) {
          const selectedItems = deps.getSelectedItems()
          if (selectedItems.length > 0) {
            deps.emitSelectionChange([])
          }
          return
        }

        const currentIndex = getCurrentIndex(filtered)
        const item = filtered[currentIndex]
        if (item) {
          e.preventDefault()
          deps.focusItemById(item.id)
          deps.afterUpdate(() => {
            const rect = deps.getItemClientRect(item.id)
            const clientX = rect ? rect.left + rect.width / 2 : 0
            const clientY = rect ? rect.top + rect.height / 2 : 0
            const evt = new MouseEvent('contextmenu', {clientX, clientY})
            deps.emitItemAction('context-menu', item, evt)
          })
        }
        return
      }

      if (key === 'F2') {
        const filtered = deps.getItems()
        if (filtered.length === 0) return
        const selected = deps.getSelectedItems()
        const targetIndex = getCurrentIndex(filtered)
        const targetItem = filtered[targetIndex]
        const targetId = selected.length === 1 ? selected[0] : targetItem?.id
        const item = targetId != null ? filtered.find((i) => i.id === targetId) : undefined
        if (item) {
          deps.emitItemAction('rename', item)
          e.preventDefault()
        }
        return
      }

      if (key === 'Escape') {
        deps.emitSelectionChange([])
        deps.setSelectionAnchor(null)
        deps.setKeyboardAnchor(null)
        return
      }

      if (key === 'Enter') {
        const filtered = deps.getItems()
        const selectedId = deps.getSelectedItems().at(-1)
        const focusedId = getFocusedItemIdFromEvent(e)
        const currentId = deps.getActiveItemId() ?? focusedId ?? selectedId
        const item = currentId != null ? filtered.find((i) => i.id === currentId) : undefined
        if (item) {
          deps.emitItemAction('open', item)
          e.preventDefault()
        }
        return
      }

      if ((key === 'o' || key === 'O') && (e.ctrlKey || e.metaKey)) {
        const filtered = deps.getItems()
        const selectedId = deps.getSelectedItems().at(-1)
        const focusedId = getFocusedItemIdFromEvent(e)
        const currentId = deps.getActiveItemId() ?? focusedId ?? selectedId
        const item = currentId != null ? filtered.find((i) => i.id === currentId) : undefined
        if (item) {
          deps.emitItemAction('open-external', item)
          e.preventDefault()
        }
        return
      }

      if (key === 'Backspace') {
        const parent = deps.getParentPath(deps.getCurrentPath())
        const current = deps.getCurrentPath()
        if (deps.normalizePath(parent) !== deps.normalizePath(current)) {
          deps.emitNavigate(deps.getParentPath(current))
        }
        e.preventDefault()
        return
      }

      if (key === 'Delete') {
        if (deps.getSelectedItems().length > 0) {
          deps.emitItemAction('delete-selected')
          e.preventDefault()
        }
        return
      }

      if (key === ' ' || key === 'Spacebar') {
        const filtered = deps.getItems()
        if (filtered.length === 0) return

        const currentIndex = getCurrentIndex(filtered)
        const currentId = filtered[currentIndex]?.id
        if (currentId == null) return

        let updatedSelection = [...deps.getSelectedItems()]
        if (e.shiftKey) {
          const anchor =
            deps.getSelectionAnchor() != null && deps.getSelectionAnchor()! >= 0
              ? deps.getSelectionAnchor()!
              : currentIndex
          const start = Math.min(anchor, currentIndex)
          const end = Math.max(anchor, currentIndex)
          updatedSelection = []
          for (let i = start; i <= end; i++) {
            const candidate = filtered[i]
            if (candidate) updatedSelection.push(candidate.id)
          }
          if (deps.getSelectionAnchor() == null) {
            deps.setSelectionAnchor(anchor)
          }
        } else {
          const idx = updatedSelection.indexOf(currentId)
          if (idx >= 0) {
            updatedSelection.splice(idx, 1)
          } else {
            updatedSelection.push(currentId)
          }
          deps.setSelectionAnchor(currentIndex)
        }
        deps.setKeyboardAnchor(currentIndex)
        deps.emitSelectionChange(updatedSelection)
        e.preventDefault()
        return
      }

      if (!navKey) return

      if (e.altKey && navKey === 'ArrowUp') {
        const parentPath = deps.getParentPath(deps.getCurrentPath())
        const currentPath = deps.getCurrentPath()
        if (deps.normalizePath(parentPath) !== deps.normalizePath(currentPath)) {
          deps.emitNavigate(parentPath)
          e.preventDefault()
        }
        return
      }

      const filtered = deps.getItems()
      if (filtered.length === 0) return

      const anchorIndex = getCurrentIndex(filtered)
      let step = 1
      if (deps.getViewMode() === 'grid') {
        const cols = Math.max(1, deps.getGridColumnsCount())
        if (navKey === 'ArrowUp') step = -cols
        if (navKey === 'ArrowDown') step = cols
        if (navKey === 'ArrowLeft') step = -1
        if (navKey === 'ArrowRight') step = 1
      } else {
        if (navKey === 'ArrowUp') step = -1
        if (navKey === 'ArrowDown') step = 1
        if (navKey === 'ArrowLeft' || navKey === 'ArrowRight') step = 0
      }

      const pageSize = Math.max(1, Math.floor(deps.getViewportHeight() / deps.getItemHeight()) - 1)
      let nextIndex = anchorIndex
      if (navKey === 'Home') nextIndex = 0
      else if (navKey === 'End') nextIndex = filtered.length - 1
      else if (navKey === 'PageUp') nextIndex = Math.max(0, anchorIndex - pageSize)
      else if (navKey === 'PageDown') nextIndex = Math.min(filtered.length - 1, anchorIndex + pageSize)
      else nextIndex = Math.min(filtered.length - 1, Math.max(0, anchorIndex + step))

      const nextId = filtered[nextIndex]?.id
      if (nextId == null) return

      deps.setKeyboardAnchor(nextIndex)
      deps.setActiveItemId(nextId)
      deps.ensureIndexVisible(nextIndex)
      deps.focusItemById(nextId)
      e.preventDefault()
    },
  }
}

const getFocusedItemIdFromEvent = (event?: Event): number | null => {
  const path = event?.composedPath?.() ?? []
  for (const el of path) {
    if (!(el instanceof HTMLElement)) continue
    if (el.matches?.('file-item[data-id], .file-item-wrapper[data-id]')) {
      const raw = el.getAttribute('data-id')
      const id = raw ? Number(raw) : NaN
      if (!Number.isNaN(id)) return id
    }
  }
  return null
}
