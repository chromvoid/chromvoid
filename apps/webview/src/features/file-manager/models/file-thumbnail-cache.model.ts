import {action, atom, wrap} from '@reatom/core'

import {
  isDerivativeUnavailableError,
  loadFileSourceById,
  type FileBlobLoadOptions,
  type FileSourceLoadResult,
} from 'root/features/media/components/file-loader'
import type {FileItemData} from 'root/shared/contracts/file-manager'
import {isAudioFile, resolveFileFormat} from 'root/utils/file-format-registry'

export type FileThumbnailStatus = 'idle' | 'loaded' | 'loading' | 'failed'

export type FileThumbnailSnapshot = {
  key: string
  url: string | null
  size: number | null
  mimeType: string | null
  status: FileThumbnailStatus
}

export type FileThumbnailLoadOptions = {
  displayJobIntentId?: string
  preparedSourcePolicy?: FileBlobLoadOptions['preparedSourcePolicy']
}

export type FileThumbnailLease = {
  key: string
  entryId: number
}

type FileThumbnailCacheEntry = {
  key: string
  entryId: number
  item: FileItemData
  state: ReturnType<typeof createThumbnailState>
  source: FileSourceLoadResult | null
  promise: Promise<FileThumbnailSnapshot> | null
  controller: AbortController | null
  consumerCount: number
  lastUsedAt: number
  lastReleasedAt: number
}

const MAX_FILE_THUMBNAIL_CACHE_ENTRIES = 128
const MAX_FILE_THUMBNAIL_PENDING_ENTRIES = 32
const MAX_FILE_THUMBNAIL_PRELOAD_ITEMS = 24
const FILE_THUMBNAIL_IDLE_TTL_MS = 5 * 60 * 1000
const EMPTY_FILE_THUMBNAIL_SNAPSHOT: FileThumbnailSnapshot = {
  key: '',
  url: null,
  size: null,
  mimeType: null,
  status: 'idle',
}

function createThumbnailState(key: string) {
  return atom<FileThumbnailSnapshot>(
    {...EMPTY_FILE_THUMBNAIL_SNAPSHOT, key},
    `file.thumbnailCache.${key}`,
  )
}

export function getFileThumbnailKey(
  item: Pick<FileItemData, 'id' | 'name' | 'lastModified'>,
): string {
  return `${item.id}:${item.name}:${item.lastModified ?? 0}`
}

export function isFileThumbnailCandidate(item: FileItemData): boolean {
  if (item.isDir) return false
  return (
    resolveFileFormat(item).openBehavior.kind === 'gallery' ||
    isAudioFile(item.name, item.mimeType)
  )
}

class FileThumbnailStore {
  private readonly entries = new Map<string, FileThumbnailCacheEntry>()
  private generation = 0
  private nextEntryId = 0

  private readonly setState = action(
    (entry: FileThumbnailCacheEntry, snapshot: FileThumbnailSnapshot) => {
      entry.state.set(snapshot)
    },
    'file.thumbnailCache.setState',
  )

  read(key: string): FileThumbnailSnapshot {
    return this.entries.get(key)?.state() ?? EMPTY_FILE_THUMBNAIL_SNAPSHOT
  }

  retain(item: FileItemData): FileThumbnailLease {
    const entry = this.getOrCreateEntry(item)
    entry.consumerCount += 1
    entry.lastUsedAt = Date.now()
    return {key: entry.key, entryId: entry.entryId}
  }

  release(lease: FileThumbnailLease): void {
    const entry = this.entries.get(lease.key)
    if (!entry || entry.entryId !== lease.entryId) return

    entry.consumerCount = Math.max(0, entry.consumerCount - 1)
    entry.lastUsedAt = Date.now()
    if (entry.consumerCount === 0) {
      entry.lastReleasedAt = entry.lastUsedAt
    }
    this.pruneIdleEntries()
    this.enforceCacheLimit()
    this.enforcePendingLimit()
  }

  ensure(
    item: FileItemData,
    options: FileThumbnailLoadOptions = {},
  ): Promise<FileThumbnailSnapshot> {
    this.pruneIdleEntries()
    const entry = this.getOrCreateEntry(item)
    entry.lastUsedAt = Date.now()
    const current = entry.state()

    if (current.status === 'loaded' || current.status === 'failed') {
      return Promise.resolve(current)
    }
    if (entry.promise) return entry.promise

    const controller = new AbortController()
    const generation = this.generation
    entry.controller = controller
    this.setState(entry, {...EMPTY_FILE_THUMBNAIL_SNAPSHOT, key: entry.key, status: 'loading'})

    const request = this.load(entry, options, controller, generation)
    entry.promise = request
    this.enforcePendingLimit()
    return request
  }

