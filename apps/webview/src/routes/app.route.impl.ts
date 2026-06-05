import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {nothing, type PropertyValues, type TemplateResult} from 'lit'

import {navigationModel} from 'root/app/navigation/navigation.model'
import type {SurfaceId} from 'root/app/navigation/navigation.types'
import {markStartupContentReadyWhenStable} from 'root/app/bootstrap/startup-readiness'
import {markStartupTimeline} from 'root/app/bootstrap/startup-timeline'
import {
  moduleAccessModel,
  type ModuleAccessState,
  type ModuleAccessStatus,
  type ProFeatureKey,
} from 'root/core/pro/module-access.model'
import {guidanceCompletionBridge, guidanceModel} from 'root/core/guidance'
import {i18n} from 'root/i18n'
import {getAppContext, getRouter} from 'root/shared/services/app-context'
import {openCommandPalette} from 'root/shared/services/command-palette'
import {subscribeAfterInitial} from 'root/shared/services/subscribed-signal'
import {
  emitFileActionCommand,
  subscribeFileCommand,
  type FileCommand,
  type FileOpenCommand,
} from 'root/shared/services/file-command-service'
import type {Routes} from 'root/app/router/router'
import {getFileManagerModel} from 'root/features/file-manager/file-manager.model'
import {viewTransition} from 'root/utils/view-transitions'

import {FileAppShell} from 'root/features/shell/components/file-app-shell'
import {StatusBar} from 'root/features/shell/components/status-bar'
import {AudioPlayer} from 'root/features/media/components/audio-player'
import type {GalleryCloseDetail} from 'root/features/media/components/image-gallery-v2/gallery.types'
import {MediaPlaybackHost} from 'root/features/media/components/media-playback-host'
import {mediaPlaybackModel} from 'root/features/media/models/media-playback.model'
import {AppGuidanceHost} from 'root/features/guidance'
import {BiometricAppGate} from './biometric-app-gate/biometric-app-gate'
import {biometricAppGateModel} from './biometric-app-gate/biometric-app-gate.model'
import {appRouteStyles} from './app.route.styles'
import {ChromVoidAppModel, type MobileToolbarState} from './app.route.model'

const STARTUP_ROUTE_READINESS_SETTLE_MS = 360

declare global {
  interface Window {
    __chromvoidGuidanceE2E?: {
      guidanceModel: typeof guidanceModel
      moduleAccessModel: typeof moduleAccessModel
    }
  }
}

