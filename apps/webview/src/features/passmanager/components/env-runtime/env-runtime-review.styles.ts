import {css} from 'lit'

export const envRuntimeReviewStyles = css`
  .review-dialog::part(content) {
    grid-template-rows: auto minmax(0, 1fr) auto;
    overflow: hidden;
  }

  .review-dialog::part(header) {
    grid-row: 1;
  }

  .review-dialog::part(body) {
    grid-row: 2;
    min-block-size: 0;
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
  }

  .review-dialog::part(footer) {
    grid-row: 3;
  }

  .review-grid .span-all {
    grid-column: 1 / -1;
  }

  .review-item dd {
    display: grid;
    gap: var(--cv-space-1);
  }

  .review-item code,
  .fact-list code,
  .source-list code {
    min-inline-size: 0;
    color: var(--cv-color-text-secondary);
    font-family: var(--cv-font-family-code);
    font-size: var(--cv-font-size-xs);
    overflow-wrap: anywhere;
  }

  .countdown {
    margin-inline-start: var(--cv-space-1);
    color: var(--cv-color-warning);
    white-space: nowrap;
  }

  .review-section {
    display: grid;
    gap: var(--cv-space-2);
    min-inline-size: 0;
    padding-block-start: var(--cv-space-3);
    border-block-start: 1px solid var(--cv-color-border-soft);
  }

  .review-section h3,
  .untrusted-note h3,
  .comparison-pane h3,
  .delete-result p {
    margin: 0;
  }

  .review-section h3,
  .untrusted-note h3,
  .comparison-pane h3 {
    color: var(--cv-color-text-strong);
    font-size: var(--cv-font-size-sm);
  }

  .source-list,
  .fact-list {
    display: grid;
    min-inline-size: 0;
    margin: 0;
  }

  .source-row,
  .fact-list > div,
  .binding-fact {
    display: grid;
    grid-template-columns: minmax(130px, 0.7fr) minmax(0, 1fr);
    gap: var(--cv-space-3);
    min-inline-size: 0;
    padding-block: var(--cv-space-2);
    border-block-end: 1px solid var(--cv-color-border-soft);
  }

  .source-row:first-child,
  .fact-list > div:first-child,
  .binding-fact:first-child {
    border-block-start: 1px solid var(--cv-color-border-soft);
  }

  .source-row dt,
  .source-row dd,
  .fact-list dt,
  .fact-list dd {
    min-inline-size: 0;
    margin: 0;
  }

  .source-row dd {
    display: grid;
    gap: var(--cv-space-1);
  }

  .source-row dt,
  .fact-list dt {
    color: var(--cv-color-text-subtle);
    font-size: var(--cv-font-size-xs);
  }

  .source-row dd,
  .fact-list dd,
  .binding-fact span {
    color: var(--cv-color-text-secondary);
    font-size: var(--cv-font-size-sm);
    overflow-wrap: anywhere;
  }

  .collision-note {
    color: var(--cv-color-warning);
    font-size: var(--cv-font-size-xs);
  }

  .untrusted-note {
    display: grid;
    grid-template-columns: minmax(150px, 0.35fr) minmax(0, 1fr);
    gap: var(--cv-space-4);
    min-inline-size: 0;
    padding: var(--cv-space-3);
    border-inline-start: 3px solid var(--cv-color-warning);
    background: var(--cv-color-warning-surface);
  }

  .untrusted-note p {
    min-inline-size: 0;
    margin: 0;
    color: var(--cv-color-text-secondary);
    font-size: var(--cv-font-size-sm);
    line-height: 1.5;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }

  .security-warning-prominent {
    margin: 0;
    padding: var(--cv-space-3) var(--cv-space-4);
    font-size: var(--cv-font-size-sm);
  }

  .review-comparison {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    min-inline-size: 0;
    border-block: 1px solid var(--cv-color-border-soft);
  }

  .comparison-pane {
    display: grid;
    align-content: start;
    gap: var(--cv-space-3);
    min-inline-size: 0;
    padding: var(--cv-space-4);
  }

  .comparison-pane + .comparison-pane {
    border-inline-start: 1px solid var(--cv-color-border-soft);
  }

  .comparison-kicker {
    color: var(--cv-color-text-subtle);
    font-family: var(--cv-font-family-code);
    font-size: var(--cv-font-size-xs);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .comparison-empty {
    margin: 0;
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-sm);
  }

  .binding-review,
  .binding-editor {
    display: grid;
    gap: var(--cv-space-2);
    min-inline-size: 0;
  }

  .binding-fact code {
    color: var(--cv-color-text-strong);
  }

  .binding-editor .mapping-row {
    grid-template-columns: minmax(130px, 0.7fr) minmax(190px, 1fr);
  }

  .delete-result {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--cv-space-3);
    align-items: start;
    padding: var(--cv-space-3);
    border: 1px solid var(--cv-color-danger-border);
    border-radius: var(--cv-radius-sm);
    background: var(--cv-color-danger-surface);
    color: var(--cv-color-text-secondary);
  }

  .delete-result cv-icon {
    color: var(--cv-color-danger);
  }

  .delete-result strong {
    display: block;
    margin-block-end: var(--cv-space-1);
    color: var(--cv-color-text-strong);
    font-size: var(--cv-font-size-sm);
  }

  .delete-result p {
    font-size: var(--cv-font-size-xs);
    line-height: 1.45;
  }

  @container (width < 720px) {
    .review-comparison,
    .untrusted-note,
    .binding-editor .mapping-row,
    .source-row,
    .fact-list > div,
    .binding-fact {
      grid-template-columns: minmax(0, 1fr);
    }

    .comparison-pane + .comparison-pane {
      border-block-start: 1px solid var(--cv-color-border-soft);
      border-inline-start: none;
    }
  }
`
