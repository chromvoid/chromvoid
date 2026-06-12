import {afterEach, describe, expect, it, vi} from 'vitest'

import {atom} from '@reatom/core'

import {Store} from '../../src/app/state/store'
import {ChromVoidState} from '../../src/core/state/app-state'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {UploadTask} from '../../src/types/upload-task'
import type {
  NativeUploadCompleted,
  NativeUploadFailed,
  NativeUploadFile,
  NativeUploadProgress,
} from '../../src/core/transport/transport'
import {
  hasPendingUploadedImageDerivativePrewarm,
  resetImageDerivativePrewarmForTests,
} from '../../src/features/media/components/image-derivative-prewarm'

type UploadNativeFilesMock = (
  parentPath: string,
  opts?: {
    uploadId?: string
    readChunkSize?: number
    onSelected?: (files: NativeUploadFile[]) => void
    onProgress?: (progress: NativeUploadProgress) => void
    onCompleted?: (progress: NativeUploadCompleted) => void
    onFailed?: (failed: NativeUploadFailed) => void
  },
) => Promise<void>

function createStore(overrides?: {
  kind?: 'ws' | 'tauri'
  uploadFile?: () => Promise<{nodeId: number}>
  uploadFilePath?: () => Promise<{nodeId: number}>
  uploadNativeFiles?: UploadNativeFilesMock
}) {
  const ws = {
    kind: overrides?.kind ?? ('ws' as const),
    connected: atom(true),
    connecting: atom(false),
    lastError: atom<string | undefined>(undefined),
    uploadFile: vi.fn(overrides?.uploadFile ?? (async () => ({nodeId: 7}))),
    uploadFilePath: overrides?.uploadFilePath ? vi.fn(overrides.uploadFilePath) : undefined,
    uploadNativeFiles: overrides?.uploadNativeFiles ? vi.fn(overrides.uploadNativeFiles) : undefined,
  }

  const catalog = {
    syncing: atom(false),
    lastError: atom<string | null>(null),
    api: {
      upload: vi.fn(async () => ({nodeId: 7})),
    },
    refresh: vi.fn(async () => undefined),
  }

  return {
    store: new Store(ws as any, new ChromVoidState(), catalog as any),
    ws,
    catalog,
  }
}

