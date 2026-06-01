import type {CatalogService} from '../../core/catalog/catalog'
import type {ChromVoidState} from '../../core/state/app-state'
import type {TransportLike} from '../../core/transport/transport'
import {writeAndroidUnlockDebug} from '../../shared/services/android-unlock-debug'
import {
  subscribeAfterInitial,
  subscribeCallbackAfterInitial,
  type Unsubscribe,
} from '../../shared/services/subscribed-signal'
import type {Store} from '../state/store'

function readVaultLockPending(store: Store): boolean {
  const pending = (store as Store & {vaultLockPending?: () => boolean}).vaultLockPending
  return typeof pending === 'function' ? pending() : false
}

function subscribeVaultLockPending(store: Store, update: () => void): Unsubscribe {
  const pending = (store as Store & {vaultLockPending?: {subscribe?: (cb: () => void) => () => void}})
    .vaultLockPending
  const subscribe = typeof pending?.subscribe === 'function' ? pending.subscribe.bind(pending) : undefined
  return subscribeCallbackAfterInitial(subscribe, update)
}

/**
 * Start/stop catalog sync based on connection + vault/remote state.
 */
const configuredSyncCatalogs = new WeakSet<object>()

export const setupCatalogSync = (
  ws: TransportLike,
  state: ChromVoidState,
  store: Store,
  catalog: CatalogService,
) => {
  if (configuredSyncCatalogs.has(catalog as object)) return () => {}
  configuredSyncCatalogs.add(catalog as object)

  let active = false
  let runId = 0
  const unsubscribers: Unsubscribe[] = []

  const update = () => {
    const isConnected = ws.connected()
    const opened = Boolean(state.data().StorageOpened)
    const remoteReady = store.remoteSessionState() === 'ready'
    const lockPending = readVaultLockPending(store)
    const shouldSync = isConnected && !lockPending && (opened || remoteReady)

    if (shouldSync === active) return
    active = shouldSync

    console.info(
      '[debug][sync] updateSync: shouldSync=%s isConnected=%s opened=%s remoteReady=%s lockPending=%s',
      shouldSync,
      isConnected,
      opened,
      remoteReady,
      lockPending,
    )
    writeAndroidUnlockDebug('catalog-sync', 'update', {
      shouldSync,
      isConnected,
      opened,
      remoteReady,
      lockPending,
    })

    if (shouldSync) {
      const id = ++runId
      const t0 = performance.now()
      writeAndroidUnlockDebug('catalog-sync', 'startSync:start', {runId: id})
      void catalog
        .startSync()
        .then(() => {
          writeAndroidUnlockDebug('catalog-sync', 'startSync:done', {
            runId: id,
            dt_ms: Math.round(performance.now() - t0),
          })
          console.info('[debug][sync] startSync completed dt_ms=%d', Math.round(performance.now() - t0))
        })
        .catch((err) => {
          writeAndroidUnlockDebug('catalog-sync', 'startSync:error', {
            runId: id,
            dt_ms: Math.round(performance.now() - t0),
            error: err instanceof Error ? err.message : String(err),
          })
          console.warn(
            '[debug][sync] startSync failed dt_ms=%d error=%s',
            Math.round(performance.now() - t0),
            err,
          )
          if (active && id === runId) {
            active = false
            window.setTimeout(update, 500)
          }
        })
    } else {
      runId++
      if (lockPending && typeof catalog.cancelSync === 'function') {
        catalog.cancelSync('vault-lock')
      } else {
        void catalog.stopSync().catch(() => {})
      }
    }
  }

  unsubscribers.push(
    subscribeAfterInitial(ws.connected, update),
    subscribeAfterInitial(state.data, update),
    subscribeAfterInitial(store.remoteSessionState, update),
    subscribeVaultLockPending(store, update),
  )
  update()

  return () => {
    for (const unsubscribe of unsubscribers.splice(0)) {
      unsubscribe()
    }

    configuredSyncCatalogs.delete(catalog as object)
    if (!active) return

    active = false
    runId++
    void catalog.stopSync().catch(() => {})
  }
}
