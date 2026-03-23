import {css} from 'lit'

export const entryDesktopStyles = css`
  :host {
    container-type: inline-size;
    --entry-header-control-size: 40px;
    --entry-header-control-icon-size: 18px;
  }

  pm-card-header {
    --cv-header-accent: var(--entry-avatar-bg, var(--cv-color-primary));
  }

  .title-avatar-icon {
    --pm-avatar-fallback-bg: var(--entry-avatar-bg);
    --pm-avatar-fallback-color: white;
  }

  .title-content {
    display: flex;
    flex-direction: column;
    gap: calc(var(--cv-space-2) * 0.75);
  }

  .entry-title {
    font-size: clamp(1.5rem, 2.3vw, 1.85rem);
    font-weight: 700;
    color: var(--cv-color-text);
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.15;
    letter-spacing: -0.015em;
  }

  .entry-meta-badges {
    display: flex;
    gap: calc(var(--cv-space-2) * 0.75);
    flex-wrap: wrap;
    align-items: center;
  }

  back-button {
    --back-button-size: var(--entry-header-control-size);
    --back-button-icon-size: var(--entry-header-control-icon-size);
    --back-button-border-color: color-mix(in oklch, var(--cv-color-border) 100%, var(--cv-color-text) 16%);
    --back-button-bg: color-mix(in oklch, var(--cv-color-surface-2) 88%, transparent);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--cv-space-2);
  }

  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: var(--entry-header-control-size);
    block-size: var(--entry-header-control-size);
    padding: 0;
    border: 1px solid color-mix(in oklch, var(--cv-color-border) 100%, var(--cv-color-text) 16%);
    border-radius: var(--cv-radius-2);
    background: color-mix(in oklch, var(--cv-color-surface-2) 88%, transparent);
    color: var(--cv-color-text-muted);
    cursor: pointer;
    transition:
      background-color 0.2s ease,
      border-color 0.2s ease,
      color 0.2s ease,
      transform 0.2s ease;

    cv-icon {
      inline-size: var(--entry-header-control-icon-size);
      block-size: var(--entry-header-control-icon-size);
    }

    &:hover {
      background: color-mix(in oklch, var(--cv-color-primary) 12%, var(--cv-color-surface-2));
      border-color: color-mix(in oklch, var(--cv-color-primary) 55%, var(--cv-color-border));
      color: var(--cv-color-text);
    }

    &:active {
      transform: scale(0.96);
    }

    &:disabled {
      opacity: 0.3;
      pointer-events: none;
    }
  }

  .icon-btn.danger {
    border-color: color-mix(in oklch, var(--cv-color-danger) 35%, var(--cv-color-border));
    color: color-mix(in oklch, var(--cv-color-danger) 80%, transparent);
  }

  .icon-btn.danger:hover {
    background: color-mix(in oklch, var(--cv-color-danger) 12%, var(--cv-color-surface-2));
    border-color: color-mix(in oklch, var(--cv-color-danger) 50%, transparent);
    color: var(--cv-color-danger);
  }

  cv-button.icon-btn {
    display: inline-block;
    width: auto;
  }

  cv-button.icon-btn::part(base) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: var(--cv-button-min-height);
    block-size: var(--cv-button-min-height);
    min-inline-size: var(--cv-button-min-height);
    padding: 0;
    border: 1px solid color-mix(in oklch, var(--cv-color-border) 100%, var(--cv-color-text) 16%);
    background: color-mix(in oklch, var(--cv-color-surface-2) 88%, transparent);
    color: var(--cv-color-text-muted);
  }

  cv-button.icon-btn:hover::part(base) {
    background: color-mix(in oklch, var(--cv-color-primary) 12%, var(--cv-color-surface-2));
    border-color: color-mix(in oklch, var(--cv-color-primary) 55%, var(--cv-color-border));
    color: var(--cv-color-text);
  }

  cv-button.icon-btn:active::part(base) {
    transform: scale(0.96);
  }

  .secondary-section {
    display: flex;
    flex-direction: column;
    gap: var(--cv-space-4);
  }

  .fields-card {
    background: color-mix(in oklch, var(--cv-color-surface-2) 50%, #0f172a 10%);
    border: 1px solid color-mix(in oklch, var(--cv-color-border) 80%, transparent);
    border-radius: var(--cv-radius-3);
    box-shadow: var(--cv-shadow-1);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .credential-field {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-rows: auto auto;
    column-gap: var(--cv-space-4);
    row-gap: 4px;
    padding: 14px 20px;
    border-bottom: 1px solid color-mix(in oklch, var(--cv-color-border) 40%, transparent);
    transition:
      background-color 0.2s ease,
      padding 0.2s ease;
  }

  .credential-field:last-child {
    border-bottom: none;
  }

  .credential-field:hover {
    background: color-mix(in oklch, var(--cv-color-text) 3%, transparent);
  }

  .field-content {
    display: contents;
  }

  .field-content > .field-label {
    grid-column: 1 / -1;
  }

  .field-content > .field-value,
  .field-content > .secret-skeleton,
  .field-content > .password-input,
  .field-content > .otp-codes,
  .field-content > .urls-list {
    grid-column: 1;
    min-inline-size: 0;
    align-self: center;
  }

  .field-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 600;
    color: color-mix(in oklch, var(--cv-color-text-muted) 80%, transparent);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .field-label cv-icon {
    font-size: 13px;
    opacity: 0.8;
  }

  .field-value {
    font-size: 1.125rem;
    font-weight: 500;
    color: var(--cv-color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.4;
  }

  .field-value.masked {
    font-family: var(--cv-font-family-code);
    letter-spacing: 0.2em;
    font-size: 1.25rem;
    min-height: 1.75rem;
    line-height: 1.75rem;
  }

  .field-value.masked.revealed {
    letter-spacing: 0.02em;
  }

  .field-value.empty {
    color: color-mix(in oklch, var(--cv-color-text-muted) 50%, transparent);
    font-style: italic;
    font-size: 1rem;
  }

  .field-value.error {
    color: var(--cv-color-danger, #ef4444);
    font-style: italic;
    font-size: 1rem;
  }

  .secret-skeleton {
    padding: 0;
  }

  .password-input {
    flex: 1;
    min-inline-size: 0;
  }

  .password-input::part(base) {
    padding: 0;
    min-height: auto;
    border: none;
    background: transparent;
  }

  .password-input::part(input) {
    font-family: var(--cv-font-family-code);
    letter-spacing: 0.2em;
    font-size: 1.25rem;
    font-weight: 500;
    color: var(--cv-color-text);
  }

  .field-actions {
    grid-column: 2;
    grid-row: 2;
    display: flex;
    align-items: center;
    align-self: center;
    gap: 8px;
    flex-shrink: 0;
    opacity: 0.8;
    transition: opacity 0.2s;
  }

  .credential-field:hover .field-actions {
    opacity: 1;
  }

  cv-copy-button,
  .icon-btn {
    flex-shrink: 0;
  }

  .url-link::part(base) {
    gap: 8px;
    font-size: 1.05rem;
    font-weight: 500;
    padding: 6px 12px;
    background: color-mix(in oklch, var(--cv-color-primary) 10%, transparent);
    border-radius: 999px;
    text-decoration: none;
    transition:
      background 0.2s,
      color 0.2s;
  }
  .url-link:hover::part(base) {
    background: color-mix(in oklch, var(--cv-color-primary) 20%, transparent);
  }
  .url-link:not([href])::part(base) {
    color: var(--cv-color-text-muted);
    background: transparent;
    pointer-events: none;
  }
  .url-link .website-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-inline-size: 250px;
  }

  .otp-codes {
    display: flex;
    gap: var(--cv-space-2);
    overflow-x: auto;
    scrollbar-width: none;
    padding-top: 4px;
  }
  .otp-codes::-webkit-scrollbar {
    display: none;
  }

  .urls-list {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    padding-top: 4px;
  }

  .note-card {
    background: color-mix(in oklch, var(--cv-color-surface-2) 50%, #0f172a 10%);
    border: 1px solid color-mix(in oklch, var(--cv-color-border) 40%, transparent);
    border-radius: var(--cv-radius-3);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
  }
  .note-card .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    border-bottom: 1px solid color-mix(in oklch, var(--cv-color-border) 30%, transparent);
    background: color-mix(in oklch, var(--cv-color-surface-2) 30%, transparent);
  }
  .note-card .note-cv-copy-button {
    --cv-button-min-height: 26px;
    --cv-button-padding-inline: 6px;
    flex-shrink: 0;
  }
  .note-card .card-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
    color: var(--cv-color-text-muted);
  }
  .note-card .card-content {
    padding: 16px 20px;
  }

  .note-content {
    font-family: var(--cv-font-family-code);
    font-size: 13px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--cv-color-text);
    opacity: 0.9;
  }

  .note-skeleton {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 4px 0;
  }

  .skeleton-line {
    block-size: 12px;
    border-radius: var(--cv-radius-1);
    background: linear-gradient(
      90deg,
      color-mix(in oklch, var(--cv-color-border) 40%, transparent) 25%,
      color-mix(in oklch, var(--cv-color-border) 20%, transparent) 50%,
      color-mix(in oklch, var(--cv-color-border) 40%, transparent) 75%
    );
    background-size: 200% 100%;
  }
  .skeleton-line.short {
    inline-size: 40%;
  }

  .metadata-footer {
    display: flex;
    justify-content: center;
    padding-top: var(--cv-space-3);
  }
  .meta-footer-items {
    display: flex;
    align-items: center;
    gap: 12px;
    color: color-mix(in oklch, var(--cv-color-text-muted) 70%, transparent);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.02em;
  }
  .meta-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .meta-item cv-icon {
    font-size: 12px;
    opacity: 0.7;
  }
  .meta-divider {
    opacity: 0.3;
    font-size: 8px;
  }
`

