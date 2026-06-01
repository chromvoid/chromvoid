import {atom, computed} from '@reatom/core'
import type {Routes} from 'root/app/router/router'

import {ensureRouteComponents} from 'root/app/bootstrap/surface-component-loader'
import {init} from 'root/app/bootstrap/Initialize'
import {applyLayoutQueryParam} from 'root/app/layout/layout-mode'
import {navigationModel} from 'root/app/navigation/navigation.model'
import type {
  NavigationBlockerIntent,
  ResolvedAudioTrack,
  ResolvedFilesDocumentState,
  ResolvedGalleryImage,
  SurfaceId,
} from 'root/app/navigation/navigation.types'
import type {ClientCatalogNode} from 'root/core/catalog/local-catalog/client-model'
import type {FilePreviewMode} from 'root/utils/file-format-registry'
import {
  pmMobileChromeModel,
  type PMMobileToolbarAction as PasswordMobileToolbarAction,
} from 'root/features/passmanager/models/pm-mobile-chrome.model'
import {pmModel} from 'root/features/passmanager/password-manager.model'
import {getFileManagerModel} from 'root/features/file-manager/file-manager.model'
import {markdownDocumentRenameModel} from 'root/features/file-manager/models/markdown-document-rename.model'
import {markdownPreviewModel} from 'root/features/file-manager/models/markdown-preview.model'
import {mediaPlaybackModel} from 'root/features/media/models/media-playback.model'
import {defaultLogger} from 'root/core/logger'
import {moduleAccessModel} from 'root/core/pro/module-access.model'
import {i18n} from 'root/i18n'
import {keyboardShortcutsModel} from 'root/shared/keyboard'
import {getAppContext, getRouter, tryGetAppContext} from 'root/shared/services/app-context'
import {subscribeAfterInitial} from 'root/shared/services/subscribed-signal'
import {transientBackModel} from 'root/shared/services/transient-back.model'
import {canShareFiles} from 'root/shared/services/share'
import {bindTheme} from 'root/shared/services/theme'
import {lockVaultFromUi} from 'root/shared/services/vault-lock'
import {remoteStorageModel} from './remote-storage/remote-storage.model'
import {AudioOverlaySessionSync, traceAudioOverlay} from './audio-overlay-session-sync'

let activeAppModel: ChromVoidAppModel | null = null

export type MobileToolbarLeadingMode = 'menu' | 'back' | 'none'

export type MobileToolbarStatusTone = 'saved' | 'dirty' | 'saving' | 'error' | 'readonly' | 'neutral'

export type MobileToolbarStatus = {
  tone: MobileToolbarStatusTone
  icon: string
  label: string
  spinner?: boolean
}

export type MobileToolbarState = {
  show: boolean
  title: string
  subtitle?: string
  status?: MobileToolbarStatus | null
  leading: MobileToolbarLeadingMode
  backDisabled: boolean
  showCommand: boolean
  commandActive?: boolean
  maxVisible: number
  overflowFromIndex?: number
  actions: PasswordMobileToolbarAction[]
  executeAction?: (actionId: string) => boolean
}

export type AppRouteMotionDirection = 'none' | 'forward' | 'back' | 'replace'

export type AppRouteMotionIntent = {
  kind: 'none' | 'surface-change'
  direction: AppRouteMotionDirection
  target: Routes | 'biometric-gate'
}

export type AppRouteTransitionPlan = {
  id: number
  route: Routes
  intent: AppRouteMotionIntent
}

function getRouteChangeDirection(previousRoute: Routes, nextRoute: Routes): AppRouteMotionDirection {
  if (previousRoute === 'welcome' && nextRoute === 'dashboard') {
    return 'forward'
  }

  if (previousRoute === 'dashboard' && nextRoute === 'welcome') {
    return 'back'
  }

  return 'replace'
}

export function getAppRouteMotionIntent(
  previousRoute: Routes | null,
  nextRoute: Routes,
  blockedByBiometricGate: boolean,
): AppRouteMotionIntent {
  const target = blockedByBiometricGate ? 'biometric-gate' : nextRoute

  if (previousRoute === null || previousRoute === nextRoute) {
    return {
      kind: 'none',
      direction: 'none',
      target,
    }
  }

  return {
    kind: 'surface-change',
    direction: blockedByBiometricGate ? 'replace' : getRouteChangeDirection(previousRoute, nextRoute),
    target,
  }
}

