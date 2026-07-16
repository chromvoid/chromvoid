import {css} from 'lit'

export const virtualFileListDesktopStyles = css`
  :host(:not([mobile])) {
    --file-list-item-block-size: 36px;

    .list-container {
      overflow-x: auto;
      scroll-padding-block-start: 30px;
    }

    .list-view {
      padding: 2px 0;
    }

    .grid-view {
      grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
      gap: var(--app-spacing-3);
      padding: var(--app-spacing-3);
    }

    .list-container > cv-empty-state {
      inline-size: min(440px, calc(100% - 32px));
      margin: clamp(64px, 18vh, 160px) auto 0;
      padding: 0;
      --cv-empty-state-padding: var(--app-spacing-6);
      --cv-empty-state-border: 0;
      --cv-empty-state-background: transparent;
      --cv-empty-state-min-block-size: auto;
    }

    .file-item-skeleton-list {
      block-size: 36px;
      min-block-size: 36px;
      gap: 8px;
      padding: 0 10px;
      border: 0;
      border-block-end: 1px solid var(--cv-color-border-muted);
      border-radius: 0;
      background: transparent;
    }

    .file-item-skeleton-list .skeleton-icon {
      inline-size: 18px;
      block-size: 18px;
      border-radius: var(--cv-radius-1);
    }

    .file-item-skeleton-list .skeleton-lines {
      display: flex;
      align-items: center;
      gap: 12px;
      inline-size: min(320px, 70%);
    }

    .file-item-skeleton-list .skeleton-lines span:first-child {
      inline-size: min(180px, 60%);
      block-size: 9px;
    }

    .file-item-skeleton-list .skeleton-lines span:last-child {
      inline-size: min(92px, 34%);
      block-size: 8px;
    }

    .file-item-skeleton-grid {
      min-block-size: 140px;
      block-size: 140px;
      grid-template-rows: 76px minmax(0, 1fr);
      gap: 7px;
      padding: 8px;
      border-radius: var(--cv-radius-2);
      background: var(--cv-color-surface-2);
      box-shadow: none;
    }

    .file-item-skeleton-grid .skeleton-icon {
      block-size: 76px;
      border-radius: var(--cv-radius-1);
    }

    .table-view {
      min-inline-size: 660px;
    }

    .table-header,
    .table-view .file-item-wrapper {
      grid-template-columns: 32px minmax(180px, 1fr) 108px 96px 150px 52px;
      gap: 0;
      padding-inline: 8px;
    }

    .table-header {
      block-size: 30px;
      padding-block: 0;
      border-block-end: 1px solid var(--cv-color-border-muted);
      background: var(--cv-color-surface);
      box-shadow: none;
      color: var(--cv-color-text-subtle);
      font-size: var(--cv-font-size-xs);
      font-weight: var(--cv-font-weight-medium);
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .table-header .header-cell {
      min-inline-size: 0;
      block-size: 100%;
      padding: 0 8px;
      border-radius: 0;
      cursor: default;
      transition: color var(--cv-duration-fast) var(--cv-easing-standard);
    }

    .table-header .header-cell:hover,
    .table-header .header-cell.sortable.active {
      background: transparent;
    }

    .table-header .header-cell.sortable.active {
      color: var(--cv-color-primary);
      font-weight: var(--cv-font-weight-semibold);
    }

    .table-sort-button {
      inline-size: 100%;
      block-size: 100%;
      display: flex;
      align-items: center;
      gap: 4px;
      min-inline-size: 0;
      padding: 0;
      border: 0;
      background: transparent;
      color: inherit;
      cursor: pointer;
      font: inherit;
      letter-spacing: inherit;
      text-transform: inherit;
      text-align: start;
    }

    .table-sort-button span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .table-sort-button cv-icon {
      flex: 0 0 auto;
      font-size: 11px;
    }

    .table-sort-button:hover {
      color: var(--cv-color-text);
    }

    .table-sort-button:focus-visible {
      border-radius: var(--cv-radius-1);
      outline: 2px solid var(--cv-color-focus);
      outline-offset: -2px;
    }

    .table-selection-cell {
      display: flex;
      align-items: center;
      justify-content: center;
      padding-inline: 0;
    }

    .table-actions-header {
      justify-content: flex-end;
      overflow: hidden;
      text-overflow: clip;
      white-space: nowrap;
    }

    .table-header .header-cell:nth-child(3),
    .table-header .header-cell:nth-child(4) {
      display: flex;
    }

    .table-view .file-item-wrapper > div:nth-child(3),
    .table-view .file-item-wrapper > div:nth-child(4) {
      display: block;
    }

    .table-view .file-item-wrapper {
      block-size: var(--file-list-item-block-size, 36px);
      min-block-size: 0;
      padding-block: 0;
      border: 0;
      border-block-end: 1px solid var(--cv-color-border-muted);
      border-radius: 0;
      background: transparent;
      outline: none;
      box-shadow: none;
      cursor: default;
      contain: layout paint style;
      transition: background-color var(--cv-duration-fast) var(--cv-easing-standard);
    }

    .table-view .file-item-wrapper::before {
      content: '';
      position: absolute;
      inset-block: 5px;
      inset-inline-start: 0;
      inline-size: 2px;
      border-radius: var(--cv-radius-1);
      background: var(--cv-color-primary-border-strong);
      opacity: 0;
      transition:
        opacity var(--cv-duration-fast) var(--cv-easing-standard),
        background-color var(--cv-duration-fast) var(--cv-easing-standard);
    }

    .table-view .file-item-wrapper:nth-child(even) {
      background: transparent;
    }

    .table-view .file-item-wrapper:hover {
      background: var(--cv-color-hover);
    }

    .table-view .file-item-wrapper.active {
      background: var(--cv-color-surface-secondary-glass-soft);
    }

    .table-view .file-item-wrapper.active::before {
      opacity: 1;
    }

    .table-view .file-item-wrapper.selected,
    .table-view .file-item-wrapper.selected[aria-busy='true'] {
      border-color: transparent;
      background: var(--cv-color-primary-surface);
      outline: none;
      box-shadow: none;
    }

    .table-view .file-item-wrapper.selected::before {
      inline-size: 3px;
      background: var(--cv-color-primary);
      opacity: 1;
    }

    .table-view .file-item-wrapper:focus-visible {
      outline: 2px solid var(--cv-color-focus);
      outline-offset: -2px;
      z-index: 1;
    }

    .table-view .file-item-wrapper[aria-busy='true']:not(.selected) {
      background: var(--cv-color-primary-subtle);
    }

    .table-view .file-item-wrapper > [role='gridcell'] {
      min-inline-size: 0;
      padding-inline: 8px;
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-xs);
      font-variant-numeric: tabular-nums;
    }

    .table-view .table-primary-cell {
      gap: 8px;
      overflow: hidden;
      color: var(--cv-color-text);
      font-size: var(--cv-font-size-sm);
    }

    .table-file-icon {
      flex: 0 0 auto;
      font-size: 17px;
      color: var(--cv-color-text-muted);
    }

    .table-file-icon.folder {
      color: var(--cv-color-primary);
    }

    .table-file-icon.file-image {
      color: var(--cv-color-success);
    }

    .table-file-icon.file-document {
      color: var(--cv-color-accent);
    }

    .table-file-icon.file-archive {
      color: var(--cv-color-warning);
    }

    .table-file-icon.file-media {
      color: var(--cv-color-cyan);
    }

    .table-file-icon.file-code {
      color: var(--cv-color-primary-dark);
    }

    .table-file-name,
    .table-type-cell,
    .table-date-cell,
    .table-size-cell {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .hidden-badge {
      flex: 0 0 auto;
      max-inline-size: 88px;
      overflow: hidden;
      padding: 1px 4px;
      border: 1px solid var(--cv-color-border-muted);
      border-radius: var(--cv-radius-1);
      color: var(--cv-color-text-subtle);
      font-size: var(--cv-font-size-xs);
      line-height: 1.2;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .table-open-status {
      flex: 0 1 auto;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      min-inline-size: 0;
      color: var(--cv-color-primary);
      font-size: var(--cv-font-size-xs);
    }

    .table-open-status span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .table-open-status cv-spinner {
      flex: 0 0 auto;
    }

    .table-actions {
      display: flex;
      justify-content: flex-end;
      opacity: 0;
      pointer-events: none;
      transition: opacity var(--cv-duration-fast) var(--cv-easing-standard);
    }

    .file-item-wrapper:hover .table-actions,
    .file-item-wrapper.active .table-actions,
    .file-item-wrapper:focus-within .table-actions {
      opacity: 1;
      pointer-events: auto;
    }

    .table-action-button {
      inline-size: 24px;
      block-size: 24px;
      display: inline-grid;
      place-items: center;
      padding: 0;
      border: 0;
      border-radius: var(--cv-radius-1);
      background: transparent;
      color: var(--cv-color-text-subtle);
      cursor: pointer;
    }

    .table-action-button:hover {
      background: var(--cv-color-hover);
      color: var(--cv-color-text);
    }

    .table-view[data-selection-mode='false'] .selection-checkbox:not([checked]) {
      opacity: 0.5;
    }

    .file-item-skeleton-table {
      block-size: var(--file-list-item-block-size, 36px);
      min-block-size: 0;
      padding-block: 0;
      border: 0;
      border-block-end: 1px solid var(--cv-color-border-muted);
      border-radius: 0;
      background: transparent;
    }

    .file-item-skeleton-table .skeleton-icon {
      inline-size: 17px;
      block-size: 17px;
    }

    .file-item-skeleton-table .skeleton-lines {
      display: block;
      inline-size: min(180px, 75%);
    }

    .file-item-skeleton-table .skeleton-lines span:last-child {
      display: none;
    }

    .file-item-skeleton-table .skeleton-cell {
      block-size: 8px;
    }

    .empty-actions {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-wrap: wrap;
      gap: var(--app-spacing-2);
    }

    @media (prefers-reduced-motion: reduce) {
      .table-header .header-cell,
      .table-view .file-item-wrapper,
      .table-view .file-item-wrapper::before,
      .table-actions {
        transition-duration: 0ms;
      }

      .file-item-skeleton .skeleton-icon,
      .file-item-skeleton .skeleton-cell,
      .file-item-skeleton .skeleton-lines span {
        animation: none;
      }
    }
  }
`
