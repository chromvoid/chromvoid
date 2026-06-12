import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import type {CVMenuButtonInputEvent} from '@chromvoid/uikit/components/cv-menu-button'
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
import type {HostPathTokenGrant} from 'root/core/transport/transport'
import {getAppContext, getRouter} from 'root/shared/services/app-context'
import {openCommandPalette} from 'root/shared/services/command-palette'
import {renderRouteBackLink} from 'root/shared/ui/route-back-link'
import {subscribeAfterInitial} from 'root/shared/services/subscribed-signal'
import {
  emitFileActionCommand,
  subscribeFileCommand,
  type FileCommand,
  type FileOpenCommand,
} from 'root/shared/services/file-command-service'
import type {Routes} from 'root/app/router/router'
import type {SearchFilters} from 'root/shared/contracts/file-manager'
import {getFileManagerModel} from 'root/features/file-manager/file-manager.model'
import {
  definePasswordManagerDesktopToolbarContent,
  executePasswordManagerDesktopToolbarButtonEvent,
  executePasswordManagerDesktopToolbarMenuInput,
  renderPasswordManagerDesktopToolbarContent,
} from 'root/features/passmanager/components/password-manager-layout/password-manager-desktop-toolbar-content'
import {passwordManagerDesktopLayoutModel} from 'root/features/passmanager/components/password-manager-layout/password-manager-layout.model'
import {remoteStorageModel} from './remote-storage/remote-storage.model'
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

