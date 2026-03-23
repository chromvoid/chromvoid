import {css} from 'lit'
import {hostLayoutPaintContainStyles, motionPrimitiveStyles, sharedStyles} from 'root/shared/ui/shared-styles'

export const remoteStorageLayoutStyles = [
  sharedStyles,
  hostLayoutPaintContainStyles,
  motionPrimitiveStyles,
  css`
    :host {
      display: block;
      min-height: 100%;
      box-sizing: border-box;
      background: var(--cv-color-bg, var(--cv-color-surface));
      --motion-reveal-start-transform: translateY(8px);
      --motion-reveal-end-transform: translateY(0);
      animation: var(--motion-page-reveal-animation, reveal 0.4s cubic-bezier(0.16, 1, 0.3, 1) both);
    }

    @media (prefers-reduced-motion: reduce) {
      :host {
        animation: none;
      }
    }

    /* ========== PAGE LAYOUT ========== */
    .page {
      max-inline-size: 1000px;
      margin-inline: auto;
      padding: var(--app-spacing-5) var(--app-spacing-4);
      display: grid;
      gap: var(--app-spacing-5);
    }

    @media (min-width: 768px) {
      .page {
        padding: var(--app-spacing-6);
      }
    }

    /* ========== HERO HEADER ========== */
    .header {
      display: grid;
      gap: var(--app-spacing-4);
      padding-block-end: var(--app-spacing-4);
      border-block-end: 1px solid var(--cv-color-border-muted);
    }

    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-sm);
      font-weight: var(--cv-font-weight-medium);
      cursor: pointer;
      text-decoration: none;
      border: 0;
      background: transparent;
      padding: 6px 0;
      transition: color 0.15s ease, transform 0.15s ease;

      cv-icon {
        font-size: 18px;
        transition: transform 0.2s ease;
      }

      &:hover {
        color: var(--cv-color-text);
        cv-icon {
          transform: translateX(-3px);
        }
      }

      &:focus-visible {
        outline: 2px solid var(--cv-color-focus-ring, var(--cv-color-info));
        outline-offset: 4px;
        border-radius: var(--cv-radius-1);
      }
    }

    .header-content {
      display: grid;
      gap: var(--app-spacing-2);
    }

    .title {
      font-size: clamp(1.5rem, 3cqi + 0.8rem, 2.25rem);
      font-weight: var(--cv-font-weight-bold);
      letter-spacing: -0.03em;
      line-height: 1.15;
      margin: 0;
      background: linear-gradient(135deg, var(--cv-color-text) 0%, var(--cv-color-text-muted) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .subtitle {
      margin: 0;
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-base);
      line-height: 1.6;
      max-inline-size: 600px;
    }

    /* ========== QUICK STATS ROW ========== */
    .quick-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: var(--app-spacing-3);
    }

    .stat-card {
      display: flex;
      align-items: center;
      gap: var(--app-spacing-3);
      padding: var(--app-spacing-3) var(--app-spacing-4);
      background: var(--cv-color-surface);
      border: 1px solid var(--cv-color-border-muted);
      border-radius: var(--cv-radius-3);
    }

    .stat-card:hover {
      border-color: var(--cv-color-border);
    }

    .stat-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: var(--cv-radius-2);
      background: var(--stat-bg, var(--cv-color-surface-2));
      color: var(--stat-color, var(--cv-color-text-muted));
      font-size: 20px;
    }

    .stat-content {
      display: grid;
      gap: 2px;
    }

    .stat-label {
      font-size: var(--cv-font-size-xs);
      color: var(--cv-color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-weight: var(--cv-font-weight-medium);
    }

    .stat-value {
      font-size: var(--cv-font-size-sm);
      font-weight: var(--cv-font-weight-semibold);
      color: var(--cv-color-text);
    }

    /* ========== MAIN GRID ========== */
    .main-grid {
      display: grid;
      gap: var(--app-spacing-4);
    }

    @media (min-width: 768px) {
      .main-grid {
        grid-template-columns: 1fr 1fr;
      }
      .main-grid .card-full {
        grid-column: 1 / -1;
      }
    }

    /* ========== CARDS ========== */
    .card {
      background: var(--cv-color-surface);
      border: 1px solid var(--cv-color-border-muted);
      border-radius: var(--cv-radius-3);
      overflow: hidden;
    }

    .card:hover {
      border-color: var(--cv-color-border);
    }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--app-spacing-3);
      padding: var(--app-spacing-4);
      background: linear-gradient(180deg, var(--cv-color-surface) 0%, var(--cv-color-surface-2) 100%);
      border-block-end: 1px solid var(--cv-color-border-muted);
    }

    .card-header-main {
      display: flex;
      align-items: center;
      gap: var(--app-spacing-3);
    }

    .card-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border-radius: var(--cv-radius-2);
      background: var(--card-icon-bg, var(--cv-color-surface-2));
      color: var(--card-icon-color, var(--cv-color-text-muted));
      font-size: 18px;
      flex-shrink: 0;
    }

    .card-title {
      display: grid;
      gap: 2px;

      .name {
        font-weight: var(--cv-font-weight-semibold);
        font-size: var(--cv-font-size-base);
        letter-spacing: -0.01em;
      }

      .hint {
        color: var(--cv-color-text-muted);
        font-size: var(--cv-font-size-xs);
      }
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 12px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: var(--cv-font-weight-semibold);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      background: var(--cv-color-surface-2);
      color: var(--cv-color-text-muted);
      border: 1px solid var(--cv-color-border-muted);
      white-space: nowrap;
    }

    .badge.success {
      background: color-mix(in oklch, var(--cv-color-success) 12%, var(--cv-color-surface));
      border-color: color-mix(in oklch, var(--cv-color-success) 25%, var(--cv-color-border));
      color: var(--cv-color-success);
    }

    .badge.info {
      background: color-mix(in oklch, var(--cv-color-info) 12%, var(--cv-color-surface));
      border-color: color-mix(in oklch, var(--cv-color-info) 25%, var(--cv-color-border));
      color: var(--cv-color-info);
    }

    .badge::before {
      content: '';
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
      flex-shrink: 0;
    }

    .card-body {
      padding: var(--app-spacing-4);
      display: grid;
      gap: var(--app-spacing-4);
    }

    /* ========== ALERT BLOCKS ========== */
    .alert {
      display: grid;
      gap: var(--app-spacing-2);
      padding: var(--app-spacing-3) var(--app-spacing-4);
      border-radius: var(--cv-radius-2);
      border-left: 3px solid var(--alert-accent, var(--cv-color-warning));
      background: var(--alert-bg, color-mix(in oklch, var(--cv-color-warning) 8%, var(--cv-color-surface)));

      .alert-title {
        font-weight: var(--cv-font-weight-semibold);
        font-size: var(--cv-font-size-sm);
        color: var(--alert-accent, var(--cv-color-warning));
        display: flex;
        align-items: center;
        gap: var(--app-spacing-2);
      }

      .alert-text {
        color: var(--cv-color-text-muted);
        font-size: var(--cv-font-size-sm);
        line-height: 1.55;
      }
    }

    .alert.info {
      --alert-accent: var(--cv-color-info);
      --alert-bg: color-mix(in oklch, var(--cv-color-info) 8%, var(--cv-color-surface));
    }

    .alert.success {
      --alert-accent: var(--cv-color-success);
      --alert-bg: color-mix(in oklch, var(--cv-color-success) 8%, var(--cv-color-surface));
    }

    .alert.danger {
      --alert-accent: var(--cv-color-danger);
      --alert-bg: color-mix(in oklch, var(--cv-color-danger) 8%, var(--cv-color-surface));
    }

    /* ========== ACTIONS ========== */
    .actions-row {
      display: flex;
      gap: var(--app-spacing-2);
      flex-wrap: wrap;
      padding-block-start: var(--app-spacing-3);
      border-block-start: 1px solid var(--cv-color-border-muted);
    }

    /* ========== FORM CONTROLS ========== */
    .field-group {
      display: grid;
      gap: var(--app-spacing-2);
    }

    .field-label {
      font-size: var(--cv-font-size-sm);
      font-weight: var(--cv-font-weight-medium);
      color: var(--cv-color-text);
    }

    .field-select {
      width: 100%;
      padding: 10px 12px;
      border-radius: var(--cv-radius-2);
      border: 1px solid var(--cv-color-border);
      background: var(--cv-color-surface);
      color: var(--cv-color-text);
      font-size: var(--cv-font-size-sm);
      cursor: pointer;
    }

    .field-select:hover {
      border-color: var(--cv-color-border-strong);
    }

    .field-select:focus {
      outline: none;
      border-color: var(--cv-color-brand);
      box-shadow: 0 0 0 3px color-mix(in oklch, var(--cv-color-brand) 15%, transparent);
    }

    .field-select:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* ========== PATH DISPLAY ========== */
    .path-display {
      display: flex;
      align-items: center;
      gap: var(--app-spacing-2);
      padding: var(--app-spacing-3);
      background: var(--cv-color-surface-2);
      border: 1px solid var(--cv-color-border-muted);
      border-radius: var(--cv-radius-2);
      font-family: var(--cv-font-family-code, monospace);
      font-size: var(--cv-font-size-sm);
      word-break: break-all;
      line-height: 1.4;
    }

    .path-display cv-icon {
      flex-shrink: 0;
      color: var(--cv-color-text-muted);
    }

    /* ========== STEPS LIST ========== */
    .steps-list {
      margin: 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: var(--app-spacing-2);
      counter-reset: step;
    }

    .steps-list li {
      display: flex;
      align-items: flex-start;
      gap: var(--app-spacing-3);
      padding: var(--app-spacing-2) 0;
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-sm);
      line-height: 1.5;
      counter-increment: step;
    }

    .steps-list li::before {
      content: counter(step);
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: var(--cv-color-surface-2);
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-xs);
      font-weight: var(--cv-font-weight-semibold);
      flex-shrink: 0;
    }
  `
]
