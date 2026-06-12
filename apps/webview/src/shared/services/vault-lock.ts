import {i18n} from 'root/i18n'
import {isTauriRuntime} from 'root/core/runtime/runtime'
import {tauriInvoke} from 'root/core/transport/tauri/ipc'
import {writeAndroidUnlockDebug} from './android-unlock-debug'
import {getAppContext} from './app-context'
import {cancelPreparedFileSourceWorkForLockIntent} from 'root/features/media/components/file-loader'

type RpcOk<T> = {ok: true; result: T}
type RpcErr = {ok: false; error: string; code?: string | null}
type RpcResult<T> = RpcOk<T> | RpcErr

function isOk<T>(res: RpcResult<T>): res is RpcOk<T> {
  return typeof res === 'object' && res !== null && 'ok' in res && (res as {ok: unknown}).ok === true
}

class VaultLockRejectedError extends Error {}

type VaultLockStore = {
  vaultLockPending?: () => boolean
  beginVaultLockRequest?: () => void
  finishVaultLockRequest?: () => void
  handleVaultLocked?: (options: {source: 'manual'}) => void
  pushNotification?: (type: 'success' | 'error' | 'warning' | 'info', message: string) => void
}

function isVaultLockPending(store: VaultLockStore): boolean {
  return typeof store.vaultLockPending === 'function' ? store.vaultLockPending() : false
}

export async function lockVaultFromUi(): Promise<void> {
  if (!isTauriRuntime()) return

  const {catalog, state, store} = getAppContext()
  if (isVaultLockPending(store)) return

  const t0 = performance.now()
  store.beginVaultLockRequest?.()
  catalog.cancelSync?.('vault-lock')
  await cancelPreparedFileSourceWorkForLockIntent()
  writeAndroidUnlockDebug('vault-lock', 'request:start')

  try {
    const res = await tauriInvoke<RpcResult<unknown>>('rpc_dispatch', {
      args: {
        v: 1,
        command: 'vault:lock',
        data: {},
      },
    })
    if (!isOk(res)) {
      throw new VaultLockRejectedError(res.error)
    }

    state.update?.({StorageOpened: false})
    store.handleVaultLocked?.({source: 'manual'})
    writeAndroidUnlockDebug('vault-lock', 'request:done', {
      dt_ms: Math.round(performance.now() - t0),
    })
  } catch (error) {
    if (error instanceof VaultLockRejectedError) {
      store.finishVaultLockRequest?.()
      store.pushNotification?.('error', error.message || i18n('error:lock-failed'))
    } else {
      state.update?.({StorageOpened: false})
      store.handleVaultLocked?.({source: 'manual'})
      store.pushNotification?.(
        'warning',
        error instanceof Error ? error.message : i18n('error:lock-failed'),
      )
    }
    writeAndroidUnlockDebug('vault-lock', 'request:error', {
      dt_ms: Math.round(performance.now() - t0),
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
