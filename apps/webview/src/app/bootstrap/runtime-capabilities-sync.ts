import {getRuntimeCapabilities} from '../../core/runtime/runtime-capabilities'
import {syncIOSViewportZoomPolicy} from './ios-viewport'
import type {TransportLike} from '../../core/transport/transport'
import type {Store} from '../state/store'
import {subscribeToSignalChanges} from '../../shared/services/subscribed-signal'

/**
 * Sync runtime capabilities (mobile flag, data attribute) on connect and initial load.
 */
export const setupRuntimeCapabilitiesSync = (
  ws: TransportLike,
  store: Store,
  runtimeIsTauri: boolean,
): (() => void) => {
  const sync = () => {
    const caps =
      ws.kind === 'tauri' && ws.getRuntimeCapabilities
        ? ws.getRuntimeCapabilities()
        : getRuntimeCapabilities()

    const mobileRuntime = Boolean(caps.mobile)
    store.isMobile.set(mobileRuntime)
    if (typeof document !== 'undefined') {
      document.documentElement.toggleAttribute('data-mobile-runtime', mobileRuntime)
    }
    syncIOSViewportZoomPolicy(runtimeIsTauri)
  }

  sync()
  return subscribeToSignalChanges(ws.connected, sync)
}
