import {css} from 'lit'

export const pmEntryCreateStyles = css`
  :host {
    display: block;
    container-type: inline-size;
    overflow-y: visible;
  }

  @supports (-webkit-touch-callout: none) {
    @media (hover: none) and (pointer: coarse) {
      cv-input::part(input),
      cv-textarea::part(textarea),
      cv-select::part(trigger) {
        font-size: 16px;
      }
    }
  }

  cv-select {
    --cv-select-inline-size: 100%;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: var(--cv-space-3);
    padding: var(--cv-space-3);
    max-width: 860px;
  }

  h3 {
    font-size: 0.8125rem;
    font-weight: 500;
    margin: 0;
    color: var(--cv-color-text);
  }

  .create-header {
    display: flex;
    align-items: center;
    gap: var(--cv-space-2);
    padding-bottom: var(--cv-space-2);
    border-bottom: 1px solid var(--cv-color-border);
    margin-bottom: var(--cv-space-2);
  }

  .create-header-title {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--cv-color-text);
    letter-spacing: -0.01em;

    cv-icon {
      color: var(--cv-color-primary);
      width: 18px;
      height: 18px;
    }
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: var(--cv-space-2);
    padding: var(--cv-space-3);
    background: var(--cv-color-surface-2);
    border: 1px solid var(--cv-color-border);
    border-radius: var(--cv-radius-2);

    &:focus-within {
      border-color: color-mix(in oklch, var(--cv-color-primary) 40%, var(--cv-color-border));
    }
  }

  .title-section {
    background: linear-gradient(
      135deg,
      color-mix(in oklch, var(--cv-color-primary) 6%, var(--cv-color-surface-2)) 0%,
      var(--cv-color-surface-2) 100%
    );
    border-left: 3px solid var(--cv-color-primary);
  }

  pm-icon-picker {
    margin-top: var(--cv-space-3);
  }

  .section-label {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--cv-color-text-muted);
    padding-bottom: calc(var(--cv-space-2) * 0.5);

    cv-icon {
      width: 13px;
      height: 13px;
      color: var(--cv-color-text-muted);
      opacity: 0.7;
    }
  }

  .credentials-grid,
  .details-grid {
    display: grid;
    gap: var(--cv-space-3);
    grid-template-columns: 1fr;
  }

  .field-cell {
    min-width: 0;
  }

  .advanced-section {
    flex-direction: row;
    align-items: center;
    padding: calc(var(--cv-space-2) * 1.25) var(--cv-space-3);
    background: color-mix(in oklch, var(--cv-color-success) 3%, var(--cv-color-surface-2));
    border-color: color-mix(in oklch, var(--cv-color-success) 15%, var(--cv-color-border));
  }

  .switch-otp {
    margin: 0;
  }

  .otp-switch-label {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.8125rem;
    font-weight: 500;

    cv-icon {
      width: 14px;
      height: 14px;
      color: var(--cv-color-success);
    }
  }

  .submit {
    display: block;
    margin-top: var(--cv-space-2);
    border-radius: var(--cv-radius-2);
    --cv-button-font-weight-medium: 600;
    --cv-button-font-size-small: 0.875rem;
  }

  .generate-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: 1px solid color-mix(in oklch, var(--cv-color-border) 60%, transparent);
    border-radius: var(--cv-radius-1);
    background: color-mix(in oklch, var(--cv-color-primary) 10%, transparent);
    color: var(--cv-color-primary);
    cursor: pointer;
    transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
    padding: 0;

    cv-icon {
      width: 16px;
      height: 16px;
    }

    &:hover {
      background: var(--cv-color-primary);
      color: white;
      border-color: var(--cv-color-primary);
      transform: rotate(180deg);
    }
  }

  .strength-bar {
    display: flex;
    align-items: center;
    gap: var(--cv-space-2);
    padding: 8px 2px 0;
    block-size: auto;
  }

  .strength-track {
    flex: 1;
    height: 3px;
    border-radius: 2px;
    background: color-mix(in oklch, var(--cv-color-border) 50%, transparent);
    overflow: hidden;
  }

  .strength-fill {
    height: 100%;
    border-radius: 2px;
    transition:
      width 0.3s ease,
      background 0.3s ease;
  }

  .strength-fill.strength-0 {
    width: 20%;
    background: var(--cv-color-danger);
  }

  .strength-fill.strength-1 {
    width: 40%;
    background: color-mix(in oklch, var(--cv-color-danger) 60%, var(--cv-color-warning));
  }

  .strength-fill.strength-2 {
    width: 60%;
    background: var(--cv-color-warning);
  }

  .strength-fill.strength-3 {
    width: 80%;
    background: color-mix(in oklch, var(--cv-color-success) 60%, var(--cv-color-warning));
  }

  .strength-fill.strength-4 {
    width: 100%;
    background: var(--cv-color-success);
  }

  .strength-label {
    font-size: 0.625rem;
    font-weight: 600;
    white-space: nowrap;
    letter-spacing: 0.02em;
  }

  .strength-label.strength-0 {
    color: var(--cv-color-danger);
  }

  .strength-label.strength-1 {
    color: color-mix(in oklch, var(--cv-color-danger) 60%, var(--cv-color-warning));
  }

  .strength-label.strength-2 {
    color: var(--cv-color-warning);
  }

  .strength-label.strength-3 {
    color: color-mix(in oklch, var(--cv-color-success) 60%, var(--cv-color-warning));
  }

  .strength-label.strength-4 {
    color: var(--cv-color-success);
  }

  @container (width >= 520px) {
    .credentials-grid,
    .details-grid {
      grid-template-columns: 1fr 1fr;
    }

    .note-cell {
      grid-row: span 1;
    }
  }

  @container (width >= 700px) {
    form {
      padding: var(--cv-space-4) var(--cv-space-6);
    }

    .section {
      padding: var(--cv-space-4);
    }
  }

  @container (width < 360px) {
    form {
      padding: var(--cv-space-2);
      gap: var(--cv-space-2);
    }

    .section {
      padding: calc(var(--cv-space-2) * 1.25);
      border-radius: var(--cv-radius-1);
    }

    .create-header-title {
      font-size: 0.8125rem;
    }

    .section-label {
      font-size: 0.625rem;
    }
  }
`
