import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {
  UploadProgressModel,
  MOBILE_UPLOAD_MINIMIZED_AUTO_HIDE_MS,
} from '../../src/features/file-manager/components/upload-progress.model'
import {atom} from '@reatom/core'
import {Store} from '../../src/app/state/store'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {UploadTask} from '../../src/types/upload-task'

function createUploadStats(tasks: UploadTask[]) {
  const total = tasks.length
  const completed = tasks.filter((t) => t.status() === 'done').length
  const failed = tasks.filter((t) => t.status() === 'error').length
  const uploading = tasks.filter((t) => t.status() === 'queued' || t.status() === 'uploading').length
  const totalBytes = tasks.reduce((sum, t) => sum + (t.total() || 0), 0)
  const loadedBytes = tasks.reduce((sum, t) => sum + (t.loaded() || 0), 0)
  const overallProgress = totalBytes > 0 ? (loadedBytes / totalBytes) * 100 : 0
  return {total, completed, failed, uploading, overallProgress, totalBytes, loadedBytes}
}

function initUploadProgressContext(uploadTasks: () => UploadTask[], getActiveTasks = uploadTasks) {
  initAppContext(
    createMockAppContext({
      store: {
        layoutMode: atom<'mobile' | 'desktop'>('mobile'),
        uploadTasks,
        getUploadStats: () => createUploadStats(uploadTasks()),
        getActiveTransferBatchStats: () => createUploadStats(getActiveTasks()),
        clearCompletedUploadTasks: () => {},
      } as any,
    }),
  )
}

describe('UploadProgressModel hud summary', () => {
  afterEach(() => {
    clearAppContext()
  })

  it('summarizes an active upload batch', () => {
    const uploadTasks = atom<UploadTask[]>([])
    initUploadProgressContext(uploadTasks)

    const task = new UploadTask({id: 'uploading-task', name: 'archive.zip', total: 1_024})
    task.setProgress(512)
    uploadTasks.set([task])

    const summary = new UploadProgressModel().hudSummary()
    expect(summary).toEqual({
      state: 'active',
      direction: 'upload',
      icon: 'cloud-upload',
      tone: 'active',
      total: 1,
      active: 1,
      completed: 0,
      failed: 0,
      progress: 50,
      loadedBytes: 512,
      totalBytes: 1_024,
      indeterminate: false,
    })
  })

  it('summarizes an active download batch', () => {
    const uploadTasks = atom<UploadTask[]>([])
    initUploadProgressContext(uploadTasks)

    uploadTasks.set([
      new UploadTask({
        id: 'download-task',
        name: 'report.pdf',
        total: 2_048,
        direction: 'download',
      }),
    ])

    const summary = new UploadProgressModel().hudSummary()
    expect(summary.direction).toBe('download')
    expect(summary.icon).toBe('cloud-download')
    expect(summary.state).toBe('active')
  })

  it('summarizes a mixed transfer batch', () => {
    const uploadTasks = atom<UploadTask[]>([])
    initUploadProgressContext(uploadTasks)

    uploadTasks.set([
      new UploadTask({id: 'upload-task', name: 'archive.zip', total: 1_024}),
      new UploadTask({
        id: 'download-task',
        name: 'report.pdf',
        total: 2_048,
        direction: 'download',
      }),
    ])

    const summary = new UploadProgressModel().hudSummary()
    expect(summary.direction).toBe('mixed')
    expect(summary.icon).toBe('arrow-down-up')
    expect(summary.total).toBe(2)
    expect(summary.active).toBe(2)
  })

  it('summarizes failed transfers with danger tone', () => {
    const uploadTasks = atom<UploadTask[]>([])
    initUploadProgressContext(uploadTasks)

    const failedTask = new UploadTask({id: 'failed-task', name: 'failed.bin', total: 512})
    failedTask.markError()
    uploadTasks.set([failedTask])

    const summary = new UploadProgressModel().hudSummary()
    expect(summary.state).toBe('failed')
    expect(summary.tone).toBe('danger')
    expect(summary.failed).toBe(1)
    expect(summary.active).toBe(0)
  })

  it('keeps global failed count when a separate active batch is selected', () => {
    const uploadTasks = atom<UploadTask[]>([])
    const failedTask = new UploadTask({id: 'failed-task', name: 'failed.bin', total: 512})
    failedTask.markError()
    const activeTask = new UploadTask({id: 'active-task', name: 'active.bin', total: 512})
    initUploadProgressContext(uploadTasks, () => [activeTask])
    uploadTasks.set([failedTask, activeTask])

    const summary = new UploadProgressModel().hudSummary()
    expect(summary.state).toBe('failed')
    expect(summary.failed).toBe(1)
    expect(summary.total).toBe(1)
    expect(summary.active).toBe(1)
  })

  it('summarizes completed transfers with success tone', () => {
    const uploadTasks = atom<UploadTask[]>([])
    initUploadProgressContext(uploadTasks)

    const doneTask = new UploadTask({id: 'done-task', name: 'done.bin', total: 512})
    doneTask.markDone()
    uploadTasks.set([doneTask])

    const summary = new UploadProgressModel().hudSummary()
    expect(summary.state).toBe('complete')
    expect(summary.tone).toBe('success')
    expect(summary.completed).toBe(1)
    expect(summary.progress).toBe(100)
    expect(summary.loadedBytes).toBe(512)
  })

  it('summarizes open-external tasks as external transfers', () => {
    const uploadTasks = atom<UploadTask[]>([])
    initUploadProgressContext(uploadTasks)

    uploadTasks.set([
      new UploadTask({
        id: 'open-external',
        name: 'report.pdf',
        total: 512,
        kind: 'open-external',
      }),
    ])

    const summary = new UploadProgressModel().hudSummary()
    expect(summary.direction).toBe('external')
    expect(summary.icon).toBe('box-arrow-up-right')
  })
})

