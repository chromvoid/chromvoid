import {css} from 'lit'

export const routeEmptyStateStyles = css`
  .empty-state {
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-sm);
    text-align: center;
    padding: var(--app-spacing-4) 0;
  }

  .empty-state.empty-state-compact {
    padding: 0;
  }
`
