/**
 * CatalogFacade — единая точка входа для работы с каталогом
 *
 * Объединяет:
 * - CatalogMirror (клиентское зеркало)
 * - CatalogClient (RPC-клиент)
 * - Подписку на события
 * - Кэш метаданных
 *
 * Преимущества:
 * - Единый API без прямого доступа к внутренним сервисам
 * - Легко тестировать через mock-транспорт
 * - Инверсия зависимостей через конструктор
 */
import {state} from '@statx/core'

import type {CatalogEvent, CatalogJSON, PassMeta, SerializationResult} from './local-catalog/types'
import {CatalogEventType} from './local-catalog/types'
import type {CatalogMirror} from './local-catalog/catalog-mirror'
import type {RpcResult} from '@chromvoid/scheme'
import {extractGroupPathFromEntryPath} from '../pass-paths'
import type {EntryIndexRecord, EntryLocation} from '../state/passmanager-types'

/**
 * Интерфейс транспорта для каталога
 */
export interface CatalogTransport {
  // Запросы
  list(path: string, includeHidden?: boolean): Promise<RpcResult<unknown>>
  createDir(name: string, parentPath?: string): Promise<RpcResult<{nodeId: number}>>
  prepareUpload(
    parentPath: string | undefined,
    name: string,
    size: number,
    chunkSize?: number,
    mimeType?: string,
  ): Promise<RpcResult<{nodeId: number}>>
  upload(
    nodeId: number,
    file: File,
    options?: {
      chunkSize?: number
      name?: string
      type?: string
      onProgress?: (chunk: number, total: number, percent: number) => void
    },
  ): Promise<void>
  download(nodeId: number): Promise<AsyncIterable<Uint8Array>>
  move(nodeId: number, newParentPath: string, newName?: string): Promise<void>
  rename(nodeId: number, newName: string): Promise<void>
  delete(nodeId: number): Promise<void>
  syncInit(): Promise<SerializationResult>
  subscribe(): Promise<() => Promise<void>>
  syncDelta?(fromVersion: number): Promise<RpcResult<{events: CatalogEvent[]; requiresFullSync: boolean}>>

  // Секреты
  readSecret(nodeId: number): Promise<AsyncIterable<Uint8Array>>
  writeSecret(nodeId: number, data: ArrayBuffer): Promise<void>
  eraseSecret(nodeId: number): Promise<void>

  // OTP
  generateOTP(params: {
    otpId?: string
    entryId?: string
    ts?: number
    digits?: number
    period?: number
    ha?: string
  }): Promise<string>
  setOTPSecret(params: {
    otpId: string
    entryId?: string
    secret: string
    encoding?: 'base32' | 'base64' | 'hex'
    algorithm?: string
    digits?: number
    period?: number
  }): Promise<void>
  removeOTPSecret(params: {otpId: string; entryId?: string}): Promise<void>

  // События
  onCatalogEvent(handler: (event: CatalogEvent) => void): () => void

  // Статус
  isConnected(): boolean
}

/**
 * Уведомления фасада
 */
export interface CatalogFacadeNotifications {
  success(message: string): void
  warning(message: string): void
  error(message: string): void
}

/**
 * Опции ретрая
 */
export type RetryOptions = {
  attempts: number
  baseDelayMs: number
  maxDelayMs: number
  jitterMs: number
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  attempts: 5,
  baseDelayMs: 300,
  maxDelayMs: 5_000,
  jitterMs: 200,
}

/**
 * CatalogFacade — единая точка входа для каталога
 */
export class CatalogFacade {
  private readonly transport: CatalogTransport
  private readonly notifications: CatalogFacadeNotifications
  private readonly retryOptions: RetryOptions
  private readonly _mirror: CatalogMirror
  private unsubscribe?: () => Promise<void>
  private refreshTimer: number | undefined
  private eventUnsubscribe?: () => void

  // Состояние
  readonly syncing = state(false)
  readonly lastError = state<string | null>(null)

  // Кэш метаданных
  private readonly entryMeta = new Map<number, PassMeta>()
  private readonly entryIndex = new Map<string, EntryIndexRecord>()

  constructor(
    mirror: CatalogMirror,
    transport: CatalogTransport,
    notifications: CatalogFacadeNotifications,
    retryOptions?: Partial<RetryOptions>,
  ) {
    this._mirror = mirror
    this.transport = transport
    this.notifications = notifications
    this.retryOptions = {...DEFAULT_RETRY_OPTIONS, ...retryOptions}

    // Подписываемся на события каталога
    this.eventUnsubscribe = this.transport.onCatalogEvent((event) => {
      this._mirror.applyEvent(event)
      void this.handleMetaEvent(event)
    })
  }

