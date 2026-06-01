import {computed} from '@reatom/core'
import {openExternalBrowserUrl} from 'root/shared/services/external-browser'
import {logImageGalleryDebug} from '../image-gallery-debug'
import {loadMobileGalleryPhotoMetadata} from './image-gallery-mobile-metadata'
import {
  ImageGalleryMobileGestureModel,
  type GalleryRect,
  type GalleryTouchPoint,
  type SingleTapResult,
  type TouchCancelResult,
  type TouchEndResult,
  type TouchMoveResult,
  type TouchStartResult,
} from './image-gallery-mobile-gesture.model'
import {
  ImageGalleryMobileInfoSheetModel,
  type MobileGalleryPhotoMetadataLoader,
} from './image-gallery-mobile-info-sheet.model'
import {
  ImageGalleryMobileTrackModel,
  type LegacyThumbnailStripFollowRequest,
  type PropsSyncMode,
  type SnapshotResolver,
  type SwipeDirection,
} from './image-gallery-mobile-track.model'
import type {MobileGalleryImageMeta, MobileGalleryInfoSheetDetent} from './image-gallery-mobile.types'

export type {
  CaptureMode,
  DynamicStyleSnapshot,
  GalleryRect,
  GalleryTouchPoint,
  GestureState,
  SingleTapResult,
  TouchCancelResult,
  TouchEndResult,
  TouchMoveResult,
  TouchStartMode,
  TouchStartResult,
} from './image-gallery-mobile-gesture.model'

export {
  ImageGalleryMobileGestureModel,
  MOBILE_GALLERY_DOUBLE_TAP_MS,
  MOBILE_GALLERY_LONG_PRESS_MS,
} from './image-gallery-mobile-gesture.model'

export {ImageGalleryMobileInfoSheetModel} from './image-gallery-mobile-info-sheet.model'
export type {MobileGalleryPhotoMetadataLoader} from './image-gallery-mobile-info-sheet.model'

export type {
  LegacyThumbnailStripFollowRequest,
  MobileGalleryFooterMode,
  MobileGalleryTrackSlot,
  MobileGalleryTrackSlotId,
  MobileGalleryTrackSlotRole,
  MobileGalleryTrackSlotSnapshot,
  PropsSyncMode,
  SwipeDirection,
  ThumbnailStripFollowRequest,
} from './image-gallery-mobile-track.model'

export type MobileGalleryBackAction = 'close-info-sheet' | 'close-viewer'

let mobileGalleryModelDebugSeq = 0

export class ImageGalleryMobileModel {
  private readonly debugModelId = ++mobileGalleryModelDebugSeq
  private readonly trackModel = new ImageGalleryMobileTrackModel()
  private metadataLoader: MobileGalleryPhotoMetadataLoader = loadMobileGalleryPhotoMetadata
  private readonly infoSheetModel = new ImageGalleryMobileInfoSheetModel({
    metadataLoader: (image) => this.metadataLoader(image),
    log: (event, meta) => this.log(event, meta),
  })
  private readonly gestureModel = new ImageGalleryMobileGestureModel({
    getImageCount: () => this.trackModel.state.imageCount(),
    getDisplayIndex: () => this.trackModel.state.displayIndex(),
    getActiveSettleDirection: () => this.trackModel.state.activeSettleDirection(),
    lockTrackSlots: () => this.trackModel.lockTrackSlots(),
    refreshUnlockedSlots: () => this.refreshUnlockedSlots(),
    beginTrackSettling: (direction) => this.trackModel.beginSettling(direction),
    finishTrackSettling: () => this.trackModel.finishSettling(),
    enqueueDirection: (direction, wasSettling) => this.trackModel.enqueueDirection(direction, wasSettling),
    getPrimeTargetsForDirection: (direction, isDirectDrag) =>
      this.trackModel.getPrimeTargetsForDirection(direction, isDirectDrag),
    commitDirectNavigation: (index) => this.commitDirectNavigation(index),
    log: (event, meta) => this.logGestureEvent(event, meta),
  })

