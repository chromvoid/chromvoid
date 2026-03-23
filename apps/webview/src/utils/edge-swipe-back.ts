/**
 * Edge-swipe-back gesture handler with dual-mode support:
 *
 * - **iOS native mode**: Uses `UIScreenEdgePanGestureRecognizer` via Tauri events
 *   (`edge-swipe:progress`). The native recognizer handles edge detection and
 *   haptic feedback; JS only renders the visual indicator.
 *
 * - **Touch fallback mode** (Android, web): Touch-based detection with 40px edge
 *   threshold. touchstart on the element (passive), touchmove/end on document
 *   only during active gesture.
 *
 * The indicator element is created once and reused (display toggle).
 * Visual updates are batched via requestAnimationFrame.
 */

import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {isTauriRuntime} from 'root/core/runtime/runtime'
import {tauriInvoke, tauriListen} from 'root/core/transport/tauri/ipc'

export interface EdgeSwipeBackOptions {
  /** Max starting X to qualify as edge swipe (px). Default: 40 (fallback mode only) */
  edgeThreshold?: number
  /** Horizontal distance required to trigger back (px). Default: 80 */
  triggerDistance?: number
  /** Horizontal movement to confirm this is a swipe, not a scroll (px). Default: 10 */
  confirmDistance?: number
  /** Called when edge-swipe completes past trigger distance */
  onBack: () => void
  /** If returns true, edge-swipe is suppressed (e.g. sidebar is open) */
  isDisabled?: () => boolean
}

type NativeSwipeEvent = {
  state: 'began' | 'changed' | 'ended' | 'cancelled'
  deltaX: number
  y: number
  velocityX: number
}

export class EdgeSwipeBack {
  private readonly edgeThreshold: number
  private readonly triggerDistance: number
  private readonly confirmDistance: number
  private readonly onBack: () => void
  private readonly isDisabled: () => boolean

  private tracking = false
  /** True once horizontal movement exceeds confirmDistance — only then we show indicator and preventDefault */
  private confirmed = false
  private startX = 0
  private startY = 0
  private lastDeltaX = 0
  private lastY = 0
  private rafId = 0
  private animateTimeoutId = 0
  private indicator: HTMLElement | null = null

  private readonly handleStart: (e: TouchEvent) => void
  private readonly handleMove: (e: TouchEvent) => void
  private readonly handleEnd: () => void

  private nativeUnlisten: (() => void) | null = null
  private nativeSetupDone = false

  constructor(
    private readonly element: HTMLElement,
    options: EdgeSwipeBackOptions,
  ) {
    this.edgeThreshold = options.edgeThreshold ?? 40
    this.triggerDistance = options.triggerDistance ?? 80
    this.confirmDistance = options.confirmDistance ?? 10
    this.onBack = options.onBack
    this.isDisabled = options.isDisabled ?? (() => false)

    this.handleStart = this.onTouchStart.bind(this)
    this.handleMove = this.onTouchMove.bind(this)
    this.handleEnd = this.onTouchEnd.bind(this)

    if (isTauriRuntime() && getRuntimeCapabilities().platform === 'ios') {
      this.setupNativeListener()
    } else {
      this.setupTouchListener()
    }
  }

  // ── Native iOS mode (Tauri events from UIScreenEdgePanGestureRecognizer) ──

  private setupNativeListener() {
    void (async () => {
      try {
        // Setup native gesture recognizer (idempotent on Rust side)
        if (!this.nativeSetupDone) {
          this.nativeSetupDone = true
          await tauriInvoke('setup_native_gestures')
        }

        this.nativeUnlisten = (await tauriListen<NativeSwipeEvent>('edge-swipe:progress', (payload) => {
          if (this.isDisabled()) {
            if (payload.state === 'began' || payload.state === 'changed') {
              // Still animateOut in case indicator was shown
              this.animateOut()
            }
            return
          }

          switch (payload.state) {
            case 'began':
              this.lastY = payload.y
              this.lastDeltaX = 0
              this.showIndicator()
              break
            case 'changed':
              this.lastDeltaX = Math.max(payload.deltaX, 0)
              this.lastY = payload.y
              this.scheduleUpdate()
              break
            case 'ended':
              if (this.lastDeltaX >= this.triggerDistance) {
                this.onBack()
              }
              this.animateOut()
              break
            case 'cancelled':
              this.animateOut()
              break
          }
        })) as () => void
      } catch {
        // Fall back to touch listener if native setup fails
        this.setupTouchListener()
      }
    })()
  }

  // ── Touch fallback mode (non-iOS platforms) ──

  private setupTouchListener() {
    // Only touchstart on the element — passive, zero perf cost
    this.element.addEventListener('touchstart', this.handleStart, {passive: true})
  }

  private onTouchStart(e: TouchEvent) {
    if (this.isDisabled()) return
    const touch = e.touches[0]
    if (!touch || touch.clientX >= this.edgeThreshold) return

    this.tracking = true
    this.confirmed = false
    this.startX = touch.clientX
    this.startY = touch.clientY
    this.lastDeltaX = 0
    this.lastY = touch.clientY

    // Attach move/end/cancel on document only during gesture
    document.addEventListener('touchmove', this.handleMove, {passive: false})
    document.addEventListener('touchend', this.handleEnd, {passive: true})
    document.addEventListener('touchcancel', this.handleEnd, {passive: true})
  }

