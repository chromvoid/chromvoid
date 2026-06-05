import {css} from 'lit'

export const pmEntryGenerateStyles = css`
  .generate {
    color: var(--cv-color-primary);
    cursor: pointer;
    transition:
      opacity 0.22s ease-in,
      display 0.22s allow-discrete;
    transition-behavior: allow-discrete;

    @starting-style {
      opacity: 0;
    }
  }

  [editing] .generate {
    opacity: 0;
    pointer-events: none;
    display: none;
  }

  :host {
    display: flex;
    flex-direction: column;
    block-size: 100%;
    min-block-size: 0;
    overflow-y: auto;
    overflow-x: hidden;
    contain: content;
    container-type: inline-size;
    scrollbar-width: thin;
    scrollbar-color: var(--cv-color-text-subtle) transparent;

    &::-webkit-scrollbar {
      inline-size: 5px;

      &-track {
        background: transparent;
      }

      &-thumb {
        background: var(--cv-color-text-subtle);
        border-radius: 3px;

        &:hover {
          background: var(--cv-color-primary);
        }
      }
    }
  }

  .strength-bar {
    inline-size: 100%;
    --cv-progress-height: 4px;
    --cv-progress-track-color: var(--cv-color-border-muted);
    --cv-progress-indicator-color: var(--strength-color);
  }

  .otp-summary {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    inline-size: 100%;
    min-inline-size: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--cv-color-text);

    cv-icon {
      color: var(--cv-color-success);
      font-size: 1rem;
    }
  }

  .error-text {
    color: var(--cv-color-danger);
    font-size: 0.75rem;
    line-height: 1.35;
    font-weight: 500;
  }
  cv-input[data-has-error] {
    &::part(input),
    &::part(base) {
      border-color: var(--cv-color-danger);
    }
  }
`
