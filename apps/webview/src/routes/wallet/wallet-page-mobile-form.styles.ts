import {css} from 'lit'

export const walletPageMobileFormStyles = css`
  .setup-panel {
    padding-block-end: var(--app-spacing-6);
  }

  .setup-panel .form,
  .setup-panel .setup-fieldset {
    display: grid;
    gap: var(--app-spacing-3);
  }

  .setup-panel .setup-fieldset {
    min-inline-size: 0;
    margin: 0;
    border: 0;
    padding: 0;
  }

  .setup-panel legend {
    margin-block-end: var(--app-spacing-2);
    padding: 0;
    color: var(--app-editorial-text-secondary, var(--cv-color-text-muted));
    font-size: var(--cv-font-size-sm);
  }

  .setup-panel .profile-options,
  .setup-panel .network-options {
    display: grid;
    gap: var(--app-spacing-2);
  }

  .setup-panel .network-options {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .setup-panel .choice-option {
    display: flex;
    min-block-size: 48px;
    align-items: flex-start;
    gap: var(--app-spacing-2);
    border: 1px solid var(--app-editorial-border-subtle, var(--cv-color-border-soft));
    border-radius: var(--cv-radius-md);
    padding: var(--app-spacing-3);
    background: var(--app-editorial-surface-elevated, var(--cv-color-surface-2));
  }

  .setup-panel .choice-option:has(input:checked) {
    border-color: var(--cv-color-accent);
    background: var(--cv-color-accent-surface, var(--cv-color-surface-2));
  }

  .setup-panel .choice-option:has(input:focus-visible) {
    outline: 2px solid var(--cv-color-accent);
    outline-offset: 2px;
  }

  .setup-panel .choice-copy,
  .setup-panel .profile-summary {
    display: grid;
    gap: var(--app-spacing-1);
  }

  .setup-panel .setup-note {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--app-spacing-2);
    align-items: start;
    margin: 0;
    color: var(--app-editorial-text-secondary, var(--cv-color-text-muted));
    font-size: var(--cv-font-size-sm);
    line-height: 1.45;
  }

  .setup-panel .setup-note cv-icon {
    margin-block-start: 0.15em;
    color: var(--cv-color-accent);
  }

  .setup-panel .setup-note span {
    display: grid;
    gap: var(--app-spacing-1);
  }

  .setup-panel .setup-note strong {
    color: var(--app-editorial-text-primary, var(--cv-color-text-strongest));
  }

  .setup-panel .loading-spinner {
    animation: spin var(--app-motion-spin-duration) linear infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    .setup-panel .loading-spinner {
      animation: none;
    }
  }

  .setup-panel label,
  .mobile-form label,
  .confirmation-panel > label,
  .rebroadcast-panel label {
    display: grid;
    gap: var(--app-spacing-2);
    color: var(--app-editorial-text-secondary, var(--cv-color-text-muted));
    font-size: var(--cv-font-size-sm);
  }

  .setup-panel input,
  .setup-panel select,
  .setup-panel textarea,
  .mobile-form input,
  .mobile-form select,
  .mobile-form textarea,
  .confirmation-panel input,
  .rebroadcast-panel input {
    box-sizing: border-box;
    inline-size: 100%;
    min-block-size: 48px;
    border: 1px solid var(--app-editorial-border-subtle, var(--cv-color-border-soft));
    border-radius: var(--cv-radius-md);
    padding: var(--app-spacing-3);
    color: var(--app-editorial-text-primary, var(--cv-color-text-strongest));
    background: var(--app-editorial-surface-muted, var(--cv-color-surface-2));
  }

  .setup-panel textarea,
  .mobile-form textarea {
    min-block-size: 112px;
    resize: vertical;
  }

  .setup-panel .check-row,
  .warning-check {
    display: flex;
    align-items: flex-start;
    gap: var(--app-spacing-2);
  }

  .setup-panel .check-row input,
  .warning-check input {
    inline-size: auto;
    min-block-size: auto;
    margin-block-start: 0.2em;
    accent-color: var(--cv-color-accent);
  }

  .setup-panel .actions,
  .confirmation-actions {
    display: grid;
    gap: var(--app-spacing-2);
  }

  .setup-panel button,
  .primary-action,
  .secondary-action,
  .address-block button {
    display: inline-flex;
    min-block-size: 48px;
    align-items: center;
    justify-content: center;
    gap: var(--app-spacing-2);
    border: 1px solid var(--app-editorial-border-subtle, var(--cv-color-border-soft));
    border-radius: var(--cv-radius-md);
    padding-inline: var(--app-spacing-3);
    background: var(--app-editorial-surface-muted, var(--cv-color-surface-2));
    cursor: pointer;
  }

  .setup-panel button.primary,
  .primary-action {
    border-color: var(--cv-color-accent);
    color: var(--cv-color-accent-contrast, var(--cv-color-bg));
    background: var(--cv-color-accent);
  }

  .setup-panel .mnemonic-grid,
  .mnemonic-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--app-spacing-2);
    padding: var(--app-spacing-3);
    border: 1px solid var(--cv-color-warning-border, var(--cv-color-border-soft));
    border-radius: var(--cv-radius-md);
    background: var(--cv-color-warning-surface, var(--cv-color-surface-2));
  }

  .mnemonic-word {
    display: grid;
    grid-template-columns: 2ch minmax(0, 1fr);
    gap: var(--app-spacing-2);
    font-family: var(--cv-font-family-code, ui-monospace, monospace);
    font-size: var(--cv-font-size-xs);
  }

  @media (max-width: 359px) {
    .setup-panel .network-options {
      grid-template-columns: minmax(0, 1fr);
    }
  }
`
