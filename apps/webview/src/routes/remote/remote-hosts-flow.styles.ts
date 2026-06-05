import {css} from 'lit'

export const remoteHostsFlowStyles = css`
  .back-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.875rem;
    color: var(--cv-color-text-muted);
    cursor: pointer;
    transition: color 0.2s;
  }

  .back-link:hover {
    color: var(--cv-color-brand);
  }

  .step {
    display: grid;
    gap: var(--app-spacing-4);
    padding: var(--app-spacing-5);
    background: var(--cv-color-surface);
    border-radius: var(--cv-radius-2);
    border: 1px solid var(--cv-color-border-muted);
  }

  .step.active {
    border-color: var(--cv-color-primary-border-strong);
    box-shadow:
      inset 0 1px 0 var(--cv-color-surface-highlight),
      0 0 0 1px var(--cv-color-primary-ring);
  }

  .step-title {
    font-weight: 600;
    font-size: 1rem;
    color: var(--cv-color-text);
  }

  .step-desc {
    font-size: 0.875rem;
    color: var(--cv-color-text-muted);
    line-height: 1.5;
    max-inline-size: 54ch;
  }

  .mode-badge {
    font-size: 0.7rem;
    font-family: var(--cv-font-family-code);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 4px var(--app-spacing-2);
    background: var(--cv-color-surface-3);
    border-radius: var(--cv-radius-pill);
    color: var(--cv-color-text-subtle);
    justify-self: start;
    margin-top: var(--app-spacing-1);
  }

  .remote-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--app-spacing-3);
    margin-top: var(--app-spacing-2);
  }

  .remote-actions cv-button {
    width: auto;
    flex: 0 1 auto;
  }

  .remote-actions cv-button:first-child {
    flex: 1 1 180px;
    max-inline-size: 260px;
  }

  .remote-peer-actions cv-button {
    width: auto;
    flex: 0 0 auto;
  }

  .remote-peer-list {
    display: grid;
    gap: var(--app-spacing-3);
    margin-top: var(--app-spacing-3);
  }

  .remote-peer {
    display: grid;
    gap: var(--app-spacing-3);
    padding: var(--app-spacing-4);
    border: 1px solid var(--cv-color-border-muted);
    border-radius: var(--cv-radius-2);
    background: var(--cv-color-surface);
  }

  .remote-peer-main {
    display: grid;
    gap: var(--app-spacing-1);
  }

  .remote-peer-title {
    font-weight: 600;
    color: var(--cv-color-text);
  }

  .remote-peer-meta {
    font-size: 0.8125rem;
    color: var(--cv-color-text-muted);
    word-break: break-all;
  }

  .remote-peer-badges {
    display: flex;
    flex-wrap: wrap;
    gap: var(--app-spacing-2);
  }

  .remote-peer-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--app-spacing-2);
  }

  .status-success {
    background: var(--cv-color-success-surface);
    color: var(--cv-color-success, #16a34a);
  }

  .status-warning {
    background: var(--cv-color-warning-surface);
    color: var(--cv-color-warning-text, #b45309);
  }

  .status-danger {
    background: var(--cv-color-danger-surface);
    color: var(--cv-color-danger-text, #b91c1c);
  }

  .status-neutral {
    background: var(--cv-color-surface-3);
    color: var(--cv-color-text-muted);
  }

  .empty-remote-state {
    display: grid;
    gap: var(--app-spacing-3);
    padding: var(--app-spacing-5);
    border-radius: var(--cv-radius-2);
    background: var(--cv-color-surface);
    border: 1px dashed var(--cv-color-border-muted);
    text-align: left;
    margin-top: var(--app-spacing-2);
  }

  .remote-form-grid {
    display: grid;
    gap: var(--app-spacing-3);
    margin-top: var(--app-spacing-1);
  }

  .remote-field {
    display: grid;
    gap: var(--app-spacing-2);
  }

  .remote-field-label {
    font-size: 0.8125rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--cv-color-text-muted);
    line-height: 1.3;
  }

  .remote-textarea {
    min-height: 160px;
  }

  cv-textarea::part(textarea) {
    min-height: 160px;
  }

  cv-callout.remote-hosts-callout {
    --cv-callout-compact-padding-inline: var(--app-spacing-4);
    --cv-callout-compact-border-radius: var(--cv-radius-md);
    margin-top: var(--app-spacing-3);
  }

  cv-callout.remote-hosts-callout::part(message) {
    color: var(--cv-color-text-muted);
    line-height: 1.5;
  }

  .pin-panel,
  .remote-presence-panel {
    display: grid;
    gap: var(--app-spacing-2);
    padding: var(--app-spacing-4);
    border-radius: 8px;
    border: 1px solid var(--cv-color-border-muted);
    background: var(--cv-color-surface-2);
  }

  .mono {
    font-family: var(--cv-font-family-code);
  }
`
