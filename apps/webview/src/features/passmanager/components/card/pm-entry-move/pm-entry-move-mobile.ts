import {css} from 'lit'

import {CVButton} from '@chromvoid/uikit/components/cv-button'
import {CVIcon} from '@chromvoid/uikit/components/cv-icon'
import {CVInput} from '@chromvoid/uikit/components/cv-input'

import {PMEntryMoveBase} from './pm-entry-move-base'
import {pmEntryMoveSharedStyles} from './styles'

export class PMEntryMoveMobile extends PMEntryMoveBase {
  static define() {
    if (!customElements.get('pm-entry-move-mobile')) {
      customElements.define('pm-entry-move-mobile', this)
    }
    CVButton.define()
    CVIcon.define()
    CVInput.define()
  }

  static styles = [
    ...pmEntryMoveSharedStyles,
    css`
      :host {
        --pm-entry-move-indent-step: var(--pm-move-indent-step-mobile);
      }

      .layout {
        gap: var(--cv-space-3);
      }

      .search {
        position: static;
        padding-block-end: 0;
      }

      .search cv-input {
        inline-size: 100%;
      }

      .tree-wrap {
        max-block-size: min(58vh, 440px);
        overflow: auto;
      }

      .tree {
        gap: 1px;
        overflow: hidden;
        border: 1px solid var(--cv-color-border);
        border-radius: var(--cv-radius-2);
        background: var(--cv-color-border);
      }

      .row {
        grid-template-columns: 24px minmax(0, 1fr) 24px;
        min-block-size: 48px;
        padding-block: 9px;
        padding-inline: 12px;
        border: 0;
        border-radius: 0;
        background: var(--cv-color-surface);
        box-shadow: none;
      }

      .row:hover {
        border-color: transparent;
        background: var(--cv-color-surface-2);
      }

      .row.selected {
        border-color: transparent;
        background: var(--cv-color-primary-surface);
        box-shadow: inset 3px 0 0 var(--cv-color-primary);
      }

      .row[aria-disabled='true']:hover {
        border-color: transparent;
        background: var(--cv-color-surface);
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
