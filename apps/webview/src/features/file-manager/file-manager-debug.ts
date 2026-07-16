import {isTauriRuntime} from 'root/core/runtime/runtime'
import {writeAndroidUnlockDebug} from 'root/shared/services/android-unlock-debug'

export function logFileManagerDebug(
  scope: string,
  event: string,
  meta?: Record<string, unknown>,
): void {
  if (!isTauriRuntime()) return

  writeAndroidUnlockDebug(scope, event, meta)
  try {
    console.info(`[debug][${scope}] ${event}`, meta ?? {})
  } catch {}
}
