import {markStartupTimeline} from './startup-timeline'

export const STARTUP_CONTENT_READY_EVENT = 'chromvoid:startup-content-ready'

interface StartupContentReadyOptions {
  criticalSelectors?: readonly string[]
  timeoutMs?: number
}

type UpdateCompleteHost = HTMLElement & {
  updateComplete?: Promise<unknown>
}

const STARTUP_CONTENT_READY_DATA_KEY = 'startupContentReady'
const DEEP_SELECTOR_DELIMITER = '>>>'
const DEFAULT_STARTUP_STABLE_TIMEOUT_MS = 1_800
const STARTUP_STABLE_FRAME_COUNT = 3

export function isStartupContentReady(): boolean {
  return document.documentElement.dataset[STARTUP_CONTENT_READY_DATA_KEY] === 'true'
}

export function markStartupContentReady(): void {
  if (isStartupContentReady()) {
    markStartupTimeline('web.startup-readiness.mark-skip-already-ready')
    return
  }

  document.documentElement.dataset[STARTUP_CONTENT_READY_DATA_KEY] = 'true'
  markStartupTimeline('web.startup-readiness.mark-ready')
  document.dispatchEvent(new CustomEvent(STARTUP_CONTENT_READY_EVENT))
}

export function markStartupContentReadyWhenStable(
  host: HTMLElement,
  options: StartupContentReadyOptions = {},
): void {
  if (isStartupContentReady()) {
    markStartupTimeline('web.startup-readiness.wait-skip-already-ready', {host: host.tagName.toLowerCase()})
    return
  }

  const startedAt = performance.now()
  const timeoutMs = options.timeoutMs ?? DEFAULT_STARTUP_STABLE_TIMEOUT_MS
  const criticalSelectors = options.criticalSelectors ?? []

  markStartupTimeline('web.startup-readiness.wait-start', {
    host: host.tagName.toLowerCase(),
    selectors: criticalSelectors.join(',') || 'none',
    timeoutMs,
  })

  void waitForStableStartupContent(host, options).then(
    () => {
      markStartupTimeline('web.startup-readiness.wait-complete', {
        durationMs: Math.round(performance.now() - startedAt),
        host: host.tagName.toLowerCase(),
      })
      markStartupContentReady()
    },
    (error) => {
      markStartupTimeline('web.startup-readiness.wait-failed', {
        durationMs: Math.round(performance.now() - startedAt),
        error: String(error),
        host: host.tagName.toLowerCase(),
      })
      markStartupContentReady()
    },
  )
}

async function waitForStableStartupContent(
  host: HTMLElement,
  options: StartupContentReadyOptions,
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_STARTUP_STABLE_TIMEOUT_MS
  const deadline = performance.now() + timeoutMs
  const criticalSelectors = options.criticalSelectors ?? []

  await waitUntilDeadline(waitForUpdateComplete(host), deadline)
  const criticalElements = await waitForCriticalElements(host, criticalSelectors, deadline)
  await waitUntilDeadline(Promise.all(criticalElements.map(waitForUpdateComplete)), deadline)
  await waitUntilDeadline(waitForFontsReady(), deadline)
  await waitForAnimationFrames(STARTUP_STABLE_FRAME_COUNT)
}

async function waitForCriticalElements(
  host: HTMLElement,
  selectors: readonly string[],
  deadline: number,
): Promise<HTMLElement[]> {
  if (selectors.length === 0) {
    return []
  }

  while (performance.now() < deadline) {
    const elements = findCriticalElements(host, selectors)
    if (elements.length === selectors.length) {
      await waitUntilDeadline(Promise.all(elements.map(waitForUpdateComplete)), deadline)
      if (elements.every(hasNonZeroRect)) {
        markStartupTimeline('web.startup-readiness.critical-visible', {
          selectors: selectors.join(','),
        })
        return elements
      }
    }

    await waitForAnimationFrames(1)
  }

  const elements = findCriticalElements(host, selectors)
  markStartupTimeline('web.startup-readiness.critical-timeout', {
    found: elements.length,
    selectors: selectors.join(','),
  })
  return elements
}

function findCriticalElements(host: HTMLElement, selectors: readonly string[]): HTMLElement[] {
  return selectors.flatMap((selector) => {
    const element = findCriticalElement(host, selector)
    return element instanceof HTMLElement ? [element] : []
  })
}

function findCriticalElement(host: HTMLElement, selector: string): HTMLElement | null {
  const parts = selector
    .split(DEEP_SELECTOR_DELIMITER)
    .map((part) => part.trim())
    .filter(Boolean)

  let root: ParentNode = host.shadowRoot ?? host
  let element: Element | null = null

  for (const part of parts) {
    element = root.querySelector(part)
    if (!(element instanceof HTMLElement)) {
      return null
    }
    root = element.shadowRoot ?? element
  }

  return element instanceof HTMLElement ? element : null
}

function hasNonZeroRect(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function waitForUpdateComplete(element: Element): Promise<unknown> {
  if (element instanceof HTMLElement) {
    const updateComplete = (element as UpdateCompleteHost).updateComplete
    if (updateComplete && typeof updateComplete.then === 'function') {
      return updateComplete
    }
  }

  return Promise.resolve()
}

function waitForFontsReady(): Promise<unknown> {
  return document.fonts?.ready ?? Promise.resolve()
}

function waitUntilDeadline<T>(promise: Promise<T>, deadline: number): Promise<T | void> {
  const remainingMs = deadline - performance.now()
  if (remainingMs <= 0) {
    return Promise.resolve()
  }

  return Promise.race([promise, delay(remainingMs)])
}

function waitForAnimationFrames(count: number): Promise<void> {
  if (count <= 0) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    const tick = () => {
      count -= 1
      if (count <= 0) {
        resolve()
        return
      }
      requestAnimationFrameFallback(tick)
    }

    requestAnimationFrameFallback(tick)
  })
}

function requestAnimationFrameFallback(callback: FrameRequestCallback): void {
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(callback)
    return
  }

  window.setTimeout(() => callback(performance.now()), 16)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}
