import {ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import type {OTP} from '@project/passmanager/core'
import {PMEntryOTPItemModel} from './pm-entry-otp-item.model'

/*** Facade for OTP components.
Automatically selects the desired component depending on the type of OTP:
* - TOTP → pm-entry-totp-item
* - HOTP → pm-entry-hotp-item
*/
export class PMEntryOTPItemBase extends ReatomLitElement {
  static properties = {
    removable: {type: Boolean},
  }

  protected readonly model = new PMEntryOTPItemModel()

  hasSelector: boolean
  declare removable: boolean

  constructor() {
    super()
    this.hasSelector = true
    this.removable = false
  }

  get otp(): OTP | undefined {
    return this.model.state.otp()
  }

  set otp(value: OTP | undefined) {
    this.model.actions.setOtp(value)
  }

  disconnectedCallback(): void {
    this.model.actions.disconnect()
    super.disconnectedCallback()
  }
}
