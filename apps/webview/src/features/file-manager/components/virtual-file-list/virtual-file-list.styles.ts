import {css} from 'lit'

import {motionPrimitiveStyles, sharedStyles} from 'root/shared/ui/shared-styles'

export const virtualFileListStyles = [
  sharedStyles,
  motionPrimitiveStyles,
  css`
    /* ========== КОНТЕЙНЕР ВИРТУАЛЬНОГО СПИСКА ========== */

    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      flex: 1;
      min-height: 0;
      container-type: inline-size;
      background: var(--cv-color-surface);
      overflow: hidden;
      box-shadow: var(--cv-shadow-2);
      position: relative;

      &::before {
        content: '';
        position: absolute;
        inset: 0;
        background: var(--gradient-subtle);
        opacity: 0.1;
        z-index: -1;
        pointer-events: none;
      }
    }

    /* ========== SCROLL CONTAINER ========== */

    .list-container {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      position: relative;
      contain: layout paint;
      scroll-padding-top: 4px;

      &:focus,
      &:focus-visible {
        outline: none;
      }

      &::-webkit-scrollbar {
        width: 12px;
      }

      &::-webkit-scrollbar-track {
        background: var(--cv-color-surface-2);
      }

      &::-webkit-scrollbar-thumb {
        background: color-mix(in oklch, var(--cv-color-text-muted), transparent 60%);
        border-radius: 6px;
        border: 2px solid var(--cv-color-surface-2);
      }
    }

    /* ========== LAYOUT CONTAINERS ========== */

    .list-view {
      padding: var(--app-spacing-3);
      display: flex;
      flex-direction: column;
    }

    .grid-view {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: var(--app-spacing-4);
      padding: var(--app-spacing-4);
    }

    .table-view {
      inline-size: 100%;
    }

    /* ========== TABLE HEADER ========== */

    .table-header {
      display: grid;
      grid-template-columns: 40px 1fr 120px 120px 80px;
      gap: var(--app-spacing-3);
      padding: var(--app-spacing-3) var(--app-spacing-4);
      background: linear-gradient(
        135deg,
        var(--cv-color-surface-2) 0%,
        var(--cv-color-surface-3, var(--cv-color-surface-2)) 100%
      );
      font-weight: var(--cv-font-weight-semibold);
      color: var(--cv-color-text);
      font-size: var(--cv-font-size-sm);
      position: sticky;
      top: 0;
      z-index: 10;
      box-shadow: var(--cv-shadow-sm);
      contain: layout paint style;

      .header-cell {
        display: flex;
        align-items: center;
        gap: var(--app-spacing-1);
        cursor: pointer;
        padding: var(--app-spacing-1) var(--app-spacing-2);
        border-radius: var(--cv-radius-1);
        transition:
          color var(--cv-duration-fast) var(--cv-easing-standard),
          background-color var(--cv-duration-fast) var(--cv-easing-standard);

        &:hover {
          color: var(--cv-color-primary);
          background: var(--cv-color-hover);
        }

        &.sortable.active {
          color: var(--cv-color-primary);
          background: var(--cv-color-selected);
          font-weight: var(--cv-font-weight-bold);
        }
      }
    }

    /* Table row layout (для renderTableRow) */
    .table-view {
      .file-item-wrapper {
        display: grid;
        grid-template-columns: 40px 1fr 120px 120px 80px;
        gap: var(--app-spacing-3);
        padding: var(--app-spacing-3) var(--app-spacing-4);
        align-items: center;
        border-block-end: 1px solid var(--cv-color-border-muted);

        &:nth-child(even) {
          background: color-mix(in oklch, var(--cv-color-surface-2) 40%, transparent);
        }

        &.selected {
          background: color-mix(in oklch, var(--cv-color-primary) 16%, transparent);
          box-shadow:
            inset 3px 0 0 color-mix(in oklch, var(--cv-color-primary) 55%, transparent),
            inset 0 0 0 1px color-mix(in oklch, var(--cv-color-primary) 25%, transparent);
        }
      }

      cv-checkbox.selection-checkbox::part(base) {
        gap: 0;
      }
    }

    /* ========== EMPTY STATE ========== */

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 80px 24px;
      color: var(--cv-color-text-muted);
      text-align: center;
      --motion-reveal-start-transform: translateY(16px) scale(0.95);
      --motion-reveal-end-transform: translateY(0) scale(1);
      animation: var(--motion-reveal-animation, reveal 0.4s ease-out);

      cv-icon {
        font-size: 5em;
        margin-block-end: 20px;
        opacity: 0.4;
        color: var(--cv-color-accent);
        /* floatY animation removed for perf */
      }

      h3 {
        margin: 0 0 12px 0;
        color: var(--cv-color-text);
        font-size: var(--cv-font-size-lg);
        font-weight: var(--cv-font-weight-semibold);
      }

      p {
        margin: 0;
        font-size: var(--cv-font-size-sm);
        max-inline-size: 280px;
        line-height: 1.5;
      }
    }
    /* ========== STATUS BAR ========== */

    .status-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--app-spacing-3);
      padding: 8px 12px;
      background: var(--cv-color-surface-2);
      border-block-start: 1px solid var(--cv-color-border);
      color: var(--cv-color-text);
      font-size: var(--cv-font-size-sm);

      .status-left {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .status-sep {
        opacity: 0.5;
      }

      .status-right {
        display: flex;
        align-items: center;
        gap: 6px;

        cv-button::part(base) {
          color: var(--cv-color-text-muted);
          background: transparent;
        }

        cv-button:hover::part(base) {
          color: var(--cv-color-text);
          background: var(--cv-color-hover);
        }

        cv-icon {
          color: inherit;
        }
      }

    }

    /* ========== АДАПТИВНОСТЬ ========== */

    @container (min-width: 1200px) {
      .grid-view {
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: var(--app-spacing-5);
        padding: var(--app-spacing-5);
      }
    }

    @container (min-width: 900px) and (max-width: 1200px) {
      .grid-view {
        grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
        gap: var(--app-spacing-4);
        padding: var(--app-spacing-4);
      }

      .table-header,
      .table-view .file-item-wrapper {
        grid-template-columns: 40px 1fr 140px 120px 80px;
        gap: var(--app-spacing-3);
      }
    }

    @container (min-width: 700px) and (max-width: 900px) {
      .table-header,
      .table-view .file-item-wrapper {
        grid-template-columns: 36px 1fr 120px 100px 72px;
        gap: var(--app-spacing-2);
      }

      .grid-view {
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: var(--app-spacing-3);
        padding: var(--app-spacing-3);
      }
    }

    @container (min-width: 600px) and (max-width: 700px) {
      .table-header {
        grid-template-columns: 36px 1fr 72px;

        .header-cell:nth-child(3),
        .header-cell:nth-child(4) {
          display: none;
        }
      }

      .table-view {
        .file-item-wrapper {
          grid-template-columns: 36px 1fr 72px;

          > div:nth-child(3),
          > div:nth-child(4) {
            display: none;
          }
        }
      }

      .grid-view {
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        gap: var(--app-spacing-2);
        padding: var(--app-spacing-3);
      }
    }

    @container (max-width: 600px) {
      .table-header {
        grid-template-columns: 32px 1fr 56px;
        padding: var(--app-spacing-2) var(--app-spacing-3);

        .header-cell:nth-child(3),
        .header-cell:nth-child(4) {
          display: none;
        }
      }

      .table-view {
        .file-item-wrapper {
          grid-template-columns: 32px 1fr 56px;
          padding: var(--app-spacing-2) var(--app-spacing-3);

          > div:nth-child(3),
          > div:nth-child(4) {
            display: none;
          }
        }
      }

      .grid-view {
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        gap: var(--app-spacing-2);
        padding: var(--app-spacing-2);
      }

      .list-view {
        padding: var(--app-spacing-2);
      }

      .empty-state {
        padding: 40px 16px;

        cv-icon {
          font-size: 3.5em;
          margin-block-end: 12px;
        }

        h3 {
          font-size: var(--cv-font-size-md, 1rem);
          margin-block-end: 8px;
        }

        p {
          font-size: var(--cv-font-size-xs, 0.75rem);
          max-inline-size: 240px;
        }
      }

      .status-bar {
        padding: 6px 10px;
        font-size: var(--cv-font-size-xs, 0.75rem);
        gap: var(--app-spacing-2);

        .status-left {
          gap: 8px;
          min-width: 0;

          span {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
        }

        .status-right {
          gap: 2px;
        }
      }
    }

    /* Touch-specific optimizations */
    @media (hover: none) and (pointer: coarse) {
      .list-container {
        -webkit-overflow-scrolling: touch;

        /* Hide scrollbar on touch devices */
        &::-webkit-scrollbar {
          display: none;
        }

        scrollbar-width: none;
      }

      .status-bar .status-right cv-button {
        min-block-size: 36px;
        min-inline-size: 36px;
      }
    }
  `,
]
