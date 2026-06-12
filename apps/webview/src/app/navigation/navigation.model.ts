import {atom, computed} from '@reatom/core'
import type {ManagerRoot} from '@project/passmanager/core'

import {defaultLogger} from 'root/core/logger'
import {isTauriRuntime} from 'root/core/runtime/runtime'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {tryGetAppContext} from 'root/shared/services/app-context'
import {decodeNavigationSnapshotFromUrl} from './navigation-url-codec'
import {NavigationExternalSync} from './navigation-external-sync'
import {NavigationHistoryRuntime} from './navigation-history-runtime'
import {
  evaluateNavigationDocument,
  evaluateNavigationOverlay,
  type OverlayEvaluation,
} from './navigation-overlay-resolver'
import {
  buildFallbackSnapshot,
  buildHierarchyFallbackSnapshot,
  DEFAULT_FILES_PATH,
  DEFAULT_OVERLAY,
  DEFAULT_SNAPSHOT,
  normalizeSnapshot,
  snapshotsEqual,
} from './navigation-snapshot'
import type {
  HistoryMode,
  MarkdownDocumentRouteSource,
  NavigationBlocker,
  NavigationBlockerIntent,
  NavigationIntentKind,
  NavigationSnapshot,
  PassmanagerRoute,
  ResolvedFilesDocumentState,
  RemotePanel,
  ResolvedOverlayState,
  SurfaceId,
} from './navigation.types'

type SurfaceBackHandler = () => boolean
type ResolvedAudioOverlay = Extract<ResolvedOverlayState, {kind: 'audio'}>
type OpenMarkdownDocumentOptions =
  | string
  | {
      parentPath?: string
      source?: MarkdownDocumentRouteSource
    }

const logger = defaultLogger

function defaultSurfaceHistoryMode(): Exclude<HistoryMode, 'none'> {
  return isAndroidMobileRuntime() ? 'replace' : 'push'
}

function isAndroidMobileRuntime(): boolean {
  const caps = getRuntimeCapabilities()
  if (caps.platform === 'android' && caps.mobile) {
    return true
  }

  return isTauriRuntime() && typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)
}

function replacePathFileName(path: string, fileName: string): string {
  const normalizedPath = path.trim()
  if (!normalizedPath || normalizedPath === '/') {
    return fileName
  }

  const separatorIndex = normalizedPath.lastIndexOf('/')
  if (separatorIndex < 0) {
    return fileName
  }

  const parentPath = normalizedPath.slice(0, separatorIndex)
  return `${parentPath || ''}/${fileName}`
}

class NavigationModel {
  readonly snapshot = atom<NavigationSnapshot>(DEFAULT_SNAPSHOT)
  readonly currentSurface = computed<SurfaceId>(() => this.snapshot().surface)
  readonly remotePanel = computed<RemotePanel>(() => this.snapshot().remote?.panel ?? 'hosts')
  readonly filesPath = computed<string>(() => this.snapshot().files?.path || DEFAULT_FILES_PATH)
  readonly activeMobileTab = computed<'files' | 'notes' | 'passwords' | 'otp'>(() => {
    const snapshot = this.snapshot()
    if (snapshot.surface === 'passwords' && snapshot.passwords?.kind === 'otp-view') {
      return 'otp'
    }

    if (snapshot.surface === 'passwords') {
      return 'passwords'
    }

    if (snapshot.surface === 'notes' || snapshot.files?.document?.originSurface === 'notes') {
      return 'notes'
    }

    return 'files'
  })
  readonly detailsFileId = computed<number | null>(() => {
    const snapshot = this.snapshot()
    if (snapshot.surface !== 'files' || snapshot.overlay?.kind !== 'details') {
      return null
    }

    return snapshot.overlay.fileId
  })
  readonly isDetailsOpen = computed<boolean>(() => this.detailsFileId() !== null)
  readonly isDetailsHidden = computed<boolean>(() => this.currentSurface() !== 'files')
  readonly mobileCommandSurface = computed<'files' | 'notes' | 'passwords' | 'none'>(() => {
    const surface = this.currentSurface()
    if (surface === 'files' || surface === 'notes' || surface === 'passwords') {
      return surface
    }

    return 'none'
  })

