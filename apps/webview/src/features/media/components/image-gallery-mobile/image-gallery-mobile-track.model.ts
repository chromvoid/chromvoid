import {atom, computed} from '@reatom/core'

const NAVIGATION_STRIP_PRIME_RADIUS = 2

export type SwipeDirection = -1 | 0 | 1
export type MobileGalleryFooterMode = 'none' | 'thumbnail-strip'
export type PropsSyncMode = 'keep-local' | 'external-sync'

export type ThumbnailStripFollowRequest = {
  index: number
  mode: 'auto' | 'smooth'
}

export type LegacyThumbnailStripFollowRequest = {
  index: number
  behavior: ScrollBehavior
}

export type MobileGalleryTrackSlotId = 'left' | 'center' | 'right'
export type MobileGalleryTrackSlotRole = 'previous' | 'current' | 'next'

export type MobileGalleryTrackSlotSnapshot = {
  imageIndex: number
  imageId: number | null
  src: string | null
  loading: boolean
  error?: string | null
}

export type MobileGalleryTrackSlot = {
  slotId: MobileGalleryTrackSlotId
  role: MobileGalleryTrackSlotRole
  imageIndex: number | null
  imageId: number | null
  src: string | null
  loading: boolean
  loaderVisible: boolean
  error: string | null
  locked: boolean
}

export type SnapshotResolver = (index: number) => MobileGalleryTrackSlotSnapshot | null

export type TrackPropsSyncResult = {
  mode: PropsSyncMode
  acknowledgedLocalSync: boolean
  externalReset: boolean
  nextRouteIndex: number
}

type MobileGalleryTrackSlotViewStateInput = Omit<MobileGalleryTrackSlot, 'loaderVisible'> & {
  loaderVisible?: boolean
}

export class ImageGalleryMobileTrackModel {
  private readonly imageCountAtom = atom(0, 'media.imageGalleryV2.mobile.imageCount')
  private readonly routeIndexAtom = atom(0, 'media.imageGalleryV2.mobile.routeIndex')
  private readonly displayIndexAtom = atom(0, 'media.imageGalleryV2.mobile.displayIndex')
  private readonly activeSettleDirectionAtom = atom<SwipeDirection>(
    0,
    'media.imageGalleryV2.mobile.activeSettleDirection',
  )
  private readonly queuedDirectionAtom = atom<SwipeDirection>(0, 'media.imageGalleryV2.mobile.queuedDirection')
  private readonly pendingRouteSyncIndicesAtom = atom<number[]>(
    [],
    'media.imageGalleryV2.mobile.pendingRouteSyncIndices',
  )
  private readonly thumbnailFollowRequestAtom = atom<ThumbnailStripFollowRequest | null>(
    null,
    'media.imageGalleryV2.mobile.thumbnailFollowRequest',
  )
  private readonly trackSlotsAtom = atom<MobileGalleryTrackSlot[]>([], 'media.imageGalleryV2.mobile.trackSlots')

  readonly state = {
    imageCount: this.imageCountAtom,
    routeIndex: this.routeIndexAtom,
    displayIndex: this.displayIndexAtom,
    activeSettleDirection: this.activeSettleDirectionAtom,
    queuedDirection: this.queuedDirectionAtom,
    queuedDelta: this.queuedDirectionAtom,
    pendingRouteSyncIndices: this.pendingRouteSyncIndicesAtom,
    thumbnailFollowRequest: this.thumbnailFollowRequestAtom,
    pendingThumbnailStripFollow: this.thumbnailFollowRequestAtom,
    trackSlots: this.trackSlotsAtom,
  }

  readonly computed = {
    footerMode: computed<MobileGalleryFooterMode>(() => {
      if (this.state.imageCount() <= 1) return 'none'
      return 'thumbnail-strip'
    }, 'media.imageGalleryV2.mobile.footerMode'),
    trackSlots: computed(() => this.state.trackSlots(), 'media.imageGalleryV2.mobile.trackSlots'),
  }

  private snapshotResolver: SnapshotResolver | null = null

  setup(imageCount: number, currentIndex: number, snapshotResolver: SnapshotResolver) {
    this.snapshotResolver = snapshotResolver
    this.state.imageCount.set(Math.max(0, imageCount))
    this.resetNavigationState()

    const index = this.clampIndex(currentIndex)
    this.state.routeIndex.set(index)
    this.state.displayIndex.set(index)
    this.rebuildSlots(index)
    this.requestThumbnailFollow(index, 'auto')
    return index
  }

