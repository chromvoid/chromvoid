import type {AppContext} from 'root/shared/services/app-context'
import type {FileListItem, SearchFilters} from 'root/shared/contracts/file-manager'
import {filterAndSortFileItems} from 'root/shared/services/file-list-filtering'
import {resolveFileFormat} from 'root/utils/file-format-registry'
import {normalizeFileMediaInfo, type FileMediaInfo} from 'root/core/catalog/media-info'

import type {
  MarkdownDocumentRouteSource,
  NavigationSnapshot,
  ResolvedAudioTrack,
  ResolvedFilesDocumentState,
  ResolvedGalleryImage,
  ResolvedOverlayState,
} from './navigation.types'
import {
  buildChildPath,
  DEFAULT_FILES_PATH,
  DEFAULT_OVERLAY,
  DEFAULT_SEARCH_FILTERS,
  toOptionalFiniteNumber,
} from './navigation-snapshot'

export type OverlayEvaluation = {
  resolved: ResolvedOverlayState
  shouldCanonicalize: boolean
  canonicalSnapshot?: NavigationSnapshot
}

type FilesDocumentEvaluation = {
  resolved: ResolvedFilesDocumentState
  shouldCanonicalize: boolean
}

type CatalogNodeLike = {
  nodeId?: unknown
  name?: unknown
  isDir?: unknown
  path?: unknown
  size?: unknown
  birthtime?: unknown
  createdAt?: unknown
  lastModified?: unknown
  modtime?: unknown
  sourceRevision?: unknown
  source_revision?: unknown
  mimeType?: unknown
  mediaInfo?: unknown
  media_info?: unknown
}

type CatalogReader = {
  getChildren?: (path: string) => unknown
  getNode?: (id: number) => unknown
  findByPath?: (path: string) => unknown
}

type GalleryCatalogItem = FileListItem & {
  galleryImage: ResolvedGalleryImage
  mimeType?: string
}

type ResolvedVideoFile = {
  fileName: string
  size?: number
  lastModified?: number
  mimeType?: string
  mediaInfo?: FileMediaInfo | null
}

const CLOSED_OVERLAY: ResolvedOverlayState = {kind: 'closed'}
const CLOSED_DOCUMENT: ResolvedFilesDocumentState = {kind: 'closed'}

function getCatalogReader(ctx: AppContext | null): CatalogReader | null {
  const catalog = ctx?.catalog as {catalog?: unknown} | undefined
  const reader = catalog?.catalog

  if (!reader || typeof reader !== 'object') {
    return null
  }

  return reader as CatalogReader
}

function getSearchFilters(ctx: AppContext | null): SearchFilters {
  return ctx?.store.searchFilters?.() ?? DEFAULT_SEARCH_FILTERS
}

function getCatalogChildren(catalog: CatalogReader | null, path: string): CatalogNodeLike[] {
  try {
    const children = catalog?.getChildren?.(path)
    return Array.isArray(children) ? (children as CatalogNodeLike[]) : []
  } catch {
    return []
  }
}

function getCatalogNode(catalog: CatalogReader | null, fileId: number): CatalogNodeLike | null {
  try {
    const node = catalog?.getNode?.(fileId)
    return node && typeof node === 'object' ? (node as CatalogNodeLike) : null
  } catch {
    return null
  }
}

function readMediaInfo(node: CatalogNodeLike): FileMediaInfo | null {
  return normalizeFileMediaInfo(node.mediaInfo ?? node.media_info)
}

function mediaInfoProperty(mediaInfo: FileMediaInfo | null): {mediaInfo: FileMediaInfo} | Record<string, never> {
  return mediaInfo ? {mediaInfo} : {}
}

function isCatalogPathKnown(catalog: CatalogReader | null, path: string): boolean {
  if (!catalog) {
    return false
  }

  if (catalog.findByPath?.(path)) {
    return true
  }

  return path === DEFAULT_FILES_PATH && Array.isArray(catalog.getChildren?.(DEFAULT_FILES_PATH))
}

