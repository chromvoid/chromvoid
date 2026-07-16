import {tryGetAppContext} from 'root/shared/services/app-context'
import type {FileSourceLoadResult} from 'root/features/media/components/file-loader'

/**
 * SPEC-231 follow-up: preview → full-player prepared-source handoff.
 *
 * A video preview tile that already holds a live prepared source can offer it
 * here; when the full player starts loading the same node it claims the offer
 * instead of preparing a second source (one avoidable prepare RTT plus the
 * Rust-side source setup on the open critical path).
 *
 * Ownership rules:
 * - While an offer is unclaimed the offering owner keeps full release
 *   responsibility; revoking removes the offer before the owner releases.
 * - Claiming transfers release responsibility atomically to the claimer. The
 *   original owner's release call must then become a no-op
 *   (`consumeHandedOffVideoSourceRelease` returns true exactly once), so the
 *   source is released exactly once even when lifecycle release triggers fire
 *   mid-handoff.
 *
 * Only delivery kinds whose URLs/segments are reusable across owners are
 * handoff-safe (loopback-http, mse, and desktop media streams). Native-video
 * sources are bound to a single native playback surface and are excluded, as
 * are blob URLs (cheap to rebuild from the blob cache).
 */
export type VideoSourceHandoffIdentity = {
  nodeId: number
  lastModified?: number
}

type VideoSourceHandoffEntry = {
  identity: VideoSourceHandoffIdentity
  source: FileSourceLoadResult
  claimed: boolean
}

const offersByNode = new Map<number, VideoSourceHandoffEntry>()
const entriesBySource = new Map<FileSourceLoadResult, VideoSourceHandoffEntry>()

export function isHandoffSafeVideoSource(source: FileSourceLoadResult): boolean {
  if (source.kind === 'media-stream') {
    return true
  }
  if (source.kind === 'video-source') {
    return source.delivery === 'loopback-http' || source.delivery === 'mse'
  }
  return false
}

function currentCatalogSourceRevision(nodeId: number): number | null {
  try {
    const catalog = tryGetAppContext()?.catalog as
      | {catalog?: {getNode?: (id: number) => {sourceRevision?: unknown} | undefined}}
      | undefined
    const value = catalog?.catalog?.getNode?.(nodeId)?.sourceRevision
    return typeof value === 'number' && Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

function dropEntry(entry: VideoSourceHandoffEntry): void {
  entriesBySource.delete(entry.source)
  if (offersByNode.get(entry.identity.nodeId) === entry) {
    offersByNode.delete(entry.identity.nodeId)
  }
}

/** Offer a live prepared source for takeover by another owner. */
export function offerVideoSourceHandoff(
  identity: VideoSourceHandoffIdentity,
  source: FileSourceLoadResult,
): void {
  if (!isHandoffSafeVideoSource(source)) {
    return
  }

  const previous = offersByNode.get(identity.nodeId)
  if (previous && !previous.claimed && previous.source !== source) {
    entriesBySource.delete(previous.source)
  }

  const entry: VideoSourceHandoffEntry = {identity, source, claimed: false}
  offersByNode.set(identity.nodeId, entry)
  entriesBySource.set(source, entry)
}

/**
 * Claim a live offered source for the same node and revision. Returns null
 * (fresh prepare required) on a different node, mismatched lastModified, a
 * stale source revision, or when the source was already released/claimed.
 */
export function claimVideoSourceHandoff(
  query: VideoSourceHandoffIdentity,
): FileSourceLoadResult | null {
  const entry = offersByNode.get(query.nodeId)
  if (!entry || entry.claimed) {
    return null
  }
  if (entry.identity.lastModified !== query.lastModified) {
    return null
  }

  const currentRevision = currentCatalogSourceRevision(query.nodeId)
  if (
    currentRevision !== null &&
    typeof entry.source.sourceRevision === 'number' &&
    entry.source.sourceRevision !== currentRevision
  ) {
    // Stale source: drop the offer, but leave release responsibility with the
    // original owner.
    dropEntry(entry)
    return null
  }

  entry.claimed = true
  offersByNode.delete(query.nodeId)
  return entry.source
}

/**
 * Called by the original owner before releasing a source. Returns true when
 * the source was handed off to a new owner — the caller must then skip its
 * release (the claimer owns release now). Consumes the claim marker so this
 * returns true at most once per source.
 */
export function consumeHandedOffVideoSourceRelease(source: FileSourceLoadResult): boolean {
  const entry = entriesBySource.get(source)
  if (!entry || !entry.claimed) {
    return false
  }

  entriesBySource.delete(source)
  return true
}

/** Withdraw an unclaimed offer (the owner is about to release the source). */
export function revokeVideoSourceHandoff(source: FileSourceLoadResult): void {
  const entry = entriesBySource.get(source)
  if (!entry || entry.claimed) {
    return
  }

  dropEntry(entry)
}

export function resetVideoSourceHandoffForTests(): void {
  offersByNode.clear()
  entriesBySource.clear()
}

export function getVideoSourceHandoffOfferCountForTests(): number {
  return offersByNode.size
}
