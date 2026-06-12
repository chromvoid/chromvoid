import {css} from 'lit'

export const mobileQuickViewShellStyles = css`
  :host {
    box-sizing: border-box;
    block-size: 100%;
    min-block-size: 0;
    overflow: hidden;
  }

  .quick-view__content {
    min-inline-size: 0;
  }

  .controls {
    position: sticky;
    z-index: 2;
    inset-block-start: 0;
    background: var(--cv-color-surface-1);
  }

  .clear-filters--compact {
    flex: 0 0 auto;
  }

  .row {
    padding: var(--mobile-quick-view-row-padding, var(--cv-space-2));
  }
`
