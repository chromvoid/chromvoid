import {css} from 'lit'

const pmEntryGenerateMainStyles = css`
  .generate {
    color: var(--cv-color-primary);
    cursor: pointer;
    transition: opacity 0.22s ease-in;

    @starting-style {
      opacity: 0;
    }
  }

  [editing] .generate {
    opacity: 0;
    pointer-events: none;
    display: none;
  }

  :host {
    display: flex;
    flex-direction: column;
    block-size: 100%;
    min-block-size: 0;
    overflow-y: auto;
    overflow-x: hidden;
    contain: content;
    container-type: inline-size;
    scrollbar-width: thin;
    scrollbar-color: color-mix(in oklch, var(--cv-color-text) 25%, transparent) transparent;

    &::-webkit-scrollbar {
      inline-size: 5px;

      &-track {
        background: transparent;
      }

      &-thumb {
        background: color-mix(in oklch, var(--cv-color-text) 20%, transparent);
        border-radius: 3px;

        &:hover {
          background: var(--cv-color-primary);
        }
      }
    }
  }

  .edit-wrapper {
    contain: content;
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    padding-block-end: env(safe-area-inset-bottom, 0px);
    --pm-primary-on: color-mix(in oklch, black 84%, var(--cv-color-text));
  }

  .edit-wrapper cv-button[variant='primary']::part(base) {
    color: var(--pm-primary-on);
  }

  .edit-wrapper cv-button[variant='primary']:hover::part(base) {
    color: var(--pm-primary-on);
  }

  .edit-wrapper cv-button cv-icon {
    font-size: 16px;
    color: currentColor;
  }

  .edit-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.625rem;
    padding: 0.625rem 0.75rem;
    background: linear-gradient(
      145deg,
      color-mix(in oklch, var(--cv-color-surface-2) 88%, var(--cv-color-primary) 12%) 0%,
      color-mix(in oklch, var(--cv-color-surface-2) 94%, var(--cv-color-primary) 6%) 100%
    );
    border: 1px solid color-mix(in oklch, var(--cv-color-border) 75%, var(--cv-color-primary) 25%);
    border-radius: var(--cv-radius-2);
    position: sticky;
    inset-block-start: 0;
    z-index: 10;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    box-shadow: 0 4px 14px color-mix(in oklch, black 14%, transparent);
  }

  .edit-title {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 1rem;
    font-weight: 700;
    color: var(--cv-color-text);

    cv-icon {
      color: var(--cv-color-primary);
      font-size: 1rem;
    }
  }

  .edit-actions-row {
    display: flex;
    gap: 0.375rem;

    cv-button::part(base) {
      min-block-size: 40px;
      border-radius: var(--cv-radius-2);
      font-weight: var(--cv-font-weight-semibold);
      padding-inline: 0.875rem;
    }
  }

  .edit-cancel-btn::part(base) {
    background: color-mix(in oklch, var(--cv-color-surface) 86%, white 14%);
    border: 1px solid color-mix(in oklch, var(--cv-color-border) 70%, white 30%);
    color: var(--cv-color-text);
  }

  .edit-save-btn::part(base) {
    box-shadow: 0 4px 12px color-mix(in oklch, var(--cv-color-primary) 32%, transparent);
    color: var(--pm-primary-on);
  }

  .fields-grid {
    display: grid;
    gap: 0.875rem;
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: 0.4375rem;
    min-inline-size: 0;

    cv-input,
    cv-textarea {
      inline-size: 100%;
    }

    cv-input::part(form-control-label),
    cv-textarea::part(form-control-label) {
      display: block;
      margin-block-end: 0.5rem;
      line-height: 1.15;
    }

    cv-input::part(form-control-help-text),
    cv-textarea::part(form-control-help-text) {
      display: block;
      margin-block-start: 0.375rem;
      line-height: 1.35;
    }

    cv-input {
      --cv-input-font-size-small: 0.8125rem;
    }

    cv-textarea {
      --cv-textarea-font-size: 0.8125rem;
    }

    cv-input::part(base),
    cv-textarea::part(base) {
      background: color-mix(in oklch, var(--cv-color-surface) 92%, black 8%);
      border-color: color-mix(in oklch, var(--cv-color-border) 88%, transparent);
    }

    cv-input::part(base) {
      block-size: 2.625rem;
      padding-inline: 0.875rem;
      gap: 0.625rem;
    }

    cv-input::part(input),
    cv-textarea::part(textarea) {
      font-size: 0.9375rem;
      line-height: 1.35;
    }

    cv-textarea::part(textarea) {
      min-block-size: 7rem;
      padding-inline: 0.875rem;
      padding-block: 0.75rem;
    }
  }

  .title-field {
    grid-column: 1 / -1;
  }

  .password-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .note-group {
    grid-column: 1 / -1;

    cv-textarea {
      --cv-textarea-font-size: 0.8125rem;
    }
  }

  .password-actions {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    margin-block-start: 0.5rem;
    padding: 0;

    cv-copy-button {
      --cv-copy-button-size: 38px;
      flex-shrink: 0;
    }

    cv-button::part(base) {
      min-inline-size: 38px;
      min-block-size: 38px;
      padding: 0;
    }

    cv-icon {
      font-size: 16px;
    }
  }

  .strength-row {
    --strength-color: var(--cv-color-success);
    display: grid;
    gap: 0.375rem;
    min-inline-size: 0;
    padding: 0.125rem 0.25rem 0;
  }

  .strength-row.strength-0 {
    --strength-color: var(--cv-color-danger);
  }

  .strength-row.strength-1 {
    --strength-color: color-mix(in oklch, var(--cv-color-danger) 60%, var(--cv-color-warning));
  }

  .strength-row.strength-2 {
    --strength-color: var(--cv-color-warning);
  }

  .strength-row.strength-3 {
    --strength-color: color-mix(in oklch, var(--cv-color-success) 60%, var(--cv-color-warning));
  }

  .strength-row.strength-4 {
    --strength-color: var(--cv-color-success);
  }

  .strength-meta {
    display: flex;
    justify-content: flex-end;
    min-inline-size: 0;
  }

  .strength-bar {
    inline-size: 100%;
    --cv-progress-height: 4px;
    --cv-progress-track-color: color-mix(in oklch, var(--cv-color-border) 56%, transparent);
    --cv-progress-indicator-color: var(--strength-color);
  }

  .strength-text {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-inline-size: 5.5rem;
    min-block-size: 1.5rem;
    padding-inline: 0.625rem;
    border-radius: 999px;
    border: 1px solid color-mix(in oklch, var(--strength-color) 34%, transparent);
    background: color-mix(in oklch, var(--strength-color) 16%, transparent);
    font-size: 0.6875rem;
    font-weight: 600;
    line-height: 1;
    letter-spacing: 0.01em;
    color: var(--strength-color);
    white-space: nowrap;
    text-align: center;
  }

  @container (width >= 420px) {
    .strength-row {
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 0.75rem;
    }

    .strength-meta {
      grid-column: 2;
      grid-row: 1;
    }

    .strength-bar {
      grid-column: 1;
      grid-row: 1;
    }
  }

  .gen-toggle-btn,
  .gen-btn {
    --cv-button-font-size-small: 0.75rem;
    padding: 0.125rem 0.25rem;
    min-block-size: auto;
    border-radius: var(--cv-radius-2);

    &::part(base) {
      border-color: color-mix(in oklch, var(--cv-color-border) 82%, transparent);
      min-inline-size: 38px;
      min-block-size: 38px;
    }

    &:hover {
      background: color-mix(in oklch, var(--cv-color-primary) 15%, transparent);
      color: var(--cv-color-primary);
    }
  }

  .generator-panel {
    grid-column: 1 / -1;
    padding: 0.625rem 0.75rem;
    background: linear-gradient(
      145deg,
      color-mix(in oklch, var(--cv-color-primary) 8%, var(--cv-color-surface-2)) 0%,
      color-mix(in oklch, var(--cv-color-primary) 3%, var(--cv-color-surface-2)) 100%
    );
    border: 1px solid color-mix(in oklch, var(--cv-color-primary) 25%, var(--cv-color-border));
    border-radius: var(--cv-radius-2);
  }

  .gen-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }

  .gen-label {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--cv-color-text);
    margin: 0;
  }

  .gen-length-input {
    max-inline-size: 60px;
    --cv-input-font-size-small: 0.75rem;
  }

  .gen-charsets {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    flex: 1;
  }

  .gen-opt {
    padding: 0.25rem 0.5rem;
    border-radius: var(--cv-radius-1);
    font-size: 0.75rem;
    font-family: var(--cv-font-family-code);
    font-weight: 600;
    background: color-mix(in oklch, var(--cv-color-surface-2) 85%, black 5%);
    border: 1px solid var(--cv-color-border);
    color: var(--cv-color-text-muted);
    cursor: pointer;
    transition: background-color 0.15s ease;
    user-select: none;

    &:hover {
      border-color: var(--cv-color-primary);
      color: var(--cv-color-text);
    }

    &[checked] {
      border-color: var(--cv-color-primary);
      background: color-mix(in oklch, var(--cv-color-primary) 20%, var(--cv-color-surface-2));
      color: var(--cv-color-primary);
      font-weight: 700;
    }
  }

  .gen-btn-main {
    padding: 0.375rem 0.5rem;
    background: var(--cv-color-primary);
    border-color: var(--cv-color-primary);
    color: var(--pm-primary-on);
    border-radius: var(--cv-radius-1);

    &:hover {
      background: color-mix(in oklch, var(--cv-color-primary) 85%, black);
      color: var(--pm-primary-on);
    }

    cv-icon {
      font-size: 0.875rem;
    }
  }

  .edit-sections-accordion {
    --cv-accordion-gap: 0.875rem;
    --pm-edit-sections-scroll-margin-start: calc(40px + 1.25rem);
    --pm-edit-sections-scroll-margin-end: 0px;
  }

  .edit-sections-accordion cv-accordion-item {
    scroll-margin-block-start: var(--pm-edit-sections-scroll-margin-start);
    scroll-margin-block-end: var(--pm-edit-sections-scroll-margin-end);
  }

  .edit-sections-accordion cv-accordion-item::part(base) {
    gap: 0;
  }

  .edit-sections-accordion cv-accordion-item::part(header) {
    margin: 0;
  }

  .edit-sections-accordion cv-accordion-item::part(trigger) {
    min-block-size: 0;
    padding: 0.625rem 0.75rem;
    border: 1px solid color-mix(in oklch, var(--cv-color-success) 28%, var(--cv-color-border));
    border-radius: var(--cv-radius-2);
    background: linear-gradient(
      145deg,
      color-mix(in oklch, var(--cv-color-success) 11%, var(--cv-color-surface-2)) 0%,
      color-mix(in oklch, var(--cv-color-success) 4%, var(--cv-color-surface-2)) 100%
    );
    transition: background 0.15s ease;
  }

  .edit-sections-accordion cv-accordion-item::part(trigger):hover {
    background: color-mix(in oklch, var(--cv-color-success) 14%, var(--cv-color-surface-2));
  }

  .edit-sections-accordion cv-accordion-item[expanded]::part(trigger) {
    border-end-start-radius: 0;
    border-end-end-radius: 0;
  }

  .edit-sections-accordion cv-accordion-item::part(trigger-icon) {
    color: var(--cv-color-text-muted);
    font-size: 0.625rem;
  }

  .edit-sections-accordion cv-accordion-item::part(panel) {
    margin-block-start: -1px;
    padding: 0;
    border: 1px solid color-mix(in oklch, var(--cv-color-success) 28%, var(--cv-color-border));
    border-block-start: none;
    border-start-start-radius: 0;
    border-start-end-radius: 0;
    border-end-start-radius: var(--cv-radius-2);
    border-end-end-radius: var(--cv-radius-2);
    background: var(--cv-color-surface-2);
  }

  .otp-summary {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    inline-size: 100%;
    min-inline-size: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--cv-color-text);

    cv-icon {
      color: var(--cv-color-success);
      font-size: 1rem;
    }
  }

  .otp-badge {
    margin-inline-start: auto;
    padding: 0.125rem 0.5rem;
    font-size: 0.6875rem;
    font-weight: 600;
    background: var(--cv-color-success);
    color: color-mix(in oklch, black 70%, white);
    border-radius: 999px;
  }

  .otp-content {
    padding: 0.625rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }

  .ssh-key-list {
    display: grid;
    gap: 0.5rem;
  }

  .otp-list-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--cv-space-2);
    margin: 0;

    label {
      margin: 0;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--cv-color-text-muted);
    }
  }

  .otp-list-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-inline-size: 24px;
    min-block-size: 20px;
    padding-inline: 6px;
    border-radius: var(--cv-radius-pill, 999px);
    font-size: 0.6875rem;
    font-weight: 700;
    color: var(--cv-color-text);
    background: color-mix(in oklch, var(--cv-color-surface) 86%, white 14%);
    border: 1px solid color-mix(in oklch, var(--cv-color-border) 80%, transparent);
  }

  .otp-list {
    display: grid;
    gap: 0.5rem;
  }

  .otp-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.625rem;
    border-radius: var(--cv-radius-2);
    background: color-mix(in oklch, var(--cv-color-surface) 88%, black 12%);
    border: 1px solid color-mix(in oklch, var(--cv-color-border) 85%, transparent);
  }

  .otp-item-main {
    min-inline-size: 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
  }

  .otp-item-label {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--cv-color-text);
  }

  .otp-item-type {
    flex-shrink: 0;
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 2px 8px;
    border-radius: var(--cv-radius-pill, 999px);
    color: var(--cv-color-primary);
    background: color-mix(in oklch, var(--cv-color-primary) 14%, transparent);
    border: 1px solid color-mix(in oklch, var(--cv-color-primary) 35%, transparent);
  }

  .otp-item-remove::part(base) {
    min-inline-size: 36px;
    min-block-size: 36px;
    padding: 0;
    border-radius: var(--cv-radius-2);
  }

  .otp-empty {
    margin: 0;
    padding: 0.625rem;
    border-radius: var(--cv-radius-2);
    border: 1px dashed color-mix(in oklch, var(--cv-color-border) 85%, transparent);
    color: var(--cv-color-text-muted);
    font-style: italic;
  }

  .otp-create-panel {
    border-radius: var(--cv-radius-2);
    border: 1px solid color-mix(in oklch, var(--cv-color-border) 82%, var(--cv-color-primary) 18%);
    background: color-mix(in oklch, var(--cv-color-surface) 92%, transparent);
    padding: 0.5rem;
  }

  .otp-create-screen {
    position: fixed;
    inset: 0;
    z-index: calc(var(--cv-z-overlay, 300) + 10);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding-block-start: max(0.75rem, env(safe-area-inset-top, 0px));
    padding-inline: 0.75rem;
    padding-block-end: max(0.75rem, env(safe-area-inset-bottom, 0px));
    background: color-mix(in oklch, var(--cv-color-surface) 94%, black 6%);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }

  .otp-create-screen-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.625rem;
    padding: 0.625rem 0.75rem;
    border-radius: var(--cv-radius-2);
    background: linear-gradient(
      145deg,
      color-mix(in oklch, var(--cv-color-surface-2) 87%, var(--cv-color-success) 13%) 0%,
      color-mix(in oklch, var(--cv-color-surface-2) 93%, var(--cv-color-success) 7%) 100%
    );
    border: 1px solid color-mix(in oklch, var(--cv-color-border) 72%, var(--cv-color-success) 28%);
  }

  .otp-create-screen-title {
    margin: 0;
    font-size: 1rem;
    line-height: 1.2;
    font-weight: 700;
    color: var(--cv-color-text);
  }

  .otp-create-screen-actions {
    display: flex;
    gap: 0.5rem;

    cv-button::part(base) {
      min-block-size: 40px;
      border-radius: var(--cv-radius-2);
      font-weight: var(--cv-font-weight-semibold);
      padding-inline: 0.875rem;
    }
  }

  .otp-create-screen-body {
    flex: 1;
    min-block-size: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .otp-create-screen-footer {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;

    cv-button::part(base) {
      min-block-size: 40px;
      border-radius: var(--cv-radius-2);
      font-weight: var(--cv-font-weight-semibold);
      padding-inline: 0.875rem;
    }
  }

  .otp-btns {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;

    cv-button::part(base) {
      min-block-size: 38px;
      border-radius: var(--cv-radius-2);
      font-weight: var(--cv-font-weight-semibold);
    }
  }

  .otp-add-btn {
    align-self: flex-start;
    margin-block-start: 0.25rem;

    &::part(base) {
      min-block-size: 38px;
      border-radius: var(--cv-radius-2);
      font-weight: var(--cv-font-weight-semibold);
    }
  }

  .preview-text {
    font-size: 0.75rem;
    line-height: 1.35;
    color: var(--cv-color-text-muted);
    font-style: italic;
  }

  .error-text {
    color: var(--cv-color-danger);
    font-size: 0.75rem;
    line-height: 1.35;
    font-weight: 500;
  }
`

