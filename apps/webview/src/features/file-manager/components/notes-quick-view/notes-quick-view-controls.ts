import {css} from 'lit'

import {defineNotesQuickViewUikitControls, NotesQuickViewBase} from './notes-quick-view-base'
import {notesQuickViewStyles} from './notes-quick-view.styles'

export class NotesQuickViewControls extends NotesQuickViewBase {
  static elementName = 'notes-quick-view-controls'

  static styles = [
    notesQuickViewStyles,
    css`
      :host {
        display: block;
        block-size: auto;
        inline-size: min(100%, 720px);
        min-block-size: 0;
        margin-inline-start: auto;
      }
    `,
  ]

  static define() {
    defineNotesQuickViewUikitControls()
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
  }

  protected render() {
    return this.renderHeader()
  }
}
