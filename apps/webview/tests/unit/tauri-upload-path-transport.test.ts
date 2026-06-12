import {beforeEach, describe, expect, it, vi} from 'vitest'

import {uploadFilePathViaTauri} from '../../src/core/transport/tauri/tauri-binary-ops'

const tauriInvoke = vi.fn()
const tauriListen = vi.fn()
const listenHandlers = new Map<string, (payload: unknown) => void>()

vi.mock('../../src/core/transport/tauri/ipc', () => {
  return {
    tauriInvoke: (...args: unknown[]) => tauriInvoke(...args),
    tauriListen: (event: string, handler: (payload: unknown) => void) => tauriListen(event, handler),
  }
})

describe('Tauri path upload transport', () => {
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

  it('passes the configured upload chunk size to Rust as the read chunk size', async () => {
    tauriInvoke.mockResolvedValue({ok: true, result: {node_id: 7}})

    await uploadFilePathViaTauri(7, '/tmp/report.bin', {
      uploadId: 'upload-1',
      chunkSize: 512 * 1024,
      totalBytes: 2 * 1024 * 1024,
      onProgress: vi.fn(),
    })

    expect(tauriInvoke).toHaveBeenCalledWith('catalog_upload_path', {
      nodeId: 7,
      pathToken: '/tmp/report.bin',
      uploadId: 'upload-1',
      readChunkSize: 512 * 1024,
    })
  })

  it('maps native byte progress to chunk and percent progress', async () => {
    const onProgress = vi.fn()
    tauriInvoke.mockImplementation(async () => {
      listenHandlers.get('upload:progress')?.({
        uploadId: 'upload-1',
        nodeId: 7,
        sentBytes: 512 * 1024,
        totalBytes: 2 * 1024 * 1024,
      })
      return {ok: true, result: {node_id: 7}}
    })

    await uploadFilePathViaTauri(7, '/tmp/report.bin', {
      uploadId: 'upload-1',
      chunkSize: 512 * 1024,
      totalBytes: 2 * 1024 * 1024,
      onProgress,
    })

    expect(onProgress).toHaveBeenCalledWith(1, 4, 25)
  })
})
