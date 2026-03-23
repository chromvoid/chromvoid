import {html, nothing} from 'lit'

import {PMEntryHOTPItemMobile} from '../pm-entry-hotp-item'
import {PMEntryTOTPItemMobile} from '../pm-entry-totp-item'
import {PMEntryOTPItemBase} from './pm-entry-otp-item-base'

export class PMEntryOTPItemMobile extends PMEntryOTPItemBase {
  static define() {
    PMEntryTOTPItemMobile.define()
    PMEntryHOTPItemMobile.define()
    if (!customElements.get('pm-entry-otp-item-mobile')) {
      customElements.define('pm-entry-otp-item-mobile', this)
    }
  }

  override render() {
    const otp = this.model.otp()
    if (!otp) {
      return nothing
    }

    if (this.model.isHotp()) {
      return html`<pm-entry-hotp-item-mobile .otp=${otp}></pm-entry-hotp-item-mobile>`
    }

    return html`<pm-entry-totp-item-mobile .otp=${otp}></pm-entry-totp-item-mobile>`
  }
}
