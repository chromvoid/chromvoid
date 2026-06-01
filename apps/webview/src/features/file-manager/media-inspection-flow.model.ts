import {wrap} from '@reatom/core'

import {CatalogEventType} from 'root/core/catalog/local-catalog/types'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {runtimeModeModel} from 'root/core/runtime/runtime-mode.model'
import type {AppContext} from 'root/shared/services/app-context'
import type {FileItemData, FileListItem} from 'root/shared/contracts/file-manager'
import {writeAndroidUnlockDebug} from 'root/shared/services/android-unlock-debug'
import {isIsoBmffMediaCandidate} from 'root/utils/file-format-registry'

const MOBILE_VISIBLE_INSPECTION_DELAY_MS = 3_000
const DESKTOP_VISIBLE_INSPECTION_CONCURRENCY = 2

type MediaInspectionPriority = 'visible' | 'open'

export type FileMediaInspectionFlowDebugSnapshot = {
  pendingCount: number
  inFlightCount: number
  deferredCount: number
  hasDeferredTimer: boolean
  generation: number
  completedMissCount: number
  maxVisibleConcurrency: number
  lockPending: boolean
}

export class FileMediaInspectionFlow {
  private readonly pendingInspections = new Set<string>()
  private readonly inFlightInspections = new Map<string, Promise<FileMediaInfoResult>>()
  private readonly completedMisses = new Set<string>()
  private deferredVisibleItems: readonly FileListItem[] = []
  private deferredVisibleTimer: ReturnType<typeof setTimeout> | undefined
  private lastSkippedVisibleCandidateKey: string | null = null
  private generation = 0

  constructor(private readonly ctx: AppContext) {}

  getDebugSnapshot(): FileMediaInspectionFlowDebugSnapshot {
    return {
      pendingCount: this.pendingInspections.size,
      inFlightCount: this.inFlightInspections.size,
      deferredCount: this.deferredVisibleItems.length,
      hasDeferredTimer: this.deferredVisibleTimer != null,
      generation: this.generation,
      completedMissCount: this.completedMisses.size,
      maxVisibleConcurrency: this.maxVisibleInspections(),
      lockPending: this.isVaultLockPending(),
    }
  }

  shouldInspectForOpen(item: FileItemData): boolean {
    return this.shouldInspectCandidate(item)
  }

  shouldQueueVisible(item: FileItemData): boolean {
    return this.visibleEnrichmentAllowed() && this.shouldInspectCandidate(item)
  }

  private shouldInspectCandidate(item: FileItemData): boolean {
    const key = this.inspectionKey(item)
    return (
      !this.isVaultLockPending() &&
      !item.isDir &&
      item.mediaInfo == null &&
      !this.hasCompletedInspection(item) &&
      isIsoBmffMediaCandidate(item.name, item.mimeType) &&
      !this.completedMisses.has(key)
    )
  }

  queueVisible(items: readonly FileListItem[]): void {
    if (this.isVaultLockPending()) {
      this.cancelPending('vault-lock')
      return
    }

    if (!this.visibleEnrichmentAllowed()) {
      this.skipVisibleInspections(items)
      return
    }

    this.lastSkippedVisibleCandidateKey = null

    if (this.shouldDeferVisibleInspections()) {
      this.deferVisibleInspections(items)
      return
    }

    this.startVisibleInspections(items)
  }

  cancelPending(reason: string): void {
    if (this.pendingInspections.size === 0 && this.deferredVisibleTimer == null && reason === 'vault-lock') return
    this.generation += 1
    this.pendingInspections.clear()
    this.inFlightInspections.clear()
    this.clearDeferredVisibleInspections()
    writeAndroidUnlockDebug('media-inspection', 'cancel', {
      reason,
      generation: this.generation,
    })
  }

  async ensureBeforeOpen(
    item: FileItemData,
    resolveItem: (nodeId: number) => FileItemData | null,
  ): Promise<FileItemData> {
    if (!this.shouldInspectForOpen(item)) {
      return item
    }

    const key = this.inspectionKey(item)
    const generation = this.generation
    const mediaInfo = await this.startInspection(item, key, generation, 'open')
    const refreshed = resolveItem(item.id)
    if (refreshed?.mediaInfo != null || mediaInfo == null) {
      return refreshed ?? {...item, mediaInfo: mediaInfo ?? null}
    }
    return {...(refreshed ?? item), mediaInfo}
  }

  private startVisibleInspections(items: readonly FileListItem[]): void {
    const generation = this.generation
    const maxInspections = this.maxVisibleInspections()
    const availableSlots = Math.max(0, maxInspections - this.pendingInspections.size)
    let queued = 0
    for (const item of items) {
      if (queued >= availableSlots) return
      if (!this.shouldQueueVisible(item)) continue
      const key = this.inspectionKey(item)
      if (this.pendingInspections.has(key)) continue
      queued += 1
      void this.startInspection(item, key, generation, 'visible')
    }
  }

  private deferVisibleInspections(items: readonly FileListItem[]): void {
    this.deferredVisibleItems = items
    if (!items.some((item) => this.shouldQueueVisible(item)) || this.deferredVisibleTimer != null)
      return

    const generation = this.generation
    this.deferredVisibleTimer = setTimeout(() => {
      this.deferredVisibleTimer = undefined
      if (generation !== this.generation || this.isVaultLockPending()) {
        if (this.isVaultLockPending()) {
          this.cancelPending('vault-lock')
        }
        return
      }
      const deferredItems = this.deferredVisibleItems
      this.deferredVisibleItems = []
      this.startVisibleInspections(deferredItems)
    }, MOBILE_VISIBLE_INSPECTION_DELAY_MS)
  }

