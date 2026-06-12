import {css, nothing} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'

import {CvEmptyState} from 'root/shared/ui/empty-state'
import {NotesQuickViewBase} from './notes-quick-view-base'
import {notesQuickViewStyles} from './notes-quick-view.styles'

export class NotesQuickView extends NotesQuickViewBase {
  static properties = {
    externalToolbar: {type: Boolean, attribute: 'external-toolbar'},
  }

  declare externalToolbar: boolean

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
    if (!customElements.get('notes-quick-view')) {
      customElements.define('notes-quick-view', this)
    }
  }

  constructor() {
    super()
    this.externalToolbar = false
  }

  render() {
    return html`
      <section class="quick-view" data-layout="desktop">
        ${this.externalToolbar ? nothing : this.renderHeader()}
        ${this.renderContent()}
      </section>
    `
  }
}
