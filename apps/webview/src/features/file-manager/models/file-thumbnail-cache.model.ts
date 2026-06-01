import {
  loadFileSourceById,
  type FileBlobLoadOptions,
  type FileSourceLoadResult,
} from 'root/features/media/components/file-loader'
import type {FileItemData} from 'root/shared/contracts/file-manager'

export type FileThumbnailStatus = 'loaded' | 'loading' | 'failed'

export type FileThumbnailSnapshot = {
  key: string
  url: string | null
  size: number | null
  mimeType: string | null
  status: FileThumbnailStatus
}

export type FileThumbnailHandle = {
  key: string
  entryId: number
  url: string
  size: number
  mimeType: string
  status: 'loaded'
  handleId: number
}

export type FileThumbnailAcquireOptions = {
  signal?: AbortSignal
  displayJobIntentId?: string
  preparedSourcePolicy?: FileBlobLoadOptions['preparedSourcePolicy']
}

type FileThumbnailCacheEntry = {
  key: string
  entryId: number
  item: FileItemData
  status: FileThumbnailStatus
  source: FileSourceLoadResult | null
  promise: Promise<FileSourceLoadResult> | null
  controller: AbortController | null
  error: unknown
  waiterCount: number
  consumerCount: number
  lastUsedAt: number
  lastReleasedAt: number
}

const MAX_FILE_THUMBNAIL_CACHE_ENTRIES = 128
const FILE_THUMBNAIL_IDLE_TTL_MS = 5 * 60 * 1000
const thumbnailCache = new Map<string, FileThumbnailCacheEntry>()
const releasedHandles = new WeakSet<FileThumbnailHandle>()
let nextEntryId = 0
let nextHandleId = 0

export function getFileThumbnailKey(item: Pick<FileItemData, 'id' | 'name' | 'lastModified'>): string {
  return `${item.id}:${item.name}:${item.lastModified ?? 0}`
}

export function peekFileThumbnail(item: FileItemData): FileThumbnailSnapshot | null {
  pruneIdleEntries()

  const entry = thumbnailCache.get(getFileThumbnailKey(item))
  if (!entry) {
    return null
  }

  entry.lastUsedAt = Date.now()
  return toSnapshot(entry)
}

export async function acquireFileThumbnail(
  item: FileItemData,
  options: FileThumbnailAcquireOptions = {},
): Promise<FileThumbnailHandle> {
  pruneIdleEntries()

  const key = getFileThumbnailKey(item)
  const entry = getOrCreateEntry(key, item)
  entry.lastUsedAt = Date.now()
  entry.waiterCount += 1

  try {
    if (entry.status === 'failed') {
      throw entry.error ?? new Error('File thumbnail unavailable')
    }

    if (!entry.promise && entry.status !== 'loaded') {
      startThumbnailLoad(entry, options)
    }

    const source = await waitForSource(entry, options.signal)
    throwIfAborted(options.signal)

    entry.consumerCount += 1
    entry.lastUsedAt = Date.now()
    enforceCacheLimit()

    return {
      key,
      entryId: entry.entryId,
      url: source.url,
      size: source.size,
      mimeType: source.mimeType,
      status: 'loaded',
      handleId: ++nextHandleId,
    }
  } finally {
    entry.waiterCount = Math.max(0, entry.waiterCount - 1)
    abortUnusedLoadingEntry(entry)
  }
}

export function releaseFileThumbnail(handle: FileThumbnailHandle): void {
  if (releasedHandles.has(handle)) {
    return
  }
  releasedHandles.add(handle)

  const entry = thumbnailCache.get(handle.key)
  if (!entry || entry.entryId !== handle.entryId) {
    return
  }

  entry.consumerCount = Math.max(0, entry.consumerCount - 1)
  entry.lastUsedAt = Date.now()
  if (entry.consumerCount === 0) {
    entry.lastReleasedAt = entry.lastUsedAt
  }

  pruneIdleEntries()
  enforceCacheLimit()
}

export function invalidateFileThumbnail(
  item: FileItemData,
  sourceUrl?: string | null,
): boolean {
  const entry = thumbnailCache.get(getFileThumbnailKey(item))
  if (!entry) {
    return false
  }

  if (sourceUrl && entry.source?.url !== sourceUrl) {
    return false
  }

  evictEntry(entry, {force: true})
  return true
}

export function resetFileThumbnailCacheForTests(): void {
  for (const entry of thumbnailCache.values()) {
    entry.controller?.abort()
    if (entry.source) {
      releaseThumbnailSource(entry.source)
    }
  }

  thumbnailCache.clear()
  nextEntryId = 0
  nextHandleId = 0
}

function getOrCreateEntry(key: string, item: FileItemData): FileThumbnailCacheEntry {
  const existing = thumbnailCache.get(key)
  if (existing) {
    return existing
  }

  const now = Date.now()
  const entry: FileThumbnailCacheEntry = {
    key,
    entryId: ++nextEntryId,
    item,
    status: 'loading',
    source: null,
    promise: null,
    controller: null,
    error: null,
    waiterCount: 0,
    consumerCount: 0,
    lastUsedAt: now,
    lastReleasedAt: now,
  }
  thumbnailCache.set(key, entry)
  return entry
}

