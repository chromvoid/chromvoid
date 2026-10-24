/** Web implementation of business/brand/motion.md. The inline SVG remains the geometry source. */
export {createBrandMarkMarkup} from './markup'

export const BRAND_MARK_TIMING = {
  appearance: 1440,
  derivationCycle: 1400,
  derivationRun: 1150,
  derivationResponse: 260,
  derivationFinish: 220,
  openedRing: 550,
  openedResponse: 220,
  openedNavigationDelay: 150,
  returnToLock: 350,
  hoverRun: 650,
  hoverResponse: 200,
  reducedDerivation: 2400,
} as const

export interface BrandMarkController {
  /** Hide the first frame while the consumer waits for its startup canvas to release. */
  prepareAppearance(): void
  appearance(): void
  startDerivation(): void
  /** Settles on arrival at the core, or immediately between runs / with reduced motion. */
  finishDerivation(): Promise<void>
  opened(): void
  returnToLock(): void
  hover(): void
  idle(): void
  /** Cancels effects, settles pending completion, and restores the original inline SVG. */
  destroy(): void
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const EASE_OUT = 'cubic-bezier(0.5, 1, 0.89, 1)'
const EASE_IN_OUT = 'cubic-bezier(0.45, 0, 0.55, 1)'
const SIGNAL_LENGTH = 78
const SAMPLES = 80
let instanceId = 0

type State = 'idle' | 'prepared' | 'appearance' | 'derivation' | 'finishing' | 'opened' | 'return' | 'hover'
type Parts = {
  mark: SVGGElement
  spiral: SVGGElement
  trace: SVGPathElement
  fill: SVGPathElement
  aura: SVGCircleElement
  core: SVGGElement
  ring: SVGCircleElement
}

function required<T extends SVGElement>(svg: SVGSVGElement, id: string): T {
  const prefix = svg.getAttribute('data-brand-mark-prefix')
  const part = svg.querySelector<T>(`[id="${prefix ? `${prefix}-${id}` : id}"]`)
  if (!part) throw new Error(`ChromVoid brand mark is missing #${id}`)
  return part
}

function frames(sample: (fraction: number) => Keyframe): Keyframe[] {
  return Array.from({length: SAMPLES + 1}, (_, index) => {
    const offset = index / SAMPLES
    return {...sample(offset), offset}
  })
}

function backOut(fraction: number, overshoot: number): number {
  const shifted = fraction - 1
  return 1 + (overshoot + 1) * shifted ** 3 + overshoot * shifted ** 2
}

/** CSS colors are inherited from --brand-mark-signal-color / --brand-mark-ring-color in the SVG. */
export function createBrandMarkController(svg: SVGSVGElement): BrandMarkController {
  return new SvgBrandMarkController(svg)
}

class SvgBrandMarkController implements BrandMarkController {
  private readonly parts: Parts
  private readonly initialStyles: Map<SVGElement, string | null>
  private readonly added: SVGElement[] = []
  private readonly animations = new Set<Animation>()
  private readonly timers = new Set<ReturnType<typeof setTimeout>>()
  private readonly reduced: MediaQueryList | undefined
  private readonly finePointer: MediaQueryList | undefined
  private readonly signal: SVGPathElement
  private readonly openedRing: SVGCircleElement
  private readonly length: number
  private readonly canAnimate: boolean
  private readonly revealMask: SVGMaskElement
  private readonly initialRevealId: string | null
  private readonly initialSceneMask: string | null
  private state: State = 'idle'
  private generation = 0
  private destroyed = false
  private signalRun: {animation: Animation; startedAt: number; duration: number; power: number} | undefined
  private finishPromise: Promise<void> | undefined
  private settleFinish: (() => void) | undefined
  private readonly motionChanged = () => {
    if (this.state === 'derivation') this.startDerivation()
    else if (this.reduced?.matches) this.idle()
  }

