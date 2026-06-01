import {css} from 'lit'

import {hostLayoutPaintContainStyles, motionPrimitiveStyles} from 'root/shared/ui/shared-styles'

export const pmEntryHOTPItemSharedStyles = [
  hostLayoutPaintContainStyles,
  motionPrimitiveStyles,
  css`
    :host {
      position: relative;
      display: block;
      --pm-otp-action-size: var(--hotp-action-size, 36px);
    }

    @supports (-webkit-touch-callout: none) {
      @media (hover: none) and (pointer: coarse) {
        cv-number::part(input) {
          font-size: 16px;
        }
      }
    }

    .hotp-card {
      display: grid;
      gap: var(--hotp-card-gap, var(--cv-space-3));
      padding: var(--hotp-card-padding, 10px);
      background: var(--cv-color-surface);
      border: 1px solid var(--cv-color-border-strong);
      border-radius: var(--cv-radius-2);
      font-family: var(--cv-font-family-sans, sans-serif);
      position: relative;
      overflow: hidden;
      min-inline-size: 0;
    }

    .hotp-card:hover {
      border-color: var(--pm-otp-warning-border);
    }

    .hotp-card:focus-within {
      border-color: var(--pm-otp-warning-border);
      outline: 2px solid var(--pm-otp-warning-ring);
      outline-offset: -2px;
    }

    .hotp-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--cv-space-2);
    }

    .hotp-label {
      display: var(--hotp-label-display, block);
      font-size: 11px;
      font-weight: var(--cv-font-weight-semibold);
      color: var(--cv-color-text);
      text-overflow: ellipsis;
      overflow: hidden;
      white-space: nowrap;
      flex: 1;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .hotp-badge {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 9px;
      font-weight: var(--cv-font-weight-bold);
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--cv-color-warning);
      background: var(--cv-color-warning-surface);
      padding: 2px 7px;
      border-radius: var(--cv-radius-pill, 999px);
      border: 1px solid var(--cv-color-warning-border);

      cv-icon {
        font-size: 11px;
      }
    }

    .hotp-content {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: var(--cv-space-2);
      align-items: end;
    }

    .hotp-code-section {
      display: grid;
      gap: var(--hotp-card-gap, var(--cv-space-2));
    }

    .hotp-code {
      font-family: var(--cv-font-family-code, monospace);
      font-weight: var(--cv-font-weight-bold);
      font-size: var(--hotp-code-font-size, calc(var(--cv-font-size-base) * 1.2));
      letter-spacing: 0.12em;
      color: var(--cv-color-warning);
      text-align: center;
      padding: var(--hotp-code-padding, 9px 10px);
      background: var(--cv-color-warning-surface);
      border-radius: var(--cv-radius-2);
      border: 1px solid var(--cv-color-warning-border);
      cursor: pointer;
      user-select: none;

      &:hover {
        border-color: var(--cv-color-warning-border-strong);
      }

      &[data-hidden] {
        background: var(--cv-color-surface-highlight);
        color: var(--cv-color-text-muted);
        letter-spacing: 0.1em;
      }
    }

    .hotp-counter-section {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: var(--hotp-card-gap, var(--cv-space-2));
      align-items: center;
    }

    .counter-label {
      font-size: var(--cv-font-size-xs);
      color: var(--cv-color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-weight: var(--cv-font-weight-medium);
    }

    .counter-input-wrapper {
      display: flex;
      gap: calc(var(--cv-space-2) * 0.75);
      align-items: center;

      cv-number {
        inline-size: var(--hotp-counter-width, 100px);

        &::part(base) {
          border-color: var(--cv-color-warning-border);
          background: var(--cv-color-warning-surface);
        }

        &::part(input) {
          font-family: var(--cv-font-family-code, monospace);
          font-weight: var(--cv-font-weight-bold);
          text-align: center;
        }
      }
    }

    .hotp-generate-btn {
      &::part(base) {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: calc(var(--cv-space-2) * 0.75);
        block-size: var(--hotp-action-size, 38px);
        padding-inline: var(--hotp-generate-padding-inline, var(--cv-space-3));
        background: var(--cv-color-warning-surface-strong);
        border: 1px solid var(--cv-color-warning-border-strong);
        color: var(--cv-color-warning);
        font-weight: var(--cv-font-weight-semibold);
        border-radius: var(--cv-radius-2);
      }

      &:hover::part(base) {
        background: var(--cv-color-warning);
        border-color: var(--cv-color-warning);
        color: var(--cv-color-warning-text);
      }

      &:active::part(base) {
        transform: none;
      }

      cv-icon {
        font-size: 18px;
      }
    }

    .hotp-actions {
      display: flex;
      flex-direction: row;
      gap: calc(var(--cv-space-2) * 0.75);
      justify-content: center;
      align-items: center;

      cv-tooltip {
        order: 1;
      }

      cv-button {
        order: 2;
      }

      slot[name='otp-action'] {
        display: flex;
        order: 3;
        flex: 0 0 auto;
        align-items: center;
        justify-content: center;
      }

      ::slotted([slot='otp-action']) {
        flex-shrink: 0;
      }

      cv-tooltip {
        block-size: var(--hotp-action-size, 36px);
      }

      cv-button::part(base) {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        block-size: var(--hotp-action-size, 36px);
        inline-size: var(--hotp-action-size, 36px);
        padding: 0;
        min-inline-size: var(--hotp-action-size, 36px);
        background: var(--cv-color-surface-2);
        border: 1px solid var(--cv-color-border-strong);
        color: var(--cv-color-text);
        border-radius: var(--cv-radius-2);
      }

      cv-button:hover::part(base) {
        border-color: var(--cv-color-warning-border-strong);
        color: var(--cv-color-warning);
      }

      cv-copy-button {
        flex-shrink: 0;
        --cv-copy-button-size: var(--hotp-action-size, 36px);
      }

      cv-icon {
        font-size: 18px;
      }
    }

    @container (width < 400px) {
      :host {
        --pm-otp-action-size: 32px;
      }

      .hotp-card {
        padding: var(--cv-space-2);
        gap: var(--cv-space-2);
      }

      .hotp-content {
        grid-template-columns: 1fr;
      }

      .hotp-code {
        font-size: calc(var(--cv-font-size-base) * 1.125);
        letter-spacing: 0.1em;
      }

      .hotp-actions {
        justify-content: flex-end;

        cv-tooltip {
          block-size: 32px;
        }

        cv-button::part(base) {
          block-size: 32px;
          inline-size: 32px;
          min-inline-size: 32px;
        }
      }

      .hotp-counter-section {
        grid-template-columns: 1fr;
        gap: calc(var(--cv-space-2) * 0.75);
      }

      .counter-input-wrapper {
        justify-content: flex-start;
      }
    }
  `,
]
