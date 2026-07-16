import {atom} from '@reatom/core'
import {gsap} from 'gsap'
import {
  getStartupSplashSurface,
  isStartupSplashReleased,
  STARTUP_SPLASH_RELEASED_EVENT,
} from 'root/app/bootstrap/startup-splash'

export type WelcomeIconAnimationState = 'idle' | 'active'

const CORE_RING_OPACITY = 0.58
const CORE_AURA_OPACITY = 0.05
const SPIRAL_RIM_START_BLUR = 1.5
const SPIRAL_RIM_START_OPACITY = 0.34
const RIPPLE_WAVE_DURATION = 1.7
const RIPPLE_WAVE_OPACITY = 0.68
const RIPPLE_WAVE_SCALE = 6.15
const ACTIVE_RIPPLE_INTERVALS = [0.7, 0.6, 0.5, 0.4, 0.3] as const
const ACTIVE_RIPPLE_STEADY_INTERVAL = 0.3
const RIPPLE_RISE_DURATION = 0.12

type IconParts = {
  spiralStage: SVGGElement
  spiralTrace: SVGPathElement
  spiralFill: SVGPathElement
  spiralRimBlur: SVGElement
  spiralRimFlood: SVGElement
  coreAura: SVGCircleElement
  coreStage: SVGGElement
  coreRing: SVGCircleElement
  ripplePulseStage: SVGGElement
  ripplePulses: SVGCircleElement[]
}

export class WelcomeIconModel {
  readonly state = atom<WelcomeIconAnimationState>('idle', 'welcomeIconAnimationState')

  private root: ParentNode | null = null
  private iconIntroTimeline: gsap.core.Timeline | null = null
  private ripplePulseTimeline: gsap.core.Timeline | null = null
  private renderedIconState: WelcomeIconAnimationState | null = null
  private iconIntroComplete = false
  private iconIntroPrepared = false
  private startupSplashReleasedHandler: (() => void) | null = null

  idle(): void {
    this.state.set('idle')
  }

  active(): void {
    this.state.set('active')
  }

  setState(state: WelcomeIconAnimationState): void {
    this.state.set(state)
  }

  mount(root: ParentNode): void {
    if (this.root !== root) {
      this.resetAnimation()
      this.root = root
    }

    if (!this.waitForStartupSplashRelease()) return

    this.startIconAfterStartupSplash()
  }

  unmount(): void {
    this.resetAnimation()
    this.root = null
  }

  private resetAnimation(): void {
    this.teardownStartupSplashReleased()
    this.iconIntroTimeline?.kill()
    this.ripplePulseTimeline?.kill()
    this.iconIntroTimeline = null
    this.ripplePulseTimeline = null
    this.renderedIconState = null
    this.iconIntroComplete = false
    this.iconIntroPrepared = false
  }

  private waitForStartupSplashRelease(): boolean {
    if (isStartupSplashReleased()) {
      this.teardownStartupSplashReleased()
      return true
    }

    this.prepareIconIntroInitial()

    if (!this.startupSplashReleasedHandler) {
      this.startupSplashReleasedHandler = () => {
        this.startupSplashReleasedHandler = null
        this.startIconAfterStartupSplash()
      }
      document.addEventListener(STARTUP_SPLASH_RELEASED_EVENT, this.startupSplashReleasedHandler, {
        once: true,
      })
    }

    return false
  }

  private teardownStartupSplashReleased(): void {
    if (!this.startupSplashReleasedHandler) return

    document.removeEventListener(STARTUP_SPLASH_RELEASED_EVENT, this.startupSplashReleasedHandler)
    this.startupSplashReleasedHandler = null
  }

  private prepareIconIntroInitial(): void {
    if (this.renderedIconState === this.state()) return

    const parts = this.getIconParts()
    if (!parts) return

    const initialState = this.state()
    this.renderedIconState = initialState
    this.setExactIconState(parts)

    const traceLength = parts.spiralTrace.getTotalLength()
    if (this.prefersReducedMotion()) {
      this.setIntroFinal(parts, traceLength)
      this.setExactIconState(parts)
      this.iconIntroComplete = true
      return
    }

    this.setIntroInitial(parts, traceLength)
    this.iconIntroPrepared = true
  }

