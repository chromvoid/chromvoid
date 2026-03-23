import {state} from '@statx/core'

import type {CatalogEvent, CatalogJSON, PassMeta} from './local-catalog/types'
import {CatalogEventType} from './local-catalog/types'
import {CatalogMirror} from './local-catalog/catalog-mirror'
import {normalizePath} from './local-catalog/path'
import {defaultLogger} from '../logger'
import {tryGetAppContext} from '../../shared/services/app-context'

import type {TransportLike} from '../transport/transport'

export type CatalogClientProtocol = {
  list(path: string, includeHidden?: boolean): Promise<{currentPath: string; items: unknown[]}>
  createDir(name: string, parentPath?: string): Promise<{nodeId: number}>
  upload(
    nodeId: number,
    totalSize: number,
    source: AsyncIterable<Uint8Array>,
    meta?: {
      name?: string
      type?: string
      chunkSize?: number
      onProgress?: (c: number, t: number, p: number) => void
    },
  ): Promise<void>
  prepareUpload(
    parentPath: string | undefined,
    name: string,
    size: number,
    chunkSize?: number,
    mimeType?: string,
  ): Promise<{nodeId: number}>
  download(nodeId: number): Promise<AsyncIterable<Uint8Array>>
  move(nodeId: number, newParentPath: string, newName?: string): Promise<void>
  rename(nodeId: number, newName: string): Promise<void>
  delete(nodeId: number): Promise<void>
  syncInit(mirror: CatalogMirror): Promise<void>
  subscribe(): Promise<() => Promise<void>>
}

/**
 * Транспорт каталога поверх существующего TransportLike
 */
export class CatalogService {
  private client: CatalogClientProtocol | undefined
  private mirror = new CatalogMirror()
  private unsubscribe?: () => Promise<void>
  private refreshTimer: number | undefined
  syncing = state(false)
  lastError = state<string | null>(null)
  // Кэш meta.json для PassEntry директорий: ключ — nodeId директории записи
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

    // Применяем серверные события каталога к зеркалу
    ws.on('catalog:event', (_msg, evt) => {
      if (ws.kind === 'tauri') {
        // Rust Core emits sharded delta events (ADR-004 v2).
        // Apply supported deltas directly to keep the mirror consistent and
        // avoid full snapshot reload races (which can reintroduce deleted nodes).
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
            this.mirror.applyEvent({
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
              // Fall back to a snapshot resync when the payload shape is unexpected.
              this.queueRefresh(150)
              return
            }

            const name = String(node['n'] ?? '')
            const tRaw = node['t']
            const t = typeof tRaw === 'number' ? tRaw : Number(tRaw ?? 0)
            const sRaw = node['s']
            const size = typeof sRaw === 'number' ? sRaw : Number(sRaw ?? 0)
            const mime = typeof node['y'] === 'string' ? (node['y'] as string) : undefined
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
                mimeType: mime,
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

              this.mirror.applyEvent({
                type: CatalogEventType.NODE_UPDATED,
                nodeId: safeNodeId,
                timestamp: ts,
                version: Number.isFinite(version) ? version : 0,
                metadata: {
                  size: Number.isFinite(size) ? size : undefined,
                  modtime: Number.isFinite(modtime) ? modtime : undefined,
                  mime: mime,
                },
              })

              if (debug && shardId === '.passmanager') {
                try {
                  log.debug('[Catalog][tauri-event] apply update', {
                    nodeId: safeNodeId,
                    size: Number.isFinite(size) ? size : null,
                    modtime: Number.isFinite(modtime) ? modtime : null,
                    mime: mime ?? null,
                  })
                } catch {}
              }
              return
            }
          }
        } catch {
          // Best-effort: fall back to snapshot refresh below.
        }

        // For unsupported/unknown delta types (e.g. move/rename), keep the old behavior.
        if (debug && shardId === '.passmanager') {
          try {
            log.debug('[Catalog][tauri-event] fallback -> queueRefresh', {type, shardId})
          } catch {}
        }
        this.queueRefresh(150)
        return
      }

