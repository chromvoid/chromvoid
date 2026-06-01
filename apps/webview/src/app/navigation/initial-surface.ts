import {decodeNavigationSnapshotFromUrl} from './navigation-url-codec'
import type {SurfaceId} from './navigation.types'

const DEFAULT_SURFACE: SurfaceId = 'files'

export function readInitialSurface(href?: string): SurfaceId {
  const targetHref =
    href ?? (typeof window !== 'undefined' ? window.location.href : undefined) ?? 'http://localhost/'

  try {
    return decodeNavigationSnapshotFromUrl(targetHref)?.surface ?? DEFAULT_SURFACE
  } catch {
    return DEFAULT_SURFACE
  }
}
