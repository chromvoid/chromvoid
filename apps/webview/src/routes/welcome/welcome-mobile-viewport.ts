export type WelcomeMobileViewportProfile = 'regular' | 'compact' | 'condensed'

export const resolveWelcomeMobileViewportProfile = (
  layoutViewportBlockSize: number,
): WelcomeMobileViewportProfile => {
  if (!Number.isFinite(layoutViewportBlockSize) || layoutViewportBlockSize <= 0) return 'regular'
  if (layoutViewportBlockSize <= 620) return 'condensed'
  if (layoutViewportBlockSize <= 700) return 'compact'
  return 'regular'
}

export const resolveWelcomeTabletViewportEligibility = (layoutViewportBlockSize: number): boolean =>
  Number.isFinite(layoutViewportBlockSize) && layoutViewportBlockSize >= 600
