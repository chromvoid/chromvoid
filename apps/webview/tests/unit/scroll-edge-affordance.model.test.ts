import {afterEach, describe, expect, it, vi} from 'vitest'

import {ScrollEdgeAffordanceModel} from '../../src/shared/ui/scroll-edge-affordance.model'

function setScrollMetrics(element: HTMLElement, metrics: {clientHeight: number; scrollHeight: number; scrollTop: number}) {
  let scrollTop = metrics.scrollTop
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    get: () => metrics.clientHeight,
  })
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    get: () => metrics.scrollHeight,
  })
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: (value) => {
      scrollTop = value
    },
  })
}

describe('ScrollEdgeAffordanceModel', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('measures top overflow with a one-pixel threshold', () => {
    const model = new ScrollEdgeAffordanceModel()
    const scroller = document.createElement('div')

    setScrollMetrics(scroller, {clientHeight: 100, scrollHeight: 200, scrollTop: 1})
    model.bindScroller(scroller)
    model.measureNow()
    expect(model.hasBlockStartOverflow()).toBe(false)

    scroller.scrollTop = 2
    model.measureNow()
    expect(model.hasBlockStartOverflow()).toBe(true)

    scroller.scrollTop = -12
    model.measureNow()
    expect(model.hasBlockStartOverflow()).toBe(false)
  })

  it('measures bottom overflow with a one-pixel threshold', () => {
    const model = new ScrollEdgeAffordanceModel()
    const scroller = document.createElement('div')

    setScrollMetrics(scroller, {clientHeight: 100, scrollHeight: 200, scrollTop: 98})
    model.bindScroller(scroller)
    model.measureNow()
    expect(model.hasBlockEndOverflow()).toBe(true)

    setScrollMetrics(scroller, {clientHeight: 100, scrollHeight: 200, scrollTop: 99})
    model.measureNow()
    expect(model.hasBlockEndOverflow()).toBe(false)
  })

  it('updates when the bound scroller dispatches scroll', async () => {
    const model = new ScrollEdgeAffordanceModel()
    const scroller = document.createElement('div')

    setScrollMetrics(scroller, {clientHeight: 100, scrollHeight: 220, scrollTop: 0})
    model.bindScroller(scroller)
    model.measureNow()
    expect(model.hasBlockEndOverflow()).toBe(true)

    scroller.scrollTop = 120
    scroller.dispatchEvent(new Event('scroll'))
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    expect(model.hasBlockEndOverflow()).toBe(false)
  })

  it('removes old listeners when rebinding to a new scroller', () => {
    const model = new ScrollEdgeAffordanceModel()
    const first = document.createElement('div')
    const second = document.createElement('div')
    const firstRemove = vi.spyOn(first, 'removeEventListener')
    const secondRemove = vi.spyOn(second, 'removeEventListener')

    setScrollMetrics(first, {clientHeight: 100, scrollHeight: 220, scrollTop: 0})
    setScrollMetrics(second, {clientHeight: 100, scrollHeight: 100, scrollTop: 0})

    model.bindScroller(first)
    model.measureNow()
    first.scrollTop = 8
    model.measureNow()
    expect(model.hasBlockStartOverflow()).toBe(true)
    expect(model.hasBlockEndOverflow()).toBe(true)

    model.bindScroller(second)
    model.measureNow()
    expect(firstRemove).toHaveBeenCalledWith('scroll', model)
    expect(model.hasBlockStartOverflow()).toBe(false)
    expect(model.hasBlockEndOverflow()).toBe(false)

    model.dispose()
    expect(secondRemove).toHaveBeenCalledWith('scroll', model)
  })

  it('disconnects the resize observer on dispose', () => {
    const disconnect = vi.fn()
    vi.stubGlobal(
      'ResizeObserver',
      class ResizeObserverMock {
        observe = vi.fn()
        disconnect = disconnect
      },
    )
    const model = new ScrollEdgeAffordanceModel()
    const scroller = document.createElement('div')

    setScrollMetrics(scroller, {clientHeight: 100, scrollHeight: 220, scrollTop: 0})
    model.bindScroller(scroller)
    scroller.scrollTop = 12
    model.measureNow()
    expect(model.hasBlockStartOverflow()).toBe(true)
    model.dispose()

    expect(disconnect).toHaveBeenCalled()
    expect(model.hasBlockStartOverflow()).toBe(false)
    expect(model.hasBlockEndOverflow()).toBe(false)
  })

  it('resets both edges when binding a null scroller', () => {
    const model = new ScrollEdgeAffordanceModel()
    const scroller = document.createElement('div')

    setScrollMetrics(scroller, {clientHeight: 100, scrollHeight: 240, scrollTop: 12})
    model.bindScroller(scroller)
    model.measureNow()
    expect(model.hasBlockStartOverflow()).toBe(true)
    expect(model.hasBlockEndOverflow()).toBe(true)

    model.bindScroller(null)

    expect(model.hasBlockStartOverflow()).toBe(false)
    expect(model.hasBlockEndOverflow()).toBe(false)
  })
})
