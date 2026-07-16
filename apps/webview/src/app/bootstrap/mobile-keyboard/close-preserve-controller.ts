import {
  MIN_SCROLL_ADJUSTMENT_PX,
  PRESERVE_FRAME_LIMIT,
  PRESERVE_WINDOW_MS,
} from './constants'
import {
  getMobileKeyboardScrollerChain,
} from './geometry'
import type {ScrollIntentTracker} from './scroll-intent'
import {
  nowMs,
  roundDebugNumber,
} from './text-field-targets'

type KeyboardScrollDebug = (event: string, details?: Record<string, unknown>) => void

type PreservedScrollerSnapshot = {
  readonly scroller: HTMLElement
  readonly scrollTop: number
  readonly scrollLeft: number
}

type ClosingPreserveSession = {
  readonly target: HTMLElement
  readonly startedAt: number
  readonly previousBottomInset: number
  readonly snapshots: PreservedScrollerSnapshot[]
  frameCount: number
  rafId: number
}

export type ClosePreserveController = {
  start(target: HTMLElement, previousBottomInset: number): void
  cancel(reason?: string): void
  cleanup(): void
}

type ClosePreserveControllerOptions = {
  readonly isMobile: () => boolean
  readonly scrollIntent: ScrollIntentTracker
  readonly debug: KeyboardScrollDebug
  readonly readDebugTarget: (element: HTMLElement | null) => string | undefined
}

const readSnapshots = (target: HTMLElement): PreservedScrollerSnapshot[] =>
  getMobileKeyboardScrollerChain(target).map((scroller) => ({
    scroller,
    scrollTop: scroller.scrollTop,
    scrollLeft: scroller.scrollLeft,
  }))

export const createClosePreserveController = ({
  isMobile,
  scrollIntent,
  debug,
  readDebugTarget,
}: ClosePreserveControllerOptions): ClosePreserveController => {
  let session: ClosingPreserveSession | null = null

  const attachScrollListeners = (snapshots: readonly PreservedScrollerSnapshot[]) => {
    for (const snapshot of snapshots) {
      snapshot.scroller.addEventListener('scroll', handlePreservedScroll, {passive: true})
    }
  }

  const detachScrollListeners = (snapshots: readonly PreservedScrollerSnapshot[]) => {
    for (const snapshot of snapshots) {
      snapshot.scroller.removeEventListener('scroll', handlePreservedScroll)
    }
  }

  const cancel = (reason = 'cancel') => {
    if (!session) return

    const closing = session
    if (closing.rafId) window.cancelAnimationFrame(closing.rafId)
    document.removeEventListener('scroll', handlePreservedScroll, {capture: true})
    detachScrollListeners(closing.snapshots)
    session = null
    debug('closePreserve.cancel', {
      reason,
      target: readDebugTarget(closing.target),
    })
  }

  const restore = (source: string): boolean => {
    const closing = session
    if (!closing) return false

    if (!closing.target.isConnected || closing.snapshots.some((snapshot) => !snapshot.scroller.isConnected)) {
      cancel('disconnected')
      return false
    }

    if (!isMobile()) {
      cancel('not-mobile')
      return false
    }

    const elapsedMs = nowMs() - closing.startedAt
    if (elapsedMs > PRESERVE_WINDOW_MS || closing.frameCount >= PRESERVE_FRAME_LIMIT) {
      cancel('expired')
      return false
    }

    if (scrollIntent.hasUserIntentAfter(closing.startedAt)) {
      cancel('user-scroll')
      return false
    }

    if (scrollIntent.hasProgrammaticScrollAfter(closing.startedAt)) {
      cancel('programmatic-scroll')
      return false
    }

    const changedSnapshots = closing.snapshots.filter(
      (snapshot) =>
        Math.abs(snapshot.scroller.scrollTop - snapshot.scrollTop) > MIN_SCROLL_ADJUSTMENT_PX ||
        Math.abs(snapshot.scroller.scrollLeft - snapshot.scrollLeft) > MIN_SCROLL_ADJUSTMENT_PX,
    )
    if (changedSnapshots.length === 0) return false

    for (const snapshot of changedSnapshots) {
      snapshot.scroller.scrollTop = snapshot.scrollTop
      snapshot.scroller.scrollLeft = snapshot.scrollLeft
    }

    debug('closePreserve.scroll.restore', {
      source,
      target: readDebugTarget(closing.target),
      previousBottomInset: roundDebugNumber(closing.previousBottomInset),
      restoredScrollTop: changedSnapshots.map((snapshot) => roundDebugNumber(snapshot.scrollTop)),
      elapsedMs: roundDebugNumber(elapsedMs),
    })
    return true
  }

  const runFrame = (closing: ClosingPreserveSession) => {
    closing.rafId = 0
    if (session !== closing) return

    restore('frame')
    if (session !== closing) return

    closing.frameCount += 1
    closing.rafId = window.requestAnimationFrame(() => runFrame(closing))
  }

  function handlePreservedScroll() {
    restore('scroll')
  }

  const start = (target: HTMLElement, previousBottomInset: number) => {
    if (!isMobile() || previousBottomInset <= MIN_SCROLL_ADJUSTMENT_PX) return

    cancel('restart')

    const snapshots = readSnapshots(target)
    session = {
      target,
      startedAt: nowMs(),
      previousBottomInset,
      snapshots,
      frameCount: 0,
      rafId: 0,
    }
    attachScrollListeners(snapshots)
    document.addEventListener('scroll', handlePreservedScroll, {capture: true, passive: true})
    debug('closePreserve.start', {
      target: readDebugTarget(target),
      previousBottomInset: roundDebugNumber(previousBottomInset),
    })
    const closing = session
    closing.rafId = window.requestAnimationFrame(() => runFrame(closing))
  }

  return {
    start,
    cancel,
    cleanup() {
      cancel('cleanup')
    },
  }
}
