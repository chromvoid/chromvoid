type StartupTimelineDetails = Record<string, boolean | number | string | null | undefined>

markStartupTimeline('web.timeline.module-evaluated', {
  loading: document.documentElement.hasAttribute('loading'),
  readyState: document.readyState,
})

export function markStartupTimeline(label: string, details?: StartupTimelineDetails): void {
  const elapsedMs = Math.round(performance.now())
  const detailsText = formatDetails(details)
  const suffix = detailsText ? ` | ${detailsText}` : ''
  console.info(`[startup] t+${elapsedMs}ms ${label}${suffix}`)

  try {
    window.ChromVoidSplash?.startupLog?.(label, elapsedMs, detailsText)
  } catch (error) {
    console.warn('[startup] native timeline bridge failed:', error)
  }
}

function formatDetails(details?: StartupTimelineDetails): string {
  if (!details) {
    return ''
  }

  return Object.entries(details)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(' ')
}
