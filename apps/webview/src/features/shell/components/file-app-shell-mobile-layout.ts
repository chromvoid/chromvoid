import {XLitElement} from '@statx/lit'

import {css, html} from 'lit'

import {tryGetAppContext} from 'root/shared/services/app-context'
import {sharedStyles} from 'root/shared/ui/shared-styles'
import {EdgeSwipeBack} from 'root/utils/edge-swipe-back'
import {SwipeGesture} from 'root/utils/swipe-gestures'

import {CommandBar} from 'root/features/file-manager/components/command-bar'
import {MobileTabBar} from './mobile-tab-bar'
import {NavigationRail} from 'root/features/file-manager/components/navigation-rail'

/**
 * Mobile layout for file-app-shell.
 *
 * - Always renders `mobile-tab-bar` (no media-query gating)
 * - Always enables swipe gestures (no `isMobileDevice()` check)
 * - Navigation rail is rendered inside a slide-out drawer
 */
export class FileAppShellMobileLayout extends XLitElement {
  static elementName = 'file-app-shell-mobile-layout'
  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
    NavigationRail.define()
    MobileTabBar.define()
    CommandBar.define()
  }

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
        contain: layout style;
        container-type: inline-size;
        background: var(--surface-base, var(--cv-color-bg, #000));
        color: var(--text-primary, var(--cv-color-text, #fff));
        height: 100%;
      }

    .content::before {
        content: '';
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 0;
        background-size: 40px 40px;
        background-image:
          linear-gradient(to right, color-mix(in oklch, var(--cv-color-border) 35%, transparent) 1px, transparent 1px),
          linear-gradient(to bottom, color-mix(in oklch, var(--cv-color-border) 35%, transparent) 1px, transparent 1px);
      }


      .nav {
        position: fixed;
        inset-block: 0;
        inset-inline-start: 0;
        inline-size: min(85vw, 300px);
        transform: translateX(-100%);
        opacity: 0;
        transition:
          transform var(--cv-duration-normal, 250ms) var(--ease-out-expo, cubic-bezier(0.16, 1, 0.3, 1)),
          opacity var(--cv-duration-fast, 150ms) var(--ease-out-quart, cubic-bezier(0.25, 1, 0.5, 1));
        z-index: calc(var(--cv-z-overlay, 300) + 1);
        box-shadow: var(--cv-shadow-xl, 0 16px 48px var(--cv-alpha-black-65));
        min-inline-size: 0;
      }

      :host([data-sidebar-open]) .nav {
        transform: translateX(0);
        opacity: 1;
      }

      .content {
        grid-area: content;
        min-inline-size: 0;
        min-block-size: 0;
        overflow: auto;
        padding-block-end: 72px;
        background: var(--surface-raised, var(--cv-color-surface, #0a0a0a));
        view-transition-name: shell-content;
        contain: layout style;
      }

      .topbar {
        grid-area: topbar;
        min-inline-size: 0;
        min-block-size: 0;
        z-index: calc(var(--cv-z-overlay, 300) + 2);
      }

      .overlay {
        position: fixed;
        inset: 0;
        background: var(--cv-alpha-black-65);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        opacity: 0;
        pointer-events: none;
        transition: opacity var(--cv-duration-normal, 250ms) var(--ease-out-quart, cubic-bezier(0.25, 1, 0.5, 1));
        z-index: var(--cv-z-overlay, 300);
      }

      .overlay--nav {
        z-index: var(--cv-z-overlay, 300);
      }

      .overlay--details {
        z-index: var(--cv-z-overlay, 300);
      }

      :host([data-sidebar-open]) .overlay--nav {
        opacity: 1;
        pointer-events: auto;
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
        transition:
          transform var(--cv-duration-normal, 250ms) var(--ease-out-expo, cubic-bezier(0.16, 1, 0.3, 1)),
          opacity var(--cv-duration-fast, 150ms) var(--ease-out-quart, cubic-bezier(0.25, 1, 0.5, 1));
        z-index: calc(var(--cv-z-overlay, 300) + 1);
        overflow: auto;
        view-transition-name: details-panel;
      }

      :host([data-details-open]) .details {
        transform: translateX(0);
        opacity: 1;
      }

      :host([data-details-hidden]) {
        .details,
        .overlay--details {
          display: none;
        }
      }
    `,
  ]

  private onOverlayNavClick = () => {
    this.dispatchEvent(new CustomEvent('close-sidebar', {bubbles: true, composed: true}))
  }

  private onOverlayDetailsClick = () => {
    this.dispatchEvent(new CustomEvent('close-details', {bubbles: true, composed: true}))
  }

  override connectedCallback() {
    super.connectedCallback()
    this.setupSwipeGestures()
    this.edgeSwipeBack = new EdgeSwipeBack(this, {
      onBack: () => {
        this.dispatchEvent(new CustomEvent('navigate-back', {bubbles: true, composed: true}))
      },
      isDisabled: () => this.hasAttribute('data-sidebar-open'),
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
      if (this.hasAttribute('data-sidebar-open')) {
        this.dispatchEvent(new CustomEvent('close-sidebar', {bubbles: true, composed: true}))
        return
      }
      if (this.hasAttribute('data-details-open')) {
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
    return html`
      <command-bar></command-bar>

      <div class="overlay overlay--nav" @click=${this.onOverlayNavClick}></div>
      <nav class="nav"><navigation-rail></navigation-rail></nav>

      <div class="topbar"><slot name="mobile-topbar"></slot></div>
      <main class="content"><slot></slot></main>

      <div class="overlay overlay--details" @click=${this.onOverlayDetailsClick}></div>
      <aside class="details"><slot name="details"></slot></aside>

      <mobile-tab-bar></mobile-tab-bar>
    `
  }
}
