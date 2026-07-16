import type {ManagerSaver} from '@project/passmanager/types'

import {runtimeModeModel} from 'root/core/runtime/runtime-mode.model'
import type {ChromVoidState} from 'root/core/state/app-state'
import type {TransportLike} from 'root/core/transport/transport'
import {pmModel} from 'root/features/passmanager/password-manager.model'
import {subscribeAfterInitial, type Unsubscribe} from 'root/shared/services/subscribed-signal'
import type {Store} from '../state/store'

const configuredSavers = new WeakSet<object>()

function readRemotePeerId(store: Store): string | null {
  return store.remoteSessionPeerId?.() ?? null
}

function readRemoteGeneration(store: Store): number | null {
  return store.remoteSessionGeneration?.() ?? null
}

function readSessionKey(
  ws: TransportLike,
  state: ChromVoidState,
  store: Store,
): string | null {
  if (!ws.connected() || store.vaultLockPending()) return null

  if (runtimeModeModel.remoteCoreMode()) {
    const peerId = readRemotePeerId(store)
    if (store.remoteSessionState() !== 'ready' || !peerId) return null
    return `remote:${peerId}:${readRemoteGeneration(store) ?? 'unknown'}`
  }

  const snapshot = state.data()
  if (!snapshot.StorageOpened) return null
  return `local:${snapshot.StorePath ?? 'default'}`
}

export function setupPassmanagerSession(
  ws: TransportLike,
  state: ChromVoidState,
  store: Store,
  managerSaver: ManagerSaver,
): () => void {
  if (configuredSavers.has(managerSaver as object)) return () => {}
  configuredSavers.add(managerSaver as object)
  pmModel.configure(managerSaver)

  let activeKey: string | null = null
  const update = () => {
    const nextKey = readSessionKey(ws, state, store)
    if (nextKey === activeKey) return

    activeKey = nextKey
    if (!nextKey) {
      pmModel.disposeSession()
      return
    }

    void pmModel.prepareSession(nextKey)
  }

  const unsubscribers: Unsubscribe[] = [
    subscribeAfterInitial(ws.connected, update),
    subscribeAfterInitial(state.data, update),
    subscribeAfterInitial(store.vaultLockPending, update),
    subscribeAfterInitial(store.remoteSessionState, update),
    subscribeAfterInitial(store.remoteSessionPeerId, update),
    subscribeAfterInitial(store.remoteSessionGeneration, update),
    subscribeAfterInitial(runtimeModeModel.remoteCoreMode, update),
  ]
  update()

  return () => {
    for (const unsubscribe of unsubscribers.splice(0)) unsubscribe()
    configuredSavers.delete(managerSaver as object)
    activeKey = null
    pmModel.disposeSession()
  }
}
