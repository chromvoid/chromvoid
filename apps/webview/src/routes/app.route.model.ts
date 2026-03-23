import {computed} from '@statx/core'
import type {Routes} from 'root/app/router/router'

import {init} from 'root/app/bootstrap/Initialize'
import {applyLayoutQueryParam} from 'root/app/layout/layout-mode'
import {navigationModel} from 'root/app/navigation/navigation.model'
import type {ResolvedGalleryImage} from 'root/app/navigation/navigation.types'
import {defaultLogger} from 'root/core/logger'
import {getAppContext} from 'root/shared/services/app-context'
import {bindTheme} from 'root/shared/services/theme'
import {viewTransition, supportsViewTransitions} from 'root/utils/view-transitions'

type RenderRoot = Element | ShadowRoot | DocumentFragment | null

export type MobileToolbarLeadingMode = 'menu' | 'back' | 'none'

export type MobileToolbarState = {
  show: boolean
  title: string
  leading: MobileToolbarLeadingMode
  backDisabled: boolean
  showCommand: boolean
  actions: PasswordMobileToolbarAction[]
  actionProvider: PasswordMobileToolbarProvider | null
}

export type PasswordMobileToolbarContext = {
  title: string
  canGoBack: boolean
  backDisabled: boolean
  showCommand: boolean
}

export type PasswordMobileToolbarAction = {
  id: string
  icon: string
  label: string
  disabled?: boolean
}

export type PasswordMobileToolbarProvider = HTMLElement & {
  getMobileToolbarContext?: () => PasswordMobileToolbarContext
  handleMobileToolbarBack?: () => boolean
  getMobileToolbarActions?: () => PasswordMobileToolbarAction[]
  executeMobileCommand?: (actionId: string) => boolean
}

export type StorageMobileToolbarContext = {
  title: string
  canGoBack: boolean
  backDisabled: boolean
  showCommand: boolean
}

export type StorageMobileToolbarProvider = HTMLElement & {
  getMobileToolbarContext?: () => StorageMobileToolbarContext
  handleMobileToolbarBack?: () => boolean
}

export type AppGalleryImage = ResolvedGalleryImage

export type ShellDetailsData = {
  id: number
  name: string
  size: number
  path: string
  lastModified: number | string
}

type AppRouteToolbarStore = {
  layoutMode: () => string
}

export type FilesMobileToolbarProvider = HTMLElement & {
  getMobileToolbarActions?: () => PasswordMobileToolbarAction[]
  executeMobileCommand?: (actionId: string) => boolean
}

type ResolveToolbarInput = {
  route: Routes
  store: AppRouteToolbarStore
  getPasswordMobileToolbarProvider: () => PasswordMobileToolbarProvider | null
  getStorageMobileToolbarProvider: () => StorageMobileToolbarProvider | null
  getFilesMobileToolbarProvider: () => FilesMobileToolbarProvider | null
}

type OpenGalleryInput = {
  fileId: number
}

const logger = defaultLogger

export function getDeepActiveElement(): HTMLElement | null {
  let active: Element | null = typeof document !== 'undefined' ? document.activeElement : null
  while (active instanceof HTMLElement && active.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement
  }
  return active instanceof HTMLElement ? active : null
}

export function getFilesToolbarTitle(path: string): string {
  if (!path || path === '/') return 'Files'
  const parts = path.split('/').filter(Boolean)
  const name = parts.at(-1)
  return name ? `Files • ${name}` : 'Files'
}

