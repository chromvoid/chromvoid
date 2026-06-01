import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {markStartupContentReady} from '../../src/app/bootstrap/startup-readiness'
import {startSplashLogo} from '../../src/app/splash/SplashLogo'

const originalWindowMatchMedia = window.matchMedia
const originalRequestAnimationFrame = window.requestAnimationFrame

function installSplashDom(): HTMLElement {
  document.documentElement.setAttribute('loading', '')
  document.body.innerHTML = `
    <div id="loading-native" class="loading-screen" aria-hidden="true">
      <div class="splash-logo" data-splash-logo-stage>
        <img class="splash-logo__image" data-splash-logo-image src="./assets/icon.png" alt="" />
      </div>
    </div>
  `
  return document.getElementById('loading-native')!
}

function setReducedMotion(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string): MediaQueryList =>
      ({
        addEventListener() {},
        addListener() {},
        dispatchEvent: () => false,
        matches,
        media: query,
        onchange: null,
        removeEventListener() {},
        removeListener() {},
      }) as MediaQueryList,
  })
}

describe('SplashLogo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    installSplashDom()
    setReducedMotion(false)
  })

  afterEach(() => {
    vi.useRealTimers()
    document.documentElement.removeAttribute('loading')
    delete document.documentElement.dataset['splashNativeReady']
    delete document.documentElement.dataset['startupContentReady']
    document.body.innerHTML = ''
    delete window.ChromVoidSplash
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: originalRequestAnimationFrame,
    })
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: originalWindowMatchMedia,
    })
  })

  it('uses web splash mode and releases loading after the minimum duration', async () => {
    const root = document.getElementById('loading-native')!

    startSplashLogo({exitDurationMs: 0, minVisibleMs: 1_600, startedAt: 0})

    expect(root.dataset['splashMode']).toBe('web')
    expect(root.dataset['splashMotion']).toBe('active')
    expect(document.querySelector('.splash-logo__canvas')).toBeNull()
    markStartupContentReady()

    await vi.advanceTimersByTimeAsync(1_599)
    expect(document.documentElement.hasAttribute('loading')).toBe(true)

    await vi.advanceTimersByTimeAsync(1)
    expect(document.documentElement.hasAttribute('loading')).toBe(false)
  })

  it('marks reduced-motion mode without creating dynamic rendering surfaces', async () => {
    const root = document.getElementById('loading-native')!
    setReducedMotion(true)

    startSplashLogo({exitDurationMs: 0, minVisibleMs: 1_600, startedAt: 0})

    expect(root.dataset['splashMotion']).toBe('reduced')
    expect(document.querySelector('.splash-logo__canvas')).toBeNull()
    markStartupContentReady()

    await vi.advanceTimersByTimeAsync(1_600)
    expect(document.documentElement.hasAttribute('loading')).toBe(false)
  })

  it('waits for startup content readiness after the minimum duration', async () => {
    startSplashLogo({exitDurationMs: 0, minVisibleMs: 1_600, startedAt: 0})

    await vi.advanceTimersByTimeAsync(1_600)
    expect(document.documentElement.hasAttribute('loading')).toBe(true)

    markStartupContentReady()

    expect(document.documentElement.hasAttribute('loading')).toBe(false)
  })

  it('uses the content readiness timeout as a safety release', async () => {
    startSplashLogo({
      contentReadyTimeoutMs: 2_000,
      exitDurationMs: 0,
      minVisibleMs: 1_600,
      startedAt: 0,
    })

    await vi.advanceTimersByTimeAsync(1_999)
    expect(document.documentElement.hasAttribute('loading')).toBe(true)

    await vi.advanceTimersByTimeAsync(1)
    expect(document.documentElement.hasAttribute('loading')).toBe(false)
  })

  it('supports an explicit release without waiting for the minimum duration', () => {
    const controller = startSplashLogo({exitDurationMs: 0, minVisibleMs: 1_600, startedAt: 0})

    controller.release()

    expect(document.documentElement.hasAttribute('loading')).toBe(false)
  })

  it('marks first paint readiness before releasing the native splash bridge', async () => {
    const domReady = vi.fn()
    const events: Event[] = []

    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0),
    })
    window.ChromVoidSplash = {domReady}
    document.addEventListener('chromvoid:splash-dom-ready', (event) => events.push(event), {once: true})
    const root = document.getElementById('loading-native')!

    startSplashLogo({exitDurationMs: 0, minVisibleMs: 1_600, startedAt: 0})

    expect(root.dataset['splashMode']).toBe('native')

    await vi.advanceTimersByTimeAsync(701)
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(0)
    await Promise.resolve()

    expect(domReady).not.toHaveBeenCalled()
    expect(events).toHaveLength(1)
    expect(document.documentElement.dataset['splashNativeReady']).toBe('true')
    markStartupContentReady()

    await vi.advanceTimersByTimeAsync(899)

    expect(document.documentElement.hasAttribute('loading')).toBe(false)
    expect(domReady).not.toHaveBeenCalled()

    for (let i = 0; i < 6; i += 1) {
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(16)
    }
    await Promise.resolve()

    expect(domReady).toHaveBeenCalledTimes(1)
  })

  it('still releases the native splash bridge if the DOM splash already exited', async () => {
    const domReady = vi.fn()

    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0),
    })
    window.ChromVoidSplash = {domReady}

    const controller = startSplashLogo({exitDurationMs: 0, minVisibleMs: 1_600, startedAt: 0})

    controller.release()
    expect(document.documentElement.hasAttribute('loading')).toBe(false)

    await vi.advanceTimersByTimeAsync(2_000)
    for (let i = 0; i < 8; i += 1) {
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(16)
    }
    await Promise.resolve()

    expect(domReady).toHaveBeenCalledTimes(1)
  })

  it('does nothing when loading was already released', () => {
    document.documentElement.removeAttribute('loading')

    const controller = startSplashLogo({exitDurationMs: 0, minVisibleMs: 1_600, startedAt: 0})
    controller.release()

    expect(document.documentElement.hasAttribute('loading')).toBe(false)
  })
})
