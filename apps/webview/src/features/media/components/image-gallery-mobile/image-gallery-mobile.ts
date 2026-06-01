import {nothing} from 'lit'
import {CVBottomSheet} from '@chromvoid/uikit/components/cv-bottom-sheet'
import {CVMenuButton, type CVMenuButtonInputEvent} from '@chromvoid/uikit/components/cv-menu-button'
import {CVMenuItem} from '@chromvoid/uikit/components/cv-menu-item'
import {html} from '@chromvoid/uikit/reatom-lit'
import {i18n} from 'root/i18n'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {canShareFiles} from 'root/shared/services/share'
import {transientBackModel} from 'root/shared/services/transient-back.model'
import {logImageGalleryDebug} from '../image-gallery-debug'
import {ImageGalleryBase} from '../image-gallery-v2/image-gallery-base'
import type {ImageViewerAction} from '../image-gallery-v2/gallery.types'
import {MobileGalleryDynamicStyleController} from './image-gallery-mobile-dynamic-style-controller'
import {MobileGallerySessionBridge} from './image-gallery-mobile-session-bridge'
import {ImageGalleryMobileThumbnailStrip} from './image-gallery-mobile-thumbnail-strip'
import {MobileGalleryThumbnailFollowCoordinator} from './image-gallery-mobile-thumbnail-follow-coordinator'
import {ImageGalleryMobileTrack} from './image-gallery-mobile-track'
import {MobileTrackAnimationController} from './image-gallery-mobile-track-animation-controller'
import {MobileGalleryTrackCoordinator} from './image-gallery-mobile-track-coordinator'
import {
  MOBILE_GALLERY_DOUBLE_TAP_MS,
  MOBILE_GALLERY_LONG_PRESS_MS,
  ImageGalleryMobileModel,
  type GalleryRect,
  type GalleryTouchPoint,
} from './image-gallery-mobile.model'
import {
  renderMobileGalleryFooter,
  renderMobileGalleryHeader,
  renderMobileGalleryInfoSheet,
} from './image-gallery-mobile-render'
import {imageGalleryMobileStyles} from './image-gallery-mobile.styles'
import type {
  MobileGalleryImageMeta,
  MobileGalleryInfoSheetDetent,
  MobileGalleryRenderActions,
} from './image-gallery-mobile.types'

let imageGalleryMobileDebugSeq = 0

export class ImageGalleryMobile extends ImageGalleryBase {
  static define() {
    CVBottomSheet.define()
    CVMenuButton.define()
    CVMenuItem.define()
    ImageGalleryMobileTrack.define()
    ImageGalleryMobileThumbnailStrip.define()

    if (!customElements.get('image-gallery-mobile')) {
      customElements.define('image-gallery-mobile', this)
    }
  }

  static styles = imageGalleryMobileStyles

  private readonly mobileModel = new ImageGalleryMobileModel()
  private readonly trackAnimation = new MobileTrackAnimationController()
  private readonly thumbnailFollowCoordinator = new MobileGalleryThumbnailFollowCoordinator({
    mobileModel: this.mobileModel,
    getHost: () => this.getThumbnailStripHost(),
    log: (event, meta) => this.log(event, meta),
  })
  private readonly trackCoordinator = new MobileGalleryTrackCoordinator({
    mobileModel: this.mobileModel,
    trackAnimation: this.trackAnimation,
    getTrackHost: () => this.getTrackHost(),
    navigate: (index) => this.model.navigate(index, {syncThumbnailCenter: false}),
    emitNavigate: (index) => this.emitNavigate(index),
    primeNavigationStrip: () => this.primeNavigationStrip(),
    refreshTrackSlots: () => this.mobileModel.refreshUnlockedSlots(),
    startThumbnailFollow: () => this.thumbnailFollowCoordinator.start(),
    log: (event, meta) => this.log(event, meta),
  })
  private readonly dynamicStyleController = new MobileGalleryDynamicStyleController({
    host: this,
    getStyles: () => this.mobileModel.computed.dynamicStyles(),
    subscribeStyles: (listener) => this.mobileModel.computed.dynamicStyles.subscribe(listener),
  })
  private readonly sessionBridge = new MobileGallerySessionBridge({
    getOpen: () => this.open,
    getImageCount: () => this.mobileModel.state.imageCount(),
    getSnapshots: () => this.model.session.panelSnapshots(),
    subscribeSnapshots: (listener) => this.model.session.panelSnapshots.subscribe(listener),
    fillEmptyTrackSlotsIfIdle: () => this.mobileModel.fillEmptyTrackSlotsIfIdle(),
  })
  private longPressTimer: ReturnType<typeof setTimeout> | null = null
  private singleTapTimer: ReturnType<typeof setTimeout> | null = null
  private unregisterTransientBack?: () => void
  private readonly debugComponentId = ++imageGalleryMobileDebugSeq

