import {computed, state} from '@statx/core'

import type {SearchFilters} from 'root/shared/contracts/file-manager'
import {getAppContext, tryGetAppContext} from 'root/shared/services/app-context'
import {passmanagerNavigationController} from 'root/features/passmanager/passmanager-navigation.controller'
import {isImageFile, isVideoFile} from 'root/utils/mime-type'
import {decodeNavigationSnapshotFromUrl, encodeNavigationSnapshotToUrl} from './navigation-url-codec'
import type {
  HistoryMode,
  NavigationSnapshot,
  OverlayRoute,
  PassmanagerRoute,
  ResolvedGalleryImage,
  ResolvedOverlayState,
  SurfaceId,
} from './navigation.types'

type HistoryState = {
  __chromvoidNavIndex: number
  __chromvoidNavGeneration: number
}

type SurfaceBackHandler = () => boolean

type OverlayEvaluation = {
  resolved: ResolvedOverlayState
  shouldCanonicalize: boolean
}

const DEFAULT_OVERLAY: OverlayRoute = {kind: 'none'}
const DEFAULT_FILES_PATH = '/'
const DEFAULT_SNAPSHOT: NavigationSnapshot = {
  surface: 'files',
  files: {path: DEFAULT_FILES_PATH},
  overlay: DEFAULT_OVERLAY,
}
const CLOSED_OVERLAY: ResolvedOverlayState = {kind: 'closed'}
const DEFAULT_SEARCH_FILTERS: SearchFilters = {
  query: '',
  sortBy: 'name',
  sortDirection: 'asc',
  viewMode: 'list',
  showHidden: false,
  fileTypes: [],
}

function parentPath(path: string): string {
  if (!path || path === '/') {
    return '/'
  }

  const trimmed = path.endsWith('/') ? path.slice(0, -1) : path
  const next = trimmed.substring(0, trimmed.lastIndexOf('/') + 1) || '/'
  return next
}

function parentGroupPath(path: string): string | undefined {
  const index = path.lastIndexOf('/')
  if (index < 0) {
    return undefined
  }

  const value = path.slice(0, index)
  return value || undefined
}

function normalizeSnapshot(snapshot: NavigationSnapshot): NavigationSnapshot {
  const normalized: NavigationSnapshot = {
    surface: snapshot.surface,
    overlay: snapshot.overlay ?? DEFAULT_OVERLAY,
  }

  if (snapshot.surface === 'files') {
    normalized.files = {
      path: snapshot.files?.path || DEFAULT_FILES_PATH,
    }
    if (
      normalized.overlay?.kind !== 'details' &&
      normalized.overlay?.kind !== 'gallery' &&
      normalized.overlay?.kind !== 'video'
    ) {
      normalized.overlay = DEFAULT_OVERLAY
    }
  } else if (snapshot.surface === 'passwords') {
    normalized.passwords = snapshot.passwords ?? {kind: 'root'}
    normalized.overlay = DEFAULT_OVERLAY
  } else {
    normalized.overlay = DEFAULT_OVERLAY
  }

  return normalized
}

function snapshotsEqual(a: NavigationSnapshot, b: NavigationSnapshot): boolean {
  return JSON.stringify(normalizeSnapshot(a)) === JSON.stringify(normalizeSnapshot(b))
}

function shouldReplaceTransientPasswordsHistoryEntry(
  previous: NavigationSnapshot,
  next: NavigationSnapshot,
): boolean {
  return (
    previous.surface === 'passwords' &&
    next.surface === 'passwords' &&
    ((previous.passwords?.kind === 'entry-edit' && next.passwords?.kind === 'entry') ||
      (previous.passwords?.kind === 'create-entry' && next.passwords?.kind === 'entry') ||
      (previous.passwords?.kind === 'create-group' && next.passwords?.kind === 'group'))
  )
}

function historyIndexFromState(value: unknown): number {
  if (!value || typeof value !== 'object') {
    return 0
  }

  const raw = (value as Partial<HistoryState>).__chromvoidNavIndex
  return Number.isFinite(raw) ? (raw as number) : 0
}

function historyGenerationFromState(value: unknown): number {
  if (!value || typeof value !== 'object') {
    return 0
  }

  const raw = (value as Partial<HistoryState>).__chromvoidNavGeneration
  return Number.isFinite(raw) ? (raw as number) : 0
}