  readonly state = {
    imageCount: this.trackModel.state.imageCount,
    routeIndex: this.trackModel.state.routeIndex,
    displayIndex: this.trackModel.state.displayIndex,
    gestureState: this.gestureModel.state.gestureState,
    captureMode: this.gestureModel.state.captureMode,
    activeSettleDirection: this.trackModel.state.activeSettleDirection,
    queuedDirection: this.trackModel.state.queuedDirection,
    queuedDelta: this.trackModel.state.queuedDelta,
    pendingRouteSyncIndices: this.trackModel.state.pendingRouteSyncIndices,
    chromeVisible: this.gestureModel.state.chromeVisible,
    infoSheetOpen: this.infoSheetModel.state.infoSheetOpen,
    infoSheetDetent: this.infoSheetModel.state.infoSheetDetent,
    photoMetadata: this.infoSheetModel.state.photoMetadata,
    photoMetadataLoading: this.infoSheetModel.state.photoMetadataLoading,
    photoMetadataError: this.infoSheetModel.state.photoMetadataError,
    photoMetadataImageKey: this.infoSheetModel.state.photoMetadataImageKey,
    photoMetadataGpsAvailability: this.infoSheetModel.state.photoMetadataGpsAvailability,
    zoomScale: this.gestureModel.state.zoomScale,
    zoomX: this.gestureModel.state.zoomX,
    zoomY: this.gestureModel.state.zoomY,
    dragOffsetX: this.gestureModel.state.dragOffsetX,
    dismissOffsetY: this.gestureModel.state.dismissOffsetY,
    thumbnailFollowRequest: this.trackModel.state.thumbnailFollowRequest,
    pendingThumbnailStripFollow: this.trackModel.state.pendingThumbnailStripFollow,
    trackSlots: this.trackModel.state.trackSlots,
  }

  readonly computed = {
    isZoomed: this.gestureModel.computed.isZoomed,
    footerMode: this.trackModel.computed.footerMode,
    hasPendingLocalNavigation: computed(
      () =>
        this.gestureModel.computed.hasPendingLocalNavigation() ||
        this.state.activeSettleDirection() !== 0 ||
        this.state.queuedDirection() !== 0 ||
        this.state.pendingRouteSyncIndices().length > 0,
      'media.imageGalleryV2.mobile.hasPendingLocalNavigation',
    ),
    dynamicStyles: this.gestureModel.computed.dynamicStyles,
    trackSlots: this.trackModel.computed.trackSlots,
  }

  constructor(metadataLoader: MobileGalleryPhotoMetadataLoader = loadMobileGalleryPhotoMetadata) {
    this.metadataLoader = metadataLoader
  }

  setup(imageCount: number, currentIndex: number, snapshotResolver: SnapshotResolver) {
    this.resetLocalNavigationState()
    const index = this.trackModel.setup(imageCount, currentIndex, snapshotResolver)
    this.showChrome()
    this.log('setup', {
      imageCount,
      requestedIndex: currentIndex,
      displayIndex: index,
      slots: this.getSlotDebugSnapshot(),
    })
  }

  syncFromProps(
    imageCount: number,
    currentIndex: number,
    snapshotResolver: SnapshotResolver,
  ): PropsSyncMode {
    const hasPendingLocalNavigation = this.computed.hasPendingLocalNavigation()
    const previousDisplayIndex = this.state.displayIndex()
    const previousPendingRouteSyncIndices = this.state.pendingRouteSyncIndices()
    const syncResult = this.trackModel.syncFromProps(
      imageCount,
      currentIndex,
      snapshotResolver,
      hasPendingLocalNavigation,
    )
    if (syncResult.mode === 'keep-local') {
      this.showChrome()
      this.log('sync-from-props.keep-local', {
        imageCount,
        currentIndex,
        acknowledgedLocalSync: syncResult.acknowledgedLocalSync,
        slots: this.getSlotDebugSnapshot(),
      })
      return 'keep-local'
    }

    if (syncResult.externalReset) {
      this.log('sync-from-props.external-reset', {
        imageCount,
        currentIndex,
        nextRouteIndex: syncResult.nextRouteIndex,
        displayIndex: previousDisplayIndex,
        pendingRouteSyncIndices: previousPendingRouteSyncIndices,
      })
      this.resetGestureState()
    }

    this.resetZoomState()
    this.showChrome()
    this.log('sync-from-props.external-sync', {
      imageCount,
      currentIndex,
      displayIndex: syncResult.nextRouteIndex,
      slots: this.getSlotDebugSnapshot(),
    })
    return 'external-sync'
  }

  teardown() {
    this.log('teardown', {slots: this.getSlotDebugSnapshot()})
    this.resetLocalNavigationState()
    this.trackModel.teardown()
  }

  beginTouch(touches: GalleryTouchPoint[], now: number): TouchStartResult {
    return this.gestureModel.beginTouch(touches, now, {
      infoSheetOpen: this.state.infoSheetOpen(),
    })
  }

  moveTouch(touches: GalleryTouchPoint[], rect: GalleryRect | null): TouchMoveResult {
    return this.gestureModel.moveTouch(touches, rect)
  }

  endTouch(point: GalleryTouchPoint | null, now: number): TouchEndResult {
    return this.gestureModel.endTouch(point, now)
  }

  cancelTouch(): TouchCancelResult {
    return this.gestureModel.cancelTouch()
  }

  finishSettling() {
    return this.gestureModel.finishSettling()
  }

