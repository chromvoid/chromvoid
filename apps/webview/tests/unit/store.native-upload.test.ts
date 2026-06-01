import {afterEach, describe, expect, it, vi} from 'vitest'

import {atom} from '@reatom/core'
import {
  MOBILE_FILE_PICKER_LIFECYCLE_END_EVENT,
  MOBILE_FILE_PICKER_LIFECYCLE_START_EVENT,
  type MobileFilePickerLifecycleStartDetail,
} from '@chromvoid/password-import'

import {Store} from '../../src/app/state/store'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {ChromVoidState} from '../../src/core/state/app-state'
import type {TransportLike} from '../../src/core/transport/transport'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

function createNativeUploadStore(
  uploadNativeFiles: (
    parentPath: string,
    opts?: Parameters<NonNullable<TransportLike['uploadNativeFiles']>>[1],
  ) => Promise<void>,
) {
  const ws = {
    kind: 'tauri' as const,
    connected: atom(true),
    connecting: atom(false),
    lastError: atom<string | undefined>(undefined),
    uploadFile: vi.fn(),
    uploadNativeFiles: vi.fn(uploadNativeFiles),
  }

  const catalog = {
    syncing: atom(false),
    lastError: atom<string | null>(null),
    api: {
    },
    refresh: vi.fn(async () => undefined),
  }

  const store = new Store(ws as any, new ChromVoidState(), catalog as any)
  return {store, ws, catalog}
}

function createAndroidShareUploadStore(
  uploadSharedFiles: (
    parentPath: string,
    shareSessionId: string,
    opts?: Parameters<NonNullable<TransportLike['uploadSharedFiles']>>[2],
  ) => Promise<void>,
) {
  const ws = {
    kind: 'tauri' as const,
    connected: atom(true),
    connecting: atom(false),
    lastError: atom<string | undefined>(undefined),
    uploadFile: vi.fn(),
    uploadSharedFiles: vi.fn(uploadSharedFiles),
    cancelSharedFiles: vi.fn(),
  }

  const catalog = {
    syncing: atom(false),
    lastError: atom<string | null>(null),
    api: {
    },
    refresh: vi.fn(async () => undefined),
  }

  const store = new Store(ws as any, new ChromVoidState(), catalog as any)
  return {store, ws, catalog}
}

