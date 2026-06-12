import {css} from 'lit'

import {hostLayoutPaintContainStyles, motionPrimitiveStyles} from 'root/shared/ui/shared-styles'

export const otpQuickViewStyles = [
  hostLayoutPaintContainStyles,
  motionPrimitiveStyles,
  css`
    :host {
      display: block;
      block-size: 100%;
      min-inline-size: 0;
      color: var(--cv-color-text);
    }

    .quick-view {
      --pm-otp-quick-view-content-inset: 0px;
      display: grid;
      align-content: start;
      gap: var(--cv-space-3);
      min-block-size: 100%;
      min-inline-size: 0;
    }

    .quick-view[data-layout='desktop'] {
      grid-template-rows: minmax(0, 1fr) auto;
      align-content: stretch;
      block-size: 100%;
      min-block-size: 0;
    }

    .quick-view__content {
      min-block-size: 0;
      min-inline-size: 0;
    }

    .quick-view[data-layout='desktop'] > .quick-view__content {
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
    }

    .quick-view__header {
      display: grid;
      grid-template-columns: 1fr;
      gap: var(--cv-space-2);
      min-inline-size: 0;
    }

    .quick-view__summary-rail {
      inline-size: 100%;
      box-sizing: border-box;
      padding-inline: var(--pm-otp-quick-view-content-inset);
    }

    .clear-filters,
    .open-entry {
      border: 0;
      color: var(--cv-color-text-muted);
      font: inherit;
      font-size: var(--cv-font-size-xs);
      cursor: pointer;
    }

    .clear-filters:focus-visible,
    .open-entry:focus-visible {
      outline: 2px solid var(--cv-color-accent);
      outline-offset: 2px;
    }

    .clear-filters {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--cv-space-1);
      min-block-size: 32px;
      padding: 0 var(--cv-space-3);
      border: 1px solid var(--cv-color-border);
      border-radius: var(--cv-radius-2);
      background: var(--cv-color-surface-2);
    }

    .rows {
      display: grid;
      gap: 6px;
      min-inline-size: 0;
    }

    .row {
      display: grid;
      gap: var(--cv-space-1);
      min-inline-size: 0;
      border: 0;
    }

    .row__meta {
      display: grid;
      align-content: center;
      min-inline-size: 0;
    }

    .open-entry {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--cv-space-2);
      inline-size: 100%;
      min-block-size: 28px;
      min-inline-size: 0;
      padding: 0;
      border: 0;
      border-radius: var(--cv-radius-2);
      background: transparent;
      margin: 0;
      color: var(--cv-color-text);
      cursor: pointer;
      font-size: var(--cv-font-size-sm);
      font-weight: 680;
      line-height: 1.2;
      text-align: start;
    }

    .row__path,
    .row__otp-label {
      min-inline-size: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .row__path {
      color: inherit;
    }

    .row__otp-label {
      justify-self: end;
      color: var(--cv-color-text-muted);
      font-weight: 560;
    }

    .row__otp {
      min-inline-size: 0;
    }

    .row__otp pm-entry-otp-item {
      display: block;
      min-inline-size: 0;
      --hotp-accent-border: var(--cv-color-border-muted);
      --hotp-accent-border-strong: var(--cv-color-border-soft);
      --hotp-accent-color: var(--cv-color-text-muted);
      --hotp-accent-ring: var(--cv-color-primary-ring);
      --hotp-accent-surface: var(--cv-color-surface-highlight);
      --hotp-accent-surface-strong: var(--cv-color-surface-2);
      --hotp-action-border-hover-color: var(--cv-color-primary-border);
      --hotp-action-hover-color: var(--cv-color-text);
      --totp-actions-display: none;
      --totp-arc-stroke-width: 3.6;
      --totp-arc-track-color: var(--cv-color-border-faint);
      --totp-card-background: var(--cv-color-surface-secondary-glass-soft);
      --totp-card-border-color: var(--cv-color-border-muted);
      --totp-card-border-width: 1px;
      --totp-card-hover-shadow: none;
      --totp-card-padding: var(--cv-space-3) var(--cv-space-4);
      --totp-card-shadow: none;
      --totp-card-template-areas: 'main timer';
      --totp-code-font-size: 2.55rem;
      --totp-code-font-size-compact: 2.25rem;
      --totp-code-group-gap: var(--cv-space-3);
      --totp-feedback-color: var(--cv-color-text-muted);
      --totp-focus-color: var(--cv-color-primary-border-strong);
      --totp-label-display: none;
      --totp-timer-seconds-font-size: 1.65rem;
      --totp-timer-size: 72px;
      --totp-timer-size-compact: 66px;
      --totp-timer-unit-font-size: 0.68rem;
      --hotp-action-size: 32px;
      --hotp-badge-background: var(--cv-color-surface-highlight);
      --hotp-badge-border-color: var(--cv-color-border-muted);
      --hotp-badge-color: var(--cv-color-text-muted);
      --hotp-card-background: var(--cv-color-surface-secondary-glass-soft);
      --hotp-card-border-color: var(--cv-color-border-muted);
      --hotp-card-border-focus-color: var(--cv-color-primary-border);
      --hotp-card-border-hover-color: var(--cv-color-border-soft);
      --hotp-card-gap: var(--cv-space-2);
      --hotp-card-padding: var(--cv-space-2);
      --hotp-card-radius: var(--cv-radius-3);
      --hotp-card-focus-ring: var(--cv-color-primary-ring);
      --hotp-code-background: var(--cv-color-surface-highlight);
      --hotp-code-border-color: var(--cv-color-border-muted);
      --hotp-code-border-hover-color: var(--cv-color-border-soft);
      --hotp-code-color: var(--cv-color-text);
      --hotp-code-font-size: calc(var(--cv-font-size-base) * 1.05);
      --hotp-code-hidden-background: var(--cv-color-surface-highlight);
      --hotp-code-hidden-color: var(--cv-color-text-muted);
      --hotp-code-padding: 7px 8px;
      --hotp-counter-background: var(--cv-color-surface-highlight);
      --hotp-counter-border-color: var(--cv-color-border-muted);
      --hotp-counter-width: 78px;
      --hotp-generate-background: var(--cv-color-surface-2);
      --hotp-generate-border-color: var(--cv-color-border-muted);
      --hotp-generate-color: var(--cv-color-text);
      --hotp-generate-hover-background: var(--cv-color-surface-3);
      --hotp-generate-hover-border-color: var(--cv-color-border-soft);
      --hotp-generate-hover-color: var(--cv-color-text);
      --hotp-generate-padding-inline: var(--cv-space-2);
      --hotp-label-display: none;
    }

    .open-entry:hover {
      color: var(--cv-color-accent);
    }

  `,
]
