import {css} from 'lit'

import {sharedStyles} from 'root/shared/ui/shared-styles'

export const appRouteStyles = [
  sharedStyles,
  css`
    :host {
      height: 100%;
      display: block;
      background: var(--cv-color-bg);
      color: var(--cv-color-text);
      overflow-y: auto;
    }

    :host-context(html:not([data-mobile-keyboard-expanded]):not([data-visual-viewport-shrunken])) {
      height: calc(100% + var(--visual-viewport-bottom-inset, 0px));
    }

    password-manager {
      display: grid;
      grid-template-rows: auto;
    }

    desktop-shell-toolbar.passwords-desktop-toolbar {
      --desktop-shell-toolbar-padding-block: var(--app-toolbar-padding-block);
      --desktop-shell-toolbar-padding-inline: var(--app-toolbar-padding-inline);
      --desktop-shell-toolbar-padding-inline-wide: var(--app-toolbar-padding-inline-wide);
      --desktop-shell-toolbar-two-row-row-gap: var(--app-toolbar-two-row-row-gap);
      --desktop-shell-toolbar-two-row-column-gap: var(--app-toolbar-two-row-column-gap);
      --desktop-shell-toolbar-border-color: var(--app-toolbar-border-color);
      --pm-toolbar-control-height: var(--app-toolbar-control-height);
      --pm-toolbar-control-radius: var(--app-toolbar-control-radius);
      --pm-toolbar-control-padding-inline: var(--app-toolbar-control-padding-inline);
      --pm-toolbar-control-font-size: var(--app-toolbar-control-font-size);
      --pm-toolbar-control-font-weight: var(--app-toolbar-control-font-weight);
      --pm-toolbar-control-gap: var(--app-toolbar-control-gap);
    }

    desktop-shell-toolbar.passwords-desktop-toolbar .toolbar-side {
      display: flex;
      align-items: center;
      gap: var(--pm-toolbar-control-gap);
      min-inline-size: 0;
      min-width: 0;
      flex-wrap: nowrap;
    }

    desktop-shell-toolbar.passwords-desktop-toolbar .toolbar-side-end {
      margin-inline-start: auto;
      justify-content: flex-end;
      overflow: visible;
    }

    desktop-shell-toolbar.passwords-desktop-toolbar .toolbar-primary-row {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: var(--desktop-shell-toolbar-two-row-column-gap);
      inline-size: 100%;
      min-inline-size: 0;
    }

    desktop-shell-toolbar.passwords-desktop-toolbar
      cv-guidance-anchor[anchor-id='passwords.create-entry'] {
      display: block;
      min-inline-size: 0;
    }

    desktop-shell-toolbar.passwords-desktop-toolbar .toolbar-create-actions {
      display: inline-flex;
      align-items: center;
      gap: var(--pm-toolbar-control-gap);
      min-inline-size: 0;
    }

    desktop-shell-toolbar.passwords-desktop-toolbar .toolbar-controls-row {
      display: flex;
      flex-wrap: nowrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--desktop-shell-toolbar-two-row-column-gap);
      inline-size: 100%;
      min-inline-size: 0;
    }

    desktop-shell-toolbar.passwords-desktop-toolbar .toolbar-search {
      inline-size: 100%;
      min-inline-size: 0;
    }

    desktop-shell-toolbar.passwords-desktop-toolbar .toolbar-password-search {
      flex: 1 1 auto;
      min-inline-size: 220px;
      max-block-size: min(52vh, 320px);
    }

    desktop-shell-toolbar.passwords-desktop-toolbar .toolbar-otp-search {
      inline-size: min(100%, 720px);
      margin-inline-start: auto;
    }

    desktop-shell-toolbar.passwords-desktop-toolbar .toolbar-quick-filters {
      flex: 0 0 400px;
      inline-size: 400px;
      min-inline-size: 360px;
      padding-block-start: 1px;
    }

    desktop-shell-toolbar.passwords-desktop-toolbar .toolbar-sort-controls {
      flex: 0 0 500px;
      inline-size: min(500px, 48%);
      min-inline-size: 460px;
      padding-block-start: 1px;
    }

    desktop-shell-toolbar.passwords-desktop-toolbar .toolbar-button {
      --cv-button-min-height: var(--pm-toolbar-control-height);
      --cv-button-border-radius: var(--pm-toolbar-control-radius);
      --cv-button-padding-block: 0;
      --cv-button-padding-inline: var(--pm-toolbar-control-padding-inline);
      --cv-button-font-size: var(--pm-toolbar-control-font-size);
      --cv-button-font-weight: var(--pm-toolbar-control-font-weight);
      --cv-button-gap: var(--pm-toolbar-control-gap);
      flex-shrink: 0;
    }

    desktop-shell-toolbar.passwords-desktop-toolbar .toolbar-actions-menu {
      --cv-menu-button-min-height: var(--pm-toolbar-control-height);
      --cv-menu-button-border-radius: var(--pm-toolbar-control-radius);
      --cv-menu-button-menu-align: end;
      --cv-menu-button-menu-min-inline-size: 240px;
      --cv-menu-button-menu-offset: var(--app-spacing-2);
      --cv-menu-button-menu-z-index: var(--cv-z-overlay, 300);
      flex: 0 0 auto;
    }

    desktop-shell-toolbar.passwords-desktop-toolbar .toolbar-actions-menu::part(trigger) {
      align-items: center;
      block-size: var(--pm-toolbar-control-height);
      min-inline-size: var(--pm-toolbar-control-height);
    }

    desktop-shell-toolbar.passwords-desktop-toolbar .toolbar-actions-menu::part(label),
    desktop-shell-toolbar.passwords-desktop-toolbar .toolbar-actions-menu::part(dropdown-icon) {
      display: none;
    }

    desktop-shell-toolbar.passwords-desktop-toolbar .toolbar-actions-trigger {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    desktop-shell-toolbar.passwords-desktop-toolbar .toolbar-actions-trigger cv-icon {
      inline-size: 15px;
      block-size: 15px;
    }

    desktop-shell-toolbar.passwords-desktop-toolbar .toolbar-menu-item[data-danger='true'] {
      --cv-color-text: var(--cv-color-danger, var(--cv-color-text));
    }

    @container (width < 1024px) {
      desktop-shell-toolbar.passwords-desktop-toolbar .toolbar-side {
        gap: var(--pm-toolbar-control-gap);
      }

      desktop-shell-toolbar.passwords-desktop-toolbar .toolbar-quick-filters {
        flex-basis: 240px;
        min-inline-size: 200px;
      }

      desktop-shell-toolbar.passwords-desktop-toolbar .toolbar-sort-controls {
        flex-basis: 460px;
        inline-size: min(460px, 56%);
        min-inline-size: 420px;
      }

    }

    @container (width < 760px) {
      desktop-shell-toolbar.passwords-desktop-toolbar .toolbar-primary-row,
      desktop-shell-toolbar.passwords-desktop-toolbar .toolbar-controls-row {
        display: flex;
        flex-wrap: wrap;
        justify-content: stretch;
      }

      desktop-shell-toolbar.passwords-desktop-toolbar .toolbar-password-search,
      desktop-shell-toolbar.passwords-desktop-toolbar .toolbar-quick-filters,
      desktop-shell-toolbar.passwords-desktop-toolbar .toolbar-sort-controls {
        flex: 1 1 100%;
        inline-size: 100%;
        min-inline-size: 0;
      }

      desktop-shell-toolbar.passwords-desktop-toolbar .toolbar-button::part(label) {
        display: none;
      }

      desktop-shell-toolbar.passwords-desktop-toolbar .toolbar-actions-menu {
        --cv-menu-button-menu-min-inline-size: 220px;
      }
    }

    @container (width < 660px) {
      desktop-shell-toolbar.passwords-desktop-toolbar .toolbar-side {
        gap: var(--app-spacing-2);
      }
    }

    no-license {
      text-align: center;
    }

    .route-content {
      block-size: 100%;
      min-block-size: 0;
      view-transition-name: route-content;
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
      color: var(--text-primary, var(--cv-color-text));
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

    .pro-access-state {
      min-block-size: 100%;
      display: grid;
      place-content: center;
      justify-items: center;
      gap: var(--cv-space-3);
      padding: var(--cv-space-6);
      text-align: center;
      color: var(--cv-color-text);
    }

    .pro-access-state cv-icon {
      font-size: 32px;
      color: var(--cv-color-accent);
    }

    .pro-access-state h1 {
      margin: 0;
      font-size: var(--cv-font-size-xl);
      line-height: 1.2;
    }

    .pro-access-state p {
      max-inline-size: 42rem;
      margin: 0;
      color: var(--cv-color-text-muted);
      line-height: 1.5;
    }

    .pro-access-state__actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: var(--cv-space-2);
    }

    .pro-access-state__button {
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

    .pro-access-state__button--secondary {
      background: var(--cv-color-surface-2);
      color: var(--cv-color-text);
      box-shadow: inset 0 0 0 1px var(--cv-color-border);
    }
  `,
]
