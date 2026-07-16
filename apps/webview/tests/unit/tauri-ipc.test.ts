const {invokeMock} = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {getTauriInvokeTimeoutMs, tauriInvoke} from '../../src/core/transport/tauri/ipc'

describe('tauriInvoke', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => false)
    vi.spyOn(console, 'warn').mockImplementation(() => false)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
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

  it('normalizes string command rejections into errors without losing the native message', async () => {
    vi.stubGlobal('__TAURI_INTERNALS__', {invoke: vi.fn()})
    invokeMock.mockRejectedValueOnce('SSH key generation failed')

    await expect(
      tauriInvoke('ssh_keygen', {keyType: 'ed25519'}, {disableTimeout: true}),
    ).rejects.toThrow('SSH key generation failed')
  })

  it('mirrors ACL-style invoke failures to the native debug log without payload values', async () => {
    vi.stubGlobal('__TAURI_INTERNALS__', {invoke: vi.fn()})
    invokeMock
      .mockRejectedValueOnce(new Error('prepare_media_stream not allowed. Command not found'))
      .mockResolvedValueOnce({ok: true})

    await expect(
      tauriInvoke(
        'prepare_media_stream',
        {args: {nodeId: 'secret-node-id'}, fileId: 'secret-file-id'},
        {disableTimeout: true},
      ),
    ).rejects.toThrow('prepare_media_stream not allowed. Command not found')

    expect(console.error).toHaveBeenCalledWith(
      '[dashboard][tauri][TAURI_IPC_FAILURE]',
      expect.objectContaining({
        marker: 'TAURI_IPC_FAILURE',
        scope: 'tauri-ipc',
        event: 'invoke-failed',
        severity: 'critical',
        cmd: 'prepare_media_stream',
        arg_keys: ['args', 'fileId'],
        error_kind: 'command-not-allowed',
      }),
    )
    expect(invokeMock).toHaveBeenNthCalledWith(
      2,
      'unlock_debug_log',
      expect.objectContaining({
        message: expect.any(String),
        reset: false,
      }),
    )

    const [, diagnosticArgs] = invokeMock.mock.calls[1] as [
      string,
      {message: string; reset: boolean},
    ]
    const payload = JSON.parse(diagnosticArgs.message) as Record<string, unknown>
    expect(payload).toEqual(
      expect.objectContaining({
        marker: 'TAURI_IPC_FAILURE',
        scope: 'tauri-ipc',
        event: 'invoke-failed',
        severity: 'critical',
        cmd: 'prepare_media_stream',
        error_kind: 'command-not-allowed',
      }),
    )
    expect(payload.arg_keys).toEqual(['args', 'fileId'])
    expect(diagnosticArgs.message).not.toContain('secret-node-id')
    expect(diagnosticArgs.message).not.toContain('secret-file-id')
  })

  it('does not recursively mirror native debug log failures', async () => {
    vi.stubGlobal('__TAURI_INTERNALS__', {invoke: vi.fn()})
    invokeMock.mockRejectedValueOnce(new Error('unlock_debug_log not allowed. Command not found'))

    await expect(
      tauriInvoke('unlock_debug_log', {message: 'TAURI_IPC_FAILURE'}, {disableTimeout: true}),
    ).rejects.toThrow('unlock_debug_log not allowed. Command not found')

    expect(invokeMock).toHaveBeenCalledTimes(1)
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
