import type {CatalogService} from '../../core/catalog/catalog'
import type {ChromVoidState} from '../../core/state/app-state'
import type {TransportLike} from '../../core/transport/transport'
import type {Store} from '../state/store'

/**
 * Start/stop catalog sync based on connection + vault/remote state.
 */
export const setupCatalogSync = (
  ws: TransportLike,
  state: ChromVoidState,
  store: Store,
  catalog: CatalogService,
) => {
  let active = false
  let runId = 0

  const update = () => {
    const isConnected = ws.connected()
    const opened = Boolean(state.data().StorageOpened)
    const remoteReady = store.remoteSessionState() === 'ready'
    const shouldSync = isConnected && (opened || remoteReady)

    if (shouldSync === active) return
    active = shouldSync

    console.info(
      '[debug][sync] updateSync: shouldSync=%s isConnected=%s opened=%s remoteReady=%s',
      shouldSync,
      isConnected,
      opened,
      remoteReady,
    )

    if (shouldSync) {
      const id = ++runId
      const t0 = performance.now()
      void catalog
        .startSync()
        .then(() => {
          console.info('[debug][sync] startSync completed dt_ms=%d', Math.round(performance.now() - t0))
        })
        .catch((err) => {
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
      void catalog.stopSync().catch(() => {})
    }
  }

  ws.connected.subscribe(() => update())
  state.data.subscribe(() => update())
  store.remoteSessionState.subscribe(() => update())
}
