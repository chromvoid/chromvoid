import type {
  FileListItem,
  FileListViewportRestoreState,
  SearchFilters,
} from 'root/shared/contracts/file-manager'

import {
  getLastSegment,
  getParentPath,
  normalizePath,
} from './virtual-file-list.model-helpers'

export interface VirtualFileListFocusControllerDeps {
  getActionItems: () => FileListItem[]
  getFilters: () => SearchFilters
  getItemHeight: () => number
  getViewportHeight: () => number
  getCurrentPath: () => string
  getActiveItemId: () => number | null
  setActiveItemId: (id: number | null) => void
  getScrollTop: () => number
  setScrollTop: (scrollTop: number) => void
  setVirtualScrollTop: (scrollTop: number) => void
  getGridScrollTopForIndex: (index: number, viewportHeight: number, currentScrollTop: number) => number
  updateViewportHeight: () => void
  isFocusInsideList: () => boolean
  focusRenderedItemById: (id: number) => boolean
  focusContainer: () => void
  focusListContainer: () => void
  setSelectionAnchor: (id: number | null) => void
  setKeyboardAnchor: (id: number | null) => void
  dispatchSelectionChange: (selectedItems: number[]) => void
  dispatchViewportStateRestored: (revision: number) => void
  getAppliedViewportRestoreRevision: () => number | null
  setAppliedViewportRestoreRevision: (revision: number) => void
  afterUpdate: (callback: () => void) => void
}

export class VirtualFileListFocusController {
  constructor(private readonly deps: VirtualFileListFocusControllerDeps) {}

  syncActiveForCurrentItems(): void {
    const filtered = this.deps.getActionItems()
    const active = this.deps.getActiveItemId()
    if (filtered.length === 0) {
      if (active != null) this.deps.setActiveItemId(null)
      return
    }
    if (active == null || !filtered.some((item) => item.id === active)) {
      this.deps.setActiveItemId(filtered[0]?.id ?? null)
    }
  }

  maybeUpdateActiveFromScroll(scrollTop: number): void {
    const filters = this.deps.getFilters()
    if (filters.viewMode !== 'list' && filters.viewMode !== 'table') return
    if (!this.deps.isFocusInsideList()) return

    const filtered = this.deps.getActionItems()
    if (filtered.length === 0) return

    const startIndex = Math.floor(scrollTop / this.deps.getItemHeight())
    const endIndex = Math.min(
      filtered.length,
      startIndex + Math.ceil(this.deps.getViewportHeight() / this.deps.getItemHeight()) + 2,
    )
    const activeId = this.deps.getActiveItemId()

    if (activeId == null) return
    const activeIndex = filtered.findIndex((i) => i.id === activeId)
    if (activeIndex === -1) return
    if (activeIndex < startIndex || activeIndex >= endIndex) {
      const fallback = filtered[startIndex]?.id
      if (fallback != null) {
        this.deps.setActiveItemId(fallback)
      }
    }
  }

  restoreViewportState(restore: FileListViewportRestoreState | null): boolean {
    if (!restore || restore.revision === this.deps.getAppliedViewportRestoreRevision()) {
      return false
    }

    if (normalizePath(restore.path) !== normalizePath(this.deps.getCurrentPath())) {
      return false
    }

    const filtered = this.deps.getActionItems()
    if (filtered.length === 0) {
      return false
    }

    this.deps.updateViewportHeight()

    const filters = this.deps.getFilters()
    const targetId = restore.focusItemId ?? restore.activeItemId
    const targetIndex = targetId == null ? -1 : filtered.findIndex((item) => item.id === targetId)
    const restoreScrollTop = Math.max(0, restore.scrollTop)
    let nextScrollTop = restoreScrollTop

    if (restore.viewMode !== filters.viewMode && targetIndex >= 0) {
      nextScrollTop =
        filters.viewMode === 'grid'
          ? this.deps.getGridScrollTopForIndex(targetIndex, this.deps.getViewportHeight(), restoreScrollTop)
          : targetIndex * this.deps.getItemHeight()
      nextScrollTop = Math.max(0, nextScrollTop)
    }

    this.deps.setScrollTop(nextScrollTop)
    this.deps.setVirtualScrollTop(nextScrollTop)

    const fallbackIndex = Math.max(
      0,
      Math.min(filtered.length - 1, Math.floor(nextScrollTop / this.deps.getItemHeight())),
    )
    const focusId = targetIndex >= 0 ? targetId : (filtered[fallbackIndex]?.id ?? null)

    this.deps.setSelectionAnchor(null)
    this.deps.setActiveItemId(focusId)
    this.deps.setKeyboardAnchor(focusId)
    this.deps.setAppliedViewportRestoreRevision(restore.revision)
    this.deps.dispatchViewportStateRestored(restore.revision)

    this.deps.afterUpdate(() => {
      requestAnimationFrame(() => {
        if (focusId != null && this.deps.focusRenderedItemById(focusId)) {
          return
        }

        this.deps.focusContainer()
      })
    })

    return true
  }

