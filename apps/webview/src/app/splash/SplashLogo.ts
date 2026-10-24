import {isStartupContentReady, STARTUP_CONTENT_READY_EVENT} from '../bootstrap/startup-readiness'
import {markStartupSplashActive, markStartupSplashReleased} from '../bootstrap/startup-splash'
import {markStartupTimeline} from '../bootstrap/startup-timeline'

const DEFAULT_CONTENT_READY_TIMEOUT_MS = 10_000
const DEFAULT_EXIT_DURATION_MS = 250
const REDUCED_MOTION_EXIT_DURATION_MS = 120
const NATIVE_HANDOFF_PAINT_FRAMES = 6

export interface SplashLogoOptions {
  contentReadyTimeoutMs?: number
  exitDurationMs?: number
  reducedMotion?: boolean
  root?: HTMLElement | null
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
  private readonly nativeSplash: boolean
  private readonly reducedMotion: boolean
  private readonly root: HTMLElement
  private destroyed = false
  private contentReadyTimerId = 0
  private exitTimerId = 0
  private released = false
  private nativeReadyNotified = false
  private nativeReleaseNotified = false
  private startupContentReadyHandler?: () => void

  constructor(root: HTMLElement, options: SplashLogoOptions) {
    this.root = root
    this.contentReadyTimeoutMs = options.contentReadyTimeoutMs ?? DEFAULT_CONTENT_READY_TIMEOUT_MS
    this.nativeSplash = hasNativeSplashBridge()
    this.reducedMotion = options.reducedMotion ?? prefersReducedMotion()
    this.exitDurationMs = this.nativeSplash
      ? 0
      : this.reducedMotion
        ? Math.min(options.exitDurationMs ?? DEFAULT_EXIT_DURATION_MS, REDUCED_MOTION_EXIT_DURATION_MS)
        : (options.exitDurationMs ?? DEFAULT_EXIT_DURATION_MS)

    this.root.dataset['splashState'] = 'visible'
    this.root.dataset['splashMode'] = this.nativeSplash ? 'native' : 'web'
    this.root.dataset['splashMotion'] = this.reducedMotion ? 'reduced' : 'active'
    markStartupSplashActive(this.nativeSplash ? 'native-bridge' : 'web')
    markStartupTimeline('web.splash.controller-created', {
      contentReadyTimeoutMs: this.contentReadyTimeoutMs,
      mode: this.nativeSplash ? 'native' : 'web',
      reducedMotion: this.reducedMotion,
    })
    this.scheduleNativeReadySignal()
    this.scheduleStartupContentReady()
  }

  release(): void {
    if (this.destroyed || this.released) return
    this.released = true
    this.teardownStartupContentReady()
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
    window.clearTimeout(this.exitTimerId)
  }

  private scheduleStartupContentReady(): void {
    if (isStartupContentReady()) {
      markStartupTimeline('web.splash.content-ready-already-marked')
      this.release()
      return
    }

    const markReady = (source: 'event' | 'timeout') => {
      if (this.destroyed || this.released) return
      markStartupTimeline('web.splash.content-ready-observed', {source})
      this.release()
    }

    this.startupContentReadyHandler = () => markReady('event')
    document.addEventListener(STARTUP_CONTENT_READY_EVENT, this.startupContentReadyHandler, {once: true})

    // The safety release guards against readiness that never arrives. Count it from here, not from
    // navigation start, so a slow load cannot spend it before the first screen is able to render.
    markStartupTimeline('web.splash.content-ready-waiting', {delayMs: this.contentReadyTimeoutMs})
    this.contentReadyTimerId = window.setTimeout(() => markReady('timeout'), this.contentReadyTimeoutMs)
  }

  private teardownStartupContentReady(): void {
    window.clearTimeout(this.contentReadyTimerId)
    if (this.startupContentReadyHandler) {
      document.removeEventListener(STARTUP_CONTENT_READY_EVENT, this.startupContentReadyHandler)
      this.startupContentReadyHandler = undefined
    }
  }

  private scheduleNativeReadySignal(): void {
    markStartupTimeline('web.splash.visual-ready-wait-start', {nativeSplash: this.nativeSplash})

    void waitForAnimationFrames(2)
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

    void notifyTauriSplashReady().finally(() => markStartupSplashReleased())
  }
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

function hasNativeSplashBridge(): boolean {
  return typeof window.ChromVoidSplash?.domReady === 'function'
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
