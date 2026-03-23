import {state} from '@statx/core'

import type {OTP} from '@project/passmanager'

export class PMEntryOTPItemModel {
  readonly otp = state<OTP | undefined>(undefined)

  private previousOtp: OTP | undefined

  setOtp(value: OTP | undefined): void {
    if (this.previousOtp && this.previousOtp !== value) {
      this.previousOtp.hide()
    }

    if (value && value !== this.previousOtp) {
      value.hide()
    }

    this.previousOtp = this.otp.peek()
    this.otp.set(value)
  }

  disconnect(): void {
    this.otp.peek()?.hide()
  }

  isHotp(): boolean {
    return this.otp.peek()?.type.peek() === 'HOTP'
  }
}
