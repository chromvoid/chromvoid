/**
 * Logical inline-start edge-back gesture with an acknowledged iOS native path
 * and a touch fallback for Android/web.
 */

import type {TextDirection} from '@project/i18n'

import {directionState} from 'root/i18n'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {isTauriRuntime} from 'root/core/runtime/runtime'
import {tauriInvoke, tauriListen} from 'root/core/transport/tauri/ipc'

import {
  isPointWithinHorizontalEdge,
  resolveInwardHorizontalDistance,
  resolvePhysicalHorizontalEdge,
  resolvePhysicalHorizontalOffset,
  type PhysicalHorizontalEdge,
} from './logical-direction'

type DirectionSubscription = (callback: (direction: TextDirection) => void) => () => void

export interface EdgeSwipeBackOptions {
  /** Logical-edge hit target in px. Default: 40 (fallback mode only). */
  edgeThreshold?: number
  /** Inward distance required to trigger back in px. Default: 80. */
  triggerDistance?: number
  /** Inward movement required to confirm the gesture in px. Default: 10. */
  confirmDistance?: number
  onBack: () => void
  isDisabled?: () => boolean
  getDirection?: () => TextDirection
  subscribeDirection?: DirectionSubscription
}

type NativeEdgeBackConfiguration = {
  configurationId: number
  direction: TextDirection
  edge: PhysicalHorizontalEdge
  enabled: boolean
}

type NativeSwipeEvent = {
  configurationId: number
  direction: TextDirection
  distance: number
  state: 'began' | 'changed' | 'ended' | 'cancelled'
  velocity: number
  y: number
}

const EDGE_SWIPE_INDICATOR_CLASS = 'edge-swipe-back-indicator'
const EDGE_SWIPE_INDICATOR_HIDDEN_CLASS = 'edge-swipe-back-indicator--hidden'
const EDGE_SWIPE_INDICATOR_ANIMATING_CLASS = 'edge-swipe-back-indicator--animating'
const EDGE_SWIPE_INDICATOR_STYLE_ID = 'edge-swipe-back-indicator-style'
const NATIVE_REQUEST_SEQUENCE_KEY = 'chromvoid.native-edge-back-request-sequence'

const readNativeRequestSequence = (): number => {
  try {
    const stored = Number(globalThis.sessionStorage?.getItem(NATIVE_REQUEST_SEQUENCE_KEY))
    if (Number.isSafeInteger(stored) && stored >= 0) return stored
  } catch {
    // A timestamp-based seed still keeps requests monotonic for this module instance.
  }
  return 0
}

let nativeRequestSequence = Math.max(readNativeRequestSequence(), Date.now() * 1_000)

const reserveNativeRequestId = (): number => {
  nativeRequestSequence += 1
  if (!Number.isSafeInteger(nativeRequestSequence)) {
    throw new Error('Native edge-back request sequence exceeded the safe integer range')
  }
  try {
    globalThis.sessionStorage?.setItem(NATIVE_REQUEST_SEQUENCE_KEY, String(nativeRequestSequence))
  } catch {
    // The module-level sequence remains authoritative while storage is unavailable.
  }
  return nativeRequestSequence
}

function ensureIndicatorStyles() {
  if (document.getElementById(EDGE_SWIPE_INDICATOR_STYLE_ID)) return

  const style = document.createElement('style')
  style.id = EDGE_SWIPE_INDICATOR_STYLE_ID
  style.textContent = `
    .${EDGE_SWIPE_INDICATOR_CLASS} {
      position: fixed;
      inset-block-start: var(--_edge-swipe-y, 0px);
      display: flex;
      inline-size: 40px;
      block-size: 40px;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--cv-alpha-white-20);
      border-radius: 50%;
      background: var(--cv-alpha-white-15);
      opacity: var(--_edge-swipe-opacity, 0);
      transform: translateX(var(--_edge-swipe-offset, 0px)) scale(var(--_edge-swipe-scale, 0.5));
      transition-behavior: allow-discrete;
      z-index: 9999;
      pointer-events: none;
      contain: layout style paint;
    }

    .${EDGE_SWIPE_INDICATOR_CLASS}[data-edge='left'] {
      right: auto;
      left: -20px;
    }

    .${EDGE_SWIPE_INDICATOR_CLASS}[data-edge='right'] {
      right: -20px;
      left: auto;
    }

    .${EDGE_SWIPE_INDICATOR_CLASS}[data-edge='right'] svg {
      transform: scaleX(-1);
    }

    .${EDGE_SWIPE_INDICATOR_CLASS}[data-ready='true'] {
      border-color: var(--cv-alpha-white-30);
      background: var(--cv-alpha-white-30);
    }

    .${EDGE_SWIPE_INDICATOR_CLASS}[data-active='true'] {
      will-change: transform, opacity;
    }

    .${EDGE_SWIPE_INDICATOR_CLASS}.${EDGE_SWIPE_INDICATOR_ANIMATING_CLASS} {
      transition:
        transform var(--cv-duration-normal, 200ms) var(--cv-easing-decelerate, ease-out),
        opacity var(--cv-duration-fast, 150ms) var(--cv-easing-standard, ease-out),
        display var(--cv-duration-normal, 200ms) allow-discrete;
    }

    .${EDGE_SWIPE_INDICATOR_CLASS}.${EDGE_SWIPE_INDICATOR_HIDDEN_CLASS} {
      display: none;
    }

    @media (prefers-reduced-motion: reduce) {
      .${EDGE_SWIPE_INDICATOR_CLASS} {
        transform: none;
      }

      .${EDGE_SWIPE_INDICATOR_CLASS}.${EDGE_SWIPE_INDICATOR_ANIMATING_CLASS} {
        transition-duration: 0ms;
      }
    }
  `
  document.head.appendChild(style)
}

