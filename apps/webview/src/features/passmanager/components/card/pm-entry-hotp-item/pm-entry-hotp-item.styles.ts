import {css} from 'lit'

import {hostLayoutPaintContainStyles, motionPrimitiveStyles} from 'root/shared/ui/shared-styles'

export const pmEntryHOTPItemSharedStyles = [
  hostLayoutPaintContainStyles,
  motionPrimitiveStyles,
  css`
    :host {
      position: relative;
      display: block;
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
      gap: var(--cv-space-3);
      padding: 10px;
      background: var(--cv-color-surface);
      border: 1px solid color-mix(in oklch, var(--cv-color-border) 85%, transparent);
      border-radius: var(--cv-radius-2);
      font-family: var(--cv-font-family-sans, sans-serif);
      position: relative;
      overflow: hidden;
      min-inline-size: 0;
    }

    .hotp-card:hover,
    .hotp-card:focus-within {
      border-color: color-mix(in oklch, var(--cv-color-warning, #f59e0b) 42%, var(--cv-color-border));
      box-shadow: 0 2px 10px color-mix(in oklch, var(--cv-color-warning, #f59e0b) 18%, transparent);
    }

    .hotp-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--cv-space-2);
    }

    .hotp-label {
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
      color: var(--cv-color-warning, #f59e0b);
      background: color-mix(in oklch, var(--cv-color-warning, #f59e0b) 14%, transparent);
      padding: 2px 7px;
      border-radius: var(--cv-radius-pill, 999px);
      border: 1px solid color-mix(in oklch, var(--cv-color-warning, #f59e0b) 40%, transparent);

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
      gap: var(--cv-space-2);
    }

    .hotp-code {
      font-family: var(--cv-font-family-code, monospace);
      font-weight: var(--cv-font-weight-bold);
      font-size: calc(var(--cv-font-size-base) * 1.2);
      letter-spacing: 0.12em;
      color: var(--cv-color-warning, #f59e0b);
      text-align: center;
      padding: 9px 10px;
      background: color-mix(in oklch, var(--cv-color-warning, #f59e0b) 8%, var(--cv-color-surface-2));
      border-radius: var(--cv-radius-2);
      border: 1px solid color-mix(in oklch, var(--cv-color-warning, #f59e0b) 38%, transparent);
      cursor: pointer;
      user-select: none;

      &:hover {
        border-color: color-mix(in oklch, var(--cv-color-warning, #f59e0b) 55%, transparent);
      }

      &[data-hidden] {
        background: color-mix(in oklch, var(--cv-color-text) 9%, var(--cv-color-surface-2));
        color: var(--cv-color-text-muted);
        letter-spacing: 0.1em;
      }
    }

    .hotp-counter-section {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: var(--cv-space-2);
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
        inline-size: 100px;

        &::part(base) {
          border-color: color-mix(
            in oklch,
            var(--cv-color-warning, #f59e0b) 36%,
            var(--cv-color-border)
          );
          background: color-mix(
            in oklch,
            var(--cv-color-surface-2) 90%,
            var(--cv-color-warning, #f59e0b) 10%
          );
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
        block-size: 38px;
        padding-inline: var(--cv-space-3);
        background: color-mix(in oklch, var(--cv-color-warning, #f59e0b) 26%, var(--cv-color-surface-2));
        border: 1px solid color-mix(in oklch, var(--cv-color-warning, #f59e0b) 45%, transparent);
        color: var(--cv-color-warning, #f59e0b);
        font-weight: var(--cv-font-weight-semibold);
        border-radius: var(--cv-radius-2);
      }

      &:hover::part(base) {
        background: color-mix(in oklch, var(--cv-color-warning, #f59e0b) 36%, var(--cv-color-surface-2));
        border-color: color-mix(in oklch, var(--cv-color-warning, #f59e0b) 65%, transparent);
        color: color-mix(in oklch, var(--cv-color-warning, #f59e0b) 85%, white);
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
      flex-direction: column;
      gap: calc(var(--cv-space-2) * 0.75);
      justify-content: center;

      cv-tooltip {
        block-size: 36px;
      }

      cv-button::part(base) {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        block-size: 36px;
        inline-size: 36px;
        padding: 0;
        min-inline-size: 36px;
        background: var(--cv-color-surface-2);
        border: 1px solid color-mix(in oklch, var(--cv-color-border) 85%, transparent);
        color: var(--cv-color-text);
        border-radius: var(--cv-radius-2);
      }

      cv-button:hover::part(base) {
        border-color: color-mix(in oklch, var(--cv-color-warning, #f59e0b) 55%, transparent);
        color: var(--cv-color-warning, #f59e0b);
      }

      cv-copy-button {
        flex-shrink: 0;
        --cv-copy-button-size: 36px;
      }

      cv-icon {
        font-size: 18px;
      }
    }

    @container (width < 400px) {
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
        flex-direction: row;
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

export const pmEntryHOTPItemMobileStyles = css`
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
    flex-direction: row;
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
`
