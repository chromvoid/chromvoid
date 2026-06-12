import {css, type CSSResult} from 'lit'

export const notificationIndicatorStyles: CSSResult = css`
  .notification-dot,
  .tb-btn.has-badge::after {
    position: absolute;
    inset-block-start: var(--cv-notification-dot-block-start, 4px);
    inset-inline-end: var(--cv-notification-dot-inline-end, 4px);
    inline-size: var(--cv-notification-dot-size, 8px);
    block-size: var(--cv-notification-dot-size, 8px);
    border-radius: var(--cv-notification-dot-radius, 999px);
    background: var(--cv-notification-dot-color, var(--cv-color-accent));
    border: var(--cv-notification-dot-border, 1.5px solid var(--cv-color-surface-2));
    pointer-events: none;
  }

  .tb-btn.has-badge::after {
    content: '';
  }
`
