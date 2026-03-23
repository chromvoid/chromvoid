import {PMEntryCreateBase} from './entry-create-base'
import {pmEntryCardStyles, pmEntryCreateStyles, pmEntryGenerateStyles} from './styles'

export class PMEntryCreate extends PMEntryCreateBase {
  static define() {
    customElements.define('pm-entry-create', this)
  }

  static styles = [pmEntryCardStyles, pmEntryGenerateStyles, pmEntryCreateStyles]
}
