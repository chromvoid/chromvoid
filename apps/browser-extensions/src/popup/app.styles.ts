import {css} from 'lit'

export const appStyles = css`
  :host {
    display: block;
    inline-size: 100%;
    block-size: 100%;
    color: var(--cv-color-text);
    background: var(--cv-color-bg);
    font-size: 13px;
    line-height: 1.4;
  }

  * {
    box-sizing: border-box;
  }

  .shell {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    min-block-size: 360px;
    block-size: 100%;
    max-block-size: 560px;
    background: var(--cv-color-bg);
  }

  .topbar {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--cv-space-3);
    min-block-size: 58px;
    padding: var(--cv-space-3) var(--cv-space-4);
    border-block-end: 1px solid var(--cv-color-border-faint);
  }

  .brand-mark,
  .back-button {
    display: grid;
    place-items: center;
    inline-size: 34px;
    block-size: 34px;
    border: 1px solid var(--cv-color-border-muted);
    border-radius: var(--cv-radius-sm);
    background: var(--cv-color-surface-2);
    color: var(--cv-color-primary);
    font-weight: 850;
  }

  .back-button {
    font: inherit;
    font-size: 18px;
    cursor: pointer;
  }

  .back-button:hover {
    background: var(--cv-color-surface-3);
  }

  .back-button:focus-visible,
  .search-input:focus-visible {
    outline: 2px solid var(--cv-color-focus);
    outline-offset: 2px;
  }

  .identity {
    min-inline-size: 0;
  }

  .title,
  .context {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .title {
    color: var(--cv-color-text-strong);
    font-size: 14px;
    font-weight: 800;
  }

  .context {
    margin-block-start: 2px;
    color: var(--cv-color-text-muted);
    font-size: 10px;
  }

  .health {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--cv-color-text-muted);
    font-size: 10px;
    font-weight: 700;
  }

  .health-dot {
    inline-size: 7px;
    block-size: 7px;
    border-radius: 50%;
    background: var(--cv-color-warning);
  }

  .health.ready .health-dot {
    background: var(--cv-color-success);
  }

  .search-region {
    padding: var(--cv-space-3) var(--cv-space-4);
    border-block-end: 1px solid var(--cv-color-border-faint);
    background: var(--cv-color-surface);
  }

  .search-input {
    inline-size: 100%;
    min-block-size: 40px;
    padding-inline: var(--cv-space-4);
    border: 1px solid var(--cv-color-border-muted);
    border-radius: var(--cv-radius-md);
    background: var(--cv-color-surface-2);
    color: var(--cv-color-text);
    font: inherit;
  }

  .search-input::placeholder {
    color: var(--cv-color-text-subtle);
  }

  .content {
    min-block-size: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--cv-space-3);
    min-block-size: 38px;
    padding-inline: var(--cv-space-4);
    border-block-end: 1px solid var(--cv-color-border-faint);
    color: var(--cv-color-text-muted);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  .search-state {
    color: var(--cv-color-primary);
    letter-spacing: 0;
    text-transform: none;
  }

  .list {
    padding-inline: var(--cv-space-2);
  }

  .empty,
  .loading,
  .pairing {
    display: grid;
    place-items: center;
    min-block-size: 260px;
    padding: var(--cv-space-6) var(--cv-space-5);
    text-align: center;
  }

  .empty-content,
  .pairing-content {
    max-inline-size: 320px;
  }

  .empty h2,
  .pairing h2 {
    margin: 0;
    color: var(--cv-color-text-strong);
    font-size: 16px;
  }

  .empty p,
  .pairing > .pairing-content > p {
    margin: var(--cv-space-2) 0 0;
    color: var(--cv-color-text-muted);
    font-size: 12px;
    line-height: 1.5;
  }

  .empty button {
    min-block-size: 40px;
    margin-block-start: var(--cv-space-4);
    padding-inline: var(--cv-space-4);
    border: 1px solid var(--cv-color-primary-border);
    border-radius: var(--cv-radius-sm);
    background: var(--cv-color-primary-surface-strong);
    color: var(--cv-color-text-strong);
    font: inherit;
    font-weight: 750;
    cursor: pointer;
  }

  .empty button:focus-visible {
    outline: 2px solid var(--cv-color-focus);
    outline-offset: 2px;
  }

  .pairing ext-pairing-form {
    margin-block-start: var(--cv-space-5);
    text-align: start;
  }

  .loading {
    color: var(--cv-color-text-muted);
  }

  .loading::before {
    content: '';
    inline-size: 18px;
    block-size: 18px;
    margin-inline-end: var(--cv-space-2);
    border: 2px solid var(--cv-color-border-muted);
    border-block-start-color: var(--cv-color-primary);
    border-radius: 50%;
    animation: popup-spin 800ms linear infinite;
  }

  .message-stack {
    display: grid;
    gap: var(--cv-space-2);
    padding: 0 var(--cv-space-4) var(--cv-space-3);
    pointer-events: none;
  }

  .message {
    margin: 0;
    padding: var(--cv-space-2) var(--cv-space-3);
    border: 1px solid var(--cv-color-border-muted);
    border-radius: var(--cv-radius-sm);
    background: var(--cv-color-surface-2);
    color: var(--cv-color-text-muted);
    font-size: 11px;
  }

  .message.error {
    border-color: var(--cv-color-danger-border);
    background: var(--cv-color-danger-surface);
    color: var(--cv-color-danger-text);
  }

  .visually-hidden {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @keyframes popup-spin {
    to {
      transform: rotate(1turn);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .loading::before {
      animation: none;
      border-color: var(--cv-color-primary);
    }
  }
`
