import {css, type CSSResult} from 'lit'

import {notificationIndicatorStyles} from './notification-indicator.styles'

/**
 * Shared toolbar-button styles for mobile action bar.
 *
 * Import into `static styles` of any component that renders
 * `cv-button.tb-btn` or `cv-menu-button.tb-btn` inside a `<mobile-action-bar>`.
 *
 * The `::part()` selectors must live in the same shadow root as the buttons,
 * so these styles belong in the **consumer**, not inside the bar component.
 */
export const mobileActionBarButtonStyles: CSSResult = css`
  ${notificationIndicatorStyles}

  /* ===== Toolbar button base ===== */
  .tb-btn {
    inline-size: var(--app-mobile-action-bar-control-size);
    block-size: var(--app-mobile-action-bar-control-size);
    min-inline-size: var(--app-mobile-action-bar-control-size);
    min-block-size: var(--app-mobile-action-bar-control-size);
    max-inline-size: var(--app-mobile-action-bar-control-size);
    flex-shrink: 0;
  }

  cv-menu-button.tb-btn {
    display: block;
  }

  .tb-btn::part(base) {
    inline-size: var(--app-mobile-action-bar-control-size);
    block-size: var(--app-mobile-action-bar-control-size);
    min-inline-size: var(--app-mobile-action-bar-control-size);
    min-block-size: var(--app-mobile-action-bar-control-size);
    padding: 0;
    justify-content: center;
    border-radius: var(--app-mobile-action-bar-control-radius);
    border: 1px solid var(--cv-color-border-soft);
    background: var(--cv-color-surface-2);
  }

  .tb-btn.has-badge {
    position: relative;
    --app-notification-dot-size: 7px;
    --app-notification-dot-radius: 50%;
  }

  .tb-btn:not(cv-menu-button):hover::part(base) {
    background: var(--cv-color-primary-surface);
  }

  .tb-btn:not(cv-menu-button):active::part(base) {
    transform: scale(0.95);
  }

  .tb-btn cv-icon {
    inline-size: var(--app-mobile-action-bar-icon-size);
    block-size: var(--app-mobile-action-bar-icon-size);
  }

  /* ===== More menu button ===== */
  .tb-btn-more::part(trigger) {
    inline-size: var(--app-mobile-action-bar-control-size);
    block-size: var(--app-mobile-action-bar-control-size);
    min-inline-size: var(--app-mobile-action-bar-control-size);
    min-block-size: var(--app-mobile-action-bar-control-size);
    padding: 0;
    justify-content: center;
    border-radius: var(--app-mobile-action-bar-control-radius);
    border: 1px solid var(--cv-color-border-soft);
    background: var(--cv-color-surface-2);
  }

  .tb-btn-more::part(label),
  .tb-btn-more::part(dropdown-icon) {
    display: none;
  }

  .tb-btn-more cv-icon {
    color: var(--cv-color-text);
  }

  .tb-btn-more:hover::part(trigger) {
    background: var(--cv-color-primary-surface);
  }

  .tb-btn-more:active::part(trigger) {
    transform: scale(0.95);
  }

  /* ===== Semantic variants ===== */
  .tb-btn-danger cv-icon {
    color: var(--cv-color-danger);
  }

  .more-menu-item-danger::part(base) {
    color: var(--cv-color-danger);
  }

  .more-menu-item-danger cv-icon {
    color: var(--cv-color-danger);
  }

  /* ===== Divider between action groups ===== */
  .action-divider {
    inline-size: 1px;
    block-size: 20px;
    background: var(--cv-color-border-muted);
    opacity: 0.5;
    flex-shrink: 0;
  }
`