function buildMarkdownToolbarChrome(): {
  subtitle: string
  status: MobileToolbarStatus | null
} {
  const typeLabel = i18n('markdown:type-label' as never) as string
  return {subtitle: typeLabel, status: null}
}

export type AppGalleryImage = ResolvedGalleryImage
export type AppAudioTrack = ResolvedAudioTrack

export type ShellDetailsData = {
  id: number
  name: string
  size: number
  path: string
  lastModified: number | string
  sourceRevision?: number
  mimeType?: string
}

export type AppPreviewData = {
  fileId: number
  fileName: string
  size?: number
  mimeType?: string
  lastModified?: number
  sourceRevision?: number
  mode: FilePreviewMode
}

export function registerMarkdownNavigationGuard(): () => void {
  return navigationModel.registerNavigationBlocker((intent, resume) => {
    if (!shouldBlockMarkdownNavigation(intent)) {
      return false
    }

    const currentDocument = intent.current.files?.document
    if (intent.current.surface !== 'files' || currentDocument?.kind !== 'markdown') {
      return false
    }

    return !markdownPreviewModel.requestCloseIntent(
      {
        kind: 'navigation',
        navigationKind: intent.kind,
        fileId: currentDocument.fileId,
      },
      resume,
    )
  })
}

type AppRouteToolbarStore = {
  layoutMode: () => string
  selectionMode: () => boolean
  selectedNodeIds: () => number[]
}

const disconnectedToolbarStore: AppRouteToolbarStore = {
  layoutMode: () => 'desktop',
  selectionMode: () => false,
  selectedNodeIds: () => [],
}

type ResolveToolbarInput = {
  route: Routes
  store: AppRouteToolbarStore
}

type MarkdownToolbarDocument = Extract<ResolvedFilesDocumentState, {kind: 'markdown'}>

type OpenGalleryInput = {
  fileId: number
}

type ShellDetailsCatalog = {
  getChildren?: (path: string) => ClientCatalogNode[]
}

const logger = defaultLogger

function shouldBlockMarkdownNavigation(intent: NavigationBlockerIntent): boolean {
  const currentDocument = intent.current.files?.document
  if (intent.current.surface !== 'files' || currentDocument?.kind !== 'markdown') {
    return false
  }

  const resolvedDocument = navigationModel.resolvedDocument()
  if (
    resolvedDocument.kind !== 'markdown' ||
    resolvedDocument.fileId !== currentDocument.fileId
  ) {
    return false
  }

  const nextDocument = intent.next.files?.document
  const keepsCurrentMarkdownPreview =
    intent.next.surface === 'files' &&
    nextDocument?.kind === 'markdown' &&
    nextDocument.fileId === currentDocument.fileId

  if (keepsCurrentMarkdownPreview) {
    return false
  }

  return markdownPreviewModel.dirty() || markdownPreviewModel.saving() || markdownPreviewModel.formatting()
}

function getMarkdownMobileToolbarActions(): PasswordMobileToolbarAction[] {
  const markdownState = markdownPreviewModel.state()
  const actions: PasswordMobileToolbarAction[] = []

  if (markdownState.kind === 'ready') {
    const imageAttaching = markdownPreviewModel.imageAttaching()
    actions.push(
      {
        id: 'markdown-insert-image',
        icon: 'image-plus',
        label: i18n(imageAttaching ? 'markdown:attaching-image' : 'markdown:insert-image'),
        disabled: !markdownPreviewModel.canInsertImage(),
        active: imageAttaching,
      },
      {
        id: 'markdown-undo',
        icon: 'undo-2',
        label: i18n('markdown:undo'),
        disabled: !markdownPreviewModel.canUndo(),
      },
      {
        id: 'markdown-redo',
        icon: 'redo-2',
        label: i18n('markdown:redo'),
        disabled: !markdownPreviewModel.canRedo(),
      },
    )
  }

  actions.push({
    id: 'markdown-format',
    icon: 'arrow-repeat',
    label: i18n(markdownPreviewModel.formatting() ? 'markdown:formatting' : 'markdown:format'),
    disabled: !markdownPreviewModel.canFormat(),
    active: markdownPreviewModel.formatting(),
  })

  if (markdownState.kind === 'ready') {
    actions.push({
      id: 'markdown-rename',
      icon: 'pencil',
      label: i18n(markdownDocumentRenameModel.state.renaming() ? 'markdown:renaming' : 'button:rename'),
      disabled: !markdownDocumentRenameModel.state.canRename(),
      active: markdownDocumentRenameModel.state.renaming(),
    })
  }

  if (canShareFiles()) {
    actions.push({
      id: 'markdown-share',
      icon: 'share-2',
      label: i18n('button:share'),
    })
  }

  return actions
}

