import type {
  FilesDocumentOriginSurface,
  FilesDocumentRoute,
  MarkdownDocumentRouteSource,
  NavigationSnapshot,
  OverlayRoute,
  PassmanagerRoute,
  RemotePanel,
  SettingsRoute,
  SurfaceId,
} from './navigation.types'

const NAV_QUERY_KEYS = [
  'surface',
  'path',
  'pm',
  'settings',
  'group',
  'entry',
  'document',
  'overlay',
  'file',
  'panel',
  'from',
  'docPath',
  'docParentPath',
  'docName',
  'docSize',
  'docMime',
  'docModified',
  'docRevision',
  'docAnchor',
  'docView',
] as const

function decodeSettingsRoute(url: URL): SettingsRoute {
  switch (url.searchParams.get('settings')) {
    case 'security':
      return {kind: 'security'}
    case 'autofill':
      return {kind: 'autofill'}
    case 'files':
      return {kind: 'files'}
    case 'passwords':
      return {kind: 'passwords'}
    case 'vault-rekey':
      return {kind: 'vault-rekey'}
    case 'password-import':
      return {kind: 'password-import'}
    default:
      return {kind: 'overview'}
  }
}

function isSurfaceId(value: string | null): value is SurfaceId | 'network-pair' {
  return (
    value === 'files' ||
    value === 'notes' ||
    value === 'passwords' ||
    value === 'passkeys' ||
    value === 'wallet' ||
    value === 'settings' ||
    value === 'remote' ||
    value === 'gateway' ||
    value === 'remote-storage' ||
    value === 'network-pair'
  )
}

function decodeRemotePanel(url: URL): RemotePanel {
  const panel = url.searchParams.get('panel')
  if (panel === 'pair-ios' || panel === 'usb-mobile') return panel
  return 'hosts'
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
      return entryId ? {kind: 'entry', entryId, groupPath} : {kind: 'root'}
    case 'create-entry':
      return {kind: 'create-entry', targetGroupPath: groupPath}
    case 'create-group':
      return {kind: 'create-group', targetGroupPath: groupPath}
    case 'import':
      return {kind: 'import'}
    case 'otp':
      return {kind: 'otp-view'}
    case 'ssh':
      return {kind: 'ssh-view'}
    case 'env-runtime':
      return {kind: 'env-runtime-view'}
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
  if (kind === 'preview') {
    return {kind: 'preview', fileId}
  }
  if (kind === 'video') {
    return {kind: 'video', fileId}
  }
  if (kind === 'audio') {
    return {kind: 'audio', fileId}
  }

  return {kind: 'none'}
}

function decodeFilesDocument(url: URL): FilesDocumentRoute | undefined {
  const kind = url.searchParams.get('document')
  const fileIdRaw = url.searchParams.get('file')
  const fileId = fileIdRaw != null ? Number(fileIdRaw) : NaN
  const originSurface = decodeFilesDocumentOrigin(url.searchParams.get('from'))
  const source = decodeMarkdownDocumentSource(url)
  const viewMode = decodeMarkdownDocumentViewMode(url.searchParams.get('docView'))

  if (kind === 'markdown' && Number.isFinite(fileId)) {
    return {
      kind: 'markdown',
      fileId,
      ...(originSurface ? {originSurface} : {}),
      ...(source ? {source} : {}),
      ...(viewMode ? {viewMode} : {}),
    }
  }

  return undefined
}

