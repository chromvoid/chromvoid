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

    .quick-view__header {
      display: grid;
      grid-template-columns: 1fr;
      gap: var(--cv-space-2);
      min-inline-size: 0;
    }

    .controls {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 6px;
      inline-size: 100%;
      min-inline-size: 0;
      box-sizing: border-box;
      padding-inline: var(--pm-otp-quick-view-content-inset);
    }

    .quick-view__summary-rail {
      inline-size: 100%;
      box-sizing: border-box;
      padding-inline: var(--pm-otp-quick-view-content-inset);
      --pm-summary-rail-inline-size: 100%;
    }

    cv-input.search {
      flex: 1 1 auto;
      inline-size: 100%;
      max-inline-size: none;
      min-inline-size: 0;
      --cv-input-height: 32px;
      --cv-input-padding-inline: var(--cv-space-3);
      --cv-input-border-radius: var(--cv-radius-2);
      --cv-input-background: var(--cv-color-surface-2);
      --cv-input-border-color: var(--cv-color-border);
      --cv-input-color: var(--cv-color-text);
      --cv-input-font-size: var(--cv-font-size-sm);
      --cv-input-focus-ring: 0 0 0 2px var(--cv-color-accent-ring);
    }

    cv-input.search[focused] {
      --cv-input-border-color: var(--cv-color-accent);
    }

    .search__prefix-icon {
      color: var(--cv-color-text-muted);
      transition:
        color var(--cv-duration-fast) var(--cv-easing-standard),
        transform var(--cv-duration-fast) var(--cv-easing-standard);
    }

    cv-input.search[focused] .search__prefix-icon {
      color: var(--cv-color-accent);
      transform: scale(1.08);
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

    .clear-filters--compact {
      flex: 0 0 auto;
      inline-size: 32px;
      padding: 0;
    }

    .rows {
      display: grid;
      gap: 6px;
      min-inline-size: 0;
    }

    .row {
      display: grid;
      min-inline-size: 0;
      border: 0;
      border-radius: var(--cv-radius-2);
      background: var(--cv-color-surface-secondary-glass-soft);
    }

    .row__meta {
      display: grid;
      align-content: center;
      gap: 5px;
      min-inline-size: 0;
    }

    .row__heading {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 6px;
      min-inline-size: 0;
    }

    .row__title {
      display: flex;
      align-items: baseline;
      gap: 5px;
      min-inline-size: 0;
      margin: 0;
      color: var(--cv-color-text);
      font-size: var(--cv-font-size-sm);
      font-weight: 680;
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
    }

    .row__entry-title,
    .row__otp-label {
      min-inline-size: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .row__entry-title {
      flex: 0 1 auto;
    }

    .row__otp-label {
      flex: 1 2 auto;
      color: var(--cv-color-text-muted);
      font-weight: 560;
    }

    .row__separator {
      flex: 0 0 auto;
      color: var(--cv-color-text-subtle);
    }

    .row__details {
      display: flex;
      flex-wrap: nowrap;
      align-items: center;
      gap: 6px;
      min-inline-size: 0;
      overflow: hidden;
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-xs);
      line-height: 1.2;
      white-space: nowrap;
    }

    .row__type {
      flex: 0 0 auto;
      padding: 1px 5px;
      border: 0;
      border-radius: var(--cv-radius-1);
      background: var(--cv-color-surface-3);
      color: var(--cv-color-text);
      font-family: var(--cv-font-family-code);
      font-size: 9px;
      font-weight: 700;
      line-height: 1.2;
      letter-spacing: 0.08em;
    }

    .row__detail {
      flex: 0 1 auto;
      min-inline-size: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .row__otp {
      min-inline-size: 0;
    }

    .row__otp pm-entry-otp-item {
      display: block;
      min-inline-size: 0;
      --totp-actions-display: none;
      --totp-arc-stroke-width: 3.6;
      --totp-card-background: var(--cv-color-surface-2);
      --totp-card-border-width: 0;
      --totp-card-hover-shadow: none;
      --totp-card-padding: var(--cv-space-3) var(--cv-space-4);
      --totp-card-shadow: none;
      --totp-card-template-areas: 'main timer';
      --totp-code-font-size: 2.55rem;
      --totp-code-font-size-compact: 2.25rem;
      --totp-code-group-gap: var(--cv-space-3);
      --totp-label-display: none;
      --totp-timer-seconds-font-size: 1.65rem;
      --totp-timer-size: 72px;
      --totp-timer-size-compact: 66px;
      --totp-timer-unit-font-size: 0.68rem;
      --hotp-action-size: 32px;
      --hotp-card-gap: var(--cv-space-2);
      --hotp-card-padding: var(--cv-space-2);
      --hotp-code-font-size: calc(var(--cv-font-size-base) * 1.05);
      --hotp-code-padding: 7px 8px;
      --hotp-counter-width: 78px;
      --hotp-generate-padding-inline: var(--cv-space-2);
      --hotp-label-display: none;
    }

    .open-entry {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--cv-space-1);
      justify-self: end;
      inline-size: 28px;
      block-size: 28px;
      padding: 0;
      border: 0;
      border-radius: var(--cv-radius-2);
      background: transparent;
      color: var(--cv-color-text-muted);
    }

    .open-entry:hover {
      background: var(--cv-color-surface-2);
      color: var(--cv-color-text);
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    @container (width < 720px) {
      .controls {
        justify-content: stretch;
      }
    }
  `,
]
