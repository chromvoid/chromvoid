import {PMEntryHOTPItemBase} from './pm-entry-hotp-item-base'
import {pmEntryHOTPItemSharedStyles} from './styles'

export class PMEntryHOTPItem extends PMEntryHOTPItemBase {
  static define() {
    customElements.define('pm-entry-hotp-item', this)
  }

  static styles = [...pmEntryHOTPItemSharedStyles]
}
