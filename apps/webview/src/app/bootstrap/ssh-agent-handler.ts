import {tauriInvoke} from '../../core/transport/tauri/ipc'
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

    const fingerprint = typeof data?.fingerprint === 'string' ? data.fingerprint : 'unknown'
    const comment = typeof data?.comment === 'string' && data.comment ? data.comment : 'SSH key'
    const peerProcess =
      typeof data?.peer_process === 'string' && data.peer_process ? data.peer_process : undefined
    const peerPid = typeof data?.peer_pid === 'number' ? data.peer_pid : undefined
    const hostHint = typeof data?.host_hint === 'string' && data.host_hint ? data.host_hint : undefined

    const processLabel = peerProcess ?? (peerPid !== undefined ? `PID ${peerPid}` : 'Unknown process')
    const unknownProcessWarning =
      peerProcess || peerPid !== undefined
        ? ''
        : '\n\nИсточник запроса не удалось определить. Разрешайте только если вы уверены в действии.'
    const hostLine = hostHint ? `\nХост (best-effort): ${hostHint}` : ''

    const resolveApproval = async (approved: boolean) => {
      const args = {request_id: requestId, approved}
      try {
        await tauriInvoke<void>('ssh_agent_sign_approval_resolve', args)
        return
      } catch (error) {
        console.warn('[ssh-agent] failed to resolve sign approval, retrying once', error)
      }
      try {
        await tauriInvoke<void>('ssh_agent_sign_approval_resolve', args)
      } catch (error) {
        console.warn('[ssh-agent] failed to resolve sign approval after retry', error)
      }
    }

    void dialogService
      .showConfirmDialog({
        title: 'Запрос подписи SSH',
        message: `Процесс: ${processLabel}\nКлюч: ${comment}\nFingerprint: ${fingerprint}${hostLine}${unknownProcessWarning}`,
        confirmText: 'Разрешить',
        cancelText: 'Отклонить',
        confirmVariant: 'danger',
        variant: 'warning',
        size: 'm',
      })
      .then((approved) => resolveApproval(approved))
      .catch(() => resolveApproval(false))
  })
}
