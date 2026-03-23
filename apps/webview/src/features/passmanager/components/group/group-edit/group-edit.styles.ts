import {css} from 'lit'

export const pmGroupEditSharedStyles = css`
  form {
    display: grid;
    gap: var(--cv-space-4);
  }

  label {
    display: block;
    color: var(--cv-color-text);
    font-size: var(--cv-font-size-sm);
    font-weight: var(--cv-font-weight-medium);
    margin-block-end: var(--cv-space-2);
  }

  .edit-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--cv-space-4);
    margin-block-start: var(--cv-space-4);
  }
`
