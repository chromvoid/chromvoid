import {PMEntryHOTPItemBase} from './pm-entry-hotp-item-base'
import {pmEntryHOTPItemMobileStyles, pmEntryHOTPItemSharedStyles} from './styles'

export class PMEntryHOTPItemMobile extends PMEntryHOTPItemBase {
  static define() {
    if (!customElements.get('pm-entry-hotp-item-mobile')) {
      customElements.define('pm-entry-hotp-item-mobile', this)
    }
  }

  static styles = [...pmEntryHOTPItemSharedStyles, pmEntryHOTPItemMobileStyles]
}