class NavigationModel {
  readonly snapshot = state<NavigationSnapshot>(DEFAULT_SNAPSHOT)
  readonly currentSurface = computed<SurfaceId>(() => this.snapshot().surface)
  readonly filesPath = computed<string>(() => this.snapshot().files?.path || DEFAULT_FILES_PATH)
  readonly detailsFileId = computed<number | null>(() => {
    const snapshot = this.snapshot()
    if (snapshot.surface !== 'files' || snapshot.overlay?.kind !== 'details') {
      return null
    }

    return snapshot.overlay.fileId
  })
  readonly isDetailsOpen = computed<boolean>(() => this.detailsFileId() !== null)
  readonly isDetailsHidden = computed<boolean>(() => this.currentSurface() !== 'files')
  readonly mobileCommandSurface = computed<'files' | 'passwords' | 'none'>(() => {
    const surface = this.currentSurface()
    if (surface === 'files' || surface === 'passwords') {
      return surface
    }

    return 'none'
  })

  private readonly catalogRevision = state(0)
  private readonly overlayEvaluation = computed<OverlayEvaluation>(() => this.evaluateOverlay())
  readonly resolvedOverlay = computed<ResolvedOverlayState>(() => this.overlayEvaluation().resolved)

  private connected = false
  private historyIndex = 0
  private historyGeneration = 0
  private suppressExternalSync = 0
  private scheduledExternalSync = false
  private scheduledHistoryMode: Exclude<HistoryMode, 'none'> = 'push'

  private readonly unsubscribers: Array<() => void> = []
  private readonly surfaceBackHandlers = new Map<SurfaceId, SurfaceBackHandler>()

  isConnected(): boolean {
    return this.connected
  }

  connect(): void {
    if (this.connected || typeof window === 'undefined') {
      return
    }

    this.connected = true
    this.catalogRevision.set(0)
    this.subscribeToExternalState()
    window.addEventListener('popstate', this.handlePopState)

    const initial = decodeNavigationSnapshotFromUrl(window.location.href) ?? this.readExternalSnapshot()
    this.historyIndex = historyIndexFromState(window.history.state)
    this.historyGeneration = historyGenerationFromState(window.history.state)
    this.applySnapshot(initial, 'replace')
  }

  disconnect(): void {
    if (!this.connected || typeof window === 'undefined') {
      return
    }

    this.connected = false
    window.removeEventListener('popstate', this.handlePopState)
    while (this.unsubscribers.length > 0) {
      const unsubscribe = this.unsubscribers.pop()
      try {
        unsubscribe?.()
      } catch {
        // best-effort cleanup
      }
    }
  }

  attachPassmanager(root: typeof window.passmanager | undefined): void {
    passmanagerNavigationController.attach(root)

    const current = this.snapshot()
    if (current.surface === 'passwords' && root) {
      this.withSuppressedExternalSync(() => {
        passmanagerNavigationController.applyRoute(current.passwords ?? {kind: 'root'})
      })
    }
  }

  detachPassmanager(): void {
    passmanagerNavigationController.detach()
  }

  navigateToSurface(surface: SurfaceId): void {
    const current = this.snapshot()
    if (surface === 'files') {
      this.applySnapshot(
        {
          surface,
          files: {path: current.files?.path || this.readExternalFilesPath()},
          overlay: DEFAULT_OVERLAY,
        },
        'push',
      )
      return
    }

    if (surface === 'passwords') {
      this.applySnapshot(
        {
          surface,
          passwords: {kind: 'root'},
          overlay: DEFAULT_OVERLAY,
        },
        'push',
      )
      return
    }

    this.applySnapshot({surface, overlay: DEFAULT_OVERLAY}, 'push')
  }

  navigateFilesPath(path: string, historyMode: Exclude<HistoryMode, 'none'> = 'push'): void {
    this.applySnapshot(
      {
        surface: 'files',
        files: {path},
        overlay: DEFAULT_OVERLAY,
      },
      historyMode,
    )
  }

  openDetails(fileId: number, historyMode: Exclude<HistoryMode, 'none'> = 'push'): void {
    const path = this.currentSurface() === 'files' ? this.filesPath() : this.readExternalFilesPath()
    this.applySnapshot(
      {
        surface: 'files',
        files: {path},
        overlay: {kind: 'details', fileId},
      },
      historyMode,
    )
  }

  openGallery(fileId: number, historyMode: Exclude<HistoryMode, 'none'> = 'push'): void {
    const path = this.currentSurface() === 'files' ? this.filesPath() : this.readExternalFilesPath()
    this.applySnapshot(
      {
        surface: 'files',
        files: {path},
        overlay: {kind: 'gallery', fileId},
      },
      historyMode,
    )
  }