export const entryDesktopResponsiveStyles = css`
  @container (width < 480px) {
    .wrapper {
      gap: var(--cv-space-2);
    }
    .entry-title {
      font-size: calc(var(--cv-font-size-base) * 1.125);
    }
    .credential-field {
      padding: var(--cv-space-3) var(--cv-space-4);
    }
    .field-value {
      font-size: var(--cv-font-size-base);
    }
    .note-card .card-content {
      padding: var(--cv-space-3) var(--cv-space-4);
    }
  }

  @media (hover: none) and (pointer: coarse) {
    .icon-btn {
      width: 40px;
      height: 40px;
    }
    .credential-field cv-button.icon-btn {
      --cv-button-min-height: 36px;
    }
  }

  @container (width >= 600px) {
    .wrapper {
      gap: var(--cv-space-4);
    }
    .entry-title {
      font-size: 1.5rem;
    }
    .field-value.masked {
      font-size: var(--cv-font-size-lg);
      min-height: 2rem;
      line-height: 2rem;
    }
  }

  @container (width >= 1000px) {
    .entry-title {
      font-size: 1.75rem;
    }
    .field-value.masked {
      font-size: 1.5rem;
      min-height: 2.25rem;
      line-height: 2.25rem;
    }
  }

  *:focus-visible {
    outline: 2px solid var(--cv-color-focus, var(--cv-color-primary));
    outline-offset: 2px;
  }
`
