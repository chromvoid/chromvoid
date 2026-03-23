import {css} from 'lit'

import {CVIcon} from '@chromvoid/uikit'

import {PMEntryMoveBase} from './pm-entry-move-base'
import {pmEntryMoveSharedStyles} from './styles'

export class PMEntryMoveMobile extends PMEntryMoveBase {
  static define() {
    if (!customElements.get('pm-entry-move-mobile')) {
      customElements.define('pm-entry-move-mobile', this)
    }
    CVIcon.define()
  }

  static styles = [
    ...pmEntryMoveSharedStyles,
    css`
      :host {
        --pm-entry-move-indent-step: 10px;
      }

      .layout {
        gap: var(--cv-space-3);
      }

      .search {
        position: static;
        padding-block-end: 0;
      }

      .tree-wrap {
        max-block-size: min(56vh, 420px);
      }

      .tree {
        gap: 4px;
      }

      .row {
        min-block-size: 42px;
        padding-block: 8px;
      }

      .chevron {
        inline-size: 22px;
        block-size: 22px;
      }

      .name {
        font-size: var(--cv-font-size-sm);
      }

      .recent-items {
        gap: 8px;
      }

      .recent-btn {
        min-block-size: 32px;
        padding-inline: 10px;
      }
    `,
  ]
}
