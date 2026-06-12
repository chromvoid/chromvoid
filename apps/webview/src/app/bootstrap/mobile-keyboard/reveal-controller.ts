import {
  REVEAL_FRAME_LIMIT,
  REVEAL_STABLE_VISIBLE_FRAMES,
} from './constants'
import {
  applyMobileKeyboardScrollAdjustments,
  computeMobileKeyboardRevealAdjustments,
  isMobileKeyboardTargetFullyVisible,
} from './geometry'
import type {ScrollIntentTracker} from './scroll-intent'

type KeyboardScrollDebug = (event: string, details?: Record<string, unknown>) => void

export type RevealController = {
  start(target: HTMLElement, reason: string): void
  refresh(reason: string): void
  cancel(reason?: string): void
  cleanup(): void
}

type RevealControllerOptions = {
  readonly isMobile: () => boolean
  readonly scrollIntent: ScrollIntentTracker
  readonly debug: KeyboardScrollDebug
  readonly readDebugTarget: (element: HTMLElement | null) => string | undefined
}

type RevealSession = {
  readonly target: HTMLElement
  frameCount: number
  stableVisibleFrames: number
  rafId: number
}

export const createRevealController = ({
  isMobile,
  scrollIntent,
  debug,
  readDebugTarget,
}: RevealControllerOptions): RevealController => {
  let session: RevealSession | null = null

  const cancel = (reason = 'cancel') => {
    if (!session) return
    if (session.rafId) window.cancelAnimationFrame(session.rafId)
    debug('reveal.cancel', {
      reason,
      target: readDebugTarget(session.target),
      frameCount: session.frameCount,
    })
    session = null
  }

  const schedule = () => {
    if (!session || session.rafId) return
    const current = session
    current.rafId = window.requestAnimationFrame(() => run(current))
  }

  const run = (current: RevealSession) => {
    current.rafId = 0
    if (session !== current) return

    if (!isMobile() || !current.target.isConnected) {
      cancel('inactive')
      return
    }

    if (scrollIntent.hasRecentUserIntent()) {
      cancel('user-scroll')
      return
    }

    const adjustments = computeMobileKeyboardRevealAdjustments(current.target)
    if (adjustments.length > 0) {
      applyMobileKeyboardScrollAdjustments(adjustments)
      current.stableVisibleFrames = 0
      debug('reveal.scroll', {
        target: readDebugTarget(current.target),
        scrollers: adjustments.length,
      })
    } else if (isMobileKeyboardTargetFullyVisible(current.target)) {
      current.stableVisibleFrames += 1
      if (current.stableVisibleFrames >= REVEAL_STABLE_VISIBLE_FRAMES) {
        cancel('stable-visible')
        return
      }
    } else {
      current.stableVisibleFrames = 0
    }

    current.frameCount += 1
    if (current.frameCount >= REVEAL_FRAME_LIMIT) {
      cancel('frame-limit')
      return
    }

    schedule()
  }

  const start = (target: HTMLElement, reason: string) => {
    if (!isMobile()) return

    if (session?.target !== target) {
      cancel('target-changed')
      session = {target, frameCount: 0, stableVisibleFrames: 0, rafId: 0}
      debug('reveal.start', {reason, target: readDebugTarget(target)})
    }

    schedule()
  }

  return {
    start,
    refresh(reason) {
      if (!session) return
      debug('reveal.refresh', {reason, target: readDebugTarget(session.target)})
      schedule()
    },
    cancel,
    cleanup() {
      cancel('cleanup')
    },
  }
}