function toGalleryCatalogItem(path: string, node: CatalogNodeLike): GalleryCatalogItem | null {
  if (node.name == null) {
    return null
  }

  const id = Number(node.nodeId)
  const name = String(node.name)
  const explicitPath = typeof node.path === 'string' && node.path.length > 0 ? node.path : undefined
  const itemPath = explicitPath ?? buildChildPath(path, name)
  const size = toOptionalFiniteNumber(node.size)
  const createdAt = toOptionalFiniteNumber(node.birthtime ?? node.createdAt)
  const lastModified = toOptionalFiniteNumber(node.modtime ?? node.lastModified)
  const mimeType = typeof node.mimeType === 'string' ? node.mimeType : undefined
  const mediaInfo = readMediaInfo(node)

  return {
    id,
    name,
    path: itemPath,
    isDir: Boolean(node.isDir),
    ...(size !== undefined ? {size} : {}),
    ...(createdAt !== undefined ? {createdAt} : {}),
    ...(lastModified !== undefined ? {lastModified} : {}),
    ...(mimeType ? {mimeType} : {}),
    ...mediaInfoProperty(mediaInfo),
    galleryImage: {
      id,
      name,
      path: itemPath,
      ...(size !== undefined ? {size} : {}),
      ...(createdAt !== undefined ? {createdAt} : {}),
      ...(lastModified !== undefined ? {lastModified} : {}),
      ...(mimeType ? {mimeType} : {}),
      ...mediaInfoProperty(mediaInfo),
    },
  }
}

function getGalleryImages(path: string, filters: SearchFilters, catalog: CatalogReader | null): ResolvedGalleryImage[] {
  const children = getCatalogChildren(catalog, path)
  const visibleItems = filterAndSortFileItems(
    children
      .map((node) => toGalleryCatalogItem(path, node))
      .filter((item): item is GalleryCatalogItem => Boolean(item)),
    filters,
  )

  return visibleItems
    .filter((item) => {
      if (item.isDir) return false
      const format = resolveFileFormat({
        name: item.name,
        mimeType: item.mimeType,
        mediaInfo: item.mediaInfo,
      })
      return format.openBehavior.kind === 'gallery'
    })
    .map((item) => item.galleryImage)
}

function getVideoFile(
  path: string,
  fileId: number,
  filters: SearchFilters,
  catalog: CatalogReader | null,
): ResolvedVideoFile | null {
  const children = getCatalogChildren(catalog, path)
  const match = children.find((node) => {
    if (node.isDir) return false
    if (Number(node.nodeId) !== fileId) return false
    if (
      resolveFileFormat({
        name: String(node.name ?? ''),
        mimeType: typeof node.mimeType === 'string' ? node.mimeType : undefined,
        mediaInfo: readMediaInfo(node),
      }).openBehavior.kind !== 'video'
    ) {
      return false
    }
    if (!filters.showHidden && String(node.name ?? '').startsWith('.')) return false
    return true
  })

  if (!match?.name) {
    return null
  }

  const size = toOptionalFiniteNumber(match.size)
  const lastModified = toOptionalFiniteNumber(match.lastModified ?? match.modtime)
  const mimeType = typeof match.mimeType === 'string' ? match.mimeType : undefined
  const mediaInfo = readMediaInfo(match)

  return {
    fileName: String(match.name),
    ...(size !== undefined ? {size} : {}),
    ...(lastModified !== undefined ? {lastModified} : {}),
    ...(mimeType ? {mimeType} : {}),
    ...mediaInfoProperty(mediaInfo),
  }
}