export function resolveMobileToolbarState(input: ResolveToolbarInput): MobileToolbarState {
  const {store, route, getPasswordMobileToolbarProvider, getStorageMobileToolbarProvider} = input
  const snapshot = navigationModel.snapshot()
  const surface = snapshot.surface

  const noActions: MobileToolbarState = {show: false, title: '', leading: 'none', backDisabled: false, showCommand: false, actions: [], actionProvider: null}

  if (store.layoutMode() !== 'mobile' || route !== 'dashboard') {
    return noActions
  }

  if (surface === 'remote-storage') {
    const provider = getStorageMobileToolbarProvider()
    const ctx = provider?.getMobileToolbarContext?.()
    if (ctx) {
      return {
        show: true,
        title: ctx.title,
        leading: ctx.canGoBack ? 'back' : 'menu',
        backDisabled: ctx.backDisabled,
        showCommand: false,
        actions: [],
        actionProvider: null,
      }
    }
    return {
      show: true,
      title: 'Storage',
      leading: 'menu',
      backDisabled: false,
      showCommand: false,
      actions: [],
      actionProvider: null,
    }
  }

  if (surface === 'remote') {
    return {show: true, title: 'Remote', leading: 'menu', backDisabled: false, showCommand: false, actions: [], actionProvider: null}
  }
  if (surface === 'gateway') {
    return {show: true, title: 'Gateway', leading: 'menu', backDisabled: false, showCommand: false, actions: [], actionProvider: null}
  }
  if (surface === 'network-pair') {
    return {show: true, title: 'Network Pair', leading: 'menu', backDisabled: false, showCommand: false, actions: [], actionProvider: null}
  }
  if (surface === 'settings') {
    return {show: true, title: 'Settings', leading: 'menu', backDisabled: false, showCommand: false, actions: [], actionProvider: null}
  }

  if (surface === 'passwords') {
    const passmanager = (window as any).passmanager
    passmanager?.showElement?.()
    passmanager?.isEditMode?.()

    const provider = getPasswordMobileToolbarProvider()
    const ctx = provider?.getMobileToolbarContext?.()
    const actions = provider?.getMobileToolbarActions?.() ?? []
    if (!ctx) {
      return {
        show: true,
        title: 'Passwords',
        leading: 'menu',
        backDisabled: false,
        showCommand: false,
        actions,
        actionProvider: provider,
      }
    }
    return {
      show: true,
      title: ctx.title,
      leading: ctx.canGoBack ? 'back' : 'menu',
      backDisabled: ctx.backDisabled,
      showCommand: ctx.showCommand,
      actions,
      actionProvider: provider,
    }
  }

  const hasOverlay = navigationModel.resolvedOverlay().kind !== 'closed'
  const currentPath = navigationModel.filesPath()
  const filesProvider = input.getFilesMobileToolbarProvider()
  const filesActions = filesProvider?.getMobileToolbarActions?.() ?? []

  return {
    show: true,
    title: getFilesToolbarTitle(currentPath),
    leading: hasOverlay || currentPath !== '/' ? 'back' : 'menu',
    backDisabled: false,
    showCommand: !hasOverlay,
    actions: filesActions,
    actionProvider: filesProvider as PasswordMobileToolbarProvider | null,
  }
}

export function handleMobileBack(): boolean {
  const snapshot = navigationModel.snapshot()

  logger.debug('[AppRoute][MobileBack] begin', {
    surface: snapshot.surface,
    overlay: snapshot.overlay?.kind ?? 'none',
    path: navigationModel.filesPath(),
  })

  const handled = navigationModel.goBack()
  logger.debug('[AppRoute][MobileBack] navigationModel', {handled})
  return handled
}

export class ChromVoidAppModel {
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
  readonly mediaOverlayPending = computed(() => navigationModel.resolvedOverlay().kind === 'pending')

  private unbindTheme?: () => void
  private unbindRouteTransition?: () => void
  private didInitialTabRedirect = false
  private previousRoute: Routes | null = null

  constructor(
    private readonly requestUpdate: () => void,
    private readonly updateComplete: () => Promise<unknown>,
  ) {}

  connect() {
    init()
    const {store} = getAppContext()
    this.applyLayoutParam(store)
    navigationModel.connect()
    this.unbindTheme = bindTheme(store.theme)
    this.setupRouteTransitions()
  }

