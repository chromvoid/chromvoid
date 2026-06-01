import {isStartupContentReady, STARTUP_CONTENT_READY_EVENT} from '../bootstrap/startup-readiness'
import {markStartupTimeline} from '../bootstrap/startup-timeline'

const DEFAULT_MIN_VISIBLE_MS = 1_600
const DEFAULT_CONTENT_READY_TIMEOUT_MS = 10_000
const DEFAULT_EXIT_DURATION_MS = 220
const REDUCED_MOTION_EXIT_DURATION_MS = 120
const NATIVE_HANDOFF_PAINT_FRAMES = 6
const IMAGE_READY_TIMEOUT_MS = 700

export interface SplashLogoOptions {
  contentReadyTimeoutMs?: number
  exitDurationMs?: number
  minVisibleMs?: number
  reducedMotion?: boolean
  root?: HTMLElement | null
  startedAt?: number
}

export interface SplashLogoController {
  destroy(): void
  release(): void
}

export function startSplashLogo(options: SplashLogoOptions = {}): SplashLogoController {
  const root = options.root ?? document.getElementById('loading-native')
  if (!root || !document.documentElement.hasAttribute('loading')) {
    markStartupTimeline('web.splash.controller-skip', {
      hasLoading: document.documentElement.hasAttribute('loading'),
      hasRoot: Boolean(root),
    })
    return noopController
  }

  markStartupTimeline('web.splash.controller-start')
  return new BrowserSplashLogoController(root, options)
}

const noopController: SplashLogoController = {
  destroy() {},
  release() {},
}

class BrowserSplashLogoController implements SplashLogoController {
  private readonly contentReadyTimeoutMs: number
  private readonly exitDurationMs: number
  private readonly minVisibleMs: number
  private readonly nativeSplash: boolean
  private readonly reducedMotion: boolean
  private readonly root: HTMLElement
  private readonly startedAt: number
  private destroyed = false
  private contentReadyTimerId = 0
  private exitTimerId = 0
  private releaseTimerId = 0
  private released = false
  private minVisibleElapsed = false
  private nativeReadyNotified = false
  private nativeReleaseNotified = false
  private startupContentReady = false
  private startupContentReadyHandler?: () => void

  constructor(root: HTMLElement, options: SplashLogoOptions) {
    this.root = root
    this.contentReadyTimeoutMs = options.contentReadyTimeoutMs ?? DEFAULT_CONTENT_READY_TIMEOUT_MS
    this.minVisibleMs = options.minVisibleMs ?? DEFAULT_MIN_VISIBLE_MS
    this.nativeSplash = hasNativeSplashBridge()
    this.reducedMotion = options.reducedMotion ?? prefersReducedMotion()
    this.startedAt = options.startedAt ?? 0
    this.exitDurationMs = this.nativeSplash
      ? 0
      : this.reducedMotion
        ? Math.min(options.exitDurationMs ?? DEFAULT_EXIT_DURATION_MS, REDUCED_MOTION_EXIT_DURATION_MS)
        : (options.exitDurationMs ?? DEFAULT_EXIT_DURATION_MS)

    this.root.dataset['splashState'] = 'visible'
    this.root.dataset['splashMode'] = this.nativeSplash ? 'native' : 'web'
    this.root.dataset['splashMotion'] = this.reducedMotion ? 'reduced' : 'active'
    markStartupTimeline('web.splash.controller-created', {
      contentReadyTimeoutMs: this.contentReadyTimeoutMs,
      minVisibleMs: this.minVisibleMs,
      mode: this.nativeSplash ? 'native' : 'web',
      reducedMotion: this.reducedMotion,
    })
    this.scheduleNativeReadySignal()
    this.scheduleStartupContentReady()
    this.scheduleRelease()
  }

  release(): void {
    if (this.destroyed || this.released) return
    this.released = true
    window.clearTimeout(this.releaseTimerId)
    this.root.dataset['splashState'] = 'exiting'
    markStartupTimeline('web.splash.release-start', {
      exitDurationMs: this.exitDurationMs,
      nativeSplash: this.nativeSplash,
    })
    if (this.exitDurationMs <= 0) {
      this.finishRelease()
      return
    }
    this.exitTimerId = window.setTimeout(() => {
      this.finishRelease()
    }, this.exitDurationMs)
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.teardownStartupContentReady()
    window.clearTimeout(this.releaseTimerId)
    window.clearTimeout(this.exitTimerId)
  }

  private scheduleRelease(): void {
    const elapsed = Math.max(0, performance.now() - this.startedAt)
    const delay = Math.max(0, this.minVisibleMs - elapsed)
    markStartupTimeline('web.splash.min-visible-scheduled', {
      delayMs: Math.round(delay),
      elapsedMs: Math.round(elapsed),
    })
    this.releaseTimerId = window.setTimeout(() => {
      this.minVisibleElapsed = true
      markStartupTimeline('web.splash.min-visible-elapsed')
      this.releaseWhenReady()
    }, delay)
  }

