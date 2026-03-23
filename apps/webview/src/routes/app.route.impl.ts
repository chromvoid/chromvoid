import {XLitElement} from '@statx/lit'
import {html, nothing, type TemplateResult} from 'lit'

import {navigationModel} from 'root/app/navigation/navigation.model'
import {getAppContext} from 'root/shared/services/app-context'
import {openCommandPalette} from 'root/shared/services/command-palette'
import type {Routes} from 'root/app/router/router'

import {FileAppShell} from 'root/features/shell/components/file-app-shell'
import {FileDetailsPanel} from 'root/features/file-manager/components/file-details-panel'
import {ImageGallery} from 'root/features/media/components/image-gallery'
import {ImageGalleryMobile} from 'root/features/media/components/image-gallery-mobile'
import {VideoPlayer} from 'root/features/media/components/video-player'
import {VideoPlayerMobile} from 'root/features/media/components/video-player-mobile'
import {GatewayPage} from './gateway/gateway-page'
import {BiometricAppGate} from './biometric-app-gate/biometric-app-gate'
import {biometricAppGateModel} from './biometric-app-gate/biometric-app-gate.model'
import {RemotePage} from './remote/remote-page'
import {SettingsPage} from './settings/settings-page'
import {NetworkPairPage} from './network-pair/network-pair'
import {appRouteStyles} from './app.route.styles'
import {ChromVoidAppModel, type MobileToolbarState} from './app.route.model'

