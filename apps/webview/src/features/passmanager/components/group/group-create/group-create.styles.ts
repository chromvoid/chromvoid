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

  .icon-section {
    display: flex;
    flex-direction: column;
    gap: var(--cv-space-2);
    padding: var(--cv-space-3);
    margin-top: var(--cv-space-3);
    background: var(--cv-color-surface-2);
    border: 1px solid var(--cv-color-border);
    border-radius: var(--cv-radius-2);
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

  .icon-section.highlight {
    animation: section-highlight 0.8s ease;
  }

  @keyframes section-highlight {
    0%, 100% { background: var(--cv-color-surface-2); }
    30% { background: var(--cv-color-primary-subtle); }
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
    --pm-group-create-tabbar-clearance: var(--mobile-tab-bar-keyboard-aware-block-size, var(--mobile-tab-bar-block-size, 64px));
    --pm-group-create-submit-clearance: calc(
      var(--safe-area-bottom-active) + var(--visual-viewport-bottom-inset) +
        var(--pm-group-create-tabbar-clearance) + var(--cv-space-3)
    );
    scroll-padding-block-end: calc(var(--pm-group-create-submit-clearance) + var(--cv-space-8));
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
    padding-block-end: calc(var(--pm-group-create-submit-clearance) + var(--cv-space-6));
  }

  .top-bar {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: var(--cv-space-3);
    min-block-size: 3.5rem;
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

  .top-bar-copy {
    display: grid;
    gap: var(--cv-space-1);
    min-inline-size: 0;
  }

  .top-bar h1 {
    font-family: var(--cv-font-family-display);
    font-size: 1.35rem;
    font-weight: var(--cv-font-weight-bold);
    line-height: 1.1;
    letter-spacing: 0;
    color: var(--cv-color-text);
  }

  .top-bar p {
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-sm);
    line-height: 1.35;
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

  .submit-bar {
    position: sticky;
    inset-block-end: calc(
      var(--safe-area-bottom-active) + var(--visual-viewport-bottom-inset) +
        var(--pm-group-create-tabbar-clearance)
    );
    z-index: 1;
    display: grid;
    padding-block-start: var(--cv-space-2);
    background: var(--cv-color-bg);
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
