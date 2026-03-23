import {isTauriRuntime} from 'root/core/runtime/runtime'
import {tauriInvoke} from 'root/core/transport/tauri/ipc'

export type AndroidPasswordSavePrefill = {
  token: string
  title: string
  username: string
  password: string
  urls: string
}

let pendingPrefill: AndroidPasswordSavePrefill | null = null
let activeToken: string | null = null

export function stageAndroidPasswordSavePrefill(next: AndroidPasswordSavePrefill): void {
  pendingPrefill = next
}

export function consumeAndroidPasswordSavePrefill(): AndroidPasswordSavePrefill | null {
  const next = pendingPrefill
  pendingPrefill = null
  activeToken = next?.token ?? null
  return next
}

export function hasAndroidPasswordSavePrefill(): boolean {
  return pendingPrefill !== null || activeToken !== null
}

export function hasActiveAndroidPasswordSaveToken(): boolean {
  return activeToken !== null
}

export async function finishAndroidPasswordSave(outcome: 'saved' | 'dismissed'): Promise<void> {
  const token = activeToken
  activeToken = null
  pendingPrefill = null

  if (!token || !isTauriRuntime()) {
    return
  }

  try {
    await tauriInvoke('android_password_save_finish', {token, outcome})
  } catch (error) {
    console.warn('[android-password-save] failed to finish request', {
      outcome,
      error,
    })
  }
}
