import {css} from 'lit'

import {hostContentContainStyles, sharedStyles} from 'root/shared/ui/shared-styles'

export const fileItemBaseStyles = [
  sharedStyles,
  hostContentContainStyles,
  css`
    /*========== HOST - Basic Styles ========*/
    :host {
      --file-type-default: var(--cv-color-text-muted);
      --file-type-folder: var(--cv-color-primary);
      --file-type-image: var(--cv-color-success);
      --file-type-document: var(--cv-color-accent);
      --file-type-archive: var(--cv-color-warning);
      --file-type-media: var(--cv-color-cyan);
      --file-type-code: var(--cv-color-primary-dark);
      --file-item-focus-outline: 2px solid var(--cv-color-focus);
      --file-item-focus-outline-offset: 2px;
      --file-item-selected-background: var(--cv-color-primary-surface-strong);
      --file-item-active-background: var(--cv-color-primary-subtle);
      --file-item-hover-background: var(--cv-color-primary-surface);
      --file-item-selected-border: var(--cv-color-primary);
      --file-item-active-border: var(--cv-color-primary-border-strong);
      --file-item-selected-outline: 2px solid var(--cv-color-primary-ring);
      --file-item-selected-outline-offset: -2px;
      --file-item-selected-leading-accent: var(--cv-color-primary);
      --file-item-active-outline: var(--file-item-selected-outline);
      --file-item-active-outline-offset: var(--file-item-selected-outline-offset);
      box-sizing: border-box;
      border: 1px solid transparent;
      border-radius: var(--cv-radius-2);
      outline: none;
      outline-offset: var(--file-item-focus-outline-offset);
      transition:
        transform var(--cv-duration-fast) var(--cv-easing-standard),
        opacity var(--cv-duration-fast) var(--cv-easing-standard),
        background var(--cv-duration-fast) var(--cv-easing-standard),
        border-color var(--cv-duration-fast) var(--cv-easing-standard),
        outline-color var(--cv-duration-fast) var(--cv-easing-standard),
        box-shadow var(--cv-duration-fast) var(--cv-easing-standard);
    }

    :host(:focus) {
      outline: var(--file-item-focus-outline);
      z-index: 2;
    }

    :host([active]) {
      outline: var(--file-item-active-outline);
      outline-offset: var(--file-item-active-outline-offset);
      z-index: 1;
    }

    :host([active]:focus),
    :host(:focus-visible) {
      outline: var(--file-item-focus-outline);
      z-index: 2;
    }

    :host(.touch-dragging) {
      opacity: 0.6;
      transform: scale(0.95);
      z-index: 1;
    }

    :host(.touch-drag-over) {
      background: var(--cv-color-success-surface) !important;
      box-shadow: inset 0 0 0 2px var(--cv-color-success-border-strong) !important;
      transform: scale(1.02);
    }

    :host([pending-external-open]) {
      background: var(--cv-color-primary-surface);
      box-shadow: inset 0 0 0 1px var(--cv-color-primary-border);
    }

    :host([media-active]) {
      background: var(--cv-color-primary-surface);
      box-shadow: inset 0 0 0 1px var(--cv-color-primary-border);
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

    /*=====================*/
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
      transition:
        transform var(--cv-duration-fast) var(--cv-easing-standard),
        background var(--cv-duration-fast) var(--cv-easing-standard),
        border-color var(--cv-duration-fast) var(--cv-easing-standard),
        outline-color var(--cv-duration-fast) var(--cv-easing-standard),
        box-shadow var(--cv-duration-fast) var(--cv-easing-standard);
    }

    .selection-indicator {
      position: absolute;
      inset-block-start: 10px;
      inset-inline-start: 10px;
      inline-size: 18px;
      block-size: 18px;
      border-radius: 999px;
      background: var(--cv-color-surface-glass);
      border: 1px solid var(--cv-color-border-soft);
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

    .thumbnail-shell {
      --file-media-spectrum-width: 24px;
      --file-media-spectrum-height: 24px;
      --file-media-spectrum-bar-width: 4px;
      --file-media-spectrum-gap: 4px;
      inline-size: 44px;
      block-size: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      overflow: hidden;
      border-radius: var(--cv-radius-2);
      background: var(--cv-color-surface-highlight);
      border: 1px solid var(--cv-color-border-soft);
      transition:
        transform var(--cv-duration-fast) var(--cv-easing-standard),
        background var(--cv-duration-fast) var(--cv-easing-standard),
        border-color var(--cv-duration-fast) var(--cv-easing-standard);

      &.folder {
        background: var(--cv-color-primary-surface);
      }

      &.file-image {
        background: var(--cv-color-success-surface);
      }

      &.file-document {
        background: var(--cv-color-accent-surface);
      }

      &.file-archive {
        background: var(--cv-color-warning-surface);
      }

      &.file-media {
        background: var(--cv-color-primary-surface);
      }

      &.file-code {
        background: var(--cv-color-primary-surface-strong);
      }
    }

    .thumbnail-shell.has-image {
      background: var(--cv-color-surface-secondary);
      border-color: var(--cv-color-border-muted);
    }

    .thumbnail-shell.is-media-active {
      background: var(--cv-color-primary-surface-strong);
      border-color: var(--cv-color-primary-border-strong);
      box-shadow: inset 0 0 0 1px var(--cv-color-primary-subtle);
    }

    .media-active-spectrum {
      inline-size: var(--file-media-spectrum-width);
      block-size: var(--file-media-spectrum-height);
      display: inline-flex;
      align-items: end;
      justify-content: center;
      gap: var(--file-media-spectrum-gap);
      color: var(--cv-color-primary);
      pointer-events: none;
    }

    .media-active-spectrum span {
      inline-size: var(--file-media-spectrum-bar-width);
      block-size: 44%;
      border-radius: 999px;
      background: currentColor;
      transform-origin: center bottom;
    }

    .media-active-spectrum span:nth-child(2) {
      block-size: 76%;
      color: var(--cv-color-accent);
    }

    .media-active-spectrum span:nth-child(3) {
      block-size: 56%;
    }

    .media-active-spectrum.is-playing span {
      animation: file-media-signal-rise 720ms var(--cv-easing-standard) infinite alternate;
    }

    .media-active-spectrum.is-playing span:nth-child(2) {
      animation-delay: 120ms;
    }

    .media-active-spectrum.is-playing span:nth-child(3) {
      animation-delay: 240ms;
    }

    .thumbnail-image {
      inline-size: 100%;
      block-size: 100%;
      display: block;
      object-fit: cover;
      animation: thumbnail-reveal var(--cv-duration-fast) var(--cv-easing-standard);
    }

    @keyframes thumbnail-reveal {
      from {
        opacity: 0;
        transform: scale(1.02);
      }

      to {
        opacity: 1;
        transform: scale(1);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .thumbnail-image,
      .media-active-spectrum span {
        animation: none;
      }
    }

    @keyframes file-media-signal-rise {
      from {
        transform: scaleY(0.68);
        opacity: 0.64;
      }

      to {
        transform: scaleY(1);
        opacity: 1;
      }
    }

    .icon {
      font-size: 22px;
      color: var(--file-type-default, var(--cv-color-text-muted));
      inline-size: 100%;
      block-size: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: inherit;
      transition:
        color var(--cv-duration-fast) var(--cv-easing-standard),
        transform var(--cv-duration-fast) var(--cv-easing-standard),
        background var(--cv-duration-fast) var(--cv-easing-standard);

      &.folder {
        color: var(--file-type-folder);
      }

      &.file-image {
        color: var(--file-type-image);
      }

      &.file-document {
        color: var(--file-type-document);
      }

      &.file-archive {
        color: var(--file-type-archive);
      }

      &.file-media {
        color: var(--file-type-media);
      }

      &.file-code {
        color: var(--file-type-code);
      }

      &.file-default {
        color: var(--file-type-default);
      }
    }

    :host([view-mode='grid']:hover) .thumbnail-shell {
      transform: scale(1.08);
    }

    :host(:hover) {
      .thumbnail-shell.folder:not(.has-image) {
        background: var(--cv-color-primary-surface-strong);
        box-shadow: 0 0 8px var(--cv-color-primary-border);
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

    /*Color badges for file types*/
    .file-item:has(.icon.file-image, .thumbnail-shell.file-image) .file-type {
      background: var(--cv-color-success-surface);
      color: var(--file-type-image);
    }

    .file-item:has(.icon.file-document, .thumbnail-shell.file-document) .file-type {
      background: var(--cv-color-accent-surface);
      color: var(--file-type-document);
    }

    .file-item:has(.icon.file-archive, .thumbnail-shell.file-archive) .file-type {
      background: var(--cv-color-warning-surface);
      color: var(--file-type-archive);
    }

    .file-item:has(.icon.file-media, .thumbnail-shell.file-media) .file-type {
      background: var(--cv-color-primary-surface);
      color: var(--file-type-media);
    }

    .file-item:has(.icon.file-code, .thumbnail-shell.file-code) .file-type {
      background: var(--cv-color-primary-surface-strong);
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
        background: var(--cv-color-primary-surface);
        color: var(--cv-color-primary);
      }
    }
  `,
]
