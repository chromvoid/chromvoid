import {beforeEach, describe, expect, it, vi} from 'vitest'

const tauriInvoke = vi.fn()
const showConfirmDialog = vi.fn()

vi.mock('root/core/transport/tauri/ipc', () => ({
  tauriInvoke: (...args: unknown[]) => tauriInvoke(...args),
}))

vi.mock('root/shared/services/dialog-service', () => ({
  dialogService: {
    showConfirmDialog: (...args: unknown[]) => showConfirmDialog(...args),
  },
}))

import {setupSshAgentHandler} from 'root/app/bootstrap/ssh-agent-handler'

function createTransport() {
  const handlers = new Map<string, (message: unknown, payload: unknown) => void>()

  return {
    ws: {
      on(event: string, handler: (message: unknown, payload: unknown) => void) {
        handlers.set(event, handler)
      },
    },
    emit(event: string, payload: unknown) {
      const handler = handlers.get(event)
      if (!handler) {
        throw new Error(`missing handler for ${event}`)
      }
      handler(undefined, payload)
    },
  }
}

describe('setupSshAgentHandler', () => {
  beforeEach(() => {
    tauriInvoke.mockReset()
    showConfirmDialog.mockReset()
  })

  it('resolves approved sign requests through Tauri IPC', async () => {
    showConfirmDialog.mockResolvedValue(true)
    tauriInvoke.mockResolvedValue(undefined)

    const transport = createTransport()
    setupSshAgentHandler(transport.ws as any)

    transport.emit('ssh-agent:sign-request', {
      request_id: 'req-1',
      connection_id: 10,
      fingerprint: 'SHA256:test',
      comment: 'chromvoid-manual-check',
      peer_process: 'ssh-keygen',
      peer_pid: 123,
    })

    await Promise.resolve()
    await Promise.resolve()

    expect(showConfirmDialog).toHaveBeenCalledOnce()
    expect(tauriInvoke).toHaveBeenCalledWith('ssh_agent_sign_approval_resolve', {
      requestId: 'req-1',
      approved: true,
    })
  })

  it('resolves denied sign requests through Tauri IPC', async () => {
    showConfirmDialog.mockResolvedValue(false)
    tauriInvoke.mockResolvedValue(undefined)

    const transport = createTransport()
    setupSshAgentHandler(transport.ws as any)

    transport.emit('ssh-agent:sign-request', {
      request_id: 'req-2',
      connection_id: 11,
      fingerprint: 'SHA256:test-2',
      comment: 'chromvoid-manual-check',
    })

    await Promise.resolve()
    await Promise.resolve()

    expect(tauriInvoke).toHaveBeenCalledWith('ssh_agent_sign_approval_resolve', {
      requestId: 'req-2',
      approved: false,
    })
  })

  it('retries failed approval resolve exactly once', async () => {
    showConfirmDialog.mockResolvedValue(true)
    tauriInvoke.mockRejectedValueOnce(new Error('first failure')).mockResolvedValueOnce(undefined)

    const transport = createTransport()
    setupSshAgentHandler(transport.ws as any)

    transport.emit('ssh-agent:sign-request', {
      request_id: 'req-retry',
      connection_id: 12,
      fingerprint: 'SHA256:test-retry',
      comment: 'chromvoid-manual-check',
    })

    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(tauriInvoke).toHaveBeenCalledTimes(2)
    expect(tauriInvoke).toHaveBeenNthCalledWith(1, 'ssh_agent_sign_approval_resolve', {
      requestId: 'req-retry',
      approved: true,
    })
    expect(tauriInvoke).toHaveBeenNthCalledWith(2, 'ssh_agent_sign_approval_resolve', {
      requestId: 'req-retry',
      approved: true,
    })
  })

  it('does not retry stale approval resolve failures', async () => {
    showConfirmDialog.mockResolvedValue(true)
    tauriInvoke.mockRejectedValue(new Error('ssh_agent_sign_approval_resolve rejected stale request_id=req-stale'))

    const transport = createTransport()
    setupSshAgentHandler(transport.ws as any)

    transport.emit('ssh-agent:sign-request', {
      request_id: 'req-stale',
      connection_id: 12,
      fingerprint: 'SHA256:test-stale',
      comment: 'chromvoid-manual-check',
    })

    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(tauriInvoke).toHaveBeenCalledTimes(1)
    expect(tauriInvoke).toHaveBeenCalledWith('ssh_agent_sign_approval_resolve', {
      requestId: 'req-stale',
      approved: true,
    })
  })

  it('closes expired sign requests without resolving stale approvals', async () => {
    let dialogOptions: {abortSignal?: AbortSignal} | undefined
    let resolveDialog: ((value: boolean) => void) | undefined
    showConfirmDialog.mockImplementation((options: {abortSignal?: AbortSignal}) => {
      dialogOptions = options
      return new Promise<boolean>((resolve) => {
        resolveDialog = resolve
      })
    })
    tauriInvoke.mockResolvedValue(undefined)

    const transport = createTransport()
    setupSshAgentHandler(transport.ws as any)

    transport.emit('ssh-agent:sign-request', {
      request_id: 'req-expired',
      connection_id: 15,
      fingerprint: 'SHA256:test-expired',
      comment: 'chromvoid-manual-check',
    })

    await Promise.resolve()

    expect(showConfirmDialog).toHaveBeenCalledOnce()
    expect(dialogOptions?.abortSignal?.aborted).toBe(false)

    transport.emit('ssh-agent:sign-request-expired', {
      request_id: 'req-expired',
      reason: 'timeout',
    })

    expect(dialogOptions?.abortSignal?.aborted).toBe(true)
    resolveDialog?.(true)

    await Promise.resolve()
    await Promise.resolve()

    expect(tauriInvoke).not.toHaveBeenCalled()
  })

  it('treats rejected confirm dialogs as denied approvals', async () => {
    showConfirmDialog.mockRejectedValue(new Error('dialog dismissed'))
    tauriInvoke.mockResolvedValue(undefined)

    const transport = createTransport()
    setupSshAgentHandler(transport.ws as any)

    transport.emit('ssh-agent:sign-request', {
      request_id: 'req-reject',
      connection_id: 13,
      fingerprint: 'SHA256:test-reject',
      comment: 'chromvoid-manual-check',
    })

    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(tauriInvoke).toHaveBeenCalledWith('ssh_agent_sign_approval_resolve', {
      requestId: 'req-reject',
      approved: false,
    })
  })

  it('ignores malformed payloads without request ids', async () => {
    showConfirmDialog.mockResolvedValue(true)

    const transport = createTransport()
    setupSshAgentHandler(transport.ws as any)

    transport.emit('ssh-agent:sign-request', {
      fingerprint: 'SHA256:test',
      comment: 'chromvoid-manual-check',
    })

    await Promise.resolve()

    expect(showConfirmDialog).not.toHaveBeenCalled()
    expect(tauriInvoke).not.toHaveBeenCalled()
  })

  it('ignores malformed optional payload fields safely', async () => {
    showConfirmDialog.mockResolvedValue(true)
    tauriInvoke.mockResolvedValue(undefined)

    const transport = createTransport()
    setupSshAgentHandler(transport.ws as any)

    transport.emit('ssh-agent:sign-request', {
      request_id: 'req-malformed',
      connection_id: 14,
      fingerprint: 'SHA256:test-malformed',
      peer_pid: 'oops',
      peer_process: 42,
    })

    await Promise.resolve()
    await Promise.resolve()

    expect(showConfirmDialog).toHaveBeenCalledOnce()
    expect(tauriInvoke).toHaveBeenCalledWith('ssh_agent_sign_approval_resolve', {
      requestId: 'req-malformed',
      approved: true,
    })
  })
})
