import {css} from 'lit'

export const entryMobileStyles = css`
  :host {
    display: block;
    block-size: 100%;
    min-block-size: 0;
    overflow: hidden;
    contain: none;
    --entry-avatar-bg: var(--cv-color-primary-dark);
    --cv-mobile-bottom-action-footer-block-size: calc(3.375rem + var(--cv-space-2) + var(--cv-space-2));
    --cv-mobile-bottom-action-scroll-padding-end: calc(
      var(--cv-mobile-bottom-action-footer-block-size) +
      var(--mobile-keyboard-scroll-clearance, 0px) +
      var(--cv-space-4)
    );
  }

  :host(.card) {
    contain: none;
  }

  @keyframes sectionReveal {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .entry-shell {
    display: grid;
    block-size: 100%;
    min-block-size: 0;
    grid-template-rows: auto min-content 0 0;
  }

  .entry-scroll {
    flex: 1 1 auto;
    min-block-size: 0;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior-y: contain;
    scroll-padding-block-end: var(--cv-mobile-bottom-action-scroll-padding-end);
    -webkit-overflow-scrolling: touch;
  }

  .wrapper {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: var(--cv-space-3);
    padding-block-end: var(--cv-space-4);
  }

  .entry-header,
  .quick-actions,
  .primary-card,
  .section-block,
  .secondary-card {
    animation: sectionReveal 220ms var(--cv-easing-spring) both;
  }

  .entry-header {
    display: flex;
    flex-direction: column;
    gap: 0;
    align-items: stretch;
    padding: 8px 10px 10px;
  }

  .entry-header-identity {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: 16px;
    min-inline-size: 0;
  }

  .entry-header-aside {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    min-inline-size: 0;
  }

  .entry-header-avatar {
    inline-size: 80px;
    block-size: 80px;
    flex: 0 0 80px;
    --pm-avatar-radius: var(--cv-radius-2);
    --pm-avatar-icon-size: 32px;
    --pm-avatar-letter-size: 1.45rem;
    --pm-avatar-fallback-bg: var(--entry-avatar-bg);
    --pm-avatar-fallback-color: var(--cv-color-on-primary);
    --pm-avatar-fallback-border: transparent;
    --pm-avatar-fallback-shadow: none;
    --pm-avatar-image-shadow: none;
  }

  .entry-header-avatar-trigger,
  .entry-header-avatar-static {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: 80px;
    block-size: 80px;
    min-inline-size: 80px;
    min-block-size: 80px;
    padding: 0;
    border: none;
    background: transparent;
  }

  .entry-header-avatar-trigger {
    cursor: pointer;
  }

  .entry-header-avatar-static {
    cursor: default;
  }

  .entry-header-avatar-trigger:focus-visible {
    outline: 2px solid var(--cv-color-primary);
    outline-offset: 4px;
  }

  .entry-header-avatar-wrap {
    position: relative;
    inline-size: 80px;
    block-size: 80px;
    flex: 0 0 80px;
  }

  .entry-header-avatar-wrap .entry-header-avatar {
    inline-size: 100%;
    block-size: 100%;
    flex-basis: auto;
  }

  .entry-header-avatar-decoration {
    position: absolute;
    inset-inline-end: -4px;
    inset-block-end: -4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: 22px;
    block-size: 22px;
    padding: 0;
    border-radius: 999px;
    background: var(--cv-color-surface-glass-subtle);
    pointer-events: none;
  }

  .entry-header-avatar-decoration cv-icon {
    font-size: 12px;
    color: var(--cv-color-text);
  }

  .entry-header-avatar-picker-dialog {
    position: absolute;
    inline-size: 0;
    block-size: 0;
    overflow: hidden;
    opacity: 0;
  }

  .entry-title-block {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 6px;
    min-inline-size: 0;
  }

  .entry-title-block-editing {
    justify-content: flex-start;
  }

  .entry-title-row {
    display: flex;
    align-items: start;
    gap: 8px;
    min-inline-size: 0;
  }

  .entry-title {
    flex: 1 1 auto;
    margin: 0;
    min-inline-size: 0;
    font-family: var(--cv-font-family-display);
    font-size: 1.65rem;
    font-weight: var(--cv-font-weight-bold);
    line-height: 1.18;
    letter-spacing: 0;
    color: var(--cv-color-text);
    padding-block: 0.08em 0.12em;
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    text-overflow: ellipsis;
  }

  .entry-title-input {
    --cv-input-background: transparent;
    --cv-input-border-color: transparent;
    --cv-input-padding-inline: 0;
    --cv-input-color: var(--cv-color-text);
    --cv-input-placeholder-color: var(--cv-color-text-muted);
  }

  .entry-title-input::part(form-control-label) {
    display: none;
  }

  .entry-title-input::part(base) {
    padding: 0;
    min-block-size: auto;
    border: none;
    background: transparent;
    box-shadow: none;
  }

  .entry-title-input::part(input) {
    font-family: var(--cv-font-family-display);
    font-size: 1.65rem;
    font-weight: var(--cv-font-weight-bold);
    line-height: 1.18;
    letter-spacing: 0;
    color: var(--cv-color-text);
    padding-block: 0.08em 0.12em;
  }

  .entry-title-edit-action {
    inline-size: 28px;
    block-size: 28px;
    flex: 0 0 28px;
  }

  .edit-icon-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    border-radius: 999px;
    background: transparent;
    color: var(--cv-color-text-muted);
    cursor: pointer;
    transition:
      color var(--cv-duration-fast),
      background-color var(--cv-duration-fast),
      transform var(--cv-duration-fast);
  }

  .edit-icon-action:hover:not(:disabled) {
    color: var(--cv-color-text);
    background: var(--cv-color-surface-tertiary-glass-strong);
    transform: translateY(-1px);
  }

  .edit-icon-action:focus-visible {
    outline: 2px solid var(--cv-color-primary);
    outline-offset: 2px;
  }

  .edit-icon-action:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .edit-icon-action cv-icon {
    font-size: 14px;
  }

  .entry-meta-inline {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    color: var(--cv-color-text-subtle);
    font-size: 0.6875rem;
    line-height: 1.3;
    text-align: left;
  }

  .entry-meta-item {
    display: flex;
    align-items: baseline;
    justify-content: flex-start;
    gap: 6px;
    min-inline-size: 0;
  }

  .entry-meta-label {
    text-transform: lowercase;
    color: var(--cv-color-text-muted);
    white-space: nowrap;
  }

  .entry-meta-value {
    font-family: var(--cv-font-family-code);
    color: var(--cv-color-text-subtle);
    white-space: nowrap;
  }

  .entry-meta-badges {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    flex-shrink: 0;
  }

  .entry-meta-badges cv-badge {
    inline-size: max-content;
    max-inline-size: 100%;
    --cv-badge-height: 20px;
    --cv-badge-padding-inline: 7px;
    --cv-badge-font-size: 10px;
    --cv-badge-gap: 4px;
  }

  .entry-meta-badges cv-icon {
    font-size: 11px;
  }

  .primary-card,
  .section-block,
  .secondary-card {
    display: flex;
    flex-direction: column;
    gap: var(--cv-space-2);
    padding: var(--cv-space-3);
    background: var(--cv-color-surface-secondary-glass);
    border: 1px solid var(--cv-color-border-muted);
    border-radius: var(--cv-radius-3);
  }

  .section-block-primary {
    border-color: var(--cv-color-success-border);
  }

  .section-block-primary .otp-codes pm-entry-otp-item {
    --totp-card-background: transparent;
    --totp-card-border-color: transparent;
    --totp-card-shadow: none;
    --totp-card-hover-shadow: none;
    --totp-card-padding: var(--cv-space-2) var(--cv-space-1) var(--cv-space-1);
    --totp-code-color: var(--cv-color-text);
    --totp-code-font-size: 3.6rem;
    --totp-code-font-size-compact: 3.05rem;
    --totp-code-group-gap: var(--cv-space-6);
    --totp-label-color: var(--cv-color-text-subtle);
    --totp-timer-size: 88px;
    --totp-timer-size-compact: 78px;
  }

  .secondary-stack {
    display: flex;
    flex-direction: column;
    gap: var(--cv-space-3);
  }

  .field-divider {
    block-size: 1px;
    margin-inline: 14px;
    background: var(--cv-color-border-glass);
  }

  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--cv-space-2);
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: var(--cv-font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--cv-color-text-muted);
  }

  .section-title cv-icon {
    font-size: 14px;
    opacity: 0.7;
  }

  .section-block-primary .section-title {
    color: var(--cv-color-success);
  }

  .section-block-primary .section-title cv-icon {
    opacity: 0.85;
  }

  .section-block.secondary-block > .empty-state {
    min-inline-size: 0;
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-xs);
    line-height: 1.45;
    white-space: normal;
  }

  .quick-actions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--cv-space-2);
  }

  .entry-view-add-actions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
    gap: var(--cv-space-2);
  }

  .entry-view-add-action {
    inline-size: 100%;
    min-inline-size: 0;
    min-block-size: 44px;
    display: inline-flex;
    overflow: hidden;
    padding: 8px 10px;
    border: 1px solid var(--cv-color-primary-border);
    border-radius: var(--cv-radius-2);
    background: var(--cv-color-surface-secondary-glass);
    color: var(--cv-color-text);
    font: inherit;
    cursor: pointer;
    touch-action: manipulation;
    transition:
      border-color var(--cv-duration-fast),
      background-color var(--cv-duration-fast),
      transform var(--cv-duration-fast);
  }

  .entry-view-add-action::part(base) {
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    inline-size: 100%;
    min-inline-size: 0;
    white-space: normal;
  }

  .entry-view-add-action::part(label) {
    min-inline-size: 0;
    white-space: normal;
  }

  .entry-view-add-action:hover:not(:disabled) {
    border-color: var(--cv-color-primary-border-strong);
    background: var(--cv-color-surface-2);
    transform: translateY(-1px);
  }

  .entry-view-add-action:focus-visible {
    outline: 2px solid var(--cv-color-primary);
    outline-offset: 2px;
  }

  .entry-view-add-action:disabled {
    cursor: default;
    color: var(--cv-color-text-subtle);
    opacity: 0.6;
  }

  .entry-view-add-action cv-icon {
    flex: 0 0 auto;
    font-size: 16px;
    color: var(--cv-color-accent);
  }

  .entry-view-add-action span {
    min-inline-size: 0;
    overflow-wrap: anywhere;
    white-space: normal;
    font-size: 0.82rem;
    line-height: 1.2;
    font-weight: var(--cv-font-weight-semibold);
  }

  .quick-action {
    inline-size: 100%;
    min-inline-size: 0;
    min-block-size: 68px;
    display: inline-flex;
    overflow: hidden;
    padding: 8px 6px;
    border: 1px solid var(--cv-color-border-muted);
    border-radius: var(--cv-radius-2);
    background: var(--cv-color-surface-secondary-glass);
    color: var(--cv-color-text);
    font: inherit;
    cursor: pointer;
    touch-action: manipulation;
    transition:
      border-color var(--cv-duration-fast),
      background-color var(--cv-duration-fast),
      transform var(--cv-duration-fast);
  }

  .quick-action::part(base) {
    box-sizing: border-box;
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    inline-size: 100%;
    min-inline-size: 0;
    white-space: normal;
  }

  .quick-action::part(label) {
    box-sizing: border-box;
    inline-size: 100%;
    min-inline-size: 0;
    max-inline-size: 100%;
    white-space: normal;
  }

  .quick-action:hover:not(:disabled) {
    border-color: var(--cv-color-primary-border);
    background: var(--cv-color-surface-2);
    transform: translateY(-1px);
  }

  .quick-action:focus-visible {
    outline: 2px solid var(--cv-color-primary);
    outline-offset: 2px;
  }

  .quick-action:disabled {
    cursor: default;
    color: var(--cv-color-text-subtle);
    opacity: 0.55;
  }

  .quick-action cv-icon {
    font-size: 20px;
    color: var(--cv-color-accent);
  }

  .quick-action span {
    display: block;
    inline-size: 100%;
    min-inline-size: 0;
    max-inline-size: 100%;
    overflow-wrap: anywhere;
    white-space: normal;
    text-align: center;
    font-size: 0.72rem;
    line-height: 1.15;
    font-weight: var(--cv-font-weight-semibold);
  }

  .entry-edit-entry-action {
    inline-size: 100%;
  }

  .entry-edit-entry-action,
  .entry-edit-cancel-action,
  .entry-edit-save-action {
    --cv-button-min-height: 3.375rem;
    --cv-button-padding-inline: 1.125rem;
    --cv-button-border-radius: 1rem;
    --cv-button-font-size: 1.0625rem;
    --cv-button-font-weight: 700;
    --cv-button-focus-ring-color: var(--cv-color-primary-ring);
    display: block;
    inline-size: 100%;
    block-size: 3.375rem;
    min-block-size: 3.375rem;
    border: 1px solid var(--pm-entry-action-border-color);
    border-radius: 1rem;
    background: var(--pm-entry-action-background);
    color: var(--pm-entry-action-text-color);
    box-shadow: var(--pm-entry-action-shadow, none);
    font-size: 1.0625rem;
    font-weight: 700;
    line-height: 1;
    overflow: hidden;
    transition: transform 120ms var(--cv-easing-standard);
  }

  .entry-edit-cancel-action {
    --pm-entry-action-border-color: var(--cv-color-border-muted);
    --pm-entry-action-background: var(--cv-color-surface-tertiary-glass-strong);
    --pm-entry-action-text-color: var(--cv-color-text);
  }

  .entry-edit-entry-action,
  .entry-edit-save-action {
    --pm-entry-action-border-color: var(--cv-button-border-color);
    --pm-entry-action-background: var(--cv-button-background);
    --pm-entry-action-text-color: var(--cv-button-text-color);
    --pm-entry-action-shadow:
      var(--cv-shadow-sm),
      0 0 24px var(--cv-color-primary-ring);
  }

  .entry-edit-entry-action::part(base),
  .entry-edit-cancel-action::part(base),
  .entry-edit-save-action::part(base) {
    block-size: 100%;
    min-block-size: 100%;
    border: 0;
    border-radius: inherit;
    background: transparent;
    color: inherit;
    box-shadow: none;
    font-size: 1.0625rem;
    font-weight: 700;
    line-height: 1;
    padding-inline: 1.125rem;
    transition: transform 120ms var(--cv-easing-standard);
  }

  .entry-edit-entry-action:not([disabled]):active::part(base),
  .entry-edit-cancel-action:not([disabled]):active::part(base),
  .entry-edit-save-action:not([disabled]):active::part(base) {
    transform: translateY(1px) scale(0.995);
  }

  .entry-edit-entry-action:not([disabled]):active,
  .entry-edit-cancel-action:not([disabled]):active,
  .entry-edit-save-action:not([disabled]):active {
    transform: translateY(1px) scale(0.995);
  }

  .entry-edit-entry-action[disabled]::part(base),
  .entry-edit-cancel-action[disabled]::part(base),
  .entry-edit-save-action[disabled]::part(base) {
    filter: saturate(0.5);
    opacity: 1;
    box-shadow: none;
    animation: none;
  }

  .entry-edit-entry-action[disabled],
  .entry-edit-cancel-action[disabled],
  .entry-edit-save-action[disabled] {
    filter: saturate(0.5);
    opacity: 1;
    box-shadow: none;
    animation: none;
  }

  .entry-edit-error {
    padding: 10px 12px;
    border: 1px solid var(--cv-color-danger-border);
    border-radius: var(--cv-radius-2);
    background: var(--cv-color-danger-surface);
    color: var(--cv-color-danger);
    font-size: 0.82rem;
    line-height: 1.35;
  }

  .payment-card-face {
    min-block-size: 12rem;
  }

  @media (prefers-reduced-motion: reduce) {
    .entry-header,
    .quick-actions,
    .entry-view-add-actions,
    .entry-view-add-action,
    .primary-card,
    .section-block,
    .secondary-card,
    .entry-edit-entry-action,
    .entry-edit-cancel-action,
    .entry-edit-save-action,
    .entry-view-add-action::part(base),
    .entry-edit-entry-action::part(base),
    .entry-edit-cancel-action::part(base),
    .entry-edit-save-action::part(base) {
      animation: none !important;
      transition: none !important;
    }
  }

  .payment-card-surface {
    padding: 0;
    background: transparent;
    border: none;
    box-shadow: none;
    gap: var(--cv-space-3);
  }

  .section-count::part(base) {
    font-size: 10px;
    padding: 2px 8px;
  }

  .credential-field {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-rows: auto auto;
    align-items: center;
    column-gap: 10px;
    row-gap: 4px;
    padding: 4px 2px;
    min-block-size: 64px;
    background: transparent;
    border: none;
    border-radius: 0;

    .field-label {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 10px;
      font-weight: var(--cv-font-weight-semibold);
      color: var(--cv-color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.12em;

      cv-icon {
        font-size: 12px;
        opacity: 0.6;
      }
    }

    .field-content {
      display: contents;
    }

    .entry-title-gesture-target,
    .entry-title-gesture-target .entry-title,
    .credential-edit-gesture-target,
    .credential-edit-gesture-target .field-label,
    .credential-edit-gesture-target .field-value,
    .credential-edit-gesture-target .password-input {
      -webkit-touch-callout: none;
      user-select: none;
      touch-action: pan-y;
    }

    .credential-edit-gesture-target .password-input::part(input) {
      -webkit-touch-callout: none;
      user-select: none;
    }

    .field-content.inline-editor {
      display: grid;
      gap: 10px;
      grid-column: 1 / -1;
    }

    .field-value {
      grid-column: 1;
      min-inline-size: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 1.06rem;
      font-weight: var(--cv-font-weight-medium);
      color: var(--cv-color-text);
      line-height: 1.4;

      &.masked {
        font-family: var(--cv-font-family-code);
        letter-spacing: 0.15em;
      }

      &.masked.revealed {
        letter-spacing: 0.02em;
      }

      &.empty {
        color: var(--cv-color-text-muted);
        font-style: italic;
        font-size: 0.95rem;
      }

      &.error {
        color: var(--cv-color-danger);
        font-style: italic;
        font-size: 0.95rem;
      }
    }

    .secret-skeleton {
      grid-column: 1;
      padding: 0;
    }

    &.credential-field-primary {
      --entry-mobile-password-action-size: 40px;
    }

    .password-input {
      grid-column: 1;
      display: block;
      min-inline-size: 0;
      block-size: var(--entry-mobile-password-action-size);
      line-height: 0;
      --cv-input-height: var(--entry-mobile-password-action-size);
      --cv-input-background: transparent;
      --cv-input-border-color: transparent;
      --cv-input-padding-inline: 0;
    }

    .password-input::part(base) {
      padding: 0;
      block-size: var(--entry-mobile-password-action-size);
      min-block-size: var(--entry-mobile-password-action-size);
      min-height: auto;
      border: none;
      background: transparent;
    }

    .password-input::part(form-control-label),
    .password-input::part(form-control-help-text) {
      display: none;
    }

    .password-input::part(input) {
      font-size: 1.06rem;
      font-weight: var(--cv-font-weight-medium);
      color: var(--cv-color-text);
      font-family: var(--cv-font-family-code);
      letter-spacing: 0.15em;
      line-height: 1.4;
    }

    .password-input::part(password-toggle) {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      inline-size: var(--entry-mobile-password-action-size);
      block-size: var(--entry-mobile-password-action-size);
      align-self: center;
    }

    .field-actions {
      grid-column: 2;
      grid-row: 2;
      display: flex;
      align-items: center;
      align-self: center;
      gap: 6px;
      flex-shrink: 0;
    }

    cv-copy-button,
    .inline-action {
      flex-shrink: 0;
    }

    cv-copy-button {
      --cv-copy-button-size: var(--entry-mobile-password-action-size, 40px);
      display: block;
      inline-size: var(--cv-copy-button-size);
      block-size: var(--cv-copy-button-size);
      line-height: 0;
    }
  }

  .inline-field-input {
    --cv-input-background: transparent;
  }

  .inline-field-input::part(base) {
    min-block-size: 44px;
  }

  .inline-edit-form {
    display: grid;
    gap: 10px;
    min-inline-size: 0;
  }

  .password-inline-stack {
    display: grid;
    gap: 10px;
  }

  .password-inline-tools {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .generator-toggle-button,
  .generator-option {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-block-size: 36px;
    padding-inline: 12px;
    border: 1px solid var(--cv-color-border-muted);
    border-radius: var(--cv-radius-2);
    background: transparent;
    color: var(--cv-color-text);
    font: inherit;
    cursor: pointer;
    transition:
      border-color var(--cv-duration-fast),
      background-color var(--cv-duration-fast),
      color var(--cv-duration-fast);
  }

  .generator-toggle-button {
    min-inline-size: 36px;
    padding-inline: 0;
  }

  .generator-toggle-button[aria-pressed='true'],
  .generator-option[aria-pressed='true'] {
    border-color: var(--cv-color-primary-border);
    background: var(--cv-color-primary-surface-strong);
    color: var(--cv-color-primary);
  }

  .password-generator-panel {
    display: grid;
    gap: 10px;
    padding: 10px;
    border: 1px solid var(--cv-color-border-muted);
    border-radius: var(--cv-radius-2);
    background: var(--cv-color-surface-tertiary-glass-strong);
  }

  .generator-length-input {
    --cv-input-background: transparent;
  }

  .generator-options {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .generator-option {
    min-inline-size: 64px;
  }

  .inline-password-strength .strength-bar {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .inline-password-strength .strength-track {
    flex: 1;
    block-size: 4px;
    border-radius: 999px;
    background: var(--cv-color-border-glass);
    overflow: hidden;
  }

  .inline-password-strength .strength-fill {
    block-size: 100%;
    border-radius: inherit;
    transition:
      inline-size 0.24s ease,
      background-color 0.24s ease;
  }

  .inline-password-strength .strength-fill.strength-0 {
    inline-size: 20%;
    background: var(--cv-color-danger);
  }

  .inline-password-strength .strength-fill.strength-1 {
    inline-size: 40%;
    background: var(--pm-strength-color-1);
  }

  .inline-password-strength .strength-fill.strength-2 {
    inline-size: 60%;
    background: var(--cv-color-warning);
  }

  .inline-password-strength .strength-fill.strength-3 {
    inline-size: 80%;
    background: var(--pm-strength-color-3);
  }

  .inline-password-strength .strength-fill.strength-4 {
    inline-size: 100%;
    background: var(--cv-color-success);
  }

  .inline-password-strength .strength-label {
    font-size: 0.75rem;
    font-weight: var(--cv-font-weight-semibold);
    white-space: nowrap;
  }

  .inline-password-strength .strength-label.strength-0 {
    color: var(--cv-color-danger);
  }

  .inline-password-strength .strength-label.strength-1 {
    color: var(--pm-strength-color-1);
  }

  .inline-password-strength .strength-label.strength-2 {
    color: var(--cv-color-warning);
  }

  .inline-password-strength .strength-label.strength-3 {
    color: var(--pm-strength-color-3);
  }

  .inline-password-strength .strength-label.strength-4 {
    color: var(--cv-color-success);
  }

  .inline-edit-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-block-start: 8px;
  }

  .note-inline-editor {
    display: grid;
    gap: var(--cv-space-2);
  }

  .note-inline-form {
    display: grid;
    gap: var(--cv-space-2);
  }

  .note-inline-input {
    --cv-textarea-background: transparent;
  }

  .note-inline-input::part(base) {
    min-block-size: 120px;
  }

  .inline-edit-cancel,
  .inline-edit-save {
    flex: 0 0 auto;
  }

  .inline-action,
  .website-open {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-block-size: 36px;
    padding: 7px;
    border: 1px solid var(--cv-color-border-muted);
    border-radius: var(--cv-radius-2);
    background: transparent;
    color: var(--cv-color-text);
    font: inherit;
    cursor: pointer;
    text-decoration: none;
  }

  .website-open {
    font-size: 0.875rem;
    font-weight: var(--cv-font-weight-medium);
    line-height: 1.2;
  }

  .inline-action {
    min-inline-size: 36px;
    padding: 0;
  }

  .inline-action.edit-icon-action,
  .section-action.edit-icon-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-inline-size: 36px;
    min-block-size: 36px;
    padding: 0;
    gap: 0;
    border: 1px solid var(--cv-color-border-muted);
    border-radius: var(--cv-radius-2);
    background: transparent;
    color: var(--cv-color-text);
    font: inherit;
    cursor: pointer;
    text-decoration: none;
  }

  .inline-action cv-icon,
  .section-action cv-icon,
  .website-open cv-icon {
    font-size: 14px;
  }

  .otp-codes {
    display: grid;
    gap: var(--cv-space-2);
  }

  .otp-codes pm-entry-otp-item + pm-entry-otp-item {
    padding-block-start: var(--cv-space-2);
    border-block-start: 1px solid var(--cv-color-border-muted);
  }

  .otp-codes pm-entry-otp-item {
    display: block;
    min-inline-size: 0;
  }

  .otp-manage-list,
  .ssh-manage-list {
    display: grid;
    gap: var(--cv-space-2);
  }

  .ssh-readonly-list {
    display: grid;
    gap: 0;
  }

  .ssh-readonly-list pm-entry-ssh-key {
    display: block;
    min-inline-size: 0;
  }

  .ssh-readonly-list pm-entry-ssh-key + pm-entry-ssh-key {
    border-block-start: 1px solid var(--cv-color-border-muted);
  }

  .otp-inline-create {
    padding-block-start: var(--cv-space-2);
  }

  .website-list {
    display: flex;
    flex-direction: column;
    gap: var(--cv-space-2);
  }

  .website-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--cv-space-2);
    align-items: center;
    padding-block: 2px;
  }

  .website-content {
    min-inline-size: 0;
  }

  .website-name {
    display: block;
    color: var(--cv-color-text);
    font-size: 0.95rem;
    font-weight: var(--cv-font-weight-medium);
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .website-name-empty {
    color: var(--cv-color-text-muted);
    font-style: italic;
  }

  .website-actions {
    display: flex;
    align-items: center;
    gap: var(--cv-space-2);
  }

  .note-card-demoted {
    background: var(--cv-color-surface-2);
    border-color: var(--cv-color-border-muted);
  }

  .note-card-demoted > .note-card {
    display: flex;
    flex-direction: column;
    gap: 0;
    background: transparent;
    border: none;
    border-radius: 0;
    overflow: visible;
  }

  .note-card-demoted .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--cv-space-2);
    padding-inline: 0;
    padding-block-start: 0;
    padding-block-end: var(--cv-space-2);
    border-block-end: 1px solid var(--cv-color-border);
  }

  .note-card-demoted .card-actions {
    display: flex;
    align-items: center;
    gap: var(--cv-space-2);
  }

  .note-card-demoted .card-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: var(--cv-font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--cv-color-text-muted);
  }

  .note-card-demoted .card-title cv-icon {
    font-size: 14px;
    opacity: 0.7;
  }

  .note-card-demoted .note-cv-copy-button {
    --cv-button-min-height: 32px;
    --cv-button-padding-inline: 8px;
    flex-shrink: 0;
  }

  .note-card-demoted .card-content {
    padding-inline: 0;
    padding-block-end: 0;
    padding-block-start: var(--cv-space-2);
  }

  .note-card-demoted .note-content {
    font-family: var(--cv-font-family-code);
    font-size: 0.9rem;
    line-height: 1.65;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--cv-color-text);
  }

  .note-card-demoted .note-skeleton {
    display: flex;
    flex-direction: column;
    gap: var(--cv-space-2);
  }

  .note-card-demoted .skeleton-line {
    block-size: 12px;
    border-radius: var(--cv-radius-1);
    background: var(--cv-gradient-divider-subtle);
    background-size: 200% 100%;
  }

  .note-card-demoted .skeleton-line.short {
    inline-size: 60%;
  }

  .note-card-demoted .empty-state {
    inline-size: 100%;
    min-block-size: 44px;
    min-inline-size: 0;
    box-sizing: border-box;
    padding: 0;
    justify-content: flex-start;
    border: none;
    border-radius: 0;
    background: transparent;
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-xs);
    white-space: normal;
    overflow: hidden;
    text-align: left;
    line-height: 1.45;
  }

  .note-card-demoted .empty-state span {
    display: block;
    min-inline-size: 0;
    max-inline-size: 100%;
    white-space: normal;
    overflow-wrap: anywhere;
    word-break: normal;
  }

`
