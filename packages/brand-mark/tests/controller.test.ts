import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {BRAND_MARK_TIMING, createBrandMarkController, createBrandMarkMarkup, type BrandMarkController} from '../src/index'

import svgSource from '../../../apps/webview/src/assets/chromvoid-icon.svg?raw'
const LENGTH = 603

type RecordedAnimation = {
  target: SVGElement
  keyframes: Keyframe[]
  options: KeyframeAnimationOptions
  animation: Animation
  cancel: ReturnType<typeof vi.fn>
  finish: ReturnType<typeof vi.fn>
  cancelledAt: number[]
}

let records: RecordedAnimation[]
let reduced: MediaQueryList
let finePointer: MediaQueryList
let svg: SVGSVGElement
let controller: BrandMarkController
let animationClockLag: number

function media(matches: boolean): MediaQueryList {
  return Object.assign(new EventTarget(), {matches}) as MediaQueryList
}

function setReduced(matches: boolean): void {
  Object.assign(reduced, {matches})
  reduced.dispatchEvent(new Event('change'))
}

function animationsFor(target: Element | null): RecordedAnimation[] {
  return records.filter((record) => record.target === target)
}

function coreAnimations(): RecordedAnimation[] {
  return animationsFor(svg.querySelector('#coreStage'))
}

beforeEach(() => {
  vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance']})
  records = []
  animationClockLag = 0
  reduced = media(false)
  finePointer = media(true)
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => (query.includes('reduced') ? reduced : finePointer)),
  )
  Object.defineProperty(SVGElement.prototype, 'getTotalLength', {configurable: true, value: () => LENGTH})
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    value: function (this: SVGElement, keyframes: Keyframe[], options: KeyframeAnimationOptions): Animation {
      const startedAt = performance.now()
      const clockLag = animationClockLag
      let forcedTime: number | undefined
      let rejectFinished: (reason: Error) => void
      let resolveFinished: () => void
      let cancelled = false
      const finished = new Promise<void>((resolve, reject) => {
        resolveFinished = resolve
        rejectFinished = reject
      })
      const duration = Number(options.duration) + Number(options.delay ?? 0)
      const timer =
        options.iterations === Infinity ? undefined : setTimeout(() => resolveFinished(), duration + clockLag)
      const currentTime = () =>
        forcedTime ?? Math.min(Math.max(0, performance.now() - startedAt - clockLag), duration)
      const cancelledAt: number[] = []
      const cancel = vi.fn(() => {
        if (cancelled) return
        cancelledAt.push(currentTime())
        cancelled = true
        clearTimeout(timer)
        rejectFinished(new Error('Animation cancelled'))
      })
      const finish = vi.fn(() => {
        forcedTime = duration
        clearTimeout(timer)
        resolveFinished()
      })
      const animation = {
        get currentTime() {
          return cancelled ? null : currentTime()
        },
        finished,
        cancel,
        finish,
      } as unknown as Animation
      records.push({target: this, keyframes, options, animation, cancel, finish, cancelledAt})
      return animation
    },
  })
  document.body.innerHTML = svgSource
  svg = document.querySelector('svg')!
  controller = createBrandMarkController(svg)
})

