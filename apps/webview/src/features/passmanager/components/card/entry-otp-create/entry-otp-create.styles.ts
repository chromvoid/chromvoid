import {css} from 'lit'

export const pmEntryOtpCreateStyles = css`
  @supports (-webkit-touch-callout: none) {
    @media (max-width: 768px) {
      cv-input::part(input),
      cv-number::part(input),
      cv-select::part(trigger) {
        font-size: 16px;
      }
    }
  }

  :host([short]) .short-hide {
    display: none;
  }

  :host([layout='card']) {
    display: block;
  }

  .otp-create {
    display: grid;
    gap: 0.625rem;
    padding: 0.625rem;
    margin: 0;
    background: var(--cv-color-primary-surface);
    border: 1px solid var(--cv-color-primary-border);
    border-radius: var(--cv-radius-2);
  }

  .otp-create-card {
    gap: 1rem;
    padding: 0;
    background: transparent;
    border: 0;
    border-radius: 0;
  }

  .otp-create-card cv-input::part(base),
  .otp-create-card cv-number::part(base),
  .otp-create-card cv-select::part(trigger) {
    border-color: var(--cv-color-border);
    background: var(--cv-color-surface-2);
  }

  .otp-create-card cv-input::part(form-control-label),
  .otp-create-card cv-number::part(form-control-label),
  .otp-create-card h4 {
    margin: 0;
    padding: 0 0 0.375rem;
    color: var(--cv-color-text-muted);
    font-size: 0.875rem;
    font-weight: var(--cv-font-weight-medium);
    letter-spacing: 0;
    text-transform: none;
  }

  .otp-helper {
    color: var(--cv-color-text-muted);
    font-size: 0.8125rem;
    line-height: 1.35;
  }

  .otp-helper-valid {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    color: var(--cv-color-success);
  }

  .otp-helper-valid cv-icon {
    inline-size: 0.875rem;
    block-size: 0.875rem;
  }

  .otp-helper-error {
    color: var(--cv-color-danger);
  }

  .qr-hero-button {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.875rem;
    inline-size: 100%;
    min-block-size: 5.625rem;
    padding: 1rem;
    border: 1px solid var(--cv-color-border);
    border-radius: var(--cv-radius-3);
    background: var(--cv-color-surface-2);
    color: var(--cv-color-text);
    text-align: start;
    cursor: pointer;
    transition:
      border-color 160ms var(--cv-easing-standard),
      background 160ms var(--cv-easing-standard),
      box-shadow 160ms var(--cv-easing-standard);
  }

  .qr-hero-button:hover {
    border-color: var(--cv-color-primary-border-strong);
    background: var(--cv-color-primary-surface);
  }

  .qr-hero-button:disabled {
    cursor: default;
    opacity: 0.78;
  }

  .qr-hero-button:disabled:hover {
    border-color: var(--cv-color-border);
    background: var(--cv-color-surface-2);
    box-shadow: none;
  }

  .qr-hero-button:focus-visible {
    outline: 2px solid var(--cv-color-primary);
    outline-offset: 2px;
  }

  .qr-hero-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: 3rem;
    block-size: 3rem;
    border: 1px solid var(--cv-color-primary-border);
    border-radius: var(--cv-radius-2);
    background: var(--cv-color-primary-surface);
    color: var(--cv-color-primary);
  }

  .qr-hero-icon cv-icon {
    inline-size: 1.5rem;
    block-size: 1.5rem;
  }

  .qr-hero-copy {
    display: grid;
    gap: 0.25rem;
    min-inline-size: 0;
  }

  .qr-hero-title {
    color: var(--cv-color-text-strongest);
    font-size: 1rem;
    font-weight: var(--cv-font-weight-bold);
    line-height: 1.2;
  }

  .qr-hero-text {
    color: var(--cv-color-text-muted);
    font-size: 0.875rem;
    line-height: 1.25;
  }

  .qr-hero-chevron {
    inline-size: 1rem;
    block-size: 1rem;
    color: var(--cv-color-text-muted);
  }

  .manual-divider {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: 0.75rem;
    color: var(--cv-color-text-muted);
    font-size: 0.8125rem;
    line-height: 1.2;
  }

  .manual-divider span {
    block-size: 1px;
    background: var(--cv-color-border);
  }

  .manual-divider strong {
    font-weight: var(--cv-font-weight-medium);
  }

  .secret-paste-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: 1.75rem;
    block-size: 1.75rem;
    padding: 0;
    border: 0;
    border-radius: var(--cv-radius-sm);
    background: transparent;
    color: var(--cv-color-text-muted);
    cursor: pointer;
  }

  .secret-paste-button:hover {
    color: var(--cv-color-primary);
    background: var(--cv-color-primary-surface);
  }

  .secret-paste-button:focus-visible {
    outline: 2px solid var(--cv-color-primary);
    outline-offset: 2px;
  }

  .secret-paste-button cv-icon {
    inline-size: 1rem;
    block-size: 1rem;
  }

  .otp-preview {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.875rem;
    min-block-size: 5.75rem;
    padding: 0.875rem;
    border: 1px solid var(--cv-color-border);
    border-radius: var(--cv-radius-3);
    background: var(--cv-color-surface-2);
  }

  .otp-preview-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: 3rem;
    block-size: 3rem;
    border: 1px solid var(--cv-color-border);
    border-radius: var(--cv-radius-2);
    color: var(--cv-color-primary);
    background: var(--cv-color-surface);
  }

  .otp-preview-icon cv-icon {
    inline-size: 1.5rem;
    block-size: 1.5rem;
  }

  .otp-preview-content {
    display: grid;
    min-inline-size: 0;
    gap: 0.25rem;
  }

  .otp-preview-title {
    overflow: hidden;
    color: var(--cv-color-text);
    font-size: 0.875rem;
    font-weight: var(--cv-font-weight-semibold);
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .otp-preview-code {
    color: var(--cv-color-text-strongest);
    font-size: 1.875rem;
    font-weight: var(--cv-font-weight-bold);
    line-height: 1;
    letter-spacing: 0;
  }

  .otp-preview-timer {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-inline-size: 3.25rem;
    block-size: 3.25rem;
    padding-inline: 0.375rem;
    border: 2px solid var(--cv-color-primary-border-strong);
    border-radius: var(--cv-radius-pill);
    color: var(--cv-color-text);
    font-size: 0.8125rem;
    font-weight: var(--cv-font-weight-semibold);
    line-height: 1.15;
    text-align: center;
  }

  .otp-advanced-link {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.75rem;
    inline-size: 100%;
    min-block-size: 4.25rem;
    margin-block-start: 0.25rem;
    padding: 0.75rem;
    border: 1px solid var(--cv-color-border);
    border-radius: var(--cv-radius-3);
    background: var(--cv-color-surface-2);
    color: var(--cv-color-text);
    font: inherit;
    text-align: start;
    cursor: pointer;
    transition:
      border-color var(--cv-duration-fast) var(--cv-easing-standard),
      background var(--cv-duration-fast) var(--cv-easing-standard);
  }

  .otp-advanced-link:hover {
    border-color: var(--cv-color-primary-border-strong);
    background: var(--cv-color-primary-surface);
  }

  .otp-advanced-link:focus-visible {
    outline: 2px solid var(--cv-color-primary);
    outline-offset: 2px;
  }

  .otp-advanced-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: 2.5rem;
    block-size: 2.5rem;
    border-radius: var(--cv-radius-2);
    background: var(--cv-color-primary-surface);
    color: var(--cv-color-primary);
  }

  .otp-advanced-icon cv-icon {
    inline-size: 1.125rem;
    block-size: 1.125rem;
  }

  .otp-advanced-copy {
    display: grid;
    gap: 0.1875rem;
    min-inline-size: 0;
  }

  .otp-advanced-copy strong {
    color: var(--cv-color-text-strongest);
    font-size: 0.9375rem;
    font-weight: var(--cv-font-weight-semibold);
    line-height: 1.2;
  }

  .otp-advanced-copy span {
    color: var(--cv-color-text-muted);
    font-size: 0.8125rem;
    line-height: 1.3;
  }

  .otp-advanced-chevron {
    inline-size: 1rem;
    block-size: 1rem;
    color: var(--cv-color-text-muted);
  }

  .otp-advanced-screen {
    gap: 1.25rem;
  }

  .custom-controls {
    display: grid;
    gap: 1.25rem;
    padding-block-start: 0.25rem;
    border-block-start: 1px solid var(--cv-color-border);
  }

  .otp-advanced-back {
    display: inline-flex;
    align-items: center;
    justify-self: start;
    gap: 0.375rem;
    min-block-size: 2.75rem;
    margin: -0.375rem 0 -0.25rem;
    padding: 0 0.5rem 0 0.125rem;
    border: 0;
    border-radius: var(--cv-radius-2);
    background: transparent;
    color: var(--cv-color-primary);
    font: inherit;
    font-weight: var(--cv-font-weight-semibold);
    cursor: pointer;
  }

  .otp-advanced-back:hover {
    background: var(--cv-color-primary-surface);
  }

  .otp-advanced-back:focus-visible {
    outline: 2px solid var(--cv-color-primary);
    outline-offset: 1px;
  }

  .otp-advanced-back cv-icon {
    inline-size: 1rem;
    block-size: 1rem;
  }

  .radio-field {
    display: grid;
    gap: 0.5rem;
  }

  .radio-field > h4 {
    padding: 0;
  }

  .radio-field cv-radio-group {
    display: block;
    inline-size: 100%;
  }

  .radio-field cv-radio-group::part(base) {
    display: grid;
    inline-size: 100%;
    box-sizing: border-box;
    gap: 0.5rem;
    padding: 0;
    border: 0;
    background: transparent;
  }

  .radio-field-grid cv-radio-group::part(base) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .radio-scroll {
    min-inline-size: 0;
    inline-size: 100%;
    overflow-x: auto;
    overscroll-behavior-inline: contain;
    scroll-snap-type: inline proximity;
    scrollbar-width: none;
  }

  .radio-scroll::-webkit-scrollbar {
    display: none;
  }

  .radio-scroll cv-radio-group {
    inline-size: max-content;
    min-inline-size: 100%;
  }

  .radio-scroll cv-radio-group::part(base) {
    grid-auto-flow: column;
    grid-auto-columns: max-content;
    inline-size: max-content;
    min-inline-size: 100%;
  }

  .radio-scroll cv-radio {
    inline-size: auto;
    min-inline-size: 7.5rem;
    scroll-snap-align: start;
  }

  .radio-field cv-radio {
    display: block;
    box-sizing: border-box;
    inline-size: 100%;
    min-block-size: 3rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--cv-color-border);
    border-radius: var(--cv-radius-2);
    background: var(--cv-color-surface-2);
    cursor: pointer;
  }

  .radio-field cv-radio::part(base) {
    box-sizing: border-box;
    inline-size: 100%;
    background: transparent;
  }

  .radio-field cv-radio[checked] {
    border-color: var(--cv-color-primary-border-strong);
    background: var(--cv-color-primary-surface);
  }

  .advanced-number {
    display: block;
    inline-size: 100%;
  }

  .advanced-number::part(base) {
    inline-size: 100%;
    box-sizing: border-box;
    border: 1px solid var(--cv-color-border);
    border-radius: var(--cv-radius-2);
    background: var(--cv-color-surface-2);
  }

  .advanced-number::part(prefix),
  .advanced-number::part(suffix) {
    color: var(--cv-color-text-muted);
    font-weight: var(--cv-font-weight-medium);
  }

  .advanced-number::part(increment),
  .advanced-number::part(decrement) {
    min-inline-size: 2.75rem;
    min-block-size: 2.75rem;
  }

  .select-field {
    display: grid;
    gap: 0.25rem;
  }

  .secret-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding-bottom: 4px;
    font-size: 0.75rem;
    font-weight: var(--cv-font-weight-semibold);
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--cv-color-text-muted);
  }

  .qr-scan-button {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    min-inline-size: 0;
    min-block-size: 1.625rem;
    padding: 0 0.5rem;
    border: 1px solid var(--cv-color-primary-border);
    border-radius: var(--cv-radius-sm);
    background: var(--cv-color-surface);
    color: var(--cv-color-primary);
    font: inherit;
    letter-spacing: 0;
    text-transform: none;
    cursor: pointer;
  }

  .qr-scan-button cv-icon {
    inline-size: 0.875rem;
    block-size: 0.875rem;
    flex: none;
  }

  .qr-scan-button:disabled {
    cursor: default;
    opacity: 0.72;
  }

  .qr-scan-button:focus-visible {
    outline: 2px solid var(--cv-color-primary);
    outline-offset: 2px;
  }

  .otp-qr-error {
    margin: 0;
    color: var(--cv-color-danger);
    font-size: 0.8125rem;
    line-height: 1.35;
  }

  .select-field > h4 {
    padding-bottom: 0;
  }

  h4 {
    margin: 0;
    padding: 0 0 4px 0;
    font-size: 0.75rem;
    font-weight: var(--cv-font-weight-semibold);
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--cv-color-text-muted);
  }

  h3 {
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 700;
    color: var(--cv-color-text);
  }

  cv-input::part(base),
  cv-number::part(base),
  cv-select::part(trigger) {
    border-color: var(--cv-color-border-strong);
    background: var(--cv-color-surface);
  }

  cv-select {
    --cv-select-inline-size: 100%;
  }

  [slot='help-text'] {
    font-size: 0.6875rem;
    color: var(--cv-color-danger);
  }

  .otp-create-card [slot='help-text'] {
    margin-block-start: 0.375rem;
    font-size: 0.8125rem;
    color: inherit;
  }

  @media (max-width: 360px) {
    .otp-preview {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .otp-preview-icon {
      display: none;
    }

    .otp-preview-code {
      font-size: 1.625rem;
    }
  }

  sl-details::part(content) {
    padding-block-start: 5px;
  }
`
