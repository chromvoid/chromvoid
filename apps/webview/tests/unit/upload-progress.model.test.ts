import {state} from '@statx/core'

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {UploadProgressModel, MOBILE_UPLOAD_MINIMIZED_AUTO_HIDE_MS} from '../../src/features/file-manager/components/upload-progress.model'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {UploadTask} from '../../src/types/upload-task'

function createUploadStats(tasks: UploadTask[]) {
  const total = tasks.length
  const completed = tasks.filter((t) => t.status() === 'done').length
  const failed = tasks.filter((t) => t.status() === 'error').length
  const uploading = tasks.filter((t) => t.status() === 'uploading').length
  const totalBytes = tasks.reduce((sum, t) => sum + (t.total() || 0), 0)
  const loadedBytes = tasks.reduce((sum, t) => sum + (t.loaded() || 0), 0)
  const overallProgress = totalBytes > 0 ? (loadedBytes / totalBytes) * 100 : 0
  return {total, completed, failed, uploading, overallProgress, totalBytes, loadedBytes}
}

describe('UploadProgressModel auto-hide behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    clearAppContext()
  })

  it('clears completed tasks after 4s when all transfers succeeded in minimized mobile mode', () => {
    const layoutMode = state<'mobile' | 'desktop'>('mobile')
    const uploadTasks = state<UploadTask[]>([])
    const clearCompletedUploadTasks = vi.fn(() => {
      uploadTasks.set(uploadTasks().filter((task) => task.status() !== 'done'))
    })

    initAppContext(
      createMockAppContext({
        store: {
          layoutMode,
          uploadTasks,
          getUploadStats: () => createUploadStats(uploadTasks()),
          clearCompletedUploadTasks,
        } as any,
      }),
    )

    const model = new UploadProgressModel()
    const doneTask = new UploadTask({id: 'done-1', name: 'file.bin', total: 128})
    doneTask.markDone()
    uploadTasks.set([doneTask])

    model.reconcileAutoHideClear()
    vi.advanceTimersByTime(MOBILE_UPLOAD_MINIMIZED_AUTO_HIDE_MS - 1)
    expect(clearCompletedUploadTasks).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(clearCompletedUploadTasks).toHaveBeenCalledTimes(1)
    expect(uploadTasks()).toHaveLength(0)
  })

  it('cancels auto-hide timer when a new transfer starts', () => {
    const layoutMode = state<'mobile' | 'desktop'>('mobile')
    const uploadTasks = state<UploadTask[]>([])
    const clearCompletedUploadTasks = vi.fn(() => {
      uploadTasks.set(uploadTasks().filter((task) => task.status() !== 'done'))
    })

    initAppContext(
      createMockAppContext({
        store: {
          layoutMode,
          uploadTasks,
          getUploadStats: () => createUploadStats(uploadTasks()),
          clearCompletedUploadTasks,
        } as any,
      }),
    )

    const model = new UploadProgressModel()
    const doneTask = new UploadTask({id: 'done-2', name: 'done.bin', total: 128})
    doneTask.markDone()
    uploadTasks.set([doneTask])

    model.reconcileAutoHideClear()

    const uploadingTask = new UploadTask({id: 'upload-1', name: 'upload.bin', total: 256})
    uploadTasks.set([doneTask, uploadingTask])
    model.reconcileAutoHideClear()

    vi.advanceTimersByTime(MOBILE_UPLOAD_MINIMIZED_AUTO_HIDE_MS + 50)
    expect(clearCompletedUploadTasks).not.toHaveBeenCalled()
    expect(uploadTasks()).toHaveLength(2)
  })

  it('cancels auto-hide timer when transfer sheet is expanded', () => {
    const layoutMode = state<'mobile' | 'desktop'>('mobile')
    const uploadTasks = state<UploadTask[]>([])
    const clearCompletedUploadTasks = vi.fn(() => {
      uploadTasks.set(uploadTasks().filter((task) => task.status() !== 'done'))
    })

    initAppContext(
      createMockAppContext({
        store: {
          layoutMode,
          uploadTasks,
          getUploadStats: () => createUploadStats(uploadTasks()),
          clearCompletedUploadTasks,
        } as any,
      }),
    )

    const model = new UploadProgressModel()
    const doneTask = new UploadTask({id: 'done-3', name: 'expanded.bin', total: 128})
    doneTask.markDone()
    uploadTasks.set([doneTask])

    model.reconcileAutoHideClear()
    model.expand()
    model.reconcileAutoHideClear()

    vi.advanceTimersByTime(MOBILE_UPLOAD_MINIMIZED_AUTO_HIDE_MS + 50)
    expect(clearCompletedUploadTasks).not.toHaveBeenCalled()
    expect(uploadTasks()).toHaveLength(1)
  })

  it('does not schedule auto-hide when there are failed transfers', () => {
    const layoutMode = state<'mobile' | 'desktop'>('mobile')
    const uploadTasks = state<UploadTask[]>([])
    const clearCompletedUploadTasks = vi.fn(() => {
      uploadTasks.set(uploadTasks().filter((task) => task.status() !== 'done'))
    })

    initAppContext(
      createMockAppContext({
        store: {
          layoutMode,
          uploadTasks,
          getUploadStats: () => createUploadStats(uploadTasks()),
          clearCompletedUploadTasks,
        } as any,
      }),
    )

    const model = new UploadProgressModel()
    const failedTask = new UploadTask({id: 'failed-1', name: 'failed.bin', total: 128})
    failedTask.markError()
    uploadTasks.set([failedTask])

    model.reconcileAutoHideClear()
    vi.advanceTimersByTime(MOBILE_UPLOAD_MINIMIZED_AUTO_HIDE_MS + 50)

    expect(clearCompletedUploadTasks).not.toHaveBeenCalled()
    expect(uploadTasks()).toHaveLength(1)
  })
})
