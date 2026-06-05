import {css} from 'lit'

export const pmEntryCardStyles = css`
  :host {
    container-type: inline-size;
    --entry-avatar-bg: var(--cv-color-primary-dark);
  }

  cv-input{
    width: 100%;
  }

  .entry-meta-badges {
    display: inline-flex;
    align-items: center;
    gap: calc(var(--cv-space-2) * 0.75);
  }

  .wrapper,
  form {
    display: grid;
    gap: var(--cv-space-4);
  }

  label {
    display: block;
    color: var(--cv-color-text);
    font-size: var(--cv-font-size-sm);
    font-weight: var(--cv-font-weight-medium);
    margin-bottom: var(--cv-space-2);
  }

  strong {
    font-weight: normal;
  }

  .error-text {
    color: var(--cv-color-danger);
    font-weight: var(--cv-font-weight-medium);
    font-size: var(--cv-font-size-sm);
  }

  cv-input[data-has-error] {
    &::part(input),
    &::part(base) {
      border-color: var(--cv-color-danger);
    }

    &::part(base) {
      outline: 1px solid var(--cv-color-danger);
      outline-offset: -1px;
    }

    &:focus-within {
      &::part(input),
      &::part(base) {
        border-color: var(--cv-color-danger);
      }

      &::part(base) {
        outline: 2px solid var(--cv-color-danger-ring);
        outline-offset: -2px;
      }
    }
  }
`
