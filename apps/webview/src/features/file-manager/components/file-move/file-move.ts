import {CVButton} from '@chromvoid/uikit/components/cv-button'
import {CVIcon} from '@chromvoid/uikit/components/cv-icon'
import {CVInput} from '@chromvoid/uikit/components/cv-input'

import {FileMoveBase} from './file-move-base'
import {fileMoveSharedStyles} from './file-move.styles'

export class FileMove extends FileMoveBase {
  static styles = [...fileMoveSharedStyles]

  static define() {
    if (!customElements.get('file-move')) {
      customElements.define('file-move', this)
    }
    CVButton.define()
    CVIcon.define()
    CVInput.define()
  }
}
