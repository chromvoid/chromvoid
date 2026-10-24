import {atom, computed} from '@reatom/core'
import type {Routes} from 'root/app/router/router'

import {ensureRouteComponents} from 'root/app/bootstrap/surface-component-loader'
import {init} from 'root/app/bootstrap/Initialize'
import {applyLayoutQueryParam} from 'root/app/layout/layout-mode'
import {navigationModel} from 'root/app/navigation/navigation.model'
import type {
  MarkdownDocumentRouteSource,
  MarkdownDocumentViewMode,
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
  type PMMobileToolbarMetaItem as PasswordMobileToolbarMetaItem,
} from 'root/features/passmanager/models/pm-mobile-chrome.model'
import {pmModel} from 'root/features/passmanager/password-manager.model'
import {getFileManagerModel} from 'root/features/file-manager/file-manager.model'
import {markdownDocumentRenameModel} from 'root/features/file-manager/models/markdown-document-rename.model'
import {markdownPreviewModel} from 'root/features/file-manager/models/markdown-preview.model'
import {mediaPlaybackModel} from 'root/features/media/models/media-playback.model'
import {defaultLogger} from 'root/core/logger'
import {moduleAccessModel} from 'root/core/modules/module-access.model'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {i18n} from 'root/i18n'
import {keyboardShortcutsModel} from 'root/shared/keyboard'
import {getAppContext, getRouter, tryGetAppContext} from 'root/shared/services/app-context'
import {subscribeAfterInitial} from 'root/shared/services/subscribed-signal'
import {transientBackModel} from 'root/shared/services/transient-back.model'
import {canShareFiles} from 'root/shared/services/share'
import {bindTheme} from 'root/shared/services/theme'
import {lockVaultFromUi} from 'root/shared/services/vault-lock'
import {remoteStorageModel} from './remote-storage/remote-storage.model'
import {vaultRekeyModel} from './settings/vault-rekey.model'
import {walletPageModel} from './wallet/wallet-page.model'
import type {WalletToolbarCommand} from './wallet/wallet-page.types'
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
  hideTabBar: boolean
  title: string
  titleAction?: {
    id: string
    label: string
    disabled?: boolean
    expanded?: boolean
    popup?: 'dialog' | 'menu'
  }
  subtitle?: string
  meta?: PasswordMobileToolbarMetaItem[]
  metaLabel?: string
  status?: MobileToolbarStatus | null
  leading: MobileToolbarLeadingMode
  backDisabled: boolean
  maxVisible: number
  overflowFromIndex?: number
  actions: PasswordMobileToolbarAction[]
  executeAction?: (actionId: string) => boolean
}

export type MobileShellContentScrollMode = 'shell' | 'surface'

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

const WALLET_TOOLBAR_COMMANDS = new Set<WalletToolbarCommand>(['switch-wallet', 'send', 'receive', 'refresh'])