describe('Store upload status messages', () => {
  afterEach(() => {
    resetImageDerivativePrewarmForTests()
    resetRuntimeCapabilities()
  })

  it('publishes the translated success message after a file upload completes', async () => {
    const {store, ws, catalog} = createStore()
    const file = new File(['payload'], 'report.txt', {type: 'text/plain'})

    await store.startUploadFile('/', file)

    expect(ws.uploadFile).toHaveBeenCalledTimes(1)
    expect(ws.uploadFile).toHaveBeenCalledWith(
      {parentPath: undefined, name: 'report.txt'},
      file,
      expect.objectContaining({chunkSize: 65536, name: 'report.txt', type: 'text/plain'}),
    )
    expect(store.statusMessage()?.message).toBe('File "report.txt" uploaded')
  })

  it('marks uploaded images for demand-driven derivative prewarm without blocking upload completion', async () => {
    const {store} = createStore()
    const file = new File(['payload'], 'photo.jpg', {type: 'image/jpeg'})

    await store.startUploadFile('/', file)

    expect(hasPendingUploadedImageDerivativePrewarm(7)).toBe(true)
  })

  it('publishes the translated error message with the file-name suffix when upload fails', async () => {
    const {store} = createStore({
      uploadFile: async () => {
        throw new Error('Disk full')
      },
    })
    const file = new File(['payload'], 'broken.txt', {type: 'text/plain'})

    await store.startUploadFile('/', file)

    expect(store.statusMessage()?.message).toBe('Upload error "broken.txt": Disk full')
  })

  it('creates all browser file upload tasks before the first upload finishes', async () => {
    const {store} = createStore()
    const files = [
      new File(['one'], 'one.txt', {type: 'text/plain'}),
      new File(['two'], 'two.txt', {type: 'text/plain'}),
    ]

    const upload = store.startUploadFiles('/', files)
    const tasks = store.uploadTasks()

    expect(tasks).toHaveLength(2)
    expect(tasks[0]?.status()).toBe('uploading')
    expect(tasks[1]?.status()).toBe('queued')
    expect(tasks[0]?.batchId).toBe(tasks[1]?.batchId)
    expect(tasks[0]?.batchCount).toBe(2)
    expect(tasks[1]?.batchIndex).toBe(1)

    await upload

    expect(store.uploadTasks().map((task) => task.status())).toEqual(['done', 'done'])
  })

  it('creates resolved desktop path upload tasks before the first path upload finishes', async () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_native_path_io: true,
    })

    let resolveUpload: (() => void) | null = null
    const uploadStarted = new Promise<void>((resolve) => {
      resolveUpload = resolve
    })
    const {store, ws, catalog} = createStore({
      kind: 'tauri',
      uploadFilePath: async () => {
        await uploadStarted
        return {nodeId: 7}
      },
    })

    const upload = store.startUploadPaths('/', [
      {token: 'token-one', name: 'one.bin', size: 100},
      {token: 'token-two', name: 'two.bin', size: 300},
    ])

    for (let i = 0; i < 6 && store.uploadTasks().length < 2; i += 1) {
      await Promise.resolve()
    }

    const tasks = store.uploadTasks()
    expect(tasks).toHaveLength(2)
    expect(tasks[0]?.status()).toBe('uploading')
    expect(tasks[1]?.status()).toBe('queued')
    expect(tasks[0]?.batchId).toBe(tasks[1]?.batchId)
    expect(tasks[1]?.batchCount).toBe(2)

    resolveUpload?.()
    await upload

    expect(ws.uploadFilePath).toHaveBeenCalledTimes(2)
    expect(ws.uploadFilePath).toHaveBeenCalledWith(
      {parentPath: undefined, name: 'one.bin'},
      'token-one',
      expect.objectContaining({chunkSize: 512 * 1024, totalBytes: 100}),
    )
    expect(store.uploadTasks().map((task) => task.status())).toEqual(['done', 'done'])
  })

  it('retries a failed browser file upload through the retained source', async () => {
    const uploadFile = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({nodeId: 8})
    const {store} = createStore({uploadFile})
    const file = new File(['payload'], 'retry.txt', {type: 'text/plain'})

    await store.startUploadFile('/docs', file)

    const task = store.uploadTasks()[0]
    expect(task?.status()).toBe('error')
    expect(task?.retryable).toBe(true)
    expect(store.canRetryUploadTask(task!.id)).toBe(true)

    await expect(store.retryUploadTask(task!.id)).resolves.toBe(true)

    expect(uploadFile).toHaveBeenCalledTimes(2)
    expect(uploadFile).toHaveBeenLastCalledWith(
      {parentPath: '/docs', name: 'retry.txt'},
      file,
      expect.objectContaining({chunkSize: 65536, name: 'retry.txt', type: 'text/plain'}),
    )
    expect(task?.status()).toBe('done')
    expect(store.canRetryUploadTask(task!.id)).toBe(false)
  })

  it('keeps non-retryable upload tasks failed and reports retry unavailability', async () => {
    const {store} = createStore()
    const task = new UploadTask({
      id: 'native-old',
      name: 'native.bin',
      total: 100,
      kind: 'transfer',
      initialStatus: 'error',
    })
    store.addUploadTask(task)

    await expect(store.retryUploadTask(task.id)).resolves.toBe(false)

    expect(task.status()).toBe('error')
    expect(store.statusMessage()?.message).toBe('This upload cannot be retried. Start the upload again.')
  })

  it('updates native upload tasks from selected, progress, and completed events', async () => {
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_native_file_upload: true,
    })

    const statusSnapshots: string[][] = []
    let storeRef: Store | null = null
    const {store, ws, catalog} = createStore({
      kind: 'tauri',
      uploadNativeFiles: async (_parentPath, opts) => {
        const uploadId = opts?.uploadId ?? 'upload-1'
        opts?.onSelected?.([
          {
            fileId: 'upload-1-0',
            nodeId: 51,
            name: 'photo.jpg',
            mimeType: 'image/jpeg',
            totalBytes: 100,
          },
        ])
        statusSnapshots.push(storeRef?.uploadTasks().map((task) => task.status()) ?? [])
        opts?.onProgress?.({
          uploadId,
          fileId: 'upload-1-0',
          nodeId: 51,
          loadedBytes: 40,
          totalBytes: 100,
        })
        statusSnapshots.push(storeRef?.uploadTasks().map((task) => task.status()) ?? [])
        opts?.onCompleted?.({
          uploadId,
          fileId: 'upload-1-0',
          nodeId: 51,
          loadedBytes: 100,
          totalBytes: 100,
        })
        statusSnapshots.push(storeRef?.uploadTasks().map((task) => task.status()) ?? [])
      },
    })
    storeRef = store

    await store.startNativeUploadFiles('/Photos')

    expect(ws.uploadNativeFiles).toHaveBeenCalledWith(
      '/Photos',
      expect.objectContaining({
        readChunkSize: 512 * 1024,
      }),
    )
    expect(statusSnapshots).toEqual([['uploading'], ['uploading'], ['done']])
    expect(catalog.refresh).toHaveBeenCalled()
    expect(hasPendingUploadedImageDerivativePrewarm(51)).toBe(true)
  })
})
