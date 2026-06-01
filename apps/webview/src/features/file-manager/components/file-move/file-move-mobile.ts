import {css} from 'lit'

import {CVButton} from '@chromvoid/uikit/components/cv-button'
import {CVIcon} from '@chromvoid/uikit/components/cv-icon'
import {CVInput} from '@chromvoid/uikit/components/cv-input'

import {FileMoveBase} from './file-move-base'
import {fileMoveSharedStyles} from './file-move.styles'

export class FileMoveMobile extends FileMoveBase {
  static define() {
    if (!customElements.get('file-move-mobile')) {
      customElements.define('file-move-mobile', this)
    }
    CVButton.define()
    CVIcon.define()
    CVInput.define()
  }

  static styles = [
    ...fileMoveSharedStyles,
    css`
      :host {
        --file-move-indent-step: 10px;
        display: grid;
        min-block-size: 0;
        block-size: 100%;
      }

      .layout {
        gap: var(--cv-space-3);
        grid-template-rows: auto auto minmax(0, 1fr);
        min-block-size: 0;
        block-size: 100%;
      }

      .search {
        position: static;
        padding-block-end: 0;
      }

      .search cv-input {
        inline-size: 100%;
      }

      .tree-wrap {
        grid-row: 3;
        block-size: 100%;
        min-block-size: 0;
        max-block-size: none;
        overflow: auto;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
      }

      .tree {
        gap: 0;
        overflow: hidden;
        border: 0;
        border-radius: var(--cv-radius-2);
        background: color-mix(in srgb, var(--cv-color-surface-2) 82%, transparent);
      }

      .tree .row:first-child {
        border-start-start-radius: var(--cv-radius-2);
        border-start-end-radius: var(--cv-radius-2);
      }

      .tree .row:last-child {
        border-end-start-radius: var(--cv-radius-2);
        border-end-end-radius: var(--cv-radius-2);
      }

      .row {
        grid-template-columns: 24px minmax(0, 1fr) 24px;
        min-block-size: 56px;
        padding-block: var(--cv-space-2);
        padding-inline: var(--cv-space-3);
        border: 0;
        border-radius: 0;
        background: transparent;
        box-shadow: none;
      }

      .row:hover {
        border-color: transparent;
        background: var(--cv-color-surface-2);
      }

      .row.selected {
        border-color: transparent;
        background: color-mix(in srgb, var(--cv-color-primary) 14%, var(--cv-color-surface));
        font-weight: var(--cv-font-weight-medium);
      }

      .row.active {
        outline: 0;
      }

      .tree:focus-within .row.active {
        box-shadow: inset 0 0 0 2px var(--cv-color-primary-ring);
      }

      .row[aria-disabled='true']:hover {
        border-color: transparent;
        background: transparent;
      }

      .label {
        gap: var(--cv-space-3);
      }

      .chevron {
        inline-size: 24px;
        block-size: 24px;
      }

      .chevron cv-icon {
        inline-size: 14px;
        block-size: 14px;
      }

      .folder-icon {
        inline-size: 18px;
        block-size: 18px;
      }

      .name {
        font-size: var(--cv-font-size-sm);
        line-height: 1.25;
      }

      .subtitle {
        font-size: 0.75rem;
      }

      .recent-items {
        gap: 6px;
      }

      .recent-btn {
        min-block-size: 30px;
        padding-inline: 10px;
        border-radius: 999px;
        background: var(--cv-color-surface);
      }
    `,
  ]
}