  syncFromProps(
    imageCount: number,
    currentIndex: number,
    snapshotResolver: SnapshotResolver,
    hasPendingLocalNavigation: boolean,
  ): TrackPropsSyncResult {
    this.snapshotResolver = snapshotResolver
    this.state.imageCount.set(Math.max(0, imageCount))

    const nextRouteIndex = this.clampIndex(currentIndex)
    this.state.routeIndex.set(nextRouteIndex)

    const acknowledgedLocalSync = this.consumePendingRouteSync(nextRouteIndex)
    if (
      acknowledgedLocalSync ||
      (hasPendingLocalNavigation && nextRouteIndex === this.state.displayIndex())
    ) {
      return {
        mode: 'keep-local',
        acknowledgedLocalSync,
        externalReset: false,
        nextRouteIndex,
      }
    }

    const externalReset = hasPendingLocalNavigation && nextRouteIndex !== this.state.displayIndex()
    if (externalReset) {
      this.resetSettleState()
      this.state.pendingRouteSyncIndices.set([])
    }

    this.state.displayIndex.set(nextRouteIndex)
    this.rebuildSlots(nextRouteIndex)
    this.requestThumbnailFollow(nextRouteIndex, 'auto')
    return {
      mode: 'external-sync',
      acknowledgedLocalSync,
      externalReset,
      nextRouteIndex,
    }
  }

  teardown() {
    this.snapshotResolver = null
    this.resetNavigationState()
    this.state.imageCount.set(0)
    this.state.routeIndex.set(0)
    this.state.displayIndex.set(0)
    this.state.trackSlots.set([])
  }

  resetNavigationState() {
    this.resetSettleState()
    this.state.pendingRouteSyncIndices.set([])
    this.state.thumbnailFollowRequest.set(null)
  }

  resetSettleState() {
    this.state.activeSettleDirection.set(0)
    this.state.queuedDirection.set(0)
  }

  finishSettling() {
    const direction = this.state.activeSettleDirection()
    this.state.activeSettleDirection.set(0)

    if (direction === 0) {
      this.refreshUnlockedSlots()
      return {committedIndex: null, nextDirection: 0 as SwipeDirection}
    }

    const committedIndex = this.clampIndex(this.state.displayIndex() + direction)
    this.state.displayIndex.set(committedIndex)
    this.queueRouteSync(committedIndex)
    this.requestThumbnailFollow(committedIndex, 'smooth')
    this.rotateSlots(direction)

    const nextDirection = this.dequeueNextDirection()
    return {committedIndex, nextDirection}
  }

  commitDirectNavigation(index: number, hasPendingLocalNavigation: boolean) {
    if (hasPendingLocalNavigation) {
      return null
    }

    const targetIndex = this.clampIndex(index)
    if (targetIndex === this.state.displayIndex()) {
      return null
    }

    this.state.displayIndex.set(targetIndex)
    this.queueRouteSync(targetIndex)
    this.requestThumbnailFollow(targetIndex, 'smooth')
    this.rebuildSlots(targetIndex)
    return targetIndex
  }

  beginSettling(direction: SwipeDirection) {
    this.state.activeSettleDirection.set(direction)
    this.lockTrackSlots()
  }

  enqueueDirection(direction: SwipeDirection, wasSettling: boolean) {
    if (direction === 0) {
      return {startSettle: null, primeTargets: []}
    }

    if (!wasSettling && this.state.activeSettleDirection() === 0) {
      return {startSettle: direction, primeTargets: []}
    }

    const inFlightTarget = this.getInFlightTargetIndex()
    const finalTarget = this.clampIndex(inFlightTarget + this.state.queuedDirection() + direction)
    const nextQueuedDirection = Math.sign(finalTarget - inFlightTarget) as SwipeDirection
    this.state.queuedDirection.set(nextQueuedDirection)
    const primeTargets = this.collectTargetRange(inFlightTarget, finalTarget)

    return {
      startSettle: null,
      primeTargets,
    }
  }

  getNavigationStripPrimeTargets() {
    const targets: number[] = []
    const currentIndex = this.state.displayIndex()

    for (
      let index = currentIndex - NAVIGATION_STRIP_PRIME_RADIUS;
      index <= currentIndex + NAVIGATION_STRIP_PRIME_RADIUS;
      index += 1
    ) {
      if (index >= 0 && index < this.state.imageCount()) {
        targets.push(index)
      }
    }

    return targets
  }

  getPrimeTargetsForDirection(direction: SwipeDirection, isDirectDrag: boolean) {
    if (direction === 0) return []

    if (isDirectDrag) {
      return this.toPrimeTargets([this.state.displayIndex() + direction])
    }

    const inFlightTarget = this.getInFlightTargetIndex()
    const finalTarget = this.clampIndex(inFlightTarget + this.state.queuedDirection() + direction)
    return this.collectTargetRange(inFlightTarget, finalTarget)
  }

  getPendingThumbnailStripFollow(): LegacyThumbnailStripFollowRequest | null {
    const request = this.state.thumbnailFollowRequest()
    if (!request) {
      return null
    }

    return {
      index: request.index,
      behavior: request.mode,
    }
  }

