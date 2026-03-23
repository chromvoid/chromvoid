import {css} from 'lit'

import {
  hostContainStyles,
  motionPrimitiveStyles,
  pulseIndicatorStyles,
  skeletonShimmerStyles,
} from 'root/shared/ui/shared-styles'

/**
 * Единые стили для элементов списка записей менеджера паролей
 * Поддерживает режимы: default, compact, dense
 */
export const listItemStyles = css`
  ${hostContainStyles}
  ${motionPrimitiveStyles}
  ${pulseIndicatorStyles}
  ${skeletonShimmerStyles}

  /* ========== ОСНОВНЫЕ СТИЛИ ЭЛЕМЕНТА ========== */

  .list-item {
    display: grid;
    grid-template-columns: auto 1fr auto auto;
    gap: var(--cv-space-2);
    align-items: center;
    padding: var(--cv-space-2) var(--cv-space-3);
    margin: 2px 0;
    border-radius: var(--cv-radius-2);
    border: 1px solid var(--cv-color-border);
    background: var(--cv-color-surface-2);
    cursor: pointer;
    position: relative;
    contain: layout style;

    &:focus-visible {
      outline: 2px solid var(--cv-color-primary);
      outline-offset: -2px;
      border-color: var(--cv-color-primary);
    }
  }

  /* ========== ИКОНКА ========== */

  .item-icon {
    width: round(calc(var(--cv-font-size-base) * 1.125), 1px);
    height: round(calc(var(--cv-font-size-base) * 1.125), 1px);
    flex-shrink: 0;
    color: var(--cv-color-text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* ========== КОНТЕНТ ========== */

  .item-content {
    min-width: 0; /* Для правильного text-overflow */
    overflow: hidden;
  }

  .item-title {
    font-size: var(--cv-font-size-sm);
    font-weight: var(--cv-font-weight-medium);
    color: var(--cv-color-text);
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.3;
  }

  .item-subtitle {
    font-size: var(--cv-font-size-xs);
    color: var(--cv-color-text-muted);
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.2;
  }

  /* ========== ДЕЙСТВИЯ ========== */

  .item-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transform: translateX(8px);
    transition:
      opacity var(--cv-duration-fast) var(--cv-easing-standard),
      transform var(--cv-duration-fast) var(--cv-easing-standard);
  }

  .list-item:focus .item-actions {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
    transform: translateX(0);
  }

  .action-button {
    width: 24px;
    height: 24px;
    border-radius: var(--cv-radius-1);
    border: 1px solid color-mix(in oklch, var(--cv-color-border) 50%, transparent);
    background: var(--cv-color-surface-2);
    color: var(--cv-color-text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;

    sl-icon,
    cv-icon {
      width: 14px;
      height: 14px;
    }
  }

  /* ========== БЕЙДЖ СТАТУСА ========== */

  .status-indicator {
    position: absolute;
    top: calc(var(--cv-space-2) * 0.75);
    right: calc(var(--cv-space-2) * 0.75);
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--cv-color-success);
    opacity: 0.8;

    &.has-otp {
      background: var(--cv-color-primary);
    }
  }

  /* ========== РЕЖИМЫ ОТОБРАЖЕНИЯ ========== */

  /* Компактный режим */
  :host([view-mode='compact']) {
    .list-item {
      padding: calc(var(--cv-space-2) * 0.75) var(--cv-space-2);
      margin: 1px 0;
      gap: calc(var(--cv-space-2) * 0.75);
    }

    .item-icon {
      width: var(--cv-font-size-sm);
      height: var(--cv-font-size-sm);
    }

    .item-title {
      font-size: var(--cv-font-size-xs);
    }

    .item-subtitle {
      font-size: 0.65rem;
    }

    .action-button {
      width: 20px;
      height: 20px;
    }
  }

  /* Плотный режим */
  :host([view-mode='dense']) {
    .list-item {
      padding: 2px calc(var(--cv-space-2) * 0.75);
      margin: 1px 0;
      gap: calc(var(--cv-space-2) * 0.75);
      grid-template-columns: auto 1fr;
    }

    .item-icon {
      width: var(--cv-font-size-xs);
      height: var(--cv-font-size-xs);
    }

    .item-title {
      font-size: var(--cv-font-size-xs);
    }

    .item-subtitle {
      display: none;
    }
  }

  /* ========== SKELETON LOADER ========== */

  .skeleton-item {
    --skeleton-bg: color-mix(in oklch, var(--cv-color-border) 35%, transparent);
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--cv-space-3);
    align-items: center;
    padding: var(--cv-space-3) var(--cv-space-4);
    margin: 4px 0;
    border-radius: var(--cv-radius-2);
    background: var(--cv-color-surface-2);
    border: 1px solid color-mix(in oklch, var(--cv-color-border) 30%, transparent);
  }

  .skeleton-icon {
    width: 32px;
    height: 32px;
    border-radius: var(--cv-radius-2);
    background: var(--skeleton-bg);
  }

  .skeleton-content {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: calc(var(--cv-space-2) * 0.75);
  }

  .skeleton-title {
    height: 14px;
    width: 70%;
    border-radius: var(--cv-radius-1);
    background: var(--skeleton-bg);
  }

  .skeleton-subtitle {
    height: 10px;
    width: 45%;
    border-radius: var(--cv-radius-1);
    background: var(--skeleton-bg);
  }

`

/**
 * Стили для группировки элементов списка
 */
export const listGroupStyles = css`
  .list-group {
    margin-block: 2px;
  }

  .group-header {
    display: flex;
    align-items: center;
    gap: calc(var(--cv-space-2) * 0.75);
    padding: calc(var(--cv-space-2) * 0.75) var(--cv-space-2);
    font-size: var(--cv-font-size-xs);
    font-weight: var(--cv-font-weight-semibold);
    color: var(--cv-color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.02em;

    cv-icon {
      width: 14px;
      height: 14px;
      color: var(--cv-color-text-muted);
    }
  }

  .group-count {
    font-size: 0.65rem;
    color: var(--cv-color-text-muted);
    background: var(--cv-color-surface-2);
    padding: 1px 4px;
    border-radius: var(--cv-radius-1);
    border: 1px solid var(--cv-color-border);
    margin-inline-start: auto;
  }
`