  openVideo(fileId: number, historyMode: Exclude<HistoryMode, 'none'> = 'push'): void {
    const path = this.currentSurface() === 'files' ? this.filesPath() : this.readExternalFilesPath()
    this.applySnapshot(
      {
        surface: 'files',
        files: {path},
        overlay: {kind: 'video', fileId},
      },
      historyMode,
    )
  }

  closeOverlay(historyMode: Exclude<HistoryMode, 'none'> = 'push'): void {
    const current = this.snapshot()
    if (current.overlay?.kind === 'none') {
      return
    }

    this.applySnapshot(
      {
        ...current,
        overlay: DEFAULT_OVERLAY,
      },
      historyMode,
    )
  }

  openPassmanagerRoute(route: PassmanagerRoute): void {
    this.applySnapshot(
      {
        surface: 'passwords',
        passwords: route,
        overlay: DEFAULT_OVERLAY,
      },
      'push',
    )
  }

  goBack(): boolean {
    const currentSurface = this.snapshot().surface
    const surfaceBackHandler = this.surfaceBackHandlers.get(currentSurface)
    if (surfaceBackHandler?.()) {
      return true
    }

    if (typeof window !== 'undefined' && this.historyIndex > 0) {
      window.history.back()
      return true
    }

    const fallback = this.buildFallbackSnapshot(this.snapshot())
    if (!fallback || snapshotsEqual(fallback, this.snapshot())) {
      return false
    }

    this.applySnapshot(fallback, 'replace')
    return true
  }

  reset(): void {
    this.historyGeneration += 1
    this.historyIndex = 0
    this.applySnapshot(DEFAULT_SNAPSHOT, 'replace')
  }

  registerSurfaceBackHandler(surface: SurfaceId, handler: SurfaceBackHandler): () => void {
    this.surfaceBackHandlers.set(surface, handler)
    return () => {
      if (this.surfaceBackHandlers.get(surface) === handler) {
        this.surfaceBackHandlers.delete(surface)
      }
    }
  }

  syncFromExternal(historyMode: Exclude<HistoryMode, 'none'> = 'push'): void {
    if (this.suppressExternalSync > 0) {
      return
    }

    const current = this.snapshot()
    const next = this.readExternalSnapshot()
    if (snapshotsEqual(next, current)) {
      return
    }

    const effectiveHistoryMode =
      historyMode === 'push' && shouldReplaceTransientPasswordsHistoryEntry(current, next)
        ? 'replace'
        : historyMode

    this.applySnapshot(next, effectiveHistoryMode)
  }

  private subscribeToExternalState(): void {
    const ctx = tryGetAppContext()
    const catalog = ctx?.catalog?.catalog
    const schedule = (mode: Exclude<HistoryMode, 'none'> = 'push') => this.scheduleExternalSync(mode)

    if (catalog?.subscribe) {
      this.unsubscribers.push(
        catalog.subscribe(() => {
          this.catalogRevision.set(this.catalogRevision() + 1)
        }),
      )
    }

    this.unsubscribers.push(passmanagerNavigationController.subscribe(() => schedule('push')))
    this.unsubscribers.push(
      this.overlayEvaluation.subscribe(() => {
        this.syncInvalidOverlay()
      }),
    )
  }

  private scheduleExternalSync(mode: Exclude<HistoryMode, 'none'>): void {
    if (this.suppressExternalSync > 0) {
      return
    }

    if (mode === 'push') {
      this.scheduledHistoryMode = 'push'
    }

    if (this.scheduledExternalSync) {
      return
    }

    this.scheduledExternalSync = true
    queueMicrotask(() => {
      this.scheduledExternalSync = false
      const nextMode = this.scheduledHistoryMode
      this.scheduledHistoryMode = 'push'
      this.syncFromExternal(nextMode)
    })
  }

  private readExternalSnapshot(): NavigationSnapshot {
    const current = this.snapshot()

    if (current.surface === 'passwords') {
      const route: PassmanagerRoute =
        window.passmanager != null
          ? passmanagerNavigationController.readRoute()
          : current.passwords ?? {kind: 'root'}

      return normalizeSnapshot({
        surface: 'passwords',
        passwords: route,
        overlay: DEFAULT_OVERLAY,
      })
    }

    if (current.surface === 'files') {
      return normalizeSnapshot({
        surface: 'files',
        files: {path: this.readExternalFilesPath()},
        overlay: this.readExternalFilesOverlay(current.overlay),
      })
    }

    return current
  }

