import {CVIcon} from '@chromvoid/uikit'

import {PMEntryMoveBase} from './pm-entry-move-base'
import {pmEntryMoveSharedStyles} from './styles'

export class PMEntryMove extends PMEntryMoveBase {
  static styles = [...pmEntryMoveSharedStyles]

  static define() {
    customElements.define('pm-entry-move', this)
    CVIcon.define()
  }
}
