import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {css} from 'lit'

import {sharedStyles} from 'root/shared/ui/shared-styles'

import {CommandBar} from 'root/features/file-manager/components/command-bar'
import {NavigationRail} from 'root/features/file-manager/components/navigation-rail'

export class FileAppShellDesktopLayout extends ReatomLitElement {
  static elementName = 'file-app-shell-desktop-layout'
  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
    NavigationRail.define()
    CommandBar.define()
  }

  static get properties() {
    return {
      detailsOpen: {type: Boolean, reflect: true, attribute: 'data-details-open'},
      detailsHidden: {type: Boolean, reflect: true, attribute: 'data-details-hidden'},
      dualPane: {type: Boolean, reflect: true, attribute: 'data-dual-pane'},
    }
  }

  declare detailsOpen: boolean
  declare detailsHidden: boolean
  declare dualPane: boolean

  static styles = [
    sharedStyles,
    css`
      :host {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        grid-template-rows: auto minmax(0, 1fr) min-content;
        grid-template-areas:
          'nav topbar'
          'nav content'
          'statusbar statusbar';
        block-size: 100%;
        position: relative;
        contain: content;
        container-type: inline-size;
        background: var(--surface-base, var(--cv-color-bg, #000));
        color: var(--text-primary, var(--cv-color-text, #fff));

        @supports (block-size: 100svh) {
          block-size: 100svh;
        }
      }

      .topbar {
        grid-area: topbar;
        min-inline-size: 0;
        z-index: 25;
        background: var(--cv-color-surface);
      }

      .topbar slot {
        display: block;
        min-inline-size: 0;
      }

      .nav {
        grid-area: nav;
        min-inline-size: 0;
        z-index: 20;
      }

      .content {
        grid-area: content;
        min-inline-size: 0;
        min-block-size: 0;
        overflow: auto;
        background: var(--surface-raised, var(--cv-color-surface, #0a0a0a));
        view-transition-name: shell-content;
        contain: layout style;
      }

      .statusbar {
        grid-area: statusbar;
        background: transparent;
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
          opacity var(--cv-duration-normal, 220ms) var(--cv-easing-standard, cubic-bezier(0.2, 0, 0, 1)),
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
        inline-size: min(92vw, var(--details-panel-width, 400px));
        background: var(--surface-overlay, #111);
        border-inline-start: 1px solid var(--border-subtle, var(--cv-alpha-white-6));
        box-shadow: var(--cv-shadow-xl, 0 16px 48px var(--cv-alpha-black-65));
        transform: translateX(100%);
        opacity: 0;
        pointer-events: none;
        visibility: hidden;
        transition:
          transform var(--cv-duration-slow, 320ms) var(--cv-easing-decelerate, cubic-bezier(0, 0, 0.2, 1)),
          opacity var(--cv-duration-fast, 120ms) var(--cv-easing-standard, cubic-bezier(0.2, 0, 0, 1)),
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
      }

      @media (hover: none) and (pointer: coarse) {
        @container (max-width: 1000px) {
          .nav {
            --nav-rail-width-expanded: 200px;
          }
        }
      }
    `,
  ]

  constructor() {
    super()
    this.detailsOpen = false
    this.detailsHidden = false
    this.dualPane = false
  }

  private onOverlayDetailsClick = () => {
    this.dispatchEvent(new CustomEvent('close-details', {bubbles: true, composed: true}))
  }

  protected render() {
    return html`
      <command-bar></command-bar>

      <header class="topbar"><slot name="desktop-topbar"></slot></header>

      <nav class="nav"><navigation-rail></navigation-rail></nav>

      <main class="content"><slot></slot></main>

      <div class="overlay overlay--details" @click=${this.onOverlayDetailsClick}></div>
      <aside class="details"><slot name="details"></slot></aside>

      <footer class="statusbar"><slot name="statusbar"></slot></footer>
    `
  }
}
