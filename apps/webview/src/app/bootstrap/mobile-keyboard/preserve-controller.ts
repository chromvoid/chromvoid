import {
  MIN_SCROLL_ADJUSTMENT_PX,
  PRESERVE_FRAME_LIMIT,
  PRESERVE_WINDOW_MS,
} from './constants'
import {
  getMobileKeyboardScrollerChain,
  getMobileKeyboardVisibleScrollContainer,
  isMobileKeyboardTargetFullyVisible,
} from './geometry'
import type {MobileKeyboardStateSnapshot} from './keyboard-state'
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
  readonly scrollHeight: number
}

type PreservedScrollSource = 'tap' | 'input' | 'focus'

type PreservedFocusedScroll = {
  readonly target: HTMLElement
  readonly source: PreservedScrollSource
  readonly startedAt: number
  readonly targetHeight: number
  visibleTop: number
  visibleBottom: number
  snapshots: PreservedScrollerSnapshot[]
  frameCount: number
  rafId: number
}

export type PreserveController = {
  start(target: HTMLElement, source: PreservedScrollSource): void
  cancel(reason?: string): void
  cleanup(): void
}

type PreserveControllerOptions = {
  readonly isMobile: () => boolean
  readonly getKeyboardState: () => MobileKeyboardStateSnapshot
  readonly getActiveTarget: () => HTMLElement | null
  readonly hasUserScrollAuthority: () => boolean
  readonly scrollIntent: ScrollIntentTracker
  readonly debug: KeyboardScrollDebug
  readonly readDebugTarget: (element: HTMLElement | null) => string | undefined
}

const readSnapshots = (target: HTMLElement): PreservedScrollerSnapshot[] =>
  getMobileKeyboardScrollerChain(target).map((scroller) => ({
    scroller,
    scrollTop: scroller.scrollTop,
    scrollLeft: scroller.scrollLeft,
    scrollHeight: scroller.scrollHeight,
  }))

const readTargetHeight = (target: HTMLElement): number => {
  const rect = target.getBoundingClientRect()
  return Number.isFinite(rect.height) ? rect.height : Math.max(0, rect.bottom - rect.top)
}

