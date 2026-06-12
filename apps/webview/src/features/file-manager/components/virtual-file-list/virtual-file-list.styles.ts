import {css} from 'lit'

import {motionPrimitiveStyles, sharedStyles} from 'root/shared/ui/shared-styles'
import {scrollEdgeAffordanceStyles} from 'root/shared/ui/scroll-edge-affordance.styles'

export const virtualFileListStyles = [
  sharedStyles,
  motionPrimitiveStyles,
  scrollEdgeAffordanceStyles,
  css`
    /*========== Virtual List Container ===========*/

    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      flex: 1;
      min-height: 0;
      container-type: inline-size;
      background: transparent;
      overflow: hidden;
      position: relative;
      --file-list-padding-block: var(--app-spacing-6);
      --file-list-padding-inline: var(--app-spacing-6);
      --file-list-item-height: 80px;
    }

    /* ========== SCROLL CONTAINER ========== */

    .file-list-scroll-edge {
      flex: 1;
      min-block-size: 0;
      --cv-scroll-edge-block-size: var(--cv-scroll-edge-list-block-size);
      --cv-scroll-edge-inline-end: var(--cv-scroll-edge-list-inline-end);
      --cv-scroll-edge-surface: var(--cv-scroll-edge-default-surface);
    }

    .list-container {
      flex: 1;
      block-size: 100%;
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
        background: var(--cv-color-text-subtle);
        border-radius: 6px;
        border: 2px solid var(--cv-color-surface-2);
      }
    }

    .list-container > cv-empty-state {
      padding: var(--cv-empty-state-page-gap, var(--cv-space-3))
        var(--cv-empty-state-page-inline-padding, var(--app-surface-gutter-desktop, var(--cv-space-4))) 0;
    }

    /* ========== LAYOUT CONTAINERS ========== */

    .list-view {
      padding: var(--file-list-padding-block) var(--file-list-padding-inline);
      display: flex;
      flex-direction: column;
    }

    .grid-view {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: var(--app-spacing-4);
      padding: var(--app-spacing-4);
    }

    .grid-virtual-spacer {
      block-size: var(--virtual-total-height, 0px);
      position: relative;
    }

    .grid-virtual-window {
      transform: translateY(var(--virtual-offset-y, 0px));
    }

    .table-view {
      inline-size: 100%;
    }

    .virtual-spacer {
      block-size: var(--virtual-total-height, 0px);
    }

    .virtual-window {
      transform: translateY(var(--virtual-offset-y, 0px));
    }

    file-item-desktop[data-delete-exiting],
    file-item-mobile[data-delete-exiting],
    .file-item-wrapper[data-delete-exiting] {
      pointer-events: none;
      transform-origin: center;
      animation: file-delete-row-exit var(--cv-duration-normal, 250ms)
        var(--cv-easing-decelerate, cubic-bezier(0, 0, 0.2, 1)) both;
      will-change: transform, opacity;
    }

    @keyframes file-delete-row-exit {
      0% {
        opacity: 1;
        transform: scale(1);
      }

      35% {
        opacity: 0.92;
        transform: scale(1.025, 0.94);
      }

      100% {
        opacity: 0;
        transform: scale(0.96, 0.82);
      }
    }

    .mobile-dnd-live {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    .mobile-dnd-ghost {
      position: fixed;
      inset-block-start: 0;
      inset-inline-start: 0;
      z-index: 30;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      max-inline-size: min(280px, calc(100vw - 24px));
      padding: 8px 10px;
      border: 1px solid var(--cv-color-primary);
      border-radius: var(--cv-radius-2);
      background: var(--cv-color-surface);
      color: var(--cv-color-text);
      box-shadow: var(--cv-shadow-3);
      pointer-events: none;
      transform: translate(var(--file-mobile-dnd-x, 0), var(--file-mobile-dnd-y, 0)) translate(12px, 12px);
    }

    .mobile-dnd-ghost span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .file-item-skeleton {
      min-block-size: 64px;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border-radius: var(--cv-radius-2);
      background: var(--cv-color-surface-2);
      border: 1px solid var(--cv-color-border-muted);
      pointer-events: none;
      contain: layout paint style;

      .skeleton-icon,
      .skeleton-cell,
      .skeleton-lines span {
        display: block;
        border-radius: var(--cv-radius-1);
        background: linear-gradient(
          90deg,
          var(--cv-color-surface-3, var(--cv-color-surface-2)),
          var(--cv-color-hover),
          var(--cv-color-surface-3, var(--cv-color-surface-2))
        );
        background-size: 200% 100%;
        animation: skeleton-pulse 1.2s ease-in-out infinite;
      }

      .skeleton-icon {
        inline-size: 32px;
        block-size: 32px;
        border-radius: 8px;
        flex: 0 0 auto;
      }

      .skeleton-lines {
        display: grid;
        gap: 8px;
        inline-size: min(220px, 65%);

        span:first-child {
          inline-size: 100%;
          block-size: 12px;
        }

        span:last-child {
          inline-size: 54%;
          block-size: 10px;
        }
      }
    }

    .file-item-skeleton-table {
      min-block-size: 0;
      block-size: auto;

      .skeleton-lines {
        inline-size: min(240px, 70%);
      }

      .skeleton-cell {
        inline-size: 72px;
        block-size: 12px;
      }
    }

    @keyframes skeleton-pulse {
      from {
        background-position: 100% 0;
      }

      to {
        background-position: -100% 0;
      }
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

    /*Table row layout (for renderTableRow)*/
    .table-view {
      .file-item-wrapper {
        display: grid;
        grid-template-columns: 40px 1fr 120px 120px 80px;
        gap: var(--app-spacing-3);
        padding: var(--app-spacing-3) var(--app-spacing-4);
        align-items: center;
        position: relative;
        outline: 2px solid transparent;
        outline-offset: -2px;
        border-block-end: 1px solid var(--cv-color-border-muted);
        transition:
          background var(--cv-duration-fast) var(--cv-easing-standard),
          border-color var(--cv-duration-fast) var(--cv-easing-standard),
          box-shadow var(--cv-duration-fast) var(--cv-easing-standard),
          outline-color var(--cv-duration-fast) var(--cv-easing-standard);

        &:nth-child(even) {
          background: var(--cv-color-surface-secondary-glass-soft);
        }

        &.selected {
          background: var(--cv-color-primary-surface-strong);
          border-color: var(--cv-color-primary);
          outline-color: var(--cv-color-primary-ring);
          box-shadow: inset 4px 0 0 var(--cv-color-primary);
        }

        &[aria-busy='true'] {
          background: var(--cv-color-primary-surface);
        }

        &.selected[aria-busy='true'] {
          background: var(--cv-color-primary-surface-strong);
          box-shadow:
            inset 4px 0 0 var(--cv-color-primary),
            inset 0 0 0 1px var(--cv-color-primary-border-strong);
        }
      }

      cv-checkbox.selection-checkbox::part(base) {
        gap: 0;
      }

      .table-primary-cell {
        display: flex;
        align-items: center;
        gap: 8px;
      }
    }

    /* ========== STATUS BAR ========== */

    .status-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--app-spacing-3);
      color: var(--cv-color-text);
      font-size: var(--cv-font-size-sm);

      .status-summary {
        flex: 1 1 auto;
        min-inline-size: 0;
      }
    }

    /*====================*/

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

    @media (hover: none) and (pointer: coarse) {
      @container (min-width: 700px) and (max-width: 900px) {
        .grid-view {
          --file-grid-touch-card-block-size: 144px;
          --file-grid-touch-thumbnail-size: 56px;
          --file-grid-touch-icon-size: 34px;
          --file-grid-touch-icon-target-size: 40px;
          --file-grid-touch-thumbnail-gap: var(--app-spacing-2);
          gap: var(--app-spacing-2);
          padding: var(--app-spacing-2);
        }
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
      .list-container {
        background: transparent;
      }

      .table-header {
        grid-template-columns: 32px 1fr 56px;
        padding: var(--app-spacing-2) var(--app-mobile-surface-gutter-inline);

        .header-cell:nth-child(3),
        .header-cell:nth-child(4) {
          display: none;
        }
      }

      .table-view {
        .file-item-wrapper {
          grid-template-columns: 32px 1fr 56px;
          padding: var(--app-spacing-2) var(--app-mobile-surface-gutter-inline);

          > div:nth-child(3),
          > div:nth-child(4) {
            display: none;
          }
        }
      }

      .grid-view {
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        gap: var(--app-mobile-surface-gap);
        padding: var(--app-mobile-surface-gutter-block-start) var(--app-mobile-surface-gutter-inline)
          var(--app-mobile-surface-gutter-block-end);
      }

      .list-view {
        padding: var(--app-mobile-surface-gutter-block-start) var(--app-mobile-surface-gutter-inline)
          var(--app-mobile-surface-gutter-block-end);
      }

      .list-container > cv-empty-state {
        padding-block-start: var(--cv-empty-state-page-gap, var(--cv-space-3));
        padding-inline: var(
          --cv-empty-state-page-inline-padding,
          var(--app-mobile-surface-gutter-inline, var(--cv-space-4))
        );
      }

      .status-bar {
        padding: 0 var(--cv-space-3);
        font-size: var(--cv-font-size-xs, 0.75rem);
        gap: var(--app-spacing-2);
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
    }

    @media (prefers-reduced-motion: reduce) {
      file-item-desktop[data-delete-exiting],
      file-item-mobile[data-delete-exiting],
      .file-item-wrapper[data-delete-exiting] {
        animation: file-delete-row-exit-reduced 1ms linear both;
        transform: none;
        will-change: opacity;
      }

      @keyframes file-delete-row-exit-reduced {
        to {
          opacity: 0;
        }
      }
    }
  `,
]
