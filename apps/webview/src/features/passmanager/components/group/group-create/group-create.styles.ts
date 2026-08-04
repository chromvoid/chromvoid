import {css} from 'lit'

export const pmGroupCreateSharedStyles = css`
  :host {
    display: block;
    container-type: inline-size;
  }

  form {
    color: var(--cv-color-text);
  }

  h1,
  h2,
  p,
  span {
    margin: 0;
  }
`

export const pmGroupCreateDesktopStyles = css`
  :host {
    block-size: 100%;
    display: block;
    min-block-size: 0;
  }

  form {
    display: grid;
    align-content: start;
    gap: var(--cv-space-3);
    inline-size: min(100%, 960px);
    min-block-size: 0;
    padding: 4px 6px 6px;
  }

  .panel {
    position: relative;
    inline-size: 100%;
    min-inline-size: 0;
  }

  pm-workspace-header {
    --pm-workspace-header-avatar-fallback-background: var(--cv-color-surface-3);
    --pm-workspace-header-avatar-fallback-color: var(--cv-color-primary);
  }

  .submit {
    min-inline-size: 144px;
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
  }

  .section-label cv-icon {
    width: 13px;
    height: 13px;
    color: var(--cv-color-text-muted);
    opacity: 0.7;
  }

  @container (width < 640px) {
    form {
      padding: var(--cv-space-2);
    }
  }
`

