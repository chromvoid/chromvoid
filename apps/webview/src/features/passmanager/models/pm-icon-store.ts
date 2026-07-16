import {action, atom, wrap} from '@reatom/core'

import {getAppContext} from 'root/shared/services/app-context'
import {deriveIconBackgroundColorFromBase64, normalizeIconFromFile} from '../service/icon-normalizer'

const HEX_PREFIX = String.fromCharCode(35)

type IconGetResult = {
  icon_ref?: unknown
  mime_type?: unknown
  background_color?: unknown
  content_base64?: unknown
}

type IconGetManyResult = {
  icons?: unknown
  missing_icon_refs?: unknown
}

type IconListRecord = {
  icon_ref?: unknown
  mime_type?: unknown
  background_color?: unknown
  width?: unknown
  height?: unknown
  bytes?: unknown
  created_at?: unknown
  updated_at?: unknown
}

type IconListResult = {
  icons?: unknown
}

export type PMStoredIcon = {
  iconRef: string
  mimeType: string
  backgroundColor?: string
  width: number
  height: number
  bytes: number
  createdAt: number
  updatedAt: number
}

export type PMIconUploadPhase = 'preparing' | 'uploading'

export type PMIconUploadOptions = {
  onPhase?: (phase: PMIconUploadPhase) => void
}

type PMIconCacheSnapshot = {
  url: string
  backgroundColor: string
}

type PreparedIconPayload = {
  iconRef: string
  url: string
  backgroundColor: string
  contentBase64: string
  mimeType: string
}

type DomainEnvelope<T> = {
  ok?: boolean
  result?: T
  error?: unknown
}

const EMPTY_ICON_CACHE_SNAPSHOT: PMIconCacheSnapshot = {url: '', backgroundColor: ''}
const ICON_MISS_CACHE_TTL_MS = 60_000
const ICON_BATCH_MAX_REFS = 64
const ICON_SINGLE_FALLBACK_CONCURRENCY = 4

function createIconCacheState(iconRef: string) {
  return atom<PMIconCacheSnapshot>(EMPTY_ICON_CACHE_SNAPSHOT, `passmanager.iconCache.${iconRef}`)
}

type IconCacheState = ReturnType<typeof createIconCacheState>

class PMIconStore {
  private readonly stateByRef = new Map<string, IconCacheState>()
  private readonly pendingByRef = new Map<string, Promise<string | undefined>>()
  private readonly missingByRef = new Map<string, number>()
  private readonly pendingBackgroundBackfillByRef = new Map<string, Promise<void>>()
  private readonly attemptedBackgroundBackfillByRef = new Set<string>()
  private generation = 0

  private readonly applyPreparedPayloads = action((payloads: readonly PreparedIconPayload[]) => {
    for (const payload of payloads) {
      const state = this.getOrCreateState(payload.iconRef)
      const current = state()
      if (current.url && current.url !== payload.url) {
        URL.revokeObjectURL(current.url)
      }
      state.set({url: payload.url, backgroundColor: payload.backgroundColor})
    }
  }, 'passmanager.iconCache.applyPayloads')

  private readonly applyBackgroundColor = action((iconRef: string, backgroundColor: string) => {
    const state = this.getOrCreateState(iconRef)
    const current = state()
    if (current.backgroundColor === backgroundColor) return
    state.set({...current, backgroundColor})
  }, 'passmanager.iconCache.applyBackgroundColor')

  private readonly clearStates = action((states: readonly IconCacheState[]) => {
    for (const state of states) {
      state.set(EMPTY_ICON_CACHE_SNAPSHOT)
    }
  }, 'passmanager.iconCache.clear')

  private getSnapshot(iconRef: string | undefined): PMIconCacheSnapshot {
    const normalized = this.normalizeIconRef(iconRef)
    if (!normalized) return EMPTY_ICON_CACHE_SNAPSHOT
    return this.getOrCreateState(normalized)()
  }

  getCachedUrl(iconRef: string | undefined): string | undefined {
    const normalized = this.normalizeIconRef(iconRef)
    if (!normalized) return undefined
    return this.getSnapshot(normalized).url || undefined
  }

  getCachedBackgroundColor(iconRef: string | undefined): string | undefined {
    const normalized = this.normalizeIconRef(iconRef)
    if (!normalized) return undefined
    return this.getSnapshot(normalized).backgroundColor || undefined
  }