  consumePendingThumbnailStripFollow() {
    this.state.thumbnailFollowRequest.set(null)
  }

  consumeThumbnailFollowRequest() {
    const request = this.state.thumbnailFollowRequest()
    this.state.thumbnailFollowRequest.set(null)
    return request
  }

  refreshUnlockedSlots(isInteractionIdle = true) {
    const slots = this.state.trackSlots()
    if (slots.length === 0) {
      return
    }

    let changed = false
    const nextSlots = slots.map((slot) => {
      if (slot.locked && (!isInteractionIdle || this.state.activeSettleDirection() !== 0)) {
        return slot
      }

      if (slot.role === 'current' && slot.src) {
        if (slot.locked) return slot
        changed = true
        return {...slot, locked: true}
      }

      const snapshot = this.resolveSlotSnapshot(slot.imageIndex)
      if (slot.locked && slot.src && snapshot?.imageId === slot.imageId) {
        return slot
      }

      const nextSlot = this.createSlotFromSnapshot(slot.slotId, slot.role, slot.imageIndex, snapshot, false)
      if (this.areSlotsEqual(slot, nextSlot)) {
        return slot
      }

      changed = true
      return nextSlot
    })

    if (changed) {
      this.state.trackSlots.set(nextSlots)
    }
  }

  fillEmptyTrackSlotsIfIdle(isInteractionIdle = true) {
    if (
      !isInteractionIdle ||
      this.state.activeSettleDirection() !== 0 ||
      this.state.queuedDirection() !== 0
    ) {
      return
    }

    this.refreshUnlockedSlots()
  }

  handleImageRenderError(imageId: number | null) {
    if (imageId === null) {
      return
    }

    const slots = this.state.trackSlots()
    let changed = false
    const nextSlots = slots.map((slot) => {
      if (slot.imageId !== imageId) {
        return slot
      }

      const snapshot = this.resolveSlotSnapshot(slot.imageIndex)
      const nextSlot = this.createSlotFromSnapshot(slot.slotId, slot.role, slot.imageIndex, snapshot, false)
      if (this.areSlotsEqual(slot, nextSlot)) {
        return slot
      }

      changed = true
      return nextSlot
    })

    if (changed) {
      this.state.trackSlots.set(nextSlots)
    }
  }

  getSlotDebugSnapshot() {
    return this.state.trackSlots().map((slot) => ({
      slotId: slot.slotId,
      role: slot.role,
      imageIndex: slot.imageIndex,
      imageId: slot.imageId,
      hasSrc: Boolean(slot.src),
      loading: slot.loading,
      loaderVisible: slot.loaderVisible,
      locked: slot.locked,
    }))
  }

  lockTrackSlots() {
    const slots = this.state.trackSlots()
    if (slots.length === 0 || slots.every((slot) => slot.locked)) {
      return
    }

    this.state.trackSlots.set(slots.map((slot) => ({...slot, locked: true})))
  }

  private rebuildSlots(displayIndex: number) {
    this.state.trackSlots.set([
      this.createSlot('left', 'previous', displayIndex - 1, false),
      this.createSlot('center', 'current', displayIndex, false),
      this.createSlot('right', 'next', displayIndex + 1, false),
    ])
    this.refreshUnlockedSlots()
  }

  private rotateSlots(direction: SwipeDirection) {
    const [previous, current, next] = this.state.trackSlots()
    if (!previous || !current || !next || direction === 0) {
      this.rebuildSlots(this.state.displayIndex())
      this.lockTrackSlots()
      return
    }

    if (direction > 0) {
      this.state.trackSlots.set([
        this.withSlotRole(current, 'previous', true),
        this.withPromotedCurrentSlot(next),
        this.withSlotTarget(previous, 'next', this.state.displayIndex() + 1, true),
      ])
      return
    }

    this.state.trackSlots.set([
      this.withSlotTarget(next, 'previous', this.state.displayIndex() - 1, true),
      this.withPromotedCurrentSlot(previous),
      this.withSlotRole(current, 'next', true),
    ])
  }

  private createSlot(
    slotId: MobileGalleryTrackSlotId,
    role: MobileGalleryTrackSlotRole,
    imageIndex: number,
    locked: boolean,
  ): MobileGalleryTrackSlot {
    const normalizedIndex = this.normalizeImageIndex(imageIndex)
    const snapshot = this.resolveSlotSnapshot(normalizedIndex)
    return this.createSlotFromSnapshot(slotId, role, normalizedIndex, snapshot, locked)
  }