function getMarkdownMobileToolbarOverflowFromIndex(
  actions: PasswordMobileToolbarAction[],
  maxVisible: number,
): number | undefined {
  const insertImageIndex = actions.findIndex((action) => action.id === 'markdown-insert-image')
  if (insertImageIndex >= 0 && actions.length > maxVisible) {
    return Math.max(insertImageIndex + 1, Math.min(2, Math.max(0, maxVisible - 1)))
  }

  const formatIndex = actions.findIndex((action) => action.id === 'markdown-format')
  if (formatIndex >= 0) {
    return Math.min(formatIndex, Math.max(0, maxVisible - 1))
  }

  return actions.length > maxVisible ? maxVisible : undefined
}

function executeMarkdownMobileToolbarAction(
  actionId: string,
  document: MarkdownToolbarDocument,
  fileManagerModel: ReturnType<typeof getFileManagerModel>,
): boolean {
  switch (actionId) {
    case 'markdown-insert-image':
      return markdownPreviewModel.requestImagePicker()
    case 'markdown-undo':
      return markdownPreviewModel.undo()
    case 'markdown-redo':
      return markdownPreviewModel.redo()
    case 'markdown-format':
      void markdownPreviewModel.formatDocument()
      return true
    case 'markdown-rename':
      void markdownDocumentRenameModel.openRenameDialog(document)
      return true
    case 'markdown-share':
      if (!canShareFiles()) return false
      void fileManagerModel.shareFileById({
        fileId: document.fileId,
        fileName: document.fileName,
        mimeType: document.mimeType,
        lastModified: document.lastModified,
      })
      return true
    default:
      return false
  }
}

export function getDeepActiveElement(): HTMLElement | null {
  let active: Element | null = typeof document !== 'undefined' ? document.activeElement : null
  while (active instanceof HTMLElement && active.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement
  }
  return active instanceof HTMLElement ? active : null
}

function isEditableElement(element: HTMLElement | null): boolean {
  return (
    element?.matches?.('input, textarea, select, [contenteditable="true"], [contenteditable=""]') ??
    false
  )
}

export function getFilesToolbarTitle(path: string): string {
  const filesLabel = i18n('navigation:files')
  if (!path || path === '/') return filesLabel
  const parts = path.split('/').filter(Boolean)
  const name = parts.at(-1)
  return name ? `${filesLabel} • ${name}` : filesLabel
}

