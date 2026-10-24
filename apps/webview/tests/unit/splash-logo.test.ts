import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {markStartupContentReady} from '../../src/app/bootstrap/startup-readiness'
import {STARTUP_SPLASH_RELEASED_EVENT} from '../../src/app/bootstrap/startup-splash'
import {startSplashLogo} from '../../src/app/splash/SplashLogo'

const {invoke} = vi.hoisted(() => ({invoke: vi.fn()}))

vi.mock('@tauri-apps/api/core', () => ({invoke}))

const originalWindowMatchMedia = window.matchMedia
const originalRequestAnimationFrame = window.requestAnimationFrame

function installSplashDom(): HTMLElement {
  document.documentElement.setAttribute('loading', '')
  document.body.innerHTML = '<div id="loading-native" class="loading-screen" aria-hidden="true"></div>'
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

function controlAnimationFrames(): () => Promise<void> {
  const callbacks: FrameRequestCallback[] = []
  Object.defineProperty(window, 'requestAnimationFrame', {
    configurable: true,
    writable: true,
    value: (callback: FrameRequestCallback) => callbacks.push(callback),
  })

  return async () => {
    await Promise.resolve()
    for (const callback of callbacks.splice(0)) {
      callback(performance.now())
    }
    await Promise.resolve()
  }
}

describe('SplashLogo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    invoke.mockReset().mockResolvedValue(undefined)
    installSplashDom()
    setReducedMotion(false)
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    document.documentElement.removeAttribute('loading')
    delete document.documentElement.dataset['splashNativeReady']
    delete document.documentElement.dataset['startupSplashActive']
    delete document.documentElement.dataset['startupSplashReleased']
    delete document.documentElement.dataset['startupSplashSurface']
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

  it('uses the blank web splash and releases as soon as content is ready', async () => {
    const root = document.getElementById('loading-native')!

    startSplashLogo({exitDurationMs: 0})

    expect(root.dataset['splashMode']).toBe('web')
    expect(root.dataset['splashMotion']).toBe('active')
    expect(document.documentElement.dataset['startupSplashSurface']).toBe('web')
    expect(root.childElementCount).toBe(0)

    await vi.advanceTimersByTimeAsync(37)
    markStartupContentReady()

    expect(document.documentElement.hasAttribute('loading')).toBe(false)
    await Promise.resolve()
    expect(document.documentElement.dataset['startupSplashReleased']).toBe('true')
  })

  it('releases immediately when startup content was already marked ready', async () => {
    markStartupContentReady()

    startSplashLogo({exitDurationMs: 0})

    expect(document.documentElement.hasAttribute('loading')).toBe(false)
    await Promise.resolve()
    expect(document.documentElement.dataset['startupSplashReleased']).toBe('true')
  })

  it('keeps the short exit fade after content readiness', async () => {
    const root = document.getElementById('loading-native')!
    startSplashLogo()

    markStartupContentReady()

    expect(root.dataset['splashState']).toBe('exiting')
    await vi.advanceTimersByTimeAsync(249)
    expect(document.documentElement.hasAttribute('loading')).toBe(true)
    expect(document.documentElement.dataset['startupSplashReleased']).toBeUndefined()

    await vi.advanceTimersByTimeAsync(1)
    expect(document.documentElement.hasAttribute('loading')).toBe(false)
    expect(document.documentElement.dataset['startupSplashReleased']).toBe('true')
  })

  it('uses the shorter exit fade for reduced motion without rendering a logo', async () => {
    const root = document.getElementById('loading-native')!
    setReducedMotion(true)

    startSplashLogo()

    expect(root.dataset['splashMotion']).toBe('reduced')
    expect(root.childElementCount).toBe(0)
    markStartupContentReady()

    await vi.advanceTimersByTimeAsync(119)
    expect(document.documentElement.hasAttribute('loading')).toBe(true)

    await vi.advanceTimersByTimeAsync(1)
    expect(document.documentElement.hasAttribute('loading')).toBe(false)
  })

  it('keeps loading while startup content is not ready', async () => {
    startSplashLogo({exitDurationMs: 0})

    await vi.advanceTimersByTimeAsync(4_500)
    expect(document.documentElement.hasAttribute('loading')).toBe(true)

    markStartupContentReady()

    expect(document.documentElement.hasAttribute('loading')).toBe(false)
  })

  it('uses the default content readiness timeout as a safety release', async () => {
    startSplashLogo({exitDurationMs: 0})

    await vi.advanceTimersByTimeAsync(9_999)
    expect(document.documentElement.hasAttribute('loading')).toBe(true)

    await vi.advanceTimersByTimeAsync(1)
    expect(document.documentElement.hasAttribute('loading')).toBe(false)
  })

  it('counts the readiness timeout from the splash start, not from a slow page load', async () => {
    await vi.advanceTimersByTimeAsync(12_000)
    startSplashLogo({exitDurationMs: 0})

    await vi.advanceTimersByTimeAsync(9_999)
    expect(document.documentElement.hasAttribute('loading')).toBe(true)

    await vi.advanceTimersByTimeAsync(1)
    expect(document.documentElement.hasAttribute('loading')).toBe(false)
  })

  it('waits for readiness after a slow page load instead of releasing at once', async () => {
    await vi.advanceTimersByTimeAsync(12_000)
    startSplashLogo({exitDurationMs: 0})

    await vi.advanceTimersByTimeAsync(1_500)
    expect(document.documentElement.hasAttribute('loading')).toBe(true)

    markStartupContentReady()
    expect(document.documentElement.hasAttribute('loading')).toBe(false)
  })

  it('supports an explicit release before content readiness and signals it only once', async () => {
    const released = vi.fn()
    document.addEventListener(STARTUP_SPLASH_RELEASED_EVENT, released)
    const controller = startSplashLogo({exitDurationMs: 0})

    controller.release()
    controller.release()
    markStartupContentReady()
    await vi.advanceTimersByTimeAsync(10_000)

    expect(document.documentElement.hasAttribute('loading')).toBe(false)
    expect(released).toHaveBeenCalledTimes(1)
    document.removeEventListener(STARTUP_SPLASH_RELEASED_EVENT, released)
  })

  it('stops listening for readiness and cancels the timeout when destroyed', async () => {
    const root = document.getElementById('loading-native')!
    const controller = startSplashLogo({exitDurationMs: 0})

    controller.destroy()
    controller.destroy()
    controller.release()
    markStartupContentReady()
    await vi.advanceTimersByTimeAsync(10_000)

    expect(document.documentElement.hasAttribute('loading')).toBe(true)
    expect(root.dataset['splashState']).toBe('visible')
    expect(document.documentElement.dataset['startupSplashReleased']).toBeUndefined()
  })

  it('marks first paint readiness before the six-frame native splash handoff', async () => {
    const paintFrame = controlAnimationFrames()
    const domReady = vi.fn()
    const events: Event[] = []
    window.ChromVoidSplash = {domReady}
    document.addEventListener('chromvoid:splash-dom-ready', (event) => events.push(event), {once: true})
    const root = document.getElementById('loading-native')!

    startSplashLogo()

    expect(root.dataset['splashMode']).toBe('native')
    expect(document.documentElement.dataset['startupSplashSurface']).toBe('native-bridge')

    await paintFrame()
    expect(events).toHaveLength(0)
    await paintFrame()

    expect(domReady).not.toHaveBeenCalled()
    expect(events).toHaveLength(1)
    expect(document.documentElement.dataset['splashNativeReady']).toBe('true')
    markStartupContentReady()

    expect(document.documentElement.hasAttribute('loading')).toBe(false)
    expect(document.documentElement.dataset['startupSplashReleased']).toBeUndefined()
    for (let i = 0; i < 5; i += 1) {
      await paintFrame()
    }
    expect(domReady).not.toHaveBeenCalled()

    await paintFrame()
    await Promise.resolve()

    expect(domReady).toHaveBeenCalledTimes(1)
    expect(document.documentElement.dataset['startupSplashReleased']).toBe('true')
  })

  it('still releases the native splash bridge if the DOM splash already exited', async () => {
    const paintFrame = controlAnimationFrames()
    const domReady = vi.fn()
    window.ChromVoidSplash = {domReady}

    const controller = startSplashLogo()

    controller.release()
    controller.release()
    expect(document.documentElement.hasAttribute('loading')).toBe(false)

    for (let i = 0; i < 8; i += 1) {
      await paintFrame()
    }
    await Promise.resolve()

    expect(domReady).toHaveBeenCalledTimes(1)
  })

  it('notifies Tauri before marking the startup splash released', async () => {
    let finishNativeReady: (() => void) | undefined
    invoke.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishNativeReady = resolve
        }),
    )
    vi.stubGlobal('__TAURI_INTERNALS__', {invoke: vi.fn()})
    startSplashLogo({exitDurationMs: 0})

    markStartupContentReady()
    await vi.advanceTimersByTimeAsync(0)

    expect(invoke).toHaveBeenCalledExactlyOnceWith('frontend_splash_ready')
    expect(document.documentElement.hasAttribute('loading')).toBe(false)
    expect(document.documentElement.dataset['startupSplashReleased']).toBeUndefined()

    finishNativeReady!()
    await vi.advanceTimersByTimeAsync(0)

    expect(document.documentElement.dataset['startupSplashReleased']).toBe('true')
  })

  it('does nothing when loading was already released', () => {
    document.documentElement.removeAttribute('loading')

    const controller = startSplashLogo({exitDurationMs: 0})
    controller.release()

    expect(document.documentElement.hasAttribute('loading')).toBe(false)
    expect(document.documentElement.dataset['startupSplashActive']).toBeUndefined()
  })
})