  private readExternalFilesPath(): string {
    const ctx = tryGetAppContext()
    return ctx?.store.currentPath?.() || this.filesPath() || DEFAULT_FILES_PATH
  }

  private readExternalFilesOverlay(currentOverlay: OverlayRoute | undefined): OverlayRoute {
    if (currentOverlay?.kind === 'gallery' || currentOverlay?.kind === 'video') {
      return currentOverlay
    }

    const ctx = tryGetAppContext()
    const fileId = ctx?.store.detailsPanelFileId?.()
    if (typeof fileId === 'number' && Number.isFinite(fileId)) {
      return {kind: 'details', fileId}
    }

    return DEFAULT_OVERLAY
  }

  private applySnapshot(snapshot: NavigationSnapshot, historyMode: HistoryMode): void {
    const next = normalizeSnapshot(snapshot)
    const current = this.snapshot()

    this.withSuppressedExternalSync(() => {
      this.applySnapshotToExternal(next)
      this.snapshot.set(next)
    })

    this.syncHistory(next, current, historyMode)
  }

  private applySnapshotToExternal(snapshot: NavigationSnapshot): void {
    const {store} = getAppContext()

    store.showRemoteStoragePage?.set(false)
    store.showGatewayPage?.set(false)
    store.showRemotePage?.set(false)
    store.showSettingsPage?.set(false)
    store.showNetworkPairPage?.set(false)
    store.isShowPasswordManager?.set(false)
    store.detailsPanelFileId?.set(null)

    switch (snapshot.surface) {
      case 'files':
        store.currentPath?.set(snapshot.files?.path || DEFAULT_FILES_PATH)
        if (snapshot.overlay?.kind === 'details') {
          store.detailsPanelFileId?.set(snapshot.overlay.fileId)
        }
        break
      case 'passwords':
        store.isShowPasswordManager?.set(true)
        if (window.passmanager) {
          passmanagerNavigationController.applyRoute(snapshot.passwords ?? {kind: 'root'})
        }
        break
      case 'settings':
        store.showSettingsPage?.set(true)
        break
      case 'remote':
        store.showRemotePage?.set(true)
        break
      case 'gateway':
        store.showGatewayPage?.set(true)
        break
      case 'remote-storage':
        store.showRemoteStoragePage?.set(true)
        break
      case 'network-pair':
        store.showNetworkPairPage?.set(true)
        break
    }
  }

  private syncHistory(next: NavigationSnapshot, previous: NavigationSnapshot, historyMode: HistoryMode): void {
    if (typeof window === 'undefined' || historyMode === 'none') {
      return
    }

    const nextUrl = encodeNavigationSnapshotToUrl(next, window.location.href)
    const prevUrl = encodeNavigationSnapshotToUrl(previous, window.location.href)
    const changed = !snapshotsEqual(next, previous) || nextUrl !== prevUrl

    if (!changed && historyMode === 'push') {
      return
    }

    if (historyMode === 'replace') {
      window.history.replaceState(this.buildHistoryState(this.historyIndex), '', nextUrl)
      return
    }

    this.historyIndex += 1
    window.history.pushState(this.buildHistoryState(this.historyIndex), '', nextUrl)
  }

  private buildHistoryState(index: number): HistoryState {
    return {
      __chromvoidNavIndex: index,
      __chromvoidNavGeneration: this.historyGeneration,
    }
  }

