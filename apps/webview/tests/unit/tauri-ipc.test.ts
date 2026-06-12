const {invokeMock} = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

import {afterEach, describe, expect, it, vi} from 'vitest'

import {getTauriInvokeTimeoutMs, tauriInvoke} from '../../src/core/transport/tauri/ipc'

describe('tauriInvoke', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    invokeMock.mockReset()
  })

  it('rejects when an invoke exceeds the configured timeout', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('__TAURI_INTERNALS__', {invoke: vi.fn()})
    invokeMock.mockReturnValueOnce(new Promise(() => {}))

    const result = tauriInvoke('slow_command', undefined, {timeoutMs: 25})
    const assertion = expect(result).rejects.toThrow('Tauri invoke timed out after 25ms: slow_command')
    await vi.advanceTimersByTimeAsync(25)

    await assertion
  })

  it('preserves existing payload serialization', async () => {
    vi.stubGlobal('__TAURI_INTERNALS__', {invoke: vi.fn()})
    invokeMock.mockResolvedValueOnce({ok: true})

    await expect(tauriInvoke('echo', {value: 1}, {disableTimeout: true})).resolves.toEqual({ok: true})

    expect(invokeMock).toHaveBeenCalledWith('echo', {value: 1})
  })

  it('uses long timeouts for long-running transfer and vault operations', () => {
    expect(getTauriInvokeTimeoutMs('backup_local_create')).toBe(1_800_000)
    expect(getTauriInvokeTimeoutMs('vault_rekey')).toBe(1_800_000)
    expect(getTauriInvokeTimeoutMs('catalog_upload_path')).toBe(1_800_000)
    expect(getTauriInvokeTimeoutMs('catalog_download_path')).toBe(1_800_000)
    expect(getTauriInvokeTimeoutMs('catalog_upload_path', {timeoutMs: 5_000})).toBe(5_000)
    expect(getTauriInvokeTimeoutMs('catalog_upload_path', {disableTimeout: true})).toBeNull()
  })
})
