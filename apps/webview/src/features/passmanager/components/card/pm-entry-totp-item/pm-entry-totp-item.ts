import {PMEntryTOTPItemBase} from './pm-entry-totp-item-base'
import {pmEntryTOTPItemDesktopStyles, pmEntryTOTPItemSharedStyles} from './styles'

export class PMEntryTOTPItem extends PMEntryTOTPItemBase {
  static define() {
    customElements.define('pm-entry-totp-item', this)
  }

  static styles = [...pmEntryTOTPItemSharedStyles, pmEntryTOTPItemDesktopStyles]
}