  // ===== Публичный API =====

  get mirror(): CatalogMirror {
    return this._mirror
  }

  /**
   * Секреты API
   */
  get secrets() {
    return {
      read: (nodeId: number) => this.transport.readSecret(nodeId),
      write: (nodeId: number, data: ArrayBuffer) => this.transport.writeSecret(nodeId, data),
      erase: (nodeId: number) => this.transport.eraseSecret(nodeId),
      generateOTP: (params: {
        otpId?: string
        entryId?: string
        ts?: number
        digits?: number
        period?: number
        ha?: string
      }) => this.transport.generateOTP(params),
      setOTP: (params: {
        otpId: string
        entryId?: string
        secret: string
        encoding?: 'base32' | 'base64' | 'hex'
        algorithm?: string
        digits?: number
        period?: number
      }) => this.transport.setOTPSecret(params),
      removeOTP: (params: {otpId: string; entryId?: string}) => this.transport.removeOTPSecret(params),
    }
  }

  /**
   * Найти запись по бизнес-id
   */
  getEntryById(id: string): EntryLocation | undefined {
    const rec = this.entryIndex.get(id)
    if (!rec) return undefined
    return {nodeId: rec.entryNodeId, groupPath: rec.groupPath}
  }

  /**
   * Найти метку OTP по id
   */
  getOTPLabelById(otpId: string): string | undefined {
    for (const [, rec] of this.entryIndex) {
      const label = rec.labelMap.get(otpId)
      if (label) return label
    }
    return undefined
  }

  /**
   * Найти запись по id OTP
   */
  findEntryNodeByOTPId(otpId: string): {nodeId: number; label: string} | undefined {
    for (const [, rec] of this.entryIndex) {
      const label = rec.labelMap.get(otpId)
      if (label) return {nodeId: rec.entryNodeId, label}
    }
    return undefined
  }

  /**
   * Получить кэшированные метаданные записи
   */
  getEntryMeta(entryNodeId: number): PassMeta | undefined {
    return this.entryMeta.get(entryNodeId)
  }

  /**
   * Запустить синхронизацию
   */
  async startSync(): Promise<void> {
    this.syncing.set(true)
    this.lastError.set(null)

    const {attempts, baseDelayMs, maxDelayMs, jitterMs} = this.retryOptions
    let lastError: unknown

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const snapshot = await this.transport.syncInit()
        this.applySnapshot(snapshot)

        this.unsubscribe = await this.transport.subscribe()

        this.notifications.success('Каталог успешно синхронизирован')
        this.syncing.set(false)
        this.lastError.set(null)
        return
      } catch (e) {
        lastError = e
        this.lastError.set(e instanceof Error ? e.message : String(e))

        if (!this.transport.isConnected()) {
          break
        }

        if (attempt < attempts) {
          const exp = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt - 1))
          const jitter = Math.floor(Math.random() * jitterMs)
          const delayMs = Math.min(maxDelayMs, exp + jitter)

          this.notifications.warning(
            `Сбой синхронизации каталога. Повтор через ${(delayMs / 1000).toFixed(1)}с (попытка ${
              attempt + 1
            }/${attempts})`,
          )