  private createSlotFromSnapshot(
    slotId: MobileGalleryTrackSlotId,
    role: MobileGalleryTrackSlotRole,
    imageIndex: number | null,
    snapshot: MobileGalleryTrackSlotSnapshot | null,
    locked: boolean,
  ): MobileGalleryTrackSlot {
    return this.withSlotViewState({
      slotId,
      role,
      imageIndex,
      imageId: snapshot?.imageId ?? null,
      src: snapshot?.src ?? null,
      loading: snapshot?.loading ?? false,
      error: snapshot?.error ?? null,
      locked,
    })
  }

  private withSlotRole(
    slot: MobileGalleryTrackSlot,
    role: MobileGalleryTrackSlotRole,
    locked: boolean,
  ): MobileGalleryTrackSlot {
    if (slot.role === role && slot.locked === locked) {
      return slot
    }

    return this.withSlotViewState({
      ...slot,
      role,
      locked,
    })
  }

  private withPromotedCurrentSlot(slot: MobileGalleryTrackSlot): MobileGalleryTrackSlot {
    const promoted = this.withSlotRole(slot, 'current', true)
    if (promoted.src || promoted.error) {
      return promoted
    }

    const snapshot = this.resolveSlotSnapshot(promoted.imageIndex)
    if (!snapshot || snapshot.imageId !== promoted.imageId) {
      return promoted
    }

    const refreshed = this.createSlotFromSnapshot(
      promoted.slotId,
      'current',
      promoted.imageIndex,
      snapshot,
      true,
    )
    return this.areSlotsEqual(promoted, refreshed) ? promoted : refreshed
  }

  private withSlotTarget(
    slot: MobileGalleryTrackSlot,
    role: MobileGalleryTrackSlotRole,
    imageIndex: number,
    locked: boolean,
  ): MobileGalleryTrackSlot {
    return this.withSlotViewState({
      ...slot,
      role,
      imageIndex: this.normalizeImageIndex(imageIndex),
      locked,
    })
  }

  private withSlotViewState(slot: MobileGalleryTrackSlotViewStateInput): MobileGalleryTrackSlot {
    return {
      ...slot,
      loaderVisible: this.getSlotLoaderVisible(slot),
    }
  }

  private getSlotLoaderVisible(
    slot: Pick<MobileGalleryTrackSlot, 'role' | 'src' | 'loading' | 'error'>,
  ) {
    return slot.role === 'current' && slot.loading && !slot.src && !slot.error
  }

  private resolveSlotSnapshot(imageIndex: number | null) {
    if (imageIndex === null) {
      return null
    }

    return this.snapshotResolver?.(imageIndex) ?? null
  }

  private areSlotsEqual(left: MobileGalleryTrackSlot, right: MobileGalleryTrackSlot) {
    return (
      left.slotId === right.slotId &&
      left.role === right.role &&
      left.imageIndex === right.imageIndex &&
      left.imageId === right.imageId &&
      left.src === right.src &&
      left.loading === right.loading &&
      left.loaderVisible === right.loaderVisible &&
      left.error === right.error &&
      left.locked === right.locked
    )
  }

  private dequeueNextDirection(): SwipeDirection {
    const direction = this.state.queuedDirection()
    this.state.queuedDirection.set(0)
    return direction
  }

  private requestThumbnailFollow(index: number, mode: ThumbnailStripFollowRequest['mode']) {
    if (this.computed.footerMode() !== 'thumbnail-strip') {
      this.state.thumbnailFollowRequest.set(null)
      return
    }

    this.state.thumbnailFollowRequest.set({
      index: this.clampIndex(index),
      mode,
    })
  }

  private consumePendingRouteSync(index: number) {
    const pending = this.state.pendingRouteSyncIndices()
    const position = pending.indexOf(index)
    if (position < 0) {
      return false
    }

    this.state.pendingRouteSyncIndices.set(pending.slice(position + 1))
    return true
  }

  private queueRouteSync(index: number) {
    const pending = this.state.pendingRouteSyncIndices()
    if (pending.at(-1) === index) {
      return
    }

    this.state.pendingRouteSyncIndices.set([...pending, index])
  }

  private clampIndex(index: number) {
    if (this.state.imageCount() === 0) return 0
    return Math.max(0, Math.min(index, this.state.imageCount() - 1))
  }

  private normalizeImageIndex(index: number) {
    if (index < 0 || index >= this.state.imageCount()) {
      return null
    }

    return index
  }

  private toPrimeTargets(indexes: number[]) {
    return indexes.filter((index) => index >= 0 && index < this.state.imageCount())
  }

  private collectTargetRange(startIndex: number, endIndex: number) {
    if (startIndex === endIndex) return []

    const step = endIndex > startIndex ? 1 : -1
    const targets: number[] = []
    for (let index = startIndex + step; index !== endIndex + step; index += step) {
      if (index >= 0 && index < this.state.imageCount()) {
        targets.push(index)
      }
    }

    return targets
  }

  private getInFlightTargetIndex() {
    return this.clampIndex(this.state.displayIndex() + this.state.activeSettleDirection())
  }
}
