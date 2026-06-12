import {atom, computed, wrap} from '@reatom/core'
import {i18n} from 'root/i18n'
import {GalleryResourceStore, type GalleryResourceStoreDeps} from './gallery-resource-store'
import {getGalleryAssetKey} from './gallery-asset-identity'
import {prewarmImageDerivative, prewarmUploadedImageDerivativeWhenVisible} from '../image-derivative-prewarm'
import {
  formatImageGalleryDebugError,
  getImageGalleryDebugDurationMs,
  getImageGalleryDebugTime,
  logImageGalleryDebug,
  warnImageGalleryDebug,
} from '../image-gallery-debug'
import type {
  GalleryAssetKey,
  GalleryDisplayWindowSnapshot,
  GalleryImage,
  GalleryPanelSnapshot,
  GalleryResourceDebugSnapshot,
  GalleryThumbnailSnapshot,
  GalleryThumbnailVirtualWindow,
} from './gallery.types'

type NavigationDirection = -1 | 0 | 1
type ThumbnailWindowState = {
  centerIndex: number
  visibleRadius: number
  indices: number[]
}

type ThumbnailVirtualMetrics = {
  viewportWidth: number
  thumbnailStepPx: number
  centerIndex: number | null
}
type NavigateOptions = {
  syncThumbnailCenter?: boolean
  replaceCurrentPreviewInFlight?: boolean
}

export type GalleryPanelSnapshotDebugReason =
  | 'has-preview'
  | 'error'
  | 'loading-preview'
  | 'thumbnail-only'
  | 'no-preview-not-loading'

const THUMBNAIL_VIRTUAL_OVERSCAN = 6
const THUMBNAIL_VIRTUAL_MAX_RENDERED = 32
const THUMBNAIL_PRELOAD_RADIUS = 4
const THUMBNAIL_MAX_PRIMED_LOADS = 48
const DEFAULT_THUMBNAIL_STEP_PX = 64
const RECENT_PREVIEW_RETENTION_LIMIT = 5
const THUMBNAIL_RENDER_REFRESH_LIMIT = 1

export type GallerySessionModelDeps = GalleryResourceStoreDeps & {
  prewarmDerivative?: typeof prewarmImageDerivative
  prewarmUploadedDerivativeWhenVisible?: typeof prewarmUploadedImageDerivativeWhenVisible
}

function toDirection(delta: number): NavigationDirection {
  if (delta > 0) return 1
  if (delta < 0) return -1
  return 0
}