export function resolveMobileToolbarState(input: ResolveToolbarInput): MobileToolbarState {
  const {store, route} = input
  const snapshot = navigationModel.snapshot()
  const surface = snapshot.surface

  const noActions: MobileToolbarState = {
    show: false,
    title: '',
    leading: 'none',
    backDisabled: false,
    showCommand: false,
    commandActive: false,
    maxVisible: 3,
    actions: [],
  }

  if (store.layoutMode() !== 'mobile' || route !== 'dashboard') {
    return noActions
  }

  if (surface === 'remote-storage') {
    const ctx = remoteStorageModel.getMobileToolbarContext()
    return {
      show: true,
      title: ctx.title,
      leading: ctx.canGoBack ? 'back' : 'menu',
      backDisabled: ctx.backDisabled,
      showCommand: ctx.showCommand,
      commandActive: false,
      maxVisible: 3,
      actions: [],
    }
  }

  if (surface === 'remote') {
    return {
      show: true,
      title: i18n('navigation:remote'),
      leading: 'menu',
      backDisabled: false,
      showCommand: false,
      commandActive: false,
      maxVisible: 3,
      actions: [],
    }
  }
  if (surface === 'gateway') {
    return {
      show: true,
      title: i18n('gateway:page-title'),
      leading: 'menu',
      backDisabled: false,
      showCommand: false,
      commandActive: false,
      maxVisible: 3,
      actions: [],
    }
  }
  if (surface === 'settings') {
    return {
      show: true,
      title: i18n('navigation:settings'),
      leading: 'menu',
      backDisabled: false,
      showCommand: false,
      commandActive: false,
      maxVisible: 3,
      actions: [],
    }
  }
  if (surface === 'passkeys') {
    return {
      show: true,
      title: i18n('navigation:passkeys'),
      leading: 'menu',
      backDisabled: false,
      showCommand: false,
      commandActive: false,
      maxVisible: 3,
      actions: [],
    }
  }

  if (surface === 'passwords') {
    if (snapshot.passwords?.kind === 'create-entry' || snapshot.passwords?.kind === 'create-group') {
      return noActions
    }

    const passmanagerReady = pmModel.alive()
    if (!passmanagerReady) {
      return {
        show: true,
        title: i18n('navigation:passwords'),
        leading: 'menu',
        backDisabled: false,
        showCommand: false,
        commandActive: false,
        maxVisible: 3,
        actions: [],
      }
    }
    const ctx = pmMobileChromeModel.getToolbarContext()
    const commandContext = pmMobileChromeModel.getCommandContext()
    const actions = pmMobileChromeModel.getToolbarActions()
    return {
      show: true,
      title: ctx.title,
      leading: ctx.canGoBack ? 'back' : 'menu',
      backDisabled: ctx.backDisabled,
      showCommand: ctx.showCommand,
      commandActive: commandContext.query.trim().length > 0,
      maxVisible: ctx.maxVisible,
      overflowFromIndex: ctx.overflowFromIndex,
      actions,
      executeAction: (actionId: string) => pmMobileChromeModel.executeCommand(actionId),
    }
  }

  if (surface === 'notes') {
    const fileManagerModel = getFileManagerModel()
    return {
      show: true,
      title: i18n('navigation:notes' as never),
      subtitle: i18n('notes:quick_view:subtitle' as never),
      leading: 'menu',
      backDisabled: false,
      showCommand: true,
      commandActive: false,
      maxVisible: 3,
      actions: [{id: 'create-note', icon: 'book-plus', label: i18n('file-manager:create-note')}],
      executeAction: (actionId: string) => fileManagerModel.executeMobileCommand(actionId),
    }
  }

  const hasOverlay = navigationModel.resolvedOverlay().kind !== 'closed'
  const filesDocument = navigationModel.resolvedDocument()
  const hasFilesDocument = filesDocument.kind !== 'closed'
  const currentPath = navigationModel.filesPath()
  const fileManagerModel = getFileManagerModel()
  const selectedNodeIds = store.selectedNodeIds()
  const selectionActive = store.selectionMode() || selectedNodeIds.length > 0

  if (filesDocument.kind === 'markdown') {
    const chrome = buildMarkdownToolbarChrome()
    const actions = getMarkdownMobileToolbarActions()
    const maxVisible = 3
    return {
      show: true,
      title: filesDocument.fileName,
      subtitle: chrome.subtitle,
      status: chrome.status,
      leading: 'back',
      backDisabled: false,
      showCommand: false,
      commandActive: false,
      maxVisible,
      overflowFromIndex: getMarkdownMobileToolbarOverflowFromIndex(actions, maxVisible),
      actions,
      executeAction: (actionId: string) =>
        executeMarkdownMobileToolbarAction(actionId, filesDocument, fileManagerModel),
    }
  }

  const filesActions = fileManagerModel.getMobileToolbarActions()

  if (selectionActive) {
    return {
      show: true,
      title:
        selectedNodeIds.length > 0
          ? i18n('file-manager:selected-count', {count: String(selectedNodeIds.length)})
          : i18n('details:selected'),
      leading: 'back',
      backDisabled: false,
      showCommand: false,
      commandActive: false,
      maxVisible: 4,
      actions: filesActions,
      executeAction: (actionId: string) => fileManagerModel.executeMobileCommand(actionId),
    }
  }

  return {
    show: true,
    title: getFilesToolbarTitle(currentPath),
    leading: hasOverlay || hasFilesDocument || currentPath !== '/' ? 'back' : 'menu',
    backDisabled: false,
    showCommand: !hasOverlay && !hasFilesDocument,
    commandActive: false,
    maxVisible: 3,
    overflowFromIndex: filesActions.length > 0 ? 0 : undefined,
    actions: filesActions,
    executeAction: (actionId: string) => fileManagerModel.executeMobileCommand(actionId),
  }
}

