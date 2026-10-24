import {css} from 'lit'

export const walletReceiveStyles = css`
  .receive-content {
    display: grid;
    gap: var(--app-spacing-4);
    min-inline-size: 0;
  }

  .receive-network-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--app-spacing-2);
  }

  .receive-network-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--app-spacing-2);
    min-block-size: 36px;
    padding: var(--app-spacing-1) var(--app-spacing-3) var(--app-spacing-1) var(--app-spacing-1);
    border: 1px solid var(--app-editorial-border-subtle, var(--cv-color-border-soft));
    border-radius: 999px;
    color: var(--app-editorial-text-secondary, var(--cv-color-text));
    font-size: var(--cv-font-size-sm);
    background: var(--app-editorial-surface-muted, var(--cv-color-surface-secondary));
    cursor: pointer;
  }

  .receive-network-chip[aria-pressed='true'] {
    border-color: var(--cv-color-accent);
    color: var(--app-editorial-text-primary, var(--cv-color-text));
    background: var(--cv-color-accent-surface, var(--cv-color-surface-2));
  }

  .receive-network-chip .network-mark {
    display: inline-grid;
    place-items: center;
    inline-size: 26px;
    block-size: 26px;
    border-radius: 50%;
    color: var(--cv-color-accent-contrast, var(--cv-color-bg));
    font-size: var(--cv-font-size-xs);
    font-weight: var(--cv-font-weight-semibold);
    background: var(--cv-color-accent);
  }

  .receive-context-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
    gap: var(--app-spacing-2);
    margin: 0;
  }

  .receive-context-list > div {
    display: grid;
    gap: var(--app-spacing-1);
    min-inline-size: 0;
    padding: var(--app-spacing-3);
    border: 1px solid var(--app-editorial-border-subtle, var(--cv-color-border-soft));
    border-radius: var(--cv-radius-md);
    background: var(--app-editorial-surface-muted, var(--cv-color-surface-secondary));
  }

  .receive-context-list dt,
  .receive-address > span {
    color: var(--app-editorial-text-tertiary, var(--cv-color-text-muted));
    font-size: var(--cv-font-size-xs);
  }

  .receive-context-list dd {
    min-inline-size: 0;
    overflow: hidden;
    margin: 0;
    color: var(--app-editorial-text-primary, var(--cv-color-text));
    font-size: var(--cv-font-size-sm);
    font-weight: var(--cv-font-weight-semibold);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .receive-qr-frame {
    display: grid;
    place-items: center;
    justify-self: center;
    padding: var(--app-spacing-3);
    border: 1px solid var(--app-editorial-border-subtle, var(--cv-color-border-soft));
    border-radius: var(--cv-radius-lg);
    background: var(--cv-color-qr-background);
  }

  .receive-address {
    display: grid;
    gap: var(--app-spacing-2);
    min-inline-size: 0;
    padding: var(--app-spacing-3);
    border-radius: var(--cv-radius-md);
    background: var(--app-editorial-surface-muted, var(--cv-color-surface-secondary));
  }

  .receive-address code {
    overflow-wrap: anywhere;
    color: var(--app-editorial-text-primary, var(--cv-color-text));
    font-family: var(--cv-font-family-code, ui-monospace, monospace);
    font-size: var(--cv-font-size-xs);
    user-select: text;
  }

  .receive-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--app-spacing-2);
  }

  .receive-actions button {
    display: inline-flex;
    min-block-size: 44px;
    flex: 1 1 180px;
    align-items: center;
    justify-content: center;
    gap: var(--app-spacing-2);
    border: 1px solid var(--app-editorial-border-subtle, var(--cv-color-border-soft));
    border-radius: var(--cv-radius-md);
    padding-inline: var(--app-spacing-3);
    color: var(--app-editorial-text-primary, var(--cv-color-text));
    background: var(--app-editorial-surface-elevated, var(--cv-color-surface-secondary));
    cursor: pointer;
  }

  .receive-actions button.primary {
    border-color: var(--cv-color-accent-border-strong, var(--cv-color-accent));
    color: var(--cv-color-accent-contrast, var(--cv-color-bg));
    background: var(--cv-color-accent);
  }

  .receive-actions button:disabled {
    cursor: default;
    opacity: 0.55;
  }

  .receive-feedback,
  .receive-error {
    padding: var(--app-spacing-3);
    border: 1px solid;
    border-radius: var(--cv-radius-md);
    font-size: var(--cv-font-size-sm);
    line-height: 1.45;
  }

  .receive-feedback {
    border-color: var(--cv-color-info-border);
    color: var(--cv-color-info);
    background: var(--cv-color-info-surface);
  }

  .receive-error {
    border-color: var(--cv-color-danger-border, var(--cv-color-border-danger));
    color: var(--cv-color-danger, var(--cv-color-text-danger));
    background: var(--cv-color-danger-surface, transparent);
  }
`