export class EdgeSwipeBack {
  private readonly edgeThreshold: number
  private readonly triggerDistance: number
  private readonly confirmDistance: number
  private readonly onBack: () => void
  private readonly isDisabled: () => boolean
  private readonly getDirection: () => TextDirection
  private readonly subscribeDirection: DirectionSubscription

  private confirmed = false
  private startX = 0
  private startY = 0
  private lastDistance = 0
  private lastY = 0
  private gestureEdge: PhysicalHorizontalEdge = 'left'
  private rafId = 0
  private animateTimeoutId = 0
  private indicator: HTMLElement | null = null
  private touchListenerAttached = false
  private destroyed = false

  private readonly handleStart: (event: TouchEvent) => void
  private readonly handleMove: (event: TouchEvent) => void
  private readonly handleEnd: () => void

  private nativeUnlisten: (() => void) | null = null
  private nativeDirectionUnsubscribe: (() => void) | null = null
  private nativeConfiguration: NativeEdgeBackConfiguration | null = null
  private nativeConfigureGeneration = 0
  private nativeConfigureQueue: Promise<void> = Promise.resolve()
  private nativeGestureDisabled = false

  constructor(
    private readonly element: HTMLElement,
    options: EdgeSwipeBackOptions,
  ) {
    this.edgeThreshold = options.edgeThreshold ?? 40
    this.triggerDistance = options.triggerDistance ?? 80
    this.confirmDistance = options.confirmDistance ?? 10
    this.onBack = options.onBack
    this.isDisabled = options.isDisabled ?? (() => false)
    this.getDirection = options.getDirection ?? (() => directionState())
    this.subscribeDirection =
      options.subscribeDirection ?? ((callback) => directionState.subscribe(callback))

    this.handleStart = this.onTouchStart.bind(this)
    this.handleMove = this.onTouchMove.bind(this)
    this.handleEnd = this.onTouchEnd.bind(this)

    if (isTauriRuntime() && getRuntimeCapabilities().platform === 'ios') {
      this.setupNativeListener()
    } else {
      this.setupTouchListener()
    }
  }

  private setupNativeListener() {
    void (async () => {
      try {
        this.nativeUnlisten = (await tauriListen<NativeSwipeEvent>(
          'edge-swipe:progress',
          (payload) => this.onNativeSwipe(payload),
        )) as () => void
        if (this.destroyed) {
          this.nativeUnlisten()
          this.nativeUnlisten = null
          return
        }

        // Reatom subscriptions call synchronously, so the listener exists before native enablement.
        this.nativeDirectionUnsubscribe = this.subscribeDirection((direction) => {
          this.queueNativeConfiguration(direction)
        })
      } catch {
        const generation = ++this.nativeConfigureGeneration
        await this.fallbackFromNative(this.getDirection(), generation)
      }
    })()
  }

  private queueNativeConfiguration(direction: TextDirection): void {
    const generation = ++this.nativeConfigureGeneration
    this.nativeConfigureQueue = this.nativeConfigureQueue.then(() =>
      this.configureNative(direction, generation),
    )
  }