  async loadIconUrl(iconRef: string | undefined): Promise<string | undefined> {
    const normalized = this.normalizeIconRef(iconRef)
    if (!normalized) return undefined

    const cached = this.getCachedUrl(normalized)
    if (cached) return cached
    if (this.isRecentMissing(normalized)) return undefined

    const pending = this.pendingByRef.get(normalized)
    if (pending) return pending

    const generation = this.generation
    const request = this.fetchSingleIconUrl(normalized, generation)
      .then((url) => {
        if (!url && generation === this.generation) this.rememberMissing(normalized)
        else if (url) this.missingByRef.delete(normalized)
        return url
      })
      .catch(() => {
        if (generation === this.generation) this.rememberMissing(normalized)
        return undefined
      })
      .finally(() => {
        if (this.pendingByRef.get(normalized) === request) {
          this.pendingByRef.delete(normalized)
        }
      })

    this.pendingByRef.set(normalized, request)
    return request
  }

  async preloadIconUrls(iconRefs: Iterable<string | undefined>): Promise<void> {
    const refs = this.normalizeUniqueRefs(iconRefs)
    if (refs.length === 0) return

    const pending = new Set<Promise<string | undefined>>()
    const uncached: string[] = []
    for (const iconRef of refs) {
      if (this.getCachedUrl(iconRef) || this.isRecentMissing(iconRef)) continue
      const existing = this.pendingByRef.get(iconRef)
      if (existing) pending.add(existing)
      else uncached.push(iconRef)
    }

    const batches: Promise<void>[] = []
    for (let offset = 0; offset < uncached.length; offset += ICON_BATCH_MAX_REFS) {
      batches.push(this.preloadBatch(uncached.slice(offset, offset + ICON_BATCH_MAX_REFS)))
    }

    await wrap(Promise.allSettled([...pending, ...batches]))
  }

  async uploadIcon(file: File, options?: PMIconUploadOptions): Promise<string> {
    const generation = this.generation
    options?.onPhase?.('preparing')
    const normalized = await wrap(normalizeIconFromFile(file))
    options?.onPhase?.('uploading')
    const payload: Record<string, unknown> = {
      content_base64: normalized.contentBase64,
      mime_type: normalized.mimeType,
    }
    if (normalized.backgroundColor) {
      payload['background_color'] = normalized.backgroundColor
    }
    const raw = await wrap(
      this.sendDomain<{icon_ref?: unknown; background_color?: unknown}>('passmanager:icon:put', payload),
    )
    const iconRef = typeof raw?.icon_ref === 'string' ? raw.icon_ref : ''
    if (!iconRef) throw new Error('passmanager:icon:put did not return icon_ref')

    if (generation === this.generation && !this.getCachedUrl(iconRef)) {
      const prepared = this.preparePayload(
        {
          icon_ref: iconRef,
          mime_type: normalized.mimeType,
          background_color: raw?.background_color ?? normalized.backgroundColor,
          content_base64: normalized.contentBase64,
        },
        generation,
      )
      if (prepared) {
        this.applyPreparedPayloads([prepared])
        this.scheduleBackgroundEnrichment(prepared, generation)
      }
    }
    if (generation === this.generation) {
      this.missingByRef.delete(iconRef)
    }
    return iconRef
  }

  clearMissCache(): void {
    this.missingByRef.clear()
  }

  async listIcons(): Promise<PMStoredIcon[]> {
    const raw = await wrap(this.sendDomain<IconListResult>('passmanager:icon:list', {}))
    const icons = raw?.icons
    if (!Array.isArray(icons)) return []

    return icons
      .map((item) => this.parseStoredIcon(item))
      .filter((item): item is PMStoredIcon => item !== undefined)
  }

  async setGroupIcon(path: string, iconRef: string | null): Promise<void> {
    await wrap(
      this.sendDomain('passmanager:group:setMeta', {
        path,
        icon_ref: iconRef,
      }),
    )
  }

  dispose(): void {
    this.generation += 1
    const states = Array.from(this.stateByRef.values())
    for (const state of states) {
      const url = state().url
      if (url) URL.revokeObjectURL(url)
    }
    this.clearStates(states)
    this.stateByRef.clear()
    this.pendingByRef.clear()
    this.missingByRef.clear()
    this.pendingBackgroundBackfillByRef.clear()
    this.attemptedBackgroundBackfillByRef.clear()
  }

  private async preloadBatch(iconRefs: string[]): Promise<void> {
    const generation = this.generation
    const batchWork = this.fetchIconBatch(iconRefs, generation).catch(async () => {
      if (generation !== this.generation) return
      await this.fetchSingleFallback(iconRefs, generation)
    })

    const pendingEntries = iconRefs.map((iconRef) => {
      const pending = batchWork.then(() => this.getCachedUrl(iconRef))
      this.pendingByRef.set(iconRef, pending)
      return {iconRef, pending}
    })

    try {
      await wrap(batchWork)
    } finally {
      for (const {iconRef, pending} of pendingEntries) {
        if (this.pendingByRef.get(iconRef) === pending) {
          this.pendingByRef.delete(iconRef)
        }
      }
    }
  }

