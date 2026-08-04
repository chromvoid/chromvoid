import {css, nothing} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'

import {CvEmptyState} from 'root/shared/ui/empty-state'
import {defineNotesQuickViewUikitControls, NotesQuickViewBase} from './notes-quick-view-base'
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

      .quick-view > cv-empty-state,
      .quick-view > cv-guidance-anchor > cv-empty-state {
        inline-size: min(
          520px,
          calc(
            100% - var(--app-surface-gutter-desktop) - var(--app-surface-gutter-desktop)
          )
        );
        justify-self: center;
        margin-block-start: clamp(var(--app-spacing-7), 16vb, 10rem);
        --cv-empty-state-padding: clamp(var(--app-spacing-6), 4vb, var(--app-spacing-8));
        --cv-empty-state-border: 0;
        --cv-empty-state-background: transparent;
      }

      .row {
        padding-inline: var(--cv-space-3);
      }
    `,
  ]

  static define() {
    defineNotesQuickViewUikitControls()
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
      <section
        class=${this.externalToolbar ? 'quick-view quick-view--external-toolbar' : 'quick-view'}
        data-layout="desktop"
      >
        ${this.externalToolbar ? nothing : this.renderHeader()}
        ${this.renderContent()}
      </section>
    `
  }
}