function getAudioTracks(
  path: string,
  filters: SearchFilters,
  catalog: CatalogReader | null,
): ResolvedAudioTrack[] {
  return getCatalogChildren(catalog, path).flatMap((node): ResolvedAudioTrack[] => {
    if (node.isDir) return []
    const id = Number(node.nodeId)
    const name = String(node.name ?? '')
    if (
      resolveFileFormat({
        name,
        mimeType: typeof node.mimeType === 'string' ? node.mimeType : undefined,
        mediaInfo: readMediaInfo(node),
      }).openBehavior.kind !== 'audio'
    ) {
      return []
    }
    if (!filters.showHidden && name.startsWith('.')) return []

    const explicitPath = typeof node.path === 'string' && node.path.length > 0 ? node.path : undefined
    const track: ResolvedAudioTrack = {
      id,
      name,
      path: explicitPath ?? buildChildPath(path, name),
    }
    const size = toOptionalFiniteNumber(node.size)
    const lastModified = toOptionalFiniteNumber(node.lastModified ?? node.modtime)
    const sourceRevision = toOptionalFiniteNumber(node.sourceRevision ?? node.source_revision)
    const mimeType = typeof node.mimeType === 'string' ? node.mimeType : undefined
    const mediaInfo = readMediaInfo(node)
    if (size !== undefined) track.size = size
    if (lastModified !== undefined) track.lastModified = lastModified
    if (sourceRevision !== undefined) track.sourceRevision = sourceRevision
    if (mimeType) track.mimeType = mimeType
    if (mediaInfo) track.mediaInfo = mediaInfo
    return [track]
  })
}

function getPreviewFile(
  path: string,
  fileId: number,
  filters: SearchFilters,
  catalog: CatalogReader | null,
): ResolvedOverlayState | null {
  const children = getCatalogChildren(catalog, path)
  const match = children.find((node) => {
    if (node.isDir) return false
    if (Number(node.nodeId) !== fileId) return false
    if (!filters.showHidden && String(node.name ?? '').startsWith('.')) return false
    return true
  })

  if (!match?.name) {
    return null
  }

  const format = resolveFileFormat({
    name: String(match.name),
    mimeType: typeof match.mimeType === 'string' ? match.mimeType : undefined,
    mediaInfo: readMediaInfo(match),
  })

  if (format.openBehavior.kind !== 'preview') {
    return null
  }

  const size = toOptionalFiniteNumber(match.size)
  const sourceRevision = toOptionalFiniteNumber(match.sourceRevision ?? match.source_revision)
  return {
    kind: 'preview',
    fileId,
    fileName: String(match.name),
    ...(size !== undefined ? {size} : {}),
    mimeType: typeof match.mimeType === 'string' ? match.mimeType : undefined,
    lastModified: toOptionalFiniteNumber(match.lastModified ?? match.modtime),
    ...(sourceRevision !== undefined ? {sourceRevision} : {}),
    mode: format.openBehavior.mode,
  }
}

function resolveMarkdownDocumentNode(
  node: CatalogNodeLike,
  fileId: number,
  filters: SearchFilters,
): ResolvedFilesDocumentState | null {
  if (node.isDir) {
    return null
  }
  if (Number(node.nodeId) !== fileId) {
    return null
  }
  if (!node.name) {
    return null
  }
  if (!filters.showHidden && String(node.name).startsWith('.')) {
    return null
  }

  const format = resolveFileFormat({
    name: String(node.name),
    mimeType: typeof node.mimeType === 'string' ? node.mimeType : undefined,
    mediaInfo: readMediaInfo(node),
  })

  if (format.openBehavior.kind !== 'document' || format.openBehavior.mode !== 'markdown') {
    return null
  }

  const size = toOptionalFiniteNumber(node.size)
  const sourceRevision = toOptionalFiniteNumber(node.sourceRevision ?? node.source_revision)
  return {
    kind: 'markdown',
    fileId,
    fileName: String(node.name),
    ...(size !== undefined ? {size} : {}),
    mimeType: typeof node.mimeType === 'string' ? node.mimeType : undefined,
    lastModified: toOptionalFiniteNumber(node.lastModified ?? node.modtime),
    ...(sourceRevision !== undefined ? {sourceRevision} : {}),
    mode: 'markdown',
  }
}

