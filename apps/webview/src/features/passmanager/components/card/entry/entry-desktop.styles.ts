import {css} from 'lit'

import {entrySkeletonStyles} from './entry-skeleton.styles'

const entryDesktopMainStyles = css`
  :host {
    container-type: inline-size;
    --pm-entry-avatar-background: var(--cv-color-primary-dark);
  }

  .wrapper {
    display: grid;
    gap: var(--cv-space-4);
    inline-size: min(100%, 1120px);
    min-inline-size: 0;
    margin-inline: auto;
    padding: 4px 8px var(--cv-space-6);
  }

  pm-workspace-header {
    --pm-header-accent: var(--pm-entry-avatar-background, var(--cv-color-primary));
    --pm-workspace-header-avatar-fallback-background: var(--pm-entry-avatar-background);
    --pm-workspace-header-avatar-fallback-color: var(--cv-color-on-primary);
    --pm-workspace-header-avatar-image-shadow: none;
  }

  back-button {
    --pm-back-button-size: var(--pm-entry-header-control-size);
    --pm-back-button-icon-size: var(--pm-entry-header-control-icon-size);
    --pm-back-button-border-color: var(--pm-control-border);
    --pm-back-button-background: var(--cv-color-surface-2);
  }

  .header-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--cv-space-2);
    margin: 0;
  }

  .entry-primary-action {
    --cv-button-min-height: 36px;
    --cv-button-padding-inline: var(--cv-space-3);
    --cv-button-border-radius: var(--cv-radius-2);
    --cv-button-font-weight: var(--cv-font-weight-semibold);
  }

  .entry-primary-action::part(base) {
    border-color: var(--cv-color-border-muted);
    background: var(--cv-color-surface);
  }

  .entry-actions-menu {
    --cv-menu-button-min-height: 36px;
    --cv-menu-button-border-radius: var(--cv-radius-2);
    --cv-menu-button-menu-align: end;
    --cv-menu-button-menu-min-inline-size: 188px;
    --cv-menu-button-menu-z-index: var(--cv-z-overlay, 300);
  }

  .entry-actions-menu::part(trigger) {
    inline-size: 36px;
    block-size: 36px;
  }

  .entry-actions-menu::part(dropdown-icon) {
    display: none;
  }

  .entry-actions-menu cv-menu-item[data-danger='true'] {
    margin-block-start: var(--cv-space-1);
    padding-block-start: var(--cv-space-1);
    border-block-start: 1px solid var(--cv-color-border-faint);
    --cv-menu-item-color: var(--cv-color-danger);
    --cv-menu-item-hover-color: var(--cv-color-danger);
    --cv-menu-item-hover-background: var(--cv-color-danger-surface);
  }

  .entry-actions-menu cv-menu-item cv-icon {
    inline-size: 1rem;
    block-size: 1rem;
  }

  .entry-edit-actions-shell {
    display: grid;
    justify-items: end;
    gap: 8px;
    min-inline-size: min(100%, 320px);
  }

  .entry-edit-actions {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
  }

  .entry-edit-cancel-action,
  .entry-edit-save-action {
    --cv-button-min-height: 36px;
  }

  .entry-edit-error {
    max-inline-size: 320px;
    color: var(--cv-color-danger);
    font-size: 12px;
    line-height: 1.35;
    text-align: end;
  }

  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: var(--pm-entry-header-control-size);
    block-size: var(--pm-entry-header-control-size);
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
      inline-size: var(--pm-entry-header-control-icon-size);
      block-size: var(--pm-entry-header-control-icon-size);
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

  .entry-workspace {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(250px, 280px);
    align-items: start;
    gap: var(--cv-space-6);
    min-inline-size: 0;
  }

  .entry-main,
  .secondary-section {
    display: grid;
    gap: var(--cv-space-6);
    min-inline-size: 0;
  }

  .entry-primary-section {
    min-inline-size: 0;
    border-block-start: 1px solid var(--cv-color-border-muted);
  }

  .entry-edit-workbench {
    container: entry-edit-workbench / inline-size;
    --pm-entry-workbench-label-track: minmax(112px, 132px);
    --pm-entry-workbench-column-gap: var(--cv-space-4);
    --pm-entry-workbench-field-columns: var(--pm-entry-workbench-label-track) minmax(0, 1fr);
    --pm-entry-workbench-control-column: 2;
    --pm-entry-workbench-label-min-block-size: 36px;
    --pm-entry-workbench-field-row-gap: 0px;
  }

  .entry-section-heading {
    display: flex;
    align-items: center;
    min-block-size: 52px;
    padding-inline: var(--cv-space-4);
    border-block-end: 1px solid var(--cv-color-border-muted);
  }

  .entry-section-heading h2,
  .entry-inspector-heading {
    margin: 0;
    color: var(--cv-color-text);
    font-size: var(--cv-font-size-sm);
    font-weight: var(--cv-font-weight-semibold);
    line-height: var(--cv-line-height-tight);
  }

  .entry-inspector {
    position: sticky;
    inset-block-start: var(--cv-space-3);
    display: grid;
    gap: var(--cv-space-5);
    min-inline-size: 0;
    padding-inline-start: var(--cv-space-5);
    border-inline-start: 1px solid var(--cv-color-border-muted);
  }

  .entry-inspector-section {
    display: grid;
    gap: var(--cv-space-3);
    min-inline-size: 0;
    padding-block-end: var(--cv-space-5);
    border-block-end: 1px solid var(--cv-color-border-muted);
  }

  .entry-inspector-section:last-child {
    padding-block-end: 0;
    border-block-end: 0;
  }

  .entry-details-list {
    display: grid;
    gap: var(--cv-space-3);
    margin: 0;
  }

  .entry-detail-row {
    display: grid;
    grid-template-columns: minmax(88px, 0.8fr) minmax(0, 1.2fr);
    gap: var(--cv-space-3);
    align-items: baseline;
    min-inline-size: 0;
  }

  .entry-detail-row dt,
  .entry-detail-row dd {
    min-inline-size: 0;
    margin: 0;
  }

  .entry-detail-row dt {
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-xs);
  }

  .entry-detail-row dd {
    color: var(--cv-color-text);
    font-size: var(--cv-font-size-xs);
    font-variant-numeric: tabular-nums;
    line-height: var(--cv-line-height-normal);
    overflow-wrap: anywhere;
  }

  .entry-status-list {
    display: grid;
    gap: var(--cv-space-2);
  }

  .entry-status {
    display: flex;
    align-items: center;
    gap: var(--cv-space-2);
    color: var(--cv-color-text-secondary);
    font-size: var(--cv-font-size-xs);
  }

  .entry-status[data-variant='success'] cv-icon {
    color: var(--cv-color-success);
  }

  .entry-status[data-variant='primary'] cv-icon {
    color: var(--cv-color-primary);
  }

  .fields-card {
    display: grid;
    background: transparent;
    border: none;
    border-radius: 0;
    box-shadow: none;
    overflow: visible;
  }

  .credential-field {
    display: grid;
    grid-template-columns: minmax(112px, 132px) minmax(0, 1fr) auto;
    align-items: center;
    column-gap: var(--cv-space-4);
    min-block-size: 58px;
    padding: var(--cv-space-3) var(--cv-space-4);
    border-bottom: 1px solid var(--cv-color-border-muted);
    transition: background-color var(--cv-duration-fast) var(--cv-easing-standard);
  }

  .credential-field:last-child {
    border-bottom: none;
  }

  .credential-field:not(.credential-field-editing):hover {
    background: var(--cv-color-surface-highlight);
  }

  .field-content {
    display: contents;
  }

  .field-content > .field-label {
    grid-column: 1;
  }

  .field-content > .field-value,
  .field-content > .secret-skeleton,
  .field-content > .password-input,
  .field-content > .otp-codes,
  .field-content > .urls-list {
    grid-column: 2;
    min-inline-size: 0;
    align-self: center;
  }

  .field-label {
    font-size: var(--cv-font-size-xs);
    letter-spacing: 0;
    font-weight: var(--cv-font-weight-medium);
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
    font-size: var(--cv-font-size-sm);
    font-weight: var(--cv-font-weight-medium);
    color: var(--cv-color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.4;
  }

  .field-value.empty {
    color: var(--cv-color-text-subtle);
    font-style: italic;
    font-size: var(--cv-font-size-sm);
  }

  .field-value.error {
    color: var(--cv-color-danger);
    font-style: italic;
    font-size: var(--cv-font-size-sm);
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
    font-variant-ligatures: none;
    letter-spacing: 0.08em;
    font-size: var(--cv-font-size-base);
    font-weight: 500;
    color: var(--cv-color-text);
  }

  .field-actions {
    grid-column: 3;
    grid-row: 1;
    display: flex;
    align-items: center;
    align-self: center;
    gap: 8px;
    flex-shrink: 0;
    opacity: 0.72;
    transition: opacity var(--cv-duration-fast) var(--cv-easing-standard);
  }

  .credential-field:not(.credential-field-editing):hover .field-actions {
    opacity: 1;
  }

  cv-copy-button,
  .icon-btn {
    flex-shrink: 0;
  }

  .url-link::part(base) {
    gap: var(--cv-space-2);
    padding: 0;
    background: transparent;
    color: var(--cv-color-primary);
    font-size: var(--cv-font-size-sm);
    font-weight: var(--cv-font-weight-medium);
    text-decoration: none;
    transition: color 0.16s ease;
  }
  .url-link:hover::part(base) {
    color: var(--cv-color-primary-dark);
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

  .website-primary-marker {
    flex: none;
    color: var(--cv-color-primary);
    font-size: var(--cv-font-size-xs);
    font-weight: var(--cv-font-weight-semibold);
  }

  .otp-codes {
    display: grid;
    gap: 10px;
    padding-top: 4px;
    container: entry-otp-codes / inline-size;
  }

  .otp-codes pm-entry-otp-item + pm-entry-otp-item {
    padding-top: 10px;
    border-top: 1px solid var(--cv-color-border-muted);
  }

  .otp-codes pm-entry-otp-item {
    display: block;
    min-inline-size: 0;
  }

  .otp-label-edit-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(180px, 240px);
    gap: 12px;
    align-items: start;
    min-inline-size: 0;
  }

  .otp-label-input {
    min-inline-size: 0;
  }

  .urls-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--cv-space-3);
  }

  .note-card {
    background: transparent;
    border-block-start: 1px solid var(--cv-color-border-muted);
    border-radius: 0;
    box-shadow: none;
    display: flex;
    flex-direction: column;
  }
  .note-card .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-block-size: 52px;
    padding: var(--cv-space-2) var(--cv-space-4);
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
    letter-spacing: 0;
    font-weight: var(--cv-font-weight-medium);
    color: var(--cv-color-text-muted);
  }
  .note-card .card-content {
    padding: var(--cv-space-4);
  }

  .card-actions {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .note-content {
    font-family: var(--cv-font-family-body);
    font-size: var(--cv-font-size-sm);
    line-height: var(--cv-line-height-normal);
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--cv-color-text);
    opacity: 0.9;
  }

  .credential-field-editing {
    align-items: start;
    min-block-size: 0;
    padding-block: var(--cv-space-4);
    background: transparent;
  }

  .field-editor {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: var(--pm-entry-workbench-label-track) minmax(0, 42rem) auto;
    align-items: start;
    justify-content: start;
    min-inline-size: 0;
    column-gap: var(--pm-entry-workbench-column-gap);
    row-gap: var(--cv-space-3);
  }

  .field-editor > .field-label {
    grid-column: 1;
    min-block-size: var(--pm-entry-workbench-label-min-block-size);
    align-self: start;
  }

  .entry-workbench-control-full,
  .field-editor pm-entry-website-editor {
    inline-size: 100%;
  }

  .entry-workbench-control-full {
    grid-column: 2 / -1;
  }

  .password-workbench-value {
    display: grid;
    grid-column: 2;
    gap: var(--cv-space-2);
    min-inline-size: 0;
  }

  .field-editor pm-entry-website-editor {
    grid-column: 1 / -1;
  }

  .note-inline-form {
    display: grid;
    gap: 12px;
  }

  .inline-field-input {
    --cv-input-border-color: var(--cv-color-border-muted);
    --cv-input-border-radius: var(--cv-radius-2);
    --cv-input-background: var(--cv-color-surface-2);
  }

  .note-inline-input {
    --cv-textarea-border-color: var(--cv-color-border-muted);
    --cv-textarea-border-radius: var(--cv-radius-2);
    --cv-textarea-background: var(--cv-color-surface-2);
  }

  .inline-edit-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  .inline-section-card {
    display: flex;
    flex-direction: column;
    gap: var(--cv-space-4);
    padding: var(--cv-space-4);
    background: transparent;
    border-block-start: 1px solid var(--cv-color-border-muted);
    border-radius: 0;
    box-shadow: none;
  }

  .entry-inspector .inline-section-card {
    gap: var(--cv-space-3);
    padding: 0 0 var(--cv-space-5);
    border-block-start: 0;
    border-block-end: 1px solid var(--cv-color-border-muted);
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
    letter-spacing: 0;
    font-weight: var(--cv-font-weight-semibold);
    color: var(--cv-color-text);
  }

  .section-count {
    margin-inline-start: 4px;
  }

  .otp-manage-list,
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

  .password-inline-tools {
    display: flex;
    grid-column: 3;
    grid-row: 1;
    align-items: center;
    justify-self: end;
    gap: var(--cv-space-2);
  }

  .generate-action-button,
  .generator-toggle-button {
    --cv-button-min-height: 36px;
  }

  .generator-toggle-button {
    inline-size: 36px;
    --cv-button-padding-inline: 0;
  }

  .generator-toggle-button[aria-expanded='true']::part(base) {
    border-color: var(--cv-color-primary-border-strong);
    background: var(--cv-color-primary-surface);
    color: var(--cv-color-text);
  }

  .password-generator-panel-shell {
    grid-column: 2 / -1;
    min-inline-size: 0;
  }

  .password-generator-panel {
    display: grid;
    gap: var(--cv-space-3);
    padding: var(--cv-space-3);
    border-radius: var(--cv-radius-2);
    background: var(--cv-color-surface);
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
    min-block-size: 32px;
    padding: var(--cv-space-1) var(--cv-space-3);
    border-radius: var(--cv-radius-2);
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

  .entry-password-strength {
    display: flex;
    align-items: center;
    gap: var(--cv-space-2);
    inline-size: min(100%, 18rem);
  }

  .entry-password-strength-segments {
    display: grid;
    flex: 1 1 auto;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 3px;
    min-inline-size: 7rem;
  }

  .entry-password-strength-segments span {
    block-size: 3px;
    border-radius: 999px;
    background: var(--cv-color-border-muted);
  }

  .entry-password-strength-segments span[data-active='true'] {
    background: var(--cv-color-primary);
  }

  .entry-password-strength-label {
    flex: none;
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-xs);
    white-space: nowrap;
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
  /* Reserve about 400px for the primary pane after the inspector, gap, and wrapper insets. */
  @container (width < 720px) {
    .entry-workspace {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--cv-space-7);
    }

    .entry-inspector {
      position: static;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--cv-space-5);
      padding: var(--cv-space-5) 0 0;
      border-block-start: 1px solid var(--cv-color-border-muted);
      border-inline-start: 0;
    }

    .entry-details-section {
      grid-column: 1 / -1;
      padding-block-end: var(--cv-space-5);
      border-block-end: 1px solid var(--cv-color-border-muted);
    }

    .entry-details-list {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      column-gap: var(--cv-space-5);
    }

    .entry-inspector .entry-tags-section,
    .entry-security-section {
      padding-block-end: 0;
      border-block-end: 0;
    }

    .entry-security-section {
      padding-inline-start: var(--cv-space-5);
      border-inline-start: 1px solid var(--cv-color-border-muted);
    }
  }

  @container (width < 620px) {
    .entry-inspector {
      grid-template-columns: minmax(0, 1fr);
    }

    .entry-details-section,
    .entry-inspector .entry-tags-section,
    .entry-security-section {
      grid-column: auto;
      padding: 0 0 var(--cv-space-5);
      border-block-end: 1px solid var(--cv-color-border-muted);
      border-inline-start: 0;
    }

    .entry-inspector-section:last-child {
      padding-block-end: 0;
      border-block-end: 0;
    }

    .entry-details-list {
      grid-template-columns: minmax(0, 1fr);
    }

    .credential-field {
      grid-template-columns: minmax(96px, 112px) minmax(0, 1fr) auto;
      column-gap: var(--cv-space-3);
    }
  }

  @container (width < 480px) {
    .wrapper {
      gap: var(--cv-space-2);
      padding-inline: 0;
    }

    .credential-field {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-rows: auto auto;
      row-gap: var(--cv-space-1);
      padding: var(--cv-space-3) var(--cv-space-4);
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
      grid-row: 2;
    }

    .field-actions {
      grid-column: 2;
      grid-row: 2;
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

  @container (width >= 600px) {
    .wrapper {
      gap: var(--cv-space-4);
    }
  }

  @container (width >= 1000px) {
    .payment-card-face {
      inline-size: min(100%, 32rem);
    }
  }

  @container entry-edit-workbench (width < 466px) {
    .credential-field-editing {
      grid-template-columns: minmax(0, 1fr);
      row-gap: var(--cv-space-2);
    }

    .field-editor {
      grid-template-columns: minmax(0, 1fr);
      row-gap: var(--cv-space-2);
      --pm-entry-workbench-field-columns: minmax(0, 1fr);
      --pm-entry-workbench-control-column: 1;
      --pm-entry-workbench-label-min-block-size: 0px;
      --pm-entry-workbench-field-row-gap: var(--cv-space-2);
    }

    .field-editor > .field-label,
    .entry-workbench-control-full,
    .password-workbench-value,
    .password-inline-tools,
    .password-generator-panel-shell,
    .field-editor pm-entry-website-editor {
      grid-column: 1;
    }

    .password-inline-tools {
      grid-row: auto;
    }
  }

  /* Keep enough room for an 8-digit TOTP, its timer, and the label editor. */
  @container entry-otp-codes (width < 688px) {
    .otp-label-edit-row {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @container entry-edit-workbench (466px <= width < 520px) {
    .password-workbench-value {
      grid-column: 2 / -1;
    }

    .password-inline-tools {
      grid-column: 2 / -1;
      grid-row: 2;
    }

    .password-generator-panel-shell {
      grid-column: 2 / -1;
      grid-row: 3;
    }
  }

  @container entry-edit-workbench (466px <= width < 588px) {
    .field-editor {
      --pm-entry-workbench-label-track: minmax(96px, 112px);
      --pm-entry-workbench-column-gap: var(--cv-space-3);
      --pm-entry-workbench-field-columns: var(--pm-entry-workbench-label-track) minmax(0, 1fr);
    }
  }
`

export const entryDesktopStyles = css`
  ${entrySkeletonStyles}
  ${entryDesktopMainStyles}
  ${entryDesktopResponsiveStyles}
`
