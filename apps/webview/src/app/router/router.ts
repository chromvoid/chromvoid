import {type Computed, computed} from '@statx/core'

import type {ChromVoidState} from '../../core/state/app-state'
import type {TransportLike} from '../../core/transport/transport'
import type {Store} from '../state/store'

export type Routes = 'loading' | 'welcome' | 'no-license' | 'dashboard' | 'task-progress' | 'no-connection'

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

      // Dev/preview override — allow ?preview=welcome to force the welcome screen
      const previewParam = new URL(location.href).searchParams.get('preview')
      if (previewParam === 'welcome') {
        return 'welcome'
      }

      // For browser/WS mode keep legacy routing behavior.
      if (ws.kind !== 'tauri') {
        return 'dashboard'
      }

      const s = state.data()
      const needInit = Boolean(s.NeedUserInitialization)
      const opened = Boolean(s.StorageOpened)
      const allowRemoteDashboard = store.remoteSessionState() === 'ready'

      if ((needInit || !opened) && !allowRemoteDashboard) {
        return 'welcome'
      }

      return 'dashboard'
    })
  }
}
