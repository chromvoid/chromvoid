import {css} from 'lit'

import {
  functionalMotionStyles,
  hostLayoutPaintContainStyles,
  motionPrimitiveStyles,
  pulseIndicatorStyles,
} from 'root/shared/ui/shared-styles'

const ARC_RADIUS = 17.5
const ARC_CIRCUMFERENCE = 2 * Math.PI * ARC_RADIUS

export const pmEntryTOTPItemSharedStyles = [
  hostLayoutPaintContainStyles,
  motionPrimitiveStyles,
  functionalMotionStyles,
  pulseIndicatorStyles,
  css`
    :host {
      position: relative;
      display: block;
      container-type: inline-size;
      --totp-color: var(--cv-color-success);
      --totp-color-soft: var(--cv-color-success-surface-strong);
      --arc-offset: 0;
      --pm-otp-action-size: 32px;
    }

    .totp-card {
      display: grid;
      grid-template-columns: minmax(0, 1fr) var(--totp-timer-size, 72px);
      grid-template-areas: var(--totp-card-template-areas, 'main timer' 'main actions');
      gap: var(--cv-space-3) var(--cv-space-4);
      align-items: center;
      padding: var(--totp-card-padding, var(--cv-space-4));
      font-family: var(--cv-font-family-sans, sans-serif);
      position: relative;
      overflow: hidden;
      min-inline-size: 0;
      border: var(--totp-card-border-width, 1px) solid
        var(--totp-card-border-color, var(--totp-color, var(--cv-color-success)));
      border-radius: var(--cv-radius-3);
      background: var(--totp-card-background, var(--cv-color-surface-2));
      box-shadow: var(--totp-card-shadow, var(--cv-shadow-sm));
      cursor: pointer;
      user-select: none;
      transition:
        border-color 0.2s ease,
        background 0.2s ease,
        box-shadow 0.2s ease,
        transform 0.2s ease;
    }

    .totp-card:hover {
      background: var(--totp-card-background, var(--cv-color-surface-2));
      box-shadow: var(--totp-card-hover-shadow, var(--cv-shadow-md));
    }

    .totp-card:active {
      transform: translateY(1px);
    }

    .totp-card:focus-visible {
      outline: 2px solid var(--totp-focus-color, var(--totp-accent-color, var(--totp-color, var(--cv-color-success))));
      outline-offset: 2px;
    }

    .totp-main {
      grid-area: main;
      display: flex;
      flex-direction: column;
      gap: var(--cv-space-1);
      min-inline-size: 0;
    }

    .totp-label {
      display: var(--totp-label-display, block);
      font-size: 0.6875rem;
      font-weight: var(--cv-font-weight-semibold);
      color: var(--totp-label-color, var(--cv-color-text-muted));
      min-inline-size: 0;
      text-overflow: ellipsis;
      overflow: hidden;
      white-space: nowrap;
      letter-spacing: 0;
      text-transform: none;
    }

    .totp-code {
      display: flex;
      align-items: center;
      gap: var(--totp-code-group-gap, var(--cv-space-5));
      min-inline-size: 0;
      font-family: var(--cv-font-family-code, monospace);
      font-variant-numeric: tabular-nums;
      color: var(--totp-code-color, var(--cv-color-text));
    }

    .totp-code-placeholder {
      font-family: var(--cv-font-family-sans, sans-serif);
      font-size: var(--cv-font-size-sm);
      color: var(--cv-color-text-muted);
    }

    .totp-digit-group {
      display: inline-flex;
      gap: 0.06em;
      min-inline-size: 0;
    }

    .totp-digit {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-inline-size: 1.08ch;
      font-size: var(--totp-code-font-size, 3.25rem);
      line-height: 1;
      font-weight: var(--cv-font-weight-semibold);
    }

    .totp-feedback {
      margin-block-start: var(--cv-space-1);
      font-size: var(--cv-font-size-sm);
      font-weight: var(--cv-font-weight-semibold);
      color: var(--totp-feedback-color, var(--totp-accent-color, var(--totp-color, var(--cv-color-success))));
    }

    .totp-arc-timer {
      grid-area: timer;
      position: relative;
      width: var(--totp-timer-size, 72px);
      height: var(--totp-timer-size, 72px);
      flex-shrink: 0;
      align-self: var(--totp-timer-align-self, center);
      justify-self: center;

      svg {
        width: 100%;
        height: 100%;
      }

      .arc-track {
        fill: none;
        stroke: var(--totp-arc-track-color, var(--cv-color-border-muted));
        stroke-width: var(--totp-arc-stroke-width, 3.25);
      }

      .arc-indicator {
        fill: none;
        stroke: var(--totp-accent-color, var(--totp-color, var(--cv-color-success)));
        stroke-width: var(--totp-arc-stroke-width, 3.25);
        stroke-linecap: round;
        stroke-dasharray: ${ARC_CIRCUMFERENCE};
        stroke-dashoffset: var(--arc-offset, 0);
        transform: rotate(-90deg);
        transform-origin: center;
        transition: stroke-dashoffset 1s linear;
      }

      .arc-value {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        font-weight: var(--cv-font-weight-bold);
        font-variant-numeric: tabular-nums;
        color: var(--totp-accent-color, var(--totp-color, var(--cv-color-success)));
      }

      .arc-seconds {
        font-size: var(--totp-timer-seconds-font-size, 1.35rem);
        line-height: 1;
      }

      .arc-unit {
        margin-block-start: 2px;
        font-size: var(--totp-timer-unit-font-size, 0.625rem);
        line-height: 1;
        color: var(--cv-color-text-muted);
      }
    }

    .totp-actions {
      grid-area: actions;
      display: var(--totp-actions-display, flex);
      gap: var(--cv-space-1);
      justify-content: flex-end;
      align-items: center;

      slot[name='otp-action'] {
        display: flex;
        flex: 0 0 auto;
        align-items: center;
        justify-content: center;
      }

      ::slotted([slot='otp-action']) {
        flex-shrink: 0;
      }
    }

    @container (width < 400px) {
      .totp-card {
        grid-template-columns: minmax(0, 1fr) var(--totp-timer-size-compact, 66px);
        grid-template-areas: var(--totp-card-template-areas-compact, var(--totp-card-template-areas, 'main timer' 'main actions'));
        column-gap: var(--cv-space-3);
        padding: var(--totp-card-padding, var(--cv-space-3));
      }

      .totp-code {
        gap: var(--cv-space-3);
      }

      .totp-digit {
        font-size: var(--totp-code-font-size-compact, 2.85rem);
      }

      .totp-arc-timer {
        width: var(--totp-timer-size-compact, 66px);
        height: var(--totp-timer-size-compact, 66px);
      }

      .totp-arc-timer .arc-seconds {
        font-size: 1.2rem;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .totp-card,
      .arc-indicator {
        transition: none;
      }
    }

  `,
]
