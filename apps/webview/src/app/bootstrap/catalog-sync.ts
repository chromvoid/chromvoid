import type {CatalogService} from '../../core/catalog/catalog'
import {runtimeModeModel} from '../../core/runtime/runtime-mode.model'
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

function readRemoteSessionGeneration(store: Store): number | null {
  const generation = (store as Store & {remoteSessionGeneration?: () => number | null})
    .remoteSessionGeneration
  return typeof generation === 'function' ? generation() : null
}

function readRemoteSessionPeerId(store: Store): string | null {
  const peerId = (store as Store & {remoteSessionPeerId?: () => string | null}).remoteSessionPeerId
  return typeof peerId === 'function' ? peerId() : null
}

function subscribeStoreSignalAfterInitial(
  source: {subscribe?: (cb: () => void) => () => void} | undefined,
  update: () => void,
): Unsubscribe {
  const subscribe = typeof source?.subscribe === 'function' ? source.subscribe.bind(source) : undefined
  return subscribeCallbackAfterInitial(subscribe, update)
}

function makeSyncKey(parts: {
  isConnected: boolean
  opened: boolean
  remoteSessionState: string
  remoteSessionPeerId: string | null
  remoteModeActive: boolean
  transportSessionGeneration: number | null
}): string {
  return JSON.stringify(parts)
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
  let activeKey: string | null = null
  let runId = 0
  const unsubscribers: Unsubscribe[] = []

  const update = () => {
    const isConnected = ws.connected()
    const opened = Boolean(state.data().StorageOpened)
    const remoteSessionState = store.remoteSessionState()
    const remoteReady = remoteSessionState === 'ready'
    const remoteSessionPeerId = readRemoteSessionPeerId(store)
    const transportSessionGeneration = readRemoteSessionGeneration(store)
    const remoteModeActive = runtimeModeModel.remoteCoreMode()
    const lockPending = readVaultLockPending(store)
    const localVaultReady = opened && !remoteModeActive
    const shouldSync = isConnected && !lockPending && (localVaultReady || remoteReady)
    const nextKey = shouldSync
      ? makeSyncKey({
          isConnected,
          opened,
          remoteSessionState,
          remoteSessionPeerId,
          remoteModeActive,
          transportSessionGeneration,
        })
      : null

    if (shouldSync === active && nextKey === activeKey) return
    const wasActive = active
    active = shouldSync
    activeKey = nextKey

    console.info(
      '[debug][sync] updateSync: shouldSync=%s isConnected=%s opened=%s remoteReady=%s remoteModeActive=%s lockPending=%s peerId=%s generation=%s',
      shouldSync,
      isConnected,
      opened,
      remoteReady,
      remoteModeActive,
      lockPending,
      remoteSessionPeerId,
      transportSessionGeneration,
    )
    writeAndroidUnlockDebug('catalog-sync', 'update', {
      shouldSync,
      isConnected,
      opened,
      remoteReady,
      remoteModeActive,
      lockPending,
      remoteSessionPeerId,
      transportSessionGeneration,
    })

    if (shouldSync) {
      if (wasActive && typeof catalog.resetForTransportSession === 'function') {
        catalog.resetForTransportSession('transport-session-key-change')
      }
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
            activeKey = null
            window.setTimeout(update, 500)
          }
        })
    } else {
      runId++
      activeKey = null
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
    subscribeAfterInitial(runtimeModeModel.remoteCoreMode, update),
    subscribeStoreSignalAfterInitial(
      (store as Store & {remoteSessionPeerId?: {subscribe?: (cb: () => void) => () => void}})
        .remoteSessionPeerId,
      update,
    ),
    subscribeStoreSignalAfterInitial(
      (store as Store & {remoteSessionGeneration?: {subscribe?: (cb: () => void) => () => void}})
        .remoteSessionGeneration,
      update,
    ),
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
    activeKey = null
    runId++
    void catalog.stopSync().catch(() => {})
  }
}
