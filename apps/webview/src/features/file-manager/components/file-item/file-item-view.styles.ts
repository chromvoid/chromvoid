import {css} from 'lit'

export const fileItemViewStyles = css`
  /* ========== LIST VIEW ========== */
  :host([view-mode='list']) {
    height: 80px;
    position: relative;

    &::before {
      content: '';
      position: absolute;
      inset-block-start: 0;
      inset-block-end: 0;
      inline-size: 4px;
      background: var(--gradient-primary);
      opacity: 0;
      border-radius: var(--cv-radius-2) 0 0 var(--cv-radius-2);
      transition:
        opacity var(--cv-duration-fast) var(--cv-easing-standard),
        inline-size var(--cv-duration-fast) var(--cv-easing-standard);
    }

    &:hover {
      background: linear-gradient(
        90deg,
        color-mix(in oklch, var(--cv-color-accent) 8%, transparent) 0%,
        color-mix(in oklch, var(--cv-color-accent) 4%, transparent) 100%
      );
      transform: translateX(2px);
      box-shadow: var(--cv-shadow-1);

      &::before {
        opacity: 1;
        inline-size: 5px;
      }
    }

    &[selected] {
      background: linear-gradient(
        90deg,
        color-mix(in oklch, var(--cv-color-accent) 22%, transparent) 0%,
        color-mix(in oklch, var(--cv-color-accent) 12%, transparent) 100%
      );
      box-shadow:
        var(--cv-shadow-2),
        inset 0 0 0 2px color-mix(in oklch, var(--cv-color-accent) 60%, transparent);

      &::before {
        opacity: 1;
        inline-size: 6px;
      }
    }
  }

  /* ========== GRID VIEW ========== */
  :host([view-mode='grid']) {
    block-size: 200px;
    border: 1px solid var(--cv-color-border);
    border-radius: var(--cv-radius-3);
    overflow: hidden;
    background: var(--cv-color-surface);
    position: relative;

    &::after {
      content: '';
      position: absolute;
      inset: 0;
      background: var(--gradient-subtle);
      opacity: 0;
      transition: opacity var(--cv-duration-fast) var(--cv-easing-standard);
      pointer-events: none;
      border-radius: var(--cv-radius-3);
    }

    &:hover {
      transform: translateY(-8px) scale(1.02);
      box-shadow: var(--cv-shadow-3);
      border-color: var(--cv-color-border-accent);

      &::after {
        opacity: 0.1;
      }
    }

    &[selected] {
      transform: translateY(-4px);
      border-color: var(--cv-color-primary);
      box-shadow:
        var(--cv-shadow-2),
        0 0 0 3px color-mix(in oklch, var(--cv-color-primary) 35%, transparent);
      background: color-mix(in oklch, var(--cv-color-primary) 10%, var(--cv-color-surface));

      &::after {
        opacity: 0.15;
        background: var(--gradient-primary);
      }
    }

    .file-item {
      flex-direction: column;
      justify-content: center;
      block-size: 100%;
      text-align: center;
      padding: var(--app-spacing-4);
    }

    .icon {
      font-size: 48px;
      min-inline-size: 64px;
      block-size: 64px;
      margin-block-end: var(--app-spacing-3);
    }

    .info {
      inline-size: 100%;
    }

    .name {
      font-size: var(--cv-font-size-sm);
    }

    .meta {
      font-size: var(--cv-font-size-xs);
    }

    .file-type {
      position: absolute;
      inset-block-start: 8px;
      inset-inline-end: 8px;
    }

    .actions {
      position: absolute;
      inset-block-end: 8px;
      inset-inline-end: 8px;
      inset-inline-start: 8px;
      justify-content: flex-end;
    }
  }

  /* ========== TABLE VIEW ========== */
  :host([view-mode='table']) {
    border-radius: 0;

    &::before {
      content: '';
      position: absolute;
      inset-block-start: 0;
      inset-block-end: 0;
      inline-size: 3px;
      background: var(--gradient-primary);
      opacity: 0;
      transition: opacity var(--cv-duration-fast) var(--cv-easing-standard);
    }

    &:hover {
      background: linear-gradient(
        90deg,
        color-mix(in oklch, var(--cv-color-accent) 8%, transparent) 0%,
        color-mix(in oklch, var(--cv-color-accent) 4%, transparent) 100%
      );
      transform: translateX(2px);
      box-shadow: var(--cv-shadow-sm);

      &::before {
        opacity: 1;
      }
    }

    &[selected] {
      background: linear-gradient(
        90deg,
        color-mix(in oklch, var(--cv-color-accent) 18%, transparent) 0%,
        color-mix(in oklch, var(--cv-color-accent) 10%, transparent) 100%
      );
      box-shadow:
        var(--cv-shadow-1),
        inset 0 0 0 2px color-mix(in oklch, var(--cv-color-accent) 55%, transparent);

      &::before {
        opacity: 1;
        inline-size: 4px;
      }
    }
  }
`
