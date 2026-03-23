import {tauriInvoke} from 'root/core/transport/tauri/ipc'

type RpcOk<T> = {ok: true; result: T}
type RpcErr = {ok: false; error: string; code?: string | null}
type RpcResult<T> = RpcOk<T> | RpcErr
type RpcCommandResult<T> = {command: string; result: T}

function isOk<T>(res: RpcResult<T>): res is RpcOk<T> {
  return typeof res === 'object' && res !== null && 'ok' in res && (res as {ok: unknown}).ok === true
}

/**
 * Map vault:unlock error codes to user-friendly messages.
 *
 * PLAUSIBLE DENIABILITY NOTE:
 * vault:unlock never returns "wrong password" errors by design.
 * Any password leads to a (possibly empty) vault. These errors are
 * purely technical (keystore/pepper/version issues).
 */
export function mapVaultUnlockError(code: string | null | undefined, fallback: string): string {
  switch (code) {
    case 'KEYSTORE_UNAVAILABLE':
      return 'System keystore unavailable. Please check your security settings.'
    case 'STORAGE_PEPPER_REQUIRED':
      return 'Security key not found. This may happen if you restored from backup on a new device.'
    case 'STORAGE_PEPPER_INVALID':
      return 'Security key mismatch. Please restore from backup.'
    case 'STORAGE_VERSION_NOT_SUPPORTED':
      return 'Storage format not supported. Please update the application.'
    case 'VAULT_ALREADY_UNLOCKED':
      return 'Vault is already open.'
    default:
      return fallback
  }
}

export class RpcError extends Error {
  code: string | null

  constructor(message: string, code: string | null) {
    super(message)
    this.code = code
  }
}

export async function tauriRpc<T = unknown>(command: string, data: Record<string, unknown>): Promise<T> {
  const res = await tauriInvoke<RpcResult<RpcCommandResult<T>>>('rpc_dispatch', {args: {v: 1, command, data}})
  if (!isOk(res)) {
    throw new RpcError(res.error, res.code ?? null)
  }
  if (!res.result || typeof res.result !== 'object' || res.result.command !== command) {
    throw new RpcError(`rpc_dispatch command mismatch: expected ${command}`, 'INTERNAL')
  }
  return res.result.result
}
