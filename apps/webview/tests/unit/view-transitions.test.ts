import {afterEach, describe, expect, it, vi} from 'vitest'

import {
  getViewTransitionNameOwners,
  viewTransition,
  withViewTransitionName,
} from '../../src/utils/view-transitions'

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
  startViewTransition: (callback: () => void | Promise<void>) => {finished: Promise<void>},
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

  it('waits for a successful transition and clears a temporary name', async () => {
    setReducedMotion(false)
    let finishTransition!: () => void
    const element = document.createElement('div')
    document.body.append(element)
    setStartViewTransition((callback) => {
      void callback()
      return {
        finished: new Promise<void>((resolve) => {
          finishTransition = resolve
        }),
      }
    })

    const callback = vi.fn()
    const result = withViewTransitionName(element, 'gallery-image', callback)

    expect(callback).toHaveBeenCalledTimes(1)
    expect(element.style.viewTransitionName).toBe('gallery-image')

    finishTransition()
    await expect(result).resolves.toEqual({state: 'applied'})
    expect(element.style.viewTransitionName).toBe('')
  })

  it('reports cancelled transitions and clears a temporary name', async () => {
    setReducedMotion(false)
    const element = document.createElement('div')
    document.body.append(element)
    setStartViewTransition((callback) => {
      void callback()
      return {finished: Promise.reject(new Error('cancelled'))}
    })

    const result = await withViewTransitionName(element, 'gallery-image', vi.fn())

    expect(result).toEqual({state: 'cancelled'})
    expect(element.style.viewTransitionName).toBe('')
  })

  it('clears temporary names when motion is skipped', async () => {
    setReducedMotion(true)
    const element = document.createElement('div')
    document.body.append(element)
    const callback = vi.fn()

    const result = await withViewTransitionName(element, 'gallery-image', callback)

    expect(result).toEqual({state: 'skipped-reduced-motion'})
    expect(callback).toHaveBeenCalledTimes(1)
    expect(element.style.viewTransitionName).toBe('')
  })

  it('clears temporary names when View Transition API is unsupported', async () => {
    setReducedMotion(false)
    clearStartViewTransition()
    const element = document.createElement('div')
    document.body.append(element)
    const callback = vi.fn()

    const result = await withViewTransitionName(element, 'gallery-image', callback)

    expect(result).toEqual({state: 'skipped-unsupported'})
    expect(callback).toHaveBeenCalledTimes(1)
    expect(element.style.viewTransitionName).toBe('')
  })

  it('does not create a duplicate owner and still runs the callback', async () => {
    setReducedMotion(false)
    clearStartViewTransition()
    const existing = document.createElement('div')
    const candidate = document.createElement('div')
    existing.style.viewTransitionName = 'gallery-image'
    document.body.append(existing, candidate)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const callback = vi.fn()

    const result = await withViewTransitionName(candidate, 'gallery-image', callback)

    expect(result).toEqual({state: 'skipped-unsupported'})
    expect(callback).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(candidate.style.viewTransitionName).toBe('')
    expect(getViewTransitionNameOwners('gallery-image')).toEqual([existing])
  })
})