function getMarkdownDocumentFile(
  path: string,
  fileId: number,
  filters: SearchFilters,
  catalog: CatalogReader | null,
): ResolvedFilesDocumentState | null {
  const children = getCatalogChildren(catalog, path)
  const match = children.find((node) => Number(node.nodeId) === fileId)
  return match ? resolveMarkdownDocumentNode(match, fileId, filters) : null
}

function getMarkdownDocumentById(
  fileId: number,
  filters: SearchFilters,
  catalog: CatalogReader | null,
): ResolvedFilesDocumentState | null {
  const node = getCatalogNode(catalog, fileId)
  return node ? resolveMarkdownDocumentNode(node, fileId, filters) : null
}

function getMarkdownDocumentSource(
  source: MarkdownDocumentRouteSource | undefined,
  fileId: number,
  filters: SearchFilters,
): ResolvedFilesDocumentState | null {
  if (!source) {
    return null
  }

  return resolveMarkdownDocumentNode(
    {
      nodeId: fileId,
      name: source.fileName,
      isDir: false,
      path: source.path,
      size: source.size,
      mimeType: source.mimeType,
      lastModified: source.lastModified,
      sourceRevision: source.sourceRevision,
    },
    fileId,
    filters,
  )
}

export function evaluateNavigationOverlay(options: {
  snapshot: NavigationSnapshot
  ctx: AppContext | null
  catalogRevision: number
}): OverlayEvaluation {
  const {snapshot, ctx, catalogRevision} = options
  const overlay = snapshot.overlay ?? DEFAULT_OVERLAY

  if (snapshot.surface !== 'files' || snapshot.files?.document || overlay.kind === 'none') {
    return {resolved: CLOSED_OVERLAY, shouldCanonicalize: false}
  }

  if (overlay.kind === 'details') {
    return {
      resolved: {kind: 'details', fileId: overlay.fileId},
      shouldCanonicalize: false,
    }
  }

  const path = snapshot.files?.path || DEFAULT_FILES_PATH
  const filters = getSearchFilters(ctx)
  const catalog = getCatalogReader(ctx)
  const syncing = Boolean(ctx?.catalog.syncing?.())
  const pathKnown = isCatalogPathKnown(catalog, path)
  const pending = syncing || (!pathKnown && catalogRevision === 0)

  if (overlay.kind === 'gallery') {
    const images = getGalleryImages(path, filters, catalog)
    const index = images.findIndex((image) => image.id === overlay.fileId)
    if (index >= 0) {
      return {
        resolved: {
          kind: 'gallery',
          fileId: overlay.fileId,
          images,
          index,
        },
        shouldCanonicalize: false,
      }
    }

    if (pending) {
      return {
        resolved: {kind: 'pending', requestedKind: 'gallery', fileId: overlay.fileId},
        shouldCanonicalize: false,
      }
    }

    return {resolved: CLOSED_OVERLAY, shouldCanonicalize: true}
  }

  if (overlay.kind === 'preview') {
    const markdownDocument = getMarkdownDocumentFile(path, overlay.fileId, filters, catalog)
    if (markdownDocument) {
      return {
        resolved: CLOSED_OVERLAY,
        shouldCanonicalize: true,
        canonicalSnapshot: {
          surface: 'files',
          files: {
            path,
            document: {kind: 'markdown', fileId: overlay.fileId},
          },
          overlay: DEFAULT_OVERLAY,
        },
      }
    }

    const preview = getPreviewFile(path, overlay.fileId, filters, catalog)
    if (preview) {
      return {
        resolved: preview,
        shouldCanonicalize: false,
      }
    }

    if (pending) {
      return {
        resolved: {kind: 'pending', requestedKind: 'preview', fileId: overlay.fileId},
        shouldCanonicalize: false,
      }
    }

    return {resolved: CLOSED_OVERLAY, shouldCanonicalize: true}
  }

  if (overlay.kind === 'audio') {
    const tracks = getAudioTracks(path, filters, catalog)
    const index = tracks.findIndex((track) => track.id === overlay.fileId)
    if (index >= 0) {
      return {
        resolved: {
          kind: 'audio',
          fileId: overlay.fileId,
          tracks,
          index,
        },
        shouldCanonicalize: false,
      }
    }

    if (pending) {
      return {
        resolved: {kind: 'pending', requestedKind: 'audio', fileId: overlay.fileId},
        shouldCanonicalize: false,
      }
    }

    return {resolved: CLOSED_OVERLAY, shouldCanonicalize: true}
  }

  if (overlay.kind === 'video') {
    const tracks = getAudioTracks(path, filters, catalog)
    const index = tracks.findIndex((track) => track.id === overlay.fileId)
    if (index >= 0) {
      return {
        resolved: {
          kind: 'audio',
          fileId: overlay.fileId,
          tracks,
          index,
        },
        shouldCanonicalize: true,
        canonicalSnapshot: {
          surface: 'files',
          files: {path},
          overlay: {kind: 'audio', fileId: overlay.fileId},
        },
      }
    }
  }

  const videoFile = getVideoFile(path, overlay.fileId, filters, catalog)
  if (videoFile) {
    return {
      resolved: {
        kind: 'video',
        fileId: overlay.fileId,
        fileName: videoFile.fileName,
        ...(videoFile.size !== undefined ? {size: videoFile.size} : {}),
        ...(videoFile.lastModified !== undefined ? {lastModified: videoFile.lastModified} : {}),
        ...(videoFile.mimeType ? {mimeType: videoFile.mimeType} : {}),
        ...mediaInfoProperty(videoFile.mediaInfo ?? null),
      },
      shouldCanonicalize: false,
    }
  }

  if (pending) {
    return {
      resolved: {kind: 'pending', requestedKind: 'video', fileId: overlay.fileId},
      shouldCanonicalize: false,
    }
  }

  return {resolved: CLOSED_OVERLAY, shouldCanonicalize: true}
}

