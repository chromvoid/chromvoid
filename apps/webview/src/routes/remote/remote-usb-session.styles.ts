import {css} from 'lit'

export const remoteUsbSessionStyles = css`
  .remote-usb-session {
    container-type: inline-size;
    overflow: hidden;
    border: 1px solid var(--cv-color-border-muted);
    border-radius: var(--cv-radius-3);
    background: var(--cv-color-surface);
    box-shadow: inset 0 1px 0 var(--cv-color-surface-highlight);
  }

  .remote-usb-header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--app-spacing-3);
    padding: var(--app-spacing-4);
    border-block-end: 1px solid var(--cv-color-border-muted);
  }

  .remote-usb-device-icon {
    display: inline-grid;
    place-items: center;
    inline-size: 48px;
    block-size: 48px;
    border: 1px solid var(--cv-color-border);
    border-radius: var(--cv-radius-2);
    background: var(--cv-color-surface-elevated);
    color: var(--cv-color-info);
  }

  .remote-usb-identity {
    min-inline-size: 0;
  }

  .remote-usb-identity p,
  .remote-usb-identity h2,
  .remote-usb-next-step p,
  .remote-usb-next-step h1 {
    margin: 0;
  }

  .remote-usb-identity > p {
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-xs);
    font-weight: var(--cv-font-weight-semibold);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .remote-usb-identity h2 {
    margin-block-start: var(--app-spacing-1);
    font-size: var(--cv-font-size-lg);
    line-height: 1.25;
  }

  .remote-usb-meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--app-spacing-1);
    margin-block-start: var(--app-spacing-1);
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-xs);
  }

  .remote-usb-stage-badge {
    align-self: start;
    padding: var(--app-spacing-1) var(--app-spacing-2);
    border: 1px solid var(--cv-color-border);
    border-radius: var(--cv-radius-pill);
    background: var(--cv-color-surface-elevated);
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-xs);
    font-weight: var(--cv-font-weight-semibold);
    text-align: center;
  }

  .remote-usb-stage-badge[data-stage='ready'] {
    border-color: var(--cv-color-success-border);
    color: var(--cv-color-success);
  }

  .remote-usb-stage-badge[data-stage='waiting_host_unlock'],
  .remote-usb-stage-badge[data-stage='waiting_phone_approval'] {
    border-color: var(--cv-color-warning-border);
    color: var(--cv-color-warning);
  }

  .remote-usb-stage-badge[data-stage='connection_lost'],
  .remote-usb-stage-badge[data-stage='error'] {
    border-color: var(--cv-color-danger-border);
    color: var(--cv-color-danger);
  }

  .remote-usb-body {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(260px, 0.8fr);
  }

  .remote-usb-next-step {
    min-inline-size: 0;
    padding: var(--app-spacing-6);
  }

  .remote-usb-next-step h1 {
    max-inline-size: 620px;
    color: var(--cv-color-text);
    font-size: clamp(var(--cv-font-size-xl), 3cqi, var(--cv-font-size-2xl));
    line-height: 1.15;
    text-wrap: balance;
  }

  .remote-usb-next-step .remote-usb-description {
    max-inline-size: 62ch;
    margin-block-start: var(--app-spacing-3);
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-sm);
    line-height: 1.55;
  }

  .remote-usb-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--app-spacing-2);
    margin-block-start: var(--app-spacing-5);
  }

  .remote-usb-status-list {
    display: grid;
    align-content: start;
    min-inline-size: 0;
    margin: 0;
    padding: var(--app-spacing-5);
    border-inline-start: 1px solid var(--cv-color-border-muted);
    background: var(--cv-color-surface-elevated);
  }

  .remote-usb-status-item {
    display: grid;
    grid-template-columns: minmax(90px, 0.7fr) minmax(0, 1.3fr);
    gap: var(--app-spacing-2);
    padding-block: var(--app-spacing-3);
    border-block-end: 1px solid var(--cv-color-border-muted);
  }

  .remote-usb-status-item:first-child {
    padding-block-start: 0;
  }

  .remote-usb-status-item:last-child {
    padding-block-end: 0;
    border-block-end: 0;
  }

  .remote-usb-status-item dt,
  .remote-usb-status-item dd {
    min-inline-size: 0;
    margin: 0;
    font-size: var(--cv-font-size-xs);
    line-height: 1.4;
  }

  .remote-usb-status-item dt {
    color: var(--cv-color-text-muted);
  }

  .remote-usb-status-item dd {
    color: var(--cv-color-text);
    font-weight: var(--cv-font-weight-semibold);
    overflow-wrap: anywhere;
  }

  .remote-usb-status-item[data-state='success'] dd {
    color: var(--cv-color-success);
  }

  .remote-usb-status-item[data-state='warning'] dd {
    color: var(--cv-color-warning);
  }

  .remote-usb-status-item[data-state='danger'] dd {
    color: var(--cv-color-danger);
  }

  .remote-usb-status-item[data-state='muted'] dd {
    color: var(--cv-color-text-muted);
  }

  .remote-usb-details {
    margin: 0 var(--app-spacing-4) var(--app-spacing-4);
  }

  .remote-usb-details::part(trigger) {
    padding: var(--app-spacing-2) var(--app-spacing-3);
  }

  .remote-usb-details::part(panel) {
    padding: var(--app-spacing-4);
  }

  .remote-usb-details-trigger {
    display: grid;
    min-inline-size: 0;
    gap: 2px;
    text-align: start;
  }

  .remote-usb-details-trigger strong {
    font-size: var(--cv-font-size-sm);
  }

  .remote-usb-details-trigger small {
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-xs);
    font-weight: var(--cv-font-weight-regular);
  }

  .remote-usb-detail-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--app-spacing-4);
    margin: 0;
  }

  .remote-usb-detail-list > div {
    display: grid;
    min-inline-size: 0;
    gap: var(--app-spacing-1);
  }

  .remote-usb-detail-list dt,
  .remote-usb-detail-list dd {
    min-inline-size: 0;
    margin: 0;
    font-size: var(--cv-font-size-xs);
  }

  .remote-usb-detail-list dt {
    color: var(--cv-color-text-muted);
  }

  .remote-usb-detail-list dd {
    color: var(--cv-color-text);
    overflow-wrap: anywhere;
  }

  .remote-usb-detail-list code {
    font-family: var(--cv-font-family-code);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  @container (max-width: 680px) {
    .remote-usb-body {
      grid-template-columns: minmax(0, 1fr);
    }

    .remote-usb-next-step {
      padding: var(--app-spacing-5);
    }

    .remote-usb-status-list {
      border-block-start: 1px solid var(--cv-color-border-muted);
      border-inline-start: 0;
    }
  }

  @container (max-width: 480px) {
    .remote-usb-header {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .remote-usb-stage-badge {
      grid-column: 2;
      justify-self: start;
    }

    .remote-usb-detail-list {
      grid-template-columns: minmax(0, 1fr);
    }
  }
`
