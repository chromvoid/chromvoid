import {css, type CSSResult} from 'lit'

export const mediaPreviewStyles: CSSResult = css`
  .preview-container {
    width: 100%;
    height: 250px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--cv-radius-m);
    overflow: hidden;
    background: var(--cv-color-surface-secondary);
    position: relative;
  }

  .skeleton {
    width: 100%;
    height: 100%;
    background: linear-gradient(
      90deg,
      var(--cv-color-surface) 0%,
      var(--cv-color-surface-secondary) 50%,
      var(--cv-color-surface) 100%
    );
  }

  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--app-spacing-3);
    padding: var(--app-spacing-4);
    color: var(--cv-color-text-muted);
    text-align: center;
  }

  .error-message {
    font-size: var(--cv-font-size-sm);
  }

  .retry-button,
  .fallback-button {
    background: var(--cv-color-surface-tertiary);
    border: 1px solid var(--cv-color-border);
    border-radius: var(--cv-radius-s);
    cursor: pointer;
    font-size: var(--cv-font-size-sm);
    color: var(--cv-color-text);
  }

  .retry-button {
    padding: var(--app-spacing-2) var(--app-spacing-3);
    transition: background 0.2s;
  }

  .fallback-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--app-spacing-2);
  }

  .fallback-button {
    display: inline-flex;
    align-items: center;
    gap: var(--app-spacing-2);
    min-height: 36px;
    padding: 0 var(--app-spacing-3);
  }

  .retry-button:hover,
  .fallback-button:hover {
    background: var(--cv-color-surface-secondary);
  }
`