export function handleMobileBack(): boolean {
  const snapshot = navigationModel.snapshot()

  logger.debug('[AppRoute][MobileBack] begin', {
    surface: snapshot.surface,
    overlay: snapshot.overlay?.kind ?? 'none',
    path: navigationModel.filesPath(),
  })

  if (transientBackModel.consumeBack()) {
    logger.debug('[AppRoute][MobileBack] transient')
    return true
  }

  const handled = navigationModel.goBackFromUi()
  logger.debug('[AppRoute][MobileBack] navigationModel', {handled})
  return handled
}

export class ChromVoidAppModel {
  readonly renderedRoute = atom<Routes>(tryGetAppContext()?.router?.route?.() ?? 'loading', 'app.route.renderedRoute')

  readonly mobileToolbarState = computed<MobileToolbarState>(() => {
    const route = tryGetAppContext()?.router?.route?.() ?? 'loading'
    return resolveMobileToolbarState({
      route,
      store: this.toolbarStore,
    })
  })

  readonly galleryOpen = computed(() => navigationModel.resolvedOverlay().kind === 'gallery')
  readonly galleryImages = computed<Array<AppGalleryImage>>(() => {
    const overlay = navigationModel.resolvedOverlay()
    return overlay.kind === 'gallery' ? overlay.images : []
  })
  readonly galleryIndex = computed(() => {
    const overlay = navigationModel.resolvedOverlay()
    return overlay.kind === 'gallery' ? overlay.index : 0
  })

  readonly videoPlayerOpen = computed(() => navigationModel.resolvedOverlay().kind === 'video')
  readonly videoPlayerFileId = computed(() => {
    const overlay = navigationModel.resolvedOverlay()
    return overlay.kind === 'video' ? overlay.fileId : 0
  })
  readonly videoPlayerFileName = computed(() => {
    const overlay = navigationModel.resolvedOverlay()
    return overlay.kind === 'video' ? overlay.fileName : ''
  })
  readonly videoPlayerFileSize = computed(() => {
    const overlay = navigationModel.resolvedOverlay()
    return overlay.kind === 'video' ? overlay.size : undefined
  })
  readonly videoPlayerMimeType = computed(() => {
    const overlay = navigationModel.resolvedOverlay()
    return overlay.kind === 'video' ? overlay.mimeType : undefined
  })
  readonly videoPlayerMediaInfo = computed(() => {
    const overlay = navigationModel.resolvedOverlay()
    return overlay.kind === 'video' ? overlay.mediaInfo : null
  })
  readonly videoPlayerLastModified = computed(() => {
    const overlay = navigationModel.resolvedOverlay()
    return overlay.kind === 'video' ? overlay.lastModified : undefined
  })
  readonly audioPlayerOpen = computed(() => navigationModel.resolvedOverlay().kind === 'audio')
  readonly audioPlayerFileId = computed(() => {
    const overlay = navigationModel.resolvedOverlay()
    return overlay.kind === 'audio' ? overlay.fileId : 0
  })
  readonly audioPlayerTracks = computed<Array<AppAudioTrack>>(() => {
    const overlay = navigationModel.resolvedOverlay()
    return overlay.kind === 'audio' ? overlay.tracks : []
  })
  readonly audioPlayerIndex = computed(() => {
    const overlay = navigationModel.resolvedOverlay()
    return overlay.kind === 'audio' ? overlay.index : 0
  })
  readonly previewOpen = computed(() => navigationModel.resolvedOverlay().kind === 'preview')
  readonly previewData = computed<AppPreviewData | null>(() => {
    const overlay = navigationModel.resolvedOverlay()
    if (overlay.kind !== 'preview') return null
    return {
      fileId: overlay.fileId,
      fileName: overlay.fileName,
      ...(overlay.size !== undefined ? {size: overlay.size} : {}),
      mimeType: overlay.mimeType,
      lastModified: overlay.lastModified,
      sourceRevision: overlay.sourceRevision,
      mode: overlay.mode,
    }
  })
  readonly filesDocument = computed<ResolvedFilesDocumentState>(() => navigationModel.resolvedDocument())
  readonly markdownDocumentData = computed(() => {
    const document = navigationModel.resolvedDocument()
    if (document.kind !== 'markdown') return null
    return {
      fileId: document.fileId,
      fileName: document.fileName,
      ...(document.size !== undefined ? {size: document.size} : {}),
      mimeType: document.mimeType,
      lastModified: document.lastModified,
      sourceRevision: document.sourceRevision,
      mode: 'markdown' as const,
    }
  })
  readonly markdownDocumentPending = computed(() => {
    const document = navigationModel.resolvedDocument()
    return document.kind === 'pending' && document.requestedKind === 'markdown'
  })
  readonly mediaOverlayPending = computed(() => navigationModel.resolvedOverlay().kind === 'pending')