function areNumberArraysEqual(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function getWindowIndices(imageCount: number, centerIndex: number, radius: number): number[] {
  const indices: number[] = []
  const start = Math.max(0, centerIndex - radius)
  const end = Math.min(imageCount - 1, centerIndex + radius)

  for (let index = start; index <= end; index += 1) {
    indices.push(index)
  }

  return indices
}

export function getGalleryPanelSnapshotDebugReason(input: {
  hasPreviewSrc: boolean
  hasThumbnailSrc: boolean
  loading: boolean
  error: string | null
}): GalleryPanelSnapshotDebugReason {
  if (input.hasPreviewSrc) {
    return 'has-preview'
  }
  if (input.error) {
    return 'error'
  }
  if (input.loading) {
    return 'loading-preview'
  }
  if (input.hasThumbnailSrc) {
    return 'thumbnail-only'
  }
  return 'no-preview-not-loading'
}

function getThumbnailVirtualIndices(
  imageCount: number,
  centerIndex: number,
  metrics: ThumbnailVirtualMetrics,
): GalleryThumbnailVirtualWindow {
  if (imageCount <= 0) {
    return {
      startIndex: 0,
      endIndex: -1,
      indices: [],
      beforeCount: 0,
      afterCount: 0,
      thumbnailStepPx: metrics.thumbnailStepPx,
      maxRendered: THUMBNAIL_VIRTUAL_MAX_RENDERED,
    }
  }

  if (imageCount <= THUMBNAIL_VIRTUAL_MAX_RENDERED) {
    return {
      startIndex: 0,
      endIndex: imageCount - 1,
      indices: getWindowIndices(imageCount, Math.floor((imageCount - 1) / 2), Math.ceil(imageCount / 2)),
      beforeCount: 0,
      afterCount: 0,
      thumbnailStepPx: Math.max(1, metrics.thumbnailStepPx),
      maxRendered: THUMBNAIL_VIRTUAL_MAX_RENDERED,
    }
  }

  const step = Math.max(1, metrics.thumbnailStepPx)
  const visibleSlots = Math.max(1, Math.ceil(metrics.viewportWidth / step))
  const slotCount = Math.min(
    imageCount,
    THUMBNAIL_VIRTUAL_MAX_RENDERED,
    visibleSlots + THUMBNAIL_VIRTUAL_OVERSCAN * 2,
  )
  const halfWindow = Math.floor(slotCount / 2)
  const clampedCenter = Math.max(0, Math.min(centerIndex, imageCount - 1))
  const maxStart = Math.max(0, imageCount - slotCount)
  const startIndex = Math.max(0, Math.min(maxStart, clampedCenter - halfWindow))
  const endIndex = Math.min(imageCount - 1, startIndex + slotCount - 1)
  const indices = getWindowIndices(
    imageCount,
    Math.floor((startIndex + endIndex) / 2),
    Math.floor(slotCount / 2),
  ).filter((index) => index >= startIndex && index <= endIndex)

  return {
    startIndex,
    endIndex,
    indices,
    beforeCount: startIndex,
    afterCount: Math.max(0, imageCount - endIndex - 1),
    thumbnailStepPx: step,
    maxRendered: THUMBNAIL_VIRTUAL_MAX_RENDERED,
  }
}

let imageGallerySessionDebugSeq = 0

export class ImageGallerySessionModel {
  readonly images = atom<GalleryImage[]>([], 'media.imageGalleryV2.images')
  readonly currentIndex = atom(0, 'media.imageGalleryV2.currentIndex')
  readonly lastDirection = atom<NavigationDirection>(0, 'media.imageGalleryV2.lastDirection')
  readonly loadingImageIds = atom<number[]>([], 'media.imageGalleryV2.loadingImageIds')

  private readonly panelErrors = atom<Record<number, string>>({}, 'media.imageGalleryV2.panelErrors')
  private readonly recentPreviewRetentionIds = atom<number[]>(
    [],
    'media.imageGalleryV2.recentPreviewRetentionIds',
  )
  private readonly thumbnailWindowState = atom<ThumbnailWindowState>(
    {centerIndex: 0, visibleRadius: 0, indices: []},
    'media.imageGalleryV2.thumbnailWindowState',
  )
  private readonly thumbnailVirtualMetrics = atom<ThumbnailVirtualMetrics>(
    {
      viewportWidth: DEFAULT_THUMBNAIL_STEP_PX,
      thumbnailStepPx: DEFAULT_THUMBNAIL_STEP_PX,
      centerIndex: null,
    },
    'media.imageGalleryV2.thumbnailVirtualMetrics',
  )
  private readonly resourceVersion = atom(0, 'media.imageGalleryV2.resourceVersion')
  private readonly store: GalleryResourceStore
  private readonly prewarmDerivative: typeof prewarmImageDerivative
  private readonly prewarmUploadedDerivativeWhenVisible: typeof prewarmUploadedImageDerivativeWhenVisible
  private currentLoadToken = 0
  private neighborLoadToken = 0
  private derivativePrewarmToken = 0
  private derivativePrewarmController: AbortController | null = null
  private lastResourceStateLogKey = ''
  private readonly lastPanelSnapshotDebugKeys = new Map<string, string>()
  private readonly thumbnailRenderRefreshAttempts = new Map<GalleryAssetKey, number>()
  private readonly debugSessionId = ++imageGallerySessionDebugSeq

  readonly currentPanel = computed<GalleryPanelSnapshot>(
    () => this.getPanelSnapshot(this.currentIndex(), 'current'),
    'media.imageGalleryV2.currentPanel',
  )
  readonly panelSnapshots = computed<GalleryPanelSnapshot[]>(
    () => [
      this.getPanelSnapshot(this.currentIndex() - 1, 'previous'),
      this.getPanelSnapshot(this.currentIndex(), 'current'),
      this.getPanelSnapshot(this.currentIndex() + 1, 'next'),
    ],
    'media.imageGalleryV2.panelSnapshots',
  )
  readonly thumbnailWindow = computed<GalleryThumbnailSnapshot[]>(() => {
    this.resourceVersion()
    return this.thumbnailWindowState().indices.map((index) => this.getThumbnailSnapshot(index))
  }, 'media.imageGalleryV2.thumbnailWindow')
  readonly thumbnailVirtualWindow = computed<GalleryThumbnailVirtualWindow>(
    () =>
      getThumbnailVirtualIndices(
        this.images().length,
        this.thumbnailVirtualMetrics().centerIndex ?? this.currentIndex(),
        this.thumbnailVirtualMetrics(),
      ),
    'media.imageGalleryV2.thumbnailVirtualWindow',
  )
  readonly displayWindow = computed<GalleryDisplayWindowSnapshot>(
    () => this.getDisplayWindowSnapshotFor(this.images(), this.currentIndex()),
    'media.imageGalleryV2.displayWindow',
  )
  readonly debugSnapshot = computed<GalleryResourceDebugSnapshot>(() => {
    this.resourceVersion()
    return this.buildDebugSnapshot()
  }, 'media.imageGalleryV2.debugSnapshot')

  constructor(deps: GallerySessionModelDeps = {}) {
    this.store = new GalleryResourceStore(deps)
    this.prewarmDerivative = deps.prewarmDerivative ?? prewarmImageDerivative
    this.prewarmUploadedDerivativeWhenVisible =
      deps.prewarmUploadedDerivativeWhenVisible ?? prewarmUploadedImageDerivativeWhenVisible
  }

  setImages(images: GalleryImage[], currentIndex: number): void {
    const previousImageCount = this.images().length
    const previousIndex = this.currentIndex()
    this.cancelDerivativePrewarm()
    this.images.set(images)
    this.currentIndex.set(this.clampIndex(currentIndex, images))
    this.thumbnailVirtualMetrics.set({
      ...this.thumbnailVirtualMetrics(),
      centerIndex: this.currentIndex(),
    })
    this.pruneRecentPreviewRetention(images)
    this.pruneThumbnailRenderRefreshAttempts(images)
    this.rememberCurrentPreviewRetention()
    this.clearMissingErrors(images)
    this.retainResources()
    this.log('set-images', {
      previousImageCount,
      nextImageCount: images.length,
      requestedIndex: currentIndex,
      previousIndex,
      currentIndex: this.currentIndex(),
      debug: this.store.getDebugSnapshot(),
    })
  }

  open(images: GalleryImage[], currentIndex: number): void {
    this.log('open', {imageCount: images.length, requestedIndex: currentIndex})
    this.abortDisplayLoads()
    this.setImages(images, currentIndex)
    this.logNavigationStart('open', null, this.currentIndex())
    this.loadCurrentThenPrimeNeighbor()
  }

  syncImages(images: GalleryImage[], currentIndex: number): void {
    const previousIndex = this.currentIndex()
    this.log('sync-images', {imageCount: images.length, requestedIndex: currentIndex})
    this.abortDisplayLoads()
    this.setImages(images, currentIndex)
    this.logNavigationStart('sync', previousIndex, this.currentIndex())
    this.loadCurrentThenPrimeNeighbor()
  }

  close(): void {
    this.log('close.start', {debug: this.store.getDebugSnapshot()})
    this.currentLoadToken += 1
    this.neighborLoadToken += 1
    this.cancelDerivativePrewarm()
    this.store.cleanup()
    this.images.set([])
    this.currentIndex.set(0)
    this.lastDirection.set(0)
    this.panelErrors.set({})
    this.recentPreviewRetentionIds.set([])
    this.thumbnailWindowState.set({centerIndex: 0, visibleRadius: 0, indices: []})
    this.thumbnailRenderRefreshAttempts.clear()
    this.lastPanelSnapshotDebugKeys.clear()
    this.syncResourceState()
    this.log('close.done', {debug: this.store.getDebugSnapshot()})
  }

  navigate(index: number, options: NavigateOptions = {}): void {
    const images = this.images()
    if (index < 0 || index >= images.length) {
      this.warn('navigate.ignored-out-of-range', {
        requestedIndex: index,
        imageCount: images.length,
      })
      return
    }

    const previousIndex = this.currentIndex()
    const retainNeighborAssetKeys = this.getDisplayPreviewAssetKeys(images, index)
    this.abortDisplayLoads({retainNeighborAssetKeys})
    this.lastDirection.set(toDirection(index - previousIndex))
    this.currentIndex.set(index)
    if (options.syncThumbnailCenter !== false) {
      this.setThumbnailVirtualCenterIndex(index, false)
    }
    this.rememberCurrentPreviewRetention()
    this.retainResources()
    this.logNavigationStart('navigate', previousIndex, index)
    this.log('navigate', {
      previousIndex,
      nextIndex: index,
      direction: this.lastDirection(),
      imageId: images[index]?.id ?? null,
      debug: this.store.getDebugSnapshot(),
    })
    this.loadCurrentThenPrimeNeighbor({
      replaceInFlightPreview: options.replaceCurrentPreviewInFlight === true,
    })
  }

  async loadCurrent(options: {replaceInFlightPreview?: boolean} = {}): Promise<void> {
    const image = this.images()[this.currentIndex()]
    if (!image) {
      this.log('load-current.no-image', {
        currentIndex: this.currentIndex(),
        imageCount: this.images().length,
      })
      this.syncResourceState()
      return
    }

    const token = ++this.currentLoadToken
    const startedAt = getImageGalleryDebugTime()
    this.log('load-current.start', {
      token,
      currentIndex: this.currentIndex(),
      imageId: image.id,
      debug: this.store.getDebugSnapshot(),
    })

    if (this.store.peekImage(image, ['preview-image'])) {
      this.clearPanelError(image.id)
      this.log('load-current.cache-hit', {
        token,
        currentIndex: this.currentIndex(),
        imageId: image.id,
        debug: this.store.getDebugSnapshot(),
      })
      this.syncResourceState()
      this.scheduleDerivativePrewarm()
      return
    }

    try {
      const load = this.store.loadDisplayAsset(image, 'preview-image', 'current', undefined, {
        replaceInFlight: options.replaceInFlightPreview === true,
      })
      this.syncResourceState()
      await wrap(load)
      this.log('load-current.wait', {
        token,
        currentIndex: this.currentIndex(),
        imageId: image.id,
        dtMs: getImageGalleryDebugDurationMs(startedAt),
        debug: this.store.getDebugSnapshot(),
      })
      if (token !== this.currentLoadToken || this.images()[this.currentIndex()]?.id !== image.id) {
        this.log('load-current.stale-token', {
          token,
          currentLoadToken: this.currentLoadToken,
          imageId: image.id,
          currentImageId: this.images()[this.currentIndex()]?.id ?? null,
          dtMs: getImageGalleryDebugDurationMs(startedAt),
        })
        return
      }
      this.clearPanelError(image.id)
      this.scheduleDerivativePrewarm()
      this.log('load-current.done', {
        token,
        currentIndex: this.currentIndex(),
        imageId: image.id,
        dtMs: getImageGalleryDebugDurationMs(startedAt),
        debug: this.store.getDebugSnapshot(),
      })
    } catch (error) {
      if (!isAbortError(error) && token === this.currentLoadToken) {
        this.setPanelError(image.id, getErrorMessage(error))
        this.warn('load-current.error', {
          token,
          imageId: image.id,
          dtMs: getImageGalleryDebugDurationMs(startedAt),
          error: formatImageGalleryDebugError(error),
        })
      } else {
        this.log('load-current.abort', {
          token,
          imageId: image.id,
          dtMs: getImageGalleryDebugDurationMs(startedAt),
        })
      }
    } finally {
      this.retainResources()
      this.syncResourceState()
    }
  }

  primeDirectionalNeighbor(direction: NavigationDirection): void {
    const images = this.images()
    if (images.length <= 1) {
      this.log('prime-neighbor.skip-single-image', {imageCount: images.length})
      return
    }

    const resolvedDirection = this.resolveNeighborDirection(direction)
    if (resolvedDirection === 0) {
      this.log('prime-neighbor.skip-no-direction', {
        requestedDirection: direction,
        currentIndex: this.currentIndex(),
      })
      return
    }

    const index = this.currentIndex() + resolvedDirection
    const image = images[index]
    if (!image || this.store.peekImage(image, ['preview-image'])) {
      this.log('prime-neighbor.skip-cache-or-missing', {
        requestedDirection: direction,
        resolvedDirection,
        targetIndex: index,
        imageId: image?.id ?? null,
        hasPreview: image ? Boolean(this.store.peekImage(image, ['preview-image'])) : false,
        debug: this.store.getDebugSnapshot(),
      })
      this.retainResources()
      return
    }

    const existingError = this.panelErrors()[image.id] ?? null
    if (existingError) {
      this.log('prime-neighbor.skip-error', {
        requestedDirection: direction,
        resolvedDirection,
        targetIndex: index,
        imageId: image.id,
        error: existingError,
        debug: this.store.getDebugSnapshot(),
      })
      this.retainResources()
      return
    }

    if (this.store.hasInFlightAsset(image, 'preview-image')) {
      this.log('prime-neighbor.skip-inflight', {
        requestedDirection: direction,
        resolvedDirection,
        targetIndex: index,
        imageId: image.id,
        debug: this.store.getDebugSnapshot(),
      })
      this.syncResourceState()
      return
    }

    this.store.abortIntent('neighbor')
    const token = ++this.neighborLoadToken
    const startedAt = getImageGalleryDebugTime()
    this.log('prime-neighbor.start', {
      token,
      requestedDirection: direction,
      resolvedDirection,
      targetIndex: index,
      imageId: image.id,
      debug: this.store.getDebugSnapshot(),
    })
    const load = this.store.loadDisplayAsset(image, 'preview-image', 'neighbor')
    this.syncResourceState()

    void this.finishNeighborLoad(load, image, token, index, startedAt)
  }

  primeThumbnailWindow(centerIndex: number, visibleRadius: number): void {
    const images = this.images()
    const radius = Math.min(
      Math.max(0, visibleRadius),
      Math.max(THUMBNAIL_PRELOAD_RADIUS, Math.floor((THUMBNAIL_MAX_PRIMED_LOADS - 1) / 2)),
    )
    const clampedCenter = this.clampIndex(centerIndex, images)
    const indices = getWindowIndices(images.length, clampedCenter, radius)

    this.primeThumbnailIndices(clampedCenter, radius, indices, 'prime-thumbnail-window', {
      requestedCenterIndex: centerIndex,
    })
  }

  primeThumbnailVirtualWindow(centerIndex: number): void {
    const images = this.images()
    const clampedCenter = this.clampIndex(centerIndex, images)
    const virtualWindow = getThumbnailVirtualIndices(
      images.length,
      clampedCenter,
      this.thumbnailVirtualMetrics(),
    )
    const startIndex = Math.max(0, virtualWindow.startIndex - THUMBNAIL_PRELOAD_RADIUS)
    const endIndex = Math.min(images.length - 1, virtualWindow.endIndex + THUMBNAIL_PRELOAD_RADIUS)
    const indices =
      endIndex >= startIndex
        ? getWindowIndices(
            images.length,
            Math.floor((startIndex + endIndex) / 2),
            Math.ceil((endIndex - startIndex) / 2),
          )
            .filter((index) => index >= startIndex && index <= endIndex)
            .slice(0, THUMBNAIL_MAX_PRIMED_LOADS)
        : []
    const radius = indices.length ? Math.max(...indices.map((index) => Math.abs(index - clampedCenter))) : 0

    this.primeThumbnailIndices(clampedCenter, radius, indices, 'prime-thumbnail-virtual-window', {
      requestedCenterIndex: centerIndex,
      virtualStartIndex: virtualWindow.startIndex,
      virtualEndIndex: virtualWindow.endIndex,
      renderedCount: virtualWindow.indices.length,
    })
  }

  private primeThumbnailIndices(
    clampedCenter: number,
    radius: number,
    indices: number[],
    eventName: string,
    meta: Record<string, unknown>,
  ): void {
    const images = this.images()
    const currentWindow = this.thumbnailWindowState()
    const isSameWindow =
      currentWindow.centerIndex === clampedCenter &&
      currentWindow.visibleRadius === radius &&
      areNumberArraysEqual(currentWindow.indices, indices)

    if (isSameWindow) {
      this.log(eventName, {
        centerIndex: clampedCenter,
        visibleRadius: radius,
        indices,
        requestedThumbnailCount: indices.length,
        startedLoads: 0,
        skippedCacheLoads: 0,
        skippedInFlightLoads: 0,
        skippedFailedLoads: 0,
        abortedThumbnailLoads: 0,
        retainedInFlightThumbnailLoads: 0,
        noOp: true,
        debug: this.store.getDebugSnapshot(),
        ...meta,
      })
      return
    }

    const retainThumbnailAssetKeys = new Set<GalleryAssetKey>()
    for (const index of indices) {
      const image = images[index]
      if (image) {
        retainThumbnailAssetKeys.add(getGalleryAssetKey(image, 'thumbnail-image'))
      }
    }

    const abortResult = this.store.abortIntent('thumbnail', {
      retainAssetKeys: retainThumbnailAssetKeys,
      reason: 'thumbnail-window-update',
    })
    this.thumbnailWindowState.set({centerIndex: clampedCenter, visibleRadius: radius, indices})
    this.syncResourceState()
    this.retainResources()

    let startedLoads = 0
    let skippedCacheLoads = 0
    let skippedInFlightLoads = 0
    let skippedFailedLoads = 0
    for (const index of indices) {
      const image = images[index]
      if (!image) {
        continue
      }
      if (this.store.hasFailed(image, 'thumbnail-image')) {
        skippedFailedLoads += 1
        continue
      }
      if (this.store.peekImage(image, ['thumbnail-image'])) {
        skippedCacheLoads += 1
        continue
      }
      if (this.store.hasInFlightAsset(image, 'thumbnail-image')) {
        skippedInFlightLoads += 1
        continue
      }

      startedLoads += 1
      const load = this.store.loadDisplayAsset(image, 'thumbnail-image', 'thumbnail')
      void this.finishThumbnailLoad(load)
    }

    this.log(eventName, {
      centerIndex: clampedCenter,
      visibleRadius: radius,
      indices,
      requestedThumbnailCount: indices.length,
      startedLoads,
      skippedCacheLoads,
      skippedInFlightLoads,
      skippedFailedLoads,
      abortedThumbnailLoads: abortResult.abortedCount,
      retainedInFlightThumbnailLoads: abortResult.retainedCount,
      debug: this.store.getDebugSnapshot(),
      ...meta,
    })
    this.syncResourceState()
  }

  getPanelSnapshot(index: number, role: GalleryPanelSnapshot['role']): GalleryPanelSnapshot {
    this.resourceVersion()
    const image = this.images()[index]
    if (!image) {
      return {
        role,
        imageIndex: null,
        imageId: null,
        src: null,
        loading: false,
        error: null,
      }
    }

    const asset = this.store.peekImage(image, ['preview-image'])
    const thumbnailAsset = this.store.peekImage(image, ['thumbnail-image'])
    const error = this.panelErrors()[image.id] ?? null
    const snapshot = {
      role,
      imageIndex: index,
      imageId: image.id,
      src: asset?.url ?? null,
      loading: !error && this.store.hasInFlightAsset(image, 'preview-image'),
      error,
    }
    this.logPanelSnapshot(snapshot, Boolean(asset), Boolean(thumbnailAsset))
    return snapshot
  }

  getThumbnailSnapshot(index: number): GalleryThumbnailSnapshot {
    this.resourceVersion()
    const image = this.images()[index]
    if (!image) {
      return {
        imageIndex: index,
        imageId: 0,
        src: null,
        loading: false,
        selected: false,
      }
    }

    const asset = this.store.peekImage(image, ['thumbnail-image'])
    const failed = this.store.hasFailed(image, 'thumbnail-image')
    return {
      imageIndex: index,
      imageId: image.id,
      src: asset?.url ?? null,
      loading: !failed && this.store.hasInFlightAsset(image, 'thumbnail-image'),
      selected: index === this.currentIndex(),
    }
  }

  getDebugSnapshot(): GalleryResourceDebugSnapshot {
    return this.buildDebugSnapshot()
  }

  setThumbnailViewportMetrics(metrics: {viewportWidth: number; thumbnailStepPx: number}): void {
    const next = {
      viewportWidth: Math.max(1, Math.floor(metrics.viewportWidth)),
      thumbnailStepPx: Math.max(1, Math.floor(metrics.thumbnailStepPx)),
      centerIndex: this.thumbnailVirtualMetrics().centerIndex,
    }
    const current = this.thumbnailVirtualMetrics()
    if (current.viewportWidth === next.viewportWidth && current.thumbnailStepPx === next.thumbnailStepPx) {
      return
    }

    this.thumbnailVirtualMetrics.set(next)
  }

  getThumbnailVirtualWindow(): GalleryThumbnailVirtualWindow {
    return this.thumbnailVirtualWindow()
  }

  getDisplayWindowSnapshot(): GalleryDisplayWindowSnapshot {
    return this.displayWindow()
  }

  handleImageRenderError(imageId: number | null, sourceUrl: string | null): void {
    if (typeof imageId !== 'number') {
      return
    }

    const released = this.store.releaseRenderedAsset(imageId, 'preview-image', sourceUrl)
    if (!released) {
      this.log('render-error.stale', {imageId, sourceUrl})
      return
    }

    this.forgetPreviewRetention(imageId)
    this.setPanelError(imageId, i18n('media:image-display-failed' as any))
    this.cancelDerivativePrewarm()
    this.retainResources()
    this.warn('render-error.release', {
      imageId,
      debug: this.store.getDebugSnapshot(),
    })
  }

  handleThumbnailRenderError(imageId: number | null, sourceUrl: string | null): void {
    if (typeof imageId !== 'number') {
      return
    }

    const images = this.images()
    const imageIndex = images.findIndex((candidate) => candidate.id === imageId)
    const image = images[imageIndex]
    if (!image) {
      return
    }

    const released = this.store.releaseRenderedAsset(imageId, 'thumbnail-image', sourceUrl, {
      evictShared: true,
    })
    if (!released) {
      this.log('thumbnail-render-error.stale', {imageId, sourceUrl})
      return
    }

    const assetKey = getGalleryAssetKey(image, 'thumbnail-image')
    const attemptCount = this.thumbnailRenderRefreshAttempts.get(assetKey) ?? 0
    if (attemptCount >= THUMBNAIL_RENDER_REFRESH_LIMIT) {
      this.store.markAssetFailure(
        image,
        'thumbnail-image',
        'RENDER_FAILED',
        i18n('media:image-display-failed' as any),
      )
      this.retainResources()
      this.syncResourceState()
      this.warn('thumbnail-render-error.give-up', {
        imageId,
        sourceUrl,
        assetKey,
        attemptCount,
        debug: this.store.getDebugSnapshot(),
      })
      return
    }

    this.thumbnailRenderRefreshAttempts.set(assetKey, attemptCount + 1)
    this.retainResources()
    this.syncResourceState()
    this.warn('thumbnail-render-error.refresh', {
      imageId,
      sourceUrl,
      assetKey,
      attempt: attemptCount + 1,
      debug: this.store.getDebugSnapshot(),
    })

    const load = this.store.loadDisplayAsset(image, 'thumbnail-image', 'thumbnail', undefined, {
      refresh: true,
    })
    void this.finishThumbnailRefresh(load, imageId, assetKey)
  }

  setThumbnailScrollCenterIndex(index: number): void {
    this.setThumbnailVirtualCenterIndex(index, true)
  }

  setThumbnailProgrammaticScrollCenterIndex(index: number): void {
    this.setThumbnailVirtualCenterIndex(index, false)
  }

  private setThumbnailVirtualCenterIndex(index: number, primeWindow: boolean): void {
    const images = this.images()
    const centerIndex = this.clampIndex(index, images)
    const current = this.thumbnailVirtualMetrics()
    if (current.centerIndex === centerIndex) {
      return
    }

    this.thumbnailVirtualMetrics.set({
      ...current,
      centerIndex,
    })
    if (primeWindow) {
      this.primeThumbnailVirtualWindow(centerIndex)
    }
  }

  private getDisplayPreviewAssetKeys(images: readonly GalleryImage[], centerIndex: number): Set<GalleryAssetKey> {
    const retainKeys = new Set<GalleryAssetKey>()
    for (const index of [centerIndex - 1, centerIndex, centerIndex + 1]) {
      const image = images[index]
      if (image) {
        retainKeys.add(getGalleryAssetKey(image, 'preview-image'))
      }
    }
    return retainKeys
  }

  private abortDisplayLoads(options: {retainNeighborAssetKeys?: Set<GalleryAssetKey>} = {}) {
    this.currentLoadToken += 1
    this.cancelDerivativePrewarm()
    this.store.abortIntent('current')
    const neighborAbortResult = this.store.abortIntent('neighbor', {
      retainAssetKeys: options.retainNeighborAssetKeys,
      reason: 'display-navigation',
    })
    if (neighborAbortResult.abortedCount > 0) {
      this.neighborLoadToken += 1
    }
    this.syncResourceState()
  }

  private loadCurrentThenPrimeNeighbor(options: {replaceInFlightPreview?: boolean} = {}): void {
    void this.loadCurrent(options).then(() => this.primeDirectionalNeighbor(this.lastDirection()))
  }

  private logNavigationStart(
    source: 'open' | 'navigate' | 'sync',
    previousIndex: number | null,
    targetIndex: number,
  ): void {
    const image = this.images()[targetIndex]
    if (!image) {
      this.log('navigation.start', {
        source,
        previousIndex,
        targetIndex,
        imageId: null,
        direction: previousIndex === null ? 0 : toDirection(targetIndex - previousIndex),
      })
      return
    }

    this.log('navigation.start', {
      source,
      previousIndex,
      currentIndex: this.currentIndex(),
      targetIndex,
      imageId: image.id,
      direction: previousIndex === null ? 0 : toDirection(targetIndex - previousIndex),
      cachedPreview: Boolean(this.store.peekImage(image, ['preview-image'])),
      cachedThumbnail: Boolean(this.store.peekImage(image, ['thumbnail-image'])),
      inFlightPreview: this.store.hasInFlightAsset(image, 'preview-image'),
      debug: this.store.getDebugSnapshot(),
    })
  }

  private logPanelSnapshot(
    snapshot: GalleryPanelSnapshot,
    hasPreviewSrc: boolean,
    hasThumbnailSrc: boolean,
  ): void {
    const reason = getGalleryPanelSnapshotDebugReason({
      hasPreviewSrc,
      hasThumbnailSrc,
      loading: snapshot.loading,
      error: snapshot.error,
    })
    const logKey = JSON.stringify({
      role: snapshot.role,
      imageIndex: snapshot.imageIndex,
      imageId: snapshot.imageId,
      hasPreviewSrc,
      hasThumbnailSrc,
      loading: snapshot.loading,
      hasError: Boolean(snapshot.error),
      reason,
    })
    const stateKey = `${snapshot.role}:${snapshot.imageIndex ?? 'none'}`
    if (this.lastPanelSnapshotDebugKeys.get(stateKey) === logKey) {
      return
    }

    this.lastPanelSnapshotDebugKeys.set(stateKey, logKey)
    this.log('panel.snapshot', {
      role: snapshot.role,
      imageIndex: snapshot.imageIndex,
      imageId: snapshot.imageId,
      hasPreviewSrc,
      hasThumbnailSrc,
      loading: snapshot.loading,
      hasError: Boolean(snapshot.error),
      reason,
      debug: this.store.getDebugSnapshot(),
    })
  }

  private scheduleDerivativePrewarm(): void {
    const images = this.images()
    const displayWindow = this.displayWindow()
    const targets = displayWindow.derivativePrewarmIds
      .map((imageId) => images.find((image) => image.id === imageId))
      .filter((image): image is GalleryImage => Boolean(image))

    this.cancelDerivativePrewarm()
    if (targets.length === 0) {
      return
    }

    const controller = new AbortController()
    const token = ++this.derivativePrewarmToken
    this.derivativePrewarmController = controller

    this.log('derivative-prewarm.start', {
      token,
      imageIds: targets.map((image) => image.id),
      physicalSlotCount: displayWindow.physicalSlots.length,
    })

    void this.finishDerivativePrewarm(
      Promise.allSettled(targets.map((image) => this.prewarmDerivativeForImage(image, controller.signal))),
      token,
      targets,
    )
  }

  private async finishNeighborLoad(
    load: Promise<unknown>,
    image: GalleryImage,
    token: number,
    targetIndex: number,
    startedAt: number,
  ): Promise<void> {
    let status: 'success' | 'error' = 'success'
    try {
      await wrap(load)
    } catch (error) {
      if (!isAbortError(error)) {
        status = 'error'
        if (token === this.neighborLoadToken) {
          this.setPanelError(image.id, getErrorMessage(error))
        }
        this.warn('prime-neighbor.error', {
          token,
          targetIndex,
          imageId: image.id,
          dtMs: getImageGalleryDebugDurationMs(startedAt),
          error: formatImageGalleryDebugError(error),
        })
      }
    }

    if (token === this.neighborLoadToken) {
      this.retainResources()
      this.log('prime-neighbor.done', {
        token,
        status,
        targetIndex,
        imageId: image.id,
        dtMs: getImageGalleryDebugDurationMs(startedAt),
        debug: this.store.getDebugSnapshot(),
      })
    } else {
      this.log('prime-neighbor.stale-token', {
        token,
        status: 'stale',
        neighborLoadToken: this.neighborLoadToken,
        targetIndex,
        imageId: image.id,
        dtMs: getImageGalleryDebugDurationMs(startedAt),
      })
    }
    this.syncResourceState()
  }

  private async finishThumbnailLoad(load: Promise<unknown>): Promise<void> {
    try {
      await wrap(load)
    } catch {
      // Thumbnail failures are reflected by the resource store.
    }
    this.retainResources()
    this.syncResourceState()
  }

  private async finishThumbnailRefresh(
    load: Promise<unknown>,
    imageId: number,
    assetKey: GalleryAssetKey,
  ): Promise<void> {
    try {
      await wrap(load)
    } catch (error) {
      this.warn('thumbnail-render-error.refresh-failed', {
        imageId,
        assetKey,
        error: formatImageGalleryDebugError(error),
      })
    }
    this.retainResources()
    this.syncResourceState()
  }

  private async finishDerivativePrewarm(
    prewarm: Promise<unknown>,
    token: number,
    targets: readonly GalleryImage[],
  ): Promise<void> {
    await wrap(prewarm)
    if (this.derivativePrewarmToken !== token) {
      this.log('derivative-prewarm.stale-token', {
        token,
        derivativePrewarmToken: this.derivativePrewarmToken,
      })
      return
    }

    this.derivativePrewarmController = null
    this.log('derivative-prewarm.done', {
      token,
      imageIds: targets.map((image) => image.id),
    })
  }

  private async prewarmDerivativeForImage(image: GalleryImage, signal: AbortSignal): Promise<void> {
    const intentId = `gallery-prewarm:${image.id}:${image.lastModified ?? 0}`
    const handledUploaded = await this.prewarmUploadedDerivativeWhenVisible(image, {
      variant: 'preview-image',
      signal,
      intentId: `gallery-uploaded-prewarm:${image.id}:${image.lastModified ?? 0}`,
    })

    if (handledUploaded) {
      return
    }

    await this.prewarmDerivative(image, {
      variant: 'preview-image',
      signal,
      intentId,
    })
  }

  private cancelDerivativePrewarm(): void {
    this.derivativePrewarmToken += 1
    const controller = this.derivativePrewarmController
    if (!controller) {
      return
    }

    controller.abort()
    this.derivativePrewarmController = null
  }

  private resolveNeighborDirection(direction: NavigationDirection): NavigationDirection {
    const index = this.currentIndex()
    if (direction !== 0 && this.images()[index + direction]) {
      return direction
    }
    if (this.images()[index + 1]) {
      return 1
    }
    if (this.images()[index - 1]) {
      return -1
    }
    return 0
  }

  private retainResources() {
    const retainKeys = new Set<GalleryAssetKey>()
    const images = this.images()
    for (const imageId of this.getPreparedRetentionIds()) {
      const image = images.find((candidate) => candidate.id === imageId)
      if (image) {
        retainKeys.add(getGalleryAssetKey(image, 'preview-image'))
      }
    }

    const {centerIndex, visibleRadius} = this.thumbnailWindowState()
    for (const index of getWindowIndices(
      images.length,
      centerIndex,
      visibleRadius + THUMBNAIL_PRELOAD_RADIUS,
    )) {
      const image = images[index]
      if (image) {
        retainKeys.add(getGalleryAssetKey(image, 'thumbnail-image'))
      }
    }

    this.store.retain(retainKeys)
    this.syncResourceState()
  }

  private rememberCurrentPreviewRetention(): void {
    const image = this.images()[this.currentIndex()]
    if (image) {
      this.rememberPreviewRetention(image.id)
    }
  }

  private rememberPreviewRetention(imageId: number): void {
    const next = [
      imageId,
      ...this.recentPreviewRetentionIds().filter((retainedImageId) => retainedImageId !== imageId),
    ].slice(0, RECENT_PREVIEW_RETENTION_LIMIT)
    this.recentPreviewRetentionIds.set(next)
  }

  private forgetPreviewRetention(imageId: number): void {
    const next = this.recentPreviewRetentionIds().filter((retainedImageId) => retainedImageId !== imageId)
    if (next.length !== this.recentPreviewRetentionIds().length) {
      this.recentPreviewRetentionIds.set(next)
    }
  }

  private pruneRecentPreviewRetention(images: readonly GalleryImage[]): void {
    const imageIds = new Set(images.map((image) => image.id))
    const next = this.recentPreviewRetentionIds().filter((imageId) => imageIds.has(imageId))
    if (next.length !== this.recentPreviewRetentionIds().length) {
      this.recentPreviewRetentionIds.set(next)
    }
  }

  private pruneThumbnailRenderRefreshAttempts(images: readonly GalleryImage[]): void {
    const keys = new Set(images.map((image) => getGalleryAssetKey(image, 'thumbnail-image')))
    for (const key of [...this.thumbnailRenderRefreshAttempts.keys()]) {
      if (!keys.has(key)) {
        this.thumbnailRenderRefreshAttempts.delete(key)
      }
    }
  }

  private getPreparedRetentionIds(): number[] {
    const ids = new Set<number>()
    for (const imageId of this.displayWindow().preparedRetentionIds) {
      ids.add(imageId)
    }
    for (const imageId of this.recentPreviewRetentionIds()) {
      ids.add(imageId)
    }
    return [...ids]
  }

  private getDisplayWindowSnapshotFor(
    images: readonly GalleryImage[],
    currentIndex: number,
  ): GalleryDisplayWindowSnapshot {
    const clampedIndex = this.clampIndex(currentIndex, images)
    const slots: GalleryDisplayWindowSnapshot['physicalSlots'] = []
    const addSlot = (
      slotId: GalleryDisplayWindowSnapshot['physicalSlots'][number]['slotId'],
      role: GalleryPanelSnapshot['role'],
      index: number,
    ) => {
      const image = images[index]
      if (!image) {
        return
      }

      slots.push({
        slotId,
        role,
        imageIndex: index,
        imageId: image.id,
      })
    }

    addSlot('previous', 'previous', clampedIndex - 1)
    addSlot('current', 'current', clampedIndex)
    addSlot('next', 'next', clampedIndex + 1)

    return {
      physicalSlots: slots,
      preparedRetentionIds: slots.map((slot) => slot.imageId),
      derivativePrewarmIds: [],
    }
  }

  private clampIndex(index: number, images: readonly GalleryImage[]) {
    if (images.length === 0) {
      return 0
    }
    return Math.max(0, Math.min(index, images.length - 1))
  }

  private clearPanelError(imageId: number) {
    const errors = this.panelErrors()
    if (!(imageId in errors)) {
      return
    }

    const next = {...errors}
    delete next[imageId]
    this.panelErrors.set(next)
  }

  private setPanelError(imageId: number, error: string) {
    this.panelErrors.set({
      ...this.panelErrors(),
      [imageId]: error,
    })
  }

  private clearMissingErrors(images: readonly GalleryImage[]) {
    const validIds = new Set(images.map((image) => image.id))
    const errors = this.panelErrors()
    let changed = false
    const next: Record<number, string> = {}

    for (const [imageId, error] of Object.entries(errors)) {
      const numericId = Number(imageId)
      if (validIds.has(numericId)) {
        next[numericId] = error
      } else {
        changed = true
      }
    }

    if (changed) {
      this.panelErrors.set(next)
    }
  }

  private syncResourceState() {
    const debug = this.buildDebugSnapshot()
    this.loadingImageIds.set(debug.loadingImageIds)
    const nextResourceVersion = this.resourceVersion() + 1
    this.resourceVersion.set(nextResourceVersion)

    const stateLogKey = JSON.stringify({
      cachedAssetCount: debug.cachedAssetCount,
      inFlightCount: debug.inFlightCount,
      objectUrlCount: debug.objectUrlCount,
      loadingImageIds: debug.loadingImageIds,
      rawDisplayLoadCount: debug.rawDisplayLoadCount,
      revokedObjectUrlCount: debug.revokedObjectUrlCount,
    })
    if (stateLogKey !== this.lastResourceStateLogKey) {
      this.lastResourceStateLogKey = stateLogKey
      this.log('resource-state', {
        resourceVersion: nextResourceVersion,
        debug,
      })
    }
  }

  private log(event: string, meta?: Record<string, unknown>): void {
    logImageGalleryDebug('session', event, {
      sessionId: this.debugSessionId,
      ...meta,
    })
  }

  private warn(event: string, meta?: Record<string, unknown>): void {
    warnImageGalleryDebug('session', event, {
      sessionId: this.debugSessionId,
      ...meta,
    })
  }

  private buildDebugSnapshot(): GalleryResourceDebugSnapshot {
    const storeDebug = this.store.getDebugSnapshot()
    const displayWindow = this.displayWindow()

    return {
      ...storeDebug,
      activePhysicalSlots: displayWindow.physicalSlots,
      retainedPreparedSourceIds: this.getPreparedRetentionIds(),
      thumbnailVirtualWindow: this.thumbnailVirtualWindow(),
      prewarmImageIds: displayWindow.derivativePrewarmIds,
    }
  }
}