type DesktopTitleToolbarOptions = {
  title: string
  subtitle?: string
  backLabel?: string
  onBack?: (event: Event) => void
}

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
    definePasswordManagerDesktopToolbarContent()
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
        return html`<remote-page
          .hideBackLink=${hideMobileBackLinks}
          .externalToolbar=${!hideMobileBackLinks}
        ></remote-page>`
      }
      if (surface === 'gateway') {
        return html`<gateway-page
          .hideBackLink=${hideMobileBackLinks}
          .externalToolbar=${!hideMobileBackLinks}
        ></gateway-page>`
      }
      if (surface === 'remote-storage') {
        return html`<remote-storage-page
          .hideBackLink=${hideMobileBackLinks}
          .externalToolbar=${!hideMobileBackLinks}
        ></remote-storage-page>`
      }
      if (surface === 'settings') {
        return html`<settings-page
          .hideBackLink=${hideMobileBackLinks}
          .externalToolbar=${!hideMobileBackLinks}
        ></settings-page>`
      }
      if (surface === 'passkeys') {
        return html`<passkeys-page
          .hideBackLink=${hideMobileBackLinks}
          .externalToolbar=${!hideMobileBackLinks}
        ></passkeys-page>`
      }
      if (surface === 'passwords') {
        return html`<password-manager></password-manager>`
      }
      if (surface === 'notes') {
        return store.layoutMode() === 'mobile'
          ? html`<notes-quick-view-mobile></notes-quick-view-mobile>`
          : html`<notes-quick-view external-toolbar></notes-quick-view>`
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

  private renderDesktopTitleToolbar(options: DesktopTitleToolbarOptions): TemplateResult {
    return html`
      <desktop-shell-toolbar slot="desktop-topbar">
        ${options.onBack
          ? html`
              <div slot="leading">
                ${renderRouteBackLink({
                  label: options.backLabel ?? i18n('nav:back'),
                  onBack: options.onBack,
                })}
              </div>
            `
          : nothing}
        <span slot="title">${options.title}</span>
        ${options.subtitle ? html`<span slot="subtitle">${options.subtitle}</span>` : nothing}
      </desktop-shell-toolbar>
    `
  }

  private getDesktopTitleToolbarOptions(surface: SurfaceId): DesktopTitleToolbarOptions {
    switch (surface) {
      case 'notes':
        return {
          title: i18n('navigation:notes' as never),
          subtitle: i18n('notes:quick_view:subtitle' as never),
        }
      case 'passwords':
        return {title: i18n('navigation:passwords')}
      case 'passkeys':
        return {
          title: i18n('passkeys:title'),
          subtitle: i18n('passkeys:description'),
          backLabel: i18n('nav:back'),
          onBack: this.handleDesktopNavigationBack,
        }
      case 'settings':
        return {
          title: i18n('settings:title'),
          subtitle: i18n('settings:subtitle'),
          backLabel: i18n('nav:back'),
          onBack: this.handleDesktopNavigationBack,
        }
      case 'remote':
        return {
          title: i18n('remote:title'),
          subtitle: i18n('remote:subtitle'),
          backLabel: i18n('navigation:files'),
          onBack: this.handleDesktopNavigationBack,
        }
      case 'gateway':
        return {
          title: i18n('gateway:page-title'),
          subtitle: i18n('gateway:page-subtitle'),
          backLabel: i18n('gateway:back-to-files'),
          onBack: this.handleDesktopNavigationBack,
        }
      case 'remote-storage':
        return {
          title: i18n('remote-storage:page-title'),
          subtitle: i18n('remote-storage:page-subtitle'),
          backLabel: i18n('remote-storage:back-to-storage'),
          onBack: this.handleDesktopRemoteStorageBack,
        }
      case 'files':
      default:
        return {title: i18n('navigation:files')}
    }
  }

  private renderBlockedSurfaceDesktopTopbar(surface: SurfaceId): TemplateResult {
    return this.renderDesktopTitleToolbar(this.getDesktopTitleToolbarOptions(surface))
  }

  private renderFilesDesktopTopbar(): TemplateResult {
    const model = getFileManagerModel(getAppContext())

    return html`
      <dashboard-header
        slot="desktop-topbar"
        .currentPath=${model.currentPath()}
        .filters=${model.searchFilters()}
        .filterActions=${model.searchFilterActions}
        .totalFiles=${model.totalCount()}
        .filteredFiles=${model.filteredCount()}
        .selectedCount=${model.selectedCount()}
        @navigate=${this.handleDesktopFilesNavigate}
        @filters-change=${this.handleDesktopFilesFiltersChange}
        @create-dir=${this.handleDesktopFilesCreateDir}
        @upload-requested=${this.handleDesktopFilesUploadRequested}
        @upload-paths-requested=${this.handleDesktopFilesUploadPathsRequested}
        @native-upload-requested=${this.handleDesktopFilesNativeUploadRequested}
        @delete-selected=${this.handleDesktopFilesDeleteSelected}
        @clear-selection=${this.handleDesktopFilesClearSelection}
        @selection-mode-requested=${this.handleDesktopFilesSelectionModeRequested}
      ></dashboard-header>
    `
  }

  private renderNotesDesktopTopbar(): TemplateResult {
    return html`
      <desktop-shell-toolbar slot="desktop-topbar">
        <span slot="title">${i18n('navigation:notes' as never)}</span>
        <span slot="subtitle">${i18n('notes:quick_view:subtitle' as never)}</span>
        <notes-quick-view-controls slot="center"></notes-quick-view-controls>
      </desktop-shell-toolbar>
    `
  }

  private renderPasswordsDesktopTopbar(): TemplateResult {
    return html`
      <desktop-shell-toolbar
        slot="desktop-topbar"
        class="passwords-desktop-toolbar"
        ?two-row=${passwordManagerDesktopLayoutModel.getCurrentShowElement() !== 'otpView'}
      >
        ${renderPasswordManagerDesktopToolbarContent({
          model: passwordManagerDesktopLayoutModel,
          onToolbarButtonClick: this.handlePasswordManagerToolbarButtonClick,
          onActionsMenuInput: this.handlePasswordManagerActionsMenuInput,
        })}
      </desktop-shell-toolbar>
    `
  }

  private renderDesktopTopbar(route: Routes): TemplateResult | typeof nothing {
    const {store} = getAppContext()
    if (route !== 'dashboard' || store.layoutMode() === 'mobile') {
      return nothing
    }

    const surface = navigationModel.currentSurface()
    const moduleAccess = moduleAccessModel.surfaceAccess(surface)
    if (moduleAccess && moduleAccess.status !== 'enabled') {
      return this.renderBlockedSurfaceDesktopTopbar(surface)
    }

    switch (surface) {
      case 'files':
        return this.renderFilesDesktopTopbar()
      case 'notes':
        return this.renderNotesDesktopTopbar()
      case 'passwords':
        return this.renderPasswordsDesktopTopbar()
      case 'passkeys':
      case 'settings':
      case 'remote':
      case 'gateway':
      case 'remote-storage':
        return this.renderDesktopTitleToolbar(this.getDesktopTitleToolbarOptions(surface))
      default:
        return nothing
    }
  }

  private handleDesktopNavigationBack() {
    navigationModel.goBack()
  }

  private handleDesktopRemoteStorageBack() {
    remoteStorageModel.closePage()
  }

  private handleDesktopFilesNavigate(event: CustomEvent<{path?: string}>) {
    const path = event.detail?.path
    if (typeof path !== 'string') return
    getFileManagerModel(getAppContext()).handleNavigate(path)
  }

  private handleDesktopFilesFiltersChange(event: CustomEvent<SearchFilters>) {
    getFileManagerModel(getAppContext()).handleFiltersChange(event.detail)
  }

  private handleDesktopFilesCreateDir() {
    void getFileManagerModel(getAppContext()).handleCreateDir()
  }

  private handleDesktopFilesUploadRequested(event: CustomEvent<{files?: FileList}>) {
    const files = event.detail?.files
    if (files && files.length > 0) {
      void getFileManagerModel(getAppContext()).handleFileUpload(files)
    }
  }

  private handleDesktopFilesUploadPathsRequested(event: CustomEvent<{files?: HostPathTokenGrant[]}>) {
    const files = event.detail?.files
    if (Array.isArray(files) && files.length > 0) {
      void getFileManagerModel(getAppContext()).handlePathUpload(files)
    }
  }

  private handleDesktopFilesNativeUploadRequested() {
    void getFileManagerModel(getAppContext()).handleNativeUpload()
  }

  private handleDesktopFilesDeleteSelected() {
    void getFileManagerModel(getAppContext()).handleDeleteSelected()
  }

  private handleDesktopFilesClearSelection() {
    getAppContext().store.setSelectedItems([])
  }

  private handleDesktopFilesSelectionModeRequested(event: CustomEvent<{enabled?: boolean}>) {
    getFileManagerModel(getAppContext()).setSelectionMode(Boolean(event.detail?.enabled))
  }

  private handlePasswordManagerToolbarButtonClick(event: Event): void {
    executePasswordManagerDesktopToolbarButtonEvent(passwordManagerDesktopLayoutModel, event)
  }

  private handlePasswordManagerActionsMenuInput(event: CVMenuButtonInputEvent): void {
    executePasswordManagerDesktopToolbarMenuInput(passwordManagerDesktopLayoutModel, event)
  }

  private renderShell(
    route: Routes,
    routeContent: TemplateResult | '',
    isDetailsOpen: boolean,
    mobileToolbar: MobileToolbarState,
  ): TemplateResult {
    const {store} = getAppContext()
    const contentScrollMode = this.model.getMobileShellContentScrollMode()

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
        ${this.renderDesktopTopbar(route)}
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

  private onDetailsPanelAction(e: CustomEvent) {
    const {action, fileId} = e.detail
    emitFileActionCommand({kind: 'action', action: String(action), fileId: Number(fileId)})
  }

  private handleOpenGallery(e: CustomEvent) {
    const {fileId} = e.detail
    this.handleFileOpenCommand({kind: 'gallery', fileId: Number(fileId)})
  }

  private onGalleryClose(event: CustomEvent<GalleryCloseDetail>) {
    this.model.closeGallery({preserveHistoryEntry: event.detail?.reason === 'swipe-dismiss'})
  }

  private handleOpenVideo(e: CustomEvent) {
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

  private handleFileOpenCommand(command: FileOpenCommand) {
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

  private onVideoPlayerClose() {
    this.model.closeVideoPlayer()
  }

  private onAudioPlayerClose() {
    this.model.closeAudioPlayer()
  }

  private onPreviewClose() {
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

  private onGalleryNavigate(e: CustomEvent) {
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

  private onMobileToolbarLeading(e: Event) {
    const detail = (e as CustomEvent<{mode: 'menu' | 'back'}>).detail
    if (detail?.mode === 'menu') {
      getAppContext().store.setSidebarOpen(!getAppContext().store.sidebarOpen())
      return
    }
    this.model.handleMobileBack()
  }

  private onMobileToolbarCommand() {
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

  private onShellCloseSidebar() {
    getAppContext().store.setSidebarOpen(false)
  }

  private onShellCloseDetails() {
    navigationModel.closeOverlay()
  }

  private onShellOpenSidebar() {
    getAppContext().store.setSidebarOpen(true)
  }

  private onShellOpenDetails() {
    const {store} = getAppContext()
    const selected = store.selectedNodeIds()
    if (selected && selected.length === 1) {
      navigationModel.openDetails(selected[0]!)
    }
  }

  private onNavigateBack() {
    this.model.handleMobileBack()
  }

  private focusDashboardCreateDirActionTarget(): boolean {
    const shellHeader = this.renderRoot?.querySelector('dashboard-header[slot="desktop-topbar"]') as
      | (HTMLElement & {focusCreateDirActionTarget?: () => boolean})
      | null
    if (shellHeader?.focusCreateDirActionTarget?.()) {
      return true
    }

    const fileManager = this.renderRoot?.querySelector('chromvoid-file-manager') as
      | (HTMLElement & {focusDashboardCreateDirActionTarget?: () => boolean})
      | null

    return fileManager?.focusDashboardCreateDirActionTarget?.() ?? false
  }

  private onKeydown = (e: KeyboardEvent) => {
    this.model.handleKeydown(e, () => this.focusDashboardCreateDirActionTarget())
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
      ${this.renderShell(route, routeContent, isDetailsOpen, mobileToolbar)} ${this.renderGallery()}
      ${this.renderPreviewOverlay()} ${this.renderVideoPlayerOverlay()} ${this.renderAudioPlayerOverlay()}
      ${this.renderPendingMediaOverlay()} ${this.renderMediaPlaybackHost()} <app-guidance-host></app-guidance-host>
    `)
  }

  render() {
    return this.renderContent()
  }
}

ChromVoidApp.define()
