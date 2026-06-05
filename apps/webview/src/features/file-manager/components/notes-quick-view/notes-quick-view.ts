import {css} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'

import {CvEmptyState} from 'root/shared/ui/empty-state'
import {PMSummaryRail} from '../../../passmanager/components/summary-rail'
import {NotesQuickViewBase} from './notes-quick-view-base'
import {notesQuickViewStyles} from './notes-quick-view.styles'

export class NotesQuickView extends NotesQuickViewBase {
  static styles = [
    notesQuickViewStyles,
    css`
      :host {
        padding: var(--app-surface-gutter-desktop);
      }

      .row {
        padding-inline: var(--cv-space-3);
      }
    `,
  ]

  static define() {
    CvEmptyState.define()
    PMSummaryRail.define()
    if (!customElements.get('notes-quick-view')) {
      customElements.define('notes-quick-view', this)
    }
  }

  render() {
    return html`
      <section class="quick-view" data-layout="desktop">
        ${this.renderHeader()} ${this.renderContent()}
      </section>
    `
  }
}