  disconnect() {
    this.unbindTheme?.()
    this.unbindRouteTransition?.()
    navigationModel.disconnect()
    this.unbindTheme = undefined
    this.unbindRouteTransition = undefined
    this.didInitialTabRedirect = false
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

  private setupRouteTransitions() {
    if (!supportsViewTransitions()) return

    this.unbindRouteTransition = window.router.route.subscribe((newRoute: Routes) => {
      const prev = this.previousRoute
      this.previousRoute = newRoute

      if (prev === null) return

      const isSignificantChange =
        (prev === 'welcome' && newRoute === 'dashboard') ||
        (prev === 'dashboard' && newRoute === 'welcome') ||
        (prev === 'no-connection' && newRoute !== 'no-connection')

      if (isSignificantChange) {
        viewTransition(async () => {
          this.requestUpdate()
          await this.updateComplete()
        })
      }
    })
  }

  getMobileToolbarState(route: Routes, renderRoot: RenderRoot): MobileToolbarState {
    const {store} = getAppContext()
    return resolveMobileToolbarState({
      route,
      store,
      getPasswordMobileToolbarProvider: () => this.getPasswordMobileToolbarProvider(renderRoot),
      getStorageMobileToolbarProvider: () => this.getStorageMobileToolbarProvider(renderRoot),
      getFilesMobileToolbarProvider: () => this.getFilesMobileToolbarProvider(renderRoot),
    })
  }

  handleMobileBack(_renderRoot: RenderRoot): boolean {
    return handleMobileBack()
  }

  private getPasswordMobileToolbarProvider(renderRoot: RenderRoot): PasswordMobileToolbarProvider | null {
    const passwordManager = renderRoot?.querySelector('password-manager') as HTMLElement | null
    if (!passwordManager) return null
    return passwordManager?.shadowRoot?.querySelector(
      'password-manager-mobile-layout',
    ) as PasswordMobileToolbarProvider | null
  }

  private getStorageMobileToolbarProvider(renderRoot: RenderRoot): StorageMobileToolbarProvider | null {
    return renderRoot?.querySelector('remote-storage-page') as StorageMobileToolbarProvider | null
  }

  private getFilesMobileToolbarProvider(renderRoot: RenderRoot): FilesMobileToolbarProvider | null {
    return renderRoot?.querySelector('chromvoid-file-manager') as FilesMobileToolbarProvider | null
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
      const children = catalog?.catalog?.getChildren ? catalog.catalog.getChildren(path) : []
      const node = Array.isArray(children)
        ? (children as any[]).find((n) => (n as any).nodeId === detailsFileId)
        : undefined
      if (!node || (node as any).isDir) {
        navigationModel.closeOverlay('replace')
        return null
      }

      return {
        id: detailsFileId as number,
        name: (node as any).name,
        size: (node as any).size,
        path: (node as any).path,
        lastModified: (node as any).lastModified,
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

    navigationModel.openGallery(fileId)
  }

  closeGallery() {
    if (navigationModel.snapshot().overlay?.kind === 'gallery') {
      navigationModel.goBack()
    }
  }

  openVideoPlayer(fileId: number, _fileName: string) {
    const overlay = navigationModel.snapshot().overlay
    if (overlay?.kind === 'video' && overlay.fileId === fileId) {
      return
    }

    navigationModel.openVideo(fileId)
  }

  closeVideoPlayer() {
    if (navigationModel.snapshot().overlay?.kind === 'video') {
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

  handleKeydown(e: KeyboardEvent, renderRoot: RenderRoot) {
    const {store} = getAppContext()

    if (e.key === 'Tab' && !e.defaultPrevented && !e.altKey && !e.ctrlKey && !e.metaKey) {
      if (
        !this.didInitialTabRedirect &&
        window.router.route() === 'dashboard' &&
        navigationModel.currentSurface() === 'files'
      ) {
        const active = getDeepActiveElement()
        const isEditable =
          active?.matches?.('input, textarea, select, [contenteditable="true"], [contenteditable=""]') ??
          false

        if (!isEditable) {
          const redirected = this.focusDashboardNewFolderButton(renderRoot)
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

  private focusDashboardNewFolderButton(renderRoot: RenderRoot): boolean {
    const fileManager = renderRoot?.querySelector('chromvoid-file-manager') as HTMLElement | null
    const header = (fileManager as any)?.shadowRoot?.querySelector('dashboard-header') as HTMLElement | null
    const button = header?.shadowRoot?.querySelector('[data-action="create-dir"]') as HTMLElement | null
    if (!button) return false

    button.focus({preventScroll: true})
    return true
  }
}
