import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const ipc = vi.hoisted(() => ({
  tauriInvoke: vi.fn(),
  tauriListen: vi.fn(),
}))
const runtime = vi.hoisted(() => ({
  isTauriRuntime: vi.fn(() => true),
}))

vi.mock('root/core/transport/tauri/ipc', () => ({
  tauriInvoke: (...args: unknown[]) => ipc.tauriInvoke(...args),
  tauriListen: (...args: unknown[]) => ipc.tauriListen(...args),
}))

vi.mock('root/core/runtime/runtime', () => ({
  isTauriRuntime: runtime.isTauriRuntime,
}))

import {RemoteStorageModel} from '../../src/routes/remote-storage/remote-storage.model'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return {promise, resolve, reject}
}

describe('RemoteStorageModel export flow', () => {
  beforeEach(() => {
    runtime.isTauriRuntime.mockReturnValue(true)
    ipc.tauriInvoke.mockReset()
    ipc.tauriListen.mockReset()
    ipc.tauriListen.mockResolvedValue(vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('guards duplicate export starts while an export is already running', async () => {
    const pending = deferred<{
      ok: true
      result: {backup_id: string; backup_dir: string; estimated_size: number; chunk_count: number}
    }>()
    ipc.tauriInvoke.mockReturnValue(pending.promise)
    const model = new RemoteStorageModel()
    model.masterPassword.set('secret-password')

    const first = model.startExport()
    const second = model.startExport()

    await vi.waitFor(() => {
      expect(ipc.tauriInvoke).toHaveBeenCalledTimes(1)
    })
    expect(model.transferStep()).toBe('progress')

    pending.resolve({
      ok: true,
      result: {
        backup_id: 'backup-1',
        backup_dir: '/tmp/chromvoid-backup',
        estimated_size: 1,
        chunk_count: 1,
      },
    })
    await Promise.all([first, second])

    expect(model.transferResult()).toEqual({success: true, backupDir: '/tmp/chromvoid-backup'})
    expect(model.masterPassword()).toBe('')
  })

  it('clears the master password after success, cancellation result, and thrown export errors', async () => {
    const cases = [
      {
        response: {
          ok: true,
          result: {
            backup_id: 'backup-1',
            backup_dir: '/tmp/chromvoid-backup',
            estimated_size: 1,
            chunk_count: 1,
          },
        },
      },
      {
        response: {
          ok: false,
          code: 'CANCELLED',
          error: undefined,
        },
      },
      {
        error: new Error('native export failed'),
      },
    ] as const

    for (const item of cases) {
      ipc.tauriInvoke.mockReset()
      if ('error' in item) {
        ipc.tauriInvoke.mockRejectedValueOnce(item.error)
      } else {
        ipc.tauriInvoke.mockResolvedValueOnce(item.response)
      }
      const model = new RemoteStorageModel()
      model.masterPassword.set('secret-password')

      await model.startExport()

      expect(model.transferStep()).toBe('result')
      expect(model.masterPassword()).toBe('')
    }
  })
})
