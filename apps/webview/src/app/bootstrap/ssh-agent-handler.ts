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

/**
 * Handle SSH agent sign requests: show a confirmation dialog and resolve approval.
 */
export const setupSshAgentHandler = (ws: TransportLike) => {
  ws.on('ssh-agent:sign-request', (_message, payload) => {
    const data = payload as Partial<SshAgentSignRequestPayload> | null
    const requestId = typeof data?.request_id === 'string' ? data.request_id : ''
    if (!requestId) return

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
        console.warn('[ssh-agent] failed to resolve sign approval, retrying once', error)
      }
      try {
        await tauriInvoke<void>('ssh_agent_sign_approval_resolve', args)
        console.info('[ssh-agent] approval resolved after retry', {requestId, approved})
      } catch (error) {
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
      })
      .then((approved) => resolveApproval(approved))
      .catch(() => resolveApproval(false))
  })
}
