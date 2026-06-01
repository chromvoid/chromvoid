import {invalidateFileBlobCache} from 'root/features/media/components/file-loader'
import {mediaPlaybackModel} from './media-playback.model'
import {releaseAllMediaStreamOwnersForLifecycle} from './media-stream-owner-registry'

export type ReleaseMediaSourcesForAppBackgroundOptions = {
  preserveAudioSession?: boolean
}

type CatalogInvalidationEvent = {
  type: string
  nodeId?: unknown
  node_id?: unknown
}

function toSafeNodeId(value: unknown): number | null {
  const nodeId = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(nodeId) && Number.isSafeInteger(nodeId) && nodeId > 0 ? nodeId : null
}

export function getMediaInvalidationNodeIdFromCatalogEvent(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null

  const event = payload as CatalogInvalidationEvent
  const type = String(event.type ?? '')
  if (
    type !== 'update' &&
    type !== 'delete' &&
    type !== 'node_updated' &&
    type !== 'node_deleted'
  ) {
    return null
  }

  return toSafeNodeId(event.node_id ?? event.nodeId)
}

export async function releaseMediaSourcesForVaultLock(): Promise<void> {
  await mediaPlaybackModel.stopSession()
  await releaseAllMediaStreamOwnersForLifecycle('vault-lock')
}

export async function releaseMediaSourcesForAppBackground(
  options: ReleaseMediaSourcesForAppBackgroundOptions = {},
): Promise<void> {
  const preserveAudioSession = Boolean(options.preserveAudioSession)
  if (!preserveAudioSession) {
    await mediaPlaybackModel.releaseSourceForLifecycle('background')
  }
  await releaseAllMediaStreamOwnersForLifecycle('background', undefined, {
    excludeOwner: preserveAudioSession ? mediaPlaybackModel.mediaStreamLifecycleOwner() : undefined,
  })
}

export async function releaseMediaSourcesForSessionEnd(): Promise<void> {
  await mediaPlaybackModel.stopSession()
  await releaseAllMediaStreamOwnersForLifecycle('session-end')
}

export async function releaseMediaSourcesForSourceInvalidation(nodeId: number): Promise<void> {
  invalidateFileBlobCache(nodeId)
  await mediaPlaybackModel.releaseSourceForLifecycle('source-invalidated', {nodeId})
  await releaseAllMediaStreamOwnersForLifecycle('source-invalidated', {nodeId})
}

export function handleMediaCatalogEvent(payload: unknown): void {
  const nodeId = getMediaInvalidationNodeIdFromCatalogEvent(payload)
  if (nodeId === null) return

  void releaseMediaSourcesForSourceInvalidation(nodeId).catch((error) => {
    console.warn('[media-lifecycle] failed to release invalidated media source', {
      nodeId,
      error,
    })
  })
}