  private readonly catalogRevision = atom(0)
  private readonly overlayEvaluation = computed<OverlayEvaluation>(() =>
    evaluateNavigationOverlay({
      snapshot: this.snapshot(),
      ctx: tryGetAppContext(),
      catalogRevision: this.catalogRevision(),
    }),
  )
  readonly resolvedOverlay = computed<ResolvedOverlayState>(() => this.overlayEvaluation().resolved)
  private readonly documentEvaluation = computed(() =>
    evaluateNavigationDocument({
      snapshot: this.snapshot(),
      ctx: tryGetAppContext(),
      catalogRevision: this.catalogRevision(),
    }),
  )
  readonly resolvedDocument = computed<ResolvedFilesDocumentState>(() => this.documentEvaluation().resolved)

  private connected = false
  private suppressExternalSync = 0
  private approvedNavigationIntent: NavigationBlockerIntent | null = null
  private readonly navigationBlockers = new Set<NavigationBlocker>()
  private readonly surfaceBackHandlers = new Map<SurfaceId, SurfaceBackHandler>()
  private readonly historyRuntime = new NavigationHistoryRuntime({
    logger,
    getSnapshot: () => this.snapshot(),
    applySnapshot: (snapshot, historyMode, intentKind, resumeEffect) =>
      this.applySnapshot(snapshot, historyMode, intentKind, resumeEffect),
    consumeCurrentSurfaceBack: () => this.consumeCurrentSurfaceBack(),
  })
  private readonly externalSync = new NavigationExternalSync({
    logger,
    getSnapshot: () => this.snapshot(),
    applySnapshot: (snapshot, historyMode) => this.applySnapshot(snapshot, historyMode),
    withSuppressedExternalSync: (fn) => this.withSuppressedExternalSync(fn),
    isExternalSyncSuppressed: () => this.suppressExternalSync > 0,
    incrementCatalogRevision: () => this.catalogRevision.set(this.catalogRevision() + 1),
    subscribeOverlayEvaluation: (listener) => this.overlayEvaluation.subscribe(listener),
    subscribeDocumentEvaluation: (listener) => this.documentEvaluation.subscribe(listener),
    syncInvalidOverlay: () => this.syncInvalidOverlay(),
    syncInvalidDocument: () => this.syncInvalidDocument(),
  })

  isConnected(): boolean {
    return this.connected
  }

  connect(): void {
    if (this.connected || typeof window === 'undefined') {
      return
    }

    this.connected = true
    this.catalogRevision.set(0)
    this.historyRuntime.initializeFromWindow()

    const initial = decodeNavigationSnapshotFromUrl(window.location.href) ?? this.externalSync.readExternalSnapshot()
    this.applySnapshot(initial, 'replace')

    this.externalSync.subscribeToExternalState()
    window.addEventListener('popstate', this.historyRuntime.handlePopState)
  }

  disconnect(): void {
    if (!this.connected || typeof window === 'undefined') {
      return
    }

    this.connected = false
    window.removeEventListener('popstate', this.historyRuntime.handlePopState)
    this.historyRuntime.clearSession()
    this.externalSync.cleanupSubscriptions()
  }

  attachPassmanager(root: ManagerRoot | undefined): void {
    this.externalSync.attachPassmanager(root)
  }

  detachPassmanager(): void {
    this.externalSync.detachPassmanager()
  }

  navigateToSurface(
    surface: SurfaceId,
    historyMode: Exclude<HistoryMode, 'none'> = defaultSurfaceHistoryMode(),
  ): void {
    const current = this.snapshot()
    if (surface === 'files') {
      this.applySnapshot(
        {
          surface,
          files: {path: current.files?.path || this.externalSync.readExternalFilesPath(this.filesPath())},
          overlay: DEFAULT_OVERLAY,
        },
        historyMode,
        'surface-change',
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
        historyMode,
        'surface-change',
      )
      return
    }

    if (surface === 'notes') {
      this.applySnapshot(
        {
          surface,
          overlay: DEFAULT_OVERLAY,
        },
        historyMode,
        'surface-change',
      )
      return
    }

    if (surface === 'remote') {
      this.applySnapshot({surface, remote: {panel: 'hosts'}, overlay: DEFAULT_OVERLAY}, historyMode, 'surface-change')
      return
    }

    this.applySnapshot({surface, overlay: DEFAULT_OVERLAY}, historyMode, 'surface-change')
  }

