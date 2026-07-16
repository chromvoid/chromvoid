import {tauriInvoke} from '../../core/transport/tauri/ipc'
import {i18n} from '../../i18n'
import {dialogService} from '../../shared/services/dialog-service'
import type {TransportLike} from '../../core/transport/transport'

type SshAgentSignRequestPayload = {
  request_id: string
  connection_id: number
  fingerprint: string
  comment: string
  peer_pid?: number
  peer_process?: string
  host_hint?: string
}

type SshAgentSignRequestExpiredPayload = {
  request_id: string
  reason?: string
}

const staleApprovalErrorNeedles = [
  'stale request_id',
  'requires a running SSH agent',
]

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isStaleApprovalError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase()
  return staleApprovalErrorNeedles.some((needle) => message.includes(needle))
}

/**
 * Handle SSH agent sign requests: show a confirmation dialog and resolve approval.
 */
export const setupSshAgentHandler = (ws: TransportLike) => {
  const pendingApprovals = new Map<string, AbortController>()

  ws.on('ssh-agent:sign-request-expired', (_message, payload) => {
    const data = payload as Partial<SshAgentSignRequestExpiredPayload> | null
    const requestId = typeof data?.request_id === 'string' ? data.request_id : ''
    if (!requestId) return

    const controller = pendingApprovals.get(requestId)
    if (!controller) return

    pendingApprovals.delete(requestId)
    console.info('[ssh-agent] sign request expired', {
      requestId,
      reason: typeof data?.reason === 'string' ? data.reason : undefined,
    })
    controller.abort()
  })

  ws.on('ssh-agent:sign-request', (_message, payload) => {
    const data = payload as Partial<SshAgentSignRequestPayload> | null
    const requestId = typeof data?.request_id === 'string' ? data.request_id : ''
    if (!requestId) return
    pendingApprovals.get(requestId)?.abort()
    const approvalController = new AbortController()
    pendingApprovals.set(requestId, approvalController)

    const fingerprint =
      typeof data?.fingerprint === 'string' ? data.fingerprint : i18n('ssh-agent:unknown-fingerprint')
    const comment = typeof data?.comment === 'string' && data.comment ? data.comment : i18n('ssh-agent:default-key')
    const peerProcess =
      typeof data?.peer_process === 'string' && data.peer_process ? data.peer_process : undefined
    const peerPid = typeof data?.peer_pid === 'number' ? data.peer_pid : undefined
    const hostHint = typeof data?.host_hint === 'string' && data.host_hint ? data.host_hint : undefined

    const processLabel =
      peerProcess ?? (peerPid !== undefined ? `PID ${peerPid}` : i18n('ssh-agent:unknown-process'))
    const unknownProcessWarning =
      peerProcess || peerPid !== undefined
        ? ''
        : i18n('ssh-agent:unknown-source-warning')
    const hostLine = hostHint ? i18n('ssh-agent:host-line', {host: hostHint}) : ''

    const resolveApproval = async (approved: boolean) => {
      if (approvalController.signal.aborted) return
      pendingApprovals.delete(requestId)

      const args = {requestId, approved}
      console.info('[ssh-agent] resolving approval', {
        requestId,
        approved,
        fingerprint,
        comment,
      })
      try {
        await tauriInvoke<void>('ssh_agent_sign_approval_resolve', args)
        console.info('[ssh-agent] approval resolved', {requestId, approved})
        return
      } catch (error) {
        if (isStaleApprovalError(error)) {
          console.info('[ssh-agent] approval was already closed by backend', {
            requestId,
            error: errorMessage(error),
          })
          return
        }
        console.warn('[ssh-agent] failed to resolve sign approval, retrying once', error)
      }
      if (approvalController.signal.aborted) return
      try {
        await tauriInvoke<void>('ssh_agent_sign_approval_resolve', args)
        console.info('[ssh-agent] approval resolved after retry', {requestId, approved})
      } catch (error) {
        if (isStaleApprovalError(error)) {
          console.info('[ssh-agent] approval was already closed by backend after retry', {
            requestId,
            error: errorMessage(error),
          })
          return
        }
        console.warn('[ssh-agent] failed to resolve sign approval after retry', error)
      }
    }

    console.info('[ssh-agent] sign request received', {
      requestId,
      fingerprint,
      comment,
      peerProcess,
      peerPid,
      hostHint,
    })

    void dialogService
      .showConfirmDialog({
        title: i18n('ssh-agent:title'),
        message: i18n('ssh-agent:message', {
          process: processLabel,
          key: comment,
          fingerprint,
          hostLine,
          warning: unknownProcessWarning,
        }),
        confirmText: i18n('button:allow'),
        cancelText: i18n('button:deny'),
        confirmVariant: 'danger',
        variant: 'warning',
        size: 'm',
        abortSignal: approvalController.signal,
      })
      .then((approved) => {
        if (approvalController.signal.aborted) return
        return resolveApproval(approved)
      })
      .catch((error) => {
        if (approvalController.signal.aborted) return
        console.warn('[ssh-agent] approval dialog failed closed', error)
        return resolveApproval(false)
      })
  })
}
