import {css} from 'lit'

export const envRuntimeStyles = css`
  :host {
    display: block;
    block-size: 100%;
    min-block-size: 0;
    min-inline-size: 0;
    contain: layout style;
    container-type: inline-size;
    color: var(--cv-color-text);
  }

  * {
    box-sizing: border-box;
  }

  .runtime-page {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: var(--cv-space-3);
    block-size: 100%;
    min-block-size: 0;
    min-inline-size: 0;
    padding: var(--app-surface-gutter-desktop);
  }

  .status-band {
    display: grid;
    grid-template-columns: repeat(5, minmax(118px, 1fr)) auto;
    align-items: stretch;
    min-inline-size: 0;
    border-block: 1px solid var(--cv-color-border-soft);
    background: var(--cv-color-surface-secondary-glass);
  }

  .status-band[data-mode='recovery'] {
    grid-template-columns: repeat(4, minmax(118px, 1fr)) auto;
  }

  .status-item {
    display: grid;
    gap: var(--cv-space-1);
    align-content: center;
    min-inline-size: 0;
    min-block-size: 64px;
    padding: var(--cv-space-3) var(--cv-space-4);
    border-inline-end: 1px solid var(--cv-color-border-soft);
  }

  .status-label,
  .eyebrow {
    color: var(--cv-color-text-subtle);
    font-family: var(--cv-font-family-code);
    font-size: var(--cv-font-size-xs);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .status-value {
    min-inline-size: 0;
    overflow: hidden;
    color: var(--cv-color-text-strong);
    font-size: var(--cv-font-size-sm);
    font-weight: 680;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .status-value[data-state='enabled'],
  .status-value[data-state='running'] {
    color: var(--cv-color-success);
  }

  .status-value[data-state='warning'] {
    color: var(--cv-color-warning);
  }

  .status-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: var(--cv-space-2) var(--cv-space-3);
  }

  .page-alert {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--cv-space-3);
    margin-block-end: var(--cv-space-3);
    padding: var(--cv-space-3) var(--cv-space-4);
    border: 1px solid var(--cv-color-danger-border-strong);
    border-radius: var(--cv-radius-md);
    background: var(--cv-color-danger-surface);
    color: var(--cv-color-text-strong);
  }

  .page-alert p {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .loading-state,
  .access-state {
    display: grid;
    place-items: center;
    align-content: center;
    gap: var(--cv-space-3);
    block-size: 100%;
    padding: var(--cv-space-8);
  }

  .access-state cv-empty-state {
    max-inline-size: 560px;
  }

  .access-state[data-mode='recovery'] {
    block-size: auto;
    min-block-size: 220px;
    padding-block: var(--cv-space-6);
    border-block-end: 1px solid var(--cv-color-border-soft);
  }

  cv-tabs {
    min-block-size: 0;
    min-inline-size: 0;
    block-size: 100%;
  }

  cv-tabs::part(base) {
    grid-template-rows: auto minmax(0, 1fr);
    block-size: 100%;
    min-block-size: 0;
  }

  cv-tabs::part(list) {
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: thin;
  }

  cv-tabs::part(panels) {
    min-block-size: 0;
    overflow: hidden;
    padding: 0;
    background: transparent;
  }

  cv-tab-panel,
  cv-tab-panel::part(base) {
    block-size: 100%;
    min-block-size: 0;
  }

  .section-scroll {
    block-size: 100%;
    min-block-size: 0;
    overflow: auto;
    overscroll-behavior: contain;
    padding: var(--cv-space-4);
    scrollbar-gutter: stable;
  }

  .section-stack {
    display: grid;
    gap: var(--cv-space-6);
    max-inline-size: 1320px;
    margin-inline: auto;
  }

  cv-tab-panel[tab='activity'] .section-stack > [data-readiness-warning] {
    position: sticky;
    inset-block-start: 0;
    z-index: 1;
    background: var(--cv-color-surface);
  }

  .section-block {
    display: grid;
    gap: var(--cv-space-3);
    min-inline-size: 0;
  }

  .section-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--cv-space-4);
    min-inline-size: 0;
  }

  .section-heading-copy {
    display: grid;
    gap: var(--cv-space-1);
    min-inline-size: 0;
  }

  .section-heading h2,
  .section-heading p,
  .subsection-title {
    margin: 0;
  }

  .section-heading h2 {
    color: var(--cv-color-text-strong);
    font-size: var(--cv-font-size-lg);
    line-height: 1.2;
  }

  .section-heading p,
  .helper,
  .meta {
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-sm);
    line-height: 1.45;
  }

  .resource-table {
    display: grid;
    min-inline-size: 0;
    border-block-start: 1px solid var(--cv-color-border-soft);
  }

  .resource-row {
    display: grid;
    grid-template-columns: minmax(210px, 1.1fr) minmax(220px, 1.4fr) minmax(120px, 0.65fr) auto;
    gap: var(--cv-space-4);
    align-items: center;
    min-inline-size: 0;
    padding: var(--cv-space-3) var(--cv-space-2);
    border-block-end: 1px solid var(--cv-color-border-soft);
    contain: content;
  }

  .resource-row[data-kind='approval'] {
    grid-template-columns: minmax(180px, 0.8fr) minmax(280px, 1.4fr) minmax(220px, 1fr) auto;
    border-inline-start: 3px solid var(--cv-color-warning);
    background: var(--cv-color-warning-surface);
  }

  .resource-row[data-kind='proposal'] {
    grid-template-columns: minmax(180px, 1fr) minmax(180px, 0.8fr) minmax(220px, 1fr) auto;
  }

  .resource-row[data-kind='run'] {
    grid-template-columns:
      minmax(180px, 1fr) minmax(140px, 0.65fr) minmax(220px, 1fr) minmax(100px, 0.45fr)
      auto;
  }

  .resource-row[data-kind='agent'] {
    grid-template-columns: minmax(220px, 1fr) minmax(180px, 0.7fr) minmax(180px, 0.7fr) auto;
  }

  .resource-main,
  .resource-detail,
  .resource-meta {
    display: grid;
    gap: var(--cv-space-1);
    min-inline-size: 0;
  }

  .resource-title,
  .command,
  .secret-value {
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  .resource-title {
    color: var(--cv-color-text-strong);
    font-size: var(--cv-font-size-sm);
    font-weight: 680;
  }

  .command,
  .secret-value,
  .identifier,
  .pair-code,
  .pair-command {
    font-family: var(--cv-font-family-code);
  }

  .command,
  .identifier {
    color: var(--cv-color-text-secondary);
    font-size: var(--cv-font-size-xs);
    line-height: 1.45;
  }

  .secret-value {
    max-block-size: 9rem;
    overflow: auto;
    padding: var(--cv-space-2) var(--cv-space-3);
    border: 1px solid var(--cv-color-primary-border);
    border-radius: var(--cv-radius-sm);
    background: var(--cv-color-primary-surface);
    color: var(--cv-color-text-strong);
    font-size: var(--cv-font-size-sm);
    white-space: pre-wrap;
  }

  .chip-row,
  .row-actions,
  .dialog-actions,
  .inline-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--cv-space-2);
  }

  .row-actions,
  .dialog-actions {
    justify-content: flex-end;
  }

  .chip,
  .status-chip {
    display: inline-flex;
    align-items: center;
    max-inline-size: 100%;
    min-block-size: 24px;
    padding-inline: var(--cv-space-2);
    border: 1px solid var(--cv-color-border-soft);
    border-radius: var(--cv-radius-pill);
    background: var(--cv-color-surface-2);
    color: var(--cv-color-text-secondary);
    font-family: var(--cv-font-family-code);
    font-size: var(--cv-font-size-xs);
    overflow-wrap: anywhere;
  }

  .status-chip {
    text-transform: capitalize;
  }

  .status-chip[data-state='pending'],
  .status-chip[data-state='starting'] {
    border-color: var(--cv-color-warning-border);
    color: var(--cv-color-warning);
  }

  .status-chip[data-state='running'],
  .status-chip[data-state='approved'],
  .status-chip[data-state='exited'] {
    border-color: var(--cv-color-success-border);
    color: var(--cv-color-success);
  }

  .status-chip[data-state='rejected'],
  .status-chip[data-state='failed'],
  .status-chip[data-state='signaled'] {
    border-color: var(--cv-color-danger-border);
    color: var(--cv-color-danger);
  }

  cv-empty-state {
    --cv-empty-state-min-block-size: 190px;
  }

  .env-dialog {
    --cv-dialog-width: min(760px, calc(100vw - 48px));
    --cv-dialog-max-height: min(820px, calc(100dvh - 48px));
  }

  .env-dialog.wide {
    --cv-dialog-width: min(900px, calc(100vw - 48px));
  }

  form,
  .dialog-body {
    display: grid;
    gap: var(--cv-space-4);
    min-inline-size: 0;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--cv-space-4);
  }

  .form-grid .span-all {
    grid-column: 1 / -1;
  }

  cv-input,
  cv-textarea,
  cv-select {
    inline-size: 100%;
  }

  .field-error,
  .form-error {
    color: var(--cv-color-danger);
    font-size: var(--cv-font-size-xs);
    line-height: 1.4;
  }

  .security-warning {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--cv-space-2);
    align-items: start;
    margin: var(--cv-space-2) 0 0;
    padding: var(--cv-space-2) var(--cv-space-3);
    border: 1px solid var(--cv-color-warning-border);
    border-radius: var(--cv-radius-sm);
    background: var(--cv-color-warning-surface);
    color: var(--cv-color-text-secondary);
    font-size: var(--cv-font-size-xs);
    line-height: 1.45;
  }

  .security-warning cv-icon {
    color: var(--cv-color-warning);
  }

  .device-store-warning {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--cv-space-3);
    align-items: start;
    padding: var(--cv-space-3) var(--cv-space-4);
    border: 1px solid var(--cv-color-warning-border);
    border-radius: var(--cv-radius-md);
    background: var(--cv-color-warning-surface);
    color: var(--cv-color-text-secondary);
  }

  .device-store-warning cv-icon {
    color: var(--cv-color-warning);
  }

  .device-store-warning strong {
    display: block;
    color: var(--cv-color-text-strong);
    font-size: var(--cv-font-size-sm);
  }

  .device-store-warning p {
    margin: var(--cv-space-1) 0 0;
    font-size: var(--cv-font-size-xs);
    line-height: 1.45;
  }

  .form-error {
    padding: var(--cv-space-3);
    border: 1px solid var(--cv-color-danger-border);
    border-radius: var(--cv-radius-sm);
    background: var(--cv-color-danger-surface);
  }

  .subsection {
    display: grid;
    gap: var(--cv-space-3);
    min-inline-size: 0;
    padding-block-start: var(--cv-space-2);
    border-block-start: 1px solid var(--cv-color-border-soft);
  }

  .subsection-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--cv-space-3);
  }

  .subsection-title {
    color: var(--cv-color-text-strong);
    font-size: var(--cv-font-size-sm);
    font-weight: 680;
  }

  .mapping-list,
  .value-list {
    display: grid;
    gap: var(--cv-space-2);
    min-inline-size: 0;
  }

  .mapping-row {
    display: grid;
    grid-template-columns: minmax(180px, 0.8fr) minmax(220px, 1fr) auto;
    gap: var(--cv-space-2);
    align-items: start;
    min-inline-size: 0;
  }

  .value-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--cv-space-2);
    align-items: center;
  }

  .field-stack {
    display: grid;
    gap: var(--cv-space-1);
    min-inline-size: 0;
  }

  .review-grid,
  .cli-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--cv-space-4);
  }

  .review-item,
  .cli-panel {
    display: grid;
    align-content: start;
    gap: var(--cv-space-2);
    min-inline-size: 0;
    padding: var(--cv-space-4);
    border: 1px solid var(--cv-color-border-soft);
    border-radius: var(--cv-radius-md);
    background: var(--cv-color-surface-secondary-glass);
  }

  .review-item dt,
  .review-item dd {
    margin: 0;
  }

  .review-item dt {
    color: var(--cv-color-text-subtle);
    font-size: var(--cv-font-size-xs);
  }

  .review-item dd {
    color: var(--cv-color-text-strong);
    font-size: var(--cv-font-size-sm);
    overflow-wrap: anywhere;
  }

  .pairing-panel {
    border-color: var(--cv-color-primary-border-strong);
    background: var(--cv-color-primary-surface);
  }

  .pair-code {
    color: var(--cv-color-text-strong);
    font-size: clamp(28px, 4cqi, 42px);
    font-weight: 750;
    letter-spacing: 0.18em;
  }

  .pair-command {
    display: block;
    padding: var(--cv-space-2) var(--cv-space-3);
    border: 1px solid var(--cv-color-border-strong);
    border-radius: var(--cv-radius-sm);
    background: var(--cv-color-surface-1);
    color: var(--cv-color-text-strong);
    overflow-wrap: anywhere;
  }

  @container (width < 980px) {
    .status-band,
    .status-band[data-mode='recovery'] {
      grid-template-columns: repeat(2, minmax(140px, 1fr)) auto;
    }

    .status-item:nth-child(2) {
      border-inline-end: none;
    }

    .resource-row,
    .resource-row[data-kind='approval'],
    .resource-row[data-kind='proposal'],
    .resource-row[data-kind='run'],
    .resource-row[data-kind='agent'] {
      grid-template-columns: minmax(0, 1fr) minmax(180px, 0.8fr) auto;
    }

    .resource-meta {
      display: none;
    }

    .resource-row[data-kind='approval'] {
      grid-template-areas:
        'main detail actions'
        'environment environment environment';
      align-items: start;
    }

    .resource-row[data-kind='approval'] .resource-main {
      grid-area: main;
    }

    .resource-row[data-kind='approval'] .resource-detail {
      grid-area: detail;
    }

    .resource-row[data-kind='approval'] .resource-meta {
      display: grid;
      grid-area: environment;
    }

    .resource-row[data-kind='approval'] .row-actions {
      grid-area: actions;
    }
  }

  @container (width < 720px) {
    .runtime-page {
      padding: var(--app-surface-gutter-compact);
    }

    .status-band,
    .status-band[data-mode='recovery'],
    .form-grid,
    .review-grid,
    .cli-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .status-item {
      border-inline-end: none;
      border-block-end: 1px solid var(--cv-color-border-soft);
    }

    .status-actions {
      justify-content: stretch;
    }

    .status-actions cv-button {
      inline-size: 100%;
    }

    .section-heading,
    .subsection-head {
      align-items: stretch;
      flex-direction: column;
    }

    .resource-row,
    .resource-row[data-kind='approval'],
    .resource-row[data-kind='proposal'],
    .resource-row[data-kind='run'],
    .resource-row[data-kind='agent'],
    .mapping-row {
      grid-template-columns: minmax(0, 1fr);
    }

    .resource-row[data-kind='approval'] {
      grid-template-areas:
        'main'
        'detail'
        'environment'
        'actions';
    }

    .row-actions,
    .dialog-actions {
      justify-content: flex-start;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      scroll-behavior: auto !important;
    }
  }
`
