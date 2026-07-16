import {css} from 'lit'

export const passwordManagerLayoutStyles = css`
  :host {
    font-size: var(--cv-font-size-lg);
    box-sizing: border-box;
    block-size: 100%;
    min-block-size: 0;
    container-type: inline-size;
  }

  .content {
    position: relative;
    display: flex;
    flex-direction: column;
    min-block-size: 0;
    contain: layout style;
    overflow: hidden;
  }

  .pm-content {
    position: relative;
    display: flex;
    flex: 1;
    flex-direction: column;
    block-size: 100%;
    min-block-size: 0;
    min-inline-size: 0;
    contain: layout style;
  }

  .card {
    flex: 1;
    min-block-size: 0;
    box-sizing: border-box;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .spinner-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 300px;
    block-size: 100%;
  }

  .spinner {
    font-size: 4rem;
  }

  .session-unavailable {
    margin: auto;
    max-inline-size: 520px;
    padding: var(--cv-space-6);
  }

  .session-retry {
    min-block-size: 40px;
    padding-inline: var(--cv-space-4);
    border: 1px solid var(--cv-color-border-strong);
    border-radius: var(--cv-radius-2);
    background: var(--cv-color-surface-2);
    color: var(--cv-color-text);
    font: inherit;
    cursor: pointer;
  }

  .session-retry:hover {
    background: var(--cv-color-surface-3);
  }

  .session-retry:disabled {
    cursor: default;
    opacity: 0.55;
  }

  .session-retry:focus-visible {
    outline: 2px solid var(--cv-color-focus-ring);
    outline-offset: 2px;
  }

`
