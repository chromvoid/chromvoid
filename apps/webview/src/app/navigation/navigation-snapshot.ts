import type {SearchFilters} from 'root/shared/contracts/file-manager'

import type {
  FilesDocumentRoute,
  MarkdownDocumentRouteSource,
  NavigationSnapshot,
  OverlayRoute,
} from './navigation.types'

export const DEFAULT_OVERLAY: OverlayRoute = {kind: 'none'}
export const DEFAULT_FILES_PATH = '/'
export const DEFAULT_SNAPSHOT: NavigationSnapshot = {
  surface: 'files',
  files: {path: DEFAULT_FILES_PATH},
  overlay: DEFAULT_OVERLAY,
}
export const DEFAULT_SEARCH_FILTERS: SearchFilters = {
  query: '',
  sortBy: 'name',
  sortDirection: 'asc',
  viewMode: 'list',
  showHidden: false,
  fileTypes: [],
}

export function describeSnapshot(snapshot: NavigationSnapshot): string {
  const overlay = snapshot.overlay?.kind ?? 'none'

  if (snapshot.surface === 'passwords') {
    return `passwords:${JSON.stringify(snapshot.passwords ?? {kind: 'root'})}:overlay=${overlay}`
  }

  if (snapshot.surface === 'files') {
    const document = snapshot.files?.document?.kind ?? 'none'
    return `files:${snapshot.files?.path || DEFAULT_FILES_PATH}:document=${document}:overlay=${overlay}`
  }

  if (snapshot.surface === 'remote') {
    return `remote:${snapshot.remote?.panel ?? 'hosts'}:overlay=${overlay}`
  }

  return `${snapshot.surface}:overlay=${overlay}`
}

export function parentPath(path: string): string {
  if (!path || path === DEFAULT_FILES_PATH) {
    return DEFAULT_FILES_PATH
  }

  const trimmed = path.endsWith('/') ? path.slice(0, -1) : path
  const next = trimmed.substring(0, trimmed.lastIndexOf('/') + 1) || DEFAULT_FILES_PATH
  return next
}

export function parentGroupPath(path: string): string | undefined {
  const index = path.lastIndexOf('/')
  if (index < 0) {
    return undefined
  }

  const value = path.slice(0, index)
  return value || undefined
}

export function buildChildPath(parentPathValue: string, name: string): string {
  if (!name) {
    return parentPathValue || DEFAULT_FILES_PATH
  }

  if (!parentPathValue || parentPathValue === DEFAULT_FILES_PATH) {
    return `/${name}`
  }

  const normalizedParent = parentPathValue.endsWith('/')
    ? parentPathValue.slice(0, -1)
    : parentPathValue

  return `${normalizedParent}/${name}`
}

export function toOptionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function normalizeMarkdownDocumentSource(
  source: MarkdownDocumentRouteSource | undefined,
): MarkdownDocumentRouteSource | undefined {
  if (!source || typeof source.path !== 'string' || typeof source.fileName !== 'string') {
    return undefined
  }

  const path = source.path.trim()
  const fileName = source.fileName.trim()
  if (!path || !fileName) {
    return undefined
  }

  const size = toOptionalFiniteNumber(source.size)
  const lastModified = toOptionalFiniteNumber(source.lastModified)
  const sourceRevision = toOptionalFiniteNumber(source.sourceRevision)
  const mimeType = typeof source.mimeType === 'string' && source.mimeType ? source.mimeType : undefined

  return {
    path,
    fileName,
    ...(size !== undefined ? {size} : {}),
    ...(mimeType ? {mimeType} : {}),
    ...(lastModified !== undefined ? {lastModified} : {}),
    ...(sourceRevision !== undefined ? {sourceRevision} : {}),
  }
}