  navigateToRemotePanel(panel: RemotePanel, historyMode: Exclude<HistoryMode, 'none'> = 'push'): void {
    this.applySnapshot(
      {
        surface: 'remote',
        remote: {panel},
        overlay: DEFAULT_OVERLAY,
      },
      historyMode,
      'surface-change',
    )
  }

  navigateFilesPath(path: string, historyMode: Exclude<HistoryMode, 'none'> = 'push'): void {
    this.applySnapshot(
      {
        surface: 'files',
        files: {path},
        overlay: DEFAULT_OVERLAY,
      },
      historyMode,
      'path-change',
    )
  }

  openMarkdownDocument(
    fileId: number,
    historyMode: Exclude<HistoryMode, 'none'> = 'push',
    options?: OpenMarkdownDocumentOptions,
  ): void {
    const parentPath = typeof options === 'string' ? options : options?.parentPath
    const source = typeof options === 'string' ? undefined : options?.source
    const originSurface = this.currentSurface() === 'notes' ? 'notes' : undefined
    const path =
      parentPath ??
      (this.currentSurface() === 'files'
        ? this.filesPath()
        : this.externalSync.readExternalFilesPath(this.filesPath()))
    this.applySnapshot(
      {
        surface: 'files',
        files: {
          path,
          document: {
            kind: 'markdown',
            fileId,
            ...(originSurface ? {originSurface} : {}),
            ...(source ? {source} : {}),
          },
        },
        overlay: DEFAULT_OVERLAY,
      },
      historyMode,
      'open-document',
    )
  }

  updateCurrentMarkdownDocumentFileName(fileId: number, fileName: string): boolean {
    const current = this.snapshot()
    const document = current.files?.document
    if (current.surface !== 'files' || document?.kind !== 'markdown' || document.fileId !== fileId) {
      return false
    }

    const source = document.source
    if (!source || source.fileName === fileName) {
      return false
    }

    this.applySnapshot(
      {
        ...current,
        files: {
          path: current.files?.path || DEFAULT_FILES_PATH,
          document: {
            ...document,
            source: {
              ...source,
              path: replacePathFileName(source.path, fileName),
              fileName,
            },
          },
        },
      },
      'replace',
      'open-document',
    )
    return true
  }

  closeFilesDocument(historyMode: Exclude<HistoryMode, 'none'> = 'push'): void {
    const current = this.snapshot()
    if (current.surface !== 'files' || !current.files?.document) {
      return
    }

    this.applySnapshot(
      {
        surface: 'files',
        files: {path: current.files.path || DEFAULT_FILES_PATH},
        overlay: DEFAULT_OVERLAY,
      },
      historyMode,
      'close-document',
    )
  }

  openDetails(fileId: number, historyMode: Exclude<HistoryMode, 'none'> = 'replace'): void {
    const path = this.currentSurface() === 'files'
      ? this.filesPath()
      : this.externalSync.readExternalFilesPath(this.filesPath())
    this.applySnapshot(
      {
        surface: 'files',
        files: {path},
        overlay: {kind: 'details', fileId},
      },
      historyMode,
      'open-overlay',
    )
  }

  openGallery(fileId: number, historyMode: Exclude<HistoryMode, 'none'> = 'replace'): void {
    const path = this.currentSurface() === 'files'
      ? this.filesPath()
      : this.externalSync.readExternalFilesPath(this.filesPath())
    this.applySnapshot(
      {
        surface: 'files',
        files: {path},
        overlay: {kind: 'gallery', fileId},
      },
      historyMode,
      'open-overlay',
    )
  }

  openPreview(fileId: number, historyMode: Exclude<HistoryMode, 'none'> = 'replace'): void {
    const path = this.currentSurface() === 'files'
      ? this.filesPath()
      : this.externalSync.readExternalFilesPath(this.filesPath())
    this.applySnapshot(
      {
        surface: 'files',
        files: {path},
        overlay: {kind: 'preview', fileId},
      },
      historyMode,
      'open-overlay',
    )
  }

