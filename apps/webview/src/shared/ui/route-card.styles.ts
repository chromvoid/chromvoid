import {css} from 'lit'

export const routeCardStyles = css`
  .card {
    padding: var(--app-route-card-padding, 0);
    background: var(--app-route-card-background, var(--cv-color-surface));
    border: 1px solid var(--app-route-card-border-color, var(--cv-color-border-muted));
    border-radius: var(--app-route-card-radius, var(--cv-radius-2));
    overflow: hidden;
    box-shadow: var(--app-route-card-shadow, none);
  }

  .card-header {
    display: flex;
    align-items: var(--app-route-card-header-align-items, flex-start);
    justify-content: space-between;
    gap: var(--app-spacing-3);
    padding: var(--app-route-card-header-padding, var(--app-spacing-4));
    background: var(--app-route-card-header-background, var(--cv-color-surface-2));
    border-bottom: 1px solid var(--app-route-card-header-border-color, var(--cv-color-border-muted));
  }

  .card-header-actions {
    display: inline-flex;
    align-items: center;
    gap: var(--app-spacing-2);
  }

  .card-title {
    display: grid;
    gap: var(--app-route-card-title-gap, var(--app-spacing-1));

    .name {
      font-weight: var(--cv-font-weight-semibold);
      font-size: var(--app-route-card-title-name-font-size, var(--cv-font-size-sm));
      letter-spacing: var(--app-route-card-title-name-letter-spacing, 0);
    }

    .hint {
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-xs);
    }
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: var(--app-route-badge-gap, 8px);
    padding: var(--app-route-badge-padding, 6px 10px);
    border-radius: 999px;
    font-size: var(--app-route-badge-font-size, var(--cv-font-size-xs));
    font-weight: var(--cv-font-weight-semibold);
    text-transform: var(--app-route-badge-text-transform, none);
    letter-spacing: var(--app-route-badge-letter-spacing, 0);
    border: 1px solid var(--app-route-badge-border-color, var(--cv-color-border-muted));
    background: var(--app-route-badge-background, var(--cv-color-info-surface));
    color: var(--app-route-badge-color, var(--cv-color-text));
    white-space: nowrap;
  }

  .badge.success {
    background: var(--cv-color-success-surface);
    border-color: var(--app-route-badge-success-border-color, var(--cv-color-success-border));
    color: var(--app-route-badge-success-color, var(--app-route-badge-color, var(--cv-color-text)));
  }

  .badge.info {
    background: var(--cv-color-info-surface);
    border-color: var(--app-route-badge-info-border-color, var(--cv-color-info-border));
    color: var(--app-route-badge-info-color, var(--app-route-badge-color, var(--cv-color-text)));
  }

  .badge.warning {
    background: var(--cv-color-warning-surface);
    border-color: var(--cv-color-warning-border);
    color: var(--app-route-badge-color, var(--cv-color-text));
  }

  .badge.danger {
    background: var(--cv-color-danger-surface);
    border-color: var(--cv-color-danger-border);
    color: var(--app-route-badge-color, var(--cv-color-text));
  }

  .badge.switching {
    background: var(--cv-color-info-surface-strong);
    border-color: var(--cv-color-info-border-strong);
    color: var(--app-route-badge-color, var(--cv-color-text));
  }

  .badge::before {
    content: '';
    display: var(--app-route-badge-marker-display, none);
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    flex-shrink: 0;
  }

  .card-body {
    padding: var(--app-spacing-4);
    display: grid;
    gap: var(--app-route-card-body-gap, var(--app-spacing-4));
  }

  .route-list {
    display: grid;
    gap: var(--app-spacing-2);
  }

  .route-list-item {
    display: flex;
    gap: var(--app-spacing-3);
    align-items: flex-start;
    padding: var(--app-spacing-3);
    border: 1px solid var(--cv-color-border-muted);
    border-radius: var(--cv-radius-2);
    background: var(--cv-color-surface);
  }

  .route-item-info {
    flex: 1;
    display: grid;
    gap: 4px;
    min-inline-size: 0;
  }

  .route-item-meta {
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-xs);
    line-height: 1.35;
  }

  .route-item-badges {
    display: flex;
    gap: var(--app-spacing-1);
    flex-shrink: 0;
  }

  .route-item-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--app-route-item-actions-gap, var(--app-spacing-2));
    flex-wrap: var(--app-route-item-actions-wrap, wrap);
    flex-shrink: 0;
  }
`
