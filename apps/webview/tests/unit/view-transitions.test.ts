import {afterEach, describe, expect, it, vi} from 'vitest'

import {
  viewTransition,
  viewTransitionCoordinator,
  withViewTransitionName,
} from '../../src/utils/view-transitions'
import {viewTransitionTargets} from '../../src/utils/view-transition-targets'

const hadStartViewTransition = 'startViewTransition' in document
const originalStartViewTransition = (document as Document & {startViewTransition?: unknown})
  .startViewTransition
const originalMatchMedia = window.matchMedia
const originalVisibilityState = document.visibilityState

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
    skipTransition?: () => void
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

function setVisibilityState(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: state,
  })
}

describe('view transition utilities', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    setReducedMotion(false)
    setVisibilityState(originalVisibilityState)
    clearStartViewTransition()
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    })
    vi.restoreAllMocks()
    viewTransitionTargets.clear()
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

  it('runs the callback without a transition while the document is hidden', async () => {
    setVisibilityState('hidden')
    const callback = vi.fn()
    const startViewTransition = vi.fn()
    setStartViewTransition(startViewTransition)

    const result = await viewTransition(callback)

    expect(result).toEqual({state: 'skipped-hidden'})
    expect(callback).toHaveBeenCalledTimes(1)
    expect(startViewTransition).not.toHaveBeenCalled()
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

  it('applies scoped metadata and restores target state after completion', async () => {
    const element = document.createElement('div')
    element.style.viewTransitionName = 'existing-name'
    document.body.append(element)
    let finishTransition!: () => void

    setStartViewTransition((callback) => {
      const updateCallbackDone = Promise.resolve(callback()).then(() => undefined)
      return {
        ready: Promise.resolve(),
        updateCallbackDone,
        finished: new Promise<void>((resolve) => {
          finishTransition = resolve
        }),
      }
    })

    const result = viewTransitionCoordinator.run({
      presentation: {scope: 'mobile-page', direction: 'forward'},
      targets: [{element, name: 'mobile-page'}],
      update: vi.fn(),
    })

    expect(document.documentElement.dataset['vtScope']).toBe('mobile-page')
    expect(document.documentElement.dataset['vtDirection']).toBe('forward')
    expect(element.style.viewTransitionName).toBe('mobile-page')

    finishTransition()
    await expect(result).resolves.toEqual({state: 'applied'})
    expect(document.documentElement.dataset['vtScope']).toBeUndefined()
    expect(document.documentElement.dataset['vtDirection']).toBeUndefined()
    expect(element.style.viewTransitionName).toBe('existing-name')
  })

  it('commits synchronously when a required target is missing', async () => {
    const callback = vi.fn()
    const startViewTransition = vi.fn(() => ({
      ready: Promise.resolve(),
      updateCallbackDone: Promise.resolve(),
      finished: Promise.resolve(),
    }))
    setStartViewTransition(startViewTransition)

    const result = viewTransitionCoordinator.run({
      targets: [{element: null, name: 'mobile-page'}],
      update: callback,
    })

    expect(callback).toHaveBeenCalledTimes(1)
    expect(startViewTransition).not.toHaveBeenCalled()
    await expect(result).resolves.toEqual({state: 'skipped-missing-target'})
  })

  it('joins nested updates without starting a second transition', async () => {
    let starts = 0
    const nestedUpdate = vi.fn()
    setStartViewTransition((callback) => {
      starts += 1
      const updateCallbackDone = Promise.resolve(callback()).then(() => undefined)
      return {
        ready: Promise.resolve(),
        updateCallbackDone,
        finished: updateCallbackDone,
      }
    })

    const result = await viewTransitionCoordinator.run({
      update: async () => {
        await expect(
          viewTransitionCoordinator.run({update: nestedUpdate}),
        ).resolves.toEqual({state: 'joined-active'})
      },
    })

    expect(result).toEqual({state: 'applied'})
    expect(starts).toBe(1)
    expect(nestedUpdate).toHaveBeenCalledTimes(1)
  })

  it('skips an active animation and serializes rapid requests', async () => {
    const order: string[] = []
    let finishFirst!: () => void
    const skipFirst = vi.fn(() => finishFirst())
    let starts = 0

    setStartViewTransition((callback) => {
      starts += 1
      const updateCallbackDone = Promise.resolve().then(callback).then(() => undefined)
      if (starts === 1) {
        return {
          ready: Promise.resolve(),
          updateCallbackDone,
          finished: new Promise<void>((resolve) => {
            finishFirst = resolve
          }),
          skipTransition: skipFirst,
        }
      }

      return {
        ready: Promise.resolve(),
        updateCallbackDone,
        finished: updateCallbackDone,
      }
    })

    const first = viewTransitionCoordinator.run({update: () => order.push('first')})
    const second = viewTransitionCoordinator.run({update: () => order.push('second')})

    await Promise.all([first, second])
    expect(skipFirst).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['first', 'second'])
    expect(starts).toBe(2)
  })

  it('registers target providers with replacement-safe teardown', async () => {
    const first = document.createElement('div')
    const second = document.createElement('div')
    const settle = vi.fn()
    const unregisterFirst = viewTransitionTargets.register('mobile-page', {
      getElement: () => first,
    })
    const unregisterSecond = viewTransitionTargets.register('mobile-page', {
      getElement: () => second,
      settle,
    })

    unregisterFirst()
    expect(viewTransitionTargets.resolve(['mobile-page'])).toEqual([
      {name: 'mobile-page', element: second},
    ])
    await viewTransitionTargets.settle(['mobile-page'])
    expect(settle).toHaveBeenCalledTimes(1)

    unregisterSecond()
    expect(viewTransitionTargets.resolve(['mobile-page'])).toEqual([
      {name: 'mobile-page', element: null},
    ])
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

  it('reports transitions cancelled when the document becomes hidden during startup', async () => {
    setStartViewTransition((callback) => {
      const updateCallbackDone = Promise.resolve(callback()).then(() => undefined)
      return {
        ready: Promise.reject(
          new DOMException(
            'View transition was skipped because document visibility state is hidden.',
            'InvalidStateError',
          ),
        ),
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
