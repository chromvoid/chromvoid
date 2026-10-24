export type ActiveCoreAccessContext =
  | {sourceCore: 'local'}
  | {
      sourceCore: 'remote_host'
      peerId: string
      transportSessionGeneration: number | null
    }

type RemoteHostLike = {
  type?: unknown
  peer_id?: unknown
  host_id?: unknown
}

function normalizeTransportSessionGeneration(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null
}

function remotePeerId(host: RemoteHostLike): string | null {
  const id =
    typeof host.peer_id === 'string'
      ? host.peer_id
      : typeof host.host_id === 'string'
        ? host.host_id
        : null
  if (!id) return null
  const transport = typeof host.type === 'string' && host.type ? host.type : 'remote'
  return `${transport}:${id}`
}

export function activeCoreAccessContextFromMode(
  mode: unknown,
  transportSessionGeneration: unknown = null,
): ActiveCoreAccessContext | null {
  if (mode === 'local') return {sourceCore: 'local'}
  if (typeof mode !== 'object' || mode === null || !('remote' in mode)) return null

  const remote = (mode as {remote?: unknown}).remote
  if (typeof remote !== 'object' || remote === null || !('host' in remote)) return null
  const host = (remote as {host?: unknown}).host
  if (typeof host !== 'object' || host === null) return null
  const peerId = remotePeerId(host as RemoteHostLike)
  if (!peerId) return null

  return {
    sourceCore: 'remote_host',
    peerId,
    transportSessionGeneration: normalizeTransportSessionGeneration(transportSessionGeneration),
  }
}

export function activeCoreAccessContextKey(context: ActiveCoreAccessContext): string {
  if (context.sourceCore === 'local') return 'local'
  return `remote:${context.peerId}:${context.transportSessionGeneration ?? 'unknown'}`
}