  private scheduleStartupContentReady(): void {
    if (isStartupContentReady()) {
      this.startupContentReady = true
      markStartupTimeline('web.splash.content-ready-already-marked')
      return
    }

    const markReady = (source: 'event' | 'timeout') => {
      if (this.destroyed || this.released) return
      this.startupContentReady = true
      markStartupTimeline('web.splash.content-ready-observed', {source})
      this.teardownStartupContentReady()
      this.releaseWhenReady()
    }

    this.startupContentReadyHandler = () => markReady('event')
    document.addEventListener(STARTUP_CONTENT_READY_EVENT, this.startupContentReadyHandler, {once: true})

    const elapsed = Math.max(0, performance.now() - this.startedAt)
    const delay = Math.max(0, this.contentReadyTimeoutMs - elapsed)
    markStartupTimeline('web.splash.content-ready-waiting', {
      delayMs: Math.round(delay),
      elapsedMs: Math.round(elapsed),
    })
    this.contentReadyTimerId = window.setTimeout(() => markReady('timeout'), delay)
  }

  private teardownStartupContentReady(): void {
    window.clearTimeout(this.contentReadyTimerId)
    if (this.startupContentReadyHandler) {
      document.removeEventListener(STARTUP_CONTENT_READY_EVENT, this.startupContentReadyHandler)
      this.startupContentReadyHandler = undefined
    }
  }

  private releaseWhenReady(): void {
    if (!this.minVisibleElapsed || !this.startupContentReady) {
      markStartupTimeline('web.splash.release-waiting', {
        minVisibleElapsed: this.minVisibleElapsed,
        startupContentReady: this.startupContentReady,
      })
      return
    }

    markStartupTimeline('web.splash.release-conditions-met')
    this.release()
  }

  private scheduleNativeReadySignal(): void {
    const visualReady = this.nativeSplash ? Promise.resolve() : waitForLogoImage(this.root)
    markStartupTimeline('web.splash.visual-ready-wait-start', {nativeSplash: this.nativeSplash})

    void visualReady
      .then(waitForTwoAnimationFrames)
      .then(() => this.notifyNativeReady())
      .catch(() => this.notifyNativeReady())
  }

  private notifyNativeReady(): void {
    if (this.nativeReadyNotified) return
    this.nativeReadyNotified = true
    document.documentElement.dataset['splashNativeReady'] = 'true'
    markStartupTimeline('web.splash.visual-ready')
    document.dispatchEvent(new CustomEvent('chromvoid:splash-dom-ready'))
  }

  private finishRelease(): void {
    markStartupTimeline('web.splash.finish-release')
    document.documentElement.removeAttribute('loading')

    if (this.nativeSplash) {
      markStartupTimeline('web.splash.native-handoff-paint-wait-start', {
        frames: NATIVE_HANDOFF_PAINT_FRAMES,
      })
      void waitForAnimationFrames(NATIVE_HANDOFF_PAINT_FRAMES).then(() => {
        markStartupTimeline('web.splash.native-handoff-paint-ready')
        this.notifyNativeRelease()
        this.destroy()
      })
      return
    }

    this.notifyNativeRelease()
    this.destroy()
  }

  private notifyNativeRelease(): void {
    if (this.nativeReleaseNotified) return
    this.nativeReleaseNotified = true
    markStartupTimeline('web.splash.notify-native-release')

    try {
      window.ChromVoidSplash?.domReady?.()
    } catch (error) {
      console.warn('[splash] native splash bridge failed:', error)
    }

    void notifyTauriSplashReady()
  }
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

function hasNativeSplashBridge(): boolean {
  return typeof window.ChromVoidSplash?.domReady === 'function'
}

function waitForLogoImage(root: HTMLElement): Promise<void> {
  const image = root.querySelector<HTMLImageElement>('[data-splash-logo-image]')
  if (!image || (image.complete && image.naturalWidth > 0)) {
    return Promise.resolve()
  }

  const imageReady =
    typeof image.decode === 'function'
      ? image.decode().then(
          () => undefined,
          () => undefined,
        )
      : new Promise<void>((resolve) => {
          image.addEventListener('load', () => resolve(), {once: true})
          image.addEventListener('error', () => resolve(), {once: true})
        })

  return Promise.race([imageReady, delay(IMAGE_READY_TIMEOUT_MS)])
}

function waitForTwoAnimationFrames(): Promise<void> {
  return waitForAnimationFrames(2)
}

function waitForAnimationFrames(count: number): Promise<void> {
  if (count <= 0) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    const tick = () => {
      count -= 1
      if (count <= 0) {
        resolve()
        return
      }
      requestAnimationFrameFallback(tick)
    }

    requestAnimationFrameFallback(tick)
  })
}

function requestAnimationFrameFallback(callback: FrameRequestCallback): void {
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(callback)
    return
  }

  window.setTimeout(() => callback(performance.now()), 16)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

async function notifyTauriSplashReady(): Promise<void> {
  if (!hasTauriInvoke()) {
    return
  }

  try {
    const {invoke} = await import('@tauri-apps/api/core')
    await invoke('frontend_splash_ready')
  } catch (error) {
    console.warn('[splash] Tauri splash handoff failed:', error)
  }
}

function hasTauriInvoke(): boolean {
  const internals = (globalThis as {__TAURI_INTERNALS__?: {invoke?: unknown}}).__TAURI_INTERNALS__
  return typeof internals?.invoke === 'function'
}
