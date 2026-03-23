import {css} from 'lit'

import {hostContentContainStyles, sharedStyles} from 'root/shared/ui/shared-styles'

export const fileItemBaseStyles = [
  sharedStyles,
  hostContentContainStyles,
  css`
    /* ========== HOST - БАЗОВЫЕ СТИЛИ ========== */
    :host {
      border-radius: var(--cv-radius-2);
      outline-offset: -2px;
      transition:
        transform var(--cv-duration-fast) var(--cv-easing-standard),
        opacity var(--cv-duration-fast) var(--cv-easing-standard),
        background-color var(--cv-duration-fast) var(--cv-easing-standard),
        box-shadow var(--cv-duration-fast) var(--cv-easing-standard);
    }

    :host([active]) {
      outline: 2px solid color-mix(in oklch, var(--cv-color-primary) 70%, transparent);
      z-index: 1;
    }

    :host(:focus) {
      outline: none;
    }

    :host(:focus-visible) {
      outline: 2px solid var(--cv-color-primary);
      z-index: 1;
    }

    :host(.touch-dragging) {
      opacity: 0.6;
      transform: scale(0.95);
      z-index: 1;
    }

    :host(.touch-drag-over) {
      background: color-mix(in oklch, var(--cv-color-success), transparent 85%) !important;
      box-shadow: inset 0 0 0 2px color-mix(in oklch, var(--cv-color-success), transparent 50%) !important;
      transform: scale(1.02);
    }

    :host([selection-mode][view-mode='list']) .file-item,
    :host([selection-mode][view-mode='table']) .file-item {
      padding-inline-start: 40px;
    }

    :host([selection-mode][view-mode='list']) .selection-indicator,
    :host([selection-mode][view-mode='table']) .selection-indicator {
      inset-inline-start: 12px;
      inset-block-start: 50%;
      transform: translateY(-50%);
    }

    /* ========== ОБЩИЙ КОНТЕНТ ========== */
    .file-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      block-size: 100%;
      box-sizing: border-box;
      cursor: pointer;
      position: relative;
      user-select: none;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
    }

    .selection-indicator {
      position: absolute;
      inset-block-start: 10px;
      inset-inline-start: 10px;
      inline-size: 18px;
      block-size: 18px;
      border-radius: 999px;
      background: color-mix(in oklch, var(--cv-color-surface) 75%, transparent);
      border: 1px solid color-mix(in oklch, var(--cv-color-text-muted), transparent 40%);
      color: var(--cv-color-primary);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 0 0 2px var(--cv-color-surface);
      pointer-events: none;
      z-index: 2;
    }

    .selection-indicator.is-selected {
      background: var(--cv-color-primary);
      border-color: transparent;
      color: white;
    }

    .icon {
      font-size: 22px;
      color: var(--file-type-default, var(--cv-color-text-muted));
      min-inline-size: 32px;
      block-size: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--cv-radius-1);
      transition:
        color var(--cv-duration-fast) var(--cv-easing-standard),
        transform var(--cv-duration-fast) var(--cv-easing-standard),
        background var(--cv-duration-fast) var(--cv-easing-standard);

      &.folder {
        color: var(--file-type-folder);
        background: color-mix(in oklch, var(--file-type-folder) 12%, transparent);
      }

      &.file-image {
        color: var(--file-type-image);
        background: color-mix(in oklch, var(--file-type-image) 12%, transparent);
      }

      &.file-document {
        color: var(--file-type-document);
        background: color-mix(in oklch, var(--file-type-document) 12%, transparent);
      }

      &.file-archive {
        color: var(--file-type-archive);
        background: color-mix(in oklch, var(--file-type-archive) 12%, transparent);
      }

      &.file-media {
        color: var(--file-type-media);
        background: color-mix(in oklch, var(--file-type-media) 12%, transparent);
      }

      &.file-code {
        color: var(--file-type-code);
        background: color-mix(in oklch, var(--file-type-code) 12%, transparent);
      }

      &.file-default {
        color: var(--file-type-default);
        background: color-mix(in oklch, var(--file-type-default) 8%, transparent);
      }
    }

    :host(:hover) {
      .icon {
        transform: scale(1.08);
      }

      .icon.folder {
        background: color-mix(in oklch, var(--file-type-folder) 20%, transparent);
        box-shadow: 0 0 8px color-mix(in oklch, var(--file-type-folder) 25%, transparent);
      }
    }

    .info {
      flex: 1;
      min-inline-size: 0;
    }

    .name {
      font-weight: 500;
      color: var(--cv-color-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .meta {
      font-size: 0.85em;
      color: var(--cv-color-text-muted);
      margin-block-start: 2px;
    }

    .file-type {
      padding: 3px 8px;
      background: var(--cv-color-surface-2);
      border-radius: var(--cv-radius-1);
      font-size: 0.7em;
      color: var(--cv-color-text-muted);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      font-variant-numeric: tabular-nums;
      transition:
        background var(--cv-duration-fast) var(--cv-easing-standard),
        color var(--cv-duration-fast) var(--cv-easing-standard);
    }

    :host(:hover) {
      .file-type {
        background: var(--cv-color-surface-3);
        color: var(--cv-color-text);
      }
    }

    /* Цветные badges для типов файлов */
    .file-item:has(.icon.file-image) .file-type {
      background: color-mix(in oklch, var(--file-type-image) 15%, var(--cv-color-surface-2));
      color: var(--file-type-image);
    }

    .file-item:has(.icon.file-document) .file-type {
      background: color-mix(in oklch, var(--file-type-document) 15%, var(--cv-color-surface-2));
      color: var(--file-type-document);
    }

    .file-item:has(.icon.file-archive) .file-type {
      background: color-mix(in oklch, var(--file-type-archive) 15%, var(--cv-color-surface-2));
      color: var(--file-type-archive);
    }

    .file-item:has(.icon.file-media) .file-type {
      background: color-mix(in oklch, var(--file-type-media) 15%, var(--cv-color-surface-2));
      color: var(--file-type-media);
    }

    .file-item:has(.icon.file-code) .file-type {
      background: color-mix(in oklch, var(--file-type-code) 15%, var(--cv-color-surface-2));
      color: var(--file-type-code);
    }

    .actions {
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      display: flex;
      gap: 4px;
      transition: opacity var(--cv-duration-fast) var(--cv-easing-standard);
    }

    :host(:focus-visible) .actions,
    :host([active]) .actions {
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
    }

    .action-btn {
      padding: 4px;
      border-radius: var(--cv-radius-1);
      border: none;
      background: var(--cv-color-surface-2);
      color: var(--cv-color-text);
      cursor: pointer;
      transition:
        background-color var(--cv-duration-fast) var(--cv-easing-standard),
        color var(--cv-duration-fast) var(--cv-easing-standard);

      &:hover {
        background: color-mix(in oklch, var(--cv-color-primary), transparent 85%);
        color: var(--cv-color-primary);
      }
    }
  `,
]