export const pmGroupCreateMobileStyles = css`
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

  .create-scroll,
  .readonly-state {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: var(--cv-space-5);
    min-block-size: 0;
    overflow-x: hidden;
    overflow-y: auto;
    padding: var(--cv-space-1) var(--cv-space-4) var(--cv-space-5);
    overscroll-behavior-y: contain;
    scroll-padding-block-end: var(--cv-space-5);
    -webkit-overflow-scrolling: touch;
  }

  .location-card {
    display: grid;
    gap: var(--cv-space-3);
    padding: var(--cv-space-3) var(--cv-space-4);
    border: 1px solid var(--cv-color-primary-border);
    border-radius: var(--cv-radius-4);
    background: var(--cv-gradient-surface-primary);
  }

  .location-heading {
    display: flex;
    align-items: center;
    gap: var(--cv-space-2);
    color: var(--cv-color-primary);
    font-size: var(--cv-font-size-xs);
    font-weight: var(--cv-font-weight-extrabold);
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .location-heading cv-icon {
    inline-size: 1rem;
    block-size: 1rem;
  }

  .location-path {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--cv-space-1);
    min-inline-size: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .path-separator {
    display: inline-flex;
    align-items: center;
    color: var(--cv-color-text-subtle);
  }

  .path-separator cv-icon {
    inline-size: 0.875rem;
    block-size: 0.875rem;
  }

  .path-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    max-inline-size: min(100%, 10rem);
    padding: 0.3125rem 0.6875rem;
    overflow: hidden;
    border: 1px solid var(--cv-color-border-faint);
    border-radius: var(--cv-radius-2);
    color: var(--cv-color-text-muted);
    background: var(--cv-color-surface-3);
    font-size: var(--cv-font-size-sm);
    font-weight: var(--cv-font-weight-semibold);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .path-chip.current {
    border-color: var(--cv-color-primary-border-strong);
    color: var(--cv-color-text);
    background: var(--cv-color-primary-surface-strong);
  }

  .path-chip.preview {
    border: 1px dashed var(--cv-color-primary-border-strong);
    color: var(--cv-color-primary);
    background: transparent;
  }

  .path-chip cv-icon {
    flex: 0 0 auto;
    inline-size: 0.875rem;
    block-size: 0.875rem;
  }

  .name-field,
  .description-field {
    min-inline-size: 0;
  }

  .field-label {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--cv-space-2);
    min-inline-size: 0;
    inline-size: 100%;
  }

  .field-label-text,
  .section-heading {
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
  .submit-error {
    color: var(--cv-color-danger);
    font-size: var(--cv-font-size-sm);
    line-height: 1.35;
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
    --cv-textarea-min-height: 4.75rem;
    --cv-textarea-border-radius: var(--cv-radius-3);
    --cv-textarea-background: var(--cv-color-surface-2);
    --cv-textarea-border-color: var(--cv-color-border-muted);
  }

  .icon-field {
    display: grid;
    gap: var(--cv-space-3);
    min-inline-size: 0;
  }

  .section-heading {
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-sm);
  }

  .icon-picker-layout {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: var(--cv-space-3);
    min-inline-size: 0;
  }

  .icon-preview {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: 3.5rem;
    block-size: 3.5rem;
    border-radius: var(--cv-radius-3);
    color: var(--cv-color-accent-contrast);
    background: var(--cv-color-primary);
    box-shadow: var(--cv-shadow-md);
  }

  .icon-preview cv-icon {
    inline-size: 1.75rem;
    block-size: 1.75rem;
  }

  .icon-controls {
    display: grid;
    gap: var(--cv-space-2);
    min-inline-size: 0;
  }

  .icon-options,
  .color-options {
    display: flex;
    flex-wrap: wrap;
    gap: var(--cv-space-2);
  }

  .color-options {
    gap: calc(var(--cv-space-1) * 0.5);
  }

  .icon-option,
  .color-option {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    inline-size: 2.75rem;
    block-size: 2.75rem;
    margin: 0;
    padding: 0;
    border: 1px solid var(--cv-color-border-faint);
    border-radius: var(--cv-radius-2);
    color: var(--cv-color-text-muted);
    background: var(--cv-color-surface-2);
    cursor: pointer;
    transition:
      transform var(--cv-duration-fast) var(--cv-easing-standard),
      border-color var(--cv-duration-fast) var(--cv-easing-standard),
      background-color var(--cv-duration-fast) var(--cv-easing-standard);
  }

  .icon-option[aria-pressed='true'] {
    border-color: var(--cv-color-primary-border-strong);
    color: var(--cv-color-primary);
    background: var(--cv-color-primary-surface-strong);
  }

  .icon-option:focus-visible,
  .color-option:focus-visible {
    outline: 2px solid var(--cv-color-focus);
    outline-offset: 2px;
  }

  .icon-option:active,
  .color-option:active {
    transform: scale(0.96);
  }

  .color-option {
    position: relative;
    border-color: transparent;
    background: transparent;
    inline-size: 2.5rem;
    block-size: 2.5rem;
  }

  .color-option::before {
    content: '';
    inline-size: 1.75rem;
    block-size: 1.75rem;
    border-radius: var(--cv-radius-2);
    background: currentColor;
  }

  .color-option[aria-pressed='true']::before {
    outline: 2px solid currentColor;
    outline-offset: 2px;
  }

  .icon-preview.icon-color-violet {
    background: var(--cv-color-accent);
  }

  .color-option.icon-color-violet {
    color: var(--cv-color-accent);
  }

  .icon-preview.icon-color-green {
    background: var(--cv-color-success);
  }

  .color-option.icon-color-green {
    color: var(--cv-color-success);
  }

  .icon-preview.icon-color-blue {
    background: var(--cv-color-group-icon-blue);
  }

  .color-option.icon-color-blue {
    color: var(--cv-color-group-icon-blue);
  }

  .icon-preview.icon-color-pink {
    background: var(--cv-color-group-icon-pink);
  }

  .color-option.icon-color-pink {
    color: var(--cv-color-group-icon-pink);
  }

  .icon-preview.icon-color-amber {
    background: var(--cv-color-warning);
  }

  .color-option.icon-color-amber {
    color: var(--cv-color-warning);
  }

  .icon-preview.icon-color-orange {
    background: var(--cv-color-group-icon-orange);
  }

  .color-option.icon-color-orange {
    color: var(--cv-color-group-icon-orange);
  }

  .icon-preview.icon-color-cyan {
    background: var(--cv-color-primary);
  }

  .color-option.icon-color-cyan {
    color: var(--cv-color-primary);
  }

  .access-hint {
    display: flex;
    align-items: flex-start;
    gap: var(--cv-space-3);
    padding: var(--cv-space-3);
    border: 1px solid var(--cv-color-border-faint);
    border-radius: var(--cv-radius-3);
    background: var(--cv-color-surface-glass-subtle);
  }

  .access-hint-icon {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    inline-size: 2rem;
    block-size: 2rem;
    border-radius: var(--cv-radius-2);
    color: var(--cv-color-primary);
    background: var(--cv-color-primary-surface);
  }

  .access-hint-copy {
    display: grid;
    gap: 0.125rem;
    min-inline-size: 0;
  }

  .access-hint-copy strong {
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-sm);
  }

  .access-hint-copy span {
    color: var(--cv-color-text-subtle);
    font-size: var(--cv-font-size-xs);
    line-height: 1.45;
  }

  .readonly-copy {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--cv-space-3);
    min-block-size: 16rem;
    padding: var(--cv-space-7) var(--cv-space-5);
    text-align: center;
  }

  .readonly-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: 4.75rem;
    block-size: 4.75rem;
    border: 1px solid var(--cv-color-border-faint);
    border-radius: var(--cv-radius-4);
    color: var(--cv-color-text-muted);
    background: var(--cv-color-surface-2);
  }

  .readonly-icon cv-icon {
    inline-size: 2rem;
    block-size: 2rem;
  }

  .readonly-copy h1 {
    font-size: var(--cv-font-size-xl);
    font-weight: var(--cv-font-weight-extrabold);
  }

  .readonly-copy p {
    max-inline-size: 18rem;
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-sm);
    line-height: 1.5;
  }

  .submit-bar {
    --app-mobile-block-end-action-padding: var(--cv-space-3) var(--cv-space-4);
  }

  .submit {
    inline-size: 100%;
    --cv-button-min-height: 3.5rem;
    --cv-button-border-radius: var(--cv-radius-3);
    --cv-button-bg: var(--cv-color-primary);
    --cv-button-color: var(--cv-color-on-primary);
  }

  @supports (-webkit-touch-callout: none) {
    cv-input::part(input),
    cv-textarea::part(textarea) {
      font-size: 16px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .icon-option,
    .color-option {
      transition-duration: 0ms;
    }
  }

  @container (width <= 360px) {
    .create-scroll,
    .readonly-state {
      padding-inline: var(--cv-space-3);
    }

    .color-option {
      inline-size: 2.25rem;
      block-size: 2.75rem;
    }
  }

  @container (width < 340px) {
    .icon-picker-layout {
      grid-template-columns: 1fr;
    }

    .icon-preview {
      inline-size: 3.25rem;
      block-size: 3.25rem;
    }
  }
`
