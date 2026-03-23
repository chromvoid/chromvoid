import type {NavigationSnapshot, OverlayRoute, PassmanagerRoute, SurfaceId} from './navigation.types'

const NAV_QUERY_KEYS = ['surface', 'path', 'pm', 'group', 'entry', 'overlay', 'file'] as const

function isSurfaceId(value: string | null): value is SurfaceId {
  return (
    value === 'files' ||
    value === 'passwords' ||
    value === 'settings' ||
    value === 'remote' ||
    value === 'gateway' ||
    value === 'remote-storage' ||
    value === 'network-pair'
  )
}

function decodePassmanagerRoute(url: URL): PassmanagerRoute {
  const kind = url.searchParams.get('pm')
  const groupPath = url.searchParams.get('group') ?? undefined
  const entryId = url.searchParams.get('entry') ?? undefined

  switch (kind) {
    case 'group':
      return groupPath ? {kind: 'group', groupPath} : {kind: 'root'}
    case 'entry':
      return entryId ? {kind: 'entry', entryId, groupPath} : {kind: 'root'}
    case 'entry-edit':
      return entryId ? {kind: 'entry-edit', entryId, groupPath} : {kind: 'root'}
    case 'create-entry':
      return {kind: 'create-entry', targetGroupPath: groupPath}
    case 'create-group':
      return {kind: 'create-group'}
    case 'import':
      return {kind: 'import'}
    default:
      return {kind: 'root'}
  }
}

function decodeOverlay(url: URL): OverlayRoute {
  const kind = url.searchParams.get('overlay')
  const fileIdRaw = url.searchParams.get('file')
  const fileId = fileIdRaw != null ? Number(fileIdRaw) : NaN

  if (!Number.isFinite(fileId)) {
    return {kind: 'none'}
  }

  if (kind === 'details') {
    return {kind: 'details', fileId}
  }
  if (kind === 'gallery') {
    return {kind: 'gallery', fileId}
  }
  if (kind === 'video') {
    return {kind: 'video', fileId}
  }

  return {kind: 'none'}
}

export function decodeNavigationSnapshotFromUrl(href: string): NavigationSnapshot | null {
  const url = new URL(href, globalThis.location?.href)
  const surface = url.searchParams.get('surface')
  if (!isSurfaceId(surface)) {
    return null
  }

  if (surface === 'passwords') {
    return {
      surface,
      passwords: decodePassmanagerRoute(url),
      overlay: {kind: 'none'},
    }
  }

  if (surface === 'files') {
    return {
      surface,
      files: {path: url.searchParams.get('path') || '/'},
      overlay: decodeOverlay(url),
    }
  }

  return {
    surface,
    overlay: {kind: 'none'},
  }
}

export function encodeNavigationSnapshotToUrl(snapshot: NavigationSnapshot, href: string): string {
  const url = new URL(href, globalThis.location?.href)

  for (const key of NAV_QUERY_KEYS) {
    url.searchParams.delete(key)
  }

  url.searchParams.set('surface', snapshot.surface)

  if (snapshot.surface === 'files') {
    url.searchParams.set('path', snapshot.files?.path || '/')
    const overlay = snapshot.overlay
    if (overlay?.kind === 'details' || overlay?.kind === 'gallery' || overlay?.kind === 'video') {
      url.searchParams.set('overlay', overlay.kind)
      url.searchParams.set('file', String(overlay.fileId))
    }
  }

  if (snapshot.surface === 'passwords') {
    const route = snapshot.passwords
    switch (route?.kind) {
      case 'group':
        url.searchParams.set('pm', 'group')
        url.searchParams.set('group', route.groupPath)
        break
      case 'entry':
        url.searchParams.set('pm', 'entry')
        url.searchParams.set('entry', route.entryId)
        if (route.groupPath) url.searchParams.set('group', route.groupPath)
        break
      case 'entry-edit':
        url.searchParams.set('pm', 'entry-edit')
        url.searchParams.set('entry', route.entryId)
        if (route.groupPath) url.searchParams.set('group', route.groupPath)
        break
      case 'create-entry':
        url.searchParams.set('pm', 'create-entry')
        if (route.targetGroupPath) url.searchParams.set('group', route.targetGroupPath)
        break
      case 'create-group':
        url.searchParams.set('pm', 'create-group')
        break
      case 'import':
        url.searchParams.set('pm', 'import')
        break
      default:
        url.searchParams.set('pm', 'root')
        break
    }
  }

  return url.toString()
}
