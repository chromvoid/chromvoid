import type {FilePreviewMode} from 'root/utils/file-format-registry'
import type {FileMediaInfo} from 'root/core/catalog/media-info'

export const SURFACE_IDS = [
  'files',
  'notes',
  'passwords',
  'passkeys',
  'settings',
  'remote',
  'gateway',
  'remote-storage',
] as const

export type SurfaceId = (typeof SURFACE_IDS)[number]

export type RemotePanel = 'hosts' | 'pair-ios'

export type PassmanagerRoute =
  | {kind: 'root'}
  | {kind: 'group'; groupPath: string}
  | {kind: 'entry'; entryId: string; groupPath?: string}
  | {kind: 'create-entry'; targetGroupPath?: string}
  | {kind: 'create-group'; targetGroupPath?: string}
  | {kind: 'import'}
  | {kind: 'otp-view'}

export type OverlayRoute =
  | {kind: 'none'}
  | {kind: 'details'; fileId: number}
  | {kind: 'gallery'; fileId: number}
  | {kind: 'preview'; fileId: number}
  | {kind: 'video'; fileId: number}
  | {kind: 'audio'; fileId: number}

export type FilesDocumentOriginSurface = Extract<SurfaceId, 'files' | 'notes'>

export type MarkdownDocumentRouteSource = {
  path: string
  fileName: string
  size?: number
  mimeType?: string
  lastModified?: number
  sourceRevision?: number
}

export type FilesDocumentRoute = {
  kind: 'markdown'
  fileId: number
  originSurface?: FilesDocumentOriginSurface
  source?: MarkdownDocumentRouteSource
}

export type ResolvedGalleryImage = {
  id: number
  name: string
  path: string
  size?: number
  createdAt?: number
  lastModified?: number
  mimeType?: string
  mediaInfo?: FileMediaInfo | null
}

export type ResolvedAudioTrack = {
  id: number
  name: string
  path: string
  size?: number
  lastModified?: number
  sourceRevision?: number
  mimeType?: string
  mediaInfo?: FileMediaInfo | null
}

export type ResolvedOverlayState =
  | {kind: 'closed'}
  | {kind: 'details'; fileId: number}
  | {kind: 'pending'; requestedKind: 'gallery' | 'video' | 'audio' | 'preview'; fileId: number}
  | {kind: 'gallery'; fileId: number; images: ResolvedGalleryImage[]; index: number}
  | {
      kind: 'video'
      fileId: number
      fileName: string
      size?: number
      lastModified?: number
      mimeType?: string
      mediaInfo?: FileMediaInfo | null
    }
  | {kind: 'audio'; fileId: number; tracks: ResolvedAudioTrack[]; index: number}
  | {
      kind: 'preview'
      fileId: number
      fileName: string
      size?: number
      mimeType?: string
      mediaInfo?: FileMediaInfo | null
      lastModified?: number
      sourceRevision?: number
      mode: FilePreviewMode
    }

export type ResolvedFilesDocumentState =
  | {kind: 'closed'}
  | {kind: 'pending'; requestedKind: 'markdown'; fileId: number}
  | {
      kind: 'markdown'
      fileId: number
      fileName: string
      size?: number
      mimeType?: string
      lastModified?: number
      sourceRevision?: number
      mode: 'markdown'
    }

export type NavigationSnapshot = {
  surface: SurfaceId
  files?: {path: string; document?: FilesDocumentRoute}
  passwords?: PassmanagerRoute
  remote?: {panel: RemotePanel}
  overlay?: OverlayRoute
}

export type HistoryMode = 'push' | 'replace' | 'none'

export type NavigationIntentKind =
  | 'close-overlay'
  | 'close-document'
  | 'open-document'
  | 'open-overlay'
  | 'path-change'
  | 'surface-change'
  | 'history-pop'
  | 'ui-back'

export type NavigationBlockerIntent = {
  kind: NavigationIntentKind
  current: NavigationSnapshot
  next: NavigationSnapshot
  historyMode: HistoryMode
}

export type NavigationBlocker = (
  intent: NavigationBlockerIntent,
  resume: () => void,
) => boolean
