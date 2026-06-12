import {css} from 'lit'

export const routeCardStyles = css`
  .card {
    padding: var(--route-card-padding, 0);
    background: var(--route-card-background, var(--cv-color-surface));
    border: 1px solid var(--route-card-border-color, var(--cv-color-border-muted));
    border-radius: var(--route-card-radius, var(--cv-radius-2));
    overflow: hidden;
    box-shadow: var(--route-card-shadow, none);
  }

  .card-header {
    display: flex;
    align-items: var(--route-card-header-align-items, flex-start);
    justify-content: space-between;
    gap: var(--route-card-header-gap, var(--app-spacing-3));
    padding: var(--route-card-header-padding, var(--app-spacing-4));
    background: var(--route-card-header-background, var(--cv-color-surface-2));
    border-bottom: 1px solid var(--route-card-header-border-color, var(--cv-color-border-muted));
  }

  .card-header-actions {
    display: inline-flex;
    align-items: center;
    gap: var(--route-card-header-actions-gap, var(--app-spacing-2));
  }

  .card-title {
    display: grid;
    gap: var(--route-card-title-gap, var(--app-spacing-1));

    .name {
      font-weight: var(--cv-font-weight-semibold);
      font-size: var(--route-card-title-name-font-size, var(--cv-font-size-sm));
      letter-spacing: var(--route-card-title-name-letter-spacing, 0);
    }

    .hint {
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-xs);
    }
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: var(--route-badge-gap, 8px);
    padding: var(--route-badge-padding, 6px 10px);
    border-radius: 999px;
    font-size: var(--route-badge-font-size, var(--cv-font-size-xs));
    font-weight: var(--cv-font-weight-semibold);
    text-transform: var(--route-badge-text-transform, none);
    letter-spacing: var(--route-badge-letter-spacing, 0);
    border: 1px solid var(--route-badge-border-color, var(--cv-color-border-muted));
    background: var(--route-badge-background, var(--cv-color-info-surface));
    color: var(--route-badge-color, var(--cv-color-text));
    white-space: nowrap;
  }

  .badge.success {
    background: var(--route-badge-success-background, var(--cv-color-success-surface));
    border-color: var(--route-badge-success-border-color, var(--cv-color-success-border));
    color: var(--route-badge-success-color, var(--route-badge-color, var(--cv-color-text)));
  }

  .badge.info {
    background: var(--route-badge-info-background, var(--cv-color-info-surface));
    border-color: var(--route-badge-info-border-color, var(--cv-color-info-border));
    color: var(--route-badge-info-color, var(--route-badge-color, var(--cv-color-text)));
  }

  .badge.warning {
    background: var(--route-badge-warning-background, var(--cv-color-warning-surface));
    border-color: var(--route-badge-warning-border-color, var(--cv-color-warning-border));
    color: var(--route-badge-warning-color, var(--route-badge-color, var(--cv-color-text)));
  }

  .badge.danger {
    background: var(--route-badge-danger-background, var(--cv-color-danger-surface));
    border-color: var(--route-badge-danger-border-color, var(--cv-color-danger-border));
    color: var(--route-badge-danger-color, var(--route-badge-color, var(--cv-color-text)));
  }

  .badge.switching {
    background: var(--route-badge-switching-background, var(--cv-color-info-surface-strong));
    border-color: var(--route-badge-switching-border-color, var(--cv-color-info-border-strong));
    color: var(--route-badge-switching-color, var(--route-badge-color, var(--cv-color-text)));
  }

  .badge::before {
    content: '';
    display: var(--route-badge-marker-display, none);
    width: var(--route-badge-marker-size, 6px);
    height: var(--route-badge-marker-size, 6px);
    border-radius: 50%;
    background: currentColor;
    flex-shrink: 0;
  }

  .card-body {
    padding: var(--route-card-body-padding, var(--app-spacing-4));
    display: grid;
    gap: var(--route-card-body-gap, var(--app-spacing-4));
  }

  .route-list {
    display: grid;
    gap: var(--route-list-gap, var(--app-spacing-2));
  }

  .route-list-item {
    display: flex;
    gap: var(--route-list-item-gap, var(--app-spacing-3));
    align-items: var(--route-list-item-align-items, flex-start);
    padding: var(--route-list-item-padding, var(--app-spacing-3));
    border: 1px solid var(--route-list-item-border-color, var(--cv-color-border-muted));
    border-radius: var(--route-list-item-radius, var(--cv-radius-2));
    background: var(--route-list-item-background, var(--cv-color-surface));
  }

  .route-item-info {
    flex: 1;
    display: grid;
    gap: var(--route-item-info-gap, 4px);
    min-inline-size: 0;
  }

  .route-item-meta {
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-xs);
    line-height: 1.35;
  }

  .route-item-badges {
    display: flex;
    gap: var(--route-item-badges-gap, var(--app-spacing-1));
    flex-shrink: 0;
  }

  .route-item-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--route-item-actions-gap, var(--app-spacing-2));
    flex-wrap: var(--route-item-actions-wrap, wrap);
    flex-shrink: 0;
  }
`
