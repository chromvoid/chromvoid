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
    font-weight: var(--cv-font-weight-semibold);
    font-size: var(--cv-font-size-sm);
    color: var(--cv-color-text);
  }

  .step-desc {
    font-size: var(--cv-font-size-sm);
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
    font-weight: var(--cv-font-weight-semibold);
    color: var(--cv-color-text);
  }

  .remote-peer-meta {
    font-size: var(--cv-font-size-xs);
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
    color: var(--cv-color-success);
  }

  .status-warning {
    background: var(--cv-color-warning-surface);
    color: var(--cv-color-warning-text);
  }

  .status-danger {
    background: var(--cv-color-danger-surface);
    color: var(--cv-color-danger-text);
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
    font-size: var(--cv-font-size-xs);
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
    border-radius: var(--cv-radius-2);
    border: 1px solid var(--cv-color-border-muted);
    background: var(--cv-color-surface-2);
  }

  .pin-value,
  .mono {
    font-family: var(--cv-font-family-code);
  }

  .remote-flow-frame {
    --cv-color-primary: var(--remote-flow-primary);
    --cv-color-surface: var(--remote-flow-surface);
    --cv-color-text: var(--remote-flow-text);
    --cv-color-border: var(--remote-flow-border);
    --cv-color-danger: var(--remote-flow-danger);
    --cv-button-border-radius: var(--remote-flow-button-radius);
    --cv-button-min-height: var(--remote-flow-button-min-block-size);
    --cv-button-font-size: var(--remote-flow-button-font-size);
    --cv-input-background: var(--remote-flow-surface-secondary);
    --cv-input-border-color: var(--remote-flow-control-border);
    --cv-input-color: var(--remote-flow-text);
    --cv-input-placeholder-color: var(--remote-flow-text-subtle);
    --cv-input-border-radius: var(--remote-flow-control-radius);
    --cv-input-height: var(--remote-flow-input-block-size);
    --cv-textarea-background: var(--remote-flow-surface-secondary);
    --cv-textarea-border-color: var(--remote-flow-control-border);
    --cv-textarea-color: var(--remote-flow-textarea-foreground);
    --cv-textarea-placeholder-color: var(--remote-flow-text-subtle);
    --cv-textarea-border-radius: var(--remote-flow-control-radius);
    --cv-textarea-min-height: var(--remote-flow-textarea-min-block-size);
    position: relative;
    overflow: visible;
    color: var(--remote-flow-text);
    color-scheme: dark;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    contain: layout style;
  }

  .remote-flow-frame > * {
    position: relative;
    z-index: 1;
  }

  .remote-flow-frame .remote-action-tile-icon,
  .remote-flow-frame .remote-panel-icon,
  .remote-flow-frame .remote-wait-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
  }

  .remote-flow-frame .remote-flow-statusbar {
    display: grid;
    grid-template-columns:
      minmax(220px, 1.2fr)
      minmax(96px, 0.62fr)
      minmax(126px, 0.72fr)
      minmax(180px, 1fr)
      minmax(120px, 0.72fr);
    align-items: stretch;
    min-inline-size: 0;
    border-bottom: 1px solid var(--remote-flow-border-subtle);
    background: var(--remote-flow-surface-highlight);
  }

  .remote-flow-frame .remote-flow-statusbar[data-transport='connected'] {
    background: var(--remote-flow-success-surface-subtle);
  }

  .remote-flow-frame .remote-flow-status-segment {
    display: grid;
    align-content: center;
    gap: 3px;
    min-inline-size: 0;
    padding: 8px 16px;
    border-right: 1px solid var(--remote-flow-border-faint);
  }

  .remote-flow-frame .remote-flow-status-segment--mode {
    min-inline-size: 0;
  }

  .remote-flow-frame .remote-flow-status-segment--sync {
    min-inline-size: 0;
  }

  .remote-flow-frame .remote-flow-status-segment--write {
    min-inline-size: 0;
    border-right: 0;
  }

  .remote-flow-frame .remote-flow-mode-control {
    display: inline-flex;
    align-items: center;
    inline-size: max-content;
    max-inline-size: 100%;
    padding: 2px;
    border: 1px solid var(--remote-flow-border-hairline);
    border-radius: 7px;
    background: var(--remote-flow-surface-inset);
  }

  .remote-flow-frame .remote-flow-mode-control span {
    padding: 4px 9px;
    border-radius: 5px;
    color: var(--remote-flow-text-subtle);
    font-family: var(--cv-font-family-code);
    font-size: 0.625rem;
    font-weight: 700;
    line-height: 1.2;
  }

  .remote-flow-frame .remote-flow-mode-control span[data-state='active'] {
    background: var(--remote-flow-success-surface-strong);
    color: var(--remote-flow-success);
  }

  .remote-flow-frame .remote-flow-status-label,
  .remote-flow-frame .remote-section-label,
  .remote-flow-frame .remote-field-label {
    color: var(--remote-flow-text-subtle);
    font-family: var(--cv-font-family-code);
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0;
    line-height: 1.35;
    text-transform: uppercase;
  }

  .remote-flow-frame .remote-flow-status-value {
    min-inline-size: 0;
    overflow: hidden;
    color: var(--remote-flow-text-secondary);
    font-size: 0.75rem;
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .remote-flow-frame .remote-flow-status-value--mono,
  .remote-flow-frame .remote-flow-status-value--with-dot {
    font-family: var(--cv-font-family-code);
    font-size: 0.6875rem;
    font-weight: 650;
  }

  .remote-flow-frame .remote-flow-status-value--with-dot {
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }

  .remote-flow-frame .remote-status-dot,
  .remote-flow-frame .remote-peer-status-dot {
    display: inline-block;
    inline-size: 8px;
    block-size: 8px;
    border-radius: 50%;
    background: currentColor;
    box-shadow: 0 0 9px currentColor;
  }

  .remote-flow-frame .remote-status-dot {
    color: var(--remote-flow-success);
  }

  .remote-flow-frame .remote-flow-surface {
    display: grid;
    gap: 14px;
    min-block-size: 0;
    padding: 22px 24px 24px;
  }

  .remote-flow-frame .step {
    gap: 14px;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .remote-flow-frame .step.active {
    border-color: transparent;
    box-shadow: none;
  }

  .remote-flow-frame .step-title {
    color: var(--remote-flow-text);
    font-size: 1.25rem;
    font-weight: 750;
    line-height: 1.25;
  }

  .remote-flow-frame .step-desc {
    max-inline-size: 64ch;
    color: var(--remote-flow-text-muted);
    font-size: 0.8125rem;
    line-height: 1.55;
  }

  .remote-flow-frame .remote-step-heading,
  .remote-flow-frame .remote-panel-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
  }

  .remote-flow-frame .remote-panel-heading--with-icon {
    justify-content: flex-start;
  }

  .remote-flow-frame .remote-panel-icon {
    inline-size: 40px;
    block-size: 40px;
    border: 1px solid var(--remote-flow-primary-border);
    border-radius: 11px;
    background: var(--remote-flow-primary-surface);
    color: var(--remote-flow-primary);
  }

  .remote-flow-frame .remote-rescan-button::part(base) {
    min-block-size: 32px;
    padding-inline: 12px;
    background: transparent;
    color: var(--remote-flow-text-secondary);
  }

  .remote-flow-frame .remote-peer-list {
    gap: 9px;
    margin-top: 0;
  }

  .remote-flow-frame .remote-peer {
    grid-template-columns: 10px minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 14px;
    min-block-size: 62px;
    padding: 12px 14px;
    border: 1px solid var(--remote-flow-border-muted);
    border-radius: 11px;
    background: var(--remote-flow-surface);
    transition:
      border-color var(--cv-duration-fast) var(--cv-easing-standard),
      background var(--cv-duration-fast) var(--cv-easing-standard);
  }

  .remote-flow-frame .remote-peer:hover {
    border-color: var(--remote-flow-border-strong);
    background: var(--remote-flow-surface-active);
  }

  .remote-flow-frame .remote-peer-main,
  .remote-flow-frame .remote-action-tile-copy,
  .remote-flow-frame .remote-peer-state {
    display: grid;
    min-inline-size: 0;
  }

  .remote-flow-frame .remote-peer-main {
    gap: 3px;
  }

  .remote-flow-frame .remote-peer-title-row {
    display: flex;
    align-items: center;
    gap: 9px;
    min-inline-size: 0;
  }

  .remote-flow-frame .remote-peer-title {
    overflow: hidden;
    color: var(--remote-flow-text);
    font-size: 0.8125rem;
    font-weight: 750;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .remote-flow-frame .remote-peer-meta {
    overflow: hidden;
    color: var(--remote-flow-text-dim);
    font-family: var(--cv-font-family-code);
    font-size: 0.6875rem;
    text-overflow: ellipsis;
    white-space: nowrap;
    word-break: normal;
  }

  .remote-flow-frame .remote-peer-badges,
  .remote-flow-frame .remote-actions,
  .remote-flow-frame .remote-peer-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }

  .remote-flow-frame .remote-peer-actions {
    flex-wrap: nowrap;
  }

  .remote-flow-frame .remote-peer-actions cv-button {
    inline-size: 150px;
    width: auto;
    flex: 0 0 auto;
  }

  .remote-flow-frame .remote-peer-actions cv-button::part(base) {
    min-block-size: 36px;
  }

  .remote-flow-frame .remote-peer-status-dot {
    color: var(--remote-flow-text-dim);
  }

  .remote-flow-frame .remote-peer[data-peer-status='ready'] .remote-peer-status-dot {
    color: var(--remote-flow-success);
  }

  .remote-flow-frame .remote-peer[data-peer-status='waking'] .remote-peer-status-dot {
    color: var(--remote-flow-warning);
  }

  .remote-flow-frame .remote-peer-state {
    justify-items: end;
    gap: 2px;
    color: var(--remote-flow-text-subtle);
    font-family: var(--cv-font-family-code);
    font-size: 0.625rem;
    white-space: nowrap;
  }

  .remote-flow-frame .remote-peer-state-label {
    font-size: 0.6875rem;
    text-transform: uppercase;
  }

  .remote-flow-frame .remote-peer-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: 30px;
    block-size: 30px;
    padding: 0;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--remote-flow-text-disabled);
    cursor: pointer;
    transition:
      color var(--cv-duration-fast) var(--cv-easing-standard),
      background var(--cv-duration-fast) var(--cv-easing-standard);
  }

  .remote-flow-frame .remote-peer-remove:hover,
  .remote-flow-frame .remote-peer-remove:focus-visible {
    background: var(--remote-flow-danger-surface-subtle);
    color: var(--remote-flow-danger);
    outline: none;
  }

  .remote-flow-frame .remote-peer-remove:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .remote-flow-frame .mode-badge {
    justify-self: start;
    margin-top: 0;
    padding: 3px 7px;
    border-radius: 5px;
    background: var(--remote-flow-surface-tertiary);
    color: var(--remote-flow-text-muted);
    font-family: var(--cv-font-family-code);
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0;
    line-height: 1.35;
    text-transform: none;
  }

  .remote-flow-frame .status-success,
  .remote-flow-frame .remote-peer-state-label.status-success {
    color: var(--remote-flow-success);
  }

  .remote-flow-frame .status-success {
    background: var(--remote-flow-success-surface);
  }

  .remote-flow-frame .status-warning,
  .remote-flow-frame .remote-peer-state-label.status-warning {
    color: var(--remote-flow-warning-text);
  }

  .remote-flow-frame .status-warning {
    background: var(--remote-flow-warning-surface);
  }

  .remote-flow-frame .status-danger,
  .remote-flow-frame .remote-peer-state-label.status-danger {
    color: var(--remote-flow-danger-text);
  }

  .remote-flow-frame .status-danger {
    background: var(--remote-flow-danger-surface);
  }

  .remote-flow-frame .status-neutral,
  .remote-flow-frame .remote-peer-state-label.status-neutral {
    color: var(--remote-flow-text-muted);
  }

  .remote-flow-frame .status-neutral {
    background: var(--remote-flow-surface-tertiary);
  }

  .remote-flow-frame .empty-remote-state,
  .remote-flow-frame .remote-presence-panel {
    display: grid;
    gap: 12px;
    border: 1px solid var(--remote-flow-border-muted);
    border-radius: 11px;
    background: var(--remote-flow-surface);
  }

  .remote-flow-frame .empty-remote-state {
    inline-size: 100%;
    max-inline-size: 760px;
    justify-self: center;
    padding: 22px 24px;
    text-align: center;
    margin-top: 0;
  }

  .remote-flow-frame .empty-remote-state .step-desc {
    justify-self: center;
  }

  .remote-flow-frame .remote-add-host-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 1fr));
    gap: 10px;
  }

  .remote-flow-frame .remote-action-tile {
    display: flex;
    align-items: center;
    gap: 11px;
    min-block-size: 58px;
    min-inline-size: 0;
    inline-size: 100%;
    padding: 12px 14px;
    border: 1px solid var(--remote-flow-border);
    border-radius: 11px;
    background: var(--remote-flow-surface);
    color: var(--remote-flow-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition:
      border-color var(--cv-duration-fast) var(--cv-easing-standard),
      background var(--cv-duration-fast) var(--cv-easing-standard),
      color var(--cv-duration-fast) var(--cv-easing-standard);
  }

  .remote-flow-frame .remote-action-tile:hover,
  .remote-flow-frame .remote-action-tile:focus-visible {
    border-color: var(--remote-flow-primary);
    background: var(--remote-flow-surface-row);
    outline: none;
  }

  .remote-flow-frame .remote-action-tile:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .remote-flow-frame .remote-action-tile--usb {
    min-inline-size: 0;
  }

  .remote-flow-frame .remote-action-tile-icon {
    inline-size: 34px;
    block-size: 34px;
    border-radius: 9px;
    background: var(--remote-flow-primary-surface);
    color: var(--remote-flow-primary);
  }

  .remote-flow-frame .remote-action-tile--usb .remote-action-tile-icon {
    background: var(--remote-flow-warning-surface);
    color: var(--remote-flow-warning);
  }

  .remote-flow-frame .remote-action-tile-copy {
    gap: 3px;
  }

  .remote-flow-frame .remote-action-tile-copy strong {
    overflow: hidden;
    color: var(--remote-flow-text);
    font-size: 0.8125rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .remote-flow-frame .remote-action-tile-copy span {
    color: var(--remote-flow-text-muted);
    font-family: var(--cv-font-family-code);
    font-size: 0.6875rem;
    line-height: 1.35;
  }

  .remote-flow-frame .remote-form-grid,
  .remote-flow-frame .remote-field {
    display: grid;
  }

  .remote-flow-frame .remote-form-grid {
    gap: 12px;
    margin-top: 0;
  }

  .remote-flow-frame .remote-form-grid--pair {
    grid-template-columns: 190px minmax(0, 1fr);
  }

  .remote-flow-frame .remote-field {
    gap: 8px;
  }

  .remote-flow-frame .remote-field--pin cv-input {
    --cv-input-font-size: 1.125rem;
    --cv-input-padding-inline: 13px;
  }

  .remote-flow-frame cv-input,
  .remote-flow-frame cv-textarea {
    inline-size: 100%;
  }

  .remote-flow-frame cv-input::part(base),
  .remote-flow-frame cv-textarea::part(base) {
    border-color: var(--remote-flow-control-border);
    background: var(--remote-flow-surface-secondary);
  }

  .remote-flow-frame cv-input::part(input) {
    font-family: var(--cv-font-family-code);
  }

  .remote-flow-frame .remote-textarea,
  .remote-flow-frame cv-textarea::part(textarea) {
    min-height: 78px;
    font-family: var(--cv-font-family-code);
    font-size: 0.75rem;
    line-height: 1.5;
  }

  .remote-flow-frame cv-callout.remote-hosts-callout {
    margin-top: 0;
  }

  .remote-flow-frame cv-callout::part(base) {
    background: var(--remote-flow-surface);
    color: var(--remote-flow-text-secondary);
  }

  .remote-flow-frame cv-callout[variant='info']::part(base) {
    border-color: var(--remote-flow-primary-border);
    background: var(--remote-flow-primary-surface);
    color: var(--remote-flow-primary-text);
  }

  .remote-flow-frame cv-callout[variant='warning']::part(base) {
    border-color: var(--remote-flow-warning-border);
    background: var(--remote-flow-warning-surface);
    color: var(--remote-flow-warning-text);
  }

  .remote-flow-frame cv-callout[variant='danger']::part(base) {
    border-color: var(--remote-flow-danger-border);
    background: var(--remote-flow-danger-surface);
    color: var(--remote-flow-danger-text);
  }

  .remote-flow-frame .pin-panel,
  .remote-flow-frame .remote-presence-panel {
    padding: 14px 16px;
  }

  .remote-flow-frame [data-usb-mobile-panel] {
    gap: 12px;
  }

  .remote-flow-frame .remote-usb-overview-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr));
    gap: 10px;
  }

  .remote-flow-frame .remote-usb-overview-grid .remote-presence-panel {
    align-content: center;
    min-block-size: 78px;
  }

  .remote-flow-frame [data-usb-section] .remote-peer {
    grid-template-columns: minmax(0, 1fr) auto;
    min-block-size: 56px;
    padding: 10px 12px;
  }

  .remote-flow-frame [data-usb-section] .remote-peer-main {
    min-inline-size: 0;
  }

  .remote-flow-frame [data-usb-section] .remote-peer-actions {
    grid-column: auto;
    justify-content: flex-end;
  }

  .remote-flow-frame [data-usb-section] .remote-peer-actions cv-button {
    inline-size: auto;
    min-inline-size: 112px;
  }

  .remote-flow-frame [data-usb-section='paired-hosts'] {
    padding: 14px;
  }

  .remote-flow-frame [data-usb-section='paired-hosts'] .remote-peer-list {
    gap: 8px;
  }

  .remote-flow-frame [data-usb-mobile-panel] > .remote-actions {
    padding-block-start: 2px;
  }

  .remote-flow-frame [data-usb-mobile-panel] > .remote-actions cv-button::part(base) {
    min-block-size: 38px;
  }

  .remote-flow-frame .pin-panel {
    gap: 10px;
    border: 1px solid var(--remote-flow-success-border);
    border-radius: 11px;
    background: var(--remote-flow-success-surface);
  }

  .remote-flow-frame .pin-value {
    color: var(--remote-flow-success);
    font-size: 1.5rem;
    font-weight: 750;
  }

  .remote-flow-frame .remote-wait-panel {
    justify-items: center;
    max-inline-size: 560px;
    margin: 8px auto 0;
    text-align: center;
  }

  .remote-flow-frame .remote-wait-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 13px;
    border: 1px solid var(--remote-flow-primary-border);
    border-radius: 20px;
    background: var(--remote-flow-primary-surface);
    color: var(--remote-flow-primary);
    font-family: var(--cv-font-family-code);
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
  }

  .remote-flow-frame .remote-wait-icon {
    inline-size: 70px;
    block-size: 70px;
    border: 1px solid var(--remote-flow-primary-border-muted);
    border-radius: 18px;
    background: var(--remote-flow-primary-surface-muted);
    color: var(--remote-flow-primary);
  }

  .remote-flow-frame .remote-wait-progress {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    color: var(--remote-flow-text-muted);
    font-family: var(--cv-font-family-code);
    font-size: 0.6875rem;
  }

  .remote-flow-frame .spinner {
    display: inline-block;
    inline-size: 15px;
    block-size: 15px;
    border: 2px solid var(--remote-flow-primary-ring);
    border-top-color: var(--remote-flow-primary);
    border-radius: 50%;
    animation: remote-flow-spin 1s linear infinite;
  }

  .remote-flow-frame .remote-actions {
    justify-content: flex-start;
    margin-top: 0;
  }

  .remote-flow-frame .remote-actions cv-button {
    width: auto;
    flex: 0 1 auto;
  }

  .remote-flow-frame .remote-actions cv-button:first-child {
    flex: 0 1 auto;
    max-inline-size: none;
  }

  @keyframes remote-flow-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 820px) {
    .remote-flow-frame .remote-flow-statusbar {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .remote-flow-frame .remote-flow-status-segment--mode,
    .remote-flow-frame .remote-flow-status-segment--write {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 760px) {
    .remote-flow-frame .remote-flow-statusbar {
      grid-template-columns: 1fr;
    }

    .remote-flow-frame .remote-flow-status-segment,
    .remote-flow-frame .remote-flow-status-segment--mode,
    .remote-flow-frame .remote-flow-status-segment--sync,
    .remote-flow-frame .remote-flow-status-segment--write {
      min-inline-size: 0;
      margin-inline-start: 0;
      border-right: 0;
      border-bottom: 1px solid var(--remote-flow-border-faint);
    }

    .remote-flow-frame .remote-flow-surface {
      min-block-size: 0;
      padding: 20px;
    }

    .remote-flow-frame .remote-step-heading,
    .remote-flow-frame .remote-panel-heading {
      flex-direction: column;
      align-items: flex-start;
      text-align: left;
    }

    .remote-flow-frame .remote-peer {
      grid-template-columns: 10px minmax(0, 1fr);
    }

    .remote-flow-frame .remote-peer-state,
    .remote-flow-frame .remote-peer-actions {
      grid-column: 2;
      justify-items: start;
    }

    .remote-flow-frame .remote-peer-actions {
      width: 100%;
    }

    .remote-flow-frame .remote-peer-actions cv-button {
      inline-size: min(100%, 180px);
    }

    .remote-flow-frame [data-usb-section] .remote-peer {
      grid-template-columns: 1fr;
    }

    .remote-flow-frame [data-usb-section] .remote-peer-actions {
      justify-content: flex-start;
      width: 100%;
    }

    .remote-flow-frame [data-usb-section] .remote-peer-actions cv-button {
      inline-size: min(100%, 180px);
    }

    .remote-flow-frame .remote-add-host-grid,
    .remote-flow-frame .remote-form-grid--pair {
      grid-template-columns: 1fr;
    }

    .remote-flow-frame .remote-action-tile--usb {
      min-inline-size: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .remote-flow-frame .spinner {
      animation: none;
    }
  }
`