  private clearDeferredVisibleInspections(): void {
    this.deferredVisibleItems = []
    if (this.deferredVisibleTimer == null) return
    clearTimeout(this.deferredVisibleTimer)
    this.deferredVisibleTimer = undefined
  }

  private skipVisibleInspections(items: readonly FileListItem[]): void {
    this.clearDeferredVisibleInspections()
    const candidates = items.filter((item) => this.shouldInspectCandidate(item))
    const candidateKey = candidates.map((item) => this.inspectionKey(item)).join('|')
    if (!candidateKey) {
      this.lastSkippedVisibleCandidateKey = null
      return
    }
    if (candidateKey === this.lastSkippedVisibleCandidateKey) return

    this.lastSkippedVisibleCandidateKey = candidateKey
    writeAndroidUnlockDebug('media-inspection', 'visible:skip', {
      reason: this.visibleSkipReason() ?? 'visible_enrichment_disabled',
      candidateCount: candidates.length,
    })
  }

  private inspectionKey(item: FileItemData): string {
    return `${item.id}:${item.sourceRevision ?? 0}:${item.mimeType ?? ''}`
  }

  private hasCompletedInspection(item: FileItemData): boolean {
    const sourceRevision = item.sourceRevision
    return (
      typeof sourceRevision === 'number' &&
      sourceRevision > 0 &&
      item.mediaInspectedRevision === sourceRevision
    )
  }

  private rememberMiss(key: string): void {
    this.completedMisses.add(key)
    if (this.completedMisses.size <= 256) return

    const oldest = this.completedMisses.values().next().value
    if (oldest) {
      this.completedMisses.delete(oldest)
    }
  }

  private isVaultLockPending(): boolean {
    const pending = (this.ctx.store as {vaultLockPending?: () => boolean}).vaultLockPending
    return typeof pending === 'function' ? pending() : false
  }

  private maxVisibleInspections(): number {
    const layoutMode = (this.ctx.store as {layoutMode?: () => string}).layoutMode?.()
    return getRuntimeCapabilities().mobile || layoutMode === 'mobile'
      ? 1
      : DESKTOP_VISIBLE_INSPECTION_CONCURRENCY
  }

  private shouldDeferVisibleInspections(): boolean {
    const layoutMode = (this.ctx.store as {layoutMode?: () => string}).layoutMode?.()
    return getRuntimeCapabilities().mobile || layoutMode === 'mobile'
  }

  private visibleEnrichmentAllowed(): boolean {
    return this.visibleSkipReason() == null
  }

  private visibleSkipReason(): string | null {
    if (runtimeModeModel.remoteCoreMode()) {
      return runtimeModeModel.remoteMediaInspectionVisibleAllowed() ? null : 'remote_split_unsupported'
    }
    return getRuntimeCapabilities().platform === 'android' ? 'android_visible_optimized_out' : null
  }

  private startInspection(
    item: FileItemData,
    key: string,
    generation: number,
    priority: MediaInspectionPriority,
  ): Promise<FileMediaInfoResult> {
    const existing = this.inFlightInspections.get(key)
    if (existing) return existing

    this.pendingInspections.add(key)
    writeAndroidUnlockDebug('media-inspection', 'inspect:start', {
      priority,
      nodeId: item.id,
      sourceRevision: item.sourceRevision ?? null,
    })
    const promise = this.inspect(item, key, generation, priority).finally(() => {
      this.pendingInspections.delete(key)
      this.inFlightInspections.delete(key)
    })
    this.inFlightInspections.set(key, promise)
    return promise
  }

  private async inspect(
    item: FileItemData,
    key: string,
    generation: number,
    priority: MediaInspectionPriority,
  ): Promise<FileMediaInfoResult> {
    try {
      const result = await wrap(this.ctx.catalog.api.inspectMediaInfo(item.id))
      if (generation !== this.generation || this.isVaultLockPending()) {
        writeAndroidUnlockDebug('media-inspection', 'inspect:stale', {
          priority,
          nodeId: item.id,
          generation,
          currentGeneration: this.generation,
        })
        return undefined
      }
      this.ctx.catalog.catalog.applyEvent({
        type: CatalogEventType.NODE_UPDATED,
        nodeId: result.nodeId,
        timestamp: Date.now(),
        version: 0,
        metadata: {
          mediaInfo: result.mediaInfo,
          ...(typeof result.sourceRevision === 'number' ? {sourceRevision: result.sourceRevision} : {}),
          ...(typeof result.mediaInspectedRevision === 'number'
            ? {mediaInspectedRevision: result.mediaInspectedRevision}
            : {}),
        },
      })
      const inspectedCurrentRevision =
        typeof result.sourceRevision === 'number' &&
        result.sourceRevision > 0 &&
        result.mediaInspectedRevision === result.sourceRevision
      if (result.mediaInfo == null && inspectedCurrentRevision) {
        this.rememberMiss(key)
      } else if (result.mediaInfo != null) {
        this.completedMisses.delete(key)
      }
      return result.mediaInfo
    } catch {
      if (generation !== this.generation || this.isVaultLockPending()) {
        return undefined
      }
      this.rememberMiss(key)
      return undefined
    }
  }
}

type FileMediaInfoResult = Awaited<ReturnType<AppContext['catalog']['api']['inspectMediaInfo']>>['mediaInfo'] | undefined
