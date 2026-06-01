import {nothing, type TemplateResult} from 'lit'
import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {i18n} from '@project/passmanager/i18n'
import type {Algorithm, Encoding, OTPOptions, OTPType} from '@project/passmanager/types'
import {CVDisclosure, type CVDisclosureEventDetail} from '@chromvoid/uikit/components/cv-disclosure'
import type {CVInputInputEvent} from '@chromvoid/uikit/components/cv-input'
import type {CVSelectChangeEvent} from '@chromvoid/uikit/components/cv-select'
import {
  PM_ENTRY_OTP_ALGORITHMS,
  PM_ENTRY_OTP_ENCODINGS,
  PMEntryOtpCreateModel,
  type PMEntryOtpPreview,
  type PMEntryOtpPreset,
  type PMEntryOtpSecretValidation,
} from './entry-otp-create.model'
import {pmEntryOtpCreateStyles} from './styles'

type PMEntryOtpNumberChangeEvent = CustomEvent<{value: number}>
type PMEntryOtpLayout = 'default' | 'card'

export class PMEntryOTPCreate extends ReatomLitElement {
  static properties = {
    model: {attribute: false},
    layout: {type: String, reflect: true},
  }

  static define() {
    if (!customElements.get('pm-entry-otp-create')) {
      customElements.define('pm-entry-otp-create', this)
    }
    CVDisclosure.define()
  }

  static styles = pmEntryOtpCreateStyles

  declare model: PMEntryOtpCreateModel
  declare layout: PMEntryOtpLayout

  constructor() {
    super()
    this.model = new PMEntryOtpCreateModel()
    this.layout = 'default'
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
    const normalized = this.model.actions.setSecret(e.detail.value ?? '')
    if (input) {
      input.value = normalized
    }
  }

  private onSecretClear() {
    this.model.actions.setSecret('')
  }

  private async onSecretPasteClick() {
    await this.model.actions.pasteSecretFromClipboard()
  }

  private onLabelInput(e: CVInputInputEvent) {
    this.model.actions.setLabel(e.detail.value ?? '')
  }

  private onPeriodInput(e: PMEntryOtpNumberChangeEvent) {
    this.model.actions.setPeriod(e.detail.value)
  }

  private onDigitsInput(e: PMEntryOtpNumberChangeEvent) {
    this.model.actions.setDigits(e.detail.value)
  }

  private onCounterInput(e: PMEntryOtpNumberChangeEvent) {
    this.model.actions.setCounter(e.detail.value)
  }

  private onPresetChange(e: CVSelectChangeEvent) {
    const value = e.detail.value
    if (value) {
      this.model.actions.setPreset(value as PMEntryOtpPreset)
    }
  }

  private onOtpTypeChange(e: CVSelectChangeEvent) {
    const value = e.detail.value
    if (value) {
      this.model.actions.setOtpType(value as OTPType)
    }
  }

  private onAlgorithmChange(e: CVSelectChangeEvent) {
    const value = e.detail.value
    if (value) {
      this.model.actions.setAlgorithm(value as Algorithm)
    }
  }

  private onEncodingChange(e: CVSelectChangeEvent) {
    const value = e.detail.value
    if (value) {
      this.model.actions.setEncoding(value as Encoding)
    }
  }

  private onAdvancedChange(e: CustomEvent<CVDisclosureEventDetail>) {
    this.model.actions.setAdvancedOpen(e.detail.open)
  }

  private onQrScanClick() {
    void this.model.actions.openQrScanner()
  }

  render() {
    return this.layout === 'card' ? this.renderCardLayout() : this.renderDefaultLayout()
  }

  private renderDefaultLayout() {
    const {state} = this.model
    const isCustom = state.preset() === 'custom'
    const isHOTP = state.otpType() === 'HOTP'
    const canScanQr = state.qrScannerAvailable()
    const qrScannerError = state.qrScannerError()
    const qrScannerScanning = state.qrScannerScanning()

    return html`
      <div class="otp-create" data-layout="default">
        <slot><h3>${i18n('otp')}</h3></slot>

        <cv-input
          class="secret-input"
          .value=${state.secretInput()}
          autocomplete="off"
          size="small"
          type="password"
          placeholder=${i18n('otp:secretKey')}
          @cv-input=${this.onSecretInput}
        >
          <span class="secret-label-row" slot="label">
            <span>${i18n('otp:secretKey')} *</span>
            ${canScanQr
              ? html`
                  <button
                    class="qr-scan-button"
                    type="button"
                    aria-label=${i18n('otp:qr:scan')}
                    title=${i18n('otp:qr:scan')}
                    ?disabled=${qrScannerScanning}
                    @click=${this.onQrScanClick}
                  >
                    <cv-icon name="qr-code-scan" aria-hidden="true"></cv-icon>
                    <span>${qrScannerScanning ? i18n('otp:qr:scanning') : i18n('otp:qr:scan')}</span>
                  </button>
                `
              : nothing}
          </span>
          ${state.secretError()
            ? html`<div slot="help-text">${state.secretError()}</div>`
            : nothing}
        </cv-input>
        ${this.renderQrScanError(qrScannerError)}

        <cv-input
          .value=${state.label()}
          autocomplete="off"
          placeholder=${i18n('otp:label.placeholder')}
          size="small"
          class="short-hide"
          @cv-input=${this.onLabelInput}
        >
          <h4 slot="label">${i18n('otp:label')}</h4>
          ${state.labelError() ? html`<div slot="help-text">${state.labelError()}</div>` : nothing}
        </cv-input>

        ${this.renderOtpTypeField(state.otpType())}
        ${this.renderPresetField(state.preset())}

        ${isHOTP ? this.renderCounterField(state.counter(), state.counterError()) : nothing}
        ${isCustom
          ? html`
              ${!isHOTP
                ? this.renderPeriodField(state.period(), state.periodError())
                : nothing}
              ${this.renderDigitsField(state.digits(), state.digitsError())}
              ${this.renderAlgorithmField(state.algorithm())}
              ${this.renderEncodingField(state.encoding())}
            `
          : nothing}
      </div>
    `
  }

