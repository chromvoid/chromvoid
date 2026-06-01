import {Entry} from '@project/passmanager/core'
import type {PassmanagerBackend} from '../../core/state/passmanager'
import type {TransportLike} from '../../core/transport/transport'
import {
  getPassmanagerRoot,
  getPassmanagerShowElement,
  getPassmanagerShowElementSignal,
} from '../../features/passmanager/models/pm-root.adapter'
import {writeAndroidUnlockDebug} from '../../shared/services/android-unlock-debug'
import {subscribeToSignalChanges, type SubscribedSignal} from '../../shared/services/subscribed-signal'
import {navigationModel} from '../navigation/navigation.model'
import type {Store} from '../state/store'

/**
 * Debounced PassManager reload triggered by dedicated passmanager backend
 * changes and remote push updates. Defers reload while an entry detail view
 * is open.
 */
const configuredBackends = new WeakSet<object>()

export const setupPassmanagerReload = (ws: TransportLike, store: Store, backend: PassmanagerBackend) => {
  if (configuredBackends.has(backend as object)) return
  configuredBackends.add(backend as object)

  let inFlight = false
  let pending = false
  let showElementSource: SubscribedSignal<unknown> | undefined
  let showElementUnsubscribe: (() => void) | undefined
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  let lastRevision = ''
  let revisionInFlight = false

  void backend
    .getRevision()
    .then((revision) => {
      lastRevision = revision
    })
    .catch(() => {})

  const isEntryView = (value: unknown): boolean => {
    if (value instanceof Entry) return true
    if (!value || typeof value !== 'object') return false
    const r = value as Record<string, unknown>
    return typeof r['id'] === 'string' && typeof r['otps'] === 'function' && typeof r['password'] === 'function'
  }

  const shouldDefer = () => {
    try {
      return isEntryView(getPassmanagerShowElement())
    } catch {
      return false
    }
  }

  const isPasswordsSurfaceActive = () => {
    try {
      if (navigationModel.isConnected()) {
        return navigationModel.currentSurface() === 'passwords'
      }
      return store.isShowPasswordManager() === true
    } catch {
      return false
    }
  }

  const run = () => {
    const root = getPassmanagerRoot()
    if (!root) return

    if (!isPasswordsSurfaceActive() || inFlight || shouldDefer()) {
      writeAndroidUnlockDebug('passmanager-reload', 'deferred', {
        surface: isPasswordsSurfaceActive(),
        inFlight,
        deferred: shouldDefer(),
      })
      pending = true
      return
    }

    inFlight = true
    pending = false
    const t0 = performance.now()
    writeAndroidUnlockDebug('passmanager-reload', 'load:start')

    void root
      .load()
      .then(() => {
        writeAndroidUnlockDebug('passmanager-reload', 'load:done', {
          dt_ms: Math.round(performance.now() - t0),
        })
      })
      .catch((err) => {
        writeAndroidUnlockDebug('passmanager-reload', 'load:error', {
          dt_ms: Math.round(performance.now() - t0),
          error: err instanceof Error ? err.message : String(err),
        })
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
    const showElement = getPassmanagerShowElementSignal() as SubscribedSignal<unknown> | undefined
    if (showElement === showElementSource) return

    showElementUnsubscribe?.()
    showElementUnsubscribe = undefined
    showElementSource = showElement
    if (typeof showElement !== 'function') return

    showElementUnsubscribe = subscribeToSignalChanges(showElement, () => {
      if (!pending || shouldDefer()) return
      run()
    })
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

  const refreshRevisionAndSchedule = () => {
    if (revisionInFlight) return
    revisionInFlight = true
    void backend
      .getRevision()
      .then((nextRevision) => {
        if (nextRevision === lastRevision) return
        lastRevision = nextRevision
        scheduleReload()
      })
      .catch(() => {})
      .finally(() => {
        revisionInFlight = false
      })
  }

  ws.on('passmanager:changed', () => {
    scheduleReload()
  })

  // Remote pushes may not emit dedicated passmanager change events in all runtimes.
  ws.on('update:state', () => {
    if (store.remoteSessionState() !== 'ready') return
    refreshRevisionAndSchedule()
  })

  subscribeToSignalChanges(navigationModel.currentSurface, () => {
    if (!pending || !isPasswordsSurfaceActive()) return
    scheduleReload()
  })
}