afterEach(() => {
  controller.destroy()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('the shared brand mark contract', () => {
  it('leaves the static mark intact and creates one clipped, soft 78-unit signal and one ring', () => {
    expect(records).toHaveLength(0)
    const signal = svg.querySelector('.brandMarkSignal')!
    expect(signal.getAttribute('stroke-dasharray')).toBe('78 681')
    expect(Number(signal.getAttribute('stroke-width'))).toBeGreaterThan(72)
    expect(signal.parentElement?.parentElement?.id).toBe('spiralStage')
    expect(signal.parentElement?.getAttribute('clip-path')).toMatch(/^url\(#brandMark\d+Ribbon\)$/)
    expect(svg.querySelector('clipPath path')?.getAttribute('d')).toBe(
      svg.querySelector('#spiralFill')?.getAttribute('d'),
    )
    expect(svg.querySelector('feGaussianBlur[stdDeviation="7"]')).not.toBeNull()
    const ring = svg.querySelector('.brandMarkOpenedRing')!
    expect(ring.getAttribute('r')).toBe('22')
    expect(ring.getAttribute('stroke-width')).toBe('2')
    expect(ring.getAttribute('vector-effect')).toBe('non-scaling-stroke')
    expect(svg.querySelector('#spiralFill')?.getAttribute('filter')).toBeNull()
    expect(svg.querySelector('style')?.textContent).toContain('var(--brand-mark-signal-color,')
    expect(svg.querySelector('style')?.textContent).toContain('var(--brand-mark-ring-color,')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('prepares a hidden first frame and reveals by the precise appearance schedule', async () => {
    controller.prepareAppearance()
    expect(svg.querySelector<SVGElement>('#spiralStage')?.style.opacity).toBe('0')
    controller.appearance()
    const trace = animationsFor(svg.querySelector('#spiralTrace'))
    expect(
      trace.map((record) => [record.options.duration, record.options.delay, record.options.easing]),
    ).toEqual([
      [1080, 0, 'cubic-bezier(0.45, 0, 0.55, 1)'],
      [780, 80, 'cubic-bezier(0.5, 1, 0.89, 1)'],
    ])
    expect(trace[0]?.keyframes).toEqual([{strokeDashoffset: '603'}, {strokeDashoffset: '0'}])
    expect(trace[1]?.keyframes).toEqual([{strokeWidth: '10'}, {strokeWidth: '72'}])
    const core = coreAnimations()
    expect(core.map((record) => [record.options.duration, record.options.delay])).toEqual([
      [540, 900],
      [160, 900],
    ])
    expect(core[0]?.keyframes[0]?.transform).toBe('scale(0.18)')
    expect(core[0]?.keyframes.some((frame) => Number(String(frame.transform).slice(6, -1)) > 1)).toBe(true)
    expect(animationsFor(svg.querySelector('#coreAura'))[0]?.options).toMatchObject({
      duration: 480,
      delay: 820,
    })
    expect(animationsFor(svg.querySelector('#coreRing'))[0]?.options).toMatchObject({
      duration: 340,
      delay: 1020,
    })
    await vi.advanceTimersByTimeAsync(BRAND_MARK_TIMING.appearance)
    expect(svg.querySelector('#spiralStage')?.hasAttribute('style')).toBe(false)
    expect(records.every((record) => record.cancel.mock.calls.length === 1)).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('runs the accelerating derivation signal each 1400 ms and keeps the full 260 ms core response', async () => {
    controller.startDerivation()
    const signal = animationsFor(svg.querySelector('.brandMarkSignal'))[0]!
    expect(signal.target.getAttribute('transform')).toBe('rotate(-90 128 128)')
    expect(signal.target.style.transformOrigin).toBe('')
    expect(signal.target.style.transformBox).toBe('')
    expect(signal.options).toMatchObject({duration: 1150, fill: 'none'})
    expect(signal.keyframes[0]).toMatchObject({strokeDashoffset: '78', opacity: 0})
    expect(signal.keyframes.at(-1)).toMatchObject({strokeDashoffset: '-603', opacity: 0.85})
    expect(Number(signal.keyframes[40]?.strokeDashoffset)).toBeCloseTo(78 - 681 * 0.5 ** 1.6)
    expect(coreAnimations()[0]?.options).toMatchObject({duration: 260, delay: 1150})
    expect(coreAnimations()[0]?.keyframes[40]?.transform).toBe('scale(1.07)')
    await vi.advanceTimersByTimeAsync(1400)
    expect(animationsFor(svg.querySelector('.brandMarkSignal'))).toHaveLength(2)
    expect(coreAnimations()[0]?.cancel).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(10)
    expect(coreAnimations()[0]?.cancel).toHaveBeenCalledOnce()
    controller.idle()
    expect(vi.getTimerCount()).toBe(0)
    expect(records.every((record) => record.cancel.mock.calls.length === 1)).toBe(true)
  })

  it('finishes from the current path point with u², settling at 220 ms before opening', async () => {
    controller.startDerivation()
    await vi.advanceTimersByTimeAsync(575)
    const complete = vi.fn()
    const promise = controller.finishDerivation().then(complete)
    const path = animationsFor(svg.querySelector('.brandMarkSignal'))[1]!
    const start = -78 + 681 * 0.5 ** 1.6
    expect(path.options.duration).toBe(220)
    expect(Number(path.keyframes[0]?.strokeDashoffset)).toBeCloseTo(-start)
    expect(Number(path.keyframes[40]?.strokeDashoffset)).toBeCloseTo(-(start + (603 - start) * 0.25))
    expect(path.keyframes.at(-1)?.strokeDashoffset).toBe('-603')
    expect(animationsFor(svg.querySelector('.brandMarkOpenedRing'))).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(219)
    expect(complete).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await promise
    expect(complete).toHaveBeenCalledOnce()
    controller.opened()
    const ring = animationsFor(svg.querySelector('.brandMarkOpenedRing'))[0]!
    expect(ring.options).toMatchObject({duration: 550, easing: 'cubic-bezier(0.5, 1, 0.89, 1)'})
    expect(ring.keyframes).toEqual([
      {transform: 'scale(1)', opacity: 0.8},
      {transform: 'scale(4)', opacity: 0},
    ])
    expect(coreAnimations().at(-1)?.options.duration).toBe(220)
    expect(BRAND_MARK_TIMING.openedNavigationDelay).toBe(150)
  })

  it('applies the arrival frame before cancellation when WAAPI lags behind the 220 ms deadline', async () => {
    controller.startDerivation()
    await vi.advanceTimersByTimeAsync(500)
    animationClockLag = 21
    const complete = vi.fn()
    const promise = controller.finishDerivation().then(complete)
    const path = animationsFor(svg.querySelector('.brandMarkSignal'))[1]!

    await vi.advanceTimersByTimeAsync(219)
    expect(path.animation.currentTime).toBe(198)
    expect(path.cancel).not.toHaveBeenCalled()
    expect(complete).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await promise

    expect(performance.now()).toBe(720)
    expect(path.finish).toHaveBeenCalledOnce()
    expect(path.cancelledAt).toEqual([220])
    expect(path.finish.mock.invocationCallOrder[0]).toBeLessThan(path.cancel.mock.invocationCallOrder[0]!)
    expect(complete).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('finishes immediately between signal passes instead of waiting for the next cycle', async () => {
    controller.startDerivation()
    await vi.advanceTimersByTimeAsync(1200)
    await controller.finishDerivation()
    expect(performance.now()).toBe(1200)
    expect(animationsFor(svg.querySelector('.brandMarkSignal'))).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('replaces a state without leaving effects and settles interrupted completion promises', async () => {
    controller.appearance()
    const appearance = [...records]
    controller.startDerivation()
    expect(appearance.every((record) => record.cancel.mock.calls.length === 1)).toBe(true)
    controller.finishDerivation()
    const finish = controller.finishDerivation()
    const resolved = vi.fn()
    void finish.then(resolved)
    controller.returnToLock()
    await Promise.resolve()
    expect(resolved).toHaveBeenCalledOnce()
    expect(coreAnimations().at(-1)?.options.duration).toBe(350)
    expect(coreAnimations().at(-1)?.keyframes[0]?.transform).toBe('scale(0.85)')
    controller.returnToLock()
    expect(coreAnimations().at(-2)?.cancel).toHaveBeenCalledOnce()
    controller.destroy()
    await vi.runAllTimersAsync()
    expect(records.every((record) => record.cancel.mock.calls.length === 1)).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    expect(svg.querySelector('.brandMarkSignal')).toBeNull()
    expect(svg.querySelector('.brandMarkOpenedRing')).toBeNull()
    expect(svg.querySelector('[id^="brandMark"]')).toBeNull()
    expect(svg.querySelector('#coreStage')?.hasAttribute('style')).toBe(false)
    const count = records.length
    controller.appearance()
    controller.startDerivation()
    controller.opened()
    controller.hover()
    expect(records).toHaveLength(count)
  })

  it('uses only a 2400 ms cosine opacity cycle with reduced motion, with immediate completion', async () => {
    setReduced(true)
    controller.prepareAppearance()
    controller.appearance()
    controller.opened()
    controller.returnToLock()
    controller.hover()
    expect(records).toHaveLength(0)
    expect(svg.querySelector('#coreStage')?.hasAttribute('style')).toBe(false)
    controller.startDerivation()
    expect(records).toHaveLength(1)
    expect(records[0]?.target.id).toBe('coreStage')
    expect(records[0]?.options).toMatchObject({duration: 2400, iterations: Infinity})
    expect(records[0]?.keyframes.every((frame) => frame.transform === undefined)).toBe(true)
    expect(records[0]?.keyframes[0]?.opacity).toBe(1)
    expect(records[0]?.keyframes[40]?.opacity).toBe(0.6)
    expect(records[0]?.keyframes.at(-1)?.opacity).toBe(1)
    await controller.finishDerivation()
    expect(vi.getTimerCount()).toBe(0)
    expect(animationsFor(svg.querySelector('.brandMarkSignal'))).toHaveLength(0)
    expect(animationsFor(svg.querySelector('.brandMarkOpenedRing'))).toHaveLength(0)
  })

  it('reacts to reduced motion changes and removes its listener on destruction', async () => {
    const remove = vi.spyOn(reduced, 'removeEventListener')
    controller.startDerivation()
    const original = [...records]
    setReduced(true)
    expect(original.every((record) => record.cancel.mock.calls.length === 1)).toBe(true)
    expect(records.at(-1)?.options.iterations).toBe(Infinity)
    controller.destroy()
    expect(remove).toHaveBeenCalledWith('change', expect.any(Function))
    const count = records.length
    setReduced(false)
    await vi.runAllTimersAsync()
    expect(records).toHaveLength(count)
  })

  it('permits one hover pass only for fine pointers and ignores re-entry while it runs', async () => {
    Object.assign(finePointer, {matches: false})
    controller.hover()
    expect(records).toHaveLength(0)
    Object.assign(finePointer, {matches: true})
    controller.hover()
    const count = records.length
    controller.hover()
    expect(records).toHaveLength(count)
    const signal = records[0]!
    expect(signal.options.duration).toBe(650)
    expect(Number(signal.keyframes[40]?.strokeDashoffset)).toBeCloseTo(78 - 681 * 0.5 ** 1.4)
    expect(coreAnimations()[0]?.options).toMatchObject({duration: 200, delay: 650})
    expect(coreAnimations()[0]?.keyframes[40]?.transform).toBe('scale(1.06)')
    await vi.advanceTimersByTimeAsync(850)
    expect(vi.getTimerCount()).toBe(0)
    controller.hover()
    expect(records.length).toBeGreaterThan(count)
  })

  it('keeps independent reveal masks when header and console marks share a document', () => {
    const container = document.createElement('div')
    container.innerHTML = svgSource
    const second = container.querySelector('svg')!
    document.body.append(second)
    const other = createBrandMarkController(second)
    const firstMask = svg.querySelector('mask')!.id
    const secondMask = second.querySelector('mask')!.id
    expect(firstMask).not.toBe(secondMask)
    expect(svg.querySelector('#spiralStage')?.getAttribute('mask')).toBe(`url(#${firstMask})`)
    expect(second.querySelector('[id=spiralStage]')?.getAttribute('mask')).toBe(`url(#${secondMask})`)
    expect(svg.querySelector('clipPath path')?.getAttribute('d')).toBe(
      svg.querySelector('#spiralFill')?.getAttribute('d'),
    )
    other.destroy()
    expect(second.querySelector('mask')?.id).toBe('spiralRevealMask')
  })

  it('animates namespaced marks independently and restores their prerendered markup', async () => {
    controller.destroy()
    const firstMarkup = createBrandMarkMarkup(svgSource, 'header')
    const secondMarkup = createBrandMarkMarkup(svgSource, 'console')
    document.body.innerHTML = firstMarkup + secondMarkup
    const [first, second] = [...document.querySelectorAll('svg')]
    const original = document.body.innerHTML
    svg = first!
    controller = createBrandMarkController(svg)
    const other = createBrandMarkController(second!)
    const ids = [...document.querySelectorAll('[id]')].map((element) => element.id)
    expect(new Set(ids).size).toBe(ids.length)
    controller.hover()
    other.startDerivation()
    expect(animationsFor(svg.querySelector('.brandMarkSignal'))[0]!.options.duration).toBe(650)
    expect(animationsFor(second!.querySelector('.brandMarkSignal'))[0]!.options.duration).toBe(1150)
    expect(animationsFor(svg.querySelector('#header-coreStage'))[0]!.options.delay).toBe(650)
    expect(animationsFor(second!.querySelector('#console-coreStage'))[0]!.options.delay).toBe(1150)
    controller.destroy()
    expect(second!.querySelector('.brandMarkSignal')).not.toBeNull()
    other.destroy()
    expect(document.body.innerHTML).toBe(original)
    await vi.runAllTimersAsync()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('releases finished effects throughout a long pending operation', async () => {
    controller.startDerivation()
    await vi.advanceTimersByTimeAsync(28_000)
    const held = records.filter((record) => record.cancel.mock.calls.length === 0)
    expect(held.length).toBeLessThanOrEqual(5)
    expect(animationsFor(svg.querySelector('.brandMarkSignal'))).toHaveLength(21)
    controller.idle()
    expect(records.every((record) => record.cancel.mock.calls.length === 1)).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps a static final mark and does not hold completion when WAAPI is unavailable', async () => {
    controller.destroy()
    Reflect.deleteProperty(Element.prototype, 'animate')
    controller = createBrandMarkController(svg)
    controller.prepareAppearance()
    controller.appearance()
    controller.startDerivation()
    await controller.finishDerivation()
    controller.opened()
    controller.returnToLock()
    controller.hover()
    expect(records).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
    expect(svg.querySelector('#coreStage')?.hasAttribute('style')).toBe(false)
  })

  it('restores pre-existing inline attributes and leaves no controller artifacts', () => {
    controller.destroy()
    const core = svg.querySelector('#coreStage')!
    core.setAttribute('style', 'opacity: 0.9')
    controller = createBrandMarkController(svg)
    controller.appearance()
    controller.destroy()
    expect(core.getAttribute('style')).toBe('opacity: 0.9')
    expect(svg.querySelectorAll('defs')).toHaveLength(1)
  })
})
