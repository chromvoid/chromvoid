import {PMEntryListItemBase} from './entry-list-item-base'
import {pmEntryListItemBaseStyles, pmEntryListItemDesktopStyles} from './styles'

export class PMEntryListItem extends PMEntryListItemBase {
  static define() {
    customElements.define('pm-entry-list-item', this)
  }

  static styles = [...pmEntryListItemBaseStyles, pmEntryListItemDesktopStyles]
}