  private initializeIconAnimation(): void {
    if (this.renderedIconState !== null && !this.iconIntroPrepared) return

    const parts = this.getIconParts()
    if (!parts) return

    const initialState = this.renderedIconState ?? this.state()
    if (this.renderedIconState === null) {
      this.renderedIconState = initialState
      this.setExactIconState(parts)
    }

    const traceLength = parts.spiralTrace.getTotalLength()
    if (this.prefersReducedMotion()) {
      this.setIntroFinal(parts, traceLength)
      this.setExactIconState(parts)
      return
    }

    if (!this.iconIntroPrepared) {
      this.setIntroInitial(parts, traceLength)
    }
    this.iconIntroPrepared = false

    const rimTween = {value: 1}
    this.iconIntroTimeline = gsap
      .timeline({
        defaults: {ease: 'power2.out'},
        onComplete: () => {
          this.iconIntroComplete = true
          this.iconIntroTimeline = null
          this.setIntroFinal(parts, traceLength)
          this.completeExactIconState(parts, this.state())
        },
      })
      .to(parts.spiralStage, {opacity: 1, duration: 0.14}, 0)
      .to(parts.spiralTrace, {attr: {'stroke-dashoffset': 0}, duration: 1.08, ease: 'power2.inOut'}, 0)
      .to(parts.spiralTrace, {attr: {'stroke-width': 72}, duration: 0.78}, 0.08)
      .to(parts.spiralStage, {rotation: 0, scale: 1, duration: 1.05, svgOrigin: '128 128'}, 0)
      .to(
        rimTween,
        {
          value: 0,
          duration: 0.45,
          ease: 'power2.in',
          onUpdate: () => {
            parts.spiralRimBlur.setAttribute('stdDeviation', String(SPIRAL_RIM_START_BLUR * rimTween.value))
            parts.spiralRimFlood.setAttribute(
              'flood-opacity',
              String(SPIRAL_RIM_START_OPACITY * rimTween.value),
            )
          },
        },
        0.75,
      )
      .to(
        parts.coreAura,
        {opacity: CORE_AURA_OPACITY, scale: 1, duration: 0.48, ease: 'power2.out', svgOrigin: '128 128'},
        0.82,
      )
      .to(
        parts.coreStage,
        {opacity: 1, scale: 1, duration: 0.54, ease: 'back.out(1.25)', svgOrigin: '128 128'},
        0.9,
      )
      .fromTo(
        parts.coreRing,
        {opacity: 1, scale: 0.88, svgOrigin: '128 128'},
        {opacity: CORE_RING_OPACITY, scale: 1, duration: 0.34},
        1.02,
      )
  }

  private startIconAfterStartupSplash(): void {
    if (this.shouldSkipIntroAfterNativeSplash()) {
      this.finishIconIntroWithoutAnimation()
      this.syncIconAnimationState()
      return
    }

    this.initializeIconAnimation()
    this.syncIconAnimationState()
  }

  private shouldSkipIntroAfterNativeSplash(): boolean {
    return getStartupSplashSurface() === 'native-bridge'
  }

  private syncIconAnimationState(): void {
    const nextState = this.state()
    if (this.renderedIconState === nextState) return

    const parts = this.getIconParts()
    if (!parts) return

    this.finishIconIntro(parts)
    this.animateIconState(parts, nextState)
    this.renderedIconState = nextState
  }

  private animateIconState(parts: IconParts, nextState: WelcomeIconAnimationState): void {
    this.stopRipplePulses(parts)

    if (this.prefersReducedMotion()) {
      this.setExactIconState(parts)
      return
    }

    this.completeExactIconState(parts, nextState)
  }

  private finishIconIntro(parts: IconParts): void {
    if (this.iconIntroComplete) return

    this.iconIntroTimeline?.kill()
    this.iconIntroTimeline = null
    this.iconIntroComplete = true
    this.setIntroFinal(parts, parts.spiralTrace.getTotalLength())
    this.setExactIconState(parts)
  }