describe('Store native upload', () => {
  afterEach(() => {
    clearAppContext()
    resetRuntimeCapabilities()
  })

  it('creates all selected file tasks from native events and keeps overall progress batch-scoped', async () => {
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_native_file_upload: true,
    })

    let store!: Store
    const harness = createNativeUploadStore(async (_parentPath, opts) => {
      opts?.onSelected?.([
        {fileId: 'native-1', nodeId: 11, name: 'a.bin', mimeType: 'application/octet-stream', totalBytes: 100},
        {fileId: 'native-2', nodeId: 12, name: 'b.bin', mimeType: 'application/octet-stream', totalBytes: 300},
      ])

      expect(store.uploadTasks().map((task) => task.id)).toEqual(['native-1', 'native-2'])
      expect(store.uploadTasks().map((task) => task.status())).toEqual(['uploading', 'uploading'])

      opts?.onProgress?.({
        uploadId: opts.uploadId,
        fileId: 'native-1',
        nodeId: 11,
        loadedBytes: 100,
        totalBytes: 100,
      })
      expect(Math.round(store.overallUploadProgress())).toBe(25)

      opts?.onCompleted?.({
        uploadId: opts.uploadId,
        fileId: 'native-1',
        nodeId: 11,
        loadedBytes: 100,
        totalBytes: 100,
      })
      expect(Math.round(store.overallUploadProgress())).toBe(25)

      opts?.onProgress?.({
        uploadId: opts.uploadId,
        fileId: 'native-2',
        nodeId: 12,
        loadedBytes: 150,
        totalBytes: 300,
      })
      expect(Math.round(store.overallUploadProgress())).toBe(63)

      opts?.onCompleted?.({
        uploadId: opts.uploadId,
        fileId: 'native-2',
        nodeId: 12,
        loadedBytes: 300,
        totalBytes: 300,
      })
    })
    store = harness.store

    await store.startNativeUploadFiles('/docs')

    expect(harness.ws.uploadNativeFiles).toHaveBeenCalledWith('/docs', expect.objectContaining({uploadId: expect.any(String)}))
    expect(harness.ws.uploadFile).not.toHaveBeenCalled()
    expect(harness.catalog.refresh).toHaveBeenCalledTimes(1)
    expect(store.uploadTasks().map((task) => task.status())).toEqual(['done', 'done'])
    expect(Math.round(store.overallUploadProgress())).toBe(100)
  })

  it('ignores unknown-size in-flight bytes in aggregate progress until completion supplies a total', async () => {
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_native_file_upload: true,
    })

    let store!: Store
    const harness = createNativeUploadStore(async (_parentPath, opts) => {
      opts?.onSelected?.([
        {fileId: 'native-unknown', nodeId: 21, name: 'stream.bin', mimeType: null, totalBytes: 0},
      ])
      opts?.onProgress?.({
        uploadId: opts.uploadId,
        fileId: 'native-unknown',
        nodeId: 21,
        loadedBytes: 512,
        totalBytes: 0,
      })
      expect(store.overallUploadProgress()).toBe(0)
      opts?.onCompleted?.({
        uploadId: opts.uploadId,
        fileId: 'native-unknown',
        nodeId: 21,
        loadedBytes: 512,
        totalBytes: 512,
      })
    })
    store = harness.store

    await store.startNativeUploadFiles('/')

    expect(store.uploadTasks()[0]?.total()).toBe(512)
    expect(store.uploadTasks()[0]?.status()).toBe('done')
    expect(store.overallUploadProgress()).toBe(100)
  })

  it('marks native upload as a mobile file picker lifecycle session', async () => {
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
      supports_native_file_upload: true,
    })

    const starts: number[] = []
    let endCount = 0
    const handleStart = (event: Event) => {
      const detail = (event as CustomEvent<MobileFilePickerLifecycleStartDetail>).detail
      starts.push(detail.timeoutMs)
    }
    const handleEnd = () => {
      endCount += 1
    }
    window.addEventListener(MOBILE_FILE_PICKER_LIFECYCLE_START_EVENT, handleStart)
    window.addEventListener(MOBILE_FILE_PICKER_LIFECYCLE_END_EVENT, handleEnd)

    try {
      const harness = createNativeUploadStore(async () => {
        expect(starts).toEqual([30_000])
        expect(endCount).toBe(0)
      })

      await harness.store.startNativeUploadFiles('/docs')

      expect(starts).toEqual([30_000])
      expect(endCount).toBe(1)
    } finally {
      window.removeEventListener(MOBILE_FILE_PICKER_LIFECYCLE_START_EVENT, handleStart)
      window.removeEventListener(MOBILE_FILE_PICKER_LIFECYCLE_END_EVENT, handleEnd)
    }
  })

  it('warns once when an image native upload completes with at-risk import provenance', async () => {
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_native_file_upload: true,
    })

    const harness = createNativeUploadStore(async (_parentPath, opts) => {
      opts?.onSelected?.([
        {fileId: 'native-1', nodeId: 31, name: 'first.jpg', mimeType: 'image/jpeg', totalBytes: 100},
        {fileId: 'native-2', nodeId: 32, name: 'second.jpg', mimeType: 'image/jpeg', totalBytes: 100},
      ])
      opts?.onCompleted?.({
        uploadId: opts.uploadId,
        fileId: 'native-1',
        nodeId: 31,
        loadedBytes: 100,
        totalBytes: 100,
        importProvenanceStatus: 'at_risk',
      })
      opts?.onCompleted?.({
        uploadId: opts.uploadId,
        fileId: 'native-2',
        nodeId: 32,
        loadedBytes: 100,
        totalBytes: 100,
        importProvenanceStatus: 'at_risk',
      })
    })
    const pushNotification = vi.spyOn(harness.store, 'pushNotification')

    await harness.store.startNativeUploadFiles('/photos')

    expect(harness.store.uploadTasks().map((task) => task.status())).toEqual(['done', 'done'])
    expect(pushNotification).toHaveBeenCalledWith(
      'warning',
      'Some uploaded photos may be missing location metadata',
    )
    expect(pushNotification.mock.calls.filter(([type]) => type === 'warning')).toHaveLength(1)
  })

  it('starts shared files import through the root parent path', async () => {
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_native_file_upload: true,
      supports_share_import: true,
    })

    const harness = createAndroidShareUploadStore(async (_parentPath, _shareSessionId, opts) => {
      opts?.onSelected?.([
        {fileId: 'shared-1', nodeId: 41, name: 'shared.bin', mimeType: 'application/octet-stream', totalBytes: 64},
      ])
      opts?.onCompleted?.({
        uploadId: 'other-upload',
        fileId: 'shared-1',
        nodeId: 99,
        loadedBytes: 64,
        totalBytes: 64,
      })
      opts?.onCompleted?.({
        uploadId: 'share-upload-1',
        fileId: 'shared-1',
        nodeId: 41,
        loadedBytes: 64,
        totalBytes: 64,
      })
    })
    initAppContext(
      createMockAppContext({
        store: harness.store,
        ws: harness.ws as any,
        catalog: harness.catalog as any,
        state: new ChromVoidState(),
      }),
    )

    const result = await harness.store.startSharedFilesImport(
      {
        sessionId: 'share-session-1',
        files: [{name: 'shared.bin', size: 64, mimeType: 'application/octet-stream'}],
      },
      'share-upload-1',
    )

    expect(result).toEqual({kind: 'success'})
    expect(harness.ws.uploadSharedFiles).toHaveBeenCalledWith(
      '/',
      'share-session-1',
      expect.objectContaining({uploadId: 'share-upload-1'}),
    )
    expect(harness.ws.uploadFile).not.toHaveBeenCalled()
    expect(harness.catalog.refresh).toHaveBeenCalledTimes(1)
    expect(harness.store.uploadTasks().map((task) => task.status())).toEqual(['done'])
  })

  it('returns a partial decision when shared import fails after completed files', async () => {
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_native_file_upload: true,
      supports_share_import: true,
    })

    const harness = createAndroidShareUploadStore(async (_parentPath, _shareSessionId, opts) => {
      opts?.onSelected?.([
        {fileId: 'shared-1', nodeId: 41, name: 'shared-a.bin', mimeType: 'application/octet-stream', totalBytes: 64},
        {fileId: 'shared-2', nodeId: 42, name: 'shared-b.bin', mimeType: 'application/octet-stream', totalBytes: 64},
      ])
      opts?.onCompleted?.({
        uploadId: 'share-upload-2',
        fileId: 'shared-1',
        nodeId: 41,
        loadedBytes: 64,
        totalBytes: 64,
      })
      opts?.onFailed?.({
        uploadId: 'share-upload-2',
        fileId: 'shared-2',
        message: 'permission denied',
        code: 'ANDROID_SHARE_PERMISSION_DENIED',
      })
      throw Object.assign(new Error('permission denied'), {code: 'ANDROID_SHARE_PERMISSION_DENIED'})
    })

    const result = await harness.store.startSharedFilesImport(
      {
        sessionId: 'share-session-2',
        files: [
          {name: 'shared-a.bin', size: 64, mimeType: 'application/octet-stream'},
          {name: 'shared-b.bin', size: 64, mimeType: 'application/octet-stream'},
        ],
      },
      'share-upload-2',
    )

    expect(result).toEqual({
      kind: 'partial',
      decision: {
        uploadId: 'share-upload-2',
        completed: [{fileId: 'shared-1', nodeId: 41, name: 'shared-a.bin'}],
        failedCount: 1,
        failedMessage: 'permission denied',
        failedCode: 'ANDROID_SHARE_PERMISSION_DENIED',
      },
    })
    expect(harness.catalog.refresh).toHaveBeenCalledTimes(1)
    expect(harness.store.uploadTasks().map((task) => task.status())).toEqual(['done', 'error'])
  })

  it('fails shared import before completion by marking selected tasks failed', async () => {
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_native_file_upload: true,
      supports_share_import: true,
    })

    const harness = createAndroidShareUploadStore(async (_parentPath, _shareSessionId, opts) => {
      opts?.onSelected?.([
        {fileId: 'shared-1', nodeId: 41, name: 'shared-a.bin', mimeType: 'application/octet-stream', totalBytes: 64},
        {fileId: 'shared-2', nodeId: 42, name: 'shared-b.bin', mimeType: 'application/octet-stream', totalBytes: 64},
      ])
      throw new Error('missing share session')
    })
    const pushNotification = vi.spyOn(harness.store, 'pushNotification')

    const result = await harness.store.startSharedFilesImport(
      {
        sessionId: 'share-session-3',
        files: [
          {name: 'shared-a.bin', size: 64, mimeType: 'application/octet-stream'},
          {name: 'shared-b.bin', size: 64, mimeType: 'application/octet-stream'},
        ],
      },
      'share-upload-3',
    )

    expect(result).toEqual({kind: 'failed'})
    expect(harness.catalog.refresh).not.toHaveBeenCalled()
    expect(harness.store.uploadTasks().map((task) => task.status())).toEqual(['error', 'error'])
    expect(pushNotification).toHaveBeenCalledWith(
      'error',
      'Upload error: missing share session',
    )
  })

  it('keeps picker upload failure on the picker path without share partial handling', async () => {
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_native_file_upload: true,
      supports_share_import: true,
    })

    const harness = createNativeUploadStore(async (_parentPath, opts) => {
      opts?.onSelected?.([
        {fileId: 'native-1', nodeId: 51, name: 'native-a.bin', mimeType: 'application/octet-stream', totalBytes: 64},
        {fileId: 'native-2', nodeId: 52, name: 'native-b.bin', mimeType: 'application/octet-stream', totalBytes: 64},
      ])
      opts?.onCompleted?.({
        uploadId: opts.uploadId,
        fileId: 'native-1',
        nodeId: 51,
        loadedBytes: 64,
        totalBytes: 64,
      })
      throw new Error('picker failed')
    })
    const pushNotification = vi.spyOn(harness.store, 'pushNotification')

    await harness.store.startNativeUploadFiles('/photos')

    expect(harness.ws.uploadNativeFiles).toHaveBeenCalledWith('/photos', expect.objectContaining({uploadId: expect.any(String)}))
    expect(harness.catalog.refresh).not.toHaveBeenCalled()
    expect(harness.store.uploadTasks().map((task) => task.status())).toEqual(['done', 'error'])
    expect(pushNotification).toHaveBeenCalledWith('error', 'Upload error: picker failed')
  })
})