export function evaluateNavigationDocument(options: {
  snapshot: NavigationSnapshot
  ctx: AppContext | null
  catalogRevision: number
}): FilesDocumentEvaluation {
  const {snapshot, ctx, catalogRevision} = options
  const document = snapshot.files?.document

  if (snapshot.surface !== 'files' || !document) {
    return {resolved: CLOSED_DOCUMENT, shouldCanonicalize: false}
  }

  const path = snapshot.files?.path || DEFAULT_FILES_PATH
  const filters = getSearchFilters(ctx)
  const catalog = getCatalogReader(ctx)
  const syncing = Boolean(ctx?.catalog.syncing?.())
  const pathKnown = isCatalogPathKnown(catalog, path)
  const pending = syncing || (!pathKnown && catalogRevision === 0)

  if (document.kind === 'markdown') {
    const markdownDocument = getMarkdownDocumentFile(path, document.fileId, filters, catalog)
    if (markdownDocument) {
      return {
        resolved: markdownDocument,
        shouldCanonicalize: false,
      }
    }

    if (document.source) {
      const catalogDocument = getMarkdownDocumentById(document.fileId, filters, catalog)
      if (catalogDocument) {
        return {
          resolved: catalogDocument,
          shouldCanonicalize: false,
        }
      }

      const sourceDocument = getMarkdownDocumentSource(document.source, document.fileId, filters)
      if (sourceDocument) {
        return {
          resolved: sourceDocument,
          shouldCanonicalize: false,
        }
      }
    }

    if (pending) {
      return {
        resolved: {kind: 'pending', requestedKind: 'markdown', fileId: document.fileId},
        shouldCanonicalize: false,
      }
    }
  }

  return {resolved: CLOSED_DOCUMENT, shouldCanonicalize: true}
}
