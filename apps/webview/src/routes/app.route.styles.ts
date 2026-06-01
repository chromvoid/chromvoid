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
      height: calc(100dvh - var(--app-padding));
    }

    password-manager {
      display: grid;
      grid-template-rows: auto;
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
