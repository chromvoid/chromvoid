import {css} from 'lit'

export const commandBarStyles = [
  css`
    :host {
      display: contents;
    }

    .backdrop {
      position: fixed;
      inset: 0;
      background: var(--cv-alpha-black-65);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      opacity: 0;
      pointer-events: none;
      transition: opacity var(--cv-duration-fast, 150ms) var(--ease-out-quart, cubic-bezier(0.25, 1, 0.5, 1));
      z-index: var(--cv-z-modal, 400);
    }

    :host([open]) .backdrop {
      opacity: 1;
      pointer-events: auto;
    }

    .dialog {
      position: fixed;
      inset-block-start: 15vh;
      inset-inline: 50%;
      transform: translateX(-50%) scale(0.98);
      inline-size: min(92vw, 640px);
      max-block-size: 70vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--surface-overlay, #111);
      border: 1px solid var(--border-default, var(--cv-alpha-white-10));
      border-radius: var(--cv-radius-xl, 16px);
      box-shadow: var(--cv-shadow-xl, 0 16px 48px var(--cv-alpha-black-65));
      opacity: 0;
      pointer-events: none;
      transition:
        opacity var(--cv-duration-fast, 150ms) var(--ease-out-quart, cubic-bezier(0.25, 1, 0.5, 1)),
        transform var(--cv-duration-normal, 250ms) var(--ease-out-expo, cubic-bezier(0.16, 1, 0.3, 1));
      z-index: calc(var(--cv-z-modal, 400) + 1);
    }

    :host([open]) .dialog {
      opacity: 1;
      pointer-events: auto;
      transform: translateX(-50%) scale(1);
    }

    .search {
      display: flex;
      align-items: center;
      gap: var(--space-3, 12px);
      padding: var(--space-4, 16px);
      border-block-end: 1px solid var(--border-subtle, var(--cv-alpha-white-6));
    }

    .search-icon {
      color: var(--text-tertiary, var(--cv-alpha-white-50));
      font-size: 20px;
      flex-shrink: 0;
    }

    .search-input {
      flex: 1;
      border: none;
      outline: none;
      background: transparent;
      color: var(--text-primary, #fff);
      font-family: var(--cv-font-family-body, 'Inter', system-ui);
      font-size: var(--text-body, 0.9375rem);
    }

    .hint {
      font-family: var(--cv-font-family-code, 'JetBrains Mono', monospace);
      font-size: var(--text-micro, 0.6875rem);
      color: var(--text-quaternary, var(--cv-alpha-white-30));
      padding: var(--space-1, 4px) var(--space-2, 8px);
      background: var(--surface-muted, #1a1a1a);
      border-radius: var(--cv-radius-sm, 4px);
    }

    .results {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-2, 8px);
    }

    .category {
      margin-block-end: var(--space-2, 8px);

      &:last-child {
        margin-block-end: 0;
      }
    }

    .category-label {
      padding: var(--space-2, 8px) var(--space-3, 12px);
      font-family: var(--cv-font-family-body, 'Inter', system-ui);
      font-size: var(--text-micro, 0.6875rem);
      font-weight: var(--weight-medium, 500);
      letter-spacing: var(--tracking-caps, 0.08em);
      text-transform: uppercase;
      color: var(--text-tertiary, var(--cv-alpha-white-50));
    }

    .command {
      inline-size: 100%;
      display: flex;
      align-items: center;
      gap: var(--space-3, 12px);
      padding: var(--space-3, 12px);
      border-radius: var(--cv-radius-md, 8px);
      border: none;
      background: transparent;
      color: var(--text-secondary, var(--cv-alpha-white-70));
      cursor: pointer;
      text-align: start;
      font-family: var(--cv-font-family-body, 'Inter', system-ui);
      font-size: var(--text-small, 0.8125rem);
      font-weight: var(--weight-medium, 500);
      transition:
        background-color var(--cv-duration-fast, 150ms) var(--ease-out-quart, cubic-bezier(0.25, 1, 0.5, 1)),
        color var(--cv-duration-fast, 150ms) var(--ease-out-quart);

      cv-icon {
        flex-shrink: 0;
        font-size: 18px;
        color: var(--text-tertiary, var(--cv-alpha-white-50));
      }

      .label {
        flex: 1;
      }

      .shortcut {
        font-family: var(--cv-font-family-code, 'JetBrains Mono', monospace);
        font-size: var(--text-micro, 0.6875rem);
        color: var(--text-quaternary, var(--cv-alpha-white-30));
        padding: var(--space-1, 4px) var(--space-2, 8px);
        background: var(--surface-muted, #1a1a1a);
        border-radius: var(--cv-radius-sm, 4px);
      }

      &:hover,
      &.selected {
        background: var(--hover-overlay, var(--cv-alpha-white-4));
        color: var(--text-primary, #fff);

        cv-icon {
          color: var(--accent, #ff7a00);
        }
      }

      &:focus-visible {
        outline: none;
        box-shadow: 0 0 0 2px var(--surface-base), 0 0 0 4px var(--accent, #ff7a00);
      }
    }

    .command:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    .command:disabled:hover,
    .command:disabled.selected {
      background: transparent;
      color: var(--text-secondary, var(--cv-alpha-white-70));
    }

    .empty {
      padding: var(--space-6, 24px);
      text-align: center;
      color: var(--text-tertiary, var(--cv-alpha-white-50));
      font-size: var(--text-small, 0.8125rem);
    }

    .file-input {
      display: none;
    }
  `,
]
