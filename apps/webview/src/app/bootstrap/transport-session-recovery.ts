import type {Store} from '../state/store'
import {subscribeAfterInitial, type Unsubscribe} from '../../shared/services/subscribed-signal'
import {releaseMediaSourcesForTransportSessionChange} from '../../features/media/models/media-lifecycle'

type TransportSessionKey = {
  peerId: string | null
  generation: number | null
}

function readTransportSessionKey(store: Store): TransportSessionKey {
  return {
    peerId: store.remoteSessionPeerId(),
    generation: store.remoteSessionGeneration(),
  }
}

function sameTransportSessionKey(left: TransportSessionKey, right: TransportSessionKey): boolean {
  return left.peerId === right.peerId && left.generation === right.generation
}

function hasTransportSession(key: TransportSessionKey): boolean {
  return key.peerId !== null || key.generation !== null
}

export function setupTransportSessionRecovery(store: Store): () => void {
  let previous = readTransportSessionKey(store)

  const update = () => {
    const next = readTransportSessionKey(store)
    if (sameTransportSessionKey(previous, next)) return
    const hadSession = hasTransportSession(previous)
    previous = next
    if (!hadSession) return

    void releaseMediaSourcesForTransportSessionChange().catch((error) => {
      console.warn('[transport-session-recovery] failed to release media sources', error)
    })
  }

  const unsubscribers: Unsubscribe[] = [
    subscribeAfterInitial(store.remoteSessionPeerId, update),
    subscribeAfterInitial(store.remoteSessionGeneration, update),
  ]

  return () => {
    for (const unsubscribe of unsubscribers.splice(0)) {
      unsubscribe()
    }
  }
}
