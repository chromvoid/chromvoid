import {atom} from '@reatom/core'

import {isTauriRuntime} from 'root/core/runtime/runtime'
import {tauriInvoke} from 'root/core/transport/tauri/ipc'
import {i18n} from 'root/i18n'

type RpcOk<T> = {ok: true; result: T}
type RpcErr = {ok: false; error: string; code?: string | null}
type RpcResult<T> = RpcOk<T> | RpcErr

export type SessionSettings = {
  auto_lock_timeout_secs: number
  lock_on_sleep: boolean
  lock_on_mobile_background: boolean
  require_biometric_app_gate: boolean
  auto_mount_after_unlock: boolean
  auto_start_ssh_agent_after_unlock: boolean
  keep_screen_awake_when_unlocked: boolean
  android_vault_status_notification_enabled: boolean
  android_quick_lock_tile_enabled: boolean
  confirm_file_deletion: boolean
  show_hidden_files: boolean
  markdown_attachment_folder_path: string
}

export const DEFAULT_SESSION_SETTINGS: SessionSettings = {
  auto_lock_timeout_secs: 300,
  lock_on_sleep: true,
  lock_on_mobile_background: false,
  require_biometric_app_gate: true,
  auto_mount_after_unlock: false,
  auto_start_ssh_agent_after_unlock: false,
  keep_screen_awake_when_unlocked: false,
  android_vault_status_notification_enabled: true,
  android_quick_lock_tile_enabled: true,
  confirm_file_deletion: true,
  show_hidden_files: false,
  markdown_attachment_folder_path: '/attachments',
}

export const sessionSettingsState = atom<SessionSettings>({...DEFAULT_SESSION_SETTINGS})

function isOk<T>(res: RpcResult<T>): res is RpcOk<T> {
  return typeof res === 'object' && res !== null && 'ok' in res && (res as {ok: unknown}).ok === true
}

export async function loadSessionSettings(): Promise<SessionSettings> {
  if (!isTauriRuntime()) {
    const settings = {...DEFAULT_SESSION_SETTINGS}
    sessionSettingsState.set(settings)
    return settings
  }

  const res = await tauriInvoke<RpcResult<SessionSettings>>('get_session_settings')
  if (!isOk(res)) {
    throw new Error(res.error || i18n('errors:load-session-settings'))
  }

  const settings = {
    ...DEFAULT_SESSION_SETTINGS,
    ...res.result,
  }
  sessionSettingsState.set(settings)
  return settings
}

export async function saveSessionSettings(settings: SessionSettings): Promise<SessionSettings> {
  if (!isTauriRuntime()) {
    sessionSettingsState.set(settings)
    return settings
  }

  const res = await tauriInvoke<RpcResult<SessionSettings>>('set_session_settings', {settings})
  if (!isOk(res)) {
    throw new Error(res.error || i18n('errors:save-session-settings'))
  }

  const savedSettings = {
    ...DEFAULT_SESSION_SETTINGS,
    ...res.result,
  }
  sessionSettingsState.set(savedSettings)
  return savedSettings
}
