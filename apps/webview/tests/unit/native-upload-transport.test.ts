import {beforeEach, describe, expect, it, vi} from 'vitest'

import {
  cancelAndroidSharedFilesViaTauri,
  cancelSharedFilesViaTauri,
  uploadAndroidSharedFilesViaTauri,
  uploadSharedFilesViaTauri,
} from '../../src/core/transport/tauri/tauri-binary-ops'

const tauriInvoke = vi.fn()
const tauriListen = vi.fn()
const listenHandlers = new Map<string, (payload: unknown) => void>()

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
}))

vi.mock('../../src/core/transport/tauri/ipc', () => {
  return {
    tauriInvoke: (...args: unknown[]) => tauriInvoke(...args),
    tauriListen: (event: string, handler: (payload: unknown) => void) => tauriListen(event, handler),
  }
})

describe('Tauri shared native upload transport', () => {
  beforeEach(() => {
    tauriInvoke.mockReset()
    tauriListen.mockReset()
    listenHandlers.clear()
    tauriListen.mockImplementation(async (event: string, handler: (payload: unknown) => void) => {
      listenHandlers.set(event, handler)
      return () => {
        listenHandlers.delete(event)
      }
    })
  })

  it('invokes the shared files upload command with native upload options', async () => {
    tauriInvoke.mockResolvedValue({ok: true, result: null})

    await uploadSharedFilesViaTauri('/', 'share-session-1', {
      uploadId: 'upload-1',
      readChunkSize: 512 * 1024,
    })

    expect(tauriInvoke).toHaveBeenCalledWith('catalog_upload_shared_files', {
      parentPath: '/',
      uploadId: 'upload-1',
      sharedSessionId: 'share-session-1',
      readChunkSize: 512 * 1024,
    })
  })

  it('filters native upload events by upload id and normalizes failed codes', async () => {
    const onSelected = vi.fn()
    const onProgress = vi.fn()
    const onCompleted = vi.fn()
    const onFailed = vi.fn()
    tauriInvoke.mockImplementation(async () => {
      listenHandlers.get('upload:native-selected')?.({
        uploadId: 'other-upload',
        files: [{fileId: 'ignored', nodeId: 1, name: 'ignored.bin', totalBytes: 1}],
      })
      listenHandlers.get('upload:native-selected')?.({
        uploadId: 'upload-1',
        files: [{fileId: 'file-1', nodeId: 7, name: 'photo.jpg', mimeType: 'image/jpeg', totalBytes: 10}],
      })
      listenHandlers.get('upload:native-progress')?.({
        uploadId: 'other-upload',
        fileId: 'ignored',
        loadedBytes: 1,
        totalBytes: 1,
      })
      listenHandlers.get('upload:native-progress')?.({
        uploadId: 'upload-1',
        fileId: 'file-1',
        nodeId: 7,
        loaded_bytes: 5,
        total_bytes: 10,
        percent: 50,
      })
      listenHandlers.get('upload:native-completed')?.({
        uploadId: 'upload-1',
        fileId: 'file-1',
        nodeId: 7,
        loadedBytes: 10,
        totalBytes: 10,
      })
      listenHandlers.get('upload:native-failed')?.({
        uploadId: 'other-upload',
        message: 'ignored',
        code: 'IGNORED',
      })
      listenHandlers.get('upload:native-failed')?.({
        uploadId: 'upload-1',
        fileId: 'file-1',
        message: 'ANDROID_SHARE_PERMISSION_DENIED',
        code: 'ANDROID_SHARE_PERMISSION_DENIED',
      })
      return {ok: true, result: null}
    })

    await uploadSharedFilesViaTauri('/', 'share-session-1', {
      uploadId: 'upload-1',
      onSelected,
      onProgress,
      onCompleted,
      onFailed,
    })

    expect(onSelected).toHaveBeenCalledTimes(1)
    expect(onSelected).toHaveBeenCalledWith([
      {fileId: 'file-1', nodeId: 7, name: 'photo.jpg', mimeType: 'image/jpeg', totalBytes: 10},
    ])
    expect(onProgress).toHaveBeenCalledWith({
      uploadId: 'upload-1',
      fileId: 'file-1',
      nodeId: 7,
      loadedBytes: 5,
      totalBytes: 10,
      percent: 50,
      importProvenanceStatus: null,
      mediaLocationPermissionStatus: null,
      requireOriginalStatus: null,
    })
    expect(onCompleted).toHaveBeenCalledWith(expect.objectContaining({loadedBytes: 10}))
    expect(onFailed).toHaveBeenCalledWith({
      uploadId: 'upload-1',
      fileId: 'file-1',
      message: 'ANDROID_SHARE_PERMISSION_DENIED',
      code: 'ANDROID_SHARE_PERMISSION_DENIED',
    })
  })

  it('keeps failed events without a code usable for older native payloads', async () => {
    const onFailed = vi.fn()
    tauriInvoke.mockImplementation(async () => {
      listenHandlers.get('upload:native-failed')?.({
        uploadId: 'upload-1',
        message: 'Native upload cancelled',
      })
      return {ok: true, result: null}
    })

    await uploadSharedFilesViaTauri('/', 'share-session-1', {
      uploadId: 'upload-1',
      onFailed,
    })

    expect(onFailed).toHaveBeenCalledWith({
      uploadId: 'upload-1',
      message: 'Native upload cancelled',
      code: null,
    })
  })

  it('unlistens native upload events after command success and failure', async () => {
    tauriInvoke.mockResolvedValueOnce({ok: true, result: null})

    await uploadSharedFilesViaTauri('/', 'share-session-1', {uploadId: 'upload-1'})

    expect(listenHandlers.size).toBe(0)

    tauriInvoke.mockResolvedValueOnce({
      ok: false,
      error: 'Android share import is busy',
      code: 'ANDROID_SHARE_IMPORT_BUSY',
    })

    await expect(
      uploadSharedFilesViaTauri('/', 'share-session-1', {uploadId: 'upload-2'}),
    ).rejects.toMatchObject({code: 'ANDROID_SHARE_IMPORT_BUSY'})
    expect(listenHandlers.size).toBe(0)
  })

  it('invokes shared files cancellation and propagates coded errors', async () => {
    tauriInvoke.mockResolvedValueOnce({ok: true, result: null})

    await cancelSharedFilesViaTauri('share-session-1')

    expect(tauriInvoke).toHaveBeenCalledWith('catalog_cancel_shared_files', {
      sharedSessionId: 'share-session-1',
    })

    tauriInvoke.mockResolvedValueOnce({
      ok: false,
      error: 'Android share session not found',
      code: 'ANDROID_SHARE_SESSION_NOT_FOUND',
    })

    await expect(cancelSharedFilesViaTauri('missing-session')).rejects.toMatchObject({
      code: 'ANDROID_SHARE_SESSION_NOT_FOUND',
    })
  })

  it('keeps Android shared files transport aliases wired to the neutral helpers', async () => {
    tauriInvoke.mockResolvedValue({ok: true, result: null})

    await uploadAndroidSharedFilesViaTauri('/', 'share-session-1', {uploadId: 'upload-1'})
    await cancelAndroidSharedFilesViaTauri('share-session-1')

    expect(tauriInvoke).toHaveBeenCalledWith('catalog_upload_shared_files', {
      parentPath: '/',
      uploadId: 'upload-1',
      sharedSessionId: 'share-session-1',
      readChunkSize: undefined,
    })
    expect(tauriInvoke).toHaveBeenCalledWith('catalog_cancel_shared_files', {
      sharedSessionId: 'share-session-1',
    })
  })
})