export class ChromVoidApp extends ReatomLitElement {
  static elementName = 'chromvoid-app'
  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
    FileAppShell.define()
    StatusBar.define()
    AudioPlayer.define()
    MediaPlaybackHost.define()
    AppGuidanceHost.define()
    BiometricAppGate.define()
  }
  static styles = appRouteStyles

  private readonly model = new ChromVoidAppModel()
  private unsubscribeFileCommand?: () => void
  private unbindRouteTransition?: () => void
  private startupRouteReadinessTimerId = 0

  connectedCallback(): void {
    super.connectedCallback()
    this.model.connect()
    guidanceCompletionBridge.connect()
    this.installGuidanceE2EBridge()
    window.addEventListener('keydown', this.onKeydown)
    this.unsubscribeFileCommand = subscribeFileCommand(this.handleFileCommand)
    this.setupRouteTransitions()
  }

  disconnectedCallback(): void {
    this.uninstallGuidanceE2EBridge()
    this.unbindRouteTransition?.()
    this.unbindRouteTransition = undefined
    window.clearTimeout(this.startupRouteReadinessTimerId)
    this.unsubscribeFileCommand?.()
    this.unsubscribeFileCommand = undefined
    window.removeEventListener('keydown', this.onKeydown)
    guidanceCompletionBridge.disconnect()
    this.model.disconnect()
    super.disconnectedCallback()
  }

  protected override firstUpdated(changedProperties: PropertyValues): void {
    super.firstUpdated(changedProperties)
    this.scheduleStartupReadinessForRoute(getRouter().route())
  }

  private installGuidanceE2EBridge(): void {
    if (window.env !== 'dev') return
    try {
      if (new URL(window.location.href).searchParams.get('e2eGuidance') !== '1') return
      window.__chromvoidGuidanceE2E = {guidanceModel, moduleAccessModel}
    } catch {}
  }

  private uninstallGuidanceE2EBridge(): void {
    if (window.__chromvoidGuidanceE2E?.guidanceModel === guidanceModel) {
      delete window.__chromvoidGuidanceE2E
    }
  }

  private renderShellDetails() {
    const data = this.model.getShellDetailsData()
    if (!data) return nothing
    const externalOpenPending = getFileManagerModel(getAppContext()).isExternalOpenPending(data.id)

    return html`<file-details-panel
      slot="details"
      open
      .externalOpenPending=${externalOpenPending}
      .data=${{
        mode: 'single' as const,
        id: data.id,
        name: data.name,
        isDir: false,
        size: data.size,
        path: data.path,
        lastModified: data.lastModified,
        sourceRevision: data.sourceRevision,
        mimeType: data.mimeType,
      }}
      @close=${this.onShellCloseDetails}
      @action=${this.onDetailsPanelAction}
      @open-gallery=${this.handleOpenGallery}
      @open-video=${this.handleOpenVideo}
    ></file-details-panel>`
  }

  private renderRoute(route: Routes): TemplateResult | '' {
    const {store} = getAppContext()
    const hideMobileBackLinks = store.layoutMode() === 'mobile'
    const surface = navigationModel.currentSurface()

    if (route === 'no-license') {
      return html`<no-license></no-license>`
    }
    if (route === 'welcome') {
      return html`<welcome-page></welcome-page>`
    }

    if (route === 'dashboard') {
      const moduleAccess = moduleAccessModel.surfaceAccess(surface)
      if (moduleAccess && moduleAccess.status !== 'enabled') {
        return this.renderModuleAccessState(surface, moduleAccess)
      }

      if (surface === 'remote') {
        return html`<remote-page .hideBackLink=${hideMobileBackLinks}></remote-page>`
      }
      if (surface === 'gateway') {
        return html`<gateway-page .hideBackLink=${hideMobileBackLinks}></gateway-page>`
      }
      if (surface === 'remote-storage') {
        return html`<remote-storage-page .hideBackLink=${hideMobileBackLinks}></remote-storage-page>`
      }
      if (surface === 'settings') {
        return html`<settings-page .hideBackLink=${hideMobileBackLinks}></settings-page>`
      }
      if (surface === 'passkeys') {
        return html`<passkeys-page .hideBackLink=${hideMobileBackLinks}></passkeys-page>`
      }
      if (surface === 'passwords') {
        return html`<password-manager></password-manager>`
      }
      if (surface === 'notes') {
        return store.layoutMode() === 'mobile'
          ? html`<notes-quick-view-mobile></notes-quick-view-mobile>`
          : html`<notes-quick-view></notes-quick-view>`
      }

      if (this.model.markdownDocumentPending() || this.model.markdownDocumentData()) {
        return html`<markdown-document-page
          .data=${this.model.markdownDocumentData()}
          ?pending=${this.model.markdownDocumentPending()}
          @close=${this.onMarkdownDocumentClose}
        ></markdown-document-page>`
      }

      return html`<chromvoid-file-manager></chromvoid-file-manager>`
    }

    return ''
  }

  private getProAccessGuidanceSurface(surface: SurfaceId): 'remote' | 'gateway' | 'remote-storage' | null {
    if (surface === 'remote' || surface === 'gateway' || surface === 'remote-storage') return surface
    return null
  }

  private renderModuleAccessState(surface: SurfaceId, access: ModuleAccessState): TemplateResult {
    const title =
      access.status === 'unsupported'
        ? i18n('pro-access:unsupported-title')
        : access.status === 'disabled_by_rollout'
          ? i18n('pro-access:disabled-title')
          : i18n('pro-access:required-title')
    const detail =
      access.status === 'entitlement_unavailable'
        ? i18n('pro-access:entitlement-unavailable')
        : access.status === 'locked_pro'
          ? i18n('pro-access:locked-pro')
          : access.denial_code || access.feature_key

    const content = html`
      <section class="pro-access-state" aria-live="polite">
        <cv-icon name=${access.status === 'unsupported' ? 'circle-slash' : 'lock'}></cv-icon>
        <h1>${title}</h1>
        <p>${detail}</p>
        <div class="pro-access-state__actions">
          <button class="pro-access-state__button" @click=${this.handleOpenSettings}>
            ${i18n('navigation:settings')}
          </button>
          <button
            class="pro-access-state__button pro-access-state__button--secondary"
            data-surface=${surface}
            data-feature=${access.feature_key}
            data-status=${access.status}
            @click=${this.handleBlockedAccessHelp}
          >
            ${i18n('guidance:actions:open-help')}
          </button>
        </div>
      </section>
    `
    const guidanceSurface = this.getProAccessGuidanceSurface(surface)
    if (!guidanceSurface) return content

    return html`
      <cv-guidance-anchor anchor-id="pro.access-state" surface=${guidanceSurface} owner="module-access">
        ${content}
      </cv-guidance-anchor>
    `
  }

  private handleOpenSettings() {
    navigationModel.navigateToSurface('settings')
  }

  private handleBlockedAccessHelp(event: Event): void {
    const button = event.currentTarget as HTMLElement | null
    const surface = button?.dataset['surface'] as SurfaceId | undefined
    const feature = button?.dataset['feature'] as ProFeatureKey | undefined
    const reason = button?.dataset['status'] as ModuleAccessStatus | undefined
    if (!surface || !feature || !reason) return

    const guidanceSurface = this.getProAccessGuidanceSurface(surface)
    if (!guidanceSurface) return

    guidanceModel.openBlockedAction({
      surface: guidanceSurface,
      anchorId: 'pro.access-state',
      feature,
      reason,
    })
  }

  private renderMobileTopToolbar(state: MobileToolbarState): TemplateResult | typeof nothing {
    if (!state.show) return nothing

    return html`
      <mobile-top-toolbar
        slot="mobile-topbar"
        .title=${state.title}
        .subtitle=${state.subtitle ?? ''}
        .status=${state.status ?? null}
        .leading=${state.leading}
        .menuOpen=${getAppContext().store.sidebarOpen()}
        .actions=${state.actions}
        .maxVisible=${state.maxVisible}
        .overflowFromIndex=${state.overflowFromIndex}
        ?back-disabled=${state.backDisabled}
        ?show-command=${state.showCommand}
        ?command-active=${Boolean(state.commandActive)}
        @mobile-toolbar-leading=${this.onMobileToolbarLeading}
        @mobile-toolbar-command=${this.onMobileToolbarCommand}
        @mobile-toolbar-action=${this.onMobileToolbarAction}
      >
      </mobile-top-toolbar>
    `
  }

  private renderShell(
    routeContent: TemplateResult | '',
    isDetailsOpen: boolean,
    mobileToolbar: MobileToolbarState,
  ): TemplateResult {
    const {store} = getAppContext()
    const surface = navigationModel.currentSurface()
    const contentScrollMode =
      store.layoutMode() === 'mobile' &&
      (surface === 'files' || surface === 'notes' || surface === 'passkeys')
        ? 'surface'
        : 'shell'

    return html`
      <file-app-shell
        ?data-details-hidden=${navigationModel.isDetailsHidden()}
        ?data-details-open=${isDetailsOpen}
        ?data-sidebar-open=${store.sidebarOpen()}
        ?data-dual-pane=${store.dualPaneMode()}
        .edgeBackDisabled=${this.model.galleryOpen()}
        .contentScrollMode=${contentScrollMode}
        @close-sidebar=${this.onShellCloseSidebar}
        @close-details=${this.onShellCloseDetails}
        @open-sidebar=${this.onShellOpenSidebar}
        @open-details=${this.onShellOpenDetails}
        @keydown=${this.onKeydown}
        @navigate-back=${this.onNavigateBack}
      >
        ${this.renderMobileTopToolbar(mobileToolbar)}
        <status-bar slot="statusbar"></status-bar>
        ${routeContent} ${this.renderShellDetails()}
      </file-app-shell>
    `
  }

  private renderRouteContentFrame(
    route: Routes | 'biometric-gate',
    content: TemplateResult | typeof nothing | '',
  ): TemplateResult {
    return html`<div class="route-content" data-route=${route}>${content}</div>`
  }

  private onDetailsPanelAction = (e: CustomEvent) => {
    const {action, fileId} = e.detail
    emitFileActionCommand({kind: 'action', action: String(action), fileId: Number(fileId)})
  }

  private handleOpenGallery = (e: CustomEvent) => {
    const {fileId} = e.detail
    this.handleFileOpenCommand({kind: 'gallery', fileId: Number(fileId)})
  }

  private onGalleryClose = (event: CustomEvent<GalleryCloseDetail>) => {
    this.model.closeGallery({preserveHistoryEntry: event.detail?.reason === 'swipe-dismiss'})
  }

  private handleOpenVideo = (e: CustomEvent) => {
    const {fileId, fileName} = e.detail
    this.handleFileOpenCommand({kind: 'video', fileId: Number(fileId), fileName: String(fileName)})
  }

  private handleFileCommand = (command: FileCommand) => {
    switch (command.kind) {
      case 'action':
        return
      case 'document':
      case 'gallery':
      case 'preview':
      case 'video':
      case 'audio':
        this.handleFileOpenCommand(command)
        return
    }
  }

  private handleFileOpenCommand = (command: FileOpenCommand) => {
    switch (command.kind) {
      case 'document':
        this.model.openMarkdownDocument(command.fileId)
        return
      case 'gallery':
        this.model.openGallery({fileId: command.fileId})
        return
      case 'video':
        this.model.openVideoPlayer(command.fileId, command.fileName)
        return
      case 'audio':
        this.model.openAudioPlayer(command.fileId, command.fileName)
        return
      case 'preview':
        this.model.openPreview(command.fileId)
        return
    }
  }

  private onVideoPlayerClose = () => {
    this.model.closeVideoPlayer()
  }

  private onAudioPlayerClose = () => {
    this.model.closeAudioPlayer()
  }

  private onPreviewClose = () => {
    this.model.closePreview()
  }

  private onMarkdownDocumentClose() {
    this.model.closeFilesDocument()
  }

  private applyGallerySlideDirection(direction: 'forward' | 'backward'): void {
    const style = document.createElement('style')
    style.id = 'gallery-slide-direction'
    style.textContent =
      direction === 'forward'
        ? `
      ::view-transition-old(gallery-image) { animation-name: slide-out-left; }
      ::view-transition-new(gallery-image) { animation-name: slide-in-right; }
    `
        : `
      ::view-transition-old(gallery-image) { animation-name: slide-out-right; }
      ::view-transition-new(gallery-image) { animation-name: slide-in-left; }
    `

    document.getElementById('gallery-slide-direction')?.remove()
    document.head.appendChild(style)
    setTimeout(() => style.remove(), 400)
  }

  private onGalleryNavigate = (e: CustomEvent) => {
    const {index: newIndex, direction} = e.detail as {index: number; direction: 'forward' | 'backward'}
    this.applyGallerySlideDirection(direction)
    this.model.setGalleryIndex(newIndex)
  }

  private renderGallery(): TemplateResult | typeof nothing {
    if (!this.model.galleryOpen()) return nothing

    const {store} = getAppContext()
    const fileManagerModel = getFileManagerModel(getAppContext())
    const images = this.model.galleryImages()
    const currentIndex = this.model.galleryIndex()
    const currentImage = images[currentIndex]
    const sharePending = currentImage ? fileManagerModel.isSharePending(currentImage.id) : false

    if (store.layoutMode() === 'mobile') {
      return html`
        <image-gallery-mobile
          .images=${images}
          .currentIndex=${currentIndex}
          .open=${this.model.galleryOpen()}
          .sharePending=${sharePending}
          @close=${this.onGalleryClose}
          @navigate=${this.onGalleryNavigate}
          @action=${this.onDetailsPanelAction}
        ></image-gallery-mobile>
      `
    }

    return html`
      <image-gallery
        .images=${images}
        .currentIndex=${currentIndex}
        .open=${this.model.galleryOpen()}
        .sharePending=${sharePending}
        @close=${this.onGalleryClose}
        @navigate=${this.onGalleryNavigate}
        @action=${this.onDetailsPanelAction}
      ></image-gallery>
    `
  }

  private renderPendingMediaOverlay(): TemplateResult | typeof nothing {
    if (!this.model.mediaOverlayPending()) {
      return nothing
    }

    return html`
      <div class="media-overlay-pending" aria-live="polite" aria-busy="true">
        <div class="loading-spinner"></div>
        <span>${i18n('media:loading')}</span>
      </div>
    `
  }

  private renderMediaPlaybackHost(): TemplateResult {
    return html`<media-playback-host></media-playback-host>`
  }

  private renderAudioPlayerOverlay(): TemplateResult | typeof nothing {
    if (!mediaPlaybackModel.fullPlayerOpen() || mediaPlaybackModel.sessionKind() !== 'audio') {
      return nothing
    }

    return html`<audio-player @close=${this.onAudioPlayerClose} @action=${this.onDetailsPanelAction}></audio-player>`
  }

  private renderVideoPlayerOverlay(): TemplateResult | typeof nothing {
    if (!this.model.videoPlayerOpen()) return nothing

    const {store} = getAppContext()
    if (store.layoutMode() === 'mobile') {
      return html`
        <video-player-mobile
          .fileId=${this.model.videoPlayerFileId()}
          .fileName=${this.model.videoPlayerFileName()}
          .mimeType=${this.model.videoPlayerMimeType()}
          .mediaInfo=${this.model.videoPlayerMediaInfo()}
          .lastModified=${this.model.videoPlayerLastModified()}
          .sourceSize=${this.model.videoPlayerFileSize()}
          .open=${this.model.videoPlayerOpen()}
          @close=${this.onVideoPlayerClose}
          @action=${this.onDetailsPanelAction}
        ></video-player-mobile>
      `
    }

    return html`
      <video-player
        .fileId=${this.model.videoPlayerFileId()}
        .fileName=${this.model.videoPlayerFileName()}
        .mimeType=${this.model.videoPlayerMimeType()}
        .mediaInfo=${this.model.videoPlayerMediaInfo()}
        .lastModified=${this.model.videoPlayerLastModified()}
        .sourceSize=${this.model.videoPlayerFileSize()}
        .open=${this.model.videoPlayerOpen()}
        @close=${this.onVideoPlayerClose}
        @action=${this.onDetailsPanelAction}
      ></video-player>
    `
  }

  private renderPreviewOverlay(): TemplateResult | typeof nothing {
    const data = this.model.previewData()
    if (!data) return nothing
    const fileManagerModel = getFileManagerModel(getAppContext())
    const externalOpenPending = fileManagerModel.isExternalOpenPending(data.fileId)
    const sharePending = fileManagerModel.isSharePending(data.fileId)

    return html`
      <file-preview
        .data=${data}
        .externalOpenPending=${externalOpenPending}
        .sharePending=${sharePending}
        @close=${this.onPreviewClose}
        @action=${this.onDetailsPanelAction}
      ></file-preview>
    `
  }

  private getMobileToolbarState(route: Routes) {
    return this.model.getMobileToolbarState(route)
  }

  private onMobileToolbarLeading = (e: Event) => {
    const detail = (e as CustomEvent<{mode: 'menu' | 'back'}>).detail
    if (detail?.mode === 'menu') {
      getAppContext().store.setSidebarOpen(!getAppContext().store.sidebarOpen())
      return
    }
    this.model.handleMobileBack()
  }

  private onMobileToolbarCommand = () => {
    openCommandPalette({mode: 'search', source: 'mobile-toolbar'})
  }

  private setupRouteTransitions(): void {
    this.unbindRouteTransition?.()
    this.model.initializeRenderedRoute(getRouter().route())
    this.unbindRouteTransition = subscribeAfterInitial(getRouter().route, () => {
      const newRoute = getRouter().route()
      this.scheduleStartupReadinessForRoute(newRoute)

      const plan = this.model.planRenderedRouteTransition(newRoute, biometricAppGateModel.shouldBlockSurface())

      if (plan.intent.kind === 'surface-change') {
        void viewTransition(async () => {
          this.model.commitRenderedRouteTransition(plan)
          await this.updateComplete
        })
      }
    })
  }

  private scheduleStartupReadinessForRoute(route: Routes): void {
    window.clearTimeout(this.startupRouteReadinessTimerId)

    if (route === 'loading' || route === 'welcome') {
      markStartupTimeline('web.startup-readiness.app-route-owned-by-child', {route})
      return
    }

    const {ws} = getAppContext()
    if (route === 'no-connection' && ws.kind === 'tauri' && !ws.connected()) {
      markStartupTimeline('web.startup-readiness.app-route-skip-transient', {
        connected: ws.connected(),
        connecting: ws.connecting(),
        route,
      })
      return
    }

    markStartupTimeline('web.startup-readiness.app-route-scheduled', {
      delayMs: STARTUP_ROUTE_READINESS_SETTLE_MS,
      route,
    })

    this.startupRouteReadinessTimerId = window.setTimeout(() => {
      const currentRoute = getRouter().route()
      if (currentRoute !== route) {
        markStartupTimeline('web.startup-readiness.app-route-skip-after-settle', {
          currentRoute,
          scheduledRoute: route,
        })
        return
      }

      markStartupTimeline('web.startup-readiness.app-route-stable', {route: currentRoute})
      markStartupContentReadyWhenStable(this, {
        criticalSelectors: [`.route-content[data-route="${currentRoute}"]`],
      })
    }, STARTUP_ROUTE_READINESS_SETTLE_MS)
  }

  private onMobileToolbarAction(e: Event) {
    const actionId = (e as CustomEvent<{actionId?: string}>).detail?.actionId
    if (!actionId) return

    const state = this.getMobileToolbarState(getRouter().route())
    const handled = state.executeAction?.(actionId) ?? false
    if (!handled) {
      return
    }
  }

  private onShellCloseSidebar = () => {
    getAppContext().store.setSidebarOpen(false)
  }

  private onShellCloseDetails = () => {
    navigationModel.closeOverlay()
  }

  private onShellOpenSidebar = () => {
    getAppContext().store.setSidebarOpen(true)
  }

  private onShellOpenDetails = () => {
    const {store} = getAppContext()
    const selected = store.selectedNodeIds()
    if (selected && selected.length === 1) {
      navigationModel.openDetails(selected[0]!)
    }
  }

  private onNavigateBack = () => {
    this.model.handleMobileBack()
  }

  private focusDashboardCreateDirActionTarget = (): boolean => {
    const fileManager = this.renderRoot?.querySelector('chromvoid-file-manager') as
      | (HTMLElement & {focusDashboardCreateDirActionTarget?: () => boolean})
      | null

    return fileManager?.focusDashboardCreateDirActionTarget?.() ?? false
  }

  private onKeydown = (e: KeyboardEvent) => {
    this.model.handleKeydown(e, this.focusDashboardCreateDirActionTarget)
  }

  protected renderContent() {
    const route = this.model.renderedRoute()

    if (route === 'no-connection') {
      return this.renderRouteContentFrame(route, html`<no-connection></no-connection>`)
    }

    if (biometricAppGateModel.shouldBlockSurface()) {
      return this.renderRouteContentFrame('biometric-gate', html`<biometric-app-gate></biometric-app-gate>`)
    }

    if (route === 'welcome') {
      return this.renderRouteContentFrame(route, html`<welcome-page></welcome-page>`)
    }

    const isDetailsOpen = navigationModel.isDetailsOpen()
    const mobileToolbar = this.getMobileToolbarState(route)
    const routeContent = this.renderRoute(route)

    return this.renderRouteContentFrame(route, html`
      ${this.renderShell(routeContent, isDetailsOpen, mobileToolbar)} ${this.renderGallery()}
      ${this.renderPreviewOverlay()} ${this.renderVideoPlayerOverlay()} ${this.renderAudioPlayerOverlay()}
      ${this.renderPendingMediaOverlay()} ${this.renderMediaPlaybackHost()} <app-guidance-host></app-guidance-host>
    `)
  }

  render() {
    return this.renderContent()
  }
}

ChromVoidApp.define()
