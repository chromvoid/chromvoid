import {css} from 'lit'

export const dashboardToolbarSearchStyles = css`
  .dashboard-toolbar-search:not([preset='search-mobile']) {
    --cv-input-height: var(--app-dashboard-header-search-block-size);
    --cv-input-padding-inline: var(--app-dashboard-header-search-padding-inline);
    --cv-input-font-size: var(--app-dashboard-header-search-font-size);
    --cv-input-border-radius: var(--app-dashboard-header-search-radius);
    --cv-input-border-color: var(--cv-color-border-muted);
    --cv-input-background: var(--cv-color-surface-2);
    --cv-input-color: var(--cv-color-text);
    --cv-input-placeholder-color: var(--cv-color-text-muted);
    --cv-input-focus-ring: 0 0 0 2px var(--cv-color-primary-ring);
    --cv-input-icon-size: var(--app-dashboard-header-search-icon-size);
    --cv-input-gap: var(--app-dashboard-header-search-gap);
  }

  .dashboard-toolbar-search:not([preset='search-mobile']):hover {
    --cv-input-border-color: var(--cv-color-primary-border);
  }

  .dashboard-toolbar-search:not([preset='search-mobile'])[focused] {
    --cv-input-border-color: var(--cv-color-primary-border-strong);
  }

  .dashboard-toolbar-search:not([preset='search-mobile'])::part(input) {
    font-weight: var(--app-dashboard-header-search-font-weight);
  }

  .dashboard-toolbar-search:not([preset='search-mobile']) cv-icon[slot='prefix'] {
    color: var(--cv-color-text-muted);
    transition: color var(--cv-duration-fast) var(--cv-easing-standard);
  }

  .dashboard-toolbar-search:not([preset='search-mobile'])[focused] cv-icon[slot='prefix'] {
    color: var(--cv-color-primary);
  }
`
