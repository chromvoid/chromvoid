import {css} from 'lit'

export const entrySharedStyles = css`
  :host {
    display: flex;
    flex-direction: column;
    block-size: 100%;
    min-block-size: 0;
    contain: layout style paint;
  }

  .wrapper {
    display: flex;
    flex-direction: column;
    gap: var(--cv-space-3);
  }

  @keyframes noteContentReveal {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }

    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--cv-space-2);
    color: var(--cv-color-text-subtle);
    font-size: var(--cv-font-size-sm);
    font-weight: 500;
    padding: var(--cv-space-4);
    border-radius: var(--cv-radius-2);
    transition:
      background-color 0.2s,
      color 0.2s;
  }

  .empty-state-action {
    inline-size: 100%;
    border: none;
    background: transparent;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .empty-state-action:hover:not(:disabled) {
    background-color: var(--cv-color-surface-highlight);
    color: var(--cv-color-text);
  }

  .empty-state-action:disabled {
    cursor: default;
    opacity: 0.6;
  }

  .empty-state cv-icon {
    font-size: 16px;
    opacity: 0.7;
  }

  .note-spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid var(--cv-color-text-subtle);
    border-block-start-color: var(--cv-color-primary);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    flex-shrink: 0;
  }

  .note-content-error {
    color: var(--cv-color-danger);
    font-style: italic;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`
