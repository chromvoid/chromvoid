import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {CVDrawer, type CVDrawerEventDetail} from '@chromvoid/uikit/components/cv-drawer'

import {css, nothing} from 'lit'

import {tryGetAppContext} from 'root/shared/services/app-context'
import {MobileBottomActionFooter} from 'root/shared/ui/mobile-bottom-action-footer'
import {sharedStyles} from 'root/shared/ui/shared-styles'
import {EdgeSwipeBack} from 'root/utils/edge-swipe-back'
import {SwipeGesture} from 'root/utils/swipe-gestures'

import {CommandBar} from 'root/features/file-manager/components/command-bar'
import {MediaMiniPlayer} from 'root/features/media/components/media-mini-player'
import {mediaPlaybackModel} from 'root/features/media/models/media-playback.model'
import {MobileTabBar} from './mobile-tab-bar'
import {NavigationRail, NavigationRailActions} from 'root/features/file-manager/components/navigation-rail'

export type MobileShellContentScrollMode = 'shell' | 'surface'

/**
 * Mobile layout for file-app-shell.
 *
 * - Always renders `mobile-tab-bar` (no media-query gating)
 * - Always enables swipe gestures (no `isMobileDevice()` check)
 * - Navigation rail is rendered inside a slide-out drawer
 */
