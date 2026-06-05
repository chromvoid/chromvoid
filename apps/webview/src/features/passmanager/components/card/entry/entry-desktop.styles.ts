import {css} from 'lit'

const entryDesktopMainStyles = css`
  :host {
    container-type: inline-size;
    --entry-avatar-bg: var(--cv-color-primary-dark);
    --entry-header-control-size: 40px;
    --entry-header-control-icon-size: 18px;
  }

  pm-workspace-header {
    --cv-header-accent: var(--entry-avatar-bg, var(--cv-color-primary));
    --pm-workspace-header-avatar-fallback-bg: var(--entry-avatar-bg);
    --pm-workspace-header-avatar-fallback-color: var(--cv-color-on-primary);
    --pm-workspace-header-avatar-image-shadow: none;
  }

  .entry-meta-badges {
    display: flex;
    gap: calc(var(--cv-space-2) * 0.75);
    flex-wrap: wrap;
    align-items: center;
  }

  .entry-header-summary {
    justify-content: flex-end;
  }

  back-button {
    --back-button-size: var(--entry-header-control-size);
    --back-button-icon-size: var(--entry-header-control-icon-size);
    --back-button-border-color: var(--pm-control-border);
    --back-button-bg: var(--cv-color-surface-2);
  }

  .header-actions {
    --cv-toolbar-gap: var(--cv-space-2);
    margin: 0;
    justify-content: flex-end;
  }

  .entry-header-action {
    --cv-toolbar-item-min-height: var(--entry-header-control-size);
    --cv-toolbar-item-padding-inline: 0;
    min-inline-size: var(--entry-header-control-size);
  }

  .entry-header-action::part(base) {
    inline-size: var(--entry-header-control-size);
    block-size: var(--entry-header-control-size);
    min-inline-size: var(--entry-header-control-size);
    padding: 0;
    border: 1px solid var(--pm-control-border);
    border-radius: var(--cv-radius-2);
    background: var(--cv-color-surface-2);
    color: var(--cv-color-text-muted);
  }

  .entry-header-action[data-appearance='ghost']::part(base) {
    border-color: transparent;
    background: transparent;
  }

  .entry-header-action:hover::part(base) {
    background: var(--cv-color-primary-surface);
    border-color: var(--cv-color-primary-border-strong);
    color: var(--cv-color-text);
  }

  .entry-header-action[data-appearance='ghost']:hover::part(base) {
    background: var(--cv-color-surface-tertiary-glass-strong);
    border-color: transparent;
  }

  .entry-header-action:active::part(base) {
    transform: scale(0.96);
  }

  .entry-header-action[disabled]::part(base) {
    opacity: 0.3;
  }

  .entry-header-action-content {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: 100%;
    block-size: 100%;
  }

  .entry-header-action cv-icon {
    inline-size: var(--entry-header-control-icon-size);
    block-size: var(--entry-header-control-icon-size);
  }

  .entry-header-action.danger::part(base) {
    border-color: var(--cv-color-danger-border);
    color: var(--cv-color-danger);
  }

  .entry-header-action.danger:hover::part(base) {
    background: var(--cv-color-danger-surface);
    border-color: var(--cv-color-danger-border-strong);
    color: var(--cv-color-danger);
  }

  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: var(--entry-header-control-size);
    block-size: var(--entry-header-control-size);
    padding: 0;
    border: 1px solid var(--pm-control-border);
    border-radius: var(--cv-radius-2);
    background: var(--cv-color-surface-2);
    color: var(--cv-color-text-muted);
    cursor: pointer;
    transition:
      background-color 0.2s ease,
      border-color 0.2s ease,
      color 0.2s ease,
      transform 0.2s ease;

    cv-icon {
      inline-size: var(--entry-header-control-icon-size);
      block-size: var(--entry-header-control-icon-size);
    }

    &:hover {
      background: var(--cv-color-primary-surface);
      border-color: var(--cv-color-primary-border-strong);
      color: var(--cv-color-text);
    }

    &:active {
      transform: scale(0.96);
    }

    &:disabled {
      opacity: 0.3;
      pointer-events: none;
    }
  }

  .icon-btn.danger {
    border-color: var(--cv-color-danger-border);
    color: var(--cv-color-danger);
  }

  .icon-btn.danger:hover {
    background: var(--cv-color-danger-surface);
    border-color: var(--cv-color-danger-border-strong);
    color: var(--cv-color-danger);
  }

  cv-button.icon-btn {
    display: inline-block;
    width: auto;
  }

  cv-button.icon-btn::part(base) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: var(--cv-button-min-height);
    block-size: var(--cv-button-min-height);
    min-inline-size: var(--cv-button-min-height);
    padding: 0;
    border: 1px solid var(--pm-control-border);
    background: var(--cv-color-surface-2);
    color: var(--cv-color-text-muted);
  }

  cv-button.icon-btn:hover::part(base) {
    background: var(--cv-color-primary-surface);
    border-color: var(--cv-color-primary-border-strong);
    color: var(--cv-color-text);
  }

  cv-button.icon-btn:active::part(base) {
    transform: scale(0.96);
  }

  .secondary-section {
    display: flex;
    flex-direction: column;
    gap: var(--cv-space-4);
  }

  .fields-card {
    display: flex;
    flex-direction: column;
    background: transparent;
    border: none;
    border-radius: 0;
    box-shadow: none;
    overflow: visible;
  }

  .credential-field {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-rows: auto auto;
    column-gap: var(--cv-space-4);
    row-gap: 4px;
    padding: 14px 20px;
    border-bottom: 1px solid var(--cv-color-border-muted);
    transition:
      background-color 0.2s ease,
      padding 0.2s ease;
  }

  .credential-field:last-child {
    border-bottom: none;
  }

  .credential-field:hover {
    background: var(--cv-color-surface-highlight);
  }

  .field-content {
    display: contents;
  }

  .field-content > .field-label {
    grid-column: 1 / -1;
  }

  .field-content > .field-value,
  .field-content > .secret-skeleton,
  .field-content > .password-input,
  .field-content > .otp-codes,
  .field-content > .urls-list {
    grid-column: 1;
    min-inline-size: 0;
    align-self: center;
  }

  .field-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 600;
    color: var(--cv-color-text-secondary);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .field-label cv-icon {
    font-size: 13px;
    opacity: 0.8;
  }

  .field-value {
    font-size: 1.125rem;
    font-weight: 500;
    color: var(--cv-color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.4;
  }

  .field-value.masked {
    font-family: var(--cv-font-family-code);
    letter-spacing: 0.2em;
    font-size: 1.25rem;
    min-height: 1.75rem;
    line-height: 1.75rem;
  }

  .field-value.masked.revealed {
    letter-spacing: 0.02em;
  }

  .field-value.empty {
    color: var(--cv-color-text-subtle);
    font-style: italic;
    font-size: 1rem;
  }

  .field-value.error {
    color: var(--cv-color-danger);
    font-style: italic;
    font-size: 1rem;
  }

  .secret-skeleton {
    padding: 0;
  }

  .password-input {
    flex: 1;
    min-inline-size: 0;
  }

  .password-input::part(base) {
    padding: 0;
    min-height: auto;
    border: none;
    background: transparent;
  }

  .password-input::part(input) {
    font-family: var(--cv-font-family-code);
    letter-spacing: 0.2em;
    font-size: 1.25rem;
    font-weight: 500;
    color: var(--cv-color-text);
  }

  .field-actions {
    grid-column: 2;
    grid-row: 2;
    display: flex;
    align-items: center;
    align-self: center;
    gap: 8px;
    flex-shrink: 0;
    opacity: 0.8;
    transition: opacity 0.2s;
  }

  .credential-field:hover .field-actions {
    opacity: 1;
  }

  cv-copy-button,
  .icon-btn {
    flex-shrink: 0;
  }

  .url-link::part(base) {
    gap: 8px;
    font-size: 1.05rem;
    font-weight: 500;
    padding: 6px 12px;
    background: var(--cv-color-primary-subtle);
    border-radius: 999px;
    text-decoration: none;
    transition:
      background 0.2s,
      color 0.2s;
  }
  .url-link:hover::part(base) {
    background: var(--cv-color-primary-surface-strong);
  }
  .url-link:not([href])::part(base) {
    color: var(--cv-color-text-muted);
    background: transparent;
    pointer-events: none;
  }
  .url-link .website-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-inline-size: 250px;
  }

  .otp-codes {
    display: grid;
    gap: 10px;
    padding-top: 4px;
  }

  .otp-codes pm-entry-otp-item + pm-entry-otp-item {
    padding-top: 10px;
    border-top: 1px solid var(--cv-color-border-muted);
  }

  .otp-codes pm-entry-otp-item {
    display: block;
    min-inline-size: 0;
  }

  .urls-list {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    padding-top: 4px;
  }

  .note-card {
    background: var(--cv-gradient-surface);
    border: 1px solid var(--cv-color-border-strong);
    border-radius: var(--cv-radius-3);
    box-shadow: var(--cv-shadow-1);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
  }
  .note-card .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    border-bottom: 1px solid var(--cv-color-border-muted);
    background: transparent;
  }
  .note-card .note-cv-copy-button {
    --cv-button-min-height: 26px;
    --cv-button-padding-inline: 6px;
    flex-shrink: 0;
  }
  .note-card .card-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
    color: var(--cv-color-text-muted);
  }
  .note-card .card-content {
    padding: 16px 20px;
  }

  .card-actions {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .note-content {
    font-family: var(--cv-font-family-code);
    font-size: 13px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--cv-color-text);
    opacity: 0.9;
  }

  .note-skeleton {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 4px 0;
  }

  .skeleton-line {
    block-size: 12px;
    border-radius: var(--cv-radius-1);
    background: var(--cv-gradient-divider-subtle);
    background-size: 200% 100%;
  }
  .skeleton-line.short {
    inline-size: 40%;
  }

  .credential-field-editing {
    background: var(--cv-color-surface-highlight);
  }

  .field-editor {
    grid-column: 1 / -1;
  }

  .inline-edit-form,
  .note-inline-form {
    display: grid;
    gap: 12px;
  }

  .inline-field-input,
  .note-inline-input {
    --cv-input-background: var(--cv-color-surface-2);
  }

  .inline-edit-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  .generator-toggle-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 8px 14px;
    border: 1px solid var(--cv-color-border-strong);
    border-radius: var(--cv-radius-2);
    background: var(--cv-color-surface-2);
    color: var(--cv-color-text);
    font: inherit;
    cursor: pointer;
  }

  .inline-section-card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 18px 20px;
    background: var(--cv-gradient-surface);
    border: 1px solid var(--cv-color-border-strong);
    border-radius: var(--cv-radius-3);
    box-shadow: var(--cv-shadow-1);
  }

  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .section-title {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
    color: var(--cv-color-text-muted);
  }

  .section-count {
    margin-inline-start: 4px;
  }

  .otp-manage-list,
  .ssh-manage-list,
  .ssh-readonly-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .otp-inline-create {
    display: grid;
    gap: 10px;
  }

  .note-inline-editor {
    display: grid;
    gap: 12px;
  }

  .error-text {
    color: var(--cv-color-danger);
    font-size: 12px;
  }

  .password-inline-stack {
    display: grid;
    gap: 12px;
  }

  .password-inline-tools {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .generator-toggle-button {
    min-block-size: 36px;
  }

  .password-generator-panel {
    display: grid;
    gap: 12px;
    padding: 12px;
    border-radius: var(--cv-radius-2);
    background: var(--cv-color-surface-highlight);
    border: 1px solid var(--cv-color-border-muted);
  }

  .generator-options {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .generator-option {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 6px 12px;
    border-radius: 999px;
    border: 1px solid var(--cv-color-border-strong);
    background: var(--cv-color-surface-2);
    color: var(--cv-color-text);
    font: inherit;
    cursor: pointer;
  }

  .generator-option[aria-pressed='true'] {
    background: var(--cv-color-primary-surface);
    border-color: var(--cv-color-primary-border-strong);
  }

  .inline-password-strength .strength-bar {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .inline-password-strength .strength-track {
    flex: 1;
    block-size: 4px;
    border-radius: 999px;
    background: var(--cv-color-border-muted);
    overflow: hidden;
  }

  .inline-password-strength .strength-fill {
    block-size: 100%;
    border-radius: inherit;
  }

  .inline-password-strength .strength-fill.strength-0 {
    inline-size: 20%;
    background: var(--cv-color-danger);
  }

  .inline-password-strength .strength-fill.strength-1 {
    inline-size: 40%;
    background: var(--cv-color-warning);
  }

  .inline-password-strength .strength-fill.strength-2 {
    inline-size: 60%;
    background: var(--cv-color-warning);
  }

  .inline-password-strength .strength-fill.strength-3 {
    inline-size: 80%;
    background: var(--cv-color-success);
  }

  .inline-password-strength .strength-fill.strength-4 {
    inline-size: 100%;
    background: var(--cv-color-success);
  }

  .inline-password-strength .strength-label {
    font-size: 12px;
    color: var(--cv-color-text-muted);
  }

  .payment-card-surface {
    padding: 0;
    background: transparent;
    border: none;
    box-shadow: none;
  }

  .payment-card-face {
    inline-size: min(100%, 29rem);
  }

`