  openVideo(fileId: number, historyMode: Exclude<HistoryMode, 'none'> = 'replace'): void {
    const path = this.currentSurface() === 'files'
      ? this.filesPath()
      : this.externalSync.readExternalFilesPath(this.filesPath())
    this.applySnapshot(
      {
        surface: 'files',
        files: {path},
        overlay: {kind: 'video', fileId},
      },
      historyMode,
      'open-overlay',
    )
  }

  openAudio(fileId: number, historyMode: Exclude<HistoryMode, 'none'> = 'replace'): void {
    const path = this.currentSurface() === 'files'
      ? this.filesPath()
      : this.externalSync.readExternalFilesPath(this.filesPath())
    this.applySnapshot(
      {
        surface: 'files',
        files: {path},
        overlay: {kind: 'audio', fileId},
      },
      historyMode,
      'open-overlay',
    )
  }

  resolveAudio(fileId: number): ResolvedAudioOverlay | null {
    const path = this.currentSurface() === 'files'
      ? this.filesPath()
      : this.externalSync.readExternalFilesPath(this.filesPath())
    const evaluation = evaluateNavigationOverlay({
      snapshot: {
        surface: 'files',
        files: {path},
        overlay: {kind: 'audio', fileId},
      },
      ctx: tryGetAppContext(),
      catalogRevision: this.catalogRevision(),
    })

    return evaluation.resolved.kind === 'audio' ? evaluation.resolved : null
  }