  private onTouchMove(e: TouchEvent) {
    if (e.touches.length !== 1) {
      this.cleanup()
      return
    }
    const touch = e.touches[0]
    if (!touch) return

    const deltaX = touch.clientX - this.startX
    const deltaY = Math.abs(touch.clientY - this.startY)

    // If vertical movement dominates before confirmation — this is a scroll, bail
    if (!this.confirmed && deltaY > 15) {
      this.cleanup()
      return
    }

    // Clamp: don't cancel on slight leftward drift, just clamp to 0
    const clampedDelta = Math.max(deltaX, 0)

    // Confirmation phase: need enough horizontal movement before we commit
    if (!this.confirmed) {
      if (clampedDelta < this.confirmDistance) return
      this.confirmed = true
      this.showIndicator()
    }

    e.preventDefault()
    this.lastDeltaX = clampedDelta
    this.lastY = touch.clientY
    this.scheduleUpdate()
  }

  private onTouchEnd() {
    if (this.confirmed && this.lastDeltaX >= this.triggerDistance) {
      this.onBack()
    }
    this.animateOut()
    this.cleanup()
  }

  /** Remove document listeners and reset state */
  private cleanup() {
    document.removeEventListener('touchmove', this.handleMove)
    document.removeEventListener('touchend', this.handleEnd)
    document.removeEventListener('touchcancel', this.handleEnd)

    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
      this.rafId = 0
    }
    this.tracking = false
    this.confirmed = false
  }

  private scheduleUpdate() {
    if (this.rafId) return
    this.rafId = requestAnimationFrame(() => {
      this.rafId = 0
      this.updateVisual(this.lastDeltaX)
    })
  }

  // ── Indicator (created once, reused) ──

  private ensureIndicator(): HTMLElement {
    if (this.indicator) return this.indicator

    const el = document.createElement('div')
    el.style.cssText = `
      position: fixed;
      top: 0;
      left: -20px;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--cv-alpha-white-15);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid var(--cv-alpha-white-20);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      pointer-events: none;
      contain: layout style paint;
    `
    // Chevron SVG — created once
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('width', '18')
    svg.setAttribute('height', '18')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('fill', 'none')
    svg.setAttribute('stroke', 'var(--cv-alpha-white-70)')
    svg.setAttribute('stroke-width', '2.5')
    svg.setAttribute('stroke-linecap', 'round')
    svg.setAttribute('stroke-linejoin', 'round')
    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline')
    polyline.setAttribute('points', '15 18 9 12 15 6')
    svg.appendChild(polyline)
    el.appendChild(svg)

    document.body.appendChild(el)
    this.indicator = el
    return el
  }

  private showIndicator() {
    if (this.animateTimeoutId) {
      clearTimeout(this.animateTimeoutId)
      this.animateTimeoutId = 0
    }
    const el = this.ensureIndicator()
    el.style.transition = 'none'
    el.style.display = 'flex'
    el.style.willChange = 'transform, opacity'
    el.style.opacity = '0'
    el.style.top = `${this.lastY - 20}px`
    el.style.transform = 'translateX(0) scale(0.5)'
  }

  private updateVisual(deltaX: number) {
    const el = this.indicator
    if (!el) return

    const progress = Math.min(deltaX / this.triggerDistance, 1)
    const tx = Math.min(deltaX, this.triggerDistance + 20)
    const scale = 0.5 + progress * 0.5
    const opacity = Math.min(progress * 1.5, 1)
    const ready = progress >= 1

    el.style.top = `${this.lastY - 20}px`
    el.style.transform = `translateX(${tx}px) scale(${scale})`
    el.style.opacity = String(opacity)
    el.style.background = ready ? 'var(--cv-alpha-white-30)' : 'var(--cv-alpha-white-15)'
    el.style.borderColor = ready ? 'var(--cv-alpha-white-30)' : 'var(--cv-alpha-white-20)'
  }

  private animateOut() {
    const el = this.indicator
    if (!el || el.style.display === 'none') return

    el.style.transition = 'transform 200ms ease-out, opacity 150ms ease-out'
    el.style.transform = 'translateX(-20px) scale(0.3)'
    el.style.opacity = '0'

    const hide = () => {
      el.style.display = 'none'
      el.style.willChange = 'auto'
      el.removeEventListener('transitionend', hide)
      this.animateTimeoutId = 0
    }
    el.addEventListener('transitionend', hide, {once: true})
    // Fallback in case transitionend doesn't fire
    this.animateTimeoutId = window.setTimeout(hide, 220)
  }

  destroy() {
    // Native mode cleanup
    this.nativeUnlisten?.()
    this.nativeUnlisten = null

    // Touch mode cleanup
    this.element.removeEventListener('touchstart', this.handleStart)
    this.cleanup()

    if (this.animateTimeoutId) {
      clearTimeout(this.animateTimeoutId)
      this.animateTimeoutId = 0
    }
    if (this.indicator) {
      this.indicator.remove()
      this.indicator = null
    }
  }
}
