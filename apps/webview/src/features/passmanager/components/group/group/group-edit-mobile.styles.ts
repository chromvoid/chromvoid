import {css} from 'lit'

export const pmGroupEditMobileStyles = css`
  :host {
    display: block;
    block-size: 100%;
    min-block-size: 0;
    overflow: hidden;
    contain: layout style paint;
    color: var(--cv-color-text);
    background: var(--cv-color-bg);
  }

  form {
    display: flex;
    flex-direction: column;
    block-size: 100%;
    min-block-size: 0;
  }

  .edit-scroll {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: var(--cv-space-5);
    min-block-size: 0;
    overflow-x: hidden;
    overflow-y: auto;
    padding: var(--cv-space-2) var(--cv-space-4) var(--cv-space-5);
    overscroll-behavior-y: contain;
    scroll-padding-block-end: var(--cv-space-5);
    -webkit-overflow-scrolling: touch;
  }

  .location-summary {
    display: grid;
    gap: var(--cv-space-2);
    min-inline-size: 0;
    padding-block-end: var(--cv-space-3);
    border-block-end: 1px solid var(--cv-color-border-faint);
  }

  .location-label {
    display: flex;
    align-items: center;
    gap: var(--cv-space-2);
    color: var(--cv-color-text-subtle);
    font-size: var(--cv-font-size-xs);
    font-weight: var(--cv-font-weight-bold);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .location-label cv-icon,
  .path-separator {
    inline-size: 0.875rem;
    block-size: 0.875rem;
  }

  .location-path {
    display: flex;
    align-items: center;
    gap: var(--cv-space-1);
    min-inline-size: 0;
    overflow: hidden;
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-sm);
    font-weight: var(--cv-font-weight-semibold);
    white-space: nowrap;
  }

  .path-segment {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .path-segment.current {
    flex: 1 1 auto;
    color: var(--cv-color-text);
  }

  .path-separator {
    flex: 0 0 auto;
    color: var(--cv-color-text-subtle);
  }

  .field-label,
  .section-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--cv-space-2);
    min-inline-size: 0;
    inline-size: 100%;
  }

  .field-label-text,
  .section-heading-text {
    display: inline-flex;
    align-items: center;
    gap: var(--cv-space-1);
    min-inline-size: 0;
    color: var(--cv-color-text);
    font-weight: var(--cv-font-weight-bold);
    overflow-wrap: anywhere;
  }

  .required-marker {
    color: var(--cv-color-primary);
  }

  .optional-badge {
    display: inline-flex;
    align-items: center;
    min-block-size: 1.25rem;
    padding-inline: var(--cv-space-2);
    border: 1px solid var(--cv-color-border-faint);
    border-radius: var(--cv-radius-1);
    color: var(--cv-color-text-subtle);
    background: var(--cv-color-surface-2);
    font-size: var(--cv-font-size-xs);
    font-weight: var(--cv-font-weight-semibold);
  }

  .field-counter {
    flex: 0 0 auto;
    color: var(--cv-color-text-subtle);
    font-family: var(--cv-font-family-code);
    font-size: var(--cv-font-size-xs);
    font-variant-numeric: tabular-nums;
  }

  .field-error,
  .submit-message.error {
    color: var(--cv-color-danger);
    font-size: var(--cv-font-size-sm);
    line-height: 1.4;
  }

  .field-hint {
    color: var(--cv-color-text-subtle);
    font-size: var(--cv-font-size-xs);
    line-height: 1.45;
  }

  cv-input,
  cv-textarea {
    inline-size: 100%;
  }

  cv-input {
    --cv-input-height: 3.5rem;
    --cv-input-border-radius: var(--cv-radius-3);
    --cv-input-background: var(--cv-color-surface-2);
    --cv-input-border-color: var(--cv-color-border-muted);
  }

  cv-textarea {
    --cv-textarea-min-height: 5.5rem;
    --cv-textarea-border-radius: var(--cv-radius-3);
    --cv-textarea-background: var(--cv-color-surface-2);
    --cv-textarea-border-color: var(--cv-color-border-muted);
  }

  .icon-field {
    display: grid;
    gap: var(--cv-space-2);
    min-inline-size: 0;
  }

  .icon-selector {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: var(--cv-space-3);
    inline-size: 100%;
    min-inline-size: 0;
    min-block-size: 4rem;
    padding: var(--cv-space-2) var(--cv-space-3);
    border: 1px solid var(--cv-color-border-muted);
    border-radius: var(--cv-radius-3);
    color: var(--cv-color-text);
    background: var(--cv-color-surface-2);
    box-shadow: none;
    cursor: pointer;
    font: inherit;
    text-align: start;
  }

  .icon-selector:hover {
    border-color: var(--cv-color-border-accent);
    background: var(--cv-color-surface-highlight);
  }

  .icon-selector:focus-visible {
    outline: 2px solid var(--cv-color-primary-ring);
    outline-offset: 2px;
  }

  .icon-selector-preview {
    display: inline-flex;
    flex: 0 0 auto;
    inline-size: 2.75rem;
    block-size: 2.75rem;
    border-radius: var(--cv-radius-2);
    background: var(--cv-color-surface-3);
  }

  .icon-selector-preview pm-avatar-icon {
    --pm-avatar-radius: var(--cv-radius-2);
    --pm-avatar-icon-size: 1.375rem;
    --pm-avatar-image-padding: 0px;
  }

  .icon-selector-action {
    flex: 1 1 auto;
    min-inline-size: 0;
    color: var(--cv-color-text);
    font-size: var(--cv-font-size-sm);
    font-weight: var(--cv-font-weight-semibold);
    text-align: start;
  }

  .icon-selector-chevron {
    flex: 0 0 auto;
    inline-size: 1.125rem;
    block-size: 1.125rem;
    color: var(--cv-color-text-subtle);
  }

  .icon-selector:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .submit-bar {
    --app-mobile-block-end-action-padding: var(--cv-space-3) var(--cv-space-4);
  }

  .submit-bar cv-button {
    inline-size: 100%;
    --cv-button-min-height: 3rem;
    --cv-button-border-radius: var(--cv-radius-3);
  }

  .submit-message {
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-sm);
    line-height: 1.4;
  }

  @supports (-webkit-touch-callout: none) {
    cv-input::part(input),
    cv-textarea::part(textarea) {
      font-size: 16px;
    }
  }

  @container (width <= 360px) {
    .edit-scroll {
      padding-inline: var(--cv-space-3);
    }

    .submit-bar {
      --app-mobile-block-end-action-padding: var(--cv-space-3);
    }
  }
`
