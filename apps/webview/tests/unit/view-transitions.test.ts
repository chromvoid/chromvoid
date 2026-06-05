import {afterEach, describe, expect, it, vi} from 'vitest'

import {viewTransition, withViewTransitionName} from '../../src/utils/view-transitions'

const hadStartViewTransition = 'startViewTransition' in document
const originalStartViewTransition = (document as Document & {startViewTransition?: unknown})
  .startViewTransition
const originalMatchMedia = window.matchMedia

function setReducedMotion(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })),
  })
}

function setStartViewTransition(
  startViewTransition: (callback: () => void | Promise<void>) => {
    ready: Promise<void>
    updateCallbackDone: Promise<void>
    finished: Promise<void>
  },
): void {
  Object.defineProperty(document, 'startViewTransition', {
    configurable: true,
    writable: true,
    value: startViewTransition,
  })
}

function clearStartViewTransition(): void {
  if (hadStartViewTransition) {
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      writable: true,
      value: originalStartViewTransition,
    })
    return
  }

  delete (document as Document & {startViewTransition?: unknown}).startViewTransition
}

describe('view transition utilities', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    setReducedMotion(false)
    clearStartViewTransition()
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    })
    vi.restoreAllMocks()
  })

  it('runs the callback once and reports reduced-motion fallback', async () => {
    setReducedMotion(true)
    const callback = vi.fn()

    const result = await viewTransition(callback)

    expect(result).toEqual({state: 'skipped-reduced-motion'})
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('runs the callback once and reports unsupported-browser fallback', async () => {
    setReducedMotion(false)
    clearStartViewTransition()
    const callback = vi.fn()

    const result = await viewTransition(callback)

    expect(result).toEqual({state: 'skipped-unsupported'})
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('treats a non-function startViewTransition property as unsupported', async () => {
    setReducedMotion(false)
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      writable: true,
      value: undefined,
    })
    const callback = vi.fn()

    const result = await viewTransition(callback)

    expect(result).toEqual({state: 'skipped-unsupported'})
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('waits for a successful transition', async () => {
    setReducedMotion(false)
    let finishTransition!: () => void
    const element = document.createElement('div')
    document.body.append(element)
    setStartViewTransition((callback) => {
      void callback()
      return {
        ready: Promise.resolve(),
        updateCallbackDone: Promise.resolve(),
        finished: new Promise<void>((resolve) => {
          finishTransition = resolve
        }),
      }
    })

    const callback = vi.fn()
    const result = withViewTransitionName(element, 'gallery-image', callback)

    expect(callback).toHaveBeenCalledTimes(1)

    finishTransition()
    await expect(result).resolves.toEqual({state: 'applied'})
  })

  it('reports cancelled transitions', async () => {
    setReducedMotion(false)
    const element = document.createElement('div')
    document.body.append(element)
    setStartViewTransition((callback) => {
      void callback()
      return {
        ready: Promise.resolve(),
        updateCallbackDone: Promise.resolve(),
        finished: Promise.reject(new DOMException('Transition was skipped', 'AbortError')),
      }
    })

    const result = await withViewTransitionName(element, 'gallery-image', vi.fn())

    expect(result).toEqual({state: 'cancelled'})
  })

  it('reports skipped transitions when ready rejects', async () => {
    setReducedMotion(false)
    setStartViewTransition((callback) => {
      const updateCallbackDone = Promise.resolve(callback()).then(() => undefined)
      return {
        ready: Promise.reject(new DOMException('Transition was skipped', 'AbortError')),
        updateCallbackDone,
        finished: Promise.resolve(),
      }
    })

    const callback = vi.fn()
    const result = await viewTransition(callback)

    expect(result).toEqual({state: 'cancelled'})
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('propagates transition update callback errors', async () => {
    setReducedMotion(false)
    const error = new Error('route update failed')
    setStartViewTransition((callback) => {
      const updateCallbackDone = Promise.resolve().then(callback).then(() => undefined)
      return {
        ready: Promise.resolve(),
        updateCallbackDone,
        finished: Promise.resolve(),
      }
    })

    await expect(viewTransition(() => {
      throw error
    })).rejects.toBe(error)
  })

  it('reports skipped reduced-motion transitions', async () => {
    setReducedMotion(true)
    const element = document.createElement('div')
    document.body.append(element)
    const callback = vi.fn()

    const result = await withViewTransitionName(element, 'gallery-image', callback)

    expect(result).toEqual({state: 'skipped-reduced-motion'})
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('reports skipped unsupported transitions', async () => {
    setReducedMotion(false)
    clearStartViewTransition()
    const element = document.createElement('div')
    document.body.append(element)
    const callback = vi.fn()

    const result = await withViewTransitionName(element, 'gallery-image', callback)

    expect(result).toEqual({state: 'skipped-unsupported'})
    expect(callback).toHaveBeenCalledTimes(1)
  })
})
