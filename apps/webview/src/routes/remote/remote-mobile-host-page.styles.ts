import {css} from 'lit'

export const remoteMobileHostPageStyles = css`
  .mobile-host-page {
    box-sizing: border-box;
    display: grid;
    align-content: start;
    gap: var(--app-spacing-5);
    max-inline-size: 680px;
    min-block-size: 100%;
    margin-inline: auto;
    padding-block: var(--app-spacing-3) var(--app-spacing-8);
  }

  .mobile-host-hero {
    display: grid;
    justify-items: start;
    gap: var(--app-spacing-2);
    padding-block: var(--app-spacing-3) var(--app-spacing-2);
  }

  .mobile-host-hero-icon,
  .mobile-host-path-icon,
  .mobile-host-peer-icon {
    display: inline-grid;
    place-items: center;
    color: var(--cv-color-text-muted);
  }

  .mobile-host-hero-icon {
    inline-size: 48px;
    block-size: 48px;
    border: 1px solid var(--cv-color-border-muted);
    border-radius: var(--cv-radius-3);
    background: var(--cv-color-surface);
    color: var(--cv-color-primary);
  }

  .mobile-host-status {
    display: inline-flex;
    align-items: center;
    gap: var(--app-spacing-2);
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-sm);
    font-weight: var(--cv-font-weight-semibold);
  }

  .mobile-host-status-dot {
    inline-size: 8px;
    block-size: 8px;
    border-radius: 50%;
    background: var(--cv-color-text-muted);
  }

  .mobile-host-status-dot[data-state='starting'],
  .mobile-host-status-dot[data-state='pairing'] {
    background: var(--cv-color-warning);
  }

  .mobile-host-status-dot[data-state='ready'],
  .mobile-host-status-dot[data-state='connected'] {
    background: var(--cv-color-success);
  }

  .mobile-host-status-dot[data-state='error'] {
    background: var(--cv-color-danger);
  }

  .mobile-host-hero h1,
  .mobile-host-section h2,
  .mobile-host-pairing h2 {
    margin: 0;
    color: var(--cv-color-text);
    font-family: var(--cv-font-family-display);
  }

  .mobile-host-section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--app-spacing-3);
  }

  .mobile-host-hero h1 {
    max-inline-size: 18ch;
    font-size: clamp(1.75rem, 7vw, 2.5rem);
    line-height: 1.08;
    letter-spacing: -0.025em;
  }

  .mobile-host-hero > p {
    max-inline-size: 52ch;
    margin: 0;
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-base);
    line-height: 1.55;
  }

  .mobile-host-section {
    display: grid;
    gap: var(--app-spacing-3);
    padding-block-start: var(--app-spacing-4);
    border-block-start: 1px solid var(--cv-color-border-muted);
    contain: layout paint;
  }

  .mobile-host-section h2,
  .mobile-host-pairing h2 {
    font-size: var(--cv-font-size-lg);
    line-height: 1.25;
  }

  .mobile-host-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--app-spacing-2);
  }

  .mobile-host-actions--invitation cv-button {
    flex: 1 1 180px;
  }

  .mobile-host-invitation,
  .mobile-host-invitation-copy {
    display: grid;
    min-inline-size: 0;
  }

  .mobile-host-invitation {
    gap: var(--app-spacing-2);
  }

  .mobile-host-invitation-copy {
    gap: var(--app-spacing-1);
  }

  .mobile-host-invitation-copy strong {
    color: var(--cv-color-text);
    font-size: var(--cv-font-size-sm);
  }

  .mobile-host-invitation-copy span {
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-xs);
    line-height: 1.4;
  }

  .mobile-host-pairing-link {
    inline-size: 100%;
  }

  .mobile-host-pairing {
    display: grid;
    gap: var(--app-spacing-3);
    padding: var(--app-spacing-4);
    border: 1px solid var(--cv-color-border);
    border-radius: var(--cv-radius-3);
    background: var(--cv-color-surface);
    contain: content;
  }

  .mobile-host-pin {
    display: grid;
    justify-items: start;
    gap: var(--app-spacing-1);
    padding-block: var(--app-spacing-2);
  }

  .mobile-host-pin > span,
  .mobile-host-expiry {
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-sm);
  }

  .mobile-host-pin > strong {
    color: var(--cv-color-text);
    font-family: var(--cv-font-family-code);
    font-size: clamp(2.25rem, 14vw, 4rem);
    font-variant-numeric: tabular-nums;
    line-height: 1;
    letter-spacing: 0.14em;
    overflow-wrap: anywhere;
  }

  .mobile-host-expiry,
  .mobile-host-security-note {
    margin: 0;
    line-height: 1.5;
  }

  .mobile-host-security-note {
    max-inline-size: 58ch;
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-sm);
  }

  .mobile-host-progress {
    display: flex;
    align-items: center;
    gap: var(--app-spacing-2);
    min-block-size: 36px;
    margin: 0;
    color: var(--cv-color-text-muted);
  }

  .mobile-host-inline-message,
  .mobile-host-empty p {
    margin: 0;
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-sm);
    line-height: 1.5;
  }

  .mobile-host-inline-message {
    padding-inline-start: var(--app-spacing-3);
    border-inline-start: 3px solid var(--cv-color-border);
  }

  .mobile-host-inline-message[data-tone='warning'] {
    border-inline-start-color: var(--cv-color-warning);
    color: var(--cv-color-warning-text);
  }

  .mobile-host-inline-message[data-tone='danger'] {
    border-inline-start-color: var(--cv-color-danger);
    color: var(--cv-color-danger-text);
  }

  .mobile-host-empty {
    display: grid;
    gap: var(--app-spacing-1);
    padding-block: var(--app-spacing-2);
  }

  .mobile-host-empty strong {
    color: var(--cv-color-text);
    font-size: var(--cv-font-size-sm);
  }

  .mobile-host-spinner {
    box-sizing: border-box;
    inline-size: 16px;
    block-size: 16px;
    flex: 0 0 auto;
    border: 2px solid var(--cv-color-border);
    border-block-start-color: var(--cv-color-primary);
    border-radius: 50%;
    animation: mobile-host-spin var(--app-motion-spin-duration) linear infinite;
  }

  .mobile-host-paths,
  .mobile-host-peers {
    display: grid;
    gap: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .mobile-host-path,
  .mobile-host-peer {
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--app-spacing-3);
    min-block-size: 64px;
    padding-block: var(--app-spacing-2);
  }

  .mobile-host-peer cv-button {
    min-block-size: 44px;
  }

  .mobile-host-path + .mobile-host-path,
  .mobile-host-peer + .mobile-host-peer {
    border-block-start: 1px solid var(--cv-color-border-muted);
  }

  .mobile-host-path-icon,
  .mobile-host-peer-icon {
    inline-size: 36px;
    block-size: 36px;
    border-radius: var(--cv-radius-2);
    background: var(--cv-color-surface);
  }

  .mobile-host-path-copy,
  .mobile-host-peer-copy {
    display: grid;
    min-inline-size: 0;
    gap: 2px;
  }

  .mobile-host-path-copy strong,
  .mobile-host-peer-copy strong {
    color: var(--cv-color-text);
    font-size: var(--cv-font-size-sm);
  }

  .mobile-host-path-copy span,
  .mobile-host-peer-copy span {
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-xs);
    line-height: 1.4;
    overflow-wrap: anywhere;
  }

  .mobile-host-path-status {
    justify-self: end;
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-xs);
    font-weight: var(--cv-font-weight-semibold);
    text-align: end;
  }

  .mobile-host-path-status[data-state='ready'],
  .mobile-host-path-status[data-state='connected'] {
    color: var(--cv-color-success);
  }

  .mobile-host-path-status[data-state='preparing'] {
    color: var(--cv-color-warning);
  }

  .mobile-host-path-status[data-state='degraded'] {
    color: var(--cv-color-danger);
  }

  .mobile-host-details {
    margin-block-start: var(--app-spacing-1);
  }

  .mobile-host-details::part(trigger) {
    padding: var(--app-spacing-2) var(--app-spacing-3);
  }

  .mobile-host-details::part(panel) {
    padding: var(--app-spacing-4);
  }

  .mobile-host-details-trigger {
    display: grid;
    min-inline-size: 0;
    gap: 2px;
    text-align: start;
  }

  .mobile-host-details-trigger strong {
    font-size: var(--cv-font-size-sm);
  }

  .mobile-host-details-trigger small {
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-xs);
    font-weight: var(--cv-font-weight-regular);
  }

  .mobile-host-detail-list {
    display: grid;
    gap: var(--app-spacing-3);
    margin: 0;
  }

  .mobile-host-detail-list > div {
    display: grid;
    min-inline-size: 0;
    gap: var(--app-spacing-1);
  }

  .mobile-host-detail-list dt {
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-xs);
  }

  .mobile-host-detail-list dd {
    min-inline-size: 0;
    margin: 0;
    color: var(--cv-color-text);
    font-size: var(--cv-font-size-sm);
    overflow-wrap: anywhere;
  }

  .mobile-host-detail-list code {
    font-family: var(--cv-font-family-code);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .mobile-host-detail-device cv-input {
    inline-size: 100%;
  }

  @keyframes mobile-host-spin {
    to {
      transform: rotate(1turn);
    }
  }

  @media (max-width: 420px) {
    .mobile-host-page {
      gap: var(--app-spacing-4);
    }

    .mobile-host-path,
    .mobile-host-peer {
      grid-template-columns: 32px minmax(0, 1fr);
      gap: var(--app-spacing-2);
    }

    .mobile-host-path-status {
      grid-column: 2;
      justify-self: start;
      text-align: start;
    }

    .mobile-host-section-heading {
      align-items: flex-start;
    }

    .mobile-host-peer cv-button {
      grid-column: 2;
      inline-size: 100%;
    }

    .mobile-host-pin > strong {
      letter-spacing: 0.1em;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .mobile-host-spinner {
      animation: none;
    }
  }
`
