import type {SwipeDirection} from './image-gallery-mobile.model'
import {
  getImageGalleryDebugDurationMs,
  getImageGalleryDebugTime,
  logImageGalleryDebug,
} from '../image-gallery-debug'

let mobileTrackAnimationDebugSeq = 0

export class MobileTrackAnimationController {
  private rafId = 0
  private trackEl: HTMLElement | null = null
  private settleFallbackTimer: ReturnType<typeof setTimeout> | null = null
  private settleTransitionCleanup: (() => void) | null = null
  private resolveTrack: () => HTMLElement | null = () => null
  private readonly debugControllerId = ++mobileTrackAnimationDebugSeq

  setTrackResolver(resolveTrack: () => HTMLElement | null) {
    this.resolveTrack = resolveTrack
  }

  syncDrag(offsetX: number) {
    if (this.rafId) return

    this.trackEl = this.ensureTrackElement()
    if (!this.trackEl) return

    this.rafId = requestAnimationFrame(() => {
      this.rafId = 0
      if (!this.trackEl) {
        return
      }

      this.trackEl.style.transform = `translateX(calc(-33.333% + ${offsetX}px))`
    })
  }

  cancelDragSync() {
    if (!this.rafId) {
      return
    }

    cancelAnimationFrame(this.rafId)
    this.rafId = 0
  }

  beginDrag() {
    this.ensureTrackElement()?.classList.remove('settling')
  }

  resetPosition() {
    const track = this.ensureTrackElement()
    if (!track) return
    track.classList.remove('settling')
    track.style.transform = 'translateX(-33.333%)'
  }

  forceLayout() {
    this.ensureTrackElement()?.getBoundingClientRect()
  }

  startSettle(direction: SwipeDirection, onFinish: () => void) {
    this.clearSettleWatcher()
    const track = this.ensureTrackElement()

    if (!track) {
      this.log('settle.no-track', {direction})
      onFinish()
      return
    }

    const startedAt = getImageGalleryDebugTime()
    const targetTransform =
      direction < 0 ? 'translateX(0%)' : direction > 0 ? 'translateX(-66.666%)' : 'translateX(-33.333%)'

    this.log('settle.start', {direction, targetTransform})
    track.classList.add('settling')
    track.style.transform = targetTransform

    let finished = false
    const finish = (reason: 'transitionend' | 'fallback') => {
      if (finished) {
        return
      }

      finished = true
      this.log('settle.finish', {
        direction,
        reason,
        dtMs: getImageGalleryDebugDurationMs(startedAt),
      })
      this.clearSettleWatcher()
      onFinish()
    }

    const onEnd = (event: Event) => {
      if (event.target !== track) return
      finish('transitionend')
    }

    track.addEventListener('transitionend', onEnd)
    this.settleTransitionCleanup = () => {
      track.removeEventListener('transitionend', onEnd)
      this.settleTransitionCleanup = null
    }
    this.settleFallbackTimer = setTimeout(() => finish('fallback'), 350)
  }

  playEdgeNudge(direction: SwipeDirection, onSettleStart: () => void) {
    if (direction === 0) {
      return
    }

    const track = this.ensureTrackElement()
    if (!track) {
      this.log('edge-nudge.no-track', {direction})
      return
    }

    this.log('edge-nudge.start', {direction})
    track.classList.add('settling')
    track.style.transform =
      direction < 0 ? 'translateX(calc(-33.333% + 18px))' : 'translateX(calc(-33.333% - 18px))'

    requestAnimationFrame(onSettleStart)
  }

  teardown() {
    this.cancelDragSync()
    this.clearSettleWatcher()
    this.trackEl = null
  }

  private ensureTrackElement() {
    if (!this.trackEl?.isConnected) {
      this.trackEl = this.resolveTrack()
    }

    return this.trackEl
  }

  private clearSettleWatcher() {
    if (this.settleFallbackTimer) {
      clearTimeout(this.settleFallbackTimer)
      this.settleFallbackTimer = null
    }

    this.settleTransitionCleanup?.()
  }

  private log(event: string, meta?: Record<string, unknown>): void {
    logImageGalleryDebug('mobile-track-animation', event, {
      controllerId: this.debugControllerId,
      ...meta,
    })
  }
}
