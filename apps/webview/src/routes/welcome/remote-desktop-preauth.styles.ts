import {css} from 'lit'

export const remoteDesktopPreauthStyles = css`
  :host {
    display: block;
    min-inline-size: 0;
    color: var(--cv-color-text);
  }

  * {
    box-sizing: border-box;
  }

  button,
  input,
  textarea {
    font: inherit;
  }

  .remote-preauth {
    display: grid;
    gap: var(--cv-space-7);
    inline-size: 100%;
    min-inline-size: 0;
  }

  .screen-header {
    display: grid;
    gap: var(--cv-space-4);
  }

  .back-button {
    display: inline-flex;
    align-items: center;
    justify-self: start;
    gap: var(--cv-space-2);
    min-block-size: 36px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--cv-color-primary);
    cursor: pointer;
  }

  .back-button:hover:not(:disabled) {
    color: var(--cv-color-text-strong);
  }

  .back-button:focus-visible,
  .option-button:focus-visible {
    outline: 2px solid var(--cv-color-focus);
    outline-offset: 3px;
  }

  .back-button:disabled {
    color: var(--cv-color-text-subtle);
    cursor: not-allowed;
  }

  .back-button svg {
    inline-size: 18px;
    block-size: 18px;
    flex: 0 0 auto;
  }

  .screen-copy {
    display: grid;
    gap: var(--cv-space-2);
    max-inline-size: 680px;
  }

  h1,
  h2,
  h3,
  p,
  ol,
  ul,
  dl,
  dd {
    margin: 0;
  }

  h1 {
    color: var(--cv-color-text-strong);
    font-size: clamp(var(--cv-font-size-2xl), 3vw, var(--cv-font-size-3xl));
    line-height: 1.15;
    letter-spacing: -0.025em;
  }

  h2 {
    color: var(--cv-color-text-strong);
    font-size: var(--cv-font-size-lg);
    line-height: 1.3;
  }

  h3 {
    color: var(--cv-color-text-strong);
    font-size: var(--cv-font-size-base);
    line-height: 1.35;
  }

  [data-screen-heading]:focus {
    outline: none;
  }

  .screen-description,
  .row-meta,
  .empty-copy,
  .task-description,
  .pair-steps,
  .option-copy span {
    color: var(--cv-color-text-muted);
    line-height: 1.55;
  }

  .remote-section {
    display: grid;
    gap: var(--cv-space-3);
    padding-block-start: var(--cv-space-5);
    border-block-start: 1px solid var(--cv-color-border-faint);
  }

  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--cv-space-4);
  }

  .section-heading-copy {
    display: grid;
    gap: var(--cv-space-1);
    min-inline-size: 0;
  }

  .device-list,
  .option-list,
  .usb-list {
    display: grid;
    padding: 0;
    list-style: none;
  }

  .device-list,
  .usb-list {
    border-block: 1px solid var(--cv-color-border-faint);
  }

  .device-item {
    display: grid;
    min-inline-size: 0;
  }

  .device-row,
  .usb-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--cv-space-5);
    min-inline-size: 0;
    padding: var(--cv-space-4) 0;
  }

  .device-list > li + li,
  .usb-list > li + li {
    border-block-start: 1px solid var(--cv-color-border-faint);
  }

  .device-main,
  .usb-main {
    display: grid;
    gap: var(--cv-space-1);
    min-inline-size: 0;
  }

  .device-title-line {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--cv-space-2);
    min-inline-size: 0;
  }

  .device-title-line strong,
  .usb-main strong {
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  .device-actions,
  .usb-actions,
  .form-actions,
  .wait-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: var(--cv-space-2);
  }

  .status-label {
    display: inline-flex;
    align-items: center;
    gap: var(--cv-space-2);
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-sm);
    white-space: nowrap;
  }

  .status-label::before {
    content: '';
    inline-size: 7px;
    block-size: 7px;
    flex: 0 0 auto;
    border-radius: var(--cv-radius-full);
    background: var(--cv-color-text-subtle);
  }

  .status-label[data-tone='success'] {
    color: var(--cv-color-success);
  }

  .status-label[data-tone='success']::before {
    background: var(--cv-color-success);
  }

  .status-label[data-tone='warning'] {
    color: var(--cv-color-warning);
  }

  .status-label[data-tone='warning']::before {
    background: var(--cv-color-warning);
  }

  .status-label[data-tone='danger'] {
    color: var(--cv-color-danger);
  }

  .status-label[data-tone='danger']::before {
    background: var(--cv-color-danger);
  }

  .detected-panel {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--cv-space-5);
    padding: var(--cv-space-4) var(--cv-space-5);
    border: 1px solid var(--cv-color-primary-border);
    border-radius: var(--cv-radius-md);
    background: var(--cv-color-primary-surface);
  }

  .detected-copy {
    display: grid;
    gap: var(--cv-space-1);
    min-inline-size: 0;
  }

  .detected-copy p {
    color: var(--cv-color-text-muted);
  }

  .inline-state {
    display: flex;
    align-items: flex-start;
    gap: var(--cv-space-2);
    min-block-size: 28px;
    color: var(--cv-color-text-muted);
    line-height: 1.5;
  }

  .inline-state[data-tone='danger'] {
    color: var(--cv-color-danger);
  }

  .spinner {
    inline-size: 16px;
    block-size: 16px;
    flex: 0 0 auto;
    margin-block-start: 3px;
    border: 2px solid var(--cv-color-primary-ring);
    border-block-start-color: var(--cv-color-primary);
    border-radius: var(--cv-radius-full);
    animation: remote-preauth-spin var(--cv-duration-slowest) linear infinite;
  }

  @keyframes remote-preauth-spin {
    to {
      transform: rotate(1turn);
    }
  }

  .option-list {
    gap: var(--cv-space-2);
  }

  .option-button {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--cv-space-4);
    inline-size: 100%;
    padding: var(--cv-space-3) 0;
    border: 0;
    border-block-end: 1px solid var(--cv-color-border-faint);
    background: transparent;
    color: inherit;
    cursor: pointer;
    text-align: start;
  }

  .option-button:disabled {
    color: var(--cv-color-text-subtle);
    cursor: not-allowed;
  }

  .option-copy {
    display: grid;
    gap: var(--cv-space-1);
    min-inline-size: 0;
  }

  .option-button svg {
    inline-size: 18px;
    block-size: 18px;
    color: var(--cv-color-primary);
  }

  :host(:dir(rtl)) .back-button svg,
  :host(:dir(rtl)) .option-button svg {
    transform: scaleX(-1);
  }

  .pair-layout {
    display: grid;
    grid-template-columns: minmax(220px, 0.7fr) minmax(0, 1.3fr);
    align-items: start;
    gap: clamp(var(--cv-space-6), 4vw, var(--cv-space-8));
  }

  .pair-steps {
    display: grid;
    gap: var(--cv-space-3);
    padding-inline-start: var(--cv-space-5);
  }

  .pair-form,
  .usb-task,
  .wait-task {
    display: grid;
    gap: var(--cv-space-5);
    min-inline-size: 0;
  }

  .form-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--cv-space-4);
  }

  .form-grid .span-all {
    grid-column: 1 / -1;
  }

  cv-input,
  cv-textarea {
    inline-size: 100%;
  }

  cv-textarea {
    --cv-textarea-min-height: 86px;
  }

  .form-error {
    padding: var(--cv-space-3) var(--cv-space-4);
    border-inline-start: 3px solid var(--cv-color-danger);
    background: var(--cv-color-danger-surface);
    color: var(--cv-color-danger-text);
    line-height: 1.5;
  }

  .connection-error {
    display: grid;
    gap: var(--cv-space-3);
    max-inline-size: 760px;
  }

  .task-panel {
    display: grid;
    gap: var(--cv-space-5);
    max-inline-size: 760px;
    padding: var(--cv-space-6);
    border: 1px solid var(--cv-color-border-soft);
    border-radius: var(--cv-radius-lg);
    background: var(--cv-color-surface);
  }

  .task-heading {
    display: grid;
    gap: var(--cv-space-2);
  }

  .task-heading[data-tone='warning'] {
    padding-inline-start: var(--cv-space-4);
    border-inline-start: 3px solid var(--cv-color-warning);
  }

  .task-heading[data-tone='danger'] {
    padding-inline-start: var(--cv-space-4);
    border-inline-start: 3px solid var(--cv-color-danger);
  }

  .approval-form {
    display: grid;
    grid-template-columns: minmax(0, 240px) auto;
    align-items: end;
    gap: var(--cv-space-3);
  }

  .wait-task {
    justify-items: start;
    max-inline-size: 720px;
    padding-block: var(--cv-space-6);
  }

  .wait-eyebrow {
    color: var(--cv-color-warning);
    font-size: var(--cv-font-size-sm);
    font-weight: var(--cv-font-weight-semibold);
  }

  .technical-details {
    max-inline-size: 760px;
  }

  .device-item > .technical-details {
    margin-block-end: var(--cv-space-3);
  }

  .technical-details::part(trigger) {
    min-block-size: 40px;
    padding-inline: var(--cv-space-4);
    border-color: var(--cv-color-border-faint);
    background: transparent;
  }

  .technical-details::part(panel) {
    padding: var(--cv-space-5);
    border-color: var(--cv-color-border-soft);
    background: var(--cv-color-surface-2);
  }

  .details-trigger {
    display: grid;
    gap: var(--cv-space-1);
    min-inline-size: 0;
    text-align: start;
  }

  .details-trigger small {
    color: var(--cv-color-text-muted);
  }

  .detail-list {
    display: grid;
    gap: var(--cv-space-3);
  }

  .detail-list > div {
    display: grid;
    grid-template-columns: minmax(9rem, 0.45fr) minmax(0, 1fr);
    gap: var(--cv-space-4);
    padding-block-end: var(--cv-space-3);
    border-block-end: 1px solid var(--cv-color-border-faint);
  }

  .detail-list dt {
    color: var(--cv-color-text-muted);
  }

  .detail-list dd,
  .detail-list code {
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  .technical-actions {
    display: grid;
    gap: var(--cv-space-3);
    margin: var(--cv-space-5) 0 0;
    padding: var(--cv-space-5) 0 0;
    border-block-start: 1px solid var(--cv-color-border-faint);
    list-style: none;
  }

  .technical-actions li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--cv-space-4);
  }

  .technical-actions bdi {
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  @media (max-width: 760px) {
    .remote-preauth {
      gap: var(--cv-space-6);
    }

    .pair-layout,
    .form-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .form-grid .span-all {
      grid-column: auto;
    }

    .detected-panel,
    .device-row,
    .usb-row {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--cv-space-3);
    }

    .device-actions,
    .usb-actions {
      justify-content: stretch;
    }

    .device-actions cv-button,
    .usb-actions cv-button,
    .detected-panel cv-button {
      inline-size: 100%;
    }

    .approval-form {
      grid-template-columns: minmax(0, 1fr);
      align-items: stretch;
    }

    .detail-list > div {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--cv-space-1);
    }

    .technical-actions li {
      align-items: stretch;
      flex-direction: column;
    }

    .section-heading {
      align-items: flex-start;
      flex-direction: column;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation: none;
      border-block-start-color: var(--cv-color-primary-ring);
    }
  }
`
