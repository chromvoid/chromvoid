import {CVButton} from '@chromvoid/uikit/components/cv-button'
import {CVIcon} from '@chromvoid/uikit/components/cv-icon'
import {CVInput} from '@chromvoid/uikit/components/cv-input'

import {PMEntryMoveBase} from './pm-entry-move-base'
import {pmEntryMoveSharedStyles} from './styles'

export class PMEntryMove extends PMEntryMoveBase {
  static styles = [...pmEntryMoveSharedStyles]

  static define() {
    if (!customElements.get('pm-entry-move')) {
      customElements.define('pm-entry-move', this)
    }
    CVButton.define()
    CVIcon.define()
    CVInput.define()
  }
}
