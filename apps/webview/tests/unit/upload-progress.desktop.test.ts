import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {atom} from '@reatom/core'

import {UploadProgressDesktop} from '../../src/features/file-manager/components/upload-progress.desktop'
import {UploadProgressModel} from '../../src/features/file-manager/components/upload-progress.model'
import {UploadTask} from '../../src/types/upload-task'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

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

async function settle(element: UploadProgressDesktop) {
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
}

describe('upload-progress-desktop', () => {
  beforeEach(() => {
    UploadProgressDesktop.define()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    clearAppContext()
  })

  it('renders expanded transfer summary and footer labels', async () => {
    const uploadTasks = atom<UploadTask[]>([])

    initAppContext(
      createMockAppContext({
        store: {
          layoutMode: atom<'mobile' | 'desktop'>('desktop'),
          uploadTasks,
          getUploadStats: () => createUploadStats(uploadTasks()),
          getActiveTransferBatchStats: () => createUploadStats(uploadTasks()),
          clearCompletedUploadTasks: () => {},
        } as any,
      }),
    )

    const doneTask = new UploadTask({id: 'done-task', name: 'done.bin', total: 1024})
    doneTask.markDone()
    const activeTask = new UploadTask({id: 'active-task', name: 'active.bin', total: 1024})
    activeTask.setProgress(512)
    uploadTasks.set([doneTask, activeTask])

    const model = new UploadProgressModel()
    const element = document.createElement('upload-progress-desktop') as UploadProgressDesktop
    element.model = model
    document.body.appendChild(element)
    await settle(element)

    const text = element.shadowRoot?.textContent ?? ''
    expect(text).toContain('File transfers (2)')
    expect(text).toContain('Overall progress: 75%')
    expect(text).toContain('1 of 2')
    expect(text).toContain('1.5 KB / 2 KB')

    const buttons = [...(element.shadowRoot?.querySelectorAll<HTMLButtonElement>('.header-btn') ?? [])]
    expect(buttons[0]?.getAttribute('title')).toBe('Clear completed')
    expect(buttons[1]?.getAttribute('title')).toBe('Collapse')
  })

  it('renders expand title when minimized', async () => {
    const uploadTasks = atom<UploadTask[]>([])

    initAppContext(
      createMockAppContext({
        store: {
          layoutMode: atom<'mobile' | 'desktop'>('desktop'),
          uploadTasks,
          getUploadStats: () => createUploadStats(uploadTasks()),
          getActiveTransferBatchStats: () => createUploadStats(uploadTasks()),
          clearCompletedUploadTasks: () => {},
        } as any,
      }),
    )

    const task = new UploadTask({id: 'uploading-task', name: 'archive.zip', total: 1024})
    task.setProgress(512)
    uploadTasks.set([task])

    const model = new UploadProgressModel()
    model.minimized.set(true)

    const element = document.createElement('upload-progress-desktop') as UploadProgressDesktop
    element.model = model
    document.body.appendChild(element)
    await settle(element)

    expect(element.shadowRoot?.querySelector('.collapsible-wrapper')?.classList.contains('collapsed')).toBe(true)

    const buttons = [...(element.shadowRoot?.querySelectorAll<HTMLButtonElement>('.header-btn') ?? [])]
    expect(buttons[1]?.getAttribute('title')).toBe('Expand')
  })

  it('uses active batch stats for footer progress while retaining the full task list', async () => {
    const uploadTasks = atom<UploadTask[]>([])

    const oldTask = new UploadTask({id: 'old-task', name: 'old.bin', total: 1_024, batchId: 'old'})
    oldTask.markDone()
    const activeDone = new UploadTask({
      id: 'active-done',
      name: 'one.bin',
      total: 100,
      batchId: 'active',
      batchIndex: 0,
      batchCount: 2,
    })
    activeDone.markDone()
    const activeQueued = new UploadTask({
      id: 'active-queued',
      name: 'two.bin',
      total: 300,
      batchId: 'active',
      batchIndex: 1,
      batchCount: 2,
      initialStatus: 'queued',
    })
    uploadTasks.set([oldTask, activeDone, activeQueued])

    initAppContext(
      createMockAppContext({
        store: {
          layoutMode: atom<'mobile' | 'desktop'>('desktop'),
          uploadTasks,
          getUploadStats: () => createUploadStats(uploadTasks()),
          getActiveTransferBatchStats: () => createUploadStats([activeDone, activeQueued]),
          clearCompletedUploadTasks: () => {},
        } as any,
      }),
    )

    const model = new UploadProgressModel()
    const element = document.createElement('upload-progress-desktop') as UploadProgressDesktop
    element.model = model
    document.body.appendChild(element)
    await settle(element)

    const text = element.shadowRoot?.textContent ?? ''
    expect(text).toContain('File transfers (3)')
    expect(text).toContain('Overall progress: 25%')
    expect(text).toContain('1 of 2')
    expect(text).toContain('100 B / 400 B')
  })
})