  handlePathChanged(prevRaw: string | undefined): void {
    const prev = prevRaw ? normalizePath(prevRaw) : undefined
    const current = normalizePath(this.deps.getCurrentPath())
    this.deps.focusContainer()

    const filtered = this.deps.getActionItems()
    if (filtered.length === 0) return

    if (prev) {
      const parentOfPrev = getParentPath(prev)
      if (current === parentOfPrev) {
        const childName = getLastSegment(prev)
        let targetIndex = filtered.findIndex((i) => normalizePath(i.path) === prev)
        if (targetIndex < 0) {
          targetIndex = filtered.findIndex((i) => i.isDir && i.name === childName)
        }
        if (targetIndex < 0) targetIndex = 0
        const targetId = filtered[targetIndex]?.id
        if (targetId == null) return
        this.deps.setSelectionAnchor(null)
        this.deps.dispatchSelectionChange([])
        this.ensureIndexVisible(targetIndex)
        this.focusItemById(targetId)
        return
      }
    }

    const firstId = filtered[0]?.id
    if (firstId == null) return
    this.deps.setSelectionAnchor(null)
    this.deps.dispatchSelectionChange([])
    this.ensureIndexVisible(0)
    this.focusItemById(firstId)
  }

  focusItemById(id: number): void {
    const filtered = this.deps.getActionItems()
    const idx = filtered.findIndex((item) => item.id === id)
    if (idx >= 0) {
      this.ensureIndexVisible(idx)
    }

    this.deps.setActiveItemId(id)
    requestAnimationFrame(() => {
      if (this.deps.getFilters().viewMode === 'table') {
        this.deps.focusRenderedItemById(id)
        return
      }
      this.deps.focusListContainer()
    })
  }

  ensureIndexVisible(index: number): void {
    const filters = this.deps.getFilters()
    this.deps.updateViewportHeight()
    const prevScrollTop = this.deps.getScrollTop()

    if (filters.viewMode === 'grid') {
      const nextScrollTop = this.deps.getGridScrollTopForIndex(
        index,
        this.deps.getViewportHeight(),
        prevScrollTop,
      )
      if (nextScrollTop !== prevScrollTop) {
        this.deps.setScrollTop(nextScrollTop)
        this.deps.setVirtualScrollTop(nextScrollTop)
      }
      return
    }

    const rowTop = index * this.deps.getItemHeight()
    const rowBottom = rowTop + this.deps.getItemHeight()
    const viewTop = this.deps.getScrollTop()
    const viewBottom = viewTop + this.deps.getViewportHeight()
    if (rowTop < viewTop) {
      this.deps.setScrollTop(rowTop)
    } else if (rowBottom > viewBottom) {
      this.deps.setScrollTop(rowBottom - this.deps.getViewportHeight())
    }

    const nextScrollTop = this.deps.getScrollTop()
    if (nextScrollTop !== prevScrollTop) {
      this.deps.setVirtualScrollTop(nextScrollTop)
    }
  }
}