  private unbindTheme?: () => void
  private readonly componentUnsubscribers: Array<() => void> = []
  private unregisterMarkdownNavigationGuard?: () => void
  private unregisterMobileSidebarBack?: () => void
  private didInitialTabRedirect = false
  private connected = false
  private routeTransitionId = 0
  private toolbarStore: AppRouteToolbarStore = disconnectedToolbarStore
  private readonly audioOverlaySessionSync = new AudioOverlaySessionSync()

  connect() {
    if (this.connected) return
    if (activeAppModel && activeAppModel !== this) return

    activeAppModel = this
    this.connected = true

    init()
    const {store} = getAppContext()
    this.initializeRenderedRoute(getRouter().route())
    this.toolbarStore = store
    this.applyLayoutParam(store)
    void moduleAccessModel.refresh()
    navigationModel.connect()
    this.unregisterMarkdownNavigationGuard = registerMarkdownNavigationGuard()
    this.unregisterMobileSidebarBack = transientBackModel.register(() => this.consumeMobileSidebarBack(), {
      priority: 50,
    })
    this.setupComponentPreload()
    this.unbindTheme = bindTheme(store.theme)
  }

  disconnect() {
    if (!this.connected) return

    if (activeAppModel === this) {
      activeAppModel = null
    }
    this.connected = false

    this.unbindTheme?.()
    this.unregisterMarkdownNavigationGuard?.()
    this.unregisterMobileSidebarBack?.()
    while (this.componentUnsubscribers.length > 0) {
      const unsubscribe = this.componentUnsubscribers.pop()
      try {
        unsubscribe?.()
      } catch {}
    }
    navigationModel.disconnect()
    this.unbindTheme = undefined
    this.unregisterMarkdownNavigationGuard = undefined
    this.unregisterMobileSidebarBack = undefined
    this.didInitialTabRedirect = false
    this.resetRenderedRouteTransition()
    this.toolbarStore = disconnectedToolbarStore
    this.audioOverlaySessionSync.reset()
  }

  initializeRenderedRoute(route: Routes): void {
    this.routeTransitionId += 1
    this.renderedRoute.set(route)
  }

  planRenderedRouteTransition(nextRoute: Routes, blockedByBiometricGate: boolean): AppRouteTransitionPlan {
    const intent = getAppRouteMotionIntent(this.renderedRoute(), nextRoute, blockedByBiometricGate)
    const plan: AppRouteTransitionPlan = {
      id: ++this.routeTransitionId,
      route: nextRoute,
      intent,
    }

    if (intent.kind === 'none') {
      this.renderedRoute.set(nextRoute)
    }

    return plan
  }

  commitRenderedRouteTransition(plan: AppRouteTransitionPlan): boolean {
    if (plan.id !== this.routeTransitionId) {
      return false
    }

    this.renderedRoute.set(plan.route)
    return true
  }

  resetRenderedRouteTransition(): void {
    this.routeTransitionId += 1
    this.renderedRoute.set('loading')
  }

  private consumeMobileSidebarBack(): boolean {
    const store = getAppContext().store
    if (store.layoutMode() !== 'mobile' || !store.sidebarOpen()) {
      return false
    }

    store.setSidebarOpen(false)
    return true
  }

  private applyLayoutParam(store: ReturnType<typeof getAppContext>['store']): void {
    try {
      const url = new URL(window.location.href)
      const param = url.searchParams.get('layout')
      if (param) {
        applyLayoutQueryParam(param)
        store.setLayoutQueryParam(param)
      }
    } catch {}
  }

