import {atom} from '@reatom/core'

const DEFAULT_ANIMATION_MS = 280
const COMPLETION_ANIMATION_MS = 120

export type AnimatedTransferValueTarget = {
  key: string
  progress: number
  loadedBytes: number
  active: boolean
  done?: boolean
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

function clampBytes(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, value)
}

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

function shouldReduceMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function easeOutCubic(t: number): number {
  const inverse = 1 - t
  return 1 - inverse * inverse * inverse
}

export class AnimatedTransferValueModel {
  readonly progress = atom(0)
  readonly loadedBytes = atom(0)

  private initialized = false
  private targetKey = ''
  private targetProgress = 0
  private targetLoadedBytes = 0
  private targetActive = false
  private targetDone = false
  private startProgress = 0
  private startLoadedBytes = 0
  private animationStartedAt = 0
  private animationDurationMs = DEFAULT_ANIMATION_MS
  private rafId: number | null = null
  private timeoutId: ReturnType<typeof setTimeout> | null = null

  setTargets(target: AnimatedTransferValueTarget): void {
    const key = target.key || 'default'
    const nextProgress = clampPercent(target.progress)
    const nextLoadedBytes = clampBytes(target.loadedBytes)
    const nextActive = target.active
    const nextDone = Boolean(target.done)

    const sameTarget =
      this.initialized &&
      key === this.targetKey &&
      nextProgress === this.targetProgress &&
      nextLoadedBytes === this.targetLoadedBytes &&
      nextActive === this.targetActive &&
      nextDone === this.targetDone

    if (sameTarget) return

    const keyChanged = key !== this.targetKey
    this.targetKey = key
    this.targetProgress = nextProgress
    this.targetLoadedBytes = nextLoadedBytes
    this.targetActive = nextActive
    this.targetDone = nextDone

    if (
      !this.initialized ||
      keyChanged ||
      shouldReduceMotion() ||
      !nextActive ||
      nextProgress < this.progress() ||
      nextLoadedBytes < this.loadedBytes()
    ) {
      this.cancelFrame()
      this.initialized = true
      this.progress.set(nextProgress)
      this.loadedBytes.set(nextLoadedBytes)
      return
    }

    this.initialized = true
    this.startProgress = this.progress()
    this.startLoadedBytes = this.loadedBytes()
    this.animationStartedAt = nowMs()
    this.animationDurationMs = nextDone ? COMPLETION_ANIMATION_MS : DEFAULT_ANIMATION_MS
    this.cancelFrame()
    this.scheduleFrame()
  }

  reset(key = 'default'): void {
    this.cancelFrame()
    this.initialized = false
    this.targetKey = key
    this.targetProgress = 0
    this.targetLoadedBytes = 0
    this.targetActive = false
    this.targetDone = false
    this.progress.set(0)
    this.loadedBytes.set(0)
  }

  dispose(): void {
    this.cancelFrame()
  }

  private readonly step = (timestamp: number) => {
    this.rafId = null
    this.timeoutId = null

    const elapsed = Math.max(0, timestamp - this.animationStartedAt)
    const ratio = this.animationDurationMs > 0 ? Math.min(1, elapsed / this.animationDurationMs) : 1
    const eased = easeOutCubic(ratio)

    this.progress.set(
      Math.min(
        this.targetProgress,
        this.startProgress + (this.targetProgress - this.startProgress) * eased,
      ),
    )
    this.loadedBytes.set(
      Math.min(
        this.targetLoadedBytes,
        this.startLoadedBytes + (this.targetLoadedBytes - this.startLoadedBytes) * eased,
      ),
    )

    if (ratio < 1) {
      this.scheduleFrame()
      return
    }

    this.progress.set(this.targetProgress)
    this.loadedBytes.set(this.targetLoadedBytes)
  }

  private scheduleFrame(): void {
    if (typeof requestAnimationFrame === 'function') {
      this.rafId = requestAnimationFrame(this.step)
      return
    }

    this.timeoutId = setTimeout(() => this.step(nowMs()), 16)
  }

  private cancelFrame(): void {
    if (this.rafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.rafId)
    }
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId)
    }
    this.rafId = null
    this.timeoutId = null
  }
}
