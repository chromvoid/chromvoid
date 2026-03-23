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
      background: color-mix(in oklch, var(--cv-color-surface-2, #1a1a1a) 82%, white 6%);
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
      background: color-mix(in oklch, var(--cv-color-bg) 72%, transparent);
      backdrop-filter: blur(8px);
      color: var(--cv-color-text);
      font: var(--cv-font-body-sm, 500 0.95rem/1.4 var(--cv-font-family-body, sans-serif));
    }
  `,
]
