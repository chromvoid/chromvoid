import {css} from 'lit'

export const pmMobileListRowStyles = css`
  .mobile-list-row-surface {
    min-block-size: var(--pm-mobile-list-row-min-block-size);
    background: transparent;
    border: 1px solid transparent;
    border-radius: 12px;
    box-shadow: inset 0 -1px 0 var(--cv-color-border-soft);
    transition:
      background-color var(--cv-duration-fast) var(--cv-easing-standard),
      border-color var(--cv-duration-fast) var(--cv-easing-standard),
      box-shadow var(--cv-duration-fast) var(--cv-easing-standard),
      outline-color var(--cv-duration-fast) var(--cv-easing-standard);
    touch-action: pan-y;
    -webkit-touch-callout: none;
    -webkit-user-select: none;
  }

  .mobile-list-row-surface:hover,
  .mobile-list-row-surface:focus-visible {
    background: var(--cv-color-primary-subtle);
    border-color: var(--cv-color-primary-border);
    box-shadow: none;
  }

  .mobile-list-row-surface.active-row,
  .mobile-list-row-surface.selected {
    outline: var(
      --pm-active-outline,
      2px solid var(--cv-color-primary-ring)
    );
    outline-offset: var(--pm-active-outline-offset, -2px);
  }

  .mobile-list-row-surface.active-row {
    background: var(--cv-color-primary-subtle);
    border-color: var(--cv-color-primary-border-strong);
    box-shadow: none;
  }

  .mobile-list-row-surface.selected {
    background: var(--cv-color-primary-surface-strong);
    border-color: var(--cv-color-primary);
    box-shadow: none;
  }
`
