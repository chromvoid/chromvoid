import {css} from 'lit'

export const entrySshSharedStyles = css`
  :host {
    display: block;
  }

  .entry-ssh-surface {
    border: 1px solid color-mix(in oklch, var(--cv-color-border) 82%, transparent);
    border-radius: var(--cv-radius-2);
    background: color-mix(in oklch, var(--cv-color-surface) 90%, black 10%);
  }

  .entry-ssh-inline {
    display: flex;
    align-items: center;
    gap: var(--cv-space-2);
    min-inline-size: 0;
  }

  .entry-ssh-field {
    display: grid;
    gap: var(--cv-space-2);
    padding: 0.75rem;
    border: 1px solid color-mix(in oklch, var(--cv-color-border) 54%, transparent);
    border-radius: calc(var(--cv-radius-2) - 2px);
    background: color-mix(in oklch, var(--cv-color-surface-2) 32%, var(--cv-color-surface));
    box-shadow: inset 0 1px 0 color-mix(in oklch, white 4%, transparent);
  }

  .entry-ssh-field-flat {
    position: relative;
    padding: var(--cv-space-2) 0 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    border-block-start: 1px solid color-mix(in oklch, var(--cv-color-border) 30%, transparent);
  }

  .entry-ssh-field-flat::before {
    content: '';
    position: absolute;
    inset-inline-start: 0;
    inset-block-start: calc(var(--cv-space-2) + 0.125rem);
    inset-block-end: 0;
    inline-size: 2px;
    border-radius: 999px;
    background: color-mix(in oklch, var(--cv-color-warning) 40%, var(--cv-color-border));
  }

  .entry-ssh-field-flat .entry-ssh-field-head,
  .entry-ssh-field-flat .entry-ssh-field-content {
    padding-inline-start: var(--cv-space-3);
  }

  .entry-ssh-field-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--cv-space-2);
    min-inline-size: 0;
  }

  .entry-ssh-field-content {
    display: grid;
    gap: 0.375rem;
    min-inline-size: 0;
  }

  .entry-ssh-label {
    color: var(--cv-color-text-muted);
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .entry-ssh-value {
    color: var(--cv-color-text);
    min-inline-size: 0;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }

  .entry-ssh-field-actions {
    display: flex;
    justify-content: flex-end;
    flex-shrink: 0;
    align-self: center;
  }

  .entry-ssh-actions {
    display: flex;
    align-items: center;
    gap: var(--cv-space-2);
  }

  .entry-ssh-mono {
    font-family: var(--cv-font-family-code);
  }
`

export const entrySshKeysCardStyles = css`
  .entry-ssh-keys-card {
    background: var(--cv-color-surface-2);
    border: 1px solid color-mix(in oklch, var(--cv-color-border) 60%, transparent);
    border-radius: var(--cv-radius-3);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .entry-ssh-keys-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-block-end: 1px solid color-mix(in oklch, var(--cv-color-border) 35%, transparent);
  }

  .entry-ssh-keys-title {
    display: flex;
    align-items: center;
    gap: 6px;
    min-inline-size: 0;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-weight: var(--cv-font-weight-semibold, 600);
    color: var(--cv-color-text-muted);
  }

  .entry-ssh-keys-title cv-icon {
    font-size: 14px;
    opacity: 0.65;
  }

  .entry-ssh-keys-content {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .entry-ssh-keys-content pm-entry-ssh-key + pm-entry-ssh-key {
    border-block-start: 1px solid color-mix(in oklch, var(--cv-color-border) 30%, transparent);
  }

  @media (width < 720px) {
    .entry-ssh-keys-head {
      padding: 12px 14px;
    }
  }
`