  private setupComponentPreload(): void {
    const ensureVisibleRoute = () => {
      if (this.normalizeUnsupportedSurface()) {
        return
      }

      void ensureRouteComponents(
        getRouter().route(),
        navigationModel.currentSurface(),
        navigationModel.resolvedOverlay(),
        navigationModel.resolvedDocument(),
      ).catch((error) => {
        console.warn('[dashboard] failed to preload route components:', error)
      })
    }

    ensureVisibleRoute()
    const syncAudioOverlay = () => this.syncAudioOverlaySession()
    syncAudioOverlay()
    this.componentUnsubscribers.push(subscribeAfterInitial(getRouter().route, ensureVisibleRoute))
    this.componentUnsubscribers.push(subscribeAfterInitial(navigationModel.currentSurface, ensureVisibleRoute))
    this.componentUnsubscribers.push(subscribeAfterInitial(moduleAccessModel.states, ensureVisibleRoute))
    this.componentUnsubscribers.push(subscribeAfterInitial(navigationModel.resolvedOverlay, ensureVisibleRoute))
    this.componentUnsubscribers.push(subscribeAfterInitial(navigationModel.resolvedDocument, ensureVisibleRoute))
    this.componentUnsubscribers.push(subscribeAfterInitial(navigationModel.resolvedOverlay, syncAudioOverlay))
    this.componentUnsubscribers.push(
      subscribeAfterInitial(mediaPlaybackModel.currentIndex, () => this.syncAudioOverlayFromPlayback()),
    )
  }

  private normalizeUnsupportedSurface(): boolean {
    const surface = navigationModel.currentSurface()
    const access = moduleAccessModel.surfaceAccess(surface)
    if (!access || access.status !== 'unsupported') {
      return false
    }

    const fallback: SurfaceId = moduleAccessModel.preferredSurfaceFallback()
    if (fallback === surface) {
      return false
    }

    navigationModel.navigateToSurface(fallback, 'replace')
    return true
  }

  private syncAudioOverlayFromPlayback(): void {
    this.audioOverlaySessionSync.syncFromPlayback()
  }

  private syncAudioOverlaySession(): void {
    this.audioOverlaySessionSync.syncFromOverlay()
  }

  getMobileToolbarState(route: Routes): MobileToolbarState {
    if (route === getRouter().route() && this.connected) {
      return this.mobileToolbarState()
    }

    const store = this.connected ? this.toolbarStore : getAppContext().store
    return resolveMobileToolbarState({
      route,
      store,
    })
  }

  handleMobileBack(): boolean {
    return handleMobileBack()
  }

  getShellDetailsData(): ShellDetailsData | null {
    const {catalog} = getAppContext()
    if (navigationModel.currentSurface() !== 'files') {
      return null
    }

    const detailsFileId = navigationModel.detailsFileId()
    if (!detailsFileId) return null

    const path = navigationModel.filesPath()
    try {
      const catalogMirror = catalog?.catalog as ShellDetailsCatalog | undefined
      const children = catalogMirror?.getChildren?.(path) ?? []
      const node = children.find((child) => child.nodeId === detailsFileId)
      if (!node || node.isDir) {
        navigationModel.closeOverlay('replace')
        return null
      }

      return {
        id: detailsFileId,
        name: node.name,
        size: node.size,
        path: node.path,
        lastModified: node.modtime,
        sourceRevision: node.sourceRevision,
        mimeType: node.mimeType,
      }
    } catch {
      return null
    }
  }

  openGallery(input: OpenGalleryInput) {
    const {fileId} = input
    const overlay = navigationModel.snapshot().overlay
    if (overlay?.kind === 'gallery' && overlay.fileId === fileId) {
      return
    }

    navigationModel.openGallery(fileId, overlay?.kind && overlay.kind !== 'none' ? 'replace' : 'push')
  }

  closeGallery(options: {preserveHistoryEntry?: boolean} = {}) {
    if (navigationModel.snapshot().overlay?.kind === 'gallery') {
      if (options.preserveHistoryEntry) {
        navigationModel.closeOverlay('replace')
        return
      }

      navigationModel.closeOverlayFromUi()
    }
  }

  openVideoPlayer(fileId: number, _fileName: string) {
    if (mediaPlaybackModel.sessionKind() === 'audio') {
      mediaPlaybackModel.requestPause()
    }

    const overlay = navigationModel.snapshot().overlay
    if (overlay?.kind === 'video' && overlay.fileId === fileId) {
      return
    }

    navigationModel.openVideo(fileId)
  }