export const createPreserveController = ({
  isMobile,
  getKeyboardState,
  getActiveTarget,
  hasUserScrollAuthority,
  scrollIntent,
  debug,
  readDebugTarget,
}: PreserveControllerOptions): PreserveController => {
  let preservedFocusedScroll: PreservedFocusedScroll | null = null

  // Scroll events are composed: false — a document-level capture listener never
  // sees scrolls inside shadow roots, so each chain scroller gets a direct
  // listener; the document listener stays as a catch-all for light-DOM scrolls.
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
    if (!preservedFocusedScroll) return

    const preserved = preservedFocusedScroll
    if (preserved.rafId) window.cancelAnimationFrame(preserved.rafId)
    document.removeEventListener('scroll', handlePreservedScroll, {capture: true})
    detachScrollListeners(preserved.snapshots)
    preservedFocusedScroll = null
    debug('preserve.cancel', {
      reason,
      target: readDebugTarget(preserved.target),
      trigger: preserved.source,
    })
  }

  const hasGeometryGrowth = (preserved: PreservedFocusedScroll): boolean => {
    const currentTargetHeight = readTargetHeight(preserved.target)
    if (currentTargetHeight - preserved.targetHeight > MIN_SCROLL_ADJUSTMENT_PX) return true

    return preserved.snapshots.some(
      (snapshot) => snapshot.scroller.scrollHeight - snapshot.scrollHeight > MIN_SCROLL_ADJUSTMENT_PX,
    )
  }

  const restore = (source: string): boolean => {
    const preserved = preservedFocusedScroll
    if (!preserved) return false

    if (!preserved.target.isConnected || preserved.snapshots.some((snapshot) => !snapshot.scroller.isConnected)) {
      cancel('disconnected')
      return false
    }

    if (!isMobile() || getKeyboardState().status === 'closed') {
      cancel('keyboard-closed')
      return false
    }

    if (getActiveTarget() !== preserved.target) {
      cancel('target-changed')
      return false
    }

    const elapsedMs = nowMs() - preserved.startedAt
    if (elapsedMs > PRESERVE_WINDOW_MS || preserved.frameCount >= PRESERVE_FRAME_LIMIT) {
      cancel('expired')
      return false
    }

    // Only intents NEWER than the session matter: a deliberate user scroll just
    // before the keystroke must not disarm the protection against the native
    // jump that the keystroke itself triggers.
    if (scrollIntent.hasUserIntentAfter(preserved.startedAt)) {
      cancel('user-scroll')
      return false
    }

    if (scrollIntent.hasProgrammaticScrollAfter(preserved.startedAt)) {
      cancel('programmatic-scroll')
      return false
    }

    if (hasGeometryGrowth(preserved)) {
      debug('preserve.skip', {
        reason: 'geometry-growth',
        source,
        trigger: preserved.source,
        target: readDebugTarget(preserved.target),
      })
      cancel('geometry-growth')
      return false
    }

    if (!isMobileKeyboardTargetFullyVisible(preserved.target)) {
      const visible = getMobileKeyboardVisibleScrollContainer(preserved.target)
      const viewportChanged =
        !visible ||
        Math.abs(visible.top - preserved.visibleTop) > MIN_SCROLL_ADJUSTMENT_PX ||
        Math.abs(visible.bottom - preserved.visibleBottom) > MIN_SCROLL_ADJUSTMENT_PX
      // The visible area itself changed (keyboard inset grew) — the occlusion is
      // genuine and revealing is legitimate, so yield. With an unchanged viewport
      // the scroll under judgement is what pushed the field out of view — that is
      // exactly the native jump this controller exists to revert.
      if (viewportChanged) {
        cancel('target-occluded')
        return false
      }
    }

    const changedSnapshots = preserved.snapshots.filter(
      (snapshot) =>
        Math.abs(snapshot.scroller.scrollTop - snapshot.scrollTop) > MIN_SCROLL_ADJUSTMENT_PX ||
        Math.abs(snapshot.scroller.scrollLeft - snapshot.scrollLeft) > MIN_SCROLL_ADJUSTMENT_PX,
    )
    if (changedSnapshots.length === 0) return false

    for (const snapshot of changedSnapshots) {
      snapshot.scroller.scrollTop = snapshot.scrollTop
      snapshot.scroller.scrollLeft = snapshot.scrollLeft
    }

    debug('settledFocus.scroll.restore', {
      source,
      trigger: preserved.source,
      target: readDebugTarget(preserved.target),
      restoredScrollTop: changedSnapshots.map((snapshot) => roundDebugNumber(snapshot.scrollTop)),
      elapsedMs: roundDebugNumber(elapsedMs),
    })
    return true
  }

  const runFrame = (preserved: PreservedFocusedScroll) => {
    preserved.rafId = 0
    if (preservedFocusedScroll !== preserved) return

    restore('frame')
    if (preservedFocusedScroll !== preserved) return

    preserved.frameCount += 1
    preserved.rafId = window.requestAnimationFrame(() => runFrame(preserved))
  }

  function handlePreservedScroll() {
    restore('scroll')
  }

  const start = (target: HTMLElement, source: PreservedScrollSource) => {
    // Any non-closed keyboard counts: the native caret jump on the first
    // keystroke arrives while the keyboard is still 'opening', and a fully
    // visible field deserves the same protection there as when settled.
    if (!isMobile() || getKeyboardState().status === 'closed') return
    if (getActiveTarget() !== target) return
    // After a deliberate user scroll their position is sovereign: pin it even
    // when the field is out of view, so typing cannot yank the page back.
    if (!isMobileKeyboardTargetFullyVisible(target) && !hasUserScrollAuthority()) return

    const existing = preservedFocusedScroll
    if (existing?.target === target) {
      const elapsedMs = nowMs() - existing.startedAt
      const expired = elapsedMs > PRESERVE_WINDOW_MS || existing.frameCount >= PRESERVE_FRAME_LIMIT
      // Within the active window keystrokes refresh the baseline without
      // extending it; after expiry the trigger opens a fresh episode instead
      // of being swallowed by the stale session.
      if (!expired) {
        if (hasGeometryGrowth(existing)) {
          cancel('geometry-growth')
          return
        }

        detachScrollListeners(existing.snapshots)
        existing.snapshots = readSnapshots(target)
        attachScrollListeners(existing.snapshots)
        const visible = getMobileKeyboardVisibleScrollContainer(target)
        if (visible) {
          existing.visibleTop = visible.top
          existing.visibleBottom = visible.bottom
        }
        return
      }
    }

    cancel('restart')

    const visible = getMobileKeyboardVisibleScrollContainer(target)
    preservedFocusedScroll = {
      target,
      source,
      startedAt: nowMs(),
      targetHeight: readTargetHeight(target),
      visibleTop: visible?.top ?? 0,
      visibleBottom: visible?.bottom ?? 0,
      snapshots: readSnapshots(target),
      frameCount: 0,
      rafId: 0,
    }
    attachScrollListeners(preservedFocusedScroll.snapshots)
    document.addEventListener('scroll', handlePreservedScroll, {capture: true, passive: true})
    debug('settledFocus.preserve.start', {
      source,
      target: readDebugTarget(target),
      keyboardSource: getKeyboardState().source,
    })
    const preserved = preservedFocusedScroll
    preserved.rafId = window.requestAnimationFrame(() => runFrame(preserved))
  }

  return {
    start,
    cancel,
    cleanup() {
      cancel('cleanup')
    },
  }
}
