type IdleSchedulerGlobal = typeof globalThis & {
  requestIdleCallback?: (callback: () => void, options?: {timeout: number}) => number
  cancelIdleCallback?: (handle: number) => void
}

export type AfterFirstPaintIdleOptions = {
  delayMs?: number
  timeoutMs?: number
}

export function scheduleAfterFirstPaintIdle(
  task: () => void,
  options: AfterFirstPaintIdleOptions = {},
): () => void {
  const delayMs = options.delayMs ?? 0
  const timeoutMs = options.timeoutMs ?? 1_500
  let cancelled = false
  let loadListener: (() => void) | null = null
  let delayTimerId: number | null = null
  let fallbackTimerId: number | null = null
  let firstFrameId: number | null = null
  let secondFrameId: number | null = null
  let idleCallbackId: number | null = null

  const runTask = () => {
    if (cancelled) return
    task()
  }

  const runInIdle = () => {
    if (cancelled) return

    const idleGlobal = globalThis as IdleSchedulerGlobal
    if (typeof idleGlobal.requestIdleCallback === 'function') {
      idleCallbackId = idleGlobal.requestIdleCallback(
        () => {
          idleCallbackId = null
          runTask()
        },
        {timeout: timeoutMs},
      )
      return
    }

    fallbackTimerId = window.setTimeout(() => {
      fallbackTimerId = null
      runTask()
    }, 0)
  }

  const enqueue = () => {
    if (cancelled) return

    if (delayMs > 0) {
      delayTimerId = window.setTimeout(() => {
        delayTimerId = null
        runInIdle()
      }, delayMs)
      return
    }

    runInIdle()
  }

  const kickoff = () => {
    if (cancelled) return

    firstFrameId = window.requestAnimationFrame(() => {
      firstFrameId = null
      if (cancelled) return

      secondFrameId = window.requestAnimationFrame(() => {
        secondFrameId = null
        enqueue()
      })
    })
  }

  if (document.readyState === 'complete') {
    kickoff()
  } else {
    loadListener = kickoff
    window.addEventListener('load', loadListener, {once: true})
  }

  return () => {
    cancelled = true

    if (loadListener) {
      window.removeEventListener('load', loadListener)
      loadListener = null
    }
    if (delayTimerId !== null) {
      window.clearTimeout(delayTimerId)
      delayTimerId = null
    }
    if (fallbackTimerId !== null) {
      window.clearTimeout(fallbackTimerId)
      fallbackTimerId = null
    }
    if (firstFrameId !== null) {
      window.cancelAnimationFrame(firstFrameId)
      firstFrameId = null
    }
    if (secondFrameId !== null) {
      window.cancelAnimationFrame(secondFrameId)
      secondFrameId = null
    }
    if (idleCallbackId !== null) {
      const idleGlobal = globalThis as IdleSchedulerGlobal
      idleGlobal.cancelIdleCallback?.(idleCallbackId)
      idleCallbackId = null
    }
  }
}
