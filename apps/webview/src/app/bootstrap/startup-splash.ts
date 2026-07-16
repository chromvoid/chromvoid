export const STARTUP_SPLASH_RELEASED_EVENT = 'chromvoid:startup-splash-released'

export type StartupSplashSurface = 'web' | 'native-bridge'

const STARTUP_SPLASH_ACTIVE_DATA_KEY = 'startupSplashActive'
const STARTUP_SPLASH_RELEASED_DATA_KEY = 'startupSplashReleased'
const STARTUP_SPLASH_SURFACE_DATA_KEY = 'startupSplashSurface'

export function markStartupSplashActive(surface: StartupSplashSurface = 'web'): void {
  document.documentElement.dataset[STARTUP_SPLASH_ACTIVE_DATA_KEY] = 'true'
  delete document.documentElement.dataset[STARTUP_SPLASH_RELEASED_DATA_KEY]
  document.documentElement.dataset[STARTUP_SPLASH_SURFACE_DATA_KEY] = surface
}

export function markStartupSplashReleased(): void {
  if (isStartupSplashReleased()) return

  document.documentElement.dataset[STARTUP_SPLASH_ACTIVE_DATA_KEY] = 'false'
  document.documentElement.dataset[STARTUP_SPLASH_RELEASED_DATA_KEY] = 'true'
  document.dispatchEvent(new CustomEvent(STARTUP_SPLASH_RELEASED_EVENT))
}

export function isStartupSplashReleased(): boolean {
  if (document.documentElement.dataset[STARTUP_SPLASH_RELEASED_DATA_KEY] === 'true') {
    return true
  }

  if (document.documentElement.dataset[STARTUP_SPLASH_ACTIVE_DATA_KEY] === 'true') {
    return false
  }

  return !document.documentElement.hasAttribute('loading')
}

export function getStartupSplashSurface(): StartupSplashSurface | null {
  const surface = document.documentElement.dataset[STARTUP_SPLASH_SURFACE_DATA_KEY]
  if (surface === 'web' || surface === 'native-bridge') return surface

  return null
}