const pmEntryGenerateCompatStyles = css`
  @container (width >= 500px) {
    .fields-grid {
      grid-template-columns: 1fr 1fr;
    }

    .title-field,
    .password-group,
    .note-group,
    .generator-panel {
      grid-column: 1 / -1;
    }
  }

  @container (width >= 700px) {
    .password-group {
      grid-column: span 1;
    }

    .gen-charsets {
      flex-wrap: nowrap;
    }
  }

  @container (width < 400px) {
    .edit-header {
      flex-direction: column;
      align-items: stretch;
      gap: 0.5rem;
      padding: 0.5rem 0.625rem;
    }

    .edit-title {
      justify-content: center;
      font-size: 0.9375rem;
    }

    .edit-actions-row {
      justify-content: center;

      cv-button {
        flex: 1;
      }
    }

    .otp-item {
      padding: 0.5rem;
    }

    .otp-create-screen {
      padding-inline: 0.625rem;
      gap: 0.625rem;
    }

    .otp-create-screen-header {
      flex-direction: column;
      align-items: stretch;
      padding: 0.5rem 0.625rem;
    }

    .otp-create-screen-title {
      font-size: 0.9375rem;
      text-align: center;
    }

    .otp-create-screen-actions {
      inline-size: 100%;

      cv-button {
        flex: 1;
      }
    }

    .otp-create-screen-footer {
      inline-size: 100%;

      cv-button {
        flex: 1;
      }
    }

    .gen-row {
      flex-direction: column;
      align-items: stretch;
    }

    .gen-charsets {
      justify-content: center;
    }

    .gen-btn-main {
      inline-size: 100%;
    }
  }

  cv-input[data-has-error] {
    &::part(input),
    &::part(base) {
      border-color: var(--cv-color-danger);
    }
  }
`

export const pmEntryGenerateStyles = css`
  ${pmEntryGenerateMainStyles}${pmEntryGenerateCompatStyles}
`
