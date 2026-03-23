import {css} from 'lit'
import {ReatomLitElement, html} from '@chromvoid/uikit'

import type {Entry} from '@project/passmanager'

import {i18n} from '../i18n'
import {store} from '../store'
import {otpDisplayLabel} from '../otp-selection'
import {
  COPY_ERROR_OTP_UNAVAILABLE,
  COPY_ERROR_PASSWORD_UNAVAILABLE,
  ExtRecordCardView,
} from './record-card-view'

export class ExtRecordCard extends ReatomLitElement {
  static elementName = 'ext-record-card'

  static get properties() {
    return {
      entry: {attribute: false},
    }
  }

  declare entry: Entry

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
    ExtRecordCardView.define()
  }

  static styles = css`
    :host {
      display: block;
    }
  `

  private handleOtpChange(event: CustomEvent<{otpId: string}>) {
    if (event.detail.otpId) {
      this.dispatchEvent(
        new CustomEvent('ext-otp-change', {
          detail: {entryId: this.entry.id, otpId: event.detail.otpId},
          bubbles: true,
          composed: true,
        }),
      )
    }
  }

  private dispatch(type: string) {
    this.dispatchEvent(
      new CustomEvent(type, {
        detail: {entry: this.entry},
        bubbles: true,
        composed: true,
      }),
    )
  }

  private handleFillClick() {
    this.dispatch('ext-fill')
  }

  private handleFillOtpClick() {
    this.dispatch('ext-fill-otp')
  }

  private async resolvePasswordCopyValue(): Promise<string> {
    const password = await store.copyPassword(this.entry)
    if (!password) {
      throw new Error(COPY_ERROR_PASSWORD_UNAVAILABLE)
    }

    return password
  }

  private async resolveOtpCopyValue(): Promise<string> {
    const otpId = store.selectedOtpId(this.entry)
    const otp = await store.copyOtp(this.entry, otpId)
    if (!otp) {
      throw new Error(COPY_ERROR_OTP_UNAVAILABLE)
    }

    return otp
  }

  protected override render() {
    const item = this.entry
    if (!item) {
      return html``
    }

    const otps = item.otps()
    const hasOtp = otps.length > 0
    const hasMultipleOtp = otps.length > 1
    const selectedOtpId = store.selectedOtpId(item)
    const selectedOtpIndex = selectedOtpId ? otps.findIndex((otp) => otp.id === selectedOtpId) : -1
    const resolvedOtpIndex = selectedOtpIndex >= 0 ? selectedOtpIndex : 0
    const resolvedOtp = otps[resolvedOtpIndex]
    const otpLabel = resolvedOtp
      ? otpDisplayLabel(resolvedOtp, resolvedOtpIndex)
      : i18n('record.otpUnavailable')
    const otpHint = hasOtp ? otpLabel : i18n('record.otpNotAvailable')
    const passwordCopyValue = () => this.resolvePasswordCopyValue()
    const otpCopyValue = () => this.resolveOtpCopyValue()
    const otpBadgeLabel = hasOtp
      ? hasMultipleOtp
        ? i18n('record.otpProfiles', {count: otps.length})
        : i18n('record.otpReady')
      : i18n('record.otpMissing')

    return html`<ext-record-card-view
      .username=${item.username}
      .hasOtp=${hasOtp}
      .otpBadgeLabel=${otpBadgeLabel}
      .otpOptions=${otps.map((otp, index) => ({id: otp.id, label: otpDisplayLabel(otp, index)}))}
      .selectedOtpId=${selectedOtpId ?? ''}
      .fillCredentialsHint=${i18n('record.fillCredentialsHint')}
      .fillOtpHint=${otpHint}
      .usernameCopyValue=${item.username}
      .passwordCopyValue=${passwordCopyValue}
      .otpCopyValue=${otpCopyValue}
      .fillOtpDisabled=${!hasOtp}
      .otpCopyDisabled=${!hasOtp}
      @ext-fill=${this.handleFillClick}
      @ext-fill-otp=${this.handleFillOtpClick}
      @ext-otp-change=${this.handleOtpChange}
    ></ext-record-card-view>`
  }
}