  async preload(items: Iterable<FileItemData>): Promise<void> {
    const unique = new Map<string, FileItemData>()
    for (const item of items) {
      if (!isFileThumbnailCandidate(item)) continue
      const key = getFileThumbnailKey(item)
      if (!unique.has(key)) unique.set(key, item)
      if (unique.size >= MAX_FILE_THUMBNAIL_PRELOAD_ITEMS) break
    }
    if (unique.size === 0) return

    await wrap(Promise.allSettled([...unique.values()].map((item) => this.ensure(item))))
  }

  invalidate(item: FileItemData, sourceUrl?: string | null): boolean {
    const entry = this.entries.get(getFileThumbnailKey(item))
    if (!entry) return false
    if (sourceUrl && entry.state().url !== sourceUrl) return false

    this.resetEntry(entry)
    return true
  }

  invalidateByFileId(fileId: number): void {
    for (const entry of [...this.entries.values()]) {
      if (entry.item.id !== fileId) continue
      this.resetEntry(entry)
      if (entry.consumerCount > 0) void this.ensure(entry.item)
    }
  }

  suspend(): void {
    this.resetEntries(false)
  }

  resume(): void {
    for (const entry of this.entries.values()) {
      if (entry.consumerCount > 0) void this.ensure(entry.item)
    }
  }

  dispose(): void {
    this.resetEntries(true)
  }

  private async load(
    entry: FileThumbnailCacheEntry,
    options: FileThumbnailLoadOptions,
    controller: AbortController,
    generation: number,
  ): Promise<FileThumbnailSnapshot> {
    let source: FileSourceLoadResult | null = null
    try {
      source = await wrap(
        loadFileSourceById(entry.item.id, entry.item.name, {
          signal: controller.signal,
          mimeType: entry.item.mimeType,
          lastModified: entry.item.lastModified,
          variant: 'thumbnail-image',
          derivativeFallback: 'none',
          preparedSourcePolicy: options.preparedSourcePolicy,
          displayJobType: 'thumbnail',
          displayJobIntentId:
            options.displayJobIntentId ?? `file-item-thumbnail:${entry.key}`,
        }),
      )
      await wrap(this.decodeSource(source.url, controller.signal))

      if (!this.isCurrent(entry, controller, generation)) {
        this.releaseSource(source)
        return EMPTY_FILE_THUMBNAIL_SNAPSHOT
      }

      entry.source = source
      const snapshot: FileThumbnailSnapshot = {
        key: entry.key,
        url: source.url,
        size: source.size,
        mimeType: source.mimeType,
        status: 'loaded',
      }
      entry.lastUsedAt = Date.now()
      entry.lastReleasedAt = entry.lastUsedAt
      this.setState(entry, snapshot)
      this.enforceCacheLimit()
      return snapshot
    } catch (error) {
      if (source) this.releaseSource(source)
      if (!this.isCurrent(entry, controller, generation)) {
        return EMPTY_FILE_THUMBNAIL_SNAPSHOT
      }

      entry.lastUsedAt = Date.now()
      entry.lastReleasedAt = entry.lastUsedAt
      const snapshot: FileThumbnailSnapshot = {
        ...EMPTY_FILE_THUMBNAIL_SNAPSHOT,
        key: entry.key,
        status: 'failed',
      }
      this.setState(entry, snapshot)
      if (!this.isAbortError(error) && !isDerivativeUnavailableError(error)) {
        console.warn('Failed to load file item thumbnail', error)
      }
      return snapshot
    } finally {
      if (this.entries.get(entry.key) === entry && entry.controller === controller) {
        entry.promise = null
        entry.controller = null
        this.enforceCacheLimit()
      }
    }
  }

  private getOrCreateEntry(item: FileItemData): FileThumbnailCacheEntry {
    const key = getFileThumbnailKey(item)
    const existing = this.entries.get(key)
    if (existing) {
      existing.item = item
      return existing
    }

    const now = Date.now()
    const entry: FileThumbnailCacheEntry = {
      key,
      entryId: ++this.nextEntryId,
      item,
      state: createThumbnailState(key),
      source: null,
      promise: null,
      controller: null,
      consumerCount: 0,
      lastUsedAt: now,
      lastReleasedAt: now,
    }
    this.entries.set(key, entry)
    return entry
  }