  override connectedCallback() {
    this.log('connected')
    super.connectedCallback()
    this.unregisterTransientBack = transientBackModel.register(() => this.handleTransientBack(), {
      priority: 90,
    })
    this.trackAnimation.setTrackResolver(() => this.getTrackElement())
    this.dynamicStyleController.connect()
    this.sessionBridge.connect()
  }

  override disconnectedCallback() {
    this.log('disconnected')
    this.unregisterTransientBack?.()
    this.unregisterTransientBack = undefined
    this.dynamicStyleController.disconnect()
    this.sessionBridge.disconnect()
    super.disconnectedCallback()
  }

  override updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties)
    if (this.open && this.infoSheetOpen) {
      this.mobileModel.loadInfoSheetMetadata(this.currentImage)
    }
    void this.trackCoordinator.flushAfterRender()
    void this.thumbnailFollowCoordinator.flushAfterRender()
  }

  protected override afterGallerySetup() {
    this.mobileModel.setup(this.images.length, this.currentIndex, this.captureVisibleTrackSlot.bind(this))
    this.primeNavigationStrip()
    this.log('setup', {
      imageCount: this.images.length,
      currentIndex: this.currentIndex,
      displayIndex: this.displayIndex,
      resourceDebug: this.model.getDebugSnapshot(),
    })
  }

  protected override beforeGalleryTeardown() {
    this.log('teardown', {resourceDebug: this.model.getDebugSnapshot()})
    this.trackCoordinator.teardown()
    this.thumbnailFollowCoordinator.teardown()
    this.clearLongPressTimer()
    this.clearSingleTapTimer()
    this.mobileModel.teardown()
  }

  protected override onImagesUpdated() {
    const syncMode = this.mobileModel.syncFromProps(
      this.images.length,
      this.currentIndex,
      this.captureVisibleTrackSlot.bind(this),
    )
    this.log('images-updated', {
      syncMode,
      imageCount: this.images.length,
      currentIndex: this.currentIndex,
      displayIndex: this.displayIndex,
      resourceDebug: this.model.getDebugSnapshot(),
    })

    if (syncMode === 'keep-local') {
      this.model.syncImages(this.images, this.displayIndex)
      this.mobileModel.fillEmptyTrackSlotsIfIdle()
      this.primeNavigationStrip()
      return
    }

    super.onImagesUpdated()
    this.mobileModel.fillEmptyTrackSlotsIfIdle()
    this.primeNavigationStrip()
  }

  private get currentImage(): MobileGalleryImageMeta | undefined {
    return this.images[this.displayIndex] as MobileGalleryImageMeta | undefined
  }

  private get displayIndex() {
    return this.mobileModel.state.displayIndex()
  }

  private get gestureState() {
    return this.mobileModel.state.gestureState()
  }

  private get queuedDelta() {
    return this.mobileModel.state.queuedDelta()
  }

  private get activeSettleDirection() {
    return this.mobileModel.state.activeSettleDirection()
  }

  private get pendingRouteSyncIndices() {
    return this.mobileModel.state.pendingRouteSyncIndices()
  }

  private get infoSheetOpen() {
    return this.mobileModel.state.infoSheetOpen()
  }

  private get infoSheetDetent() {
    return this.mobileModel.state.infoSheetDetent()
  }

  private get chromeVisible() {
    return this.mobileModel.state.chromeVisible()
  }

  private captureVisibleTrackSlot(index: number) {
    return this.model.captureVisibleTrackSlot(index)
  }

  private clearLongPressTimer() {
    if (!this.longPressTimer) return
    clearTimeout(this.longPressTimer)
    this.longPressTimer = null
  }

  private clearSingleTapTimer() {
    if (!this.singleTapTimer) return
    clearTimeout(this.singleTapTimer)
    this.singleTapTimer = null
  }

  private scheduleLongPress() {
    this.clearLongPressTimer()
    this.longPressTimer = setTimeout(() => {
      this.longPressTimer = null
      if (!this.mobileModel.handleLongPressFired(this.currentImage)) {
        return
      }

      if ('vibrate' in navigator) {
        navigator.vibrate(18)
      }
    }, MOBILE_GALLERY_LONG_PRESS_MS)
  }

  private scheduleTapAction(point: GalleryTouchPoint) {
    const tapKind = this.mobileModel.registerTap(point, Date.now(), this.getMainRectData())
    if (tapKind === 'double') {
      this.clearSingleTapTimer()
      return
    }

    this.clearSingleTapTimer()
    this.singleTapTimer = setTimeout(() => {
      this.singleTapTimer = null
      this.handleSingleTap(point.clientX)
    }, MOBILE_GALLERY_DOUBLE_TAP_MS)
  }

  private handleSingleTap(clientX: number) {
    const result = this.mobileModel.handleSingleTap(clientX, this.getMainRectData())
    this.log('single-tap', {
      clientX,
      navigateTo: result.navigateTo,
      edgeNudge: result.edgeNudge,
    })
    if (result.navigateTo !== null) {
      this.thumbnailFollowCoordinator.start()
      this.model.navigate(result.navigateTo, {syncThumbnailCenter: false})
      this.emitNavigate(result.navigateTo)
      this.primeNavigationStrip()
      return
    }

    if (result.edgeNudge !== 0) {
      this.trackCoordinator.playEdgeNudge(result.edgeNudge)
    }
  }

  private handleSheetClose() {
    this.mobileModel.closeInfoSheet()
  }

  private handleTransientBack() {
    if (!this.open) {
      return false
    }

    const action = this.mobileModel.handleBack()
    if (action === 'close-viewer') {
      this.close('back')
    }

    return true
  }

  private handleExternalUrlClick(event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()

    const href = (event.currentTarget as HTMLAnchorElement | null)?.href
    if (!href) return
    this.mobileModel.openExternalBrowserUrl(href)
  }

  private handleInfoSheetSurfaceChange(
    event: CustomEvent<{open: boolean; detent?: MobileGalleryInfoSheetDetent}>,
  ) {
    if (typeof event.detail.open !== 'boolean') return
    if (!event.detail.open) {
      this.mobileModel.closeInfoSheet()
      return
    }
    if (event.detail.detent) {
      this.mobileModel.setInfoSheetDetent(event.detail.detent)
    }
  }

  private handleCloseClick() {
    this.close('control')
  }

  private handleAction(action: ImageViewerAction) {
    const currentImage = this.currentImage
    if (!currentImage) return

    this.emitAction(action, currentImage.id)
    this.mobileModel.closeInfoSheet()
  }

  private handleHeaderInfoClick() {
    this.mobileModel.showChrome()
    this.mobileModel.openInfoSheet(this.currentImage)
  }

  private resetHeaderMenuSelection(menu: CVMenuButton) {
    menu.value = ''
    for (const item of menu.querySelectorAll<HTMLElementTagNameMap['cv-menu-item']>('cv-menu-item')) {
      item.selected = false
      item.active = false
    }
  }

  private handleHeaderMenuInput(event: CVMenuButtonInputEvent) {
    const action = event.detail.value
    if (!action) return

    const menu = event.currentTarget as CVMenuButton
    if (event.detail.open) {
      this.resetHeaderMenuSelection(menu)
      return
    }

    menu.open = false
    this.resetHeaderMenuSelection(menu)
    if (this.isViewerAction(action)) {
      this.handleAction(action)
    }
  }

  private isViewerAction(action: string | undefined): action is ImageViewerAction {
    return (
      action === 'share' ||
      action === 'save-to-gallery' ||
      action === 'download' ||
      action === 'open-external' ||
      action === 'delete'
    )
  }

  private getMainElement() {
    return this.renderRoot.querySelector<HTMLElement>('.main')
  }

  private getMainRectData(): GalleryRect | null {
    const rect = this.getMainElement()?.getBoundingClientRect()
    if (!rect) {
      return null
    }

    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    }
  }

  private toTouchPoints(touches: TouchList) {
    return Array.from(touches, (touch) => ({
      clientX: touch.clientX,
      clientY: touch.clientY,
    }))
  }

  private toChangedTouchPoint(event?: TouchEvent) {
    const touch = event?.changedTouches?.[0]
    if (!touch) return null

    return {
      clientX: touch.clientX,
      clientY: touch.clientY,
    }
  }

  private primeTargets(indices: number[]) {
    this.log('prime-targets', {indices})
    for (const index of indices) {
      this.model.primeImage(index)
    }
  }

  private primeNavigationStrip() {
    this.log('prime-navigation-strip', {displayIndex: this.displayIndex})
    this.model.primeThumbnailVirtualWindow(this.displayIndex)
  }

  private getTrackHost() {
    return this.renderRoot.querySelector<ImageGalleryMobileTrack>('image-gallery-mobile-track')
  }

  private getTrackElement() {
    return this.getTrackHost()?.getTrackElement() ?? null
  }

  private getThumbnailStripHost() {
    return this.renderRoot.querySelector<ImageGalleryMobileThumbnailStrip>(
      'image-gallery-mobile-thumbnail-strip',
    )
  }

  private handleTouchStart(e: TouchEvent) {
    const points = this.toTouchPoints(e.touches)
    const firstTouch = points[0]
    if (!firstTouch) return

    const result = this.mobileModel.beginTouch(points, Date.now())
    this.log('touch-start', {
      mode: result.mode,
      touches: points.length,
      displayIndex: this.displayIndex,
    })

    if (result.mode !== 'ignore') {
      e.stopPropagation()
    }

    if (result.clearLongPress) {
      this.clearLongPressTimer()
    }
    if (result.clearSingleTap) {
      this.clearSingleTapTimer()
    }
    if (result.mode === 'drag') {
      this.trackAnimation.beginDrag()
    }
    if (result.mode === 'pinch') {
      this.trackAnimation.resetPosition()
    }
    if (result.scheduleLongPress) {
      this.scheduleLongPress()
    }
  }

  private handleTouchMove(e: TouchEvent) {
    const result = this.mobileModel.moveTouch(this.toTouchPoints(e.touches), this.getMainRectData())

    if (result.clearLongPress) {
      this.clearLongPressTimer()
    }
    if (result.clearSingleTap) {
      this.clearSingleTapTimer()
    }
    if (result.primeTargets.length > 0) {
      this.primeTargets(result.primeTargets)
    }
    if (result.preventDefault && e.cancelable) {
      e.preventDefault()
    }
    if (result.preventDefault) {
      e.stopPropagation()
    }
    if (result.shouldSyncDragTrack) {
      this.trackAnimation.syncDrag(this.mobileModel.state.dragOffsetX())
    }
    if (result.resetDragTrack) {
      this.trackAnimation.resetPosition()
    }
  }

  private handleTouchEnd(e?: TouchEvent) {
    if (this.mobileModel.state.captureMode() === 'none') return

    e?.stopPropagation()
    this.clearLongPressTimer()

    this.trackAnimation.cancelDragSync()

    const result = this.mobileModel.endTouch(this.toChangedTouchPoint(e), Date.now())
    this.log('touch-end', {
      close: result.close,
      hasScheduledTap: Boolean(result.scheduleTap),
      startSettle: result.startSettle,
      primeTargets: result.primeTargets,
    })
    if (result.primeTargets.length > 0) {
      this.primeTargets(result.primeTargets)
    }
    if (result.close) {
      this.close('swipe-dismiss')
      return
    }
    if (result.scheduleTap) {
      this.scheduleTapAction(result.scheduleTap)
      return
    }
    if (result.startSettle !== null) {
      this.trackCoordinator.startSettle(result.startSettle)
    }
  }

  private handleTouchCancel() {
    this.clearLongPressTimer()

    this.trackAnimation.cancelDragSync()

    const result = this.mobileModel.cancelTouch()
    this.log('touch-cancel', {startSettle: result.startSettle})
    if (result.startSettle !== null) {
      this.trackCoordinator.startSettle(result.startSettle)
    }
  }

  private handleThumbnailClick(index: number) {
    const targetIndex = this.mobileModel.commitDirectNavigation(index)
    this.log('thumbnail-click', {index, targetIndex})
    if (targetIndex === null) {
      return
    }

    this.thumbnailFollowCoordinator.start()
    this.model.navigate(targetIndex, {syncThumbnailCenter: false})
    this.emitNavigate(targetIndex)
    this.primeNavigationStrip()
  }

  private handleThumbnailSelect(event: CustomEvent<{index: number}>) {
    this.handleThumbnailClick(event.detail.index)
  }

  private handleTrackImageError(event: CustomEvent<{imageId: number | null; sourceUrl: string | null}>) {
    this.model.handleImageRenderError(event.detail.imageId, event.detail.sourceUrl)
    this.mobileModel.handleImageRenderError(event.detail.imageId)
    this.mobileModel.fillEmptyTrackSlotsIfIdle()
  }

  private renderTrack() {
    return html`
      <image-gallery-mobile-track
        .images=${this.images as MobileGalleryImageMeta[]}
        .mobileModel=${this.mobileModel}
        @image-render-error=${this.handleTrackImageError}
      ></image-gallery-mobile-track>
    `
  }

  private renderSharePendingOverlay() {
    if (!this.sharePending) return nothing
    const label = i18n('file-manager:preparing-file' as any)

    return html`
      <div class="share-pending-overlay" role="status" aria-live="polite">
        <div class="share-pending-status">
          <cv-spinner size="s" label=${label}></cv-spinner>
          <span>${label}</span>
        </div>
      </div>
    `
  }

  private getRenderActions(): MobileGalleryRenderActions {
    return {
      onClose: this.handleCloseClick,
      onHeaderInfo: this.handleHeaderInfoClick,
      onHeaderMenuInput: this.handleHeaderMenuInput,
      onSheetClose: this.handleSheetClose,
      onExternalUrlClick: this.handleExternalUrlClick,
      onInfoSheetSurfaceChange: this.handleInfoSheetSurfaceChange,
      onThumbnailSelect: this.handleThumbnailSelect,
    }
  }

  protected render() {
    if (!this.open) return nothing

    const currentImage = this.currentImage
    const showSaveToGallery = getRuntimeCapabilities().supports_photo_library_save
    const showShare = canShareFiles()
    const actions = this.getRenderActions()
    const images = this.images as MobileGalleryImageMeta[]

    return html`
      <div
        class="overlay"
        role="dialog"
        aria-modal="true"
        aria-label=${currentImage?.name || i18n('media:image-viewer' as any)}
      >
        ${renderMobileGalleryHeader(
          {
            currentImage,
            imageCount: this.images.length,
            displayIndex: this.displayIndex,
            chromeVisible: this.chromeVisible,
            showSaveToGallery,
            showShare,
            sharePending: this.sharePending,
          },
          actions,
        )}

        <div
          class="main"
          aria-busy=${String(this.sharePending)}
          @touchstart=${this.handleTouchStart}
          @touchmove=${this.handleTouchMove}
          @touchend=${this.handleTouchEnd}
          @touchcancel=${this.handleTouchCancel}
        >
          <div class="viewport">${this.renderTrack()}</div>
          ${this.renderSharePendingOverlay()}
        </div>

        <div class="footer ${this.chromeVisible ? '' : 'hidden'}">
          ${renderMobileGalleryFooter({
            footerMode: this.mobileModel.computed.footerMode(),
            images,
            galleryModel: this.model,
            mobileModel: this.mobileModel,
            actions,
          })}
        </div>
        ${renderMobileGalleryInfoSheet(
          {
            currentImage,
            open: this.infoSheetOpen,
            detent: this.infoSheetDetent,
            photoMetadata: this.mobileModel.state.photoMetadata(),
            photoMetadataLoading: this.mobileModel.state.photoMetadataLoading(),
            photoMetadataError: this.mobileModel.state.photoMetadataError(),
            gpsAvailability: this.mobileModel.state.photoMetadataGpsAvailability(),
          },
          actions,
        )}
      </div>
    `
  }

  private log(event: string, meta?: Record<string, unknown>): void {
    logImageGalleryDebug('mobile', event, {
      componentId: this.debugComponentId,
      currentIndex: this.currentIndex,
      displayIndex: this.displayIndex,
      gestureState: this.gestureState,
      activeSettleDirection: this.activeSettleDirection,
      queuedDelta: this.queuedDelta,
      pendingRouteSyncIndices: this.pendingRouteSyncIndices,
      ...meta,
    })
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'image-gallery-mobile': ImageGalleryMobile
  }
}
