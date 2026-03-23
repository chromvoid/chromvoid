import {computed, state} from '@statx/core'

import {getAppContext} from 'root/shared/services/app-context'
import type {UploadStats} from 'root/types/upload-task'

export const MOBILE_UPLOAD_MINIMIZED_AUTO_HIDE_MS = 4000

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.max(0, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = Math.round((bytes / Math.pow(1024, i)) * 100) / 100
  return `${value} ${sizes[i] ?? 'B'}`
}

export class UploadProgressModel {
  private autoHideTimer: ReturnType<typeof setTimeout> | null = null

  readonly isMobile = computed(() => {
    return getAppContext().store.layoutMode() === 'mobile'
  })

  // UI state
  readonly minimized = state(false)
  readonly expanded = state(false)

  // Derived state
  readonly tasks = computed(() => getAppContext().store.uploadTasks())
  readonly hasTasks = computed(() => this.tasks().length > 0)
  readonly stats = computed<UploadStats>(() => getAppContext().store.getUploadStats())
  readonly hasActiveTransfers = computed(() => this.stats().uploading > 0)
  readonly headerIcon = computed(() => {
    const tasks = this.tasks()
    const hasDownloads = tasks.some((t) => t.direction === 'download')
    const hasUploads = tasks.some((t) => t.direction === 'upload')
    return hasDownloads && !hasUploads ? 'cloud-download' : 'cloud-upload'
  })

  // Actions
  toggleMinimize = () => {
    this.minimized.set(!this.minimized())
  }

  expand = () => {
    this.expanded.set(true)
  }

  collapse = () => {
    this.expanded.set(false)
  }

  toggleExpanded = () => {
    this.expanded.set(!this.expanded())
  }

  clearCompleted = () => {
    try {
      getAppContext().store.clearCompletedUploadTasks()
    } catch {}
  }

  private canAutoHideCompletedTransfers(): boolean {
    const stats = this.stats()
    return this.isMobile() && !this.expanded() && stats.total > 0 && stats.uploading === 0 && stats.failed === 0
  }

  reconcileAutoHideClear() {
    if (!this.canAutoHideCompletedTransfers()) {
      this.cancelAutoHideClear()
      return
    }
    if (this.autoHideTimer !== null) return

    this.autoHideTimer = setTimeout(() => {
      this.autoHideTimer = null
      if (!this.canAutoHideCompletedTransfers()) return
      this.clearCompleted()
    }, MOBILE_UPLOAD_MINIMIZED_AUTO_HIDE_MS)
  }

  cancelAutoHideClear() {
    if (this.autoHideTimer === null) return
    clearTimeout(this.autoHideTimer)
    this.autoHideTimer = null
  }
}
