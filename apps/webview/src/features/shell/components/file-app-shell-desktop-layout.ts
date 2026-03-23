import {XLitElement} from '@statx/lit'

import {css, html} from 'lit'

import {sharedStyles} from 'root/shared/ui/shared-styles'

import {CommandBar} from 'root/features/file-manager/components/command-bar'
import {NavigationRail} from 'root/features/file-manager/components/navigation-rail'

export class FileAppShellDesktopLayout extends XLitElement {
  static elementName = 'file-app-shell-desktop-layout'
  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
    NavigationRail.define()
    CommandBar.define()
  }

  static styles = [
    sharedStyles,
    css`
      :host {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        grid-template-rows: 1fr min-content;
        grid-template-areas:
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
        transition: opacity var(--cv-duration-normal, 250ms) var(--ease-out-quart, cubic-bezier(0.25, 1, 0.5, 1));
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

  private onOverlayDetailsClick = () => {
    this.dispatchEvent(new CustomEvent('close-details', {bubbles: true, composed: true}))
  }

  protected render() {
    return html`
      <command-bar></command-bar>

      <nav class="nav"><navigation-rail></navigation-rail></nav>

      <main class="content"><slot></slot></main>

      <div class="overlay overlay--details" @click=${this.onOverlayDetailsClick}></div>
      <aside class="details"><slot name="details"></slot></aside>

      <footer class="statusbar"><slot name="statusbar"></slot></footer>
    `
  }
}
