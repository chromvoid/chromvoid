import {css} from 'lit'

import {pmMobileListRowStyles} from '../../../styles/mobile-list-row'

export const pmGroupListItemMobileStyles = css`
  ${pmMobileListRowStyles}

  :host {
    display: block;
  }

  .swipe-container {
    position: relative;
    overflow: hidden;
    border-radius: var(--cv-radius-2);
  }

  .swipe-container > .group-row {
    position: relative;
    z-index: 1;
    transform: translateX(var(--_pm-group-swipe-offset-inline, 0px));
  }

  .group-swipe-actions-right {
    position: absolute;
    inset-block: 0;
    inset-inline-end: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    inline-size: 64px;
    padding-inline: var(--cv-space-2);
    box-sizing: border-box;
    visibility: hidden;
    pointer-events: none;
    background: var(--cv-gradient-surface-danger);
  }

  .swipe-container.swipe-left .group-swipe-actions-right {
    visibility: visible;
    pointer-events: auto;
  }

  .swipe-action {
    display: flex;
    align-items: center;
    justify-content: center;
    inline-size: var(--app-touch-target-min);
    block-size: var(--app-touch-target-min);
    padding: 0;
    border: 1px solid var(--cv-alpha-white-20);
    border-radius: var(--cv-radius-2);
    background: var(--cv-alpha-black-10);
    color: white;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .swipe-action cv-icon {
    inline-size: 18px;
    block-size: 18px;
  }

  .group-row.snap-back {
    transition: transform var(--cv-duration-normal) var(--cv-easing-decelerate);
  }

  .group-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--pm-mobile-list-row-gap);
    padding:
      var(--pm-mobile-list-row-padding-block)
      var(--pm-mobile-list-row-padding-inline);
    cursor: pointer;
  }

  .group-row.active-row .group-name,
  .group-row.selected .group-name,
  .group-row.active-row .group-description,
  .group-row.selected .group-description,
  .group-row.active-row .group-entry-count,
  .group-row.selected .group-entry-count,
  .group-row.active-row .group-chevron,
  .group-row.selected .group-chevron {
    color: var(--cv-color-primary);
  }

  .group-row.active-row .group-icon-wrap,
  .group-row.selected .group-icon-wrap {
    background: var(--cv-color-primary-surface-strong);
    border-color: transparent;
  }

  .group-icon-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    inline-size: var(--pm-mobile-list-row-icon-size);
    block-size: var(--pm-mobile-list-row-icon-size);
    border-radius: var(--pm-mobile-list-row-icon-radius);
    background: var(--cv-color-surface-3);
    border: 1px solid var(--cv-color-border-muted);
    flex-shrink: 0;
  }

  .group-icon-wrap .folder-custom-icon {
    width: 100%;
    height: 100%;
    --pm-avatar-radius: var(--pm-mobile-list-row-icon-radius);
    --pm-avatar-image-padding: 0px;
    --pm-avatar-image-inset-shadow-color: transparent;
    --pm-avatar-letter-size: var(--pm-mobile-list-row-icon-letter-size);
    --pm-avatar-icon-size: var(--pm-avatar-list-folder-icon-size);
  }

  .group-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--cv-font-size-base);
    font-weight: var(--cv-font-weight-semibold, 600);
    line-height: 1.15;
  }

  .group-copy {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .group-description {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--cv-font-size-xs);
    line-height: 1.15;
    color: var(--cv-color-text-subtle);
  }

  .group-trail {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--cv-space-2);
    min-inline-size: 42px;
  }

  .group-entry-count {
    font-size: var(--cv-font-size-sm);
    font-weight: var(--cv-font-weight-bold, 700);
    color: var(--cv-color-primary-dark);
    font-variant-numeric: tabular-nums;
  }

  .group-chevron {
    width: 14px;
    height: 14px;
    color: var(--cv-color-text-subtle);
    opacity: 0.6;
  }

  .group-risk-slot {
    inline-size: 8px;
    block-size: 8px;
    flex: 0 0 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .group-risk-dot {
    inline-size: 8px;
    block-size: 8px;
    flex: 0 0 auto;
    border-radius: 999px;
    border: 1px solid currentColor;
    box-shadow: 0 0 0 3px var(--cv-color-border-glass);
  }

  .group-risk-dot[data-severity='warning'] {
    color: var(--cv-color-warning);
    background: var(--cv-color-warning);
    box-shadow: 0 0 0 3px var(--cv-color-warning-ring);
  }

  .group-risk-dot[data-severity='critical'] {
    color: var(--cv-color-danger);
    background: var(--cv-color-danger);
    box-shadow: 0 0 0 3px var(--cv-color-danger-ring);
  }

  @media (prefers-reduced-motion: reduce) {
    .group-row.snap-back {
      transition-duration: 1ms;
    }
  }
`