export class ChromVoidApp extends XLitElement {
  static elementName = 'chromvoid-app'
  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
    FileDetailsPanel.define()
    FileAppShell.define()
    GatewayPage.define()
    BiometricAppGate.define()
    RemotePage.define()
    ImageGallery.define()
    ImageGalleryMobile.define()
    VideoPlayer.define()
    VideoPlayerMobile.define()
    SettingsPage.define()
    NetworkPairPage.define()
  }
  static styles = appRouteStyles

  private readonly model = new ChromVoidAppModel(
    () => this.requestUpdate(),
    () => this.updateComplete,
  )

  connectedCallback(): void {
    super.connectedCallback()
    this.model.connect()
    window.addEventListener('keydown', this.onKeydown)
    window.addEventListener('open-gallery', this.handleOpenGallery as unknown as EventListener)
    window.addEventListener('open-video', this.handleOpenVideo as unknown as EventListener)
  }

  disconnectedCallback(): void {
    window.removeEventListener('open-video', this.handleOpenVideo as unknown as EventListener)
    window.removeEventListener('open-gallery', this.handleOpenGallery as unknown as EventListener)
    window.removeEventListener('keydown', this.onKeydown)
    this.model.disconnect()
    super.disconnectedCallback()
  }

  private renderShellDetails() {
    const data = this.model.getShellDetailsData()
    if (!data) return nothing

    return html`<file-details-panel
      slot="details"
      open
      .data=${{
        mode: 'single' as const,
        id: data.id,
        name: data.name,
        isDir: false,
        size: data.size,
        path: data.path,
        lastModified: data.lastModified,
      }}
      @close=${this.onShellCloseDetails}
      @action=${this.onDetailsPanelAction}
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
      if (surface === 'remote') {
        return html`<remote-page .hideBackLink=${hideMobileBackLinks}></remote-page>`
      }
      if (surface === 'gateway') {
        return html`<gateway-page .hideBackLink=${hideMobileBackLinks}></gateway-page>`
      }
      if (surface === 'remote-storage') {
        return html`<remote-storage-page .hideBackLink=${hideMobileBackLinks}></remote-storage-page>`
      }
      if (surface === 'network-pair') {
        return html`<network-pair-page .hideBackLink=${hideMobileBackLinks}></network-pair-page>`
      }
      if (surface === 'settings') {
        return html`<settings-page .hideBackLink=${hideMobileBackLinks}></settings-page>`
      }
      if (surface === 'passwords') {
        return html`<password-manager></password-manager>`
      }

      return html`<chromvoid-file-manager></chromvoid-file-manager>`
    }

    return ''
  }

  private renderMobileTopToolbar(state: MobileToolbarState): TemplateResult | typeof nothing {
    if (!state.show) return nothing

    return html`
      <mobile-top-toolbar
        slot="mobile-topbar"
        .title=${state.title}
        .leading=${state.leading}
        .menuOpen=${getAppContext().store.sidebarOpen()}
        .actions=${state.actions}
        ?back-disabled=${state.backDisabled}
        ?show-command=${state.showCommand}
        @mobile-toolbar-leading=${this.onMobileToolbarLeading}
        @mobile-toolbar-command=${this.onMobileToolbarCommand}
        @mobile-toolbar-action=${(e: CustomEvent) => state.actionProvider?.executeMobileCommand?.(e.detail.actionId)}
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

    return html`
      <file-app-shell
        ?data-details-hidden=${navigationModel.isDetailsHidden()}
        ?data-details-open=${isDetailsOpen}
        ?data-sidebar-open=${store.sidebarOpen()}
        ?data-dual-pane=${store.dualPaneMode()}
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

  private onDetailsPanelAction = (e: CustomEvent) => {
    const {action, fileId} = e.detail
    window.dispatchEvent(
      new CustomEvent('file-action', {
        detail: {action, fileId},
      }),
    )
  }

  private handleOpenGallery = (e: CustomEvent) => {
    const {fileId} = e.detail
    this.model.openGallery({fileId: Number(fileId)})
  }

  private onGalleryClose = () => {
    this.model.closeGallery()
  }

  private handleOpenVideo = (e: CustomEvent) => {
    const {fileId, fileName} = e.detail
    this.model.openVideoPlayer(Number(fileId), String(fileName))
  }

  private onVideoPlayerClose = () => {
    this.model.closeVideoPlayer()
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
    if (store.layoutMode() === 'mobile') {
      return html`
        <image-gallery-mobile
          .images=${this.model.galleryImages()}
          .currentIndex=${this.model.galleryIndex()}
          .open=${this.model.galleryOpen()}
          @close=${this.onGalleryClose}
          @navigate=${this.onGalleryNavigate}
        ></image-gallery-mobile>
      `
    }

    return html`
      <image-gallery
        .images=${this.model.galleryImages()}
        .currentIndex=${this.model.galleryIndex()}
        .open=${this.model.galleryOpen()}
        @close=${this.onGalleryClose}
        @navigate=${this.onGalleryNavigate}
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
        <span>Loading media...</span>
      </div>
    `
  }

  private renderVideoPlayerOverlay(): TemplateResult | typeof nothing {
    if (!this.model.videoPlayerOpen()) return nothing

    const {store} = getAppContext()
    if (store.layoutMode() === 'mobile') {
      return html`
        <video-player-mobile
          .fileId=${this.model.videoPlayerFileId()}
          .fileName=${this.model.videoPlayerFileName()}
          .open=${this.model.videoPlayerOpen()}
          @close=${this.onVideoPlayerClose}
        ></video-player-mobile>
      `
    }

    return html`
      <video-player
        .fileId=${this.model.videoPlayerFileId()}
        .fileName=${this.model.videoPlayerFileName()}
        .open=${this.model.videoPlayerOpen()}
        @close=${this.onVideoPlayerClose}
      ></video-player>
    `
  }

  private getMobileToolbarState(route: Routes) {
    return this.model.getMobileToolbarState(route, this.renderRoot)
  }

  private onMobileToolbarLeading = (e: Event) => {
    const detail = (e as CustomEvent<{mode: 'menu' | 'back'}>).detail
    if (detail?.mode === 'menu') {
      getAppContext().store.setSidebarOpen(!getAppContext().store.sidebarOpen())
      return
    }
    this.model.handleMobileBack(this.renderRoot)
  }

  private onMobileToolbarCommand = () => {
    openCommandPalette({mode: 'all', source: 'mobile-toolbar'})
  }

  private onTagClick = (e: CustomEvent) => {
    const tag = e.detail?.tag?.key as string
    if (!tag) return
    const path = `/Tags/${tag}`
    navigationModel.navigateFilesPath(path)
  }

  private onShellCloseSidebar = () => {
    getAppContext().store.setSidebarOpen(false)
  }

  private onShellCloseDetails = () => {
    navigationModel.goBack()
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
    this.model.handleMobileBack(this.renderRoot)
  }

  private onKeydown = (e: KeyboardEvent) => {
    this.model.handleKeydown(e, this.renderRoot)
  }

  protected renderContent() {
    const route = window.router.route()

    if (route === 'no-connection') {
      return html`<no-connection></no-connection>`
    }

    if (biometricAppGateModel.shouldBlockSurface()) {
      return html`<biometric-app-gate></biometric-app-gate>`
    }

    if (route === 'welcome') {
      return html`<welcome-page></welcome-page>`
    }

    const isDetailsOpen = navigationModel.isDetailsOpen()
    const mobileToolbar = this.getMobileToolbarState(route)
    const routeContent = this.renderRoute(route)

    return html`
      ${this.renderShell(routeContent, isDetailsOpen, mobileToolbar)} ${this.renderGallery()}
      ${this.renderVideoPlayerOverlay()} ${this.renderPendingMediaOverlay()}
    `
  }

  render() {
    return this.renderContent()
  }
}

ChromVoidApp.define()