function normalizeFilesDocument(document: FilesDocumentRoute | undefined): FilesDocumentRoute | undefined {
  if (document?.kind !== 'markdown' || !Number.isFinite(document.fileId)) {
    return undefined
  }

  const originSurface =
    document.originSurface === 'files' || document.originSurface === 'notes'
      ? document.originSurface
      : undefined
  const source = normalizeMarkdownDocumentSource(document.source)

  return {
    kind: 'markdown',
    fileId: document.fileId,
    ...(originSurface ? {originSurface} : {}),
    ...(source ? {source} : {}),
  }
}

export function normalizeSnapshot(snapshot: NavigationSnapshot): NavigationSnapshot {
  const normalized: NavigationSnapshot = {
    surface: snapshot.surface,
    overlay: snapshot.overlay ?? DEFAULT_OVERLAY,
  }

  if (snapshot.surface === 'files') {
    const document = normalizeFilesDocument(snapshot.files?.document)
    normalized.files = {
      path: snapshot.files?.path || DEFAULT_FILES_PATH,
      ...(document ? {document} : {}),
    }
    if (normalized.files.document) {
      normalized.overlay = DEFAULT_OVERLAY
      return normalized
    }
    if (
      normalized.overlay?.kind !== 'details' &&
      normalized.overlay?.kind !== 'gallery' &&
      normalized.overlay?.kind !== 'preview' &&
      normalized.overlay?.kind !== 'video' &&
      normalized.overlay?.kind !== 'audio'
    ) {
      normalized.overlay = DEFAULT_OVERLAY
    }
  } else if (snapshot.surface === 'passwords') {
    normalized.passwords = snapshot.passwords ?? {kind: 'root'}
    normalized.overlay = DEFAULT_OVERLAY
  } else if (snapshot.surface === 'remote') {
    normalized.remote = {
      panel: snapshot.remote?.panel ?? 'hosts',
    }
    normalized.overlay = DEFAULT_OVERLAY
  } else {
    normalized.overlay = DEFAULT_OVERLAY
  }

  return normalized
}

export function snapshotsEqual(a: NavigationSnapshot, b: NavigationSnapshot): boolean {
  return JSON.stringify(normalizeSnapshot(a)) === JSON.stringify(normalizeSnapshot(b))
}

export function shouldReplaceTransientPasswordsHistoryEntry(
  previous: NavigationSnapshot,
  next: NavigationSnapshot,
): boolean {
  return (
    previous.surface === 'passwords' &&
    next.surface === 'passwords' &&
    ((previous.passwords?.kind === 'create-entry' && next.passwords?.kind === 'entry') ||
      (previous.passwords?.kind === 'create-group' && next.passwords?.kind === 'group'))
  )
}

export function buildFallbackSnapshot(
  snapshot: NavigationSnapshot,
  readExternalFilesPath: () => string,
): NavigationSnapshot | null {
  if (snapshot.surface === 'files' && snapshot.files?.document) {
    if (snapshot.files.document.originSurface === 'notes') {
      return normalizeSnapshot({
        surface: 'notes',
        overlay: DEFAULT_OVERLAY,
      })
    }

    return normalizeSnapshot({
      surface: 'files',
      files: {path: snapshot.files.path || DEFAULT_FILES_PATH},
      overlay: DEFAULT_OVERLAY,
    })
  }

  if (snapshot.overlay?.kind && snapshot.overlay.kind !== 'none') {
    return normalizeSnapshot({
      ...snapshot,
      overlay: DEFAULT_OVERLAY,
    })
  }

  if (snapshot.surface === 'files') {
    const path = snapshot.files?.path || DEFAULT_FILES_PATH
    if (path !== DEFAULT_FILES_PATH) {
      return normalizeSnapshot({
        surface: 'files',
        files: {path: parentPath(path)},
        overlay: DEFAULT_OVERLAY,
      })
    }
    return null
  }

  if (snapshot.surface === 'passwords') {
    const route = snapshot.passwords ?? {kind: 'root'}
    switch (route.kind) {
      case 'entry':
        return normalizeSnapshot({
          surface: 'passwords',
          passwords: route.groupPath ? {kind: 'group', groupPath: route.groupPath} : {kind: 'root'},
          overlay: DEFAULT_OVERLAY,
        })
      case 'group': {
        const nextParent = parentGroupPath(route.groupPath)
        return normalizeSnapshot({
          surface: 'passwords',
          passwords: nextParent ? {kind: 'group', groupPath: nextParent} : {kind: 'root'},
          overlay: DEFAULT_OVERLAY,
        })
      }
      case 'create-entry':
        return normalizeSnapshot({
          surface: 'passwords',
          passwords: route.targetGroupPath ? {kind: 'group', groupPath: route.targetGroupPath} : {kind: 'root'},
          overlay: DEFAULT_OVERLAY,
        })
      case 'create-group':
      case 'import':
      case 'otp-view':
        return normalizeSnapshot({
          surface: 'passwords',
          passwords: {kind: 'root'},
          overlay: DEFAULT_OVERLAY,
        })
      case 'root':
        return normalizeSnapshot({
          surface: 'files',
          files: {path: readExternalFilesPath()},
          overlay: DEFAULT_OVERLAY,
        })
    }
  }

  if (snapshot.surface === 'remote' && snapshot.remote?.panel === 'pair-ios') {
    return normalizeSnapshot({
      surface: 'remote',
      remote: {panel: 'hosts'},
      overlay: DEFAULT_OVERLAY,
    })
  }

  return normalizeSnapshot({
    surface: 'files',
    files: {path: readExternalFilesPath()},
    overlay: DEFAULT_OVERLAY,
  })
}

