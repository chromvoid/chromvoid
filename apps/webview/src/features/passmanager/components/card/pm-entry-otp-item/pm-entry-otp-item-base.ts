import {XLitElement} from '@statx/lit'

import type {OTP} from '@project/passmanager'
import {PMEntryOTPItemModel} from './pm-entry-otp-item.model'

/**
 * Фасад для OTP компонентов.
 * Автоматически выбирает нужный компонент в зависимости от типа OTP:
 * - TOTP → pm-entry-totp-item / pm-entry-totp-item-mobile
 * - HOTP → pm-entry-hotp-item / pm-entry-hotp-item-mobile
 */
export class PMEntryOTPItemBase extends XLitElement {
  protected readonly model = new PMEntryOTPItemModel()

  hasSelector = true

  get otp(): OTP | undefined {
    return this.model.otp()
  }

  set otp(value: OTP | undefined) {
    this.model.setOtp(value)
  }

  disconnectedCallback(): void {
    this.model.disconnect()
    super.disconnectedCallback()
  }
}
