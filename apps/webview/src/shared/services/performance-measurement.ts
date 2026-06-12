type PerformanceMarkDetail = Record<string, boolean | number | string | null | undefined>

export type FrameRateSampler = {
  stop: (detail?: PerformanceMarkDetail) => void
  cancel: () => void
}

const FRAME_BUDGET_60HZ_MS = 1000 / 60
const LONG_FRAME_GAP_MS = 50

function getPerformanceMarkName(scope: string, phase: string): string {
  return `chromvoid:${scope}:${phase}`
}

export function markPerformance(scope: string, phase: string, detail?: PerformanceMarkDetail): string {
  const name = getPerformanceMarkName(scope, phase)
  if (typeof performance === 'undefined' || typeof performance.mark !== 'function') {
    return name
  }

  try {
    if (detail) {
      performance.mark(name, {detail})
    } else {
      performance.mark(name)
    }
  } catch {
    try {
      performance.mark(name)
    } catch {
      // Performance marks are diagnostic only.
    }
  }

  return name
}

export function startFrameRateSampler(
  scope: string,
  sampleName: string,
  detail?: PerformanceMarkDetail,
): FrameRateSampler {
  const startPhase = `${sampleName}-fps-start`
  const endPhase = `${sampleName}-fps-end`
  const summaryPhase = `${sampleName}-fps-summary`

  markPerformance(scope, startPhase, detail)

  if (
    typeof window === 'undefined' ||
    typeof window.requestAnimationFrame !== 'function' ||
    typeof window.cancelAnimationFrame !== 'function' ||
    typeof performance === 'undefined' ||
    typeof performance.now !== 'function'
  ) {
    return {
      stop: (stopDetail) => {
        markPerformance(scope, summaryPhase, {
          ...detail,
          ...stopDetail,
          available: false,
        })
      },
      cancel: () => {},
    }
  }

  const startedAt = performance.now()
  const frameDeltas: number[] = []
  const observedGaps: number[] = []
  let rafId: number | null = null
  let stopped = false
  let firstFrameAt: number | null = null
  let lastFrameAt: number | null = null

  const tick = (timestamp: number) => {
    if (stopped) return

    if (firstFrameAt === null) {
      firstFrameAt = timestamp
      observedGaps.push(Math.max(0, timestamp - startedAt))
    } else if (lastFrameAt !== null) {
      const frameDelta = timestamp - lastFrameAt
      frameDeltas.push(frameDelta)
      observedGaps.push(frameDelta)
    }

    lastFrameAt = timestamp
    rafId = window.requestAnimationFrame(tick)
  }

  rafId = window.requestAnimationFrame(tick)

  return {
    stop: (stopDetail) => {
      if (stopped) return
      stopped = true

      if (rafId !== null) {
        window.cancelAnimationFrame(rafId)
        rafId = null
      }

      const endedAt = performance.now()
      const durationMs = endedAt - startedAt
      const frameCallbacks = observedGaps.length
      const maxFrameGapMs = frameCallbacks > 0 ? Math.max(...observedGaps) : durationMs
      const avgFrameDeltaMs =
        frameDeltas.length > 0 ? frameDeltas.reduce((sum, gap) => sum + gap, 0) / frameDeltas.length : null
      const cadenceFps = avgFrameDeltaMs !== null && avgFrameDeltaMs > 0 ? 1000 / avgFrameDeltaMs : null
      const intervalFps = durationMs > 0 ? (frameCallbacks * 1000) / durationMs : null
      const droppedFrames60Hz = observedGaps.reduce(
        (count, gap) => count + Math.max(0, Math.round(gap / FRAME_BUDGET_60HZ_MS) - 1),
        frameCallbacks === 0 ? Math.max(0, Math.round(durationMs / FRAME_BUDGET_60HZ_MS) - 1) : 0,
      )

      markPerformance(scope, endPhase, stopDetail)
      markPerformance(scope, summaryPhase, {
        ...detail,
        ...stopDetail,
        available: true,
        durationMs: roundMetric(durationMs),
        frameCallbacks,
        firstFrameDelayMs: firstFrameAt === null ? null : roundMetric(Math.max(0, firstFrameAt - startedAt)),
        avgFrameDeltaMs: avgFrameDeltaMs === null ? null : roundMetric(avgFrameDeltaMs),
        maxFrameGapMs: roundMetric(maxFrameGapMs),
        cadenceFps: cadenceFps === null ? null : roundMetric(cadenceFps),
        intervalFps: intervalFps === null ? null : roundMetric(intervalFps),
        droppedFrames60Hz,
        longFrameGaps50Ms: observedGaps.filter((gap) => gap >= LONG_FRAME_GAP_MS).length,
      })
    },
    cancel: () => {
      if (stopped) return
      stopped = true

      if (rafId !== null) {
        window.cancelAnimationFrame(rafId)
        rafId = null
      }
    },
  }
}

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100
}

export function measurePerformance(
  scope: string,
  measureName: string,
  startPhase: string,
  endPhase: string,
): string {
  const name = getPerformanceMarkName(scope, measureName)
  if (typeof performance === 'undefined' || typeof performance.measure !== 'function') {
    return name
  }

  try {
    performance.measure(
      name,
      getPerformanceMarkName(scope, startPhase),
      getPerformanceMarkName(scope, endPhase),
    )
  } catch {
    // The start mark may be absent when a shared dialog is measured outside its caller.
  }

  return name
}