function startThumbnailLoad(entry: FileThumbnailCacheEntry, options: FileThumbnailAcquireOptions = {}): void {
  if (entry.promise) {
    return
  }

  const controller = new AbortController()
  entry.controller = controller
  entry.status = 'loading'
  entry.error = null

  const promise = loadFileSourceById(entry.item.id, entry.item.name, {
    signal: controller.signal,
    mimeType: entry.item.mimeType,
    lastModified: entry.item.lastModified,
    variant: 'thumbnail-image',
    derivativeFallback: 'none',
    preparedSourcePolicy: options.preparedSourcePolicy,
    displayJobType: 'thumbnail',
    displayJobIntentId: options.displayJobIntentId ?? `file-item-thumbnail:${entry.key}`,
  })

  entry.promise = promise
    .then(
      (source) => {
        if (thumbnailCache.get(entry.key) !== entry || controller.signal.aborted) {
          releaseThumbnailSource(source)
          throw new DOMException('Aborted', 'AbortError')
        }

        entry.source = source
        entry.status = 'loaded'
        entry.error = null
        entry.lastUsedAt = Date.now()
        entry.lastReleasedAt = entry.lastUsedAt
        return source
      },
      (error) => {
        if (thumbnailCache.get(entry.key) === entry) {
          entry.status = 'failed'
          entry.error = error
          entry.lastUsedAt = Date.now()
          entry.lastReleasedAt = entry.lastUsedAt
        }
        throw error
      },
    )
    .finally(() => {
      if (thumbnailCache.get(entry.key) === entry) {
        entry.promise = null
        entry.controller = null
        enforceCacheLimit()
      }
    })
}

async function waitForSource(
  entry: FileThumbnailCacheEntry,
  signal?: AbortSignal,
): Promise<FileSourceLoadResult> {
  if (entry.status === 'loaded' && entry.source) {
    return entry.source
  }

  if (entry.status === 'failed') {
    throw entry.error ?? new Error('File thumbnail unavailable')
  }

  if (!entry.promise) {
    throw new Error('File thumbnail load is not active')
  }

  return await awaitWithAbort(entry.promise, signal)
}

function awaitWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return promise
  }

  if (signal.aborted) {
    return Promise.reject(new DOMException('Aborted', 'AbortError'))
  }

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

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }
}

function toSnapshot(entry: FileThumbnailCacheEntry): FileThumbnailSnapshot {
  if (entry.status === 'loaded' && entry.source) {
    return {
      key: entry.key,
      url: entry.source.url,
      size: entry.source.size,
      mimeType: entry.source.mimeType,
      status: 'loaded',
    }
  }

  return {
    key: entry.key,
    url: null,
    size: null,
    mimeType: null,
    status: entry.status,
  }
}

function pruneIdleEntries(): void {
  const now = Date.now()
  for (const entry of [...thumbnailCache.values()]) {
    if (entry.status === 'loading') {
      abortUnusedLoadingEntry(entry)
      continue
    }
    if (entry.consumerCount > 0) {
      continue
    }
    if (now - entry.lastReleasedAt >= FILE_THUMBNAIL_IDLE_TTL_MS) {
      evictEntry(entry)
    }
  }
}

function enforceCacheLimit(): void {
  if (thumbnailCache.size <= MAX_FILE_THUMBNAIL_CACHE_ENTRIES) {
    return
  }

  const evictableEntries = [...thumbnailCache.values()]
    .filter((entry) => entry.status !== 'loading' && entry.consumerCount === 0)
    .sort((left, right) => left.lastUsedAt - right.lastUsedAt)

  for (const entry of evictableEntries) {
    if (thumbnailCache.size <= MAX_FILE_THUMBNAIL_CACHE_ENTRIES) {
      return
    }
    evictEntry(entry)
  }
}

function evictEntry(
  entry: FileThumbnailCacheEntry,
  options: {force?: boolean} = {},
): void {
  if (!options.force && entry.consumerCount > 0) {
    return
  }

  void entry.promise?.catch(() => {})
  entry.controller?.abort()
  thumbnailCache.delete(entry.key)
  if (entry.source) {
    releaseThumbnailSource(entry.source)
  }
}

function abortUnusedLoadingEntry(entry: FileThumbnailCacheEntry): void {
  if (
    thumbnailCache.get(entry.key) !== entry ||
    entry.status !== 'loading' ||
    entry.consumerCount > 0 ||
    entry.waiterCount > 0
  ) {
    return
  }

  evictEntry(entry)
}

function releaseThumbnailSource(source: FileSourceLoadResult): void {
  try {
    void Promise.resolve(source.release()).catch((error) => {
      console.warn('Failed to release cached file item thumbnail source', error)
    })
  } catch (error) {
    console.warn('Failed to release cached file item thumbnail source', error)
  }
}