  private renderCardLayout() {
    const {state} = this.model
    const isCustom = state.preset() === 'custom'
    const isHOTP = state.otpType() === 'HOTP'
    const secretValidation = state.secretValidation()
    const preview = state.preview()
    const canScanQr = state.qrScannerAvailable()
    const qrScannerError = state.qrScannerError()
    const qrScannerScanning = state.qrScannerScanning()

    return html`
      <div class="otp-create otp-create-card" data-layout="card">
        ${canScanQr
          ? html`
              <button
                class="qr-hero-button"
                type="button"
                aria-label=${i18n('otp:qr:scan')}
                ?disabled=${qrScannerScanning}
                @click=${this.onQrScanClick}
              >
                <span class="qr-hero-icon" aria-hidden="true">
                  <cv-icon name="qr-code-scan"></cv-icon>
                </span>
                <span class="qr-hero-copy">
                  <span class="qr-hero-title">
                    ${qrScannerScanning ? i18n('otp:qr:scanning') : i18n('otp:qr:scan')}
                  </span>
                  <span class="qr-hero-text">${i18n('otp:qr:helper')}</span>
                </span>
                <cv-icon class="qr-hero-chevron" name="chevron-right" aria-hidden="true"></cv-icon>
              </button>

              <div class="manual-divider">
                <span></span>
                <strong>${i18n('otp:manual_divider')}</strong>
                <span></span>
              </div>
            `
          : nothing}
        ${this.renderQrScanError(qrScannerError)}

        <cv-input
          id="otp-secret-input"
          class="secret-input"
          .value=${state.secretInput()}
          autocomplete="off"
          size="large"
          type="password"
          placeholder=${i18n('otp:secret:placeholder')}
          password-toggle
          clearable
          ?invalid=${secretValidation.status === 'error'}
          @cv-input=${this.onSecretInput}
          @cv-clear=${this.onSecretClear}
        >
          <span slot="label">${i18n('otp:secretKey')} *</span>
          <button
            slot="suffix"
            class="secret-paste-button"
            type="button"
            aria-label=${i18n('otp:secret:paste')}
            title=${i18n('otp:secret:paste')}
            @click=${this.onSecretPasteClick}
          >
            <cv-icon name="copy" aria-hidden="true"></cv-icon>
          </button>
          ${this.renderSecretHelp(secretValidation)}
        </cv-input>

        <cv-input
          class="display-name-input"
          .value=${state.label()}
          autocomplete="off"
          placeholder=${i18n('otp:label.placeholder')}
          size="large"
          @cv-input=${this.onLabelInput}
        >
          <span slot="label">${i18n('otp:display_as')}</span>
          ${state.labelError() ? html`<div slot="help-text">${state.labelError()}</div>` : nothing}
        </cv-input>

        ${preview ? this.renderPreview(preview) : nothing}

        <cv-disclosure
          class="otp-advanced"
          ?open=${state.advancedOpen()}
          @cv-change=${this.onAdvancedChange}
        >
          <span slot="trigger" class="otp-advanced-trigger">
            <cv-icon name="gear" aria-hidden="true"></cv-icon>
            <span>${i18n('otp:advanced')}</span>
          </span>
          <div class="otp-advanced-body">
            ${this.renderOtpTypeField(state.otpType())}
            ${this.renderPresetField(state.preset())}
            ${isHOTP ? this.renderCounterField(state.counter(), state.counterError()) : nothing}
            ${isCustom
              ? html`
                  ${!isHOTP ? this.renderPeriodField(state.period(), state.periodError()) : nothing}
                  ${this.renderDigitsField(state.digits(), state.digitsError())}
                  ${this.renderAlgorithmField(state.algorithm())}
                  ${this.renderEncodingField(state.encoding())}
                `
              : nothing}
          </div>
        </cv-disclosure>

      </div>
    `
  }