  constructor(private readonly svg: SVGSVGElement) {
    this.parts = {
      mark: required(svg, 'iconMark'),
      spiral: required(svg, 'spiralStage'),
      trace: required(svg, 'spiralTrace'),
      fill: required(svg, 'spiralFill'),
      aura: required(svg, 'coreAura'),
      core: required(svg, 'coreStage'),
      ring: required(svg, 'coreRing'),
    }
    this.initialStyles = new Map(
      [this.parts.spiral, this.parts.trace, this.parts.aura, this.parts.core, this.parts.ring].map((part) => [
        part,
        part.getAttribute('style'),
      ]),
    )
    this.canAnimate = typeof svg.animate === 'function'
    this.length = this.parts.trace.getTotalLength?.() ?? 0
    this.revealMask = required(svg, 'spiralRevealMask')
    this.initialRevealId = this.revealMask.getAttribute('id')
    this.initialSceneMask = this.parts.spiral.getAttribute('mask')
    const view = svg.ownerDocument.defaultView
    this.reduced = view?.matchMedia?.('(prefers-reduced-motion: reduce)')
    this.finePointer = view?.matchMedia?.('(hover: hover) and (pointer: fine)')
    this.reduced?.addEventListener('change', this.motionChanged)

    const prefix = `brandMark${++instanceId}`
    this.revealMask.id = `${prefix}Reveal`
    this.parts.spiral.setAttribute('mask', `url(#${prefix}Reveal)`)
    const defs = this.create('defs')
    const clip = this.create('clipPath', {id: `${prefix}Ribbon`, clipPathUnits: 'userSpaceOnUse'})
    clip.append(
      this.create('path', {d: this.parts.fill.getAttribute('d') ?? '', transform: 'rotate(-90 128 128)'}),
    )
    const blur = this.create('filter', {
      id: `${prefix}SoftSignal`,
      filterUnits: 'userSpaceOnUse',
      x: '0',
      y: '0',
      width: '256',
      height: '256',
    })
    blur.append(this.create('feGaussianBlur', {stdDeviation: '7'}))
    defs.append(clip, blur)
    svg.prepend(defs)

    const signalStage = this.create('g', {'clip-path': `url(#${prefix}Ribbon)`})
    this.signal = this.create('path', {
      class: 'brandMarkSignal',
      d: this.parts.trace.getAttribute('d') ?? '',
      transform: 'rotate(-90 128 128)',
      fill: 'none',
      'stroke-width': '96',
      'stroke-linecap': 'butt',
      'stroke-dasharray': `${SIGNAL_LENGTH} ${this.length + SIGNAL_LENGTH}`,
      filter: `url(#${prefix}SoftSignal)`,
      opacity: '0',
    })
    signalStage.append(this.signal)
    // The scene's reveal mask also clips the signal; the ribbon clip follows its exact visible shape.
    this.parts.spiral.append(signalStage)
    this.openedRing = this.create('circle', {
      class: 'brandMarkOpenedRing',
      cx: '128',
      cy: '128',
      r: '22',
      fill: 'none',
      'stroke-width': '2',
      'vector-effect': 'non-scaling-stroke',
      opacity: '0',
    })
    this.parts.mark.append(this.openedRing)
    this.added.push(defs, signalStage, this.openedRing)
  }

  prepareAppearance(): void {
    if (!this.begin('prepared') || !this.canAnimate || this.reduced?.matches) return
    for (const part of [this.parts.spiral, this.parts.aura, this.parts.core]) part.style.opacity = '0'
  }

  appearance(): void {
    if (!this.begin('appearance') || !this.canAnimate || this.reduced?.matches) return
    const {spiral, trace, aura, core, ring} = this.parts
    trace.style.strokeDasharray = `${this.length}`
    this.animate(spiral, [{opacity: 0}, {opacity: 1}], 140)
    this.animate(trace, [{strokeDashoffset: `${this.length}`}, {strokeDashoffset: '0'}], 1080, 0, EASE_IN_OUT)
    this.animate(trace, [{strokeWidth: '10'}, {strokeWidth: '72'}], 780, 80, EASE_OUT)
    this.animate(
      spiral,
      [{transform: 'rotate(-8deg) scale(0.88)'}, {transform: 'rotate(0deg) scale(1)'}],
      1050,
      0,
      EASE_OUT,
    )
    this.animate(
      aura,
      [
        {opacity: 0, transform: 'scale(0.8)'},
        {opacity: 0.05, transform: 'scale(1)'},
      ],
      480,
      820,
      EASE_OUT,
    )
    this.animate(
      core,
      frames((u) => ({transform: `scale(${0.18 + 0.82 * backOut(u, 1.25)})`})),
      540,
      900,
    )
    this.animate(core, [{opacity: 0}, {opacity: 1}], 160, 900, EASE_OUT)
    this.animate(
      ring,
      [
        {opacity: 1, transform: 'scale(0.88)'},
        {opacity: 0.58, transform: 'scale(1)'},
      ],
      340,
      1020,
      EASE_OUT,
    )
    this.after(BRAND_MARK_TIMING.appearance, () => this.idle())
  }

