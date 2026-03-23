import {html, nothing} from 'lit'

import {PMEntryHOTPItem} from '../pm-entry-hotp-item'
import {PMEntryTOTPItem} from '../pm-entry-totp-item'
import {PMEntryOTPItemBase} from './pm-entry-otp-item-base'

export class PMEntryOTPItem extends PMEntryOTPItemBase {
  static define() {
    PMEntryTOTPItem.define()
    PMEntryHOTPItem.define()
    customElements.define('pm-entry-otp-item', this)
  }

  render() {
    const otp = this.model.otp()
    if (!otp) {
      return nothing
    }

    if (this.model.isHotp()) {
      return html`<pm-entry-hotp-item .otp=${otp}></pm-entry-hotp-item>`
    }

    return html`<pm-entry-totp-item .otp=${otp}></pm-entry-totp-item>`
  }
}