      const event = evt as CatalogEvent
      this.mirror.applyEvent(event)
      void this.handleMetaEvent(event)
    })
  }

  private unwrapRpc<T>(resp: unknown, label: string): T {
    if (resp && typeof resp === 'object' && 'ok' in resp) {
      const r = resp as {ok: unknown; result?: unknown; error?: unknown}
      if (r.ok === false) throw new Error(String(r.error || `${label} failed`))
      return (r.result ?? ({} as unknown)) as T
    }
    return resp as T
  }

  private isPassmanagerNode(nodeId: number): boolean {
    try {
      const p = normalizePath(this.mirror.getPath(nodeId) ?? '/')
      return p === '/.passmanager' || p.startsWith('/.passmanager/')
    } catch {
      return false
    }
  }

  get api(): CatalogClientProtocol {
    this.ensureClient()
    return this.client as CatalogClientProtocol
  }

  // Упрощённый клиент секретов/OTP поверх каталога и WS
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

  /** Возвращает кэшированный meta.json для директории записи (если есть) */
  getEntryMeta(entryNodeId: number): PassMeta | undefined {
    return this.entryMeta.get(entryNodeId)
  }

  async startSync(): Promise<void> {
    this.ensureClient()
    this.syncing.set(true)
    this.lastError.set(null)
    console.info('[debug][catalog] startSync: begin')
    const syncT0 = performance.now()

    const {attempts, baseDelayMs, maxDelayMs, jitterMs} = this.retryOptions

    let lastError: unknown
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const initT0 = performance.now()
        console.info('[debug][catalog] syncInit: begin attempt=%d', attempt)
        await this.client!.syncInit(this.mirror)
        console.info('[debug][catalog] syncInit: done dt_ms=%d', Math.round(performance.now() - initT0))
        const subT0 = performance.now()
        console.info('[debug][catalog] subscribe: begin')
        this.unsubscribe = await this.client!.subscribe()
        console.info('[debug][catalog] subscribe: done dt_ms=%d', Math.round(performance.now() - subT0))

        try {
          tryGetAppContext()?.store.pushNotification('success', 'Каталог успешно синхронизирован')
        } catch {}
        this.syncing.set(false)
        this.lastError.set(null)
        return
      } catch (e) {
        lastError = e
        this.lastError.set(e instanceof Error ? e.message : String(e))
        // Прерываем немедленно, если WebSocket не готов
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
              `Сбой синхронизации каталога. Повтор через ${(delayMs / 1000).toFixed(1)}с (попытка ${
                attempt + 1
              }/${attempts})`,
            )
          } catch {}
          await new Promise((r) => setTimeout(r, delayMs))
          continue
        }
      }
    }

    try {
      tryGetAppContext()?.store.pushNotification('error', 'Не удалось синхронизировать каталог')
    } catch {}
    this.syncing.set(false)
    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  }

  async stopSync(): Promise<void> {
    if (this.unsubscribe) {
      await this.unsubscribe()
      this.unsubscribe = undefined
    }
  }

  /**
   * Внутренний метод обновления зеркала; при silent=true не показывает уведомления
   */
  private async performRefresh(silent: boolean): Promise<void> {
    this.ensureClient()

    try {
      await this.client!.syncInit(this.mirror)
      if (!silent) {
        // Уведомляем об успешном обновлении
        tryGetAppContext()?.store.pushNotification('success', 'Каталог обновлен')
      }
    } catch (e) {
      this.lastError.set(e instanceof Error ? e.message : String(e))
      if (!silent) {
        // Уведомляем об ошибке обновления
        tryGetAppContext()?.store.pushNotification('error', 'Не удалось обновить каталог')
      }
      throw e
    }
  }

  /** Принудительное обновление зеркала каталога без переоформления подписки */
  async refresh(): Promise<void> {
    return this.performRefresh(false)
  }

  /** Тихое обновление зеркала без уведомлений */
  async refreshSilent(): Promise<void> {
    return this.performRefresh(true)
  }

  /** Запланировать обновление зеркала с дебаунсом */
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
        () => console.info('[debug][catalog] performRefresh(queued): done dt_ms=%d', Math.round(performance.now() - t0)),
        (err) => console.warn('[debug][catalog] performRefresh(queued): error dt_ms=%d error=%s', Math.round(performance.now() - t0), err),
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
      upload: async (nodeId: number, totalSize: number, source: AsyncIterable<Uint8Array>, meta) => {
        void totalSize
        const chunks: ArrayBuffer[] = []
        for await (const chunk of source) {
          const copy = new ArrayBuffer(chunk.byteLength)
          new Uint8Array(copy).set(chunk)
          chunks.push(copy)
        }
        const blob = new Blob(chunks, {type: meta?.type ?? 'application/octet-stream'})
        const file = new File([blob], meta?.name ?? 'upload.bin', {type: blob.type})
        await ws.uploadFile(nodeId, file, {
          name: meta?.name,
          type: meta?.type,
          chunkSize: meta?.chunkSize,
          onProgress: meta?.onProgress,
        })
      },
      prepareUpload: async (parentPath, name, size, chunkSize, mimeType) => {
        if (ws.kind === 'tauri') {
          const payload = {
            parent_path: parentPath ?? '/',
            name,
            size: toU64Number(size, 'size'),
            mime_type: mimeType ?? null,
            chunk_size: chunkSize ?? null,
          }
          const resp = await ws.sendCatalog('catalog:prepareUpload', payload)
          const out = unwrap<{node_id: number}>(resp, 'catalog:prepareUpload')
          return {nodeId: out.node_id}
        }
        const resp = await ws.sendCatalog('catalog:prepareUpload', {
          parentPath,
          name,
          size,
          chunkSize,
          mimeType,
        })
        return unwrap(resp, 'catalog:prepareUpload')
      },
      download: async (nodeId: number) => {
        return ws.downloadFile(nodeId)
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
      syncInit: async (mirror: CatalogMirror) => {
        if (ws.kind === 'tauri') {
          // Sharded sync (ADR-004 v2): list shards + load each shard root.
          const siT0 = performance.now()
          const listResp = await ws.sendCatalog('catalog:shard:list', {})
          const list = unwrap<{root_version: number; shards: Array<{shard_id: string}>}>(
            listResp,
            'catalog:shard:list',
          )
          console.info('[debug][catalog] syncInit(tauri): shard:list returned %d shards dt_ms=%d', list.shards.length, Math.round(performance.now() - siT0))

          const now = Date.now()
          const roots: CatalogJSON[] = []
          for (const row of list.shards) {
            const shard_id = String(row.shard_id ?? '')
            if (!shard_id) continue
            try {
              const shardT0 = performance.now()
              const loadResp = await ws.sendCatalog('catalog:shard:load', {shard_id})
              console.info('[debug][catalog] syncInit(tauri): shard:load shard=%s dt_ms=%d', shard_id, Math.round(performance.now() - shardT0))
              const loaded = unwrap<{root: unknown}>(loadResp, 'catalog:shard:load')
              const root = loaded.root
              if (root && typeof root === 'object' && 'i' in root && 't' in root && 'n' in root) {
                roots.push(root as CatalogJSON)
              }
            } catch (e) {
              console.warn(`Failed to load shard ${shard_id}:`, e instanceof Error ? e.message : String(e))
            }
          }

          const root: CatalogJSON = {
            i: 0,
            t: 0,
            n: '/',
            s: 0,
            z: 0,
            b: now,
            m: now,
            c: roots,
          }
          console.info('[debug][catalog] syncInit(tauri): applySnapshot total_shards=%d total_dt_ms=%d', roots.length, Math.round(performance.now() - siT0))
          mirror.applySnapshot({header: {root_version: list.root_version}, data: root})
          return
        }

        const snapshot = await ws.sendCatalog('catalog:syncInit', {})
        const out = unwrap<Record<string, unknown>>(snapshot, 'catalog:syncInit')

        const candidate = 'data' in out ? (out['data'] as unknown) : (out as unknown)
        const parsed =
          typeof candidate === 'string' ? (JSON.parse(candidate) as CatalogJSON) : (candidate as CatalogJSON)
        if (!parsed) throw new Error('Invalid snapshot format: missing data')
        const header = (out['header'] as unknown) ?? undefined
        mirror.applySnapshot({header, data: parsed})
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
      // Ищем meta.json только по событиям, связанным с файлами
      const node = this.mirror.getNode(event.nodeId)
      if (!node) return
      const isMetaFile = node.isFile && node.name === 'meta.json'
      if (!isMetaFile) return
      const parentPath = node.parentPath ?? '/'
      const entryNode = this.mirror.findByPath(parentPath)
      if (!entryNode || !entryNode.isDir) return

      const type = (event as CatalogEvent).type
      if (type === CatalogEventType.NODE_DELETED) {
        // Удалён meta.json — очищаем кэш
        this.entryMeta.delete(entryNode.nodeId)
        // Триггерим обновление подписчиков зеркала
        this.mirror.applyEvent({
          type: CatalogEventType.NODE_UPDATED,
          nodeId: entryNode.nodeId,
          timestamp: Date.now(),
          version: 0,
          metadata: {},
        })
        return
      }

      // Чтение meta.json и обновление кэша
      const stream = await this.api.download(event.nodeId)
      const decoder = new TextDecoder()
      let text = ''
      for await (const chunk of stream as AsyncIterable<Uint8Array>) {
        text += decoder.decode(chunk, {stream: true})
      }
      text += decoder.decode()
      try {
        const json = JSON.parse(text) as PassMeta
        this.entryMeta.set(entryNode.nodeId, json)
      } catch {
        // Некорректный JSON — очищаем кэш
        this.entryMeta.delete(entryNode.nodeId)
      }
      // Нотифицируем подписчиков зеркала об изменениях, чтобы UI перерендерился
      this.mirror.applyEvent({
        type: CatalogEventType.NODE_UPDATED,
        nodeId: entryNode.nodeId,
        timestamp: Date.now(),
        version: 0,
        metadata: {},
      })
    } catch {
      // Игнорируем ошибки мета-слежения
    }
  }

  /** Ленивая подгрузка meta.json для директории записи (если ещё не загружен) */
  async ensureEntryMeta(entryNodeId: number): Promise<void> {
    if (this.entryMeta.has(entryNodeId)) return
    try {
      const entryNode = this.mirror.getNode(entryNodeId)
      if (!entryNode || !entryNode.isDir) return
      const children = this.mirror.getChildren(entryNode.path)
      const meta = children.find((c) => c.isFile && c.name === 'meta.json')
      if (!meta) return

      const stream = await this.api.download(meta.nodeId)
      const decoder = new TextDecoder()
      let text = ''
      for await (const chunk of stream as AsyncIterable<Uint8Array>) {
        text += decoder.decode(chunk, {stream: true})
      }
      text += decoder.decode()

      try {
        const json = JSON.parse(text) as PassMeta
        this.entryMeta.set(entryNodeId, json)
        this.mirror.applyEvent({
          type: CatalogEventType.NODE_UPDATED,
          nodeId: entryNodeId,
          timestamp: Date.now(),
          version: 0,
          metadata: {},
        })
      } catch {
        // ignore invalid meta
      }
    } catch {
      // ignore errors
    }
  }
}
