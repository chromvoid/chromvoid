import {CVIcon} from '@chromvoid/uikit/components/cv-icon'

import {PMEntryTOTPItemBase} from './pm-entry-totp-item-base'
import {pmEntryTOTPItemSharedStyles} from './styles'

export class PMEntryTOTPItem extends PMEntryTOTPItemBase {
  static define() {
    CVIcon.define()
    if (!customElements.get('pm-entry-totp-item')) {
      customElements.define('pm-entry-totp-item', this)
    }
  }

  static styles = pmEntryTOTPItemSharedStyles
}