  private renderQrScanError(error: string): TemplateResult | typeof nothing {
    if (!error) return nothing

    return html`<p class="otp-qr-error" role="alert">${error}</p>`
  }

  private renderSecretHelp(validation: PMEntryOtpSecretValidation): TemplateResult | typeof nothing {
    if (validation.status === 'error') {
      return html`<div slot="help-text" class="otp-helper otp-helper-error">${validation.message}</div>`
    }

    if (validation.status === 'valid') {
      return html`
        <div slot="help-text" class="otp-helper otp-helper-valid">
          <cv-icon name="check" aria-hidden="true"></cv-icon>
          <span>${validation.message}</span>
        </div>
      `
    }

    return html`<div slot="help-text" class="otp-helper">${i18n('otp:secret:helper')}</div>`
  }

  private renderPreview(preview: PMEntryOtpPreview): TemplateResult {
    return html`
      <section class="otp-preview" aria-label=${i18n('otp:preview')}>
        <div class="otp-preview-icon" aria-hidden="true">
          <cv-icon name="key-round"></cv-icon>
        </div>
        <div class="otp-preview-content">
          <span class="otp-preview-title">${preview.label}</span>
          <strong class="otp-preview-code">${preview.code}</strong>
        </div>
        <span class="otp-preview-timer">${i18n('otp:preview:seconds', {seconds: preview.leftSeconds})}</span>
      </section>
    `
  }

  private renderOtpTypeField(value: OTPType): TemplateResult {
    return html`
      <div class="select-field">
        <h4>${i18n('otp:type')}</h4>
        <cv-select
          size="small"
          .value=${value}
          aria-label=${i18n('otp:type')}
          @cv-change=${this.onOtpTypeChange}
        >
          <cv-select-option value="TOTP">${i18n('otp:type:totp')}</cv-select-option>
          <cv-select-option value="HOTP">${i18n('otp:type:hotp')}</cv-select-option>
        </cv-select>
      </div>
    `
  }

  private renderPresetField(value: PMEntryOtpPreset): TemplateResult {
    return html`
      <div class="select-field">
        <h4>${i18n('otp:preset')}</h4>
        <cv-select
          size="small"
          .value=${value}
          aria-label=${i18n('otp:preset')}
          @cv-change=${this.onPresetChange}
        >
          <cv-select-option value="googleAuth">${i18n('otp:googleauth')}</cv-select-option>
          <cv-select-option value="custom">${i18n('otp:custom')}</cv-select-option>
        </cv-select>
        <div class="otp-helper">${i18n('otp:preset:helper')}</div>
      </div>
    `
  }

  private renderCounterField(value: number, error: string): TemplateResult {
    return html`
      <cv-number
        .value=${value}
        placeholder=${i18n('otp:counter:placeholder')}
        size="small"
        min="0"
        @cv-change=${this.onCounterInput}
      >
        <h4 slot="label">${i18n('otp:counter')}</h4>
        ${error ? html`<div slot="help-text">${error}</div>` : nothing}
      </cv-number>
    `
  }

  private renderPeriodField(value: number, error: string): TemplateResult {
    return html`
      <cv-number
        .value=${value}
        placeholder=${i18n('otp:period.placeholder')}
        size="small"
        min="10"
        max="120"
        @cv-change=${this.onPeriodInput}
      >
        <h4 slot="label">${i18n('otp:period')}</h4>
        ${error ? html`<div slot="help-text">${error}</div>` : nothing}
      </cv-number>
    `
  }

  private renderDigitsField(value: number, error: string): TemplateResult {
    return html`
      <cv-number
        .value=${value}
        placeholder=${i18n('otp:digits.placeholder')}
        size="small"
        min="4"
        max="10"
        @cv-change=${this.onDigitsInput}
      >
        <h4 slot="label">${i18n('otp:digits')}</h4>
        ${error ? html`<div slot="help-text">${error}</div>` : nothing}
      </cv-number>
    `
  }

  private renderAlgorithmField(value: Algorithm): TemplateResult {
    return html`
      <div class="select-field">
        <h4>${i18n('algorithm')}</h4>
        <cv-select
          size="small"
          .value=${value}
          aria-label=${i18n('algorithm')}
          @cv-change=${this.onAlgorithmChange}
        >
          ${PM_ENTRY_OTP_ALGORITHMS.map(
            (item) => html`<cv-select-option value=${item}>${item}</cv-select-option>`,
          )}
        </cv-select>
      </div>
    `
  }

  private renderEncodingField(value: Encoding): TemplateResult {
    return html`
      <div class="select-field">
        <h4>${i18n('encoding')}</h4>
        <cv-select
          size="small"
          .value=${value}
          aria-label=${i18n('encoding')}
          @cv-change=${this.onEncodingChange}
        >
          ${PM_ENTRY_OTP_ENCODINGS.map(
            (item) => html`<cv-select-option value=${item}>${item}</cv-select-option>`,
          )}
        </cv-select>
      </div>
    `
  }
}
