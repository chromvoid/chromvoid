import {css, type CSSResult} from 'lit'

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
  /* ===== Toolbar button base ===== */
  .tb-btn {
    --tb-size: 36px;
    --tb-icon-size: 18px;
    inline-size: var(--tb-size);
    block-size: var(--tb-size);
    min-inline-size: var(--tb-size);
    min-block-size: var(--tb-size);
    max-inline-size: var(--tb-size);
    flex-shrink: 0;
  }

  cv-menu-button.tb-btn {
    display: block;
  }

  .tb-btn::part(base) {
    inline-size: var(--tb-size);
    block-size: var(--tb-size);
    min-inline-size: var(--tb-size);
    min-block-size: var(--tb-size);
    padding: 0;
    justify-content: center;
    border-radius: 8px;
    border: 1px solid
      color-mix(in oklch, var(--cv-color-border-strong, var(--cv-color-border)) 50%, transparent);
    background: var(--cv-color-surface-2);
  }

  .tb-btn.has-badge {
    position: relative;
  }

  .tb-btn.has-badge::after {
    content: '';
    position: absolute;
    inset-inline-end: 4px;
    inset-block-start: 4px;
    inline-size: 7px;
    block-size: 7px;
    border-radius: 50%;
    background: var(--cv-color-accent, #ff7a00);
    border: 1.5px solid var(--cv-color-surface-2);
    pointer-events: none;
  }

  .tb-btn:not(cv-menu-button):hover::part(base) {
    background: color-mix(in oklch, var(--cv-color-surface-2) 78%, var(--cv-color-primary));
  }

  .tb-btn:not(cv-menu-button):active::part(base) {
    transform: scale(0.95);
  }

  .tb-btn cv-icon {
    inline-size: var(--tb-icon-size);
    block-size: var(--tb-icon-size);
  }

  /* ===== More menu button ===== */
  .tb-btn-more::part(trigger) {
    inline-size: var(--tb-size);
    block-size: var(--tb-size);
    min-inline-size: var(--tb-size);
    min-block-size: var(--tb-size);
    padding: 0;
    justify-content: center;
    border-radius: 8px;
    border: 1px solid
      color-mix(in oklch, var(--cv-color-border-strong, var(--cv-color-border)) 50%, transparent);
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
    background: color-mix(in oklch, var(--cv-color-surface-2) 78%, var(--cv-color-primary));
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