  commitDirectNavigation(index: number) {
    const targetIndex = this.trackModel.commitDirectNavigation(index, this.computed.hasPendingLocalNavigation())
    if (targetIndex === null) return null

    this.resetZoomState()
    this.showChrome()
    this.log('direct-navigation.commit', {
      targetIndex,
      slots: this.getSlotDebugSnapshot(),
    })
    return targetIndex
  }

  showChrome() {
    this.gestureModel.showChrome()
  }

  toggleChrome() {
    this.gestureModel.toggleChrome()
  }

  openInfoSheet(image?: MobileGalleryImageMeta) {
    this.infoSheetModel.openInfoSheet(image)
    this.showChrome()
  }

  closeInfoSheet() {
    const closed = this.infoSheetModel.closeInfoSheet()
    if (closed) {
      this.showChrome()
    }
    return closed
  }

  handleBack(): MobileGalleryBackAction {
    if (this.closeInfoSheet()) {
      return 'close-info-sheet'
    }

    return 'close-viewer'
  }

  setInfoSheetDetent(detent: MobileGalleryInfoSheetDetent) {
    this.infoSheetModel.setInfoSheetDetent(detent)
  }

  openExternalBrowserUrl(url: string) {
    void openExternalBrowserUrl(url).catch((error: unknown) => {
      this.log('external-url.open-failed', {
        errorName: error instanceof Error ? error.name : typeof error,
      })
    })
  }

  loadInfoSheetMetadata(image: MobileGalleryImageMeta | undefined, options: {forceRetry?: boolean} = {}) {
    this.infoSheetModel.loadInfoSheetMetadata(image, options)
  }

  registerTap(point: GalleryTouchPoint, now: number, rect: GalleryRect | null) {
    return this.gestureModel.registerTap(point, now, rect)
  }

  handleSingleTap(clientX: number, rect: GalleryRect | null): SingleTapResult {
    return this.gestureModel.handleSingleTap(clientX, rect)
  }

  handleLongPressFired(image?: MobileGalleryImageMeta) {
    if (!this.gestureModel.handleLongPressFired(this.state.infoSheetOpen())) {
      return false
    }

    this.openInfoSheet(image)
    return true
  }

  consumeThumbnailFollowRequest() {
    return this.trackModel.consumeThumbnailFollowRequest()
  }

  refreshUnlockedSlots() {
    this.trackModel.refreshUnlockedSlots(this.state.gestureState() === 'idle')
  }

  fillEmptyTrackSlotsIfIdle() {
    this.trackModel.fillEmptyTrackSlotsIfIdle(
      this.state.captureMode() === 'none' && this.state.gestureState() === 'idle',
    )
  }

  handleImageRenderError(imageId: number | null) {
    this.trackModel.handleImageRenderError(imageId)
  }

  beginSettling(direction: SwipeDirection) {
    this.gestureModel.beginSettling(direction)
  }

  getNavigationStripPrimeTargets() {
    return this.trackModel.getNavigationStripPrimeTargets()
  }

  getPrimeTargetsForDirection(direction: SwipeDirection) {
    return this.trackModel.getPrimeTargetsForDirection(direction, this.state.captureMode() === 'drag')
  }

  getPendingThumbnailStripFollow(): LegacyThumbnailStripFollowRequest | null {
    return this.trackModel.getPendingThumbnailStripFollow()
  }

  consumePendingThumbnailStripFollow() {
    this.trackModel.consumePendingThumbnailStripFollow()
  }

  private resetLocalNavigationState() {
    this.gestureModel.resetLocalNavigationState()
    this.infoSheetModel.reset()
    this.trackModel.resetNavigationState()
  }

  private resetGestureState() {
    this.gestureModel.resetGestureState()
    this.trackModel.resetSettleState()
  }

  private resetZoomState() {
    this.gestureModel.resetZoomState()
  }

  private getSlotDebugSnapshot() {
    return this.trackModel.getSlotDebugSnapshot()
  }

  private logGestureEvent(event: string, meta?: Record<string, unknown>): void {
    if (event === 'begin-settling' || event === 'finish-settling.commit') {
      this.log(event, {
        ...meta,
        slots: this.getSlotDebugSnapshot(),
      })
      return
    }

    if (event === 'queue-direction') {
      this.log(event, {
        ...meta,
        queuedDirection: this.state.queuedDirection(),
      })
      return
    }

    this.log(event, meta)
  }

  private log(event: string, meta?: Record<string, unknown>): void {
    logImageGalleryDebug('mobile-model', event, {
      modelId: this.debugModelId,
      routeIndex: this.state.routeIndex(),
      displayIndex: this.state.displayIndex(),
      gestureState: this.state.gestureState(),
      captureMode: this.state.captureMode(),
      activeSettleDirection: this.state.activeSettleDirection(),
      queuedDirection: this.state.queuedDirection(),
      pendingRouteSyncIndices: this.state.pendingRouteSyncIndices(),
      ...meta,
    })
  }
}
