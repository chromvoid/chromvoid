import {css} from 'lit'

import {sharedStyles} from 'root/shared/ui/shared-styles'

export const appRouteStyles = [
  sharedStyles,
  css`
    :host {
      height: calc(100% + var(--app-runtime-visual-viewport-inset-block-end-active, 0px));
      display: block;
      background: var(--cv-color-bg);
      color: var(--cv-color-text);
      overflow-y: auto;
    }

    password-manager {
      display: grid;
      grid-template-rows: auto;
    }

    desktop-shell-toolbar.wallet-desktop-toolbar .wallet-desktop-context,
    desktop-shell-toolbar.wallet-desktop-toolbar .wallet-desktop-actions,
    desktop-shell-toolbar.wallet-desktop-toolbar .wallet-desktop-context-static {
      display: inline-flex;
      align-items: center;
      min-inline-size: 0;
    }

    desktop-shell-toolbar.wallet-desktop-toolbar .wallet-desktop-actions {
      gap: var(--app-spacing-2);
    }

    desktop-shell-toolbar.wallet-desktop-toolbar .wallet-desktop-context {
      flex: 1 1 auto;
      gap: var(--app-spacing-3);
    }

    desktop-shell-toolbar.wallet-desktop-toolbar .wallet-desktop-summary {
      min-inline-size: 0;
      overflow: hidden;
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-xs);
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    desktop-shell-toolbar.wallet-desktop-toolbar cv-button {
      --cv-button-min-height: var(--app-toolbar-control-block-size);
      --cv-button-border-radius: var(--app-toolbar-control-radius);
      --cv-button-padding-inline: var(--app-toolbar-control-padding-inline);
      --cv-button-font-size: var(--app-toolbar-control-font-size);
      --cv-button-font-weight: var(--app-toolbar-control-font-weight);
      --cv-button-gap: var(--app-toolbar-control-gap);
    }

    desktop-shell-toolbar.wallet-desktop-toolbar .wallet-desktop-context-static {
      gap: var(--app-spacing-2);
      max-inline-size: 240px;
      min-block-size: var(--app-toolbar-control-block-size);
      padding-inline: var(--app-spacing-3);
      border: 1px solid var(--cv-color-border-muted);
      border-radius: var(--cv-radius-md);
      color: var(--cv-color-text);
      background: var(--cv-color-surface-secondary);
    }

    desktop-shell-toolbar.wallet-desktop-toolbar .wallet-desktop-context-button {
      max-inline-size: 240px;
    }

    desktop-shell-toolbar.wallet-desktop-toolbar .wallet-desktop-context-label {
      min-inline-size: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    desktop-shell-toolbar.wallet-desktop-toolbar .wallet-desktop-overflow {
      --cv-menu-button-menu-align: end;
      --cv-menu-button-menu-min-inline-size: 180px;
      --cv-menu-button-menu-z-index: 60;
    }

    desktop-shell-toolbar.wallet-desktop-toolbar .wallet-desktop-overflow::part(trigger) {
      min-inline-size: var(--app-toolbar-control-block-size);
      min-block-size: var(--app-toolbar-control-block-size);
    }

    desktop-shell-toolbar.wallet-desktop-toolbar .wallet-desktop-overflow::part(label),
    desktop-shell-toolbar.wallet-desktop-toolbar .wallet-desktop-overflow::part(dropdown-icon) {
      display: none;
    }

    .route-content {
      block-size: 100%;
      min-block-size: 0;
      contain: style;
    }

    .action-btn {
      inline-size: 44px;
      block-size: 44px;
      min-inline-size: 44px;
      min-block-size: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: var(--app-editorial-text-primary, var(--cv-color-text));
      cursor: pointer;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
    }

    .action-btn:hover {
      background: var(--cv-color-primary-surface);
    }

    .action-btn:active {
      transform: scale(0.94);
    }

    .action-btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    .action-btn cv-icon {
      font-size: 20px;
    }

    .media-overlay-pending {
      position: fixed;
      inset: 0;
      z-index: calc(var(--cv-z-overlay, 300) + 1);
      display: grid;
      place-items: center;
      gap: var(--cv-space-3);
      background: var(--cv-color-overlay);
      backdrop-filter: blur(8px);
      color: var(--cv-color-text);
      font-family: var(--cv-font-family-body, sans-serif);
      font-size: var(--cv-font-size-sm);
      font-weight: var(--cv-font-weight-medium);
      line-height: 1.4;
    }

    .module-access-state {
      min-block-size: 100%;
      display: grid;
      place-content: center;
      justify-items: center;
      gap: var(--cv-space-3);
      padding: var(--cv-space-6);
      text-align: center;
      color: var(--cv-color-text);
    }

    .module-access-state cv-icon {
      font-size: 32px;
      color: var(--cv-color-accent);
    }

    .module-access-state h1 {
      margin: 0;
      font-size: var(--cv-font-size-xl);
      line-height: 1.2;
    }

    .module-access-state p {
      max-inline-size: 42rem;
      margin: 0;
      color: var(--cv-color-text-muted);
      line-height: 1.5;
    }

    .module-access-state__actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: var(--cv-space-2);
    }

    .module-access-state__button {
      min-block-size: 40px;
      padding-inline: var(--cv-space-4);
      border: 0;
      border-radius: var(--cv-radius-md);
      background: var(--cv-color-accent);
      color: var(--cv-color-accent-contrast);
      font: inherit;
      font-weight: var(--cv-font-weight-semibold);
      cursor: pointer;
    }
  `,
]
