import {atom, wrap} from '@reatom/core'

import type {
  CatalogEvent,
  CatalogEventBatch,
  CatalogFolderBatchResponse,
  CatalogFolderPageRequest,
  CatalogFolderPageResponse,
  CatalogNotesListResponse,
  CatalogSyncManifestResponse,
  PassMeta,
} from './local-catalog/types'
import {
  CATALOG_FOLDER_BATCH_MAX_ITEMS as FOLDER_BATCH_MAX_ITEMS,
  CATALOG_FOLDER_BATCH_MAX_PAGES as FOLDER_BATCH_MAX_PAGES,
  CatalogEventType,
} from './local-catalog/types'
import {CatalogMirror} from './local-catalog/catalog-mirror'
import {normalizeFileMediaInfo, type FileMediaInfo} from './media-info'
import {normalizePath} from './local-catalog/path'
import {defaultLogger} from '../logger'
import {tryGetAppContext} from '../../shared/services/app-context'
import {writeAndroidUnlockDebug} from '../../shared/services/android-unlock-debug'
import {i18n} from '../../i18n'

import type {TransportLike} from '../transport/transport'

export type CatalogSourceMetadata = {
  nodeId: number
  nodeType: number
  name: string
  mimeType: string | null
  size: number
  sourceRevision: number | null
  mediaInspectedRevision: number | null
  mediaInfo: FileMediaInfo | null
}

export type CatalogMediaInspectResult = {
  nodeId: number
  mediaInfo: FileMediaInfo | null
  sourceRevision: number | null
  mediaInspectedRevision: number | null
}

export type CatalogSyncPayloadDebugMetrics = {
  payloadBytes: number
  nodeCount: number
}

function countCatalogNodes(value: unknown): number {
  if (!value || typeof value !== 'object') return 0
  const node = value as {c?: unknown}
  const children = Array.isArray(node.c) ? node.c : []
  return 1 + children.reduce((total, child) => total + countCatalogNodes(child), 0)
}

export function getCatalogSyncPayloadDebugMetrics(value: unknown): CatalogSyncPayloadDebugMetrics {
  const json = JSON.stringify(value)
  return {
    payloadBytes: new TextEncoder().encode(json).byteLength,
    nodeCount: countCatalogNodes(value),
  }
}

export type CatalogFileReplaceConflictMode = 'fail_if_stale' | 'overwrite'

export type CatalogFileReplaceOptions = {
  mimeType?: string | null
  expectedSourceRevision: number | null
  conflictMode?: CatalogFileReplaceConflictMode
}

export type CatalogFileReplaceResult = {
  nodeId: number
  size: number
  mimeType: string
  modtime: number
  sourceRevision: number | null
  mediaInfo?: FileMediaInfo | null
  mediaInspectedRevision?: number | null
}

export type CatalogClientProtocol = {
  list(path: string, includeHidden?: boolean): Promise<{currentPath: string; items: unknown[]}>
  createDir(name: string, parentPath?: string): Promise<{nodeId: number}>
  upload(
    target: number | {parentPath?: string; name: string},
    totalSize: number,
    source: AsyncIterable<Uint8Array>,
    meta?: {
      name?: string
      type?: string
      chunkSize?: number
      onProgress?: (c: number, t: number, p: number) => void
    },
  ): Promise<{nodeId: number}>
  download(nodeId: number): Promise<AsyncIterable<Uint8Array>>
  sourceMetadata(nodeId: number): Promise<CatalogSourceMetadata>
  inspectMediaInfo(nodeId: number): Promise<CatalogMediaInspectResult>
  replaceFile(
    nodeId: number,
    bytes: Uint8Array,
    options: CatalogFileReplaceOptions,
  ): Promise<CatalogFileReplaceResult>
  move(nodeId: number, newParentPath: string, newName?: string): Promise<void>
  rename(nodeId: number, newName: string): Promise<void>
  delete(nodeId: number): Promise<void>
  syncManifest(mirror: CatalogMirror): Promise<void>
  folderList(request: CatalogFolderPageRequest): Promise<CatalogFolderPageResponse>
  folderBatch(pages: CatalogFolderPageRequest[]): Promise<CatalogFolderBatchResponse>
  notesList(): Promise<CatalogNotesListResponse>
  subscribe(): Promise<() => Promise<void>>
}

/*** Catalog transport over existing TransportLike
 */
export class CatalogService {
  private client: CatalogClientProtocol | undefined
  private mirror = new CatalogMirror()
  private unsubscribe?: () => Promise<void>
  private refreshTimer: number | undefined
  private syncRunId = 0
  private pendingFolderPages = new Map<string, Promise<void>>()
  private folderPageQueue: Array<{
    key: string
    request: CatalogFolderPageRequest
    queryKey: string
    resolve: () => void
    reject: (error: unknown) => void
  }> = []
  private folderPageFlushScheduled = false
  syncing = atom(false)
  lastError = atom<string | null>(null)
  // Cache meta.json for PassEntry directories: key - nodeId directories record
  private entryMeta = new Map<number, PassMeta>()
  private retryOptions = {
    attempts: 5,
    baseDelayMs: 300,
    maxDelayMs: 5_000,
    jitterMs: 200,
  }