  private resetEntries(clear: boolean): void {
    this.generation += 1
    for (const entry of this.entries.values()) {
      this.resetEntry(entry)
    }
    if (clear) this.entries.clear()
  }

  private resetEntry(entry: FileThumbnailCacheEntry): void {
    entry.controller?.abort()
    if (entry.source) this.releaseSource(entry.source)
    entry.source = null
    entry.promise = null
    entry.controller = null
    this.setState(entry, {...EMPTY_FILE_THUMBNAIL_SNAPSHOT, key: entry.key})
  }

  private isCurrent(
    entry: FileThumbnailCacheEntry,
    controller: AbortController,
    generation: number,
  ): boolean {
    return (
      generation === this.generation &&
      !controller.signal.aborted &&
      this.entries.get(entry.key) === entry &&
      entry.controller === controller
    )
  }

  private async decodeSource(url: string, signal: AbortSignal): Promise<void> {
    if (typeof Image === 'undefined') return
    const image = new Image()
    image.decoding = 'async'
    image.src = url
    if (typeof image.decode !== 'function') return

    try {
      await this.awaitWithAbort(image.decode(), signal)
    } catch (error) {
      if (this.isAbortError(error)) throw error
      // The DOM image error handler owns the compatibility retry path.
    }
  }

  private awaitWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'))
    return new Promise<T>((resolve, reject) => {
      const handleAbort = () => {
        signal.removeEventListener('abort', handleAbort)
        reject(new DOMException('Aborted', 'AbortError'))
      }
      signal.addEventListener('abort', handleAbort, {once: true})
      promise.then(
        (value) => {
          signal.removeEventListener('abort', handleAbort)
          resolve(value)
        },
        (error) => {
          signal.removeEventListener('abort', handleAbort)
          reject(error)
        },
      )
    })
  }

  private pruneIdleEntries(): void {
    const now = Date.now()
    for (const entry of [...this.entries.values()]) {
      if (entry.state().status === 'loading' || entry.consumerCount > 0) continue
      if (now - entry.lastReleasedAt >= FILE_THUMBNAIL_IDLE_TTL_MS) {
        this.evictEntry(entry)
      }
    }
  }

  private enforceCacheLimit(): void {
    if (this.entries.size <= MAX_FILE_THUMBNAIL_CACHE_ENTRIES) return
    const evictable = [...this.entries.values()]
      .filter((entry) => entry.state().status !== 'loading' && entry.consumerCount === 0)
      .sort((left, right) => left.lastUsedAt - right.lastUsedAt)

    for (const entry of evictable) {
      if (this.entries.size <= MAX_FILE_THUMBNAIL_CACHE_ENTRIES) return
      this.evictEntry(entry)
    }
  }

  private enforcePendingLimit(): void {
    const pending = [...this.entries.values()]
      .filter((entry) => entry.state().status === 'loading')
      .sort((left, right) => left.lastUsedAt - right.lastUsedAt)
    let excess = pending.length - MAX_FILE_THUMBNAIL_PENDING_ENTRIES
    for (const entry of pending) {
      if (excess <= 0) return
      if (entry.consumerCount > 0) continue
      this.evictEntry(entry)
      excess -= 1
    }
  }

  private evictEntry(entry: FileThumbnailCacheEntry): void {
    if (entry.consumerCount > 0) return
    entry.controller?.abort()
    this.entries.delete(entry.key)
    if (entry.source) this.releaseSource(entry.source)
    this.setState(entry, {...EMPTY_FILE_THUMBNAIL_SNAPSHOT, key: entry.key})
  }

  private releaseSource(source: FileSourceLoadResult): void {
    try {
      void Promise.resolve(source.release()).catch((error) => {
        console.warn('Failed to release cached file item thumbnail source', error)
      })
    } catch (error) {
      console.warn('Failed to release cached file item thumbnail source', error)
    }
  }

  private isAbortError(error: unknown): error is DOMException {
    return error instanceof DOMException && error.name === 'AbortError'
  }
}

export const fileThumbnailStore = new FileThumbnailStore()

export function suspendFileThumbnailCache(): void {
  fileThumbnailStore.suspend()
}

export function resumeFileThumbnailCache(): void {
  fileThumbnailStore.resume()
}

export function disposeFileThumbnailCache(): void {
  fileThumbnailStore.dispose()
}

export function invalidateFileThumbnailById(fileId: number): void {
  fileThumbnailStore.invalidateByFileId(fileId)
}

export function resetFileThumbnailCacheForTests(): void {
  fileThumbnailStore.dispose()
}
