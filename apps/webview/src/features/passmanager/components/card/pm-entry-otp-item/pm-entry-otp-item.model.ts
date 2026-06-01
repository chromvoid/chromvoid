import {action, atom, peek} from '@reatom/core'

import type {OTP} from '@project/passmanager/core'

export class PMEntryOTPItemModel {
  private readonly otpState = atom<OTP | undefined>(undefined, 'passmanager.entryOtpItem.otp')

  private previousOtp: OTP | undefined

  readonly state = {
    otp: this.otpState,
  }

  readonly actions = {
    setOtp: action((value: OTP | undefined) => {
      if (this.previousOtp && this.previousOtp !== value) {
        this.previousOtp.hide()
      }

      if (value && value !== this.previousOtp) {
        value.hide()
      }

      this.otpState.set(value)
      this.previousOtp = value
    }, 'passmanager.entryOtpItem.setOtp'),

    disconnect: action(() => {
      this.otpState()?.hide()
      this.previousOtp = undefined
    }, 'passmanager.entryOtpItem.disconnect'),
  }

  isHotp(): boolean {
    const type = this.otpState()?.type
    if (typeof type !== 'function') {
      return false
    }

    return peek(type) === 'HOTP'
  }
}