  constructor(private ws: TransportLike) {
    const log = defaultLogger
    const debug = log.level === 'debug'

    // Apply the catalog server events to the mirror
    ws.on('catalog:event', (_msg, evt) => {
      if (ws.kind === 'tauri') {
        // Rust Core emits sharded delta events (ADR-004 v2).
        // Apply supported deltas directly to keep the mirror consistent and
        // avoid manifest refresh races that can reintroduce deleted nodes.
        const e = evt as unknown as Record<string, unknown>
        const type = String(e['type'] ?? '')
        const rawNodeId = e['node_id']
        const nodeId = typeof rawNodeId === 'number' ? rawNodeId : Number(rawNodeId)
        const rawVersion = e['version']
        const version = typeof rawVersion === 'number' ? rawVersion : Number(rawVersion ?? 0)
        const delta = e['delta'] as Record<string, unknown> | undefined

        const safeNodeId =
          Number.isFinite(nodeId) && nodeId > 0 && Number.isSafeInteger(nodeId) ? nodeId : undefined
        const ts = (() => {
          const raw = delta?.['ts']
          const n = typeof raw === 'number' ? raw : Number(raw)
          return Number.isFinite(n) ? n : Date.now()
        })()

        const shardId = String(e['shard_id'] ?? '')
        const relPath = String(delta?.['path'] ?? '/')

        if (debug && shardId === '.passmanager') {
          try {
            const op = delta?.['op'] as Record<string, unknown> | undefined
            const opType = String(op?.['type'] ?? '')
            log.debug('[Catalog][tauri-event]', {
              type,
              shardId,
              nodeId: safeNodeId ?? null,
              version: Number.isFinite(version) ? version : null,
              path: relPath,
              opType: opType || null,
            })
          } catch {}
        }

        const shardRootPath = shardId ? normalizePath('/' + shardId) : '/'
        const rel = normalizePath(relPath)
        const parentPathAbs = rel === '/' ? shardRootPath : normalizePath(shardRootPath + rel)

        try {
          if (type === 'delete' && safeNodeId) {
            if (debug && shardId === '.passmanager') {
              try {
                log.debug('[Catalog][tauri-event] apply delete', {nodeId: safeNodeId})
              } catch {}
            }
            this.applyCatalogEventWithMetaCleanup({
              type: CatalogEventType.NODE_DELETED,
              nodeId: safeNodeId,
              timestamp: ts,
              version: Number.isFinite(version) ? version : 0,
            })
            return
          }

          if (type === 'create' && safeNodeId && delta && typeof delta === 'object') {
            const op = delta['op'] as Record<string, unknown> | undefined
            const opType = String(op?.['type'] ?? '')
            const node =
              opType === 'create' ? (op?.['node'] as Record<string, unknown> | undefined) : undefined
            if (!node) {
              // Fall back to a manifest refresh when the payload shape is unexpected.
              this.queueRefresh(150)
              return
            }

            const name = String(node['n'] ?? '')
            const tRaw = node['t']
            const t = typeof tRaw === 'number' ? tRaw : Number(tRaw ?? 0)
            const sRaw = node['s']
            const size = typeof sRaw === 'number' ? sRaw : Number(sRaw ?? 0)
            const revisionRaw = node['r']
            const sourceRevision = typeof revisionRaw === 'number' ? revisionRaw : Number(revisionRaw)
            const inspectedRevisionRaw = node['q']
            const mediaInspectedRevision =
              typeof inspectedRevisionRaw === 'number' ? inspectedRevisionRaw : Number(inspectedRevisionRaw)
            const mime = typeof node['y'] === 'string' ? (node['y'] as string) : undefined
            const mediaInfo = normalizeFileMediaInfo(node['u'])
            const hasChildren = Array.isArray(node['c']) && (node['c'] as unknown[]).length > 0

            this.mirror.applyEvent({
              type: CatalogEventType.NODE_CREATED,
              nodeId: safeNodeId,
              timestamp: ts,
              version: Number.isFinite(version) ? version : 0,
              metadata: {
                name,
                parentPath: parentPathAbs,
                type: Number.isFinite(t) ? t : 0,
                size: Number.isFinite(size) ? size : 0,
                sourceRevision: Number.isFinite(sourceRevision) ? sourceRevision : undefined,
                mediaInspectedRevision: Number.isFinite(mediaInspectedRevision)
                  ? mediaInspectedRevision
                  : undefined,
                mimeType: mime,
                mediaInfo,
                deferredContent: hasChildren,
              },
            })

            if (debug && shardId === '.passmanager') {
              try {
                log.debug('[Catalog][tauri-event] apply create', {
                  nodeId: safeNodeId,
                  parentPath: parentPathAbs,
                  name,
                  hasChildren,
                })
              } catch {}
            }
            return
          }

          if (type === 'update' && safeNodeId && delta && typeof delta === 'object') {
            const op = delta['op'] as Record<string, unknown> | undefined
            const opType = String(op?.['type'] ?? '')
            const fields =
              opType === 'update' ? (op?.['fields'] as Record<string, unknown> | undefined) : undefined
            if (fields) {
              const sizeRaw = fields['size']
              const size = typeof sizeRaw === 'number' ? sizeRaw : Number(sizeRaw)
              const modRaw = fields['modtime']
              const modtime = typeof modRaw === 'number' ? modRaw : Number(modRaw)
              const mime =
                typeof fields['mime_type'] === 'string' ? (fields['mime_type'] as string) : undefined
              const revisionRaw = fields['source_revision']
              const sourceRevision = typeof revisionRaw === 'number' ? revisionRaw : Number(revisionRaw)
              const inspectedRevisionRaw = fields['media_inspected_revision']
              const mediaInspectedRevision =
                typeof inspectedRevisionRaw === 'number' ? inspectedRevisionRaw : Number(inspectedRevisionRaw)
              const hasMediaInfo = Object.prototype.hasOwnProperty.call(fields, 'media_info')
              const mediaInfo = hasMediaInfo ? normalizeFileMediaInfo(fields['media_info']) : undefined

              this.mirror.applyEvent({
                type: CatalogEventType.NODE_UPDATED,
                nodeId: safeNodeId,
                timestamp: ts,
                version: Number.isFinite(version) ? version : 0,
                metadata: {
                  size: Number.isFinite(size) ? size : undefined,
                  modtime: Number.isFinite(modtime) ? modtime : undefined,
                  sourceRevision: Number.isFinite(sourceRevision) ? sourceRevision : undefined,
                  mediaInspectedRevision: Number.isFinite(mediaInspectedRevision)
                    ? mediaInspectedRevision
                    : undefined,
                  mime: mime,
                  ...(hasMediaInfo ? {mediaInfo} : {}),
                },
              })

              if (debug && shardId === '.passmanager') {
                try {
                  log.debug('[Catalog][tauri-event] apply update', {
                    nodeId: safeNodeId,
                    size: Number.isFinite(size) ? size : null,
                    modtime: Number.isFinite(modtime) ? modtime : null,
                    sourceRevision: Number.isFinite(sourceRevision) ? sourceRevision : null,
                    mime: mime ?? null,
                  })
                } catch {}
              }
              return
            }
          }
        } catch {
          // Best-effort: fall back to manifest refresh below.
        }

        // For unsupported/unknown delta types (e.g. move/rename), refresh from the manifest path.
        if (debug && shardId === '.passmanager') {
          try {
            log.debug('[Catalog][tauri-event] fallback -> queueRefresh', {type, shardId})
          } catch {}
        }
        this.queueRefresh(150)
        return
      }

      const event = evt as CatalogEvent
      this.applyCatalogEventWithMetaCleanup(event)
      void this.handleMetaEvent(event)
    })

    ws.on('catalog:event:batch', (_msg, payload) => {
      const batch = payload as Partial<CatalogEventBatch> & {events?: unknown}
      const events = Array.isArray(batch.events) ? batch.events : []

      if (ws.kind === 'tauri') {
        this.applyTauriCatalogEventBatch(events)
        return
      }

      const catalogEvents = events as CatalogEvent[]
      this.applyCatalogEventsWithMetaCleanup(catalogEvents)
      for (const event of catalogEvents) {
        void this.handleMetaEvent(event)
      }
    })
  }