export function buildHierarchyFallbackSnapshot(snapshot: NavigationSnapshot): NavigationSnapshot | null {
  if (snapshot.surface === 'files' && snapshot.files?.document) {
    if (snapshot.files.document.originSurface === 'notes') {
      return normalizeSnapshot({
        surface: 'notes',
        overlay: DEFAULT_OVERLAY,
      })
    }

    return normalizeSnapshot({
      surface: 'files',
      files: {path: snapshot.files.path || DEFAULT_FILES_PATH},
      overlay: DEFAULT_OVERLAY,
    })
  }

  if (snapshot.overlay?.kind && snapshot.overlay.kind !== 'none') {
    return normalizeSnapshot({
      ...snapshot,
      overlay: DEFAULT_OVERLAY,
    })
  }

  if (snapshot.surface === 'files') {
    const path = snapshot.files?.path || DEFAULT_FILES_PATH
    if (path === DEFAULT_FILES_PATH) {
      return null
    }

    return normalizeSnapshot({
      surface: 'files',
      files: {path: parentPath(path)},
      overlay: DEFAULT_OVERLAY,
    })
  }

  if (snapshot.surface === 'passwords') {
    const route = snapshot.passwords ?? {kind: 'root'}
    switch (route.kind) {
      case 'entry':
        return normalizeSnapshot({
          surface: 'passwords',
          passwords: route.groupPath ? {kind: 'group', groupPath: route.groupPath} : {kind: 'root'},
          overlay: DEFAULT_OVERLAY,
        })
      case 'group': {
        const nextParent = parentGroupPath(route.groupPath)
        return normalizeSnapshot({
          surface: 'passwords',
          passwords: nextParent ? {kind: 'group', groupPath: nextParent} : {kind: 'root'},
          overlay: DEFAULT_OVERLAY,
        })
      }
      case 'create-entry':
        return normalizeSnapshot({
          surface: 'passwords',
          passwords: route.targetGroupPath ? {kind: 'group', groupPath: route.targetGroupPath} : {kind: 'root'},
          overlay: DEFAULT_OVERLAY,
        })
      case 'create-group':
      case 'import':
      case 'otp-view':
        return normalizeSnapshot({
          surface: 'passwords',
          passwords: {kind: 'root'},
          overlay: DEFAULT_OVERLAY,
        })
      case 'root':
        return null
    }
  }

  if (snapshot.surface === 'remote' && snapshot.remote?.panel === 'pair-ios') {
    return normalizeSnapshot({
      surface: 'remote',
      remote: {panel: 'hosts'},
      overlay: DEFAULT_OVERLAY,
    })
  }

  return null
}