  private async fetchIconBatch(iconRefs: string[], generation: number): Promise<void> {
    const raw = await wrap(
      this.sendDomain<IconGetManyResult>('passmanager:icon:getMany', {icon_refs: iconRefs}),
    )
    if (generation !== this.generation) return
    if (!Array.isArray(raw?.icons) || !Array.isArray(raw?.missing_icon_refs)) {
      throw new Error('passmanager:icon:getMany returned an invalid payload')
    }

    const prepared = raw.icons
      .map((payload) => this.preparePayload(payload as IconGetResult, generation))
      .filter((payload): payload is PreparedIconPayload => payload !== undefined)
    if (generation !== this.generation) {
      for (const payload of prepared) URL.revokeObjectURL(payload.url)
      return
    }

    this.applyPreparedPayloads(prepared)
    for (const payload of prepared) {
      this.missingByRef.delete(payload.iconRef)
      this.scheduleBackgroundEnrichment(payload, generation)
    }
    for (const missing of raw.missing_icon_refs) {
      const iconRef = this.normalizeIconRef(missing)
      if (iconRef) this.rememberMissing(iconRef)
    }
  }

  private async fetchSingleFallback(iconRefs: string[], generation: number): Promise<void> {
    let nextIndex = 0
    const workerCount = Math.min(ICON_SINGLE_FALLBACK_CONCURRENCY, iconRefs.length)
    const workers = Array.from({length: workerCount}, async () => {
      while (generation === this.generation) {
        const iconRef = iconRefs[nextIndex++]
        if (!iconRef) return
        try {
          const url = await wrap(this.fetchSingleIconUrl(iconRef, generation))
          if (url) this.missingByRef.delete(iconRef)
          else if (generation === this.generation) this.rememberMissing(iconRef)
        } catch {
          if (generation === this.generation) this.rememberMissing(iconRef)
        }
      }
    })
    await wrap(Promise.all(workers))
  }

  private async fetchSingleIconUrl(iconRef: string, generation: number): Promise<string | undefined> {
    const raw = await wrap(
      this.sendDomain<IconGetResult>('passmanager:icon:get', {
        icon_ref: iconRef,
      }),
    )
    const prepared = this.preparePayload(raw, generation)
    if (!prepared) return undefined

    this.applyPreparedPayloads([prepared])
    this.scheduleBackgroundEnrichment(prepared, generation)
    return prepared.url
  }

  private preparePayload(raw: IconGetResult, generation: number): PreparedIconPayload | undefined {
    if (generation !== this.generation) return undefined
    const iconRef = this.normalizeIconRef(raw?.icon_ref)
    const contentBase64 = typeof raw?.content_base64 === 'string' ? raw.content_base64 : ''
    const mimeType = typeof raw?.mime_type === 'string' ? raw.mime_type : 'image/png'
    if (!iconRef || !contentBase64) return undefined

    const bytes = this.base64ToBytes(contentBase64)
    const blob = new Blob([this.toArrayBuffer(bytes)], {type: mimeType})
    const url = URL.createObjectURL(blob)
    const backgroundColor =
      this.parseBackgroundColor(raw?.background_color) ?? this.getCachedBackgroundColor(iconRef) ?? ''
    return {iconRef, url, backgroundColor, contentBase64, mimeType}
  }

  private scheduleBackgroundEnrichment(payload: PreparedIconPayload, generation: number): void {
    if (payload.backgroundColor) return
    void this.enrichBackgroundColor(payload, generation)
  }

  private async enrichBackgroundColor(payload: PreparedIconPayload, generation: number): Promise<void> {
    try {
      const backgroundColor = await wrap(
        deriveIconBackgroundColorFromBase64(payload.contentBase64, payload.mimeType),
      )
      if (!backgroundColor || generation !== this.generation) return
      this.applyBackgroundColor(payload.iconRef, backgroundColor)
      this.backfillBackgroundColor(payload.iconRef, backgroundColor, generation)
    } catch {}
  }

