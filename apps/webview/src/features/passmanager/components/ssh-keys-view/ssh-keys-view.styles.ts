import {css} from 'lit'

import {hostLayoutPaintContainStyles} from 'root/shared/ui/shared-styles'

export const sshKeysViewStyles = [
  hostLayoutPaintContainStyles,
  css`
    :host {
      display: block;
      block-size: 100%;
      min-inline-size: 0;
      color: var(--cv-color-text);
      container-type: inline-size;
    }

    .ssh-view {
      display: grid;
      align-content: start;
      gap: var(--cv-space-4);
      min-block-size: 100%;
      min-inline-size: 0;
    }

    .ssh-view[data-layout='desktop'] {
      grid-template-rows: auto auto minmax(0, 1fr) auto;
      align-content: stretch;
      block-size: 100%;
      min-block-size: 0;
    }

    .ssh-view__header {
      display: grid;
      align-items: center;
      min-inline-size: 0;
      padding: var(--cv-space-5);
      border: 1px solid var(--cv-color-border-muted);
      border-radius: var(--cv-radius-4);
      background: var(--cv-color-surface-2);
    }

    .ssh-view__identity {
      display: flex;
      align-items: center;
      gap: var(--cv-space-3);
      min-inline-size: 0;
    }

    .ssh-view__identity-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
      inline-size: 48px;
      block-size: 48px;
      border: 1px solid var(--cv-color-primary-border);
      border-radius: var(--cv-radius-3);
      background: var(--cv-color-primary-surface);
      color: var(--cv-color-primary);
    }

    .ssh-view__identity-icon cv-icon {
      inline-size: 24px;
      block-size: 24px;
    }

    .ssh-view__identity-copy {
      display: grid;
      gap: var(--cv-space-1);
      min-inline-size: 0;
    }

    .ssh-view__identity-copy h1,
    .ssh-view__identity-copy p,
    .ssh-view__create-description {
      margin: 0;
    }

    .ssh-view__identity-copy h1 {
      color: var(--cv-color-text-strongest);
      font-size: var(--cv-font-size-xl);
      line-height: 1.15;
    }

    .ssh-view__identity-copy p {
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-sm);
      line-height: 1.45;
    }

    .ssh-view__controls,
    .ssh-view__summary-rail {
      display: block;
      inline-size: 100%;
      min-inline-size: 0;
    }

    .ssh-view__workspace {
      display: grid;
      min-block-size: 0;
      min-inline-size: 0;
      gap: var(--cv-space-4);
    }

    .ssh-view[data-layout='desktop'] > .ssh-view__workspace {
      overflow-x: hidden;
      overflow-y: auto;
      overscroll-behavior-y: contain;
      -webkit-overflow-scrolling: touch;
    }

    .ssh-view[data-create-open='true'] .ssh-view__workspace {
      grid-template-columns: minmax(320px, 380px) minmax(0, 1fr);
      align-items: start;
    }

    .ssh-view__create {
      display: grid;
      gap: var(--cv-space-3);
      padding: var(--cv-space-4);
      border: 1px solid var(--cv-color-primary-border);
      border-radius: var(--cv-radius-4);
      background: var(--cv-color-surface-2);
      contain: layout paint;
    }

    .ssh-view__create-head,
    .ssh-view__create-actions,
    .ssh-row__source {
      display: flex;
      align-items: center;
      gap: var(--cv-space-2);
    }

    .ssh-view__create-head {
      justify-content: space-between;
    }

    .ssh-view__create-title {
      margin: 0;
      color: var(--cv-color-text-strongest);
      font-size: var(--cv-font-size-lg);
      line-height: 1.2;
    }

    .ssh-view__create-description {
      margin-block-start: var(--cv-space-1);
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-sm);
      line-height: 1.35;
    }

    .ssh-view__create-close::part(base) {
      min-inline-size: 40px;
      min-block-size: 40px;
      border-radius: var(--cv-radius-2);
    }

    .ssh-view__create-actions {
      justify-content: flex-end;
    }

    .ssh-view__inventory {
      min-block-size: 180px;
      min-inline-size: 0;
      overflow: hidden;
      border: 1px solid var(--cv-color-border-muted);
      border-radius: var(--cv-radius-4);
      background: var(--cv-color-surface);
      contain: layout paint;
    }

    .ssh-view__rows {
      display: grid;
      min-inline-size: 0;
    }

    .ssh-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, auto);
      align-items: center;
      gap: var(--cv-space-4);
      min-inline-size: 0;
      min-block-size: 88px;
      padding: var(--cv-space-4) var(--cv-space-5);
      contain: content;
      transition: background-color var(--cv-duration-fast) var(--cv-easing-standard);
    }

    .ssh-row + .ssh-row {
      border-block-start: 1px solid var(--cv-color-border-muted);
    }

    .ssh-row:hover {
      background: var(--cv-color-primary-surface);
    }

    .ssh-row__source {
      min-inline-size: 0;
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-xs);
    }

    .ssh-row__source button {
      overflow: hidden;
      min-inline-size: 0;
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--cv-color-accent);
      font: inherit;
      text-overflow: ellipsis;
      white-space: nowrap;
      cursor: pointer;
    }

    .ssh-row__source > span {
      white-space: nowrap;
    }

    .ssh-row__source cv-icon {
      flex: 0 0 auto;
      inline-size: 14px;
      block-size: 14px;
    }

    .ssh-row__source button:focus-visible {
      outline: 2px solid var(--cv-color-accent);
      outline-offset: 2px;
    }

    .ssh-row pm-entry-ssh-key {
      min-inline-size: 0;
    }

    .ssh-view__inventory cv-empty-state {
      min-block-size: 280px;
    }

    .clear-filters {
      display: inline-flex;
      align-items: center;
      gap: var(--cv-space-1);
      min-block-size: 32px;
      padding-inline: var(--cv-space-3);
      border: 1px solid var(--cv-color-border);
      border-radius: var(--cv-radius-2);
      background: var(--cv-color-surface-2);
      color: var(--cv-color-text);
      font: inherit;
      cursor: pointer;
    }

    .clear-filters:focus-visible {
      outline: 2px solid var(--cv-color-accent);
      outline-offset: 2px;
    }

    @container (width < 920px) {
      .ssh-view[data-create-open='true'] .ssh-view__workspace {
        grid-template-columns: minmax(0, 1fr);
      }
    }

    @container (width < 680px) {
      .ssh-view {
        gap: var(--cv-space-3);
      }

      .ssh-view__header {
        padding: var(--cv-space-4);
      }

      .ssh-view__identity-icon {
        inline-size: 44px;
        block-size: 44px;
      }

      .ssh-view__identity-copy h1 {
        font-size: var(--cv-font-size-lg);
      }

      .ssh-view__create {
        padding: var(--cv-space-4);
      }

      .ssh-row {
        grid-template-columns: minmax(0, 1fr);
        gap: var(--cv-space-3);
        min-block-size: 0;
        padding: var(--cv-space-4);
      }

      .ssh-row__source {
        padding-block-start: var(--cv-space-3);
        border-block-start: 1px solid var(--cv-color-border-muted);
      }
    }

    @container (width < 380px) {
      .ssh-view__create-actions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .ssh-view__create-actions cv-button::part(base) {
        inline-size: 100%;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .ssh-row {
        transition-duration: 0ms;
      }
    }
  `,
]