  private applyTauriCatalogEventBatch(events: readonly unknown[]): void {
    const catalogEvents: CatalogEvent[] = []
    let needsRefresh = false

    for (const event of events) {
      const converted = this.tauriCatalogEventToMirrorEvent(event)
      if (converted) {
        catalogEvents.push(converted)
      } else {
        needsRefresh = true
      }
    }

    if (catalogEvents.length > 0) {
      this.applyCatalogEventsWithMetaCleanup(catalogEvents)
    }
    if (needsRefresh) {
      this.queueRefresh(150)
    }
  }

  private tauriCatalogEventToMirrorEvent(evt: unknown): CatalogEvent | null {
    const e = evt as Record<string, unknown>
    const type = String(e['type'] ?? '')
    const rawNodeId = e['node_id']
    const nodeId = typeof rawNodeId === 'number' ? rawNodeId : Number(rawNodeId)
    const rawVersion = e['version']
    const version = typeof rawVersion === 'number' ? rawVersion : Number(rawVersion ?? 0)
    const delta = e['delta'] as Record<string, unknown> | undefined

    const safeNodeId =
      Number.isFinite(nodeId) && nodeId > 0 && Number.isSafeInteger(nodeId) ? nodeId : undefined
    const ts = (() => {
      const raw = delta?.['ts']
      const n = typeof raw === 'number' ? raw : Number(raw)
      return Number.isFinite(n) ? n : Date.now()
    })()

    const shardId = String(e['shard_id'] ?? '')
    const relPath = String(delta?.['path'] ?? '/')
    const shardRootPath = shardId ? normalizePath('/' + shardId) : '/'
    const rel = normalizePath(relPath)
    const parentPathAbs = rel === '/' ? shardRootPath : normalizePath(shardRootPath + rel)
    const safeVersion = Number.isFinite(version) ? version : 0

    if (type === 'delete' && safeNodeId) {
      return {
        type: CatalogEventType.NODE_DELETED,
        nodeId: safeNodeId,
        timestamp: ts,
        version: safeVersion,
      }
    }

    if (type === 'create' && safeNodeId && delta && typeof delta === 'object') {
      const op = delta['op'] as Record<string, unknown> | undefined
      const opType = String(op?.['type'] ?? '')
      const node = opType === 'create' ? (op?.['node'] as Record<string, unknown> | undefined) : undefined
      if (!node) return null

      const name = String(node['n'] ?? '')
      const tRaw = node['t']
      const t = typeof tRaw === 'number' ? tRaw : Number(tRaw ?? 0)
      const sRaw = node['s']
      const size = typeof sRaw === 'number' ? sRaw : Number(sRaw ?? 0)
      const revisionRaw = node['r']
      const sourceRevision = typeof revisionRaw === 'number' ? revisionRaw : Number(revisionRaw)
      const inspectedRevisionRaw = node['q']
      const mediaInspectedRevision =
        typeof inspectedRevisionRaw === 'number' ? inspectedRevisionRaw : Number(inspectedRevisionRaw)
      const mime = typeof node['y'] === 'string' ? (node['y'] as string) : undefined
      const mediaInfo = normalizeFileMediaInfo(node['u'])
      const hasChildren = Array.isArray(node['c']) && (node['c'] as unknown[]).length > 0

      return {
        type: CatalogEventType.NODE_CREATED,
        nodeId: safeNodeId,
        timestamp: ts,
        version: safeVersion,
        metadata: {
          name,
          parentPath: parentPathAbs,
          type: Number.isFinite(t) ? t : 0,
          size: Number.isFinite(size) ? size : 0,
          sourceRevision: Number.isFinite(sourceRevision) ? sourceRevision : undefined,
          mediaInspectedRevision: Number.isFinite(mediaInspectedRevision)
            ? mediaInspectedRevision
            : undefined,
          mimeType: mime,
          mediaInfo,
          deferredContent: hasChildren,
        },
      }
    }

    if (type === 'update' && safeNodeId && delta && typeof delta === 'object') {
      const op = delta['op'] as Record<string, unknown> | undefined
      const opType = String(op?.['type'] ?? '')
      const fields = opType === 'update' ? (op?.['fields'] as Record<string, unknown> | undefined) : undefined
      if (!fields) return null

      const sizeRaw = fields['size']
      const size = typeof sizeRaw === 'number' ? sizeRaw : Number(sizeRaw)
      const modRaw = fields['modtime']
      const modtime = typeof modRaw === 'number' ? modRaw : Number(modRaw)
      const mime = typeof fields['mime_type'] === 'string' ? (fields['mime_type'] as string) : undefined
      const revisionRaw = fields['source_revision']
      const sourceRevision = typeof revisionRaw === 'number' ? revisionRaw : Number(revisionRaw)
      const inspectedRevisionRaw = fields['media_inspected_revision']
      const mediaInspectedRevision =
        typeof inspectedRevisionRaw === 'number' ? inspectedRevisionRaw : Number(inspectedRevisionRaw)
      const hasMediaInfo = Object.prototype.hasOwnProperty.call(fields, 'media_info')
      const mediaInfo = hasMediaInfo ? normalizeFileMediaInfo(fields['media_info']) : undefined

      return {
        type: CatalogEventType.NODE_UPDATED,
        nodeId: safeNodeId,
        timestamp: ts,
        version: safeVersion,
        metadata: {
          size: Number.isFinite(size) ? size : undefined,
          modtime: Number.isFinite(modtime) ? modtime : undefined,
          sourceRevision: Number.isFinite(sourceRevision) ? sourceRevision : undefined,
          mediaInspectedRevision: Number.isFinite(mediaInspectedRevision)
            ? mediaInspectedRevision
            : undefined,
          mime,
          ...(hasMediaInfo ? {mediaInfo} : {}),
        },
      }
    }

    return null
  }