  startDerivation(): void {
    if (!this.begin('derivation') || !this.canAnimate) return
    if (this.reduced?.matches) {
      this.animate(
        this.parts.core,
        frames((u) => ({opacity: 1 - 0.4 * (0.5 - 0.5 * Math.cos(2 * Math.PI * u))})),
        BRAND_MARK_TIMING.reducedDerivation,
        0,
        'linear',
        Infinity,
      )
      return
    }
    // Infinite motion only while a real key derivation is pending; idle() cancels the next pass.
    const cycle = () => {
      this.runSignal(BRAND_MARK_TIMING.derivationRun, 1.6)
      this.coreResponse(BRAND_MARK_TIMING.derivationResponse, 0.07, 0.22, BRAND_MARK_TIMING.derivationRun)
      this.after(BRAND_MARK_TIMING.derivationCycle, cycle)
    }
    cycle()
  }

  finishDerivation(): Promise<void> {
    if (this.finishPromise) return this.finishPromise
    const run = this.state === 'derivation' ? this.signalRun : undefined
    const elapsed = run ? Number(run.animation.currentTime ?? performance.now() - run.startedAt) : Infinity
    const inFlight = run && elapsed < run.duration && !this.reduced?.matches
    const start = inFlight
      ? -SIGNAL_LENGTH + (this.length + SIGNAL_LENGTH) * (elapsed / run.duration) ** run.power
      : this.length
    if (!this.begin('finishing') || !inFlight) return Promise.resolve()

    const promise = new Promise<void>((resolve) => {
      this.settleFinish = resolve
    })
    this.finishPromise = promise
    const arrival = this.animate(
      this.signal,
      frames((u) => ({strokeDashoffset: `${-(start + (this.length - start) * u ** 2)}`})),
      BRAND_MARK_TIMING.derivationFinish,
    )
    const timelineTime = this.svg.ownerDocument.timeline?.currentTime
    if (typeof timelineTime === 'number') arrival.startTime = timelineTime
    this.animate(
      this.signal,
      [{opacity: Math.min(elapsed / 140, 1) * 0.85}, {opacity: 0.85}],
      Math.min(140, BRAND_MARK_TIMING.derivationFinish),
    )
    this.after(BRAND_MARK_TIMING.derivationFinish, () => {
      // WAAPI may still be on the preceding frame when the wall-clock deadline fires.
      // Apply the arrival keyframe before releasing effects and settling the result.
      arrival.finish()
      this.idle()
    })
    return promise
  }

  opened(): void {
    if (!this.begin('opened') || !this.canAnimate || this.reduced?.matches) return
    this.animate(
      this.openedRing,
      [
        {transform: 'scale(1)', opacity: 0.8},
        {transform: 'scale(4)', opacity: 0},
      ],
      BRAND_MARK_TIMING.openedRing,
      0,
      EASE_OUT,
    )
    this.coreResponse(BRAND_MARK_TIMING.openedResponse, 0.06, 0.2)
    this.after(BRAND_MARK_TIMING.openedRing, () => this.idle())
  }

  returnToLock(): void {
    if (!this.begin('return') || !this.canAnimate || this.reduced?.matches) return
    this.animate(
      this.parts.core,
      frames((u) => ({transform: `scale(${0.85 + 0.15 * backOut(u, 1)})`})),
      BRAND_MARK_TIMING.returnToLock,
    )
    this.after(BRAND_MARK_TIMING.returnToLock, () => this.idle())
  }

