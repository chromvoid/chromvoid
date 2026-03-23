export type SurfaceId =
  | 'files'
  | 'passwords'
  | 'settings'
  | 'remote'
  | 'gateway'
  | 'remote-storage'
  | 'network-pair'

export type PassmanagerRoute =
  | {kind: 'root'}
  | {kind: 'group'; groupPath: string}
  | {kind: 'entry'; entryId: string; groupPath?: string}
  | {kind: 'entry-edit'; entryId: string; groupPath?: string}
  | {kind: 'create-entry'; targetGroupPath?: string}
  | {kind: 'create-group'}
  | {kind: 'import'}

export type OverlayRoute =
  | {kind: 'none'}
  | {kind: 'details'; fileId: number}
  | {kind: 'gallery'; fileId: number}
  | {kind: 'video'; fileId: number}

export type ResolvedGalleryImage = {
  id: number
  name: string
}

export type ResolvedOverlayState =
  | {kind: 'closed'}
  | {kind: 'details'; fileId: number}
  | {kind: 'pending'; requestedKind: 'gallery' | 'video'; fileId: number}
  | {kind: 'gallery'; fileId: number; images: ResolvedGalleryImage[]; index: number}
  | {kind: 'video'; fileId: number; fileName: string}

export type NavigationSnapshot = {
  surface: SurfaceId
  files?: {path: string}
  passwords?: PassmanagerRoute
  overlay?: OverlayRoute
}

export type HistoryMode = 'push' | 'replace' | 'none'