  private playAudioFromMinimizedSession(fileId: number): boolean {
    if (
      mediaPlaybackModel.sessionKind() !== 'audio' ||
      mediaPlaybackModel.fullPlayerOpen() ||
      !mediaPlaybackModel.isPlaying()
    ) {
      return false
    }

    const audio = navigationModel.resolveAudio(fileId)
    if (!audio) return false

    const track = audio.tracks[audio.index]
    if (!track) return false

    if (mediaPlaybackModel.currentTrackId() === track.id) {
      traceAudioOverlay('minimizedAudioSwitchSkipped', {
        reason: 'same_track',
        fileId,
      })
      return true
    }

    traceAudioOverlay('minimizedAudioSwitchStartsSession', {
      fileId,
      trackId: track.id,
      index: audio.index,
      trackCount: audio.tracks.length,
    })
    void mediaPlaybackModel.startAudioSession(audio.tracks, audio.index, {
      autoplay: true,
      showFullPlayer: false,
    })
    return true
  }

  openAudioPlayer(fileId: number, _fileName: string) {
    const overlay = navigationModel.snapshot().overlay
    traceAudioOverlay('openAudioPlayerRequested', {
      fileId,
      previousOverlayKind: overlay?.kind ?? 'none',
      previousOverlayFileId: overlay?.kind === 'audio' ? overlay.fileId : null,
    })
    if (overlay?.kind === 'audio' && overlay.fileId === fileId) {
      traceAudioOverlay('openAudioPlayerSkipped', {
        reason: 'same_overlay',
        fileId,
      })
      return
    }

    if (this.playAudioFromMinimizedSession(fileId)) {
      traceAudioOverlay('openAudioPlayerSkipped', {
        reason: 'minimized_session_switch',
        fileId,
      })
      return
    }

    traceAudioOverlay('openAudioPlayerNavigate', {fileId})
    navigationModel.openAudio(fileId)
  }

  openPreview(fileId: number) {
    const overlay = navigationModel.snapshot().overlay
    if (overlay?.kind === 'preview' && overlay.fileId === fileId) {
      return
    }

    navigationModel.openPreview(fileId)
  }

  openMarkdownDocument(fileId: number) {
    const document = navigationModel.snapshot().files?.document
    if (document?.kind === 'markdown' && document.fileId === fileId) {
      return
    }

    navigationModel.openMarkdownDocument(fileId)
  }

  closeVideoPlayer() {
    if (navigationModel.snapshot().overlay?.kind === 'video') {
      navigationModel.closeOverlay()
    }
  }

  closeAudioPlayer() {
    mediaPlaybackModel.minimizeFullPlayer()

    if (navigationModel.snapshot().overlay?.kind === 'audio') {
      navigationModel.closeOverlay()
    }
  }

  closePreview() {
    if (navigationModel.snapshot().overlay?.kind === 'preview') {
      navigationModel.closeOverlay()
    }
  }

  closeFilesDocument() {
    if (navigationModel.snapshot().files?.document) {
      navigationModel.goBack()
    }
  }

  setGalleryIndex(index: number) {
    const overlay = navigationModel.resolvedOverlay()
    if (overlay.kind !== 'gallery') {
      return
    }

    const currentImage = this.galleryImages()[index]
    if (currentImage) {
      navigationModel.openGallery(currentImage.id, 'replace')
    }
  }

  handleKeydown(e: KeyboardEvent, focusDashboardCreateDirActionTarget: () => boolean) {
    const {store} = getAppContext()

    if (
      !e.defaultPrevented &&
      keyboardShortcutsModel.matches('app.vault.lock', e) &&
      !isEditableElement(getDeepActiveElement())
    ) {
      e.preventDefault()
      void lockVaultFromUi()
      return
    }

    if (e.key === 'Tab' && !e.defaultPrevented && !e.altKey && !e.ctrlKey && !e.metaKey) {
      if (
        !this.didInitialTabRedirect &&
        getRouter().route() === 'dashboard' &&
        navigationModel.currentSurface() === 'files'
      ) {
        const active = getDeepActiveElement()
        if (!isEditableElement(active)) {
          const redirected = focusDashboardCreateDirActionTarget()
          if (redirected) {
            this.didInitialTabRedirect = true
            e.preventDefault()
            return
          }
        }
      }
    }

    if (e.key === 'Escape') {
      if (store.sidebarOpen()) {
        store.setSidebarOpen(false)
        e.stopPropagation()
        return
      }
      const selected = store.selectedNodeIds()
      if (selected && selected.length > 0) {
        store.setSelectedItems([])
        e.stopPropagation()
      }
    }
  }
}