  private async configureNative(direction: TextDirection, generation: number): Promise<void> {
    if (this.destroyed || generation !== this.nativeConfigureGeneration) return
    const requestId = reserveNativeRequestId()
    try {
      const configuration = await tauriInvoke<NativeEdgeBackConfiguration>(
        'configure_native_edge_back',
        {direction, enabled: true, requestId},
      )
      if (this.destroyed || generation !== this.nativeConfigureGeneration) return
      if (
        configuration.configurationId !== requestId ||
        !configuration.enabled ||
        configuration.direction !== direction
      ) {
        await this.fallbackFromNative(direction, generation)
        return
      }
      this.nativeConfiguration = configuration
    } catch {
      if (this.destroyed || generation !== this.nativeConfigureGeneration) return
      await this.fallbackFromNative(direction, generation)
    }
  }

  private async fallbackFromNative(direction: TextDirection, generation: number): Promise<void> {
    if (generation !== this.nativeConfigureGeneration || this.destroyed) return
    this.nativeConfigureGeneration += 1
    this.nativeConfiguration = null
    this.nativeDirectionUnsubscribe?.()
    this.nativeDirectionUnsubscribe = null
    this.nativeUnlisten?.()
    this.nativeUnlisten = null
    try {
      await tauriInvoke('configure_native_edge_back', {
        direction,
        enabled: false,
        requestId: reserveNativeRequestId(),
      })
    } catch {
      // Older/failed native bridges still fall back to the self-contained touch path.
    }
    if (!this.destroyed) this.setupTouchListener()
  }

  private onNativeSwipe(payload: NativeSwipeEvent): void {
    const configuration = this.nativeConfiguration
    if (
      configuration === null ||
      payload.configurationId !== configuration.configurationId ||
      payload.direction !== configuration.direction
    ) {
      return
    }

    this.gestureEdge = configuration.edge
    switch (payload.state) {
      case 'began': {
        this.nativeGestureDisabled = this.isDisabled()
        if (this.nativeGestureDisabled) {
          this.animateOut()
          return
        }
        this.lastY = payload.y
        this.lastDistance = 0
        this.showIndicator()
        break
      }
      case 'changed':
        if (this.isDisabled()) this.nativeGestureDisabled = true
        if (this.nativeGestureDisabled) {
          this.animateOut()
          return
        }
        this.lastDistance = Math.max(payload.distance, 0)
        this.lastY = payload.y
        this.scheduleUpdate()
        break
      case 'ended':
        if (
          !this.nativeGestureDisabled &&
          !this.isDisabled() &&
          this.lastDistance >= this.triggerDistance
        ) {
          this.onBack()
        }
        this.nativeGestureDisabled = false
        this.animateOut()
        break
      case 'cancelled':
        this.nativeGestureDisabled = false
        this.animateOut()
        break
    }
  }

  private setupTouchListener() {
    if (this.touchListenerAttached) return
    this.touchListenerAttached = true
    this.element.addEventListener('touchstart', this.handleStart, {passive: true})
  }

  private onTouchStart(event: TouchEvent) {
    if (this.isDisabled()) return
    const touch = event.touches[0]
    if (!touch) return

    this.gestureEdge = resolvePhysicalHorizontalEdge('start', this.getDirection())
    if (
      !isPointWithinHorizontalEdge(
        touch.clientX,
        window.innerWidth,
        this.edgeThreshold,
        this.gestureEdge,
      )
    ) {
      return
    }

    this.confirmed = false
    this.startX = touch.clientX
    this.startY = touch.clientY
    this.lastDistance = 0
    this.lastY = touch.clientY

    document.addEventListener('touchmove', this.handleMove, {passive: false})
    document.addEventListener('touchend', this.handleEnd, {passive: true})
    document.addEventListener('touchcancel', this.handleEnd, {passive: true})
  }

  private onTouchMove(event: TouchEvent) {
    if (event.touches.length !== 1) {
      this.cleanupGesture()
      return
    }
    const touch = event.touches[0]
    if (!touch) return

    const distance = resolveInwardHorizontalDistance(this.startX, touch.clientX, this.gestureEdge)
    const deltaY = Math.abs(touch.clientY - this.startY)
    if (!this.confirmed && deltaY > 15) {
      this.cleanupGesture()
      return
    }

    if (!this.confirmed) {
      if (distance < this.confirmDistance) return
      this.confirmed = true
      this.showIndicator()
    }

    event.preventDefault()
    this.lastDistance = distance
    this.lastY = touch.clientY
    this.scheduleUpdate()
  }

  private onTouchEnd() {
    if (this.confirmed && this.lastDistance >= this.triggerDistance) this.onBack()
    this.animateOut()
    this.cleanupGesture()
  }

  private cleanupGesture() {
    document.removeEventListener('touchmove', this.handleMove)
    document.removeEventListener('touchend', this.handleEnd)
    document.removeEventListener('touchcancel', this.handleEnd)
    if (this.rafId) cancelAnimationFrame(this.rafId)
    this.rafId = 0
    this.confirmed = false
  }