  private applyCatalogEventWithMetaCleanup(event: CatalogEvent): void {
    this.clearEntryMetaForDeletedNode(event)
    this.mirror.applyEvent(event)
  }

  private applyCatalogEventsWithMetaCleanup(events: readonly CatalogEvent[]): void {
    for (const event of events) {
      this.clearEntryMetaForDeletedNode(event)
    }
    this.mirror.applyEvents(events)
  }

  private clearEntryMetaForDeletedNode(event: CatalogEvent): void {
    if (event.type !== CatalogEventType.NODE_DELETED) return
    const node = this.mirror.getNode(event.nodeId)
    if (!node) return

    if (node.isDir) {
      this.clearEntryMetaForDirectorySubtree(node.nodeId)
      return
    }

    if (node.isFile && node.name === 'meta.json') {
      const entryNode = this.mirror.findByPath(node.parentPath ?? '/')
      if (entryNode?.isDir) this.entryMeta.delete(entryNode.nodeId)
    }
  }

  private clearEntryMetaForDirectorySubtree(nodeId: number): void {
    const node = this.mirror.getNode(nodeId)
    if (!node?.isDir) return

    this.entryMeta.delete(node.nodeId)
    for (const child of this.mirror.getChildren(node.path)) {
      if (child.isDir) this.clearEntryMetaForDirectorySubtree(child.nodeId)
    }
  }

  private unwrapRpc<T>(resp: unknown, label: string): T {
    if (resp && typeof resp === 'object' && 'ok' in resp) {
      const r = resp as {ok: unknown; result?: unknown; error?: unknown}
      if (r.ok === false) throw new Error(String(r.error || `${label} failed`))
      return (r.result ?? ({} as unknown)) as T
    }
    return resp as T
  }

  get api(): CatalogClientProtocol {
    this.ensureClient()
    return this.client as CatalogClientProtocol
  }

  // Simplified secret client/OTP over directory and WS
  get secrets() {
    const ws = this.ws
    return {
      read: (nodeId: number) => {
        return ws.readSecret(nodeId)
      },
      write: (nodeId: number, data: ArrayBuffer) => {
        return ws.writeSecret(nodeId, data)
      },
      erase: (nodeId: number) => {
        return ws.eraseSecret(nodeId)
      },
    }
  }

  get catalog(): CatalogMirror {
    return this.mirror
  }

  get transport(): TransportLike {
    return this.ws
  }

  getEntryById(_id: string): undefined {
    return undefined
  }

  getOTPLabelById(_otpId: string): undefined {
    return undefined
  }

  findEntryNodeByOTPId(_otpId: string): undefined {
    return undefined
  }

  /**Returns the cached meta. json for the record directory (if any)*/
  getEntryMeta(entryNodeId: number): PassMeta | undefined {
    return this.entryMeta.get(entryNodeId)
  }

