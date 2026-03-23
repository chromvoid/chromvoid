import {isTauriRuntime} from 'root/core/runtime/runtime'
import {tauriInvoke} from 'root/core/transport/tauri/ipc'

type RpcOk<T> = {ok: true; result: T}
type RpcErr = {ok: false; error: string; code?: string | null}
type RpcResult<T> = RpcOk<T> | RpcErr

export type SessionSettings = {
  auto_lock_timeout_secs: number
  lock_on_sleep: boolean
  lock_on_mobile_background: boolean
  require_biometric_app_gate: boolean
  auto_mount_after_unlock: boolean
  keep_screen_awake_when_unlocked: boolean
}

export const DEFAULT_SESSION_SETTINGS: SessionSettings = {
  auto_lock_timeout_secs: 300,
  lock_on_sleep: true,
  lock_on_mobile_background: false,
  require_biometric_app_gate: true,
  auto_mount_after_unlock: false,
  keep_screen_awake_when_unlocked: false,
}

function isOk<T>(res: RpcResult<T>): res is RpcOk<T> {
  return typeof res === 'object' && res !== null && 'ok' in res && (res as {ok: unknown}).ok === true
}

export async function loadSessionSettings(): Promise<SessionSettings> {
  if (!isTauriRuntime()) return {...DEFAULT_SESSION_SETTINGS}

  const res = await tauriInvoke<RpcResult<SessionSettings>>('get_session_settings')
  if (!isOk(res)) {
    throw new Error(res.error || 'Failed to load session settings')
  }

  return {
    ...DEFAULT_SESSION_SETTINGS,
    ...res.result,
  }
}

export async function saveSessionSettings(settings: SessionSettings): Promise<SessionSettings> {
  if (!isTauriRuntime()) return settings

  const res = await tauriInvoke<RpcResult<SessionSettings>>('set_session_settings', {settings})
  if (!isOk(res)) {
    throw new Error(res.error || 'Failed to save session settings')
  }

  return {
    ...DEFAULT_SESSION_SETTINGS,
    ...res.result,
  }
}