  closeOverlay(historyMode: Exclude<HistoryMode, 'none'> = 'replace'): void {
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
      'close-overlay',
    )
  }

  closeOverlayFromUi(): void {
    const current = this.snapshot()
    if (current.overlay?.kind === 'none') {
      return
    }

    const closed = normalizeSnapshot({
      ...current,
      overlay: DEFAULT_OVERLAY,
    })
    const previous = this.historyRuntime.getPreviousSnapshot()
    if (
      this.historyRuntime.hasBrowserHistoryEntry() &&
      previous &&
      snapshotsEqual(previous, closed)
    ) {
      this.historyRuntime.back()
      return
    }

    this.applySnapshot(closed, 'replace', 'close-overlay')
  }

  openPassmanagerRoute(route: PassmanagerRoute): void {
    this.applySnapshot(
      {
        surface: 'passwords',
        passwords: route,
        overlay: DEFAULT_OVERLAY,
      },
      'push',
      'surface-change',
    )
  }

  goBack(): boolean {
    if (this.consumeCurrentSurfaceBack()) {
      return true
    }

    if (this.historyRuntime.hasBrowserHistoryEntry()) {
      this.historyRuntime.back()
      return true
    }

    const current = this.snapshot()
    const fallback = buildFallbackSnapshot(
      current,
      () => this.externalSync.readExternalFilesPath(this.filesPath()),
    )
    if (!fallback || snapshotsEqual(fallback, current)) {
      return false
    }

    this.applySnapshot(fallback, 'replace', 'ui-back')
    return true
  }

  goBackFromUi(): boolean {
    const current = this.snapshot()
    if (this.consumeCurrentSurfaceBack()) {
      return true
    }

    const fallback = buildHierarchyFallbackSnapshot(current)
    if (!fallback || snapshotsEqual(fallback, current)) {
      return false
    }

    this.applySnapshot(fallback, 'replace', 'ui-back')
    return true
  }

  reset(): void {
    this.historyRuntime.resetToSnapshot(DEFAULT_SNAPSHOT)
  }

  registerSurfaceBackHandler(surface: SurfaceId, handler: SurfaceBackHandler): () => void {
    this.surfaceBackHandlers.set(surface, handler)
    return () => {
      if (this.surfaceBackHandlers.get(surface) === handler) {
        this.surfaceBackHandlers.delete(surface)
      }
    }
  }

  registerNavigationBlocker(blocker: NavigationBlocker): () => void {
    this.navigationBlockers.add(blocker)
    return () => {
      this.navigationBlockers.delete(blocker)
    }
  }

  syncFromExternal(historyMode: Exclude<HistoryMode, 'none'> = 'push'): void {
    this.externalSync.syncFromExternal(historyMode)
  }

  private applySnapshot(
    snapshot: NavigationSnapshot,
    historyMode: HistoryMode,
    intentKind: NavigationIntentKind = 'surface-change',
    resumeEffect?: () => void,
  ): boolean {
    const next = normalizeSnapshot(snapshot)
    const current = this.snapshot()
    const intent: NavigationBlockerIntent = {
      kind: intentKind,
      current,
      next,
      historyMode,
    }

    if (this.consumeApprovedNavigationIntent(intent)) {
      this.commitSnapshot(next, historyMode)
      return true
    }

    if (this.consumeNavigationBlocker(intent, resumeEffect)) {
      return false
    }

    this.commitSnapshot(next, historyMode)
    return true
  }

  private commitSnapshot(next: NavigationSnapshot, historyMode: HistoryMode): void {
    const previous = this.snapshot()

    this.withSuppressedExternalSync(() => {
      this.externalSync.applySnapshotToExternal(next)
      this.snapshot.set(next)
    })

    this.historyRuntime.syncHistory(next, previous, historyMode)
  }

  private consumeNavigationBlocker(
    intent: NavigationBlockerIntent,
    resumeEffect: (() => void) | undefined,
  ): boolean {
    if (this.navigationBlockers.size === 0) {
      return false
    }

    let resumed = false
    const resume = () => {
      if (resumed) {
        return
      }
      resumed = true
      this.approvedNavigationIntent = intent
      if (resumeEffect) {
        resumeEffect()
        return
      }
      this.applySnapshot(intent.next, intent.historyMode, intent.kind)
    }

    for (const blocker of this.navigationBlockers) {
      if (blocker(intent, resume)) {
        return true
      }
    }

    return false
  }

  private consumeApprovedNavigationIntent(intent: NavigationBlockerIntent): boolean {
    const approved = this.approvedNavigationIntent
    if (
      !approved ||
      approved.kind !== intent.kind ||
      approved.historyMode !== intent.historyMode ||
      !snapshotsEqual(approved.current, intent.current) ||
      !snapshotsEqual(approved.next, intent.next)
    ) {
      return false
    }

    this.approvedNavigationIntent = null
    return true
  }

  private consumeCurrentSurfaceBack(): boolean {
    const currentSurface = this.snapshot().surface
    return this.surfaceBackHandlers.get(currentSurface)?.() ?? false
  }

  private syncInvalidOverlay(): void {
    if (this.suppressExternalSync > 0) {
      return
    }

    const evaluation = this.overlayEvaluation()
    const current = this.snapshot()
    if (evaluation.canonicalSnapshot) {
      this.applySnapshot(evaluation.canonicalSnapshot, 'replace', 'open-document')
      return
    }

    if (
      !evaluation.shouldCanonicalize ||
      current.surface !== 'files' ||
      (current.overlay?.kind !== 'gallery' &&
        current.overlay?.kind !== 'preview' &&
        current.overlay?.kind !== 'video')
    ) {
      return
    }

    this.applySnapshot(
      {
        ...current,
        overlay: DEFAULT_OVERLAY,
      },
      'replace',
      'close-overlay',
    )
  }

  private syncInvalidDocument(): void {
    if (this.suppressExternalSync > 0) {
      return
    }

    const evaluation = this.documentEvaluation()
    const current = this.snapshot()
    if (!evaluation.shouldCanonicalize || current.surface !== 'files' || !current.files?.document) {
      return
    }

    this.applySnapshot(
      {
        surface: 'files',
        files: {path: current.files.path || DEFAULT_FILES_PATH},
        overlay: DEFAULT_OVERLAY,
      },
      'replace',
      'close-document',
    )
  }

  private withSuppressedExternalSync<T>(fn: () => T): T {
    this.suppressExternalSync++
    try {
      return fn()
    } finally {
      this.suppressExternalSync--
    }
  }
}

export const navigationModel = new NavigationModel()