  private finishIconIntroWithoutAnimation(): void {
    const parts = this.getIconParts()
    if (!parts) return

    const state = this.state()
    this.iconIntroTimeline?.kill()
    this.iconIntroTimeline = null
    this.iconIntroComplete = true
    this.iconIntroPrepared = false
    this.renderedIconState = state
    this.setIntroFinal(parts, parts.spiralTrace.getTotalLength())
    this.completeExactIconState(parts, state)
  }

  private setIntroInitial(parts: IconParts, traceLength: number): void {
    this.stopRipplePulses(parts)
    parts.spiralFill.setAttribute('filter', 'url(#spiralRimFx)')
    parts.spiralRimBlur.setAttribute('stdDeviation', String(SPIRAL_RIM_START_BLUR))
    parts.spiralRimFlood.setAttribute('flood-opacity', String(SPIRAL_RIM_START_OPACITY))
    gsap.set(parts.spiralStage, {opacity: 0, rotation: -8, scale: 0.88, svgOrigin: '128 128'})
    gsap.set(parts.spiralTrace, {
      attr: {
        'stroke-dasharray': traceLength,
        'stroke-dashoffset': traceLength,
        'stroke-width': 0,
      },
    })
    gsap.set(parts.coreAura, {opacity: 0, scale: 0.8, svgOrigin: '128 128'})
    gsap.set(parts.coreStage, {opacity: 0, scale: 0.18, svgOrigin: '128 128'})
    gsap.set(parts.coreRing, {opacity: 1, scale: 0.88, svgOrigin: '128 128'})
    this.resetRipplePulses(parts)
  }

  private setIntroFinal(parts: IconParts, traceLength: number): void {
    parts.spiralFill.removeAttribute('filter')
    parts.spiralRimBlur.setAttribute('stdDeviation', '0')
    parts.spiralRimFlood.setAttribute('flood-opacity', '0')
    gsap.set(parts.spiralStage, {opacity: 1, rotation: 0, scale: 1, svgOrigin: '128 128'})
    gsap.set(parts.spiralTrace, {
      attr: {
        'stroke-dasharray': traceLength,
        'stroke-dashoffset': 0,
        'stroke-width': 72,
      },
    })
    gsap.set(parts.coreAura, {opacity: CORE_AURA_OPACITY, scale: 1, svgOrigin: '128 128'})
    gsap.set(parts.coreStage, {opacity: 1, scale: 1, svgOrigin: '128 128'})
    gsap.set(parts.coreRing, {opacity: CORE_RING_OPACITY, scale: 1, svgOrigin: '128 128'})
  }

  private completeExactIconState(parts: IconParts, state: WelcomeIconAnimationState): void {
    this.setExactIconState(parts)
    if (this.prefersReducedMotion()) {
      return
    }

    this.startRipplePulses(parts, state)
  }

  private setExactIconState(parts: IconParts): void {
    this.stopRipplePulses()
    parts.coreAura.style.opacity = String(CORE_AURA_OPACITY)
    parts.coreRing.style.opacity = String(CORE_RING_OPACITY)
    this.resetRipplePulses(parts)
  }

  private startRipplePulses(parts: IconParts, state: WelcomeIconAnimationState): void {
    this.stopRipplePulses()
    this.resetRipplePulses(parts)
    gsap.set(parts.ripplePulseStage, {opacity: 1})

    if (state === 'active') {
      this.ripplePulseTimeline = this.startActiveRippleRamp(parts)
      return
    }

    const timeline = gsap.timeline({repeat: -1, repeatDelay: 1.35})
    this.addIdleStyleRippleWave(timeline, parts, 0, 0)
    this.ripplePulseTimeline = timeline
  }

  private startActiveRippleRamp(parts: IconParts): gsap.core.Timeline {
    const timeline = gsap.timeline()
    let at = 0
    let index = 0

    this.addIdleStyleRippleWave(timeline, parts, index, at)

    for (const interval of ACTIVE_RIPPLE_INTERVALS) {
      at += interval
      index = (index + 1) % parts.ripplePulses.length
      this.addIdleStyleRippleWave(timeline, parts, index, at)
    }

    const steadyStart = at + ACTIVE_RIPPLE_STEADY_INTERVAL
    const steadyPeriod = ACTIVE_RIPPLE_STEADY_INTERVAL * parts.ripplePulses.length
    const steadyRepeatDelay = Math.max(0, steadyPeriod - RIPPLE_RISE_DURATION - RIPPLE_WAVE_DURATION)
    const nextSteadyIndex = (index + 1) % parts.ripplePulses.length

    for (let slot = 0; slot < parts.ripplePulses.length; slot += 1) {
      const pulseIndex = (nextSteadyIndex + slot) % parts.ripplePulses.length
      const pulseTimeline = gsap.timeline({repeat: -1, repeatDelay: steadyRepeatDelay})
      this.addIdleStyleRippleWave(pulseTimeline, parts, pulseIndex, 0)
      timeline.add(pulseTimeline, steadyStart + slot * ACTIVE_RIPPLE_STEADY_INTERVAL)
    }

    return timeline
  }

