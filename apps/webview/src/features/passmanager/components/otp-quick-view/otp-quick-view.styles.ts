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
      padding-inline: 0;
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
      --pm-hotp-accent-border: var(--cv-color-border-muted);
      --pm-hotp-accent-border-strong: var(--cv-color-border-soft);
      --pm-hotp-accent-color: var(--cv-color-text-muted);
      --pm-hotp-accent-ring: var(--cv-color-primary-ring);
      --pm-hotp-accent-surface: var(--cv-color-surface-highlight);
      --pm-hotp-accent-surface-strong: var(--cv-color-surface-2);
      --pm-hotp-action-border-hover-color: var(--cv-color-primary-border);
      --pm-hotp-action-hover-color: var(--cv-color-text);
      --pm-totp-actions-display: none;
      --pm-totp-arc-stroke-width: 3.6;
      --pm-totp-arc-track-color: var(--cv-color-border-faint);
      --pm-totp-card-background: var(--cv-color-surface-secondary-glass-soft);
      --pm-totp-card-border-color: var(--cv-color-border-muted);
      --pm-totp-card-border-width: 1px;
      --pm-totp-card-hover-shadow: none;
      --pm-totp-card-padding: var(--cv-space-3) var(--cv-space-4);
      --pm-totp-card-shadow: none;
      --pm-totp-card-template-areas: 'main timer';
      --pm-totp-code-font-size: 2.55rem;
      --pm-totp-code-font-size-compact: 2.25rem;
      --pm-totp-code-group-gap: var(--cv-space-3);
      --pm-totp-feedback-color: var(--cv-color-text-muted);
      --pm-totp-focus-color: var(--cv-color-primary-border-strong);
      --pm-totp-label-display: none;
      --pm-totp-timer-seconds-font-size: 1.65rem;
      --pm-totp-timer-size: 72px;
      --pm-totp-timer-size-compact: 66px;
      --pm-totp-timer-unit-font-size: 0.68rem;
      --pm-hotp-action-size: 32px;
      --pm-hotp-badge-background: var(--cv-color-surface-highlight);
      --pm-hotp-badge-border-color: var(--cv-color-border-muted);
      --pm-hotp-badge-color: var(--cv-color-text-muted);
      --pm-hotp-card-background: var(--cv-color-surface-secondary-glass-soft);
      --pm-hotp-card-border-color: var(--cv-color-border-muted);
      --pm-hotp-card-border-focus-color: var(--cv-color-primary-border);
      --pm-hotp-card-border-hover-color: var(--cv-color-border-soft);
      --pm-hotp-card-gap: var(--cv-space-2);
      --pm-hotp-card-padding: var(--cv-space-2);
      --pm-hotp-card-radius: var(--cv-radius-3);
      --pm-hotp-card-focus-ring: var(--cv-color-primary-ring);
      --pm-hotp-code-background: var(--cv-color-surface-highlight);
      --pm-hotp-code-border-color: var(--cv-color-border-muted);
      --pm-hotp-code-border-hover-color: var(--cv-color-border-soft);
      --pm-hotp-code-color: var(--cv-color-text);
      --pm-hotp-code-font-size: calc(var(--cv-font-size-base) * 1.05);
      --pm-hotp-code-hidden-background: var(--cv-color-surface-highlight);
      --pm-hotp-code-hidden-color: var(--cv-color-text-muted);
      --pm-hotp-code-padding: 7px 8px;
      --pm-hotp-counter-background: var(--cv-color-surface-highlight);
      --pm-hotp-counter-border-color: var(--cv-color-border-muted);
      --pm-hotp-counter-inline-size: 78px;
      --pm-hotp-generate-background: var(--cv-color-surface-2);
      --pm-hotp-generate-border-color: var(--cv-color-border-muted);
      --pm-hotp-generate-color: var(--cv-color-text);
      --pm-hotp-generate-hover-background: var(--cv-color-surface-3);
      --pm-hotp-generate-hover-border-color: var(--cv-color-border-soft);
      --pm-hotp-generate-hover-color: var(--cv-color-text);
      --pm-hotp-generate-padding-inline: var(--cv-space-2);
      --pm-hotp-label-display: none;
    }

    .open-entry:hover {
      color: var(--cv-color-accent);
    }

  `,
]
