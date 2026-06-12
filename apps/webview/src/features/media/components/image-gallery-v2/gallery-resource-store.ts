import {
  FileLoadError,
  isDerivativeUnavailableError,
  loadFileSourceById,
  type FileBlobLoadOptions,
  type FileSourceLoadResult,
} from '../file-loader'
import {
  formatImageGalleryDebugError,
  getImageGalleryDebugDurationMs,
  getImageGalleryDebugTime,
  logImageGalleryDebug,
  warnImageGalleryDebug,
} from '../image-gallery-debug'
import {
  getDefaultImageDisplayJobPriority,
  getImageDisplaySchedulerDebugSnapshot,
  scheduleImageDisplayJob,
  type ImageDisplaySchedulerJobType,
} from '../image-display-scheduler'
import {getGalleryAssetKey} from './gallery-asset-identity'
import type {
  GalleryAssetFailureSnapshot,
  GalleryAssetKey,
  GalleryAssetSnapshot,
  GalleryDisplayVariant,
  GalleryImage,
  GalleryResourceDebugSnapshot,
} from './gallery.types'

type GalleryLoadIntent = 'current' | 'neighbor' | 'thumbnail'
type LoadSourceById = typeof loadFileSourceById
type DisplayLoadOptions = FileBlobLoadOptions
type CachedGalleryAsset = GalleryAssetSnapshot & {
  assetKey: GalleryAssetKey
  source: FileSourceLoadResult
}
type SharedThumbnailAssetEntry = {
  asset: CachedGalleryAsset
  consumerCount: number
  lastUsedAt: number
  lastReleasedAt: number
}
type AbortIntentOptions = {
  retainAssetKeys?: Set<GalleryAssetKey>
  reason?: string
}
type DisplayAssetLoadOptions = {
  refresh?: boolean
  replaceInFlight?: boolean
}
type AbortIntentResult = {
  abortedCount: number
  retainedCount: number
}

type InFlightLoad = {
  requestKey: string
  assetKey: GalleryAssetKey
  imageId: number
  intent: GalleryLoadIntent
  controller: AbortController
  promise: Promise<GalleryAssetSnapshot>
  releaseExternalAbort: () => void
  released: boolean
  cancelled: boolean
  abortReason: string | null
  startedAt: number
  refresh: boolean
}

export type GalleryResourceStoreDeps = {
  loadSourceById?: LoadSourceById
  urlApi?: Pick<typeof URL, 'revokeObjectURL'>
}

function getRequestKey(intent: GalleryLoadIntent, assetKey: GalleryAssetKey): string {
  return `${intent}:${assetKey}`
}

function getSchedulerJobType(intent: GalleryLoadIntent): ImageDisplaySchedulerJobType {
  switch (intent) {
    case 'current':
      return 'current-preview'
    case 'neighbor':
      return 'adjacent-preview'
    case 'thumbnail':
      return 'thumbnail'
  }
}

function createAbortError() {
  return new DOMException('Aborted', 'AbortError')
}

function createStaleError() {
  return new DOMException('Stale image load result', 'AbortError')
}

function awaitWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return promise
  }

  if (signal.aborted) {
    return Promise.reject(createAbortError())
  }

  return new Promise<T>((resolve, reject) => {
    const handleAbort = () => {
      signal.removeEventListener('abort', handleAbort)
      reject(createAbortError())
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

let galleryResourceStoreDebugSeq = 0
const SHARED_THUMBNAIL_CACHE_MAX_ENTRIES = 128
const SHARED_THUMBNAIL_CACHE_IDLE_TTL_MS = 5 * 60 * 1000
const sharedThumbnailAssets = new Map<GalleryAssetKey, SharedThumbnailAssetEntry>()

export function resetGalleryResourceStoreSharedCacheForTests(): void {
  for (const entry of sharedThumbnailAssets.values()) {
    releaseSharedThumbnailSource(entry.asset.source)
  }
  sharedThumbnailAssets.clear()
}

function pruneSharedThumbnailAssets(): void {
  const now = Date.now()
  for (const [assetKey, entry] of [...sharedThumbnailAssets]) {
    if (entry.consumerCount > 0) {
      continue
    }
    if (now - entry.lastReleasedAt >= SHARED_THUMBNAIL_CACHE_IDLE_TTL_MS) {
      evictSharedThumbnailAsset(assetKey, entry)
    }
  }
  enforceSharedThumbnailCacheLimit()
}

function enforceSharedThumbnailCacheLimit(): void {
  if (sharedThumbnailAssets.size <= SHARED_THUMBNAIL_CACHE_MAX_ENTRIES) {
    return
  }

  const evictableEntries = [...sharedThumbnailAssets]
    .filter(([, entry]) => entry.consumerCount === 0)
    .sort(([, left], [, right]) => left.lastUsedAt - right.lastUsedAt)

  for (const [assetKey, entry] of evictableEntries) {
    if (sharedThumbnailAssets.size <= SHARED_THUMBNAIL_CACHE_MAX_ENTRIES) {
      return
    }
    evictSharedThumbnailAsset(assetKey, entry)
  }
}

function evictSharedThumbnailAsset(
  assetKey: GalleryAssetKey,
  entry: SharedThumbnailAssetEntry,
): void {
  if (entry.consumerCount > 0) {
    return
  }
  sharedThumbnailAssets.delete(assetKey)
  releaseSharedThumbnailSource(entry.asset.source)
}

function releaseSharedThumbnailSource(source: FileSourceLoadResult): void {
  try {
    void Promise.resolve(source.release()).catch((error) => {
      console.warn('Failed to release shared gallery thumbnail source', error)
    })
  } catch (error) {
    console.warn('Failed to release shared gallery thumbnail source', error)
  }
}

export class GalleryResourceStore {
  private readonly loadSourceById: LoadSourceById
  private readonly cachedAssets = new Map<GalleryAssetKey, CachedGalleryAsset>()
  private readonly failedAssets = new Map<GalleryAssetKey, GalleryAssetFailureSnapshot>()
  private readonly inFlightLoads = new Map<string, InFlightLoad>()
  private readonly loadingCounts = new Map<number, number>()
  private readonly ownedSourceUrls = new Set<string>()
  private readonly sharedAssetKeys = new Set<GalleryAssetKey>()
  private rawDisplayLoadCount = 0
  private releasedSourceCount = 0
  private renderFailureCount = 0
  private purgeCount = 0
  private readonly debugStoreId = ++galleryResourceStoreDebugSeq

  constructor(deps: GalleryResourceStoreDeps = {}) {
    this.loadSourceById = deps.loadSourceById ?? loadFileSourceById
  }

  async loadDisplayAsset(
    image: GalleryImage,
    variant: GalleryDisplayVariant,
    intent: 'current' | 'neighbor' | 'thumbnail',
    signal?: AbortSignal,
    options: DisplayAssetLoadOptions = {},
  ): Promise<GalleryAssetSnapshot> {
    pruneSharedThumbnailAssets()
    const assetKey = getGalleryAssetKey(image, variant)
    if (options.refresh) {
      this.failedAssets.delete(assetKey)
      const cached = this.cachedAssets.get(assetKey)
      if (cached) {
        this.revokeCachedAsset(assetKey, cached, {evictShared: true})
      } else if (variant === 'thumbnail-image') {
        this.evictSharedThumbnailAsset(assetKey)
      }
    } else {
      const cached = this.cachedAssets.get(assetKey)
      if (cached) {
        this.log('load.cache-hit', {
          assetKey,
          imageId: image.id,
          intent,
          variant,
          debug: this.getDebugSnapshot(),
        })
        return cached
      }

      const sharedThumbnail = this.tryAdoptSharedThumbnailAsset(assetKey, image, variant, intent)
      if (sharedThumbnail) {
        return sharedThumbnail
      }

      const failed = this.failedAssets.get(assetKey)
      if (failed) {
        this.log('load.failure-cache-hit', {
          requestKey: getRequestKey(intent, assetKey),
          assetKey,
          imageId: image.id,
          intent,
          variant,
          code: failed.code,
          message: failed.message,
          firstFailedAt: failed.firstFailedAt,
          debug: this.getDebugSnapshot(),
        })
        throw new FileLoadError('DERIVATIVE_UNAVAILABLE', failed.message)
      }
    }

    this.log('load.cache-miss', {
      assetKey,
      imageId: image.id,
      intent,
      variant,
      refresh: options.refresh === true,
      debug: this.getDebugSnapshot(),
    })

    const requestKey = getRequestKey(intent, assetKey)
    const existing = this.inFlightLoads.get(requestKey)
    if (existing && !existing.cancelled) {
      if (options.replaceInFlight) {
        this.abortInFlight(existing, 'replace-inflight')
      } else {
        this.log('load.join-inflight', {
          requestKey,
          assetKey,
          imageId: image.id,
          intent,
          variant,
          dtMs: getImageGalleryDebugDurationMs(existing.startedAt),
          debug: this.getDebugSnapshot(),
        })
        return await awaitWithAbort(existing.promise, signal)
      }
    }

    const sameAssetInFlight = this.findInFlightByAssetKey(assetKey)
    if (sameAssetInFlight && !sameAssetInFlight.cancelled) {
      if (options.replaceInFlight) {
        this.abortInFlight(sameAssetInFlight, 'replace-inflight')
      } else {
        this.log('load.join-inflight-same-asset', {
          requestKey,
          assetKey,
          imageId: image.id,
          intent,
          variant,
          existingRequestKey: sameAssetInFlight.requestKey,
          existingIntent: sameAssetInFlight.intent,
          dtMs: getImageGalleryDebugDurationMs(sameAssetInFlight.startedAt),
          debug: this.getDebugSnapshot(),
        })
        return await awaitWithAbort(sameAssetInFlight.promise, signal)
      }
    }

    const controller = new AbortController()
    const startedAt = getImageGalleryDebugTime()
    const record: InFlightLoad = {
      requestKey,
      assetKey,
      imageId: image.id,
      intent,
      controller,
      promise: Promise.resolve(null as never),
      releaseExternalAbort: () => {},
      released: false,
      cancelled: false,
      abortReason: null,
      startedAt,
      refresh: options.refresh === true,
    }
    record.releaseExternalAbort = this.linkExternalAbort(signal, controller, record)

    this.setImageLoading(image.id, true)
    this.log('load.start', {
      requestKey,
      assetKey,
      imageId: image.id,
      intent,
      variant,
      inFlightBefore: this.inFlightLoads.size,
    })

    const promise = this.loadDisplayAssetInternal(image, variant, record)
    record.promise = promise
    this.inFlightLoads.set(requestKey, record)

    return await awaitWithAbort(promise, controller.signal)
  }

  peek(imageId: number, variants: readonly GalleryDisplayVariant[]): GalleryAssetSnapshot | null {
    for (const variant of variants) {
      const asset = this.findCachedAsset(imageId, variant)
      if (asset) {
        return asset
      }
    }
    return null
  }

  peekImage(image: GalleryImage, variants: readonly GalleryDisplayVariant[]): GalleryAssetSnapshot | null {
    for (const variant of variants) {
      const asset = this.cachedAssets.get(getGalleryAssetKey(image, variant))
      if (asset) {
        return asset
      }
    }
    return null
  }

  hasInFlight(imageId: number, variant: GalleryDisplayVariant): boolean {
    for (const record of this.inFlightLoads.values()) {
      if (record.imageId === imageId && record.assetKey.includes(`:${variant}:`) && !record.cancelled) {
        return true
      }
    }

    return false
  }

  hasInFlightAsset(image: GalleryImage, variant: GalleryDisplayVariant): boolean {
    return this.findInFlightByAssetKey(getGalleryAssetKey(image, variant)) !== null
  }

  peekFailure(
    image: GalleryImage,
    variant: GalleryDisplayVariant,
  ): GalleryAssetFailureSnapshot | null {
    return this.failedAssets.get(getGalleryAssetKey(image, variant)) ?? null
  }

  hasFailed(image: GalleryImage, variant: GalleryDisplayVariant): boolean {
    return this.peekFailure(image, variant) !== null
  }

  abortIntent(intent: 'current' | 'neighbor' | 'thumbnail', options: AbortIntentOptions = {}): AbortIntentResult {
    const abortedRequestKeys: string[] = []
    const retainedRequestKeys: string[] = []
    const abortReason = options.reason ?? 'intent-abort'

    for (const record of [...this.inFlightLoads.values()]) {
      if (record.intent !== intent) {
        continue
      }
      if (options.retainAssetKeys?.has(record.assetKey)) {
        retainedRequestKeys.push(record.requestKey)
        continue
      }

      abortedRequestKeys.push(record.requestKey)
      this.abortInFlight(record, abortReason)
    }

    if (abortedRequestKeys.length > 0 || retainedRequestKeys.length > 0) {
      this.log('abort-intent', {
        intent,
        count: abortedRequestKeys.length,
        retainedCount: retainedRequestKeys.length,
        requestKeys: abortedRequestKeys,
        retainedRequestKeys,
        reason: abortReason,
        debug: this.getDebugSnapshot(),
      })
    }

    return {
      abortedCount: abortedRequestKeys.length,
      retainedCount: retainedRequestKeys.length,
    }
  }

  private abortInFlight(record: InFlightLoad, reason: string): void {
    if (record.cancelled) {
      return
    }

    record.cancelled = true
    record.abortReason = reason
    this.log('load.abort-request', {
      requestKey: record.requestKey,
      assetKey: record.assetKey,
      imageId: record.imageId,
      intent: record.intent,
      abortReason: record.abortReason,
      dtMs: getImageGalleryDebugDurationMs(record.startedAt),
    })
    record.controller.abort()
    this.releaseInFlight(record)
  }

  releaseRenderedAsset(
    imageId: number,
    variant: GalleryDisplayVariant,
    sourceUrl: string | null,
    options: {evictShared?: boolean} = {},
  ): boolean {
    const entry = this.findCachedAssetEntry(imageId, variant, sourceUrl)
    if (!entry || !sourceUrl) {
      return false
    }

    const [assetKey, asset] = entry
    this.warn('render.error', {
      assetKey,
      imageId,
      variant,
      debug: this.getDebugSnapshot(),
    })
    this.renderFailureCount += 1
    this.revokeCachedAsset(assetKey, asset, options)
    return true
  }

  markAssetFailure(
    image: GalleryImage,
    variant: GalleryDisplayVariant,
    code: GalleryAssetFailureSnapshot['code'],
    message: string,
  ): void {
    const assetKey = getGalleryAssetKey(image, variant)
    this.failedAssets.set(assetKey, {
      assetKey,
      imageId: image.id,
      variant,
      code,
      message,
      firstFailedAt: getImageGalleryDebugTime(),
    })
  }

  retain(retainKeys: Set<GalleryAssetKey>): void {
    const revokedAssetKeys: string[] = []

    for (const [assetKey, asset] of [...this.cachedAssets]) {
      if (retainKeys.has(assetKey)) {
        continue
      }

      this.revokeCachedAsset(assetKey, asset)
      revokedAssetKeys.push(assetKey)
    }

    if (revokedAssetKeys.length > 0) {
      this.log('retain.revoke', {
        retainCount: retainKeys.size,
        revokedCount: revokedAssetKeys.length,
        revokedAssetKeys,
        debug: this.getDebugSnapshot(),
      })
    }
  }

  cleanup(): void {
    this.log('cleanup.start', {debug: this.getDebugSnapshot()})
    this.purgeCount += 1

    for (const record of [...this.inFlightLoads.values()]) {
      record.cancelled = true
      record.abortReason = 'cleanup'
      this.log('load.abort-request', {
        requestKey: record.requestKey,
        assetKey: record.assetKey,
        imageId: record.imageId,
        intent: record.intent,
        abortReason: record.abortReason,
        dtMs: getImageGalleryDebugDurationMs(record.startedAt),
      })
      record.controller.abort()
      this.releaseInFlight(record)
    }

    for (const [assetKey, asset] of [...this.cachedAssets]) {
      this.revokeCachedAsset(assetKey, asset)
    }

    this.cachedAssets.clear()
    this.failedAssets.clear()
    this.inFlightLoads.clear()
    this.loadingCounts.clear()
    this.ownedSourceUrls.clear()
    this.sharedAssetKeys.clear()
    this.rawDisplayLoadCount = 0
    this.renderFailureCount = 0
    this.log('cleanup.done', {debug: this.getDebugSnapshot()})
  }

  getDebugSnapshot(): GalleryResourceDebugSnapshot {
    return {
      cachedAssetCount: this.cachedAssets.size,
      failedAssetCount: this.failedAssets.size,
      failedAssetKeys: [...this.failedAssets.keys()].sort(),
      inFlightCount: this.inFlightLoads.size,
      objectUrlCount: this.ownedSourceUrls.size,
      loadingImageIds: [...this.loadingCounts.keys()].sort((a, b) => a - b),
      rawDisplayLoadCount: this.rawDisplayLoadCount,
      revokedObjectUrlCount: this.releasedSourceCount,
      activePhysicalSlots: [],
      retainedPreparedSourceIds: [],
      thumbnailVirtualWindow: null,
      scheduler: getImageDisplaySchedulerDebugSnapshot(),
      prewarmImageIds: [],
      renderFailureCount: this.renderFailureCount,
      purgeCount: this.purgeCount,
      releaseCount: this.releasedSourceCount,
    }
  }

  private async loadDisplayAssetInternal(
    image: GalleryImage,
    variant: GalleryDisplayVariant,
    record: InFlightLoad,
  ): Promise<GalleryAssetSnapshot> {
    let schedulerStartedAt: number | null = null
    try {
      const options: DisplayLoadOptions = {
        signal: record.controller.signal,
        mimeType: image.mimeType,
        lastModified: image.lastModified,
        variant,
        derivativeFallback: 'none',
        ...(record.refresh ? {cachePolicy: 'refresh' as const, preparedSourcePolicy: 'skip' as const} : {}),
      }

      const schedulerJobType = getSchedulerJobType(record.intent)
      const source = await scheduleImageDisplayJob<FileSourceLoadResult>(
        {
          jobType: schedulerJobType,
          priority: getDefaultImageDisplayJobPriority(schedulerJobType),
          intentId: record.requestKey,
          signal: record.controller.signal,
          releaseResult: (loadedSource) => this.releaseSource(loadedSource),
        },
        (signal) => {
          const schedulerStarted = getImageGalleryDebugTime()
          schedulerStartedAt = schedulerStarted
          this.log('load.scheduler-start', {
            requestKey: record.requestKey,
            assetKey: record.assetKey,
            imageId: image.id,
            intent: record.intent,
            variant,
            schedulerWaitMs: Math.round(schedulerStarted - record.startedAt),
            debug: this.getDebugSnapshot(),
          })
          return this.loadSourceById(image.id, image.name, {
            ...options,
            signal,
            materializationPriority: getDefaultImageDisplayJobPriority(schedulerJobType),
          })
        },
      )
      const finishedAt = getImageGalleryDebugTime()
      const schedulerWaitMs =
        schedulerStartedAt === null ? null : Math.round(schedulerStartedAt - record.startedAt)
      const actualLoadMs = schedulerStartedAt === null ? null : Math.round(finishedAt - schedulerStartedAt)
      const asset: CachedGalleryAsset = {
        imageId: image.id,
        variant,
        url: source.url,
        size: source.size,
        mimeType: source.mimeType,
        assetKey: record.assetKey,
        source,
      }

      if (record.cancelled || record.controller.signal.aborted) {
        this.releaseSource(asset.source)
        this.log('load.source-after-abort', {
          requestKey: record.requestKey,
          assetKey: record.assetKey,
          imageId: image.id,
          intent: record.intent,
          variant,
          abortReason: record.abortReason ?? 'signal-abort',
          dtMs: getImageGalleryDebugDurationMs(record.startedAt),
        })
        throw createAbortError()
      }

      if (this.inFlightLoads.get(record.requestKey) !== record) {
        this.releaseSource(asset.source)
        this.log('load.stale', {
          requestKey: record.requestKey,
          assetKey: record.assetKey,
          imageId: image.id,
          intent: record.intent,
          variant,
          abortReason: record.abortReason ?? 'stale-record',
          dtMs: getImageGalleryDebugDurationMs(record.startedAt),
        })
        throw createStaleError()
      }

      const existingAsset = this.cachedAssets.get(record.assetKey)
      if (existingAsset) {
        this.releaseSource(asset.source)
        this.log('load.duplicate-cache', {
          requestKey: record.requestKey,
          assetKey: record.assetKey,
          imageId: image.id,
          intent: record.intent,
          variant,
          dtMs: getImageGalleryDebugDurationMs(record.startedAt),
        })
        return existingAsset
      }

      if (variant === 'thumbnail-image') {
        const sharedAsset = this.cacheSharedThumbnailAsset(record.assetKey, asset)
        if (sharedAsset !== asset) {
          this.releaseSource(asset.source)
        }
        this.failedAssets.delete(record.assetKey)
        this.cachedAssets.set(record.assetKey, sharedAsset)
        this.sharedAssetKeys.add(record.assetKey)
        this.log('load.done', {
          requestKey: record.requestKey,
          assetKey: record.assetKey,
          imageId: image.id,
          intent: record.intent,
          variant,
          size: sharedAsset.size,
          mimeType: sharedAsset.mimeType,
          schedulerWaitMs,
          actualLoadMs,
          dtMs: getImageGalleryDebugDurationMs(record.startedAt),
          debug: this.getDebugSnapshot(),
        })
        return sharedAsset
      }

      this.failedAssets.delete(record.assetKey)
      this.cachedAssets.set(record.assetKey, asset)
      this.ownedSourceUrls.add(asset.url)
      this.log('load.done', {
        requestKey: record.requestKey,
        assetKey: record.assetKey,
        imageId: image.id,
        intent: record.intent,
        variant,
        size: asset.size,
        mimeType: asset.mimeType,
        schedulerWaitMs,
        actualLoadMs,
        dtMs: getImageGalleryDebugDurationMs(record.startedAt),
        debug: this.getDebugSnapshot(),
      })
      return asset
    } catch (error) {
      if (record.cancelled || record.controller.signal.aborted) {
        this.log('load.abort', {
          requestKey: record.requestKey,
          assetKey: record.assetKey,
          imageId: image.id,
          intent: record.intent,
          variant,
          abortReason: record.abortReason ?? 'signal-abort',
          dtMs: getImageGalleryDebugDurationMs(record.startedAt),
        })
        throw createAbortError()
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        this.log('load.abort', {
          requestKey: record.requestKey,
          assetKey: record.assetKey,
          imageId: image.id,
          intent: record.intent,
          variant,
          abortReason: record.abortReason ?? 'signal-abort',
          dtMs: getImageGalleryDebugDurationMs(record.startedAt),
        })
        throw error
      }
      if (isDerivativeUnavailableError(error)) {
        this.failedAssets.set(record.assetKey, {
          assetKey: record.assetKey,
          imageId: image.id,
          variant,
          code: 'DERIVATIVE_UNAVAILABLE',
          message: error.message,
          firstFailedAt: getImageGalleryDebugTime(),
        })
        this.log('load.miss', {
          requestKey: record.requestKey,
          assetKey: record.assetKey,
          imageId: image.id,
          intent: record.intent,
          variant,
          dtMs: getImageGalleryDebugDurationMs(record.startedAt),
          error: formatImageGalleryDebugError(error),
        })
        throw error
      }
      this.warn('load.error', {
        requestKey: record.requestKey,
        assetKey: record.assetKey,
        imageId: image.id,
        intent: record.intent,
        variant,
        dtMs: getImageGalleryDebugDurationMs(record.startedAt),
        error: formatImageGalleryDebugError(error),
      })
      throw error
    } finally {
      this.releaseInFlight(record)
    }
  }

  private findInFlightByAssetKey(assetKey: GalleryAssetKey): InFlightLoad | null {
    for (const record of this.inFlightLoads.values()) {
      if (record.assetKey === assetKey && !record.cancelled) {
        return record
      }
    }

    return null
  }

  private findCachedAsset(imageId: number, variant: GalleryDisplayVariant): CachedGalleryAsset | null {
    return this.findCachedAssetEntry(imageId, variant)?.[1] ?? null
  }

  private findCachedAssetEntry(
    imageId: number,
    variant: GalleryDisplayVariant,
    sourceUrl?: string | null,
  ): [GalleryAssetKey, CachedGalleryAsset] | null {
    for (const entry of this.cachedAssets) {
      const [, asset] = entry
      if (
        asset.imageId === imageId &&
        asset.variant === variant &&
        (sourceUrl === undefined || asset.url === sourceUrl)
      ) {
        return entry
      }
    }

    return null
  }

  private linkExternalAbort(
    signal: AbortSignal | undefined,
    controller: AbortController,
    record: InFlightLoad,
  ) {
    if (!signal) {
      return () => {}
    }

    if (signal.aborted) {
      record.abortReason = 'external-abort'
      controller.abort()
      return () => {}
    }

    const handleAbort = () => {
      record.abortReason = 'external-abort'
      this.log('load.abort-request', {
        requestKey: record.requestKey,
        assetKey: record.assetKey,
        imageId: record.imageId,
        intent: record.intent,
        abortReason: record.abortReason,
        dtMs: getImageGalleryDebugDurationMs(record.startedAt),
      })
      controller.abort()
    }
    signal.addEventListener('abort', handleAbort, {once: true})
    return () => signal.removeEventListener('abort', handleAbort)
  }

  private releaseInFlight(record: InFlightLoad) {
    if (record.released) {
      return
    }

    record.released = true
    record.releaseExternalAbort()
    if (this.inFlightLoads.get(record.requestKey) === record) {
      this.inFlightLoads.delete(record.requestKey)
    }
    this.setImageLoading(record.imageId, false)
  }

  private setImageLoading(imageId: number, active: boolean) {
    const count = this.loadingCounts.get(imageId) ?? 0

    if (active) {
      this.loadingCounts.set(imageId, count + 1)
    } else if (count <= 1) {
      this.loadingCounts.delete(imageId)
    } else {
      this.loadingCounts.set(imageId, count - 1)
    }
  }

  private revokeCachedAsset(
    assetKey: string,
    asset: CachedGalleryAsset,
    options: {evictShared?: boolean} = {},
  ) {
    this.cachedAssets.delete(assetKey)
    if (this.sharedAssetKeys.delete(assetKey)) {
      if (options.evictShared) {
        this.evictSharedThumbnailAsset(assetKey)
      } else {
        this.releaseSharedThumbnailAsset(assetKey)
      }
      return
    }
    this.ownedSourceUrls.delete(asset.url)
    this.releaseSource(asset.source)
  }

  private releaseSource(source: FileSourceLoadResult) {
    try {
      void Promise.resolve(source.release()).catch((error) => {
        console.warn('Failed to release gallery asset source', error)
      })
    } catch (error) {
      console.warn('Failed to release gallery asset source', error)
    }
    this.releasedSourceCount += 1
  }

  private tryAdoptSharedThumbnailAsset(
    assetKey: GalleryAssetKey,
    image: GalleryImage,
    variant: GalleryDisplayVariant,
    intent: GalleryLoadIntent,
  ): CachedGalleryAsset | null {
    if (variant !== 'thumbnail-image') {
      return null
    }

    const entry = sharedThumbnailAssets.get(assetKey)
    if (!entry) {
      return null
    }

    entry.consumerCount += 1
    entry.lastUsedAt = Date.now()
    this.cachedAssets.set(assetKey, entry.asset)
    this.sharedAssetKeys.add(assetKey)
    this.log('load.shared-thumbnail-cache-hit', {
      assetKey,
      imageId: image.id,
      intent,
      variant,
      debug: this.getDebugSnapshot(),
    })
    return entry.asset
  }

  private cacheSharedThumbnailAsset(
    assetKey: GalleryAssetKey,
    asset: CachedGalleryAsset,
  ): CachedGalleryAsset {
    const existing = sharedThumbnailAssets.get(assetKey)
    const now = Date.now()
    if (existing) {
      existing.consumerCount += 1
      existing.lastUsedAt = now
      return existing.asset
    }

    sharedThumbnailAssets.set(assetKey, {
      asset,
      consumerCount: 1,
      lastUsedAt: now,
      lastReleasedAt: now,
    })
    enforceSharedThumbnailCacheLimit()
    return asset
  }

  private releaseSharedThumbnailAsset(assetKey: GalleryAssetKey): void {
    const entry = sharedThumbnailAssets.get(assetKey)
    if (!entry) {
      return
    }

    entry.consumerCount = Math.max(0, entry.consumerCount - 1)
    entry.lastUsedAt = Date.now()
    if (entry.consumerCount === 0) {
      entry.lastReleasedAt = entry.lastUsedAt
    }
    enforceSharedThumbnailCacheLimit()
  }

  private evictSharedThumbnailAsset(assetKey: GalleryAssetKey): void {
    const entry = sharedThumbnailAssets.get(assetKey)
    if (!entry) {
      return
    }

    sharedThumbnailAssets.delete(assetKey)
    releaseSharedThumbnailSource(entry.asset.source)
  }

  private log(event: string, meta?: Record<string, unknown>): void {
    logImageGalleryDebug('resource-store', event, {
      storeId: this.debugStoreId,
      ...meta,
    })
  }

  private warn(event: string, meta?: Record<string, unknown>): void {
    warnImageGalleryDebug('resource-store', event, {
      storeId: this.debugStoreId,
      ...meta,
    })
  }
}