  private scheduleUpdate() {
    if (this.rafId) return
    this.rafId = requestAnimationFrame(() => {
      this.rafId = 0
      this.updateVisual(this.lastDistance)
    })
  }

  private ensureIndicator(): HTMLElement {
    if (this.indicator) return this.indicator

    ensureIndicatorStyles()
    const element = document.createElement('div')
    element.className = `${EDGE_SWIPE_INDICATOR_CLASS} ${EDGE_SWIPE_INDICATOR_HIDDEN_CLASS}`
    element.setAttribute('aria-hidden', 'true')

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
    element.appendChild(svg)

    document.body.appendChild(element)
    this.indicator = element
    return element
  }

  private showIndicator() {
    if (this.animateTimeoutId) clearTimeout(this.animateTimeoutId)
    this.animateTimeoutId = 0
    const element = this.ensureIndicator()
    element.classList.remove(
      EDGE_SWIPE_INDICATOR_HIDDEN_CLASS,
      EDGE_SWIPE_INDICATOR_ANIMATING_CLASS,
    )
    element.dataset['active'] = 'true'
    element.dataset['edge'] = this.gestureEdge
    element.dataset['ready'] = 'false'
    element.style.setProperty('--_edge-swipe-opacity', '0')
    element.style.setProperty('--_edge-swipe-y', `${this.lastY - 20}px`)
    element.style.setProperty('--_edge-swipe-offset', '0px')
    element.style.setProperty('--_edge-swipe-scale', '0.5')
  }

  private updateVisual(distance: number) {
    const element = this.indicator
    if (!element) return

    const progress = Math.min(distance / this.triggerDistance, 1)
    const offset = resolvePhysicalHorizontalOffset(
      Math.min(distance, this.triggerDistance + 20),
      this.gestureEdge,
    )
    element.style.setProperty('--_edge-swipe-y', `${this.lastY - 20}px`)
    element.style.setProperty('--_edge-swipe-offset', `${offset}px`)
    element.style.setProperty('--_edge-swipe-scale', String(0.5 + progress * 0.5))
    element.style.setProperty('--_edge-swipe-opacity', String(Math.min(progress * 1.5, 1)))
    element.dataset['ready'] = String(progress >= 1)
  }

  private animateOut() {
    const element = this.indicator
    if (!element || element.classList.contains(EDGE_SWIPE_INDICATOR_HIDDEN_CLASS)) return

    element.classList.add(EDGE_SWIPE_INDICATOR_ANIMATING_CLASS)
    element.style.setProperty(
      '--_edge-swipe-offset',
      `${resolvePhysicalHorizontalOffset(-20, this.gestureEdge)}px`,
    )
    element.style.setProperty('--_edge-swipe-scale', '0.3')
    element.style.setProperty('--_edge-swipe-opacity', '0')
    element.classList.add(EDGE_SWIPE_INDICATOR_HIDDEN_CLASS)

    const hide = () => {
      if (!element.classList.contains(EDGE_SWIPE_INDICATOR_HIDDEN_CLASS)) return
      if (this.animateTimeoutId) clearTimeout(this.animateTimeoutId)
      delete element.dataset['active']
      element.removeEventListener('transitionend', hide)
      this.animateTimeoutId = 0
    }
    element.addEventListener('transitionend', hide, {once: true})
    this.animateTimeoutId = window.setTimeout(hide, 220)
  }

  destroy() {
    this.destroyed = true
    this.nativeConfigureGeneration += 1
    const shouldDisableNative =
      this.nativeDirectionUnsubscribe !== null ||
      this.nativeUnlisten !== null ||
      this.nativeConfiguration !== null
    this.nativeDirectionUnsubscribe?.()
    this.nativeDirectionUnsubscribe = null
    this.nativeUnlisten?.()
    this.nativeUnlisten = null
    if (shouldDisableNative) {
      const direction = this.nativeConfiguration?.direction ?? this.getDirection()
      this.nativeConfigureQueue = this.nativeConfigureQueue.then(async () => {
        try {
          await tauriInvoke('configure_native_edge_back', {
            direction,
            enabled: false,
            requestId: reserveNativeRequestId(),
          })
        } catch {
          // Destruction is best-effort when the native bridge is already unavailable.
        }
      })
      this.nativeConfiguration = null
    }

    if (this.touchListenerAttached) {
      this.element.removeEventListener('touchstart', this.handleStart)
      this.touchListenerAttached = false
    }
    this.cleanupGesture()
    if (this.animateTimeoutId) clearTimeout(this.animateTimeoutId)
    this.animateTimeoutId = 0
    this.indicator?.remove()
    this.indicator = null
  }
}
