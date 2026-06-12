import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {UploadTaskItem} from '../../src/features/file-manager/components/upload-task-item'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {UploadTask} from '../../src/types/upload-task'

async function settle(element: UploadTaskItem) {
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
}

describe('upload-task-item', () => {
  const originalMatchMedia = window.matchMedia

  beforeEach(() => {
    UploadTaskItem.define()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    window.matchMedia = originalMatchMedia
    clearAppContext()
    vi.restoreAllMocks()
  })

  it('renders transfer finalizing state with speed and remaining time', async () => {
    const task = new UploadTask({
      id: 'task-transfer',
      name: 'archive.zip',
      total: 1_000,
      kind: 'transfer',
      direction: 'upload',
    })
    task.setProgress(1_000, 2_048, 90)

    const element = document.createElement('upload-task-item') as UploadTaskItem
    element.task = task
    document.body.appendChild(element)
    await settle(element)

    const text = element.shadowRoot?.textContent ?? ''
    expect(text).toContain('Finalizing...')
    expect(text).toContain('2 KB/s')
    expect(text).toContain('2m left')
    expect(text).toContain('Cancel')
    expect(text).toContain('99%')
  })

  it('renders open-external preparation as an indeterminate task', async () => {
    const task = new UploadTask({
      id: 'task-open-external',
      name: 'report.pdf',
      total: 0,
      kind: 'open-external',
    })

    const element = document.createElement('upload-task-item') as UploadTaskItem
    element.task = task
    document.body.appendChild(element)
    await settle(element)

    const text = element.shadowRoot?.textContent ?? ''
    expect(text).toContain('Preparing file...')

    const progress = element.shadowRoot?.querySelector('cv-progress.task-progress-bar')
    expect(progress?.hasAttribute('indeterminate')).toBe(true)
    expect(element.shadowRoot?.querySelector('.task-size-row')).toBeNull()
  })

  it('renders queued native upload tasks without a per-file progress percentage', async () => {
    const task = new UploadTask({
      id: 'task-queued',
      name: 'movie.mov',
      total: 0,
      kind: 'transfer',
      initialStatus: 'queued',
    })

    const element = document.createElement('upload-task-item') as UploadTaskItem
    element.task = task
    document.body.appendChild(element)
    await settle(element)

    const text = element.shadowRoot?.textContent ?? ''
    expect(text).toContain('Queued')

    const progress = element.shadowRoot?.querySelector('cv-progress.task-progress-bar')
    expect(progress?.classList.contains('queued')).toBe(true)
    expect(progress?.hasAttribute('indeterminate')).toBe(true)
    expect(element.shadowRoot?.querySelector('.task-size-row')).toBeNull()
  })

  it('snaps displayed progress updates when reduced motion is requested', async () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })

    const task = new UploadTask({
      id: 'task-reduced-motion',
      name: 'smooth.zip',
      total: 1_000,
      kind: 'transfer',
      direction: 'upload',
    })

    const element = document.createElement('upload-task-item') as UploadTaskItem
    element.task = task
    document.body.appendChild(element)
    await settle(element)

    task.setProgress(500)
    await settle(element)

    const text = element.shadowRoot?.textContent ?? ''
    expect(text).toContain('500 B / 1000 B')
    expect(text).toContain('50%')
  })

  it('hides retry for non-retryable failed transfer tasks', async () => {
    const task = new UploadTask({
      id: 'task-native-failed',
      name: 'native.bin',
      total: 100,
      kind: 'transfer',
      initialStatus: 'error',
    })

    const element = document.createElement('upload-task-item') as UploadTaskItem
    element.task = task
    document.body.appendChild(element)
    await settle(element)

    const text = element.shadowRoot?.textContent ?? ''
    expect(text).not.toContain('Retry')
    expect(text).toContain('Cancel')
  })

  it('delegates retryable failed transfer tasks to the store retry entrypoint', async () => {
    const retryUploadTask = vi.fn(async () => true)
    const updateUploadTask = vi.fn()
    initAppContext(
      createMockAppContext({
        store: {
          retryUploadTask,
          updateUploadTask,
          cancelUploadTask: vi.fn(),
        } as any,
      }),
    )
    const task = new UploadTask({
      id: 'task-browser-failed',
      name: 'browser.txt',
      total: 100,
      kind: 'transfer',
      initialStatus: 'error',
      retryable: true,
    })

    const element = document.createElement('upload-task-item') as UploadTaskItem
    element.task = task
    document.body.appendChild(element)
    await settle(element)

    const retryButton = Array.from(element.shadowRoot?.querySelectorAll('cv-button') ?? []).find((button) =>
      button.textContent?.includes('Retry'),
    )
    expect(retryButton).not.toBeUndefined()

    retryButton?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))

    expect(retryUploadTask).toHaveBeenCalledWith('task-browser-failed')
    expect(updateUploadTask).not.toHaveBeenCalled()
  })
})