const entryDesktopResponsiveStyles = css`
  @container (width < 480px) {
    .wrapper {
      gap: var(--cv-space-2);
    }
    .entry-title {
      font-size: calc(var(--cv-font-size-base) * 1.125);
    }
    .credential-field {
      padding: var(--cv-space-3) var(--cv-space-4);
    }
    .field-value {
      font-size: var(--cv-font-size-base);
    }
    .note-card .card-content {
      padding: var(--cv-space-3) var(--cv-space-4);
    }

    .payment-card-face {
      inline-size: 100%;
      min-block-size: 12.5rem;
      padding: 0.95rem 1rem 1rem;
      gap: 0.72rem;
      aspect-ratio: 1.42;
    }

    .payment-card-face::before {
      inline-size: 8.75rem;
      block-size: 8.75rem;
      inset-inline-start: 72%;
      inset-block-start: -18%;
    }

    .payment-card-face::after {
      inline-size: 8.1rem;
      block-size: 8.1rem;
      inset-inline-end: -8%;
      inset-block-end: -18%;
    }

    .payment-card-face-top,
    .payment-card-chip-row,
    .payment-card-face-bottom {
      gap: var(--cv-space-2);
    }

    .payment-card-brand-cluster {
      gap: 0.35rem;
    }

    .payment-card-caption {
      font-size: 0.54rem;
      letter-spacing: 0.14em;
    }

    .payment-card-issuer {
      font-size: 0.82rem;
    }

    .payment-card-brand {
      font-size: 0.92rem;
      letter-spacing: 0.08em;
    }

    .payment-card-inline-action {
      inline-size: var(--pm-action-copy-size-compact);
      block-size: var(--pm-action-copy-size-compact);
    }

    .payment-card-inline-copy {
      --cv-copy-button-size: var(--pm-action-copy-size-compact);
    }

    .payment-card-inline-action cv-icon {
      font-size: 0.8rem;
    }

    .payment-card-chip {
      inline-size: 2.9rem;
      block-size: 2.2rem;
      padding: 0.4rem;
      border-radius: 0.64rem;
    }

    .payment-card-cvv-badge {
      padding: 0.42rem 0.56rem;
    }

    .payment-card-cvv-actions {
      gap: 0.2rem;
    }

    .payment-card-cvv-toggle {
      inline-size: 1.4rem;
      block-size: 1.4rem;
    }

    .payment-card-cvv-toggle cv-icon {
      font-size: 0.76rem;
    }

    .payment-card-number-block {
      gap: 0.46rem;
    }

    .payment-card-number-head {
      gap: var(--cv-space-2);
    }

    .payment-card-number {
      font-size: 1.02rem;
      letter-spacing: 0.13em;
      word-spacing: 0.02em;
    }

    .payment-card-meta-value,
    .payment-card-expiry-separator {
      font-size: 0.78rem;
    }

    .payment-card-cvv-value {
      font-size: 0.82rem;
      letter-spacing: 0.16em;
    }

    .payment-card-cvv-value.is-masked {
      letter-spacing: 0.24em;
    }
  }

  @container (width < 420px) {
    .payment-card-face {
      min-block-size: 12.75rem;
      padding: 0.82rem 0.86rem 0.9rem;
      gap: 0.62rem;
      aspect-ratio: 1.28;
      border-radius: 1.25rem;
    }

    .payment-card-face::before {
      inline-size: 7rem;
      block-size: 7rem;
    }

    .payment-card-face::after {
      inline-size: 6.6rem;
      block-size: 6.6rem;
      inset-block-end: -14%;
    }

    .payment-card-caption {
      font-size: 0.5rem;
      letter-spacing: 0.12em;
    }

    .payment-card-issuer {
      font-size: 0.76rem;
    }

    .payment-card-brand {
      font-size: 0.84rem;
      letter-spacing: 0.07em;
    }

    .payment-card-inline-action {
      inline-size: var(--pm-action-copy-size-dense);
      block-size: var(--pm-action-copy-size-dense);
    }

    .payment-card-inline-copy {
      --cv-copy-button-size: var(--pm-action-copy-size-dense);
    }

    .payment-card-chip {
      inline-size: 2.65rem;
      block-size: 2rem;
      padding: 0.34rem;
      border-radius: 0.58rem;
    }

    .payment-card-number {
      font-size: 0.92rem;
      letter-spacing: 0.08em;
      word-spacing: 0;
    }

    .payment-card-meta-value,
    .payment-card-expiry-separator {
      font-size: 0.72rem;
    }

    .payment-card-cvv-value {
      font-size: 0.76rem;
      letter-spacing: 0.14em;
    }

    .payment-card-cvv-value.is-masked {
      letter-spacing: 0.2em;
    }
  }

  @media (hover: none) and (pointer: coarse) {
    .icon-btn {
      width: 40px;
      height: 40px;
    }
    .credential-field cv-button.icon-btn {
      --cv-button-min-height: 36px;
    }
  }

  @container (width >= 600px) {
    .wrapper {
      gap: var(--cv-space-4);
    }
    .entry-title {
      font-size: 1.5rem;
    }
    .field-value.masked {
      font-size: var(--cv-font-size-lg);
      min-height: 2rem;
      line-height: 2rem;
    }
  }

  @container (width >= 1000px) {
    .entry-title {
      font-size: 1.75rem;
    }
    .field-value.masked {
      font-size: 1.5rem;
      min-height: 2.25rem;
      line-height: 2.25rem;
    }

    .payment-card-face {
      inline-size: min(100%, 32rem);
    }
  }

`

export const entryDesktopStyles = css`
  ${entryDesktopMainStyles}
  ${entryDesktopResponsiveStyles}
`
