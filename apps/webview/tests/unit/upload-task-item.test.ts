import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {UploadTaskItem} from '../../src/features/file-manager/components/upload-task-item'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {UploadTask} from '../../src/types/upload-task'

const isolateLtr = (value: string) => `\u2066${value}\u2069`
const isolateAuto = (value: string) => `\u2068${value}\u2069`

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
    const taskName = 'تقرير-final.zip'
    const task = new UploadTask({
      id: 'task-transfer',
      name: taskName,
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
    const taskNameElement = element.shadowRoot?.querySelector('.task-name')
    expect(taskNameElement?.getAttribute('title')).toBe(isolateAuto(taskName))
    expect(taskNameElement?.querySelector('bdi[dir="auto"]')?.textContent).toBe(taskName)
    expect(element.shadowRoot?.querySelector('.task-size bdi[dir="ltr"]')?.textContent).toBe(
      '1000 B / 1000 B',
    )
    expect(element.shadowRoot?.querySelector('.task-progress-value bdi[dir="ltr"]')?.textContent).toBe('99%')
    expect(text).toContain('Finalizing...')
    expect(text).toContain(`${isolateLtr('2 KB')}/s`)
    expect(text).toContain(`${isolateLtr('2')}m left`)
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
    expect(text).toContain('Close')

    const progress = element.shadowRoot?.querySelector('cv-progress.task-progress-bar')
    expect(progress?.hasAttribute('indeterminate')).toBe(true)
    expect(element.shadowRoot?.querySelector('.task-size-row')).toBeNull()
  })

  it('delegates open-external close to the store cancel entrypoint', async () => {
    const cancelUploadTask = vi.fn()
    initAppContext(
      createMockAppContext({
        store: {
          cancelUploadTask,
          retryUploadTask: vi.fn(),
        } as any,
      }),
    )
    const task = new UploadTask({
      id: 'task-open-close',
      name: 'report.pdf',
      total: 0,
      kind: 'open-external',
    })

    const element = document.createElement('upload-task-item') as UploadTaskItem
    element.task = task
    document.body.appendChild(element)
    await settle(element)

    const closeButton = Array.from(element.shadowRoot?.querySelectorAll('cv-button') ?? []).find((button) =>
      button.textContent?.includes('Close'),
    )
    expect(closeButton).not.toBeUndefined()

    closeButton?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))

    expect(cancelUploadTask).toHaveBeenCalledWith('task-open-close')
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

  it('renders a persistent native failure reason without unknown size progress', async () => {
    const task = new UploadTask({
      id: 'task-native-staging-failed',
      name: 'Upload files',
      total: 0,
      kind: 'transfer',
      initialStatus: 'error',
      retryable: true,
      errorMessage: 'ChromVoid couldn’t prepare the selected files in iOS. Try again.',
    })

    const element = document.createElement('upload-task-item') as UploadTaskItem
    element.task = task
    document.body.appendChild(element)
    await settle(element)

    const error = element.shadowRoot?.querySelector('.task-error')
    expect(error?.textContent).toBe(
      'ChromVoid couldn’t prepare the selected files in iOS. Try again.',
    )
    expect(error?.getAttribute('aria-live')).toBe('polite')
    expect(element.shadowRoot?.querySelector('.task-size-row')).toBeNull()
    expect(element.shadowRoot?.textContent).toContain('Retry')
  })
})
