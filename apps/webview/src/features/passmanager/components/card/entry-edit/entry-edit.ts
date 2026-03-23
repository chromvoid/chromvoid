import {PMEntryEditBase} from './entry-edit-base'
import {pmEntryEditSharedStyles} from './styles'

export class PMEntryEdit extends PMEntryEditBase {
  static define() {
    customElements.define('pm-entry-edit', this)
  }

  static styles = pmEntryEditSharedStyles
}
