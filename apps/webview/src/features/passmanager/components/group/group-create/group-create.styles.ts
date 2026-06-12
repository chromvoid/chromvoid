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
    --pm-workspace-header-avatar-fallback-bg: var(--cv-color-surface-3);
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
    block-size: 100%;
    min-block-size: 0;
    overflow-y: auto;
    overflow-x: hidden;
    contain: layout style paint;
    color: var(--cv-color-text);
    background: var(--cv-color-bg);
   -webkit-overflow-scrolling: touch;
  }

  @supports (-webkit-touch-callout: none) {
    @media (hover: none) and (pointer: coarse) {
      cv-input::part(input),
      cv-textarea::part(textarea) {
        font-size: 16px;
      }
    }
  }

  form {
    display: grid;
    align-content: start;
    gap: var(--cv-space-4);
    box-sizing: border-box;
    min-block-size: 100%;
    padding: var(--app-surface-gutter-mobile, var(--cv-space-3));
  }

  .mobile-create-header {
    display: grid;
    gap: var(--cv-space-1);
  }

  .mobile-create-header h1 {
    font-size: var(--cv-font-size-xl);
    font-weight: var(--cv-font-weight-semibold);
    line-height: 1.15;
    color: var(--cv-color-text);
  }

  .mobile-create-header p {
    font-size: var(--cv-font-size-sm);
    line-height: 1.35;
    color: var(--cv-color-text-muted);
  }

  back-button {
    --back-button-size: 44px;
    --back-button-icon-size: 22px;
    --back-button-radius: 50%;
    --back-button-bg: var(--cv-color-surface-secondary-glass);
    --back-button-border-color: var(--cv-color-border-faint);
    --back-button-color: var(--cv-color-text);
    --back-button-hover-bg: var(--cv-color-primary-surface);
    --back-button-hover-border-color: var(--cv-color-primary-border-strong);
  }

  .form-card {
    display: grid;
    gap: var(--cv-space-3);
    padding: var(--cv-space-4);
    border: 1px solid var(--cv-color-border-faint);
    border-radius: var(--cv-radius-2);
    background: var(--cv-color-surface-secondary-glass-strong);
    box-shadow: 0 var(--cv-space-2) var(--cv-space-6) var(--cv-alpha-black-14);
  }

  .field-group {
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

  .field-label-text {
    display: inline-flex;
    align-items: baseline;
    gap: var(--cv-space-1);
    min-inline-size: 0;
    color: var(--cv-color-text);
    overflow-wrap: anywhere;
  }

  .required-marker {
    color: var(--cv-color-primary);
  }

  .field-counter {
    flex: 0 0 auto;
    color: var(--cv-color-text-subtle);
    font-size: var(--cv-font-size-xs);
    font-variant-numeric: tabular-nums;
  }

  cv-input,
  cv-textarea {
    inline-size: 100%;
  }

  cv-textarea {
    --cv-textarea-min-height: 6.75rem;
  }

  .icon-field {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--cv-space-3);
    min-inline-size: 0;
    padding-block: var(--cv-space-1);
  }

  .icon-field-copy {
    display: grid;
    gap: var(--cv-space-1);
    min-inline-size: 0;
  }

  .icon-field h2 {
    font-size: var(--cv-font-size-sm);
    font-weight: var(--cv-font-weight-semibold);
    line-height: 1.3;
    color: var(--cv-color-text);
  }

  .icon-field p,
  .access-hint {
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-xs);
    line-height: 1.4;
    overflow-wrap: anywhere;
  }

  .icon-picker {
    --pm-icon-picker-trigger-inline-size: 9.75rem;
    --pm-icon-picker-trigger-block-size: 3rem;
    --pm-icon-picker-preview-size: 1.5rem;
    --pm-icon-picker-trigger-radius: var(--cv-radius-2);
    --pm-icon-picker-trigger-bg: var(--cv-color-surface-tertiary-glass);
    --pm-icon-picker-trigger-border: var(--cv-color-border-faint);
    --pm-icon-picker-trigger-shadow: none;
  }


  .submit {
    inline-size: 100%;
    --cv-button-min-height: 3.25rem;
    --cv-button-border-radius: var(--cv-radius-2);
    --cv-button-bg: var(--cv-color-primary);
    --cv-button-color: var(--cv-color-on-primary);
  }

  @container (width < 380px) {
    .form-card {
      padding: var(--cv-space-3);
    }

    .icon-field {
      grid-template-columns: 1fr;
      align-items: stretch;
    }

    .icon-picker {
      --pm-icon-picker-trigger-inline-size: 100%;
    }
  }
`
