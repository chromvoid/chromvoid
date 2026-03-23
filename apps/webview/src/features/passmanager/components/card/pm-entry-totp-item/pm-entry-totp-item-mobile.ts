import {PMEntryTOTPItemBase} from './pm-entry-totp-item-base'
import {pmEntryTOTPItemMobileStyles, pmEntryTOTPItemSharedStyles} from './styles'

export class PMEntryTOTPItemMobile extends PMEntryTOTPItemBase {
  static define() {
    if (!customElements.get('pm-entry-totp-item-mobile')) {
      customElements.define('pm-entry-totp-item-mobile', this)
    }
  }

  static styles = [...pmEntryTOTPItemSharedStyles, pmEntryTOTPItemMobileStyles]
}