function decodeOptionalFiniteNumber(value: string | null): number | undefined {
  if (value == null || value === '') {
    return undefined
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function decodeFilesDocumentOrigin(value: string | null): FilesDocumentOriginSurface | undefined {
  return value === 'files' || value === 'notes' ? value : undefined
}

function decodeMarkdownDocumentViewMode(value: string | null): FilesDocumentRoute['viewMode'] {
  return value === 'edit' || value === 'preview' ? value : undefined
}

function decodeMarkdownDocumentSource(url: URL): MarkdownDocumentRouteSource | undefined {
  const path = url.searchParams.get('docPath')
  const fileName = url.searchParams.get('docName')
  if (!path || !fileName) {
    return undefined
  }

  const size = decodeOptionalFiniteNumber(url.searchParams.get('docSize'))
  const lastModified = decodeOptionalFiniteNumber(url.searchParams.get('docModified'))
  const sourceRevision = decodeOptionalFiniteNumber(url.searchParams.get('docRevision'))
  const mimeType = url.searchParams.get('docMime') ?? undefined
  const parentPath = url.searchParams.get('docParentPath') ?? undefined
  const anchor = url.searchParams.get('docAnchor') ?? undefined

  return {
    path,
    ...(parentPath ? {parentPath} : {}),
    fileName,
    ...(size !== undefined ? {size} : {}),
    ...(mimeType ? {mimeType} : {}),
    ...(lastModified !== undefined ? {lastModified} : {}),
    ...(sourceRevision !== undefined ? {sourceRevision} : {}),
    ...(anchor ? {anchor} : {}),
  }
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

  if (surface === 'settings') {
    return {
      surface,
      settings: decodeSettingsRoute(url),
      overlay: {kind: 'none'},
    }
  }

  if (surface === 'files') {
    const document = decodeFilesDocument(url)
    return {
      surface,
      files: {
        path: url.searchParams.get('path') || '/',
        ...(document ? {document} : {}),
      },
      overlay: document ? {kind: 'none'} : decodeOverlay(url),
    }
  }

  if (surface === 'network-pair') {
    return {
      surface: 'remote',
      remote: {panel: 'pair-ios'},
      overlay: {kind: 'none'},
    }
  }

  if (surface === 'remote') {
    return {
      surface,
      remote: {panel: decodeRemotePanel(url)},
      overlay: {kind: 'none'},
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
    const document = snapshot.files?.document
    if (document?.kind === 'markdown') {
      url.searchParams.set('document', 'markdown')
      url.searchParams.set('file', String(document.fileId))
      if (document.originSurface === 'notes') {
        url.searchParams.set('from', document.originSurface)
      }
      if (document.viewMode) {
        url.searchParams.set('docView', document.viewMode)
      }
      if (document.source) {
        url.searchParams.set('docPath', document.source.path)
        if (document.source.parentPath) {
          url.searchParams.set('docParentPath', document.source.parentPath)
        }
        url.searchParams.set('docName', document.source.fileName)
        if (document.source.size !== undefined) {
          url.searchParams.set('docSize', String(document.source.size))
        }
        if (document.source.mimeType) {
          url.searchParams.set('docMime', document.source.mimeType)
        }
        if (document.source.lastModified !== undefined) {
          url.searchParams.set('docModified', String(document.source.lastModified))
        }
        if (document.source.sourceRevision !== undefined) {
          url.searchParams.set('docRevision', String(document.source.sourceRevision))
        }
        if (document.source.anchor) {
          url.searchParams.set('docAnchor', document.source.anchor)
        }
      }
      return url.toString()
    }

    const overlay = snapshot.overlay
    if (
      overlay?.kind === 'details' ||
      overlay?.kind === 'gallery' ||
      overlay?.kind === 'preview' ||
      overlay?.kind === 'video' ||
      overlay?.kind === 'audio'
    ) {
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
      case 'create-entry':
        url.searchParams.set('pm', 'create-entry')
        if (route.targetGroupPath) url.searchParams.set('group', route.targetGroupPath)
        break
      case 'create-group':
        url.searchParams.set('pm', 'create-group')
        if (route.targetGroupPath) url.searchParams.set('group', route.targetGroupPath)
        break
      case 'import':
        url.searchParams.set('pm', 'import')
        break
      case 'otp-view':
        url.searchParams.set('pm', 'otp')
        break
      case 'ssh-view':
        url.searchParams.set('pm', 'ssh')
        break
      case 'env-runtime-view':
        url.searchParams.set('pm', 'env-runtime')
        break
      default:
        url.searchParams.set('pm', 'root')
        break
    }
  }

  const settingsKind = snapshot.settings?.kind ?? 'overview'
  if (snapshot.surface === 'settings' && settingsKind !== 'overview') {
    url.searchParams.set('settings', settingsKind)
  }

  if (snapshot.surface === 'remote') {
    url.searchParams.set('panel', snapshot.remote?.panel ?? 'hosts')
  }

  return url.toString()
}
