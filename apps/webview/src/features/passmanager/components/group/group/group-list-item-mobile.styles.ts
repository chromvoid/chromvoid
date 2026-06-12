import {css} from 'lit'

import {pmMobileListRowStyles} from '../../../styles/mobile-list-row'

export const pmGroupListItemMobileStyles = css`
  ${pmMobileListRowStyles}

  :host {
    display: block;
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
    --pm-avatar-image-padding: var(--pm-mobile-list-row-icon-image-padding);
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

  .group-risk-dot {
    --pm-group-risk-ring: var(--cv-color-border-glass);
    inline-size: 8px;
    block-size: 8px;
    flex: 0 0 8px;
    border-radius: 999px;
    border: 1px solid currentColor;
    box-shadow: 0 0 0 3px var(--pm-group-risk-ring);
  }

  .group-risk-dot[data-severity='warning'] {
    --pm-group-risk-ring: var(--cv-color-warning-ring);
    color: var(--cv-color-warning);
    background: var(--cv-color-warning);
  }

  .group-risk-dot[data-severity='critical'] {
    --pm-group-risk-ring: var(--cv-color-danger-ring);
    color: var(--cv-color-danger);
    background: var(--cv-color-danger);
  }
`
