import {Entry} from '@project/passmanager'
import type {CatalogService} from '../../core/catalog/catalog'
import type {TransportLike} from '../../core/transport/transport'
import type {Store} from '../state/store'

/**
 * Debounced PassManager reload triggered by catalog mirror changes
 * and remote push updates. Defers reload while an entry detail view is open.
 */
export const setupPassmanagerReload = (ws: TransportLike, store: Store, catalog: CatalogService) => {
  let inFlight = false
  let pending = false
  let showElementSubscribed = false
  let debounceTimer: ReturnType<typeof setTimeout> | undefined

  const isEntryView = (value: unknown): boolean => {
    if (value instanceof Entry) return true
    if (!value || typeof value !== 'object') return false
    const r = value as Record<string, unknown>
    return typeof r['id'] === 'string' && typeof r['otps'] === 'function' && typeof r['password'] === 'function'
  }

  const shouldDefer = () => {
    try {
      return isEntryView(window.passmanager?.showElement?.())
    } catch {
      return false
    }
  }

  const run = () => {
    if (!window.passmanager) return

    if (inFlight || shouldDefer()) {
      console.info('[debug][pm] runPassmanagerReload: deferred (inFlight=%s deferred=%s)', inFlight, shouldDefer())
      pending = true
      return
    }

    inFlight = true
    pending = false
    const t0 = performance.now()
    console.info('[debug][pm] runPassmanagerReload: start')

    void window.passmanager
      .load()
      .then(() => {
        console.info('[debug][pm] runPassmanagerReload: done dt_ms=%d', Math.round(performance.now() - t0))
      })
      .catch((err) => {
        console.warn('[debug][pm] runPassmanagerReload: error dt_ms=%d error=%s', Math.round(performance.now() - t0), err)
      })
      .finally(() => {
        inFlight = false
        if (pending && !shouldDefer()) {
          pending = false
          run()
        }
      })
  }

  const ensureShowElementSubscription = () => {
    if (showElementSubscribed) return
    const showElement = window.passmanager?.showElement
    if (!showElement || typeof showElement.subscribe !== 'function') return

    showElement.subscribe(() => {
      if (!pending || shouldDefer()) return
      run()
    })
    showElementSubscribed = true
  }

  const scheduleReload = () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      try {
        ensureShowElementSubscription()
        run()
      } catch {}
    }, 150)
  }

  // Remote push updates trigger reload via update:state
  ws.on('update:state', () => {
    if (store.remoteSessionState() !== 'ready') return
    scheduleReload()
  })

  // Catalog mirror changes
  let changeCount = 0
  catalog.catalog.subscribe(() => {
    changeCount++
    if (changeCount <= 20 || changeCount % 50 === 0) {
      console.info('[debug][pm] catalog.mirror changed (#%d) -> reloadPassManager', changeCount)
    }
    scheduleReload()
  })
}