function executeWalletToolbarAction(actionId: string, presentation?: 'mobile'): boolean {
  if (!WALLET_TOOLBAR_COMMANDS.has(actionId as WalletToolbarCommand)) return false
  return walletPageModel.executeToolbarCommand(actionId as WalletToolbarCommand, presentation)
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
  if (resolvedDocument.kind !== 'markdown' || resolvedDocument.fileId !== currentDocument.fileId) {
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
        id: 'markdown-undo',
        icon: 'undo-2',
        label: i18n('markdown:undo'),
        disabled: !markdownPreviewModel.canUndo(),
        preserveFocusOnPress: true,
      },
      {
        id: 'markdown-redo',
        icon: 'redo-2',
        label: i18n('markdown:redo'),
        disabled: !markdownPreviewModel.canRedo(),
        preserveFocusOnPress: true,
      },
      {
        id: 'markdown-insert-image',
        icon: 'image-plus',
        label: i18n(imageAttaching ? 'markdown:attaching-image' : 'markdown:insert-image'),
        disabled: !markdownPreviewModel.canInsertImage(),
        active: imageAttaching,
        overflowOnly: true,
        preserveFocusOnPress: true,
      },
      {
        id: 'markdown-paste',
        icon: 'clipboard',
        label: i18n('markdown:paste' as never),
        disabled: !markdownPreviewModel.canPasteText(),
        overflowOnly: true,
        preserveFocusOnPress: true,
      },
    )
  }

  actions.push({
    id: 'markdown-format',
    icon: 'arrow-repeat',
    label: i18n(markdownPreviewModel.formatting() ? 'markdown:formatting' : 'markdown:format'),
    disabled: !markdownPreviewModel.canFormat(),
    active: markdownPreviewModel.formatting(),
    preserveFocusOnPress: true,
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
  const maxVisibleBeforeOverflow = Math.max(0, maxVisible - 1)
  const visibleActions = actions.filter((action) => !action.overflowOnly)
  const formatIndex = visibleActions.findIndex((action) => action.id === 'markdown-format')
  if (formatIndex >= 0) {
    return Math.min(formatIndex, maxVisibleBeforeOverflow)
  }

  if (actions.some((action) => action.overflowOnly) || actions.length > maxVisible) {
    return Math.min(visibleActions.length, maxVisibleBeforeOverflow)
  }

  return undefined
}

function executeMarkdownMobileToolbarAction(
  actionId: string,
  document: MarkdownToolbarDocument,
  fileManagerModel: ReturnType<typeof getFileManagerModel>,
): boolean {
  switch (actionId) {
    case 'markdown-insert-image':
      return markdownPreviewModel.requestImagePicker()
    case 'markdown-paste':
      if (!markdownPreviewModel.canPasteText()) return false
      void markdownPreviewModel.pasteTextFromClipboard()
      return true
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
    element?.matches?.('input, textarea, select, [contenteditable="true"], [contenteditable=""]') ?? false
  )
}

export function getFilesToolbarTitle(path: string): string {
  const filesLabel = i18n('navigation:files')
  if (!path || path === '/') return filesLabel
  const parts = path.split('/').filter(Boolean)
  const name = parts.at(-1)
  return name ? `${filesLabel} • ${name}` : filesLabel
}

export function resolveMobileShellContentScrollMode(input: {
  layoutMode: string
  surface: SurfaceId
}): MobileShellContentScrollMode {
  if (input.layoutMode !== 'mobile') {
    return 'shell'
  }

  switch (input.surface) {
    case 'files':
    case 'notes':
    case 'passwords':
    case 'passkeys':
    case 'wallet':
    case 'settings':
      return 'surface'
    default:
      return 'shell'
  }
}

export function resolveMobileToolbarState(input: ResolveToolbarInput): MobileToolbarState {
  const {store, route} = input
  const snapshot = navigationModel.snapshot()
  const surface = snapshot.surface

  const noActions: MobileToolbarState = {
    show: false,
    hideTabBar: false,
    title: '',
    leading: 'none',
    backDisabled: false,
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
      hideTabBar: false,
      title: ctx.title,
      leading: ctx.canGoBack ? 'back' : 'menu',
      backDisabled: ctx.backDisabled,
      maxVisible: 3,
      actions: [],
    }
  }

  if (surface === 'remote') {
    const capabilities = getRuntimeCapabilities()
    const isMobileHost = capabilities.mobile && capabilities.supports_network_remote
    return {
      show: true,
      hideTabBar: false,
      title: i18n('navigation:remote'),
      subtitle: i18n(isMobileHost ? 'remote:mobile-host-subtitle' : 'remote:subtitle'),
      leading: 'menu',
      backDisabled: false,
      maxVisible: 3,
      actions: [],
    }
  }
  if (surface === 'gateway') {
    return {
      show: true,
      hideTabBar: false,
      title: i18n('gateway:page-title'),
      leading: 'menu',
      backDisabled: false,
      maxVisible: 3,
      actions: [],
    }
  }
  if (surface === 'settings') {
    const settingsRoute = snapshot.settings ?? {kind: 'overview'}
    if (settingsRoute.kind !== 'overview') {
      const titleKey =
        settingsRoute.kind === 'security'
          ? 'settings:security-title'
          : settingsRoute.kind === 'autofill'
            ? 'settings:provider-title'
            : settingsRoute.kind === 'files'
              ? 'settings:files-storage-title'
              : settingsRoute.kind === 'passwords'
                ? 'settings:password-vault-title'
                : settingsRoute.kind === 'vault-rekey'
                  ? 'settings:vault-password-title'
                  : 'settings:passwords-maintenance-import'

      return {
        show: true,
        hideTabBar: false,
        title: i18n(titleKey),
        leading: 'back',
        backDisabled: settingsRoute.kind === 'vault-rekey' && vaultRekeyModel.busy(),
        maxVisible: 3,
        actions: [],
      }
    }

    return {
      show: true,
      hideTabBar: false,
      title: i18n('navigation:settings'),
      subtitle: i18n('settings:subtitle'),
      leading: 'menu',
      backDisabled: false,
      maxVisible: 3,
      actions: [],
    }
  }
  if (surface === 'passkeys') {
    return {
      show: true,
      hideTabBar: false,
      title: i18n('navigation:passkeys'),
      subtitle: i18n('passkeys:mobile-description'),
      leading: 'menu',
      backDisabled: false,
      maxVisible: 3,
      actions: [],
    }
  }
  if (surface === 'wallet') {
    const context = walletPageModel.toolbarContext()
    if (!context.ready) {
      return {
        show: true,
        hideTabBar: false,
        title: i18n('navigation:wallet'),
        subtitle: i18n('wallet:subtitle'),
        leading: 'menu',
        backDisabled: false,
        maxVisible: 3,
        actions: [],
      }
    }

    const status: MobileToolbarStatus | null = context.refreshing
      ? {
          tone: 'saving',
          icon: 'refresh-cw',
          label: i18n('wallet:status:refreshing'),
          spinner: true,
        }
      : !walletPageModel.selectedNetworkReady()
        ? {
            tone: 'error',
            icon: 'triangle-alert',
            label: i18n('wallet:status:provider-unavailable:title'),
          }
        : null

    return {
      show: true,
      hideTabBar: false,
      title: context.walletLabel,
      titleAction: {
        id: 'switch-wallet',
        label: `${i18n('wallet:switcher:title')}: ${context.walletLabel}`,
        disabled: !context.canSwitchWallet,
        expanded: context.switcherOpen,
        popup: 'dialog',
      },
      subtitle: `${context.networkLabel} · ${context.accountLabel}`,
      status,
      leading: 'menu',
      backDisabled: false,
      maxVisible: 3,
      overflowFromIndex: 2,
      actions: [
        {
          id: 'send',
          icon: 'arrow-up-right',
          label: i18n('wallet:send:title'),
          disabled: !context.canSend,
          active: context.sendActive,
          tone: 'accent',
        },
        {
          id: 'receive',
          icon: 'arrow-down-left',
          label: i18n('wallet:receive:title'),
          disabled: !context.canReceive,
        },
        {
          id: 'refresh',
          icon: 'refresh-cw',
          label: i18n('wallet:action:refresh'),
          disabled: !context.canRefresh,
          overflowOnly: true,
        },
      ],
      executeAction: (actionId) => executeWalletToolbarAction(actionId, 'mobile'),
    }
  }

  if (surface === 'passwords') {
    const passmanagerReady = pmModel.alive()
    if (!passmanagerReady) {
      return {
        show: true,
        hideTabBar: false,
        title: i18n('navigation:passwords'),
        subtitle: pmMobileChromeModel.getRootSubtitle(),
        leading: 'menu',
        backDisabled: false,
        maxVisible: 3,
        actions: [],
      }
    }
    const ctx = pmMobileChromeModel.getToolbarContext()
    const actions = pmMobileChromeModel.getToolbarActions()
    return {
      show: true,
      hideTabBar: ctx.hideTabBar,
      title: ctx.title,
      subtitle: ctx.subtitle,
      meta: ctx.meta,
      metaLabel: ctx.metaLabel,
      leading: ctx.canGoBack ? 'back' : 'menu',
      backDisabled: ctx.backDisabled,
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
      hideTabBar: false,
      title: i18n('navigation:notes' as never),
      subtitle: i18n('notes:quick_view:subtitle' as never),
      leading: 'menu',
      backDisabled: false,
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
      hideTabBar: false,
      title: filesDocument.fileName,
      subtitle: chrome.subtitle,
      status: chrome.status,
      leading: 'back',
      backDisabled: false,
      maxVisible,
      overflowFromIndex: getMarkdownMobileToolbarOverflowFromIndex(actions, maxVisible),
      actions,
      executeAction: (actionId: string) =>
        executeMarkdownMobileToolbarAction(actionId, filesDocument, fileManagerModel),
    }
  }

  if (selectionActive) {
    return {
      show: true,
      hideTabBar: false,
      title: getFilesToolbarTitle(currentPath),
      leading: 'back',
      backDisabled: false,
      maxVisible: 4,
      actions: [],
    }
  }

  return {
    show: true,
    hideTabBar: false,
    title: getFilesToolbarTitle(currentPath),
    subtitle:
      currentPath === '/' && !hasOverlay && !hasFilesDocument
        ? i18n('navigation:files-description')
        : undefined,
    leading: hasOverlay || hasFilesDocument || currentPath !== '/' ? 'back' : 'menu',
    backDisabled: false,
    maxVisible: 3,
    actions: [],
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
  readonly startupReadinessRoute = computed<Routes | null>(() => {
    const route = getRouter().route()
    const {ws} = getAppContext()
    if (route === 'no-connection' && !ws.connected() && (ws.kind === 'tauri' || ws.connecting())) {
      return null
    }
    return route
  }, 'app.route.startupReadinessRoute')

  readonly renderedRoute = atom<Routes>(
    tryGetAppContext()?.router?.route?.() ?? 'loading',
    'app.route.renderedRoute',
  )

  readonly mobileToolbarState = computed<MobileToolbarState>(() => {
    const route = tryGetAppContext()?.router?.route?.() ?? 'loading'
    return resolveMobileToolbarState({
      route,
      store: this.toolbarStore,
    })
  })
  readonly walletToolbarContext = computed(() => walletPageModel.toolbarContext())
  readonly mobileShellContentScrollMode = computed<MobileShellContentScrollMode>(() =>
    resolveMobileShellContentScrollMode({
      layoutMode: this.toolbarStore.layoutMode(),
      surface: navigationModel.currentSurface(),
    }),
  )

  executeWalletToolbarAction(actionId: string): boolean {
    return executeWalletToolbarAction(
      actionId,
      this.toolbarStore.layoutMode() === 'mobile' ? 'mobile' : undefined,
    )
  }

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
      ...(document.path ? {path: document.path} : {}),
      ...(document.parentPath ? {parentPath: document.parentPath} : {}),
      ...(document.size !== undefined ? {size: document.size} : {}),
      mimeType: document.mimeType,
      lastModified: document.lastModified,
      sourceRevision: document.sourceRevision,
      ...(document.anchor ? {anchor: document.anchor} : {}),
      ...(document.viewMode ? {viewMode: document.viewMode} : {}),
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
      if (this.normalizeUnavailableSurface()) {
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
    this.componentUnsubscribers.push(
      subscribeAfterInitial(navigationModel.currentSurface, ensureVisibleRoute),
    )
    this.componentUnsubscribers.push(subscribeAfterInitial(moduleAccessModel.states, ensureVisibleRoute))
    this.componentUnsubscribers.push(
      subscribeAfterInitial(navigationModel.resolvedOverlay, ensureVisibleRoute),
    )
    this.componentUnsubscribers.push(
      subscribeAfterInitial(navigationModel.resolvedDocument, ensureVisibleRoute),
    )
    this.componentUnsubscribers.push(subscribeAfterInitial(navigationModel.resolvedOverlay, syncAudioOverlay))
    this.componentUnsubscribers.push(
      subscribeAfterInitial(mediaPlaybackModel.currentIndex, () => this.syncAudioOverlayFromPlayback()),
    )
  }

  private normalizeUnavailableSurface(): boolean {
    const surface = navigationModel.currentSurface()
    if (moduleAccessModel.isSurfaceOffered(surface)) {
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

  getMobileShellContentScrollMode(): MobileShellContentScrollMode {
    if (this.connected) {
      return this.mobileShellContentScrollMode()
    }

    const store = this.connected ? this.toolbarStore : getAppContext().store
    return resolveMobileShellContentScrollMode({
      layoutMode: store.layoutMode(),
      surface: navigationModel.currentSurface(),
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

  openMarkdownDocument(
    fileId: number,
    options?: {
      parentPath?: string
      source?: MarkdownDocumentRouteSource
      viewMode?: MarkdownDocumentViewMode
    },
  ) {
    const document = navigationModel.snapshot().files?.document
    if (document?.kind === 'markdown' && document.fileId === fileId) {
      return
    }

    navigationModel.openMarkdownDocument(fileId, 'push', options)
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