          await new Promise((r) => setTimeout(r, delayMs))
          continue
        }
      }
    }

    this.notifications.error('Не удалось синхронизировать каталог')
    this.syncing.set(false)
    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  }

  /**
   * Остановить синхронизацию
   */
  async stopSync(): Promise<void> {
    if (this.unsubscribe) {
      await this.unsubscribe()
      this.unsubscribe = undefined
    }
  }

  /**
   * Принудительное обновление
   */
  async refresh(): Promise<void> {
    try {
      const snapshot = await this.transport.syncInit()
      this.applySnapshot(snapshot)
      this.notifications.success('Каталог обновлен')
    } catch (e) {
      this.lastError.set(e instanceof Error ? e.message : String(e))
      this.notifications.error('Не удалось обновить каталог')
      throw e
    }
  }

  /**
   * Запланировать обновление с дебаунсом
   */
  queueRefresh(delayMs = 150): void {
    if (this.refreshTimer !== undefined) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = undefined
    }

    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = undefined
      void this.refreshSilent()
    }, delayMs)
  }

  /**
   * Ленивая подгрузка метаданных записи
   */
  async ensureEntryMeta(entryNodeId: number): Promise<void> {
    if (this.entryMeta.has(entryNodeId)) return

    try {
      const entryNode = this._mirror.getNode(entryNodeId)
      if (!entryNode || !entryNode.isDir) return

      const children = this._mirror.getChildren(entryNode.path)
      const meta = children.find((c) => c.isFile && c.name === 'meta.json')
      if (!meta) return

      const stream = await this.transport.download(meta.nodeId)
      const text = await this.streamToText(stream)

      try {
        const json = JSON.parse(text) as PassMeta
        this.entryMeta.set(entryNodeId, json)
        this.updateEntryIndex(entryNodeId, entryNode.path, json)
        this.emitNodeUpdated(entryNodeId)
      } catch {
        // Ignore invalid meta
      }
    } catch {
      // No-op
    }
  }

  /**
   * Очистка ресурсов
   */
  dispose(): void {
    this.eventUnsubscribe?.()
    this.eventUnsubscribe = undefined

    if (this.refreshTimer !== undefined) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = undefined
    }
  }

  // ===== Приватные методы =====

  private applySnapshot(snapshot: SerializationResult): void {
    const container = snapshot as unknown as Record<string, unknown>
    const candidate = 'data' in container ? container['data'] : snapshot
    let parsed: unknown

    if (candidate !== undefined) {
      parsed = typeof candidate === 'string' ? JSON.parse(candidate) : candidate
    }

    if (parsed === undefined || parsed === null) {
      throw new Error('Invalid snapshot format: missing data')
    }

    const header = container['header'] ?? undefined
    this._mirror.applySnapshot({header, data: parsed as CatalogJSON})
  }

  private async refreshSilent(): Promise<void> {
    try {
      const snapshot = await this.transport.syncInit()
      this.applySnapshot(snapshot)
    } catch (e) {
      this.lastError.set(e instanceof Error ? e.message : String(e))
    }
  }

  private async handleMetaEvent(event: CatalogEvent): Promise<void> {
    try {
      const node = this._mirror.getNode(event.nodeId)
      if (!node) return

      const isMetaFile = node.isFile && node.name === 'meta.json'
      if (!isMetaFile) return

      const parentPath = node.parentPath ?? '/'
      const entryNode = this._mirror.findByPath(parentPath)
      if (!entryNode || !entryNode.isDir) return

      if (event.type === CatalogEventType.NODE_DELETED) {
        this.entryMeta.delete(entryNode.nodeId)
        this.removeFromIndexByNodeId(entryNode.nodeId)
        this.emitNodeUpdated(entryNode.nodeId)
        return
      }

      const stream = await this.transport.download(event.nodeId)
      const text = await this.streamToText(stream)

      try {
        const json = JSON.parse(text) as PassMeta
        this.entryMeta.set(entryNode.nodeId, json)
        this.updateEntryIndex(entryNode.nodeId, entryNode.path, json)
      } catch {
        this.entryMeta.delete(entryNode.nodeId)
        this.removeFromIndexByNodeId(entryNode.nodeId)
      }

      this.emitNodeUpdated(entryNode.nodeId)
    } catch {
      // Ignore errors
    }
  }

  private async streamToText(stream: AsyncIterable<Uint8Array>): Promise<string> {
    const decoder = new TextDecoder()
    let text = ''
    for await (const chunk of stream) {
      text += decoder.decode(chunk, {stream: true})
    }
    text += decoder.decode()
    return text
  }

  private updateEntryIndex(
    entryNodeId: number,
    entryPath: string | undefined,
    meta: PassMeta | undefined,
  ): void {
    for (const [key, rec] of this.entryIndex) {
      if (rec.entryNodeId === entryNodeId) this.entryIndex.delete(key)
    }

    if (!meta?.id) return

    const groupPath = this.extractGroupPath(entryPath)
    const labels = new Map<string, string>()

    for (const o of meta.otps ?? []) {
      if (o?.id) labels.set(String(o.id), String(o.label || o.id))
    }

    this.entryIndex.set(String(meta.id), {entryNodeId, groupPath, labelMap: labels})
  }

  private removeFromIndexByNodeId(entryNodeId: number): void {
    for (const [key, rec] of this.entryIndex) {
      if (rec.entryNodeId === entryNodeId) this.entryIndex.delete(key)
    }
  }

  private extractGroupPath(path: string | undefined): string | undefined {
    return extractGroupPathFromEntryPath(path ?? '')
  }

  private emitNodeUpdated(nodeId: number): void {
    this._mirror.applyEvent({
      type: CatalogEventType.NODE_UPDATED,
      nodeId,
      timestamp: Date.now(),
      version: 0,
      metadata: {},
    })
  }
}
