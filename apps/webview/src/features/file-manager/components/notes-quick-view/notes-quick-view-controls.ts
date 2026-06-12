import {css} from 'lit'

import {NotesQuickViewBase} from './notes-quick-view-base'
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
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
  }

  protected render() {
    return this.renderControls()
  }
}
