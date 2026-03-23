import {normalizeIconFromFile} from '../service/icon-normalizer'

type IconGetResult = {
  icon_ref?: unknown
  mime_type?: unknown
  content_base64?: unknown
}

type IconListRecord = {
  icon_ref?: unknown
  mime_type?: unknown
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
  width: number
  height: number
  bytes: number
  createdAt: number
  updatedAt: number
}

type DomainEnvelope<T> = {
  ok?: boolean
  result?: T
  error?: unknown
}

const ICON_MISS_CACHE_TTL_MS = 60_000

class PMIconStore {
  private readonly urlByRef = new Map<string, string>()
  private readonly pendingByRef = new Map<string, Promise<string | undefined>>()
  private readonly missingByRef = new Map<string, number>()
  private readonly listeners = new Set<() => void>()

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getCachedUrl(iconRef: string | undefined): string | undefined {
    if (!iconRef) return undefined
    return this.urlByRef.get(iconRef)
  }

  async loadIconUrl(iconRef: string | undefined): Promise<string | undefined> {
    if (!iconRef) return undefined
    const cached = this.urlByRef.get(iconRef)
    if (cached) return cached

    if (this.isRecentMissing(iconRef)) {
      return undefined
    }

    const pending = this.pendingByRef.get(iconRef)
    if (pending) return pending

    const request = this.fetchIconUrl(iconRef)
      .then((url) => {
        if (!url) {
          this.rememberMissing(iconRef)
          return undefined
        }
        this.missingByRef.delete(iconRef)
        return url
      })
      .catch(() => {
        this.rememberMissing(iconRef)
        return undefined
      })
      .finally(() => {
        this.pendingByRef.delete(iconRef)
      })

    this.pendingByRef.set(iconRef, request)
    return request
  }

  async uploadIcon(file: File): Promise<string> {
    const normalized = await normalizeIconFromFile(file)
    const raw = await this.sendDomain<{icon_ref?: unknown}>('passmanager:icon:put', {
      content_base64: normalized.contentBase64,
      mime_type: normalized.mimeType,
    })
    const iconRef = typeof raw?.icon_ref === 'string' ? raw.icon_ref : ''
    if (!iconRef) throw new Error('passmanager:icon:put did not return icon_ref')
    this.missingByRef.delete(iconRef)
    return iconRef
  }

  clearMissCache(): void {
    this.missingByRef.clear()
  }

  async listIcons(): Promise<PMStoredIcon[]> {
    const raw = await this.sendDomain<IconListResult>('passmanager:icon:list', {})
    const icons = raw?.icons
    if (!Array.isArray(icons)) return []

    return icons
      .map((item) => this.parseStoredIcon(item))
      .filter((item): item is PMStoredIcon => item !== undefined)
  }

  async setGroupIcon(path: string, iconRef: string | null): Promise<void> {
    await this.sendDomain('passmanager:group:setMeta', {
      path,
      icon_ref: iconRef,
    })
  }

  dispose(): void {
    for (const url of this.urlByRef.values()) {
      URL.revokeObjectURL(url)
    }
    this.urlByRef.clear()
    this.pendingByRef.clear()
    this.missingByRef.clear()
    this.listeners.clear()
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch {}
    }
  }

  private async fetchIconUrl(iconRef: string): Promise<string | undefined> {
    const raw = await this.sendDomain<IconGetResult>('passmanager:icon:get', {
      icon_ref: iconRef,
    })
    const contentBase64 = typeof raw?.content_base64 === 'string' ? raw.content_base64 : ''
    const mimeType = typeof raw?.mime_type === 'string' ? raw.mime_type : 'image/png'
    if (!contentBase64) return undefined

    const bytes = this.base64ToBytes(contentBase64)
    const blob = new Blob([this.toArrayBuffer(bytes)], {type: mimeType})
    const url = URL.createObjectURL(blob)
    this.urlByRef.set(iconRef, url)
    this.notify()
    return url
  }

  private parseStoredIcon(raw: unknown): PMStoredIcon | undefined {
    const icon = raw as IconListRecord
    const iconRef = typeof icon?.icon_ref === 'string' ? icon.icon_ref.trim() : ''
    if (!iconRef) return undefined

    const mimeType =
      typeof icon?.mime_type === 'string' && icon.mime_type.trim().length > 0 ? icon.mime_type : 'image/png'

    return {
      iconRef,
      mimeType,
      width: this.toNonNegativeInteger(icon?.width),
      height: this.toNonNegativeInteger(icon?.height),
      bytes: this.toNonNegativeInteger(icon?.bytes),
      createdAt: this.toNonNegativeInteger(icon?.created_at),
      updatedAt: this.toNonNegativeInteger(icon?.updated_at),
    }
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
    const transport = window.catalog?.transport
    if (!transport || typeof transport.sendCatalog !== 'function') {
      throw new Error('passmanager transport not available')
    }

    const raw = (await transport.sendCatalog(command, data)) as DomainEnvelope<T> | T
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
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  }

  private toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const start = bytes.byteOffset
    const end = bytes.byteOffset + bytes.byteLength
    const sliced = bytes.buffer.slice(start, end)
    return sliced as ArrayBuffer
  }
}

export const pmIconStore = new PMIconStore()