  private addIdleStyleRippleWave(
    timeline: gsap.core.Timeline,
    parts: IconParts,
    index: number,
    at: number,
  ): void {
    this.addRippleWave(timeline, parts, {
      index,
      at,
      duration: RIPPLE_WAVE_DURATION,
      opacity: RIPPLE_WAVE_OPACITY,
      scale: RIPPLE_WAVE_SCALE,
    })
  }

  private addRippleWave(
    timeline: gsap.core.Timeline,
    parts: IconParts,
    wave: {index: number; at: number; duration: number; opacity: number; scale: number},
  ): void {
    const pulse = parts.ripplePulses[wave.index]
    if (!pulse) return

    timeline
      .set(pulse, {opacity: 0, scale: 0.92, svgOrigin: '128 128'}, wave.at)
      .to(pulse, {opacity: wave.opacity, scale: 1.04, duration: RIPPLE_RISE_DURATION, ease: 'sine.out'}, wave.at)
      .to(
        pulse,
        {
          scale: wave.scale,
          duration: wave.duration,
          ease: 'sine.out',
        },
        wave.at + RIPPLE_RISE_DURATION,
      )
      .to(
        pulse,
        {
          duration: wave.duration,
          ease: 'power2.out',
          opacity: 0,
        },
        wave.at + RIPPLE_RISE_DURATION,
      )
  }

  private stopRipplePulses(parts?: IconParts): void {
    this.ripplePulseTimeline?.kill()
    this.ripplePulseTimeline = null
    if (parts) {
      this.resetRipplePulses(parts)
    }
  }

  private resetRipplePulses(parts: IconParts): void {
    gsap.set(parts.ripplePulseStage, {opacity: 0})
    for (const pulse of parts.ripplePulses) {
      gsap.set(pulse, {opacity: 0, scale: 1, svgOrigin: '128 128'})
    }
  }

  private getIconParts(): IconParts | null {
    const svg = this.root?.querySelector<SVGSVGElement>('.welcome-icon svg')
    if (!svg) return null

    const spiralStage = svg.querySelector<SVGGElement>('#spiralStage')
    const spiralTrace = svg.querySelector<SVGPathElement>('#spiralTrace')
    const spiralFill = svg.querySelector<SVGPathElement>('#spiralFill')
    const spiralRimBlur = svg.querySelector<SVGElement>('#spiralRimBlur')
    const spiralRimFlood = svg.querySelector<SVGElement>('#spiralRimFlood')
    const coreAura = svg.querySelector<SVGCircleElement>('#coreAura')
    const coreStage = svg.querySelector<SVGGElement>('#coreStage')
    const coreRing = svg.querySelector<SVGCircleElement>('#coreRing')
    const ripplePulseStage = svg.querySelector<SVGGElement>('#ripplePulseStage')
    const ripplePulses = Array.from(svg.querySelectorAll<SVGCircleElement>('.ripplePulse'))

    if (
      !spiralStage ||
      !spiralTrace ||
      !spiralFill ||
      !spiralRimBlur ||
      !spiralRimFlood ||
      !coreAura ||
      !coreStage ||
      !coreRing ||
      !ripplePulseStage ||
      ripplePulses.length === 0
    ) {
      return null
    }

    return {
      spiralStage,
      spiralTrace,
      spiralFill,
      spiralRimBlur,
      spiralRimFlood,
      coreAura,
      coreStage,
      coreRing,
      ripplePulseStage,
      ripplePulses,
    }
  }

  private prefersReducedMotion(): boolean {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }
}