describe('UploadProgressModel auto-hide behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    clearAppContext()
  })

  it('clears completed tasks after the mobile minimized delay when all transfers succeeded', () => {
    const layoutMode = atom<'mobile' | 'desktop'>('mobile')
    const uploadTasks = atom<UploadTask[]>([])
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
    const layoutMode = atom<'mobile' | 'desktop'>('mobile')
    const uploadTasks = atom<UploadTask[]>([])
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
    const layoutMode = atom<'mobile' | 'desktop'>('mobile')
    const uploadTasks = atom<UploadTask[]>([])
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
    const layoutMode = atom<'mobile' | 'desktop'>('mobile')
    const uploadTasks = atom<UploadTask[]>([])
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

describe('open-external transfer tasks', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('auto-removes completed open-external tasks after 4 seconds', () => {
    const store = new Store(
      {
        connected: atom(true),
        connecting: atom(false),
        lastError: atom<string | undefined>(undefined),
      } as any,
      {data: atom({})} as any,
      {
        syncing: atom(false),
        lastError: atom<unknown>(null),
      } as any,
    )

    const {id} = store.createOpenExternalTask('report.pdf', 4096)
    expect(store.uploadTasks()).toHaveLength(1)

    store.updateUploadTask(id, {status: 'done'})
    vi.advanceTimersByTime(3999)
    expect(store.uploadTasks()).toHaveLength(1)

    vi.advanceTimersByTime(1)
    expect(store.uploadTasks()).toHaveLength(0)
  })
})

describe('active transfer batch stats', () => {
  it('scopes primary progress to the newest active transfer batch', () => {
    const store = new Store(
      {
        connected: atom(true),
        connecting: atom(false),
        lastError: atom<string | undefined>(undefined),
      } as any,
      {data: atom({})} as any,
      {
        syncing: atom(false),
        lastError: atom<unknown>(null),
      } as any,
    )

    const oldFailed = new UploadTask({
      id: 'old-failed',
      name: 'old.bin',
      total: 1_000,
      batchId: 'old-batch',
    })
    oldFailed.markError()

    const first = new UploadTask({
      id: 'batch-first',
      name: 'first.bin',
      total: 100,
      batchId: 'batch-a',
      batchIndex: 0,
      batchCount: 3,
    })
    first.markDone()

    const second = new UploadTask({
      id: 'batch-second',
      name: 'second.bin',
      total: 200,
      batchId: 'batch-a',
      batchIndex: 1,
      batchCount: 3,
    })
    second.setProgress(50)

    const third = new UploadTask({
      id: 'batch-third',
      name: 'third.bin',
      total: 300,
      batchId: 'batch-a',
      batchIndex: 2,
      batchCount: 3,
      initialStatus: 'queued',
    })

    store.addUploadTask(oldFailed)
    store.addUploadTask(first)
    store.addUploadTask(second)
    store.addUploadTask(third)

    const stats = store.getActiveTransferBatchStats()
    expect(stats).toEqual({
      total: 3,
      completed: 1,
      failed: 0,
      uploading: 2,
      overallProgress: 25,
      totalBytes: 600,
      loadedBytes: 150,
    })
  })
})