  private parseStoredIcon(raw: unknown): PMStoredIcon | undefined {
    const icon = raw as IconListRecord
    const iconRef = this.normalizeIconRef(icon?.icon_ref)
    if (!iconRef) return undefined

    const mimeType =
      typeof icon?.mime_type === 'string' && icon.mime_type.trim().length > 0 ? icon.mime_type : 'image/png'
    const backgroundColor = this.cacheBackgroundColor(iconRef, icon?.background_color)

    return {
      iconRef,
      mimeType,
      ...(backgroundColor ? {backgroundColor} : {}),
      width: this.toNonNegativeInteger(icon?.width),
      height: this.toNonNegativeInteger(icon?.height),
      bytes: this.toNonNegativeInteger(icon?.bytes),
      createdAt: this.toNonNegativeInteger(icon?.created_at),
      updatedAt: this.toNonNegativeInteger(icon?.updated_at),
    }
  }

  private cacheBackgroundColor(iconRef: string, value: unknown): string | undefined {
    const backgroundColor = this.parseBackgroundColor(value)
    if (!backgroundColor) return undefined
    this.applyBackgroundColor(iconRef, backgroundColor)
    return backgroundColor
  }

  private parseBackgroundColor(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined
    const color = value.trim().toLowerCase()
    if (color.length !== 7 || color.charAt(0) !== HEX_PREFIX) return undefined
    for (let index = 1; index < color.length; index += 1) {
      if (!this.isHexDigit(color.charCodeAt(index))) return undefined
    }
    return color
  }

  private isHexDigit(code: number): boolean {
    return (code >= 48 && code <= 57) || (code >= 97 && code <= 102)
  }

  private backfillBackgroundColor(iconRef: string, backgroundColor: string, generation: number): void {
    if (
      this.attemptedBackgroundBackfillByRef.has(iconRef) ||
      this.pendingBackgroundBackfillByRef.has(iconRef)
    ) {
      return
    }

    this.attemptedBackgroundBackfillByRef.add(iconRef)
    const request = this.sendDomain('passmanager:icon:setMeta', {
      icon_ref: iconRef,
      background_color: backgroundColor,
    })
      .catch(() => undefined)
      .then(() => undefined)
      .finally(() => {
        if (generation === this.generation) {
          this.pendingBackgroundBackfillByRef.delete(iconRef)
        }
      })
    this.pendingBackgroundBackfillByRef.set(iconRef, request)
  }

  private getOrCreateState(iconRef: string): IconCacheState {
    let state = this.stateByRef.get(iconRef)
    if (!state) {
      state = createIconCacheState(iconRef)
      this.stateByRef.set(iconRef, state)
    }
    return state
  }

  private normalizeUniqueRefs(iconRefs: Iterable<string | undefined>): string[] {
    const refs: string[] = []
    const seen = new Set<string>()
    for (const value of iconRefs) {
      const iconRef = this.normalizeIconRef(value)
      if (iconRef && !seen.has(iconRef)) {
        seen.add(iconRef)
        refs.push(iconRef)
      }
    }
    return refs
  }

  private normalizeIconRef(value: unknown): string {
    return typeof value === 'string' ? value.trim() : ''
  }

  private isRecentMissing(iconRef: string): boolean {
    const at = this.missingByRef.get(iconRef)
    if (at === undefined) return false
    if (Date.now() - at > ICON_MISS_CACHE_TTL_MS) {
      this.missingByRef.delete(iconRef)
      return false
    }
    return true
  }

  private rememberMissing(iconRef: string): void {
    this.missingByRef.set(iconRef, Date.now())
  }

  private toNonNegativeInteger(value: unknown): number {
    const numeric = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(numeric) || numeric < 0) return 0
    return Math.trunc(numeric)
  }

  private async sendDomain<T = unknown>(command: string, data: Record<string, unknown>): Promise<T> {
    const transport = getAppContext().ws
    if (
      !transport ||
      (typeof transport.sendPassmanager !== 'function' && typeof transport.sendCatalog !== 'function')
    ) {
      throw new Error('passmanager transport not available')
    }

    const raw = (await (transport.sendPassmanager
      ? transport.sendPassmanager(command, data)
      : transport.sendCatalog(command, data))) as DomainEnvelope<T> | T
    if (raw && typeof raw === 'object' && 'ok' in (raw as Record<string, unknown>)) {
      const envelope = raw as DomainEnvelope<T>
      if (envelope.ok === false) {
        const message =
          envelope.error instanceof Error ? envelope.error.message : String(envelope.error ?? command)
        throw new Error(message)
      }
      return envelope.result as T
    }
    return raw as T
  }

  private base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    return bytes
  }

  private toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const start = bytes.byteOffset
    const end = bytes.byteOffset + bytes.byteLength
    return bytes.buffer.slice(start, end) as ArrayBuffer
  }
}

export const pmIconStore = new PMIconStore()
