import {atom} from '@reatom/core'

import type {
  FileListViewportRestoreState,
  FileListViewportSnapshot,
  ViewMode,
} from 'root/shared/contracts/file-manager'

const normalizeViewportPath = (path: string): string => {
  const raw = (path || '/').trim()
  if (raw === '' || raw === '/') return '/'

  let normalized = raw
  while (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1)
  }
  return normalized
}

export class FileListViewportModel {
  readonly restore = atom<FileListViewportRestoreState | null>(null)

  private lastSnapshot: FileListViewportSnapshot | null = null
  private pendingDocumentReturn: FileListViewportSnapshot | null = null
  private revision = 0

  saveSnapshot(snapshot: FileListViewportSnapshot): void {
    this.lastSnapshot = {
      ...snapshot,
      path: normalizeViewportPath(snapshot.path),
      scrollTop: Math.max(0, snapshot.scrollTop),
    }
  }

  clearRestore(revision: number): void {
    if (this.restore()?.revision === revision) {
      this.restore.set(null)
    }
  }

  prepareDocumentReturn(fileId: number, path: string, viewMode: ViewMode): void {
    const normalizedPath = normalizeViewportPath(path)
    const snapshot =
      this.lastSnapshot &&
      this.lastSnapshot.path === normalizedPath &&
      this.lastSnapshot.viewMode === viewMode
        ? this.lastSnapshot
        : {
            path: normalizedPath,
            viewMode,
            scrollTop: 0,
            activeItemId: fileId,
            focusItemId: fileId,
          }

    this.pendingDocumentReturn = {
      ...snapshot,
      path: normalizedPath,
      viewMode,
      activeItemId: fileId,
      focusItemId: fileId,
    }
    this.restore.set(null)
  }

  activatePendingDocumentReturn(currentPath: string): void {
    const pending = this.pendingDocumentReturn
    if (!pending) return

    const path = normalizeViewportPath(currentPath)
    this.pendingDocumentReturn = null

    if (pending.path !== path) {
      return
    }

    this.revision += 1
    this.restore.set({
      ...pending,
      path,
      revision: this.revision,
    })
  }
}