export class FileAppShellMobileLayout extends ReatomLitElement {
  static elementName = 'file-app-shell-mobile-layout'
  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
    NavigationRail.define()
    MobileTabBar.define()
    MobileBottomActionFooter.define()
    MediaMiniPlayer.define()
    CommandBar.define()
    CVDrawer.define()
    NavigationRailActions.define()
  }

  static get properties() {
    return {
      sidebarOpen: {type: Boolean, reflect: true, attribute: 'data-sidebar-open'},
      detailsOpen: {type: Boolean, reflect: true, attribute: 'data-details-open'},
      detailsHidden: {type: Boolean, reflect: true, attribute: 'data-details-hidden'},
      dualPane: {type: Boolean, reflect: true, attribute: 'data-dual-pane'},
      edgeBackDisabled: {type: Boolean, reflect: true, attribute: 'data-edge-back-disabled'},
      contentScrollMode: {type: String, reflect: true, attribute: 'content-scroll-mode'},
    }
  }

  declare sidebarOpen: boolean
  declare detailsOpen: boolean
  declare detailsHidden: boolean
  declare dualPane: boolean
  declare edgeBackDisabled: boolean
  declare contentScrollMode: MobileShellContentScrollMode

  private swipeGesture?: SwipeGesture
  private edgeSwipeBack?: EdgeSwipeBack

  static styles = [
    sharedStyles,
    css`
      :host {
        display: grid;
        grid-template-columns: 1fr;
        grid-template-rows: auto minmax(0, 1fr);
        grid-template-areas:
          'topbar'
          'content';
        block-size: 100%;
        position: relative;
        /*
         * Mobile overlays (command bar, drawers, sheets) render with fixed positioning.
         * Layout/query containment here makes them anchor to the shell box instead of
         * the viewport in mobile WebViews.
         */
        contain: style;
        background: var(--surface-base, var(--cv-color-bg, #000));
        color: var(--text-primary, var(--cv-color-text, #fff));
        height: 100%;
        --mobile-topbar-block-size: 56px;
        --mobile-tab-bar-block-size: 64px;
        --mobile-tab-bar-active-block-size: var(
          --mobile-tab-bar-keyboard-aware-block-size,
          var(--mobile-tab-bar-block-size)
        );
        /*
         * chromvoid-app already removes bottom safe-area from the shell height.
         * Content only needs the tab bar portion that overlaps the shell box.
         */
        --mobile-tab-bar-content-clearance: var(--mobile-tab-bar-active-block-size);
        --mobile-tab-bar-viewport-clearance: calc(
          var(--mobile-tab-bar-active-block-size) +
            var(--safe-area-bottom-active, var(--safe-area-bottom, 0px))
        );
        --mobile-media-mini-block-size: 78px;
        --mobile-media-mini-gap: var(--app-spacing-3);
      }

      .content::before {
        content: '';
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 0;
        opacity: 0.06;
        background-size: 40px 40px;
        background-image:
          linear-gradient(to right, var(--cv-color-border-muted) 1px, transparent 1px),
          linear-gradient(to bottom, var(--cv-color-border-muted) 1px, transparent 1px);
      }

      .content {
        grid-area: content;
        min-inline-size: 0;
        min-block-size: 0;
        overflow: auto;
        position: relative;
        padding-block-start: var(--mobile-topbar-block-size);
        padding-block-end: var(--mobile-tab-bar-content-clearance);
        view-transition-name: shell-content;
        contain: style;
      }

      .content slot {
        position: relative;
        z-index: 1;
      }

      :host([content-scroll-mode='surface']) .content {
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      :host([content-scroll-mode='surface']) .content slot:not([name]) {
        display: block;
        flex: 1 1 auto;
        min-block-size: 0;
        block-size: 100%;
      }

      .content--media-mini {
        padding-block-end: calc(
          var(--mobile-tab-bar-content-clearance) + var(--mobile-media-mini-block-size) +
            var(--mobile-media-mini-gap)
        );
      }

      .content--no-tabbar {
        padding-block-end: 0px;
      }

      .content--no-tabbar.content--media-mini {
        padding-block-end: calc(var(--mobile-media-mini-block-size) + var(--mobile-media-mini-gap));
      }

      .mobile-media-mini {
        position: fixed;
        inset-inline: max(var(--app-spacing-3), env(safe-area-inset-left, 0px))
          max(var(--app-spacing-3), env(safe-area-inset-right, 0px));
        inset-block-end: calc(
          var(--mobile-tab-bar-viewport-clearance) + var(--mobile-media-mini-gap)
        );
        z-index: calc(var(--cv-z-overlay, 300) - 1);
        pointer-events: none;
      }

      .mobile-media-mini media-mini-player {
        pointer-events: auto;
      }

      .mobile-media-mini--no-tabbar {
        inset-block-end: calc(var(--safe-area-bottom-active, var(--safe-area-bottom, 0px)) + var(--mobile-media-mini-gap));
      }

      .topbar {
        grid-area: topbar;
        min-inline-size: 0;
        min-block-size: 0;
        position: fixed;
        inset-block-start: var(--safe-area-top, 0px);
        inset-inline: 0;
        /* Keep the toolbar above scrolling content, but below open mobile overlays. */
        z-index: calc(var(--cv-z-overlay, 300) - 1);
      }

      .overlay {
        position: fixed;
        inset: 0;
        background: var(--cv-alpha-black-65);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        opacity: 0;
        pointer-events: none;
        transition:
          opacity var(--cv-duration-normal, 220ms)
            var(--cv-easing-standard, cubic-bezier(0.2, 0, 0, 1)),
          display var(--cv-duration-normal, 220ms) allow-discrete;
        transition-behavior: allow-discrete;
        z-index: var(--cv-z-overlay, 300);
      }

      .overlay--details {
        z-index: var(--cv-z-overlay, 300);
      }

      :host([data-details-open]) .overlay--details {
        opacity: 1;
        pointer-events: auto;
      }

      .details {
        position: fixed;
        inset-block: 0;
        inset-inline-end: 0;
        inline-size: 100%;
        background: var(--surface-overlay, #111);
        border-inline-start: 1px solid var(--border-subtle, var(--cv-alpha-white-6));
        box-shadow: var(--cv-shadow-xl, 0 16px 48px var(--cv-alpha-black-65));
        transform: translateX(100%);
        opacity: 0;
        pointer-events: none;
        visibility: hidden;
        transition:
          transform var(--cv-duration-slow, 320ms)
            var(--cv-easing-decelerate, cubic-bezier(0, 0, 0.2, 1)),
          opacity var(--cv-duration-fast, 120ms)
            var(--cv-easing-standard, cubic-bezier(0.2, 0, 0, 1)),
          display var(--cv-duration-slow, 320ms) allow-discrete;
        transition-behavior: allow-discrete;
        z-index: calc(var(--cv-z-overlay, 300) + 1);
        overflow: auto;
        view-transition-name: details-panel;
      }

      :host([data-details-open]) .details {
        transform: translateX(0);
        opacity: 1;
        pointer-events: auto;
        visibility: visible;
      }

      :host([data-details-hidden]) .details,
      :host([data-details-hidden]) .overlay--details {
        display: none;
      }

      .mobile-nav-drawer {
        --cv-drawer-z-index: var(--cv-z-overlay, 300);
        --cv-drawer-size: min(82vw, var(--nav-rail-width-expanded, 240px));
        --cv-drawer-max-size: min(82vw, var(--nav-rail-width-expanded, 240px));
        --cv-drawer-border-radius: 0px;
        --cv-drawer-body-spacing: 0px;
        --cv-drawer-footer-spacing: 0px;
        --cv-drawer-overlay-color: var(--cv-alpha-black-65);
        --cv-drawer-overlay-transition-duration: var(--cv-duration-normal, 220ms);
        --cv-drawer-overlay-closed-opacity: 0;
        --cv-drawer-transition-duration: var(--cv-duration-normal, 220ms);
      }

      .mobile-nav-drawer::part(trigger) {
        display: none;
      }

      .mobile-nav-drawer::part(overlay) {
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
      }

      .mobile-nav-drawer::part(panel) {
        border: 0;
        border-inline-end: 1px solid var(--border-subtle, var(--cv-alpha-white-6));
        background: var(--surface-base, var(--cv-color-bg, #000));
        box-shadow: var(--cv-shadow-xl, 0 16px 48px var(--cv-alpha-black-65));
        inset-block-start: var(--safe-area-top, 0px);
        inset-block-end: 0;
        block-size: calc(100dvh - var(--safe-area-top, 0px));
        grid-template-rows: auto minmax(0, 1fr) auto;
        min-block-size: 0;
        overflow: hidden;
      }

      .mobile-nav-drawer::part(body) {
        display: flex;
        grid-row: 2;
        align-items: stretch;
        block-size: 100%;
        box-sizing: border-box;
        min-block-size: 0;
        padding-block-start: 0;
        padding-block-end: 0;
      }

      .mobile-nav-drawer::part(footer) {
        display: block;
        grid-row: 3;
        min-block-size: 0;
        background: var(--surface-base, var(--cv-color-bg, #000));
        padding-block-end: var(--safe-area-bottom-active, var(--safe-area-bottom, 0px));
      }

      .mobile-nav-rail {
        --nav-rail-width-expanded: 100%;
        display: block;
        flex: 1 1 auto;
        min-block-size: 0;
        inline-size: 100%;
        block-size: 100%;
        touch-action: pan-y;
      }

      .mobile-nav-actions {
        --nav-rail-width-expanded: 100%;
        display: block;
        inline-size: 100%;
      }

      @media (prefers-reduced-motion: reduce) {
        .overlay {
          transition-duration: var(--cv-duration-instant, 0ms);
        }

        .details {
          transform: none;
          transition: opacity var(--cv-duration-fast, 120ms)
            var(--cv-easing-standard, cubic-bezier(0.2, 0, 0, 1));
        }

        :host([data-details-open]) .details {
          transform: none;
        }

        .mobile-nav-drawer {
          --cv-drawer-overlay-transition-duration: var(--cv-duration-instant, 0ms);
          --cv-drawer-transition-duration: var(--cv-duration-instant, 0ms);
        }
      }
    `,
  ]

  constructor() {
    super()
    this.sidebarOpen = false
    this.detailsOpen = false
    this.detailsHidden = false
    this.dualPane = false
    this.edgeBackDisabled = false
    this.contentScrollMode = 'shell'
  }

  private onOverlayDetailsClick = () => {
    this.dispatchEvent(new CustomEvent('close-details', {bubbles: true, composed: true}))
  }

  private handleNavDrawerChange(event: CustomEvent<CVDrawerEventDetail>) {
    if (event.detail.open) return
    this.dispatchEvent(new CustomEvent('close-sidebar', {bubbles: true, composed: true}))
  }

  override connectedCallback() {
    super.connectedCallback()
    this.setupSwipeGestures()
    this.edgeSwipeBack = new EdgeSwipeBack(this, {
      onBack: () => {
        this.dispatchEvent(new CustomEvent('navigate-back', {bubbles: true, composed: true}))
      },
      isDisabled: () => this.sidebarOpen || this.edgeBackDisabled,
    })
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.swipeGesture?.destroy()
    this.swipeGesture = undefined
    this.edgeSwipeBack?.destroy()
    this.edgeSwipeBack = undefined
  }

  /** Mobile layout always enables swipe gestures — no capability check. */
  private setupSwipeGestures() {
    this.swipeGesture = new SwipeGesture(this, {
      threshold: 60,
      restraint: 120,
      allowedTime: 400,
      touchOnly: true,
      ignoreStartZone: (x) => x < 30,
    })

    this.swipeGesture.on('right', () => {
      this.dispatchEvent(new CustomEvent('open-sidebar', {bubbles: true, composed: true}))
    })

    this.swipeGesture.on('left', () => {
      if (this.sidebarOpen) {
        return
      }
      if (this.detailsOpen) {
        this.dispatchEvent(new CustomEvent('close-details', {bubbles: true, composed: true}))
        return
      }

      const ctx = tryGetAppContext()
      const selected = ctx?.store?.selectedNodeIds?.()
      if (selected && selected.length === 1) {
        this.dispatchEvent(new CustomEvent('open-details', {bubbles: true, composed: true}))
      }
    })
  }

  protected render() {
    const mediaMiniVisible = mediaPlaybackModel.miniControlsVisible()
    const hideTabBar = false

    return html`
      <command-bar></command-bar>

      <cv-drawer
        class="mobile-nav-drawer"
        placement="start"
        no-header
        drag-to-close
        .open=${this.sidebarOpen}
        @cv-change=${this.handleNavDrawerChange}
      >
        <navigation-rail class="mobile-nav-rail"></navigation-rail>
        <navigation-rail-actions slot="footer" class="mobile-nav-actions"></navigation-rail-actions>
      </cv-drawer>

      <div class="topbar"><slot name="mobile-topbar"></slot></div>
      <main class="content ${mediaMiniVisible ? 'content--media-mini' : ''} ${hideTabBar ? 'content--no-tabbar' : ''}">
        <slot></slot>
      </main>

      <div class="overlay overlay--details" @click=${this.onOverlayDetailsClick}></div>
      <aside class="details"><slot name="details"></slot></aside>

      ${mediaMiniVisible
        ? html`<div class="mobile-media-mini ${hideTabBar ? 'mobile-media-mini--no-tabbar' : ''}">
            <media-mini-player variant="mobile"></media-mini-player>
          </div>`
        : nothing}
      ${hideTabBar ? nothing : html`<mobile-tab-bar></mobile-tab-bar>`}
    `
  }
}
