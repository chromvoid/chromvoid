import {css} from 'lit'

export const entryMobileStyles = css`
  :host {
    container-type: inline-size;
  }

  /* ── Entrance animation ── */

  @keyframes sectionReveal {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* ── Layout ── */

  .wrapper {
    gap: var(--cv-space-5);
    padding-block-end: calc(var(--cv-space-6) + var(--safe-area-bottom-active));
  }

  pm-card-header-mobile {
    --cv-header-accent: var(--entry-avatar-bg, var(--cv-color-primary));
    animation: sectionReveal 220ms var(--cv-easing-spring) both;
  }

  .title-content {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-inline-size: 0;
  }

  .entry-title {
    font-family: var(--cv-font-family-display);
    font-size: clamp(1.5rem, 6.5vw, 1.9rem);
    font-weight: var(--cv-font-weight-bold);
    color: var(--cv-color-text);
    margin: 0;
    line-height: 1.1;
    letter-spacing: -0.03em;
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    text-overflow: ellipsis;
  }

  .entry-meta-row {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    min-inline-size: 0;
  }

  .entry-meta-badges {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    align-items: center;
  }

  .entry-meta-badges cv-badge {
    --cv-badge-height: 20px;
    --cv-badge-padding-inline: 7px;
    --cv-badge-font-size: 10px;
    --cv-badge-gap: 4px;
  }

  .entry-meta-badges cv-icon {
    font-size: 11px;
  }

  /* ── Content grid ── */

  .content-grid {
    display: flex;
    flex-direction: column;
    gap: var(--cv-space-5);
  }

  /* ── Grouped sections (iOS-style) ── */

  .section-group {
    display: flex;
    flex-direction: column;
    gap: 0;
    animation: sectionReveal 260ms var(--cv-easing-spring) both;
    animation-delay: calc(60ms + var(--stagger, 0) * 50ms);
  }

  .section-group-inner {
    background: var(--cv-color-surface-2);
    border: 1px solid color-mix(in oklch, var(--cv-color-border) 60%, transparent);
    border-radius: var(--cv-radius-3);
    overflow: hidden;
  }

  .section-group-accent .section-group-inner {
    border-color: color-mix(in oklch, var(--cv-color-success) 18%, var(--cv-color-border));
  }

  .field-divider {
    block-size: 1px;
    margin-inline: 14px;
    background: color-mix(in oklch, var(--cv-color-border) 50%, transparent);
  }

  /* ── Section label ── */

  .section-label {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-block-end: 8px;
    padding-inline-start: 2px;
    font-size: 11px;
    font-weight: var(--cv-font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--cv-color-text-muted);

    cv-icon {
      font-size: 14px;
      opacity: 0.7;
    }
  }

  .section-group-accent .section-label {
    color: var(--cv-color-success);

    cv-icon {
      opacity: 0.85;
    }
  }

  .section-count::part(base) {
    font-size: 10px;
    padding: 2px 8px;
  }

  /* ── Credential fields ── */

  .credential-field {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-rows: auto auto;
    column-gap: 10px;
    row-gap: 4px;
    padding: 14px 14px 16px;
    min-block-size: 64px;
    background: transparent;
    border: none;
    border-radius: 0;

    .field-label {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 10px;
      font-weight: var(--cv-font-weight-semibold);
      color: var(--cv-color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.12em;

      cv-icon {
        font-size: 12px;
        opacity: 0.6;
      }
    }

    .field-content {
      display: contents;
    }

    .field-value {
      grid-column: 1;
      min-inline-size: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 1.06rem;
      font-weight: var(--cv-font-weight-medium);
      color: var(--cv-color-text);
      line-height: 1.4;

      &.masked {
        font-family: var(--cv-font-family-code);
        letter-spacing: 0.15em;
      }

      &.masked.revealed {
        letter-spacing: 0.02em;
      }

      &.empty {
        color: var(--cv-color-text-muted);
        font-style: italic;
        font-size: 0.95rem;
      }

      &.error {
        color: var(--cv-color-danger, #ef4444);
        font-style: italic;
        font-size: 0.95rem;
      }
    }

    .secret-skeleton {
      grid-column: 1;
      padding: 0;
    }

    .password-input {
      grid-column: 1;
      min-inline-size: 0;
      --cv-input-background: transparent;
      --cv-input-border-color: transparent;
      --cv-input-padding-inline: 0;
    }

    .password-input::part(base) {
      padding: 0;
      min-height: auto;
      border: none;
      background: transparent;
    }

    .password-input::part(input) {
      font-size: 1.06rem;
      font-weight: var(--cv-font-weight-medium);
      color: var(--cv-color-text);
      font-family: var(--cv-font-family-code);
      letter-spacing: 0.15em;
      line-height: 1.4;
    }

    .field-actions {
      grid-column: 2;
      grid-row: 2;
      display: flex;
      align-items: center;
      align-self: center;
      gap: 6px;
      flex-shrink: 0;
    }

    cv-copy-button,
    .icon-btn {
      flex-shrink: 0;
    }

    cv-copy-button {
      --cv-button-min-height: 40px;
      --cv-button-min-width: 40px;
    }
  }

  /* ── OTP section ── */

  .otp-codes {
    display: grid;
    gap: 0;

    pm-entry-otp-item-mobile {
      display: block;
      min-inline-size: 0;
    }

    pm-entry-otp-item-mobile + pm-entry-otp-item-mobile {
      border-block-start: 1px solid color-mix(in oklch, var(--cv-color-border) 40%, transparent);
    }
  }

  /* ── URLs section ── */

  .urls-list {
    display: grid;
    gap: 0;

    cv-link {
      display: block;
      inline-size: 100%;

      &::part(base) {
        inline-size: 100%;
        justify-content: space-between;
        gap: 10px;
        padding-block: 12px;
        padding-inline: 14px;
        font-size: var(--cv-font-size-base);
        border-radius: 0;
        min-block-size: 48px;
        background: transparent;
        border: none;
        text-decoration: none;
      }

      .website-name {
        flex: 1;
        min-inline-size: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    cv-link + cv-link::part(base) {
      border-block-start: 1px solid color-mix(in oklch, var(--cv-color-border) 40%, transparent);
    }
  }

  /* ── Secondary section ── */

  .secondary-section {
    display: flex;
    flex-direction: column;
    gap: var(--cv-space-4);
    animation: sectionReveal 260ms var(--cv-easing-spring) both;
    animation-delay: calc(60ms + var(--stagger, 0) * 50ms);
  }

  /* ── Note card ── */

  .note-card {
    display: flex;
    flex-direction: column;
    background: var(--cv-color-surface-2);
    border: 1px solid color-mix(in oklch, var(--cv-color-border) 60%, transparent);
    border-radius: var(--cv-radius-3);
    overflow: hidden;

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--cv-space-2);
      padding: 12px 14px;
      border-block-end: 1px solid color-mix(in oklch, var(--cv-color-border) 35%, transparent);

      .card-title {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        font-weight: var(--cv-font-weight-semibold);
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--cv-color-text-muted);

        cv-icon {
          font-size: 14px;
          opacity: 0.65;
        }
      }

      .note-cv-copy-button {
        --cv-button-min-height: 32px;
        --cv-button-padding-inline: 8px;
        flex-shrink: 0;
      }
    }

    .card-content {
      padding: 14px;

      .note-content {
        font-family: var(--cv-font-family-code);
        font-size: 0.9rem;
        line-height: 1.65;
        padding: 0;
        white-space: pre-wrap;
        word-break: break-word;
        color: var(--cv-color-text);
        background: transparent;
        border: none;
        border-radius: 0;
      }

      .note-skeleton {
        display: flex;
        flex-direction: column;
        gap: var(--cv-space-2);
      }

      .skeleton-line {
        block-size: 14px;
        border-radius: var(--cv-radius-1);
        background: linear-gradient(
          90deg,
          color-mix(in oklch, var(--cv-color-border) 60%, transparent) 25%,
          color-mix(in oklch, var(--cv-color-border) 30%, transparent) 50%,
          color-mix(in oklch, var(--cv-color-border) 60%, transparent) 75%
        );
        background-size: 200% 100%;

        &.short {
          inline-size: 60%;
        }
      }
    }

    .empty-state {
      min-block-size: 48px;
      padding: 0;
      justify-content: flex-start;
      border: none;
      border-radius: 0;
      background: transparent;
      color: color-mix(in oklch, var(--cv-color-text-muted) 80%, transparent);
    }
  }

  /* ── Metadata (compact) ── */

  .metadata-compact {
    display: block;
    padding: 12px 14px;
    font-size: 11px;
    color: var(--cv-color-text-muted);
  }

  .metadata-compact .meta-footer-items {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px 12px;
    inline-size: 100%;
  }

  .metadata-compact .meta-item {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    column-gap: 8px;
    min-block-size: 0;
    padding: 0;
    border: none;
    background: none;
    white-space: nowrap;

    cv-icon {
      font-size: 13px;
      color: var(--cv-color-primary);
      opacity: 0.6;
    }

    time {
      font-family: var(--cv-font-family-code);
      font-weight: var(--cv-font-weight-medium);
      font-size: 0.72rem;
      line-height: 1.2;
      letter-spacing: -0.02em;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .metadata-compact .meta-divider {
    display: none;
  }

  /* ── Focus ── */

  *:focus-visible {
    outline: 2px solid var(--cv-color-focus, var(--cv-color-primary));
    outline-offset: 2px;
  }

  /* ── Narrow breakpoint ── */

  @container (width < 360px) {
    .metadata-compact .meta-footer-items {
      grid-template-columns: 1fr;
    }
  }
`
