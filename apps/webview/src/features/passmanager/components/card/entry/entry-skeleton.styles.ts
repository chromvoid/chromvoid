import {css} from 'lit'

export const entrySkeletonStyles = css`
  .note-skeleton {
    display: flex;
    flex-direction: column;
    gap: var(--cv-space-2);
    padding: var(--cv-space-1) 0;
  }

  .skeleton-line {
    block-size: 12px;
    border-radius: var(--cv-radius-1);
    background: var(--cv-gradient-divider-subtle);
    background-size: 200% 100%;
  }

  .skeleton-line.short {
    inline-size: 40%;
  }
`