  private buildFallbackSnapshot(snapshot: NavigationSnapshot): NavigationSnapshot | null {
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
        case 'entry-edit':
          return normalizeSnapshot({
            surface: 'passwords',
            passwords: {kind: 'entry', entryId: route.entryId, groupPath: route.groupPath},
            overlay: DEFAULT_OVERLAY,
          })
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
          return normalizeSnapshot({
            surface: 'passwords',
            passwords: {kind: 'root'},
            overlay: DEFAULT_OVERLAY,
          })
        case 'root':
          return normalizeSnapshot({
            surface: 'files',
            files: {path: this.readExternalFilesPath()},
            overlay: DEFAULT_OVERLAY,
          })
      }
    }

    return normalizeSnapshot({
      surface: 'files',
      files: {path: this.readExternalFilesPath()},
      overlay: DEFAULT_OVERLAY,
    })
  }

  private withSuppressedExternalSync<T>(fn: () => T): T {
    this.suppressExternalSync++
    try {
      return fn()
    } finally {
      this.suppressExternalSync--
    }
  }

  private evaluateOverlay(): OverlayEvaluation {
    const snapshot = this.snapshot()
    const overlay = snapshot.overlay ?? DEFAULT_OVERLAY

    if (snapshot.surface !== 'files' || overlay.kind === 'none') {
      return {resolved: CLOSED_OVERLAY, shouldCanonicalize: false}
    }

    if (overlay.kind === 'details') {
      return {
        resolved: {kind: 'details', fileId: overlay.fileId},
        shouldCanonicalize: false,
      }
    }

    const ctx = tryGetAppContext()
    const store = ctx?.store
    const catalog = ctx?.catalog
    const path = snapshot.files?.path || DEFAULT_FILES_PATH
    const filters = store?.searchFilters?.() ?? DEFAULT_SEARCH_FILTERS
    const syncing = Boolean(catalog?.syncing?.())
    const revision = this.catalogRevision()
    const pathKnown = this.isCatalogPathKnown(path)
    const pending = syncing || (!pathKnown && revision === 0)

    if (overlay.kind === 'gallery') {
      const images = this.getGalleryImages(path, filters)
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

    const fileName = this.getVideoFileName(path, overlay.fileId, filters)
    if (fileName) {
      return {
        resolved: {
          kind: 'video',
          fileId: overlay.fileId,
          fileName,
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

  private syncInvalidOverlay(): void {
    if (this.suppressExternalSync > 0) {
      return
    }

    const evaluation = this.overlayEvaluation()
    const current = this.snapshot()
    if (
      !evaluation.shouldCanonicalize ||
      current.surface !== 'files' ||
      (current.overlay?.kind !== 'gallery' && current.overlay?.kind !== 'video')
    ) {
      return
    }

    this.applySnapshot(
      {
        ...current,
        overlay: DEFAULT_OVERLAY,
      },
      'replace',
    )
  }

  private isCatalogPathKnown(path: string): boolean {
    const catalog = tryGetAppContext()?.catalog?.catalog
    if (!catalog) {
      return false
    }

    if (typeof catalog.findByPath === 'function' && catalog.findByPath(path)) {
      return true
    }

    if (path === '/' && typeof catalog.getChildren === 'function') {
      return Array.isArray(catalog.getChildren('/'))
    }

    return false
  }

  private getGalleryImages(path: string, filters: SearchFilters): ResolvedGalleryImage[] {
    const children = this.getCatalogChildren(path)
    return children
      .filter((node) => {
        if (node?.isDir) return false
        if (!isImageFile(String(node?.name ?? ''))) return false
        if (!filters.showHidden && String(node?.name ?? '').startsWith('.')) return false
        return true
      })
      .map((node) => ({
        id: Number(node.nodeId),
        name: String(node.name ?? ''),
      }))
  }

  private getVideoFileName(path: string, fileId: number, filters: SearchFilters): string {
    const children = this.getCatalogChildren(path)
    const match = children.find((node) => {
      if (node?.isDir) return false
      if (Number(node?.nodeId) !== fileId) return false
      if (!isVideoFile(String(node?.name ?? ''))) return false
      if (!filters.showHidden && String(node?.name ?? '').startsWith('.')) return false
      return true
    })

    return match?.name ? String(match.name) : ''
  }

  private getCatalogChildren(path: string): any[] {
    try {
      const children = tryGetAppContext()?.catalog?.catalog?.getChildren?.(path)
      return Array.isArray(children) ? children : []
    } catch {
      return []
    }
  }

  private restoreCurrentHistoryEntry(): void {
    if (typeof window === 'undefined') {
      return
    }

    const url = encodeNavigationSnapshotToUrl(this.snapshot(), window.location.href)
    window.history.replaceState(this.buildHistoryState(this.historyIndex), '', url)
  }

  private readonly handlePopState = (event: PopStateEvent) => {
    const stateGeneration = historyGenerationFromState(event.state)
    if (stateGeneration !== this.historyGeneration) {
      this.restoreCurrentHistoryEntry()
      return
    }

    const decoded = decodeNavigationSnapshotFromUrl(window.location.href) ?? DEFAULT_SNAPSHOT
    this.historyIndex = historyIndexFromState(event.state)
    this.applySnapshot(decoded, 'none')
  }
}

export const navigationModel = new NavigationModel()
