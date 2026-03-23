import {XLitElement} from '@statx/lit'

import {html, nothing} from 'lit'

import {i18n} from '@project/passmanager'
import type {Algorithm, Encoding, OTPOptions, OTPType} from '@project/passmanager'
import type {CVInputInputEvent, CVSelectChangeEvent} from '@chromvoid/uikit'
import {
  PM_ENTRY_OTP_ALGORITHMS,
  PM_ENTRY_OTP_ENCODINGS,
  PMEntryOtpCreateModel,
  type PMEntryOtpPreset,
} from './entry-otp-create.model'
import {pmEntryOtpCreateStyles} from './styles'

type PMEntryOtpNumberChangeEvent = CustomEvent<{value: number}>

export class PMEntryOTPCreate extends XLitElement {
  static properties = {
    model: {attribute: false},
  }

  static define() {
    if (!customElements.get('pm-entry-otp-create')) {
      customElements.define('pm-entry-otp-create', this)
    }
  }

  static styles = pmEntryOtpCreateStyles

  declare model: PMEntryOtpCreateModel

  constructor() {
    super()
    this.model = new PMEntryOtpCreateModel()
  }

  getFormData(): OTPOptions {
    return this.model.getFormData()
  }

  onSubmit(e: Event) {
    e.preventDefault()
    if (!this.validate()) return
    this.dispatchEvent(new CustomEvent('editEnd'))
  }

  private validate(): boolean {
    return this.model.validate()
  }

  private onSecretInput(e: CVInputInputEvent) {
    const input = e.target as {value?: string} | null
    const normalized = this.model.setSecret(e.detail.value ?? '')
    if (input) {
      input.value = normalized
    }
  }

  private onLabelInput(e: CVInputInputEvent) {
    this.model.setLabel(e.detail.value ?? '')
  }

  private onPeriodInput(e: PMEntryOtpNumberChangeEvent) {
    this.model.setPeriod(e.detail.value)
  }

  private onDigitsInput(e: PMEntryOtpNumberChangeEvent) {
    this.model.setDigits(e.detail.value)
  }

  private onCounterInput(e: PMEntryOtpNumberChangeEvent) {
    this.model.setCounter(e.detail.value)
  }

  private onPresetChange(e: CVSelectChangeEvent) {
    const value = e.detail.value
    if (value) {
      this.model.setPreset(value as PMEntryOtpPreset)
    }
  }

  private onOtpTypeChange(e: CVSelectChangeEvent) {
    const value = e.detail.value
    if (value) {
      this.model.setOtpType(value as OTPType)
    }
  }

  private onAlgorithmChange(e: CVSelectChangeEvent) {
    const value = e.detail.value
    if (value) {
      this.model.setAlgorithm(value as Algorithm)
    }
  }

  private onEncodingChange(e: CVSelectChangeEvent) {
    const value = e.detail.value
    if (value) {
      this.model.setEncoding(value as Encoding)
    }
  }

  render() {
    const isCustom = this.model.preset() === 'custom'
    const isHOTP = this.model.otpType() === 'HOTP'

    return html`
      <div class="otp-create">
        <slot><h3>${i18n('otp')}</h3></slot>

        <cv-input
          .value=${this.model.secret()}
          autocomplete="off"
          size="small"
          type="password"
          placeholder=${i18n('otp:secretKey')}
          @cv-input=${this.onSecretInput}
        >
          <h4 slot="label">${i18n('otp:secretKey')} *</h4>
          ${this.model.secretError()
            ? html`<div slot="help-text">${this.model.secretError()}</div>`
            : nothing}
        </cv-input>

        <cv-input
          .value=${this.model.label()}
          autocomplete="off"
          placeholder=${i18n('otp:label.placeholder')}
          size="small"
          class="short-hide"
          @cv-input=${this.onLabelInput}
        >
          <h4 slot="label">${i18n('otp:label')}</h4>
          ${this.model.labelError() ? html`<div slot="help-text">${this.model.labelError()}</div>` : nothing}
        </cv-input>

        <div class="select-field">
          <h4>${i18n('otp:type')}</h4>
          <cv-select
            size="small"
            .value=${this.model.otpType()}
            aria-label=${i18n('otp:type')}
            @cv-change=${this.onOtpTypeChange}
          >
            <cv-select-option value="TOTP">${i18n('otp:type:totp')}</cv-select-option>
            <cv-select-option value="HOTP">${i18n('otp:type:hotp')}</cv-select-option>
          </cv-select>
        </div>

        <div class="select-field">
          <h4>${i18n('otp:preset')}</h4>
          <cv-select
            size="small"
            .value=${this.model.preset()}
            aria-label=${i18n('otp:preset')}
            @cv-change=${this.onPresetChange}
          >
            <cv-select-option value="googleAuth">${i18n('otp:googleauth')}</cv-select-option>
            <cv-select-option value="custom">${i18n('otp:custom')}</cv-select-option>
          </cv-select>
        </div>

        ${isHOTP
          ? html`
              <cv-number
                .value=${this.model.counter()}
                placeholder=${i18n('otp:counter:placeholder')}
                size="small"
                min="0"
                @cv-change=${this.onCounterInput}
              >
                <h4 slot="label">${i18n('otp:counter')}</h4>
                ${this.model.counterError()
                  ? html`<div slot="help-text">${this.model.counterError()}</div>`
                  : nothing}
              </cv-number>
            `
          : nothing}
        ${isCustom
          ? html`
              ${!isHOTP
                ? html`
                    <cv-number
                      .value=${this.model.period()}
                      placeholder=${i18n('otp:period.placeholder')}
                      size="small"
                      min="10"
                      max="120"
                      @cv-change=${this.onPeriodInput}
                    >
                      <h4 slot="label">${i18n('otp:period')}</h4>
                      ${this.model.periodError()
                        ? html`<div slot="help-text">${this.model.periodError()}</div>`
                        : nothing}
                    </cv-number>
                  `
                : nothing}

              <cv-number
                .value=${this.model.digits()}
                placeholder=${i18n('otp:digits.placeholder')}
                size="small"
                min="4"
                max="10"
                @cv-change=${this.onDigitsInput}
              >
                <h4 slot="label">${i18n('otp:digits')}</h4>
                ${this.model.digitsError()
                  ? html`<div slot="help-text">${this.model.digitsError()}</div>`
                  : nothing}
              </cv-number>

              <div class="select-field">
                <h4>${i18n('algorithm')}</h4>
                <cv-select
                  size="small"
                  .value=${this.model.algorithm()}
                  aria-label=${i18n('algorithm')}
                  @cv-change=${this.onAlgorithmChange}
                >
                  ${PM_ENTRY_OTP_ALGORITHMS.map(
                    (item) => html`<cv-select-option value=${item}>${item}</cv-select-option>`,
                  )}
                </cv-select>
              </div>

              <div class="select-field">
                <h4>${i18n('encoding')}</h4>
                <cv-select
                  size="small"
                  .value=${this.model.encoding()}
                  aria-label=${i18n('encoding')}
                  @cv-change=${this.onEncodingChange}
                >
                  ${PM_ENTRY_OTP_ENCODINGS.map(
                    (item) => html`<cv-select-option value=${item}>${item}</cv-select-option>`,
                  )}
                </cv-select>
              </div>
            `
          : nothing}
      </div>
    `
  }
}
