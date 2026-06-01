import {computed, type Computed} from '@reatom/core'
import {writeAndroidUnlockDebug} from '../../shared/services/android-unlock-debug'

import type {ChromVoidState} from '../../core/state/app-state'
import type {TransportLike} from '../../core/transport/transport'
import type {Store} from '../state/store'

export const ROUTE_IDS = [
  'loading',
  'welcome',
  'no-license',
  'dashboard',
  'task-progress',
  'no-connection',
] as const

export type Routes = (typeof ROUTE_IDS)[number]

function isVaultLockPending(store: Store): boolean {
  const pending = (store as Store & {vaultLockPending?: () => boolean}).vaultLockPending
  return typeof pending === 'function' ? pending() : false
}

export class Router {
  route: Computed<Routes>
  isLoading: Computed<boolean>

  constructor(ws: TransportLike, state: ChromVoidState, store: Store) {
    this.isLoading = computed(() => {
      return ws.connecting() || !ws.connected()
    })

    this.isLoading.subscribe((isLoading) => {
      if (isLoading) {
        document.body.setAttribute('loading', '')
      } else {
        document.body.removeAttribute('loading')
      }
    })

    this.route = computed<Routes>(() => {
      if (ws.connected() === false) {
        return 'no-connection'
      }

      // For browser/WS mode keep legacy routing behavior.
      if (ws.kind !== 'tauri') {
        // Dev/preview override — allow ?preview=welcome to force the welcome screen.
        const previewParam = new URL(location.href).searchParams.get('preview')
        if (previewParam === 'welcome') {
          return 'welcome'
        }

        return 'dashboard'
      }

      const s = state.data()
      const needInit = Boolean(s.NeedUserInitialization)
      const opened = Boolean(s.StorageOpened)
      const allowRemoteDashboard = store.remoteSessionState() === 'ready'

      if (isVaultLockPending(store)) {
        return 'welcome'
      }

      if (opened || allowRemoteDashboard) {
        return 'dashboard'
      }

      // In Tauri mode preview can force welcome only while the vault is not open.
      const previewParam = new URL(location.href).searchParams.get('preview')
      if (previewParam === 'welcome') {
        return 'welcome'
      }

      if (needInit || !opened) {
        return 'welcome'
      }

      return 'dashboard'
    })

    this.route.subscribe((route) => {
      writeAndroidUnlockDebug('router', 'route changed', {route})
    })
  }
}
