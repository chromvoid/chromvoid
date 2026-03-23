import {css} from 'lit'

import {
  hostLayoutPaintContainStyles,
  motionPrimitiveStyles,
  pulseIndicatorStyles,
} from 'root/shared/ui/shared-styles'

const ARC_RADIUS = 16
const ARC_CIRCUMFERENCE = 2 * Math.PI * ARC_RADIUS

export const pmEntryTOTPItemSharedStyles = [
  hostLayoutPaintContainStyles,
  motionPrimitiveStyles,
  pulseIndicatorStyles,
  css`
    :host {
      position: relative;
      display: block;
    }

    .totp-card {
      display: grid;
      gap: calc(var(--cv-space-2) * 0.75);
      padding: 8px;
      background: var(--cv-color-surface);
      border: 1px solid color-mix(in oklch, var(--cv-color-border) 85%, transparent);
      border-radius: var(--cv-radius-2);
      font-family: var(--cv-font-family-sans, sans-serif);
      position: relative;
      overflow: hidden;
      min-inline-size: 0;
    }

    .totp-header {
      display: flex;
      align-items: center;
      gap: var(--cv-space-2);
      min-inline-size: 0;
    }

    .totp-card:hover,
    .totp-card:focus-within {
      border-color: color-mix(
        in oklch,
        var(--totp-color, var(--cv-color-primary)) 45%,
        var(--cv-color-border)
      );
      box-shadow: 0 2px 10px color-mix(in oklch, var(--totp-color, var(--cv-color-primary)) 16%, transparent);
    }

    .totp-label {
      display: inline-flex;
      align-items: center;
      gap: calc(var(--cv-space-2) * 0.75);
      font-size: 11px;
      font-weight: var(--cv-font-weight-semibold);
      color: var(--cv-color-text);
      min-inline-size: 0;
      text-overflow: ellipsis;
      overflow: hidden;
      white-space: nowrap;
      flex: 1;
      letter-spacing: 0.06em;
      text-transform: uppercase;

      cv-icon {
        font-size: 12px;
        opacity: 0.7;
      }
    }

    .totp-label-text {
      min-inline-size: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .totp-arc-timer {
      position: relative;
      width: 32px;
      height: 32px;
      flex-shrink: 0;

      svg {
        width: 100%;
        height: 100%;
      }

      .arc-track {
        fill: none;
        stroke: color-mix(in oklch, var(--cv-color-border) 75%, transparent);
        stroke-width: 3;
      }

      .arc-indicator {
        fill: none;
        stroke: var(--totp-color, var(--cv-color-success));
        stroke-width: 3;
        stroke-linecap: round;
        stroke-dasharray: ${ARC_CIRCUMFERENCE};
        stroke-dashoffset: var(--arc-offset, 0);
        transform: rotate(-90deg);
        transform-origin: center;
        transition: stroke-dashoffset 1s linear;
        filter: drop-shadow(
          0 0 3px color-mix(in oklch, var(--totp-color, var(--cv-color-success)) 50%, transparent)
        );
      }

      .arc-value {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: var(--cv-font-weight-bold);
        font-variant-numeric: tabular-nums;
        color: var(--totp-color, var(--cv-color-success));
      }
    }

    .totp-content {
      display: grid;
      grid-template-columns: 1fr auto auto;
      align-items: center;
      gap: var(--cv-space-3);
      min-inline-size: 0;
    }

    .totp-digits {
      display: flex;
      align-items: center;
      gap: 8px;
      min-inline-size: 0;
      cursor: pointer;
      user-select: none;
      padding: 2px 4px;
      border-radius: var(--cv-radius-2);
      transition: background 0.2s ease;

      &:hover .totp-digit {
        border-color: color-mix(
          in oklch,
          var(--totp-color, var(--cv-color-success)) 45%,
          var(--cv-color-border)
        );
      }

      &[data-hidden] .totp-digit {
        background: color-mix(in oklch, var(--cv-color-text) 8%, var(--cv-color-surface-2));
        color: var(--cv-color-text-muted);
        border-color: color-mix(in oklch, var(--cv-color-border) 80%, transparent);
        position: relative;
        overflow: hidden;
      }

      &[data-hidden] .totp-digit::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(
          90deg,
          transparent 0%,
          color-mix(in oklch, var(--cv-color-text) 6%, transparent) 50%,
          transparent 100%
        );
        background-size: 200% 100%;
        animation: digitShimmer 2s ease-in-out infinite;
      }

      &:not([data-hidden]) .totp-digit {
        color: var(--totp-color, var(--cv-color-success));
        background: color-mix(
          in oklch,
          var(--totp-color-soft, var(--cv-color-surface-2)) 24%,
          var(--cv-color-surface-2)
        );
        border-color: color-mix(in oklch, var(--totp-color, var(--cv-color-success)) 40%, transparent);
      }
    }

    .totp-digit-group {
      display: flex;
      gap: 2px;
      min-inline-size: 0;
    }

    .totp-digit {
      min-width: 28px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: var(--cv-font-family-code, monospace);
      font-weight: var(--cv-font-weight-bold);
      font-size: calc(var(--cv-font-size-base) * 1.05);
      background: var(--cv-color-surface-2);
      border: 1px solid color-mix(in oklch, var(--cv-color-border) 80%, transparent);
      border-radius: var(--cv-radius-1);
      transition:
        color 0.3s ease,
        background 0.3s ease,
        border-color 0.3s ease;
    }

    .totp-actions {
      display: flex;
      flex-direction: row;
      gap: 4px;
      justify-content: flex-end;
      align-items: center;

      cv-copy-button {
        --cv-copy-button-size: 32px;
        flex-shrink: 0;
      }

      cv-button::part(base) {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        block-size: 32px;
        inline-size: 32px;
        padding: 0;
        min-inline-size: 32px;
        background: transparent;
        border: 1px solid transparent;
        color: var(--cv-color-text-muted);
        border-radius: var(--cv-radius-2);
        transition: all 0.2s ease;
      }

      cv-button:hover::part(base) {
        background: color-mix(in oklch, var(--cv-color-text) 5%, transparent);
        color: var(--cv-color-text);
      }

      cv-icon {
        font-size: 18px;
      }
    }

    @keyframes digitShimmer {
      0% {
        background-position: 200% 0;
      }
      100% {
        background-position: -200% 0;
      }
    }

    @keyframes cardUrgency {
      0%,
      100% {
        box-shadow: 0 0 0 0 transparent;
      }
      50% {
        box-shadow: 0 0 12px color-mix(in oklch, var(--totp-color) 25%, transparent);
      }
    }

    .totp-card[data-urgent] {
      animation: cardUrgency 2s ease-in-out infinite;
    }

    .totp-card[data-urgent] .arc-indicator {
      filter: drop-shadow(0 0 6px var(--totp-color, var(--cv-color-success)));
    }

    @media (prefers-reduced-motion: reduce) {
      .totp-digits[data-hidden] .totp-digit::after,
      .totp-card[data-urgent] {
        animation: none;
      }
    }

  `,
]
