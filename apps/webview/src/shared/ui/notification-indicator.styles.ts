import {css, type CSSResult} from 'lit'

export const notificationIndicatorStyles: CSSResult = css`
  .notification-dot,
  .tb-btn.has-badge::after {
    position: absolute;
    inset-block-start: var(--app-notification-dot-block-start, 4px);
    inset-inline-end: var(--app-notification-dot-inline-end, 4px);
    inline-size: var(--app-notification-dot-size, 8px);
    block-size: var(--app-notification-dot-size, 8px);
    border-radius: var(--app-notification-dot-radius, 999px);
    background: var(--cv-color-accent);
    border: var(--app-notification-dot-border, 1.5px solid var(--cv-color-surface-2));
    pointer-events: none;
  }

  .tb-btn.has-badge::after {
    content: '';
  }
`
