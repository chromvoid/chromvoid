import {getAppContext} from 'root/shared/services/app-context'
import {atom, computed} from '@reatom/core'
import type {UploadStats, UploadTask} from 'root/types/upload-task'
export {formatFileSize} from 'root/utils/format-file-size'

import {AnimatedTransferValueModel} from './upload-progress-animation.model'

export const MOBILE_UPLOAD_MINIMIZED_AUTO_HIDE_MS = 8000

export type UploadHudSummary = {
  state: 'active' | 'complete' | 'failed'
  direction: 'upload' | 'download' | 'mixed' | 'external'
  icon: string
  tone: 'active' | 'success' | 'danger'
  total: number
  active: number
  completed: number
  failed: number
  progress: number
  loadedBytes: number
  totalBytes: number
  indeterminate: boolean
}

export class UploadProgressModel {
  private autoHideTimer: ReturnType<typeof setTimeout> | null = null
  readonly primaryDisplay = new AnimatedTransferValueModel()

  readonly isMobile = computed(() => {
    return getAppContext().store.layoutMode() === 'mobile'
  })

  // UI state
  readonly minimized = atom(false)
  readonly expanded = atom(false)

  // Derived state
  readonly tasks = computed(() => getAppContext().store.uploadTasks())
  readonly hasTasks = computed(() => this.tasks().length > 0)
  readonly stats = computed<UploadStats>(() => getAppContext().store.getUploadStats())
  readonly primaryStats = computed<UploadStats>(() => {
    const store = getAppContext().store
    return typeof store.getActiveTransferBatchStats === 'function'
      ? store.getActiveTransferBatchStats()
      : store.getUploadStats()
  })
  readonly primaryStatsKey = computed(() => {
    const activeTask = [...this.tasks()]
      .reverse()
      .find((task) => task.kind === 'transfer' && (task.status() === 'queued' || task.status() === 'uploading'))

    return activeTask?.batchId ?? 'all-transfers'
  })
  readonly hasActiveTransfers = computed(() => this.stats().uploading > 0)
  readonly hasCompletedTasks = computed(() => this.tasks().some((task) => task.status() === 'done'))
  readonly headerIcon = computed(() => {
    const tasks = this.tasks()
    const transferTasks = tasks.filter((t) => t.kind === 'transfer')
    const hasOpenExternal = tasks.some((t) => t.kind === 'open-external')
    const hasDownloads = transferTasks.some((t) => t.direction === 'download')
    const hasUploads = transferTasks.some((t) => t.direction === 'upload')
    if (hasOpenExternal && !hasDownloads && !hasUploads) {
      return 'box-arrow-up-right'
    }
    return hasDownloads && !hasUploads ? 'cloud-download' : 'cloud-upload'
  })
  readonly hudSummary = computed<UploadHudSummary>(() => {
    const tasks = this.tasks()
    const stats = this.stats()
    const primaryStats = this.primaryStats()
    const direction = this.getHudDirection(tasks)
    const failed = stats.failed
    const state: UploadHudSummary['state'] =
      failed > 0 ? 'failed' : stats.total > 0 && stats.uploading === 0 ? 'complete' : 'active'
    const tone: UploadHudSummary['tone'] =
      state === 'failed' ? 'danger' : state === 'complete' ? 'success' : 'active'
    const summaryFailed = state === 'failed' ? stats.failed : primaryStats.failed

    return {
      state,
      direction,
      icon: this.getHudIcon(direction),
      tone,
      total: primaryStats.total,
      active: primaryStats.uploading,
      completed: primaryStats.completed,
      failed: summaryFailed,
      progress: primaryStats.overallProgress,
      loadedBytes: primaryStats.loadedBytes,
      totalBytes: primaryStats.totalBytes,
      indeterminate: primaryStats.uploading > 0 && primaryStats.totalBytes <= 0,
    }
  })

  private getHudDirection(tasks: UploadTask[]): UploadHudSummary['direction'] {
    const hasOpenExternal = tasks.some((task) => task.kind === 'open-external')
    const transferTasks = tasks.filter((task) => task.kind === 'transfer')
    const hasUploads = transferTasks.some((task) => task.direction === 'upload')
    const hasDownloads = transferTasks.some((task) => task.direction === 'download')
    const directionCount = [hasUploads, hasDownloads, hasOpenExternal].filter(Boolean).length

    if (directionCount > 1) return 'mixed'
    if (hasOpenExternal) return 'external'
    if (hasDownloads) return 'download'
    return 'upload'
  }

  private getHudIcon(direction: UploadHudSummary['direction']): string {
    switch (direction) {
      case 'download':
        return 'cloud-download'
      case 'external':
        return 'box-arrow-up-right'
      case 'mixed':
        return 'arrow-down-up'
      case 'upload':
        return 'cloud-upload'
    }
  }

  syncPrimaryDisplay() {
    const stats = this.primaryStats()
    const done = stats.total > 0 && stats.uploading === 0 && stats.failed === 0
    this.primaryDisplay.setTargets({
      key: this.primaryStatsKey(),
      progress: stats.overallProgress,
      loadedBytes: stats.loadedBytes,
      active: stats.uploading > 0 || done,
      done,
    })
  }

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
    return (
      this.isMobile() && !this.expanded() && stats.total > 0 && stats.uploading === 0 && stats.failed === 0
    )
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

  dispose() {
    this.cancelAutoHideClear()
    this.primaryDisplay.dispose()
  }
}