  async startSync(): Promise<void> {
    this.ensureClient()
    const runId = ++this.syncRunId
    this.syncing.set(true)
    this.lastError.set(null)
    writeAndroidUnlockDebug('catalog', 'startSync:begin', {runId})
    console.info('[debug][catalog] startSync: begin')
    const syncT0 = performance.now()

    const {attempts, baseDelayMs, maxDelayMs, jitterMs} = this.retryOptions

    let lastError: unknown
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const manifestT0 = performance.now()
        writeAndroidUnlockDebug('catalog', 'syncManifest:begin', {attempt})
        console.info('[debug][catalog] syncManifest: begin attempt=%d', attempt)
        await wrap(this.client!.syncManifest(this.mirror))
        if (!this.isCurrentSyncRun(runId)) {
          this.finishCancelledSyncRun(runId, 'after-syncManifest')
          return
        }
        writeAndroidUnlockDebug('catalog', 'syncManifest:done', {
          attempt,
          dt_ms: Math.round(performance.now() - manifestT0),
        })
        console.info(
          '[debug][catalog] syncManifest: done dt_ms=%d',
          Math.round(performance.now() - manifestT0),
        )
        const subT0 = performance.now()
        writeAndroidUnlockDebug('catalog', 'subscribe:begin', {attempt})
        console.info('[debug][catalog] subscribe: begin')
        const unsubscribe = await wrap(this.client!.subscribe())
        if (!this.isCurrentSyncRun(runId)) {
          await wrap(unsubscribe().catch(() => {}))
          this.finishCancelledSyncRun(runId, 'after-subscribe')
          return
        }
        this.unsubscribe = unsubscribe
        writeAndroidUnlockDebug('catalog', 'subscribe:done', {
          attempt,
          dt_ms: Math.round(performance.now() - subT0),
        })
        console.info('[debug][catalog] subscribe: done dt_ms=%d', Math.round(performance.now() - subT0))

        if (!this.isCurrentSyncRun(runId)) {
          this.finishCancelledSyncRun(runId, 'post-subscribe')
          this.syncing.set(false)
          return
        }

        this.syncing.set(false)
        this.lastError.set(null)
        writeAndroidUnlockDebug('catalog', 'startSync:success', {
          dt_ms: Math.round(performance.now() - syncT0),
        })
        return
      } catch (e) {
        if (!this.isCurrentSyncRun(runId)) {
          this.finishCancelledSyncRun(runId, 'catch')
          return
        }
        lastError = e
        this.lastError.set(e instanceof Error ? e.message : String(e))
        writeAndroidUnlockDebug('catalog', 'startSync:attempt error', {
          attempt,
          error: e instanceof Error ? e.message : String(e),
        })
        // Stop immediately if WebSocket is not ready.
        if (!this.ws.connected()) {
          break
        }
        if (attempt < attempts) {
          const exp = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt - 1))
          const jitter = Math.floor(Math.random() * jitterMs)
          const delayMs = Math.min(maxDelayMs, exp + jitter)
          try {
            tryGetAppContext()?.store.pushNotification(
              'warning',
              i18n('catalog:sync-retry', {
                seconds: (delayMs / 1000).toFixed(1),
                attempt: attempt + 1,
                total: attempts,
              }),
            )
          } catch {}
          await wrap(new Promise((r) => setTimeout(r, delayMs)))
          if (!this.isCurrentSyncRun(runId)) {
            this.finishCancelledSyncRun(runId, 'retry-delay')
            return
          }
          continue
        }
      }
    }

    try {
      tryGetAppContext()?.store.pushNotification('error', i18n('catalog:sync-failed'))
    } catch {}
    this.syncing.set(false)
    writeAndroidUnlockDebug('catalog', 'startSync:failed')
    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  }

  async stopSync(): Promise<void> {
    this.cancelSync('stop')
    if (this.unsubscribe) {
      await wrap(this.unsubscribe())
      this.unsubscribe = undefined
    }
  }

  cancelSync(reason = 'cancel'): void {
    this.syncRunId++
    this.syncing.set(false)
    if (this.refreshTimer !== undefined) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = undefined
    }
    writeAndroidUnlockDebug('catalog', 'sync:cancel', {reason})
  }

  private isCurrentSyncRun(runId: number): boolean {
    return runId === this.syncRunId && this.ws.connected()
  }

  private finishCancelledSyncRun(runId: number, checkpoint: string): void {
    if (runId === this.syncRunId) {
      this.syncing.set(false)
    }
    writeAndroidUnlockDebug('catalog', 'startSync:cancelled', {runId, checkpoint})
  }

  /**Internal method of updating the mirror; silent=true does not show notifications
   */
  private async performRefresh(silent: boolean): Promise<void> {
    this.ensureClient()

    try {
      await wrap(this.client!.syncManifest(this.mirror))
      if (!silent) {
        // Notify of successful update
        tryGetAppContext()?.store.pushNotification('success', i18n('catalog:refresh-success'))
      }
    } catch (e) {
      this.lastError.set(e instanceof Error ? e.message : String(e))
      if (!silent) {
        // Notify us of an update error
        tryGetAppContext()?.store.pushNotification('error', i18n('catalog:refresh-failed'))
      }
      throw e
    }
  }

  /**Forced update of the catalog mirror without re-subscription*/
  async refresh(): Promise<void> {
    return this.performRefresh(false)
  }

  /**Silent Mirror Update Without Notifications*/
  async refreshSilent(): Promise<void> {
    return this.performRefresh(true)
  }

  async loadFolderPage(
    request: CatalogFolderPageRequest,
    queryKey?: string,
  ): Promise<CatalogFolderPageResponse> {
    this.ensureClient()
    const runId = this.syncRunId
    const page = await this.client!.folderList(request)
    if (this.isCurrentSyncRun(runId)) this.mirror.applyFolderPage(page, queryKey)
    return page
  }

  async loadFolderBatch(
    pages: CatalogFolderPageRequest[],
    queryKey?: string,
  ): Promise<CatalogFolderBatchResponse> {
    this.ensureClient()
    const runId = this.syncRunId
    const response = await this.client!.folderBatch(pages)
    if (this.isCurrentSyncRun(runId)) this.mirror.applyFolderBatch(response, queryKey)
    return response
  }

  async listNotes(): Promise<CatalogNotesListResponse> {
    this.ensureClient()
    return this.client!.notesList()
  }

  ensureFolderRangeLoaded(request: CatalogFolderPageRequest, queryKey = 'default'): Promise<void> {
    this.ensureClient()
    const limit = request.limit ?? 200
    if (this.mirror.isFolderRangeLoaded(request.path, request.offset, limit, queryKey)) {
      return Promise.resolve()
    }

    const normalized: CatalogFolderPageRequest = {
      ...request,
      limit,
    }
    const key = this.folderPageRequestKey(normalized, queryKey)
    const pending = this.pendingFolderPages.get(key)
    if (pending) return pending

    this.mirror.setFolderRangeLoading(normalized.path, normalized.offset, limit, true, queryKey)
    const promise = new Promise<void>((resolve, reject) => {
      this.folderPageQueue.push({key, request: normalized, queryKey, resolve, reject})
      this.scheduleFolderPageFlush()
    }).finally(() => {
      this.pendingFolderPages.delete(key)
    })
    this.pendingFolderPages.set(key, promise)
    return promise
  }

  private folderPageRequestKey(request: CatalogFolderPageRequest, queryKey: string): string {
    return JSON.stringify({queryKey, request})
  }

  private scheduleFolderPageFlush(): void {
    if (this.folderPageFlushScheduled) return
    this.folderPageFlushScheduled = true
    queueMicrotask(() => {
      this.folderPageFlushScheduled = false
      void this.flushFolderPageQueue()
    })
  }

  private async flushFolderPageQueue(): Promise<void> {
    if (this.folderPageQueue.length === 0) return

    const first = this.folderPageQueue[0]
    if (!first) return
    const queryKey = first.queryKey
    const batch = []
    let itemCount = 0
    const remaining = []

    for (const item of this.folderPageQueue) {
      const limit = item.request.limit ?? 200
      if (
        item.queryKey !== queryKey ||
        batch.length >= FOLDER_BATCH_MAX_PAGES ||
        itemCount + limit > FOLDER_BATCH_MAX_ITEMS
      ) {
        remaining.push(item)
        continue
      }
      batch.push(item)
      itemCount += limit
    }
    this.folderPageQueue = remaining
    if (remaining.length > 0) this.scheduleFolderPageFlush()

    const runId = this.syncRunId
    try {
      const response = await this.client!.folderBatch(batch.map((item) => item.request))
      if (this.isCurrentSyncRun(runId)) {
        this.mirror.applyFolderBatch(response, queryKey)
      }
      for (const item of batch) {
        this.mirror.setFolderRangeLoading(
          item.request.path,
          item.request.offset,
          item.request.limit ?? 200,
          false,
          item.queryKey,
        )
        item.resolve()
      }
    } catch (error) {
      for (const item of batch) {
        this.mirror.setFolderRangeLoading(
          item.request.path,
          item.request.offset,
          item.request.limit ?? 200,
          false,
          item.queryKey,
        )
        this.mirror.setFolderError(
          item.request.path,
          error instanceof Error ? error.message : String(error),
          item.queryKey,
        )
        item.reject(error)
      }
    }
  }

  /**Schedule an upgrade of the mirror with debowns*/
  queueRefresh(delayMs = 150): void {
    console.info('[debug][catalog] queueRefresh: delay=%dms', delayMs)
    if (this.refreshTimer !== undefined) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = undefined
    }
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = undefined
      const t0 = performance.now()
      console.info('[debug][catalog] performRefresh(queued): begin')
      void this.performRefresh(true).then(
        () =>
          console.info(
            '[debug][catalog] performRefresh(queued): done dt_ms=%d',
            Math.round(performance.now() - t0),
          ),
        (err) =>
          console.warn(
            '[debug][catalog] performRefresh(queued): error dt_ms=%d error=%s',
            Math.round(performance.now() - t0),
            err,
          ),
      )
    }, delayMs)
  }

  private ensureClient(): void {
    if (this.client) return

    const ws = this.ws

    const toU64Number = (n: number, label: string): number => {
      if (!Number.isFinite(n) || n < 0 || !Number.isSafeInteger(n)) {
        throw new Error(`Invalid ${label}: ${n}`)
      }
      return n
    }

    const unwrap = <T>(resp: unknown, label: string): T => this.unwrapRpc<T>(resp, label)
    const unsupportedReplaceFile = (): never => {
      const error = new Error('catalog:file:replace is not supported by this runtime') as Error & {
        code?: string
      }
      error.code = 'WRITE_LOCKED'
      throw error
    }
    const toNodeType = (value: unknown): number => {
      if (typeof value === 'number' && Number.isFinite(value)) return value
      if (value === 'Dir') return 0
      if (value === 'File') return 1
      if (value === 'Symlink') return 2
      return Number(value)
    }
    const normalizeSourceMetadata = (value: unknown): CatalogSourceMetadata => {
      const record = value as Record<string, unknown>
      const nodeId = Number(record['nodeId'] ?? record['node_id'])
      const nodeType = toNodeType(record['nodeType'] ?? record['node_type'])
      const size = Number(record['size'])
      const sourceRevisionRaw = record['sourceRevision'] ?? record['source_revision']
      const sourceRevision =
        typeof sourceRevisionRaw === 'number' && Number.isFinite(sourceRevisionRaw) ? sourceRevisionRaw : null
      const mediaInspectedRevisionRaw = record['mediaInspectedRevision'] ?? record['media_inspected_revision']
      const mediaInspectedRevision =
        typeof mediaInspectedRevisionRaw === 'number' && Number.isFinite(mediaInspectedRevisionRaw)
          ? mediaInspectedRevisionRaw
          : null

      return {
        nodeId,
        nodeType,
        name: String(record['name'] ?? ''),
        mimeType:
          typeof record['mimeType'] === 'string'
            ? record['mimeType']
            : typeof record['mime_type'] === 'string'
              ? record['mime_type']
              : null,
        size,
        sourceRevision,
        mediaInspectedRevision,
        mediaInfo: normalizeFileMediaInfo(record['mediaInfo'] ?? record['media_info']),
      }
    }

    const normalizeMediaInspectResult = (value: unknown): CatalogMediaInspectResult => {
      const record = value as Record<string, unknown>
      const nodeId = Number(record['nodeId'] ?? record['node_id'])
      const sourceRevisionRaw = record['sourceRevision'] ?? record['source_revision']
      const sourceRevision =
        typeof sourceRevisionRaw === 'number' && Number.isFinite(sourceRevisionRaw) ? sourceRevisionRaw : null
      const mediaInspectedRevisionRaw = record['mediaInspectedRevision'] ?? record['media_inspected_revision']
      const mediaInspectedRevision =
        typeof mediaInspectedRevisionRaw === 'number' && Number.isFinite(mediaInspectedRevisionRaw)
          ? mediaInspectedRevisionRaw
          : null

      return {
        nodeId,
        mediaInfo: normalizeFileMediaInfo(record['mediaInfo'] ?? record['media_info']),
        sourceRevision,
        mediaInspectedRevision,
      }
    }

    this.client = {
      list: async (path: string, includeHidden?: boolean) => {
        if (ws.kind === 'tauri') {
          const payload = {
            path: path || null,
            include_hidden: includeHidden ?? null,
          }
          const resp = await ws.sendCatalog('catalog:list', payload)
          const out = unwrap<{current_path: string; items: unknown[]}>(resp, 'catalog:list')
          return {currentPath: out.current_path, items: out.items}
        }
        const resp = await ws.sendCatalog('catalog:list', {path, includeHidden})
        return unwrap(resp, 'catalog:list')
      },
      createDir: async (name: string, parentPath?: string) => {
        if (ws.kind === 'tauri') {
          const payload = {
            name,
            parent_path: parentPath ?? null,
          }
          const resp = await ws.sendCatalog('catalog:createDir', payload)
          const out = unwrap<{node_id: number}>(resp, 'catalog:createDir')
          return {nodeId: out.node_id}
        }
        const resp = await ws.sendCatalog('catalog:createDir', {name, parentPath})
        return unwrap(resp, 'catalog:createDir')
      },
      upload: async (target, totalSize: number, source: AsyncIterable<Uint8Array>, meta) => {
        void totalSize
        const chunks: ArrayBuffer[] = []
        for await (const chunk of source) {
          const copy = new ArrayBuffer(chunk.byteLength)
          new Uint8Array(copy).set(chunk)
          chunks.push(copy)
        }
        const blob = new Blob(chunks, {type: meta?.type ?? 'application/octet-stream'})
        const file = new File([blob], meta?.name ?? 'upload.bin', {type: blob.type})
        return ws.uploadFile(target, file, {
          name: meta?.name,
          type: meta?.type,
          chunkSize: meta?.chunkSize,
          onProgress: meta?.onProgress,
        })
      },
      download: async (nodeId: number) => {
        return ws.downloadFile(nodeId)
      },
      sourceMetadata: async (nodeId: number) => {
        if (ws.sourceMetadata) {
          return normalizeSourceMetadata(await ws.sourceMetadata(nodeId))
        }
        if (ws.kind === 'tauri') {
          const resp = await ws.sendCatalog('catalog:source:metadata', {
            node_id: toU64Number(nodeId, 'nodeId'),
          })
          const out = unwrap<unknown>(resp, 'catalog:source:metadata')
          return normalizeSourceMetadata(out)
        }
        const resp = await ws.sendCatalog('catalog:source:metadata', {nodeId})
        const out = unwrap<unknown>(resp, 'catalog:source:metadata')
        return normalizeSourceMetadata(out)
      },
      inspectMediaInfo: async (nodeId: number) => {
        if (ws.kind === 'tauri') {
          const resp = await ws.sendCatalog('catalog:media:inspect', {
            node_id: toU64Number(nodeId, 'nodeId'),
          })
          const out = unwrap<unknown>(resp, 'catalog:media:inspect')
          return normalizeMediaInspectResult(out)
        }
        const resp = await ws.sendCatalog('catalog:media:inspect', {nodeId})
        const out = unwrap<unknown>(resp, 'catalog:media:inspect')
        return normalizeMediaInspectResult(out)
      },
      replaceFile: async (nodeId, bytes, options) => {
        if (ws.replaceFile) {
          return ws.replaceFile(nodeId, bytes, options)
        }
        return unsupportedReplaceFile()
      },
      move: async (nodeId, newParentPath, newName) => {
        if (ws.kind === 'tauri') {
          const payload = {
            node_id: toU64Number(nodeId, 'nodeId'),
            new_parent_path: newParentPath,
            new_name: newName ?? null,
          }
          const resp = await ws.sendCatalog('catalog:move', payload)
          unwrap<void>(resp, 'catalog:move')
          return
        }
        const resp = await ws.sendCatalog('catalog:move', {nodeId, newParentPath, newName})
        unwrap<void>(resp, 'catalog:move')
      },
      rename: async (nodeId, newName) => {
        if (ws.kind === 'tauri') {
          const payload = {
            node_id: toU64Number(nodeId, 'nodeId'),
            new_name: newName,
          }
          const resp = await ws.sendCatalog('catalog:rename', payload)
          unwrap<void>(resp, 'catalog:rename')
          return
        }
        const resp = await ws.sendCatalog('catalog:rename', {nodeId, newName})
        unwrap<void>(resp, 'catalog:rename')
      },
      delete: async (nodeId) => {
        if (ws.kind === 'tauri') {
          const payload = {
            node_id: toU64Number(nodeId, 'nodeId'),
          }
          const resp = await ws.sendCatalog('catalog:delete', payload)
          unwrap<void>(resp, 'catalog:delete')
          return
        }
        const resp = await ws.sendCatalog('catalog:delete', {nodeId})
        unwrap<void>(resp, 'catalog:delete')
      },
      syncManifest: async (mirror: CatalogMirror) => {
        const runId = this.syncRunId
        const manifestT0 = performance.now()
        let manifestResp: unknown
        try {
          manifestResp = await ws.sendCatalog('catalog:sync:manifest', {})
        } catch (error) {
          if (!this.isCurrentSyncRun(runId)) {
            writeAndroidUnlockDebug('catalog', 'syncManifest:cancelled', {
              runId,
              checkpoint: 'manifest-catch',
            })
            return
          }
          throw error
        }
        if (!this.isCurrentSyncRun(runId)) {
          writeAndroidUnlockDebug('catalog', 'syncManifest:cancelled', {
            runId,
            checkpoint: 'after-manifest',
          })
          return
        }
        const manifest = unwrap<CatalogSyncManifestResponse>(manifestResp, 'catalog:sync:manifest')
        const metrics = getCatalogSyncPayloadDebugMetrics(manifest)
        writeAndroidUnlockDebug('catalog-sync', 'payload', {
          phase: 'manifest',
          shard_count: manifest.shards.length,
          loaded_shard_count: manifest.shards.filter((shard) => shard.loaded).length,
          payload_bytes: metrics.payloadBytes,
          node_count: metrics.nodeCount,
          manifest_budget_bytes: manifest.manifest_budget_bytes,
        })
        writeAndroidUnlockDebug('catalog', 'syncManifest:received', {
          shard_count: manifest.shards.length,
          root_summary_count: manifest.root_summaries.length,
          dt_ms: Math.round(performance.now() - manifestT0),
        })
        mirror.applyManifest(manifest)
      },
      folderList: async (request) => {
        const payload = {
          path: request.path,
          offset: request.offset,
          limit: request.limit ?? null,
          expected_version: request.expected_version ?? null,
          sort: request.sort ?? null,
          filter: request.filter ?? null,
        }
        const resp = await ws.sendCatalog('catalog:folder:list', payload)
        return unwrap<CatalogFolderPageResponse>(resp, 'catalog:folder:list')
      },
      folderBatch: async (pages) => {
        const resp = await ws.sendCatalog('catalog:folder:batch', {pages})
        return unwrap<CatalogFolderBatchResponse>(resp, 'catalog:folder:batch')
      },
      notesList: async () => {
        const resp = await ws.sendCatalog('catalog:notes:list', {})
        return unwrap<CatalogNotesListResponse>(resp, 'catalog:notes:list')
      },
      subscribe: async () => {
        const resp = await ws.sendCatalog('catalog:subscribe', {})
        unwrap<void>(resp, 'catalog:subscribe')
        return async () => {
          const u = await ws.sendCatalog('catalog:unsubscribe', {})
          unwrap<void>(u, 'catalog:unsubscribe')
        }
      },
    }
  }

  private async handleMetaEvent(event: CatalogEvent): Promise<void> {
    try {
      // Looking for meta. json only for file-related events
      const node = this.mirror.getNode(event.nodeId)
      if (!node) return
      const isMetaFile = node.isFile && node.name === 'meta.json'
      if (!isMetaFile) return
      const parentPath = node.parentPath ?? '/'
      const entryNode = this.mirror.findByPath(parentPath)
      if (!entryNode || !entryNode.isDir) return

      const type = (event as CatalogEvent).type
      if (type === CatalogEventType.NODE_DELETED) {
        // Deleted meta.json - clear the cache
        this.entryMeta.delete(entryNode.nodeId)
        // Trigger update mirror subscribers
        this.mirror.applyEvent({
          type: CatalogEventType.NODE_UPDATED,
          nodeId: entryNode.nodeId,
          timestamp: Date.now(),
          version: 0,
          metadata: {},
        })
        return
      }

      // Read meta.json and update your cache
      const stream = await wrap(this.api.download(event.nodeId))
      const decoder = new TextDecoder()
      let text = ''
      for await (const chunk of stream as AsyncIterable<Uint8Array>) {
        text += decoder.decode(chunk, {stream: true})
      }
      text += decoder.decode()
      try {
        wrap(() => {
          const json = JSON.parse(text) as PassMeta
          this.entryMeta.set(entryNode.nodeId, json)
        })()
      } catch {
        // Incorrect JSON – Clear the cache
        this.entryMeta.delete(entryNode.nodeId)
      }
      // Notify mirror subscribers of changes so that the UI is re-rendered
      wrap(() => {
        this.mirror.applyEvent({
          type: CatalogEventType.NODE_UPDATED,
          nodeId: entryNode.nodeId,
          timestamp: Date.now(),
          version: 0,
          metadata: {},
        })
      })()
    } catch {
      // Ignoring Meta Tracking Errors
    }
  }

  /**Lazy meta.json download for record directory (if not already downloaded)*/
  async ensureEntryMeta(entryNodeId: number): Promise<void> {
    if (this.entryMeta.has(entryNodeId)) return
    try {
      const entryNode = this.mirror.getNode(entryNodeId)
      if (!entryNode || !entryNode.isDir) return
      const children = this.mirror.getChildren(entryNode.path)
      const meta = children.find((c) => c.isFile && c.name === 'meta.json')
      if (!meta) return

      const stream = await wrap(this.api.download(meta.nodeId))
      const decoder = new TextDecoder()
      let text = ''
      for await (const chunk of stream as AsyncIterable<Uint8Array>) {
        text += decoder.decode(chunk, {stream: true})
      }
      text += decoder.decode()

      try {
        wrap(() => {
          const json = JSON.parse(text) as PassMeta
          this.entryMeta.set(entryNodeId, json)
          this.mirror.applyEvent({
            type: CatalogEventType.NODE_UPDATED,
            nodeId: entryNodeId,
            timestamp: Date.now(),
            version: 0,
            metadata: {},
          })
        })()
      } catch {
        // ignore invalid meta
      }
    } catch {
      // ignore errors
    }
  }
}
