import {css, nothing} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'

import {CvEmptyState} from 'root/shared/ui/empty-state'
import {PMSummaryRail} from '../../../passmanager/components/summary-rail'
import {NotesQuickViewBase} from './notes-quick-view-base'
import {notesQuickViewStyles} from './notes-quick-view.styles'

export class NotesQuickViewMobile extends NotesQuickViewBase {
  static styles = [
    notesQuickViewStyles,
    css`
      :host {
        box-sizing: border-box;
        block-size: 100%;
        min-block-size: 0;
        overflow: hidden;
        padding: var(--app-surface-gutter-mobile);
        padding-bottom: 0px;
      }

      .quick-view {
        display: flex;
        flex-direction: column;
        block-size: 100%;
        gap: var(--cv-space-2);
        min-block-size: 0;
      }

      .quick-view__header {
        flex: 0 0 auto;
        gap: var(--cv-space-2);
        padding-inline: 0;
      }

      .quick-view__content {
        flex: 1 1 auto;
        min-block-size: 0;
        min-inline-size: 0;
        overflow-x: hidden;
        overflow-y: auto;
        overscroll-behavior-y: contain;
        -webkit-overflow-scrolling: touch;
      }

      .controls {
        position: sticky;
        z-index: 2;
        inset-block-start: 0;
        padding-block: var(--cv-space-2);
        background: var(--cv-color-surface-1);
      }

      .search {
        flex: 1 1 auto;
      }

      .clear-filters--compact {
        flex: 0 0 auto;
      }

      .row {
        gap: var(--cv-space-2);
        padding: var(--cv-space-2);
      }

      .quick-view__summary-rail {
        z-index: 1;
        flex: 0 0 auto;
        max-inline-size: 100%;
        margin: auto 0 0;
        --pm-summary-rail-inline-size: 100%;
      }
    `,
  ]

  static define() {
    CvEmptyState.define()
    PMSummaryRail.define()
    if (!customElements.get('notes-quick-view-mobile')) {
      customElements.define('notes-quick-view-mobile', this)
    }
  }

  protected renderHeaderSummary(): typeof nothing {
    return nothing
  }

  render() {
    return html`
      <section class="quick-view" data-layout="mobile">
        ${this.renderHeader()}
        <div class="quick-view__content">${this.renderContent()}</div>
        ${this.renderSummary()}
      </section>
    `
  }
}
