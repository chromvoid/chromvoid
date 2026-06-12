import {css} from 'lit'

export const entrySkeletonStyles = css`
  .note-skeleton {
    display: flex;
    flex-direction: column;
    gap: var(--pm-entry-note-skeleton-gap, 8px);
    padding: var(--pm-entry-note-skeleton-padding, 4px 0);
  }

  .skeleton-line {
    block-size: 12px;
    border-radius: var(--cv-radius-1);
    background: var(--cv-gradient-divider-subtle);
    background-size: 200% 100%;
  }

  .skeleton-line.short {
    inline-size: var(--pm-entry-note-skeleton-short-width, 40%);
  }
`
