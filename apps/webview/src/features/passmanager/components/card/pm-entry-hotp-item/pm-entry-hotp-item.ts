import {PMEntryHOTPItemBase} from './pm-entry-hotp-item-base'
import {pmEntryHOTPItemSharedStyles} from './styles'

export class PMEntryHOTPItem extends PMEntryHOTPItemBase {
  static define() {
    if (!customElements.get('pm-entry-hotp-item')) {
      customElements.define('pm-entry-hotp-item', this)
    }
  }

  static styles = [...pmEntryHOTPItemSharedStyles]
}