  hover(): void {
    if (!this.canAnimate || !this.finePointer?.matches || this.reduced?.matches || this.destroyed) return
    const run = this.state === 'hover' ? this.signalRun : undefined
    if (run && Number(run.animation.currentTime ?? performance.now() - run.startedAt) < run.duration) return
    if (!this.begin('hover')) return
    this.runSignal(BRAND_MARK_TIMING.hoverRun, 1.4)
    this.coreResponse(BRAND_MARK_TIMING.hoverResponse, 0.06, 0, BRAND_MARK_TIMING.hoverRun)
    this.after(BRAND_MARK_TIMING.hoverRun + BRAND_MARK_TIMING.hoverResponse, () => this.idle())
  }

  idle(): void {
    this.begin('idle')
  }

  destroy(): void {
    if (this.destroyed) return
    this.idle()
    this.destroyed = true
    this.reduced?.removeEventListener('change', this.motionChanged)
    for (const part of this.added) part.remove()
    if (this.initialRevealId === null) this.revealMask.removeAttribute('id')
    else this.revealMask.setAttribute('id', this.initialRevealId)
    if (this.initialSceneMask === null) this.parts.spiral.removeAttribute('mask')
    else this.parts.spiral.setAttribute('mask', this.initialSceneMask)
  }

  private begin(state: State): boolean {
    if (this.destroyed) return false
    this.generation += 1
    for (const timer of this.timers) clearTimeout(timer)
    this.timers.clear()
    for (const animation of this.animations) animation.cancel()
    this.animations.clear()
    for (const [part, style] of this.initialStyles) {
      if (style === null) part.removeAttribute('style')
      else part.setAttribute('style', style)
    }
    this.signalRun = undefined
    this.settleFinish?.()
    this.settleFinish = undefined
    this.finishPromise = undefined
    this.state = state
    return true
  }

  private runSignal(duration: number, power: number): void {
    const animation = this.animate(
      this.signal,
      frames((u) => ({
        strokeDashoffset: `${SIGNAL_LENGTH - (this.length + SIGNAL_LENGTH) * u ** power}`,
        opacity: Math.min((u * duration) / 140, 1) * 0.85,
      })),
      duration,
      0,
      'linear',
      1,
      'none',
    )
    this.signalRun = {animation, startedAt: performance.now(), duration, power}
  }

  private coreResponse(duration: number, scale: number, aura: number, delay = 0): void {
    this.animate(
      this.parts.core,
      frames((u) => ({transform: `scale(${1 + scale * Math.sin(Math.PI * u)})`})),
      duration,
      delay,
      'linear',
      1,
      'none',
    )
    if (aura)
      this.animate(
        this.parts.aura,
        frames((u) => ({opacity: 0.05 + aura * Math.sin(Math.PI * u)})),
        duration,
        delay,
        'linear',
        1,
        'none',
      )
  }

  private animate(
    part: SVGElement,
    keyframes: Keyframe[],
    duration: number,
    delay = 0,
    easing = 'linear',
    iterations = 1,
    fill: FillMode = 'both',
  ): Animation {
    // Preserve SVG transforms that already carry their own center (the signal's rotated path).
    if (keyframes.some((frame) => frame['transform'] !== undefined)) {
      part.style.transformOrigin = '128px 128px'
      part.style.transformBox = 'view-box'
    }
    const animation = part.animate(keyframes, {duration, delay, easing, iterations, fill})
    this.animations.add(animation)
    // Finished finite effects keep their final frame until the state restores the original SVG.
    void animation.finished.then(
      () => {
        if (fill === 'none') {
          this.animations.delete(animation)
          animation.cancel()
        }
      },
      () => {},
    )
    return animation
  }

  private after(duration: number, callback: () => void): void {
    const generation = this.generation
    const timer = setTimeout(() => {
      this.timers.delete(timer)
      if (generation === this.generation && !this.destroyed) callback()
    }, duration)
    this.timers.add(timer)
  }

  private create<K extends keyof SVGElementTagNameMap>(
    tag: K,
    attributes: Record<string, string> = {},
  ): SVGElementTagNameMap[K] {
    const element = this.svg.ownerDocument.createElementNS(SVG_NS, tag)
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value)
    return element
  }
}
