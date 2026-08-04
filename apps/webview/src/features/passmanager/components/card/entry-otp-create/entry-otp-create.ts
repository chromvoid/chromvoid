import {nothing, type TemplateResult} from 'lit'
import {createAfterRenderScheduler, html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {i18n} from '@project/passmanager/i18n'
import type {Algorithm, Encoding, OTPOptions, OTPType} from '@project/passmanager/types'
import type {CVInputInputEvent} from '@chromvoid/uikit/components/cv-input'
import {CVRadio} from '@chromvoid/uikit/components/cv-radio'
import {CVRadioGroup, type CVRadioGroupChangeEvent} from '@chromvoid/uikit/components/cv-radio-group'
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
    CVRadio.define()
    CVRadioGroup.define()
  }

  static styles = pmEntryOtpCreateStyles

  declare model: PMEntryOtpCreateModel
  declare layout: PMEntryOtpLayout

  private readonly afterRenderScheduler = createAfterRenderScheduler(this)

  constructor() {
    super()
    this.model = new PMEntryOtpCreateModel()
    this.layout = 'default'
  }

  override disconnectedCallback(): void {
    this.afterRenderScheduler.cancel()
    super.disconnectedCallback()
  }

  getFormData(): OTPOptions {
    return this.model.getFormData()
  }

  focusFirstInvalid(): void {
    const input = this.shadowRoot?.querySelector<HTMLElement>('.secret-input')
    const nativeInput = input?.shadowRoot?.querySelector<HTMLInputElement>('input')
    const focusTarget = nativeInput ?? input
    focusTarget?.focus()
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

  private onDigitsRadioChange(e: CVRadioGroupChangeEvent) {
    if (e.detail.value) {
      this.model.actions.setDigits(Number(e.detail.value))
    }
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

  private onRadioPresetChange(e: CVRadioGroupChangeEvent) {
    if (e.detail.value) {
      this.model.actions.setPreset(e.detail.value as PMEntryOtpPreset)
    }
  }

  private onRadioOtpTypeChange(e: CVRadioGroupChangeEvent) {
    if (e.detail.value) {
      this.model.actions.setOtpType(e.detail.value as OTPType)
    }
  }

  private onRadioAlgorithmChange(e: CVRadioGroupChangeEvent) {
    if (e.detail.value) {
      this.model.actions.setAlgorithm(e.detail.value as Algorithm)
    }
  }

  private onRadioEncodingChange(e: CVRadioGroupChangeEvent) {
    if (e.detail.value) {
      this.model.actions.setEncoding(e.detail.value as Encoding)
    }
  }

  private onAdvancedClick() {
    this.model.actions.openAdvanced()
  }

  private onAdvancedBack() {
    this.model.actions.closeAdvanced()
    this.afterRenderScheduler.schedule(() => {
      this.shadowRoot?.querySelector<HTMLElement>('.otp-advanced-link')?.focus({preventScroll: true})
    })
    this.dispatchEvent(
      new CustomEvent('pm-entry-otp-advanced-back', {
        bubbles: true,
        composed: true,
      }),
    )
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

        <cv-field ?invalid=${Boolean(state.secretError())}>
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
                    <cv-icon name="qr-code" aria-hidden="true"></cv-icon>
                    <span>${qrScannerScanning ? i18n('otp:qr:scanning') : i18n('otp:qr:scan')}</span>
                  </button>
                `
              : nothing}
          </span>
          <cv-input
            class="secret-input"
            .value=${state.secretInput()}
            autocomplete="off"
            size="small"
            type="password"
            placeholder=${i18n('otp:secretKey')}
            ?invalid=${Boolean(state.secretError())}
            @cv-input=${this.onSecretInput}
          ></cv-input>
          ${state.secretError() ? html`<div slot="error">${state.secretError()}</div>` : nothing}
        </cv-field>
        ${this.renderQrScanError(qrScannerError)}

        <cv-field ?invalid=${Boolean(state.labelError())}>
          <h4 slot="label">${i18n('otp:label')}</h4>
          <cv-input
            .value=${state.label()}
            autocomplete="off"
            placeholder=${i18n('otp:label.placeholder')}
            size="small"
            class="short-hide"
            ?invalid=${Boolean(state.labelError())}
            @cv-input=${this.onLabelInput}
          ></cv-input>
          ${state.labelError() ? html`<div slot="error">${state.labelError()}</div>` : nothing}
        </cv-field>

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
    if (state.view() === 'advanced') {
      return this.renderAdvancedLayout()
    }

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
                  <cv-icon name="qr-code"></cv-icon>
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

        <cv-field ?invalid=${secretValidation.status === 'error'}>
          <span slot="label">${i18n('otp:secretKey')} *</span>
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
          </cv-input>
          ${this.renderSecretHelp(secretValidation)}
        </cv-field>

        <cv-field ?invalid=${Boolean(state.labelError())}>
          <span slot="label">${i18n('otp:display_as')}</span>
          <cv-input
            class="display-name-input"
            .value=${state.label()}
            autocomplete="off"
            placeholder=${i18n('otp:label.placeholder')}
            size="large"
            ?invalid=${Boolean(state.labelError())}
            @cv-input=${this.onLabelInput}
          ></cv-input>
          ${state.labelError() ? html`<div slot="error">${state.labelError()}</div>` : nothing}
        </cv-field>

        ${preview ? this.renderPreview(preview) : nothing}

        <button
          class="otp-advanced-link"
          type="button"
          aria-label=${i18n('otp:advanced')}
          @click=${this.onAdvancedClick}
        >
          <span class="otp-advanced-icon" aria-hidden="true">
            <cv-icon name="gear" aria-hidden="true"></cv-icon>
          </span>
          <span class="otp-advanced-copy">
            <strong>${i18n('otp:advanced')}</strong>
            <span>${i18n('otp:preset:helper')}</span>
          </span>
          <cv-icon class="otp-advanced-chevron" name="chevron-right" aria-hidden="true"></cv-icon>
        </button>
      </div>
    `
  }

  private renderAdvancedLayout(): TemplateResult {
    const {state} = this.model
    const isCustom = state.preset() === 'custom'
    const isHOTP = state.otpType() === 'HOTP'

    return html`
      <div class="otp-create otp-create-card otp-advanced-screen" data-layout="card" data-view="advanced">
        <button class="otp-advanced-back" type="button" @click=${this.onAdvancedBack}>
          <cv-icon name="chevron-left" aria-hidden="true"></cv-icon>
          <span>${i18n('button:back')}</span>
        </button>

        ${this.renderOtpTypeRadioField(state.otpType())} ${this.renderPresetRadioField(state.preset())}
        ${isHOTP ? this.renderAdvancedCounterField(state.counter(), state.counterError()) : nothing}
        ${isCustom
          ? html`
              <div class="custom-controls">
                ${!isHOTP
                  ? this.renderAdvancedPeriodField(state.period(), state.periodError())
                  : nothing}
                ${this.renderDigitsRadioField(state.digits())}
                ${this.renderAlgorithmRadioField(state.algorithm())}
                ${this.renderEncodingRadioField(state.encoding())}
              </div>
            `
          : nothing}
      </div>
    `
  }

  private renderQrScanError(error: string): TemplateResult | typeof nothing {
    if (!error) return nothing

    return html`<p class="otp-qr-error" role="alert">${error}</p>`
  }

  private renderSecretHelp(validation: PMEntryOtpSecretValidation): TemplateResult | typeof nothing {
    if (validation.status === 'error') {
      return html`<div slot="error" class="otp-helper otp-helper-error">${validation.message}</div>`
    }

    if (validation.status === 'valid') {
      return html`
        <div slot="description" class="otp-helper otp-helper-valid">
          <cv-icon name="check" aria-hidden="true"></cv-icon>
          <span>${validation.message}</span>
        </div>
      `
    }

    return html`<div slot="description" class="otp-helper">${i18n('otp:secret:helper')}</div>`
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

  private renderOtpTypeRadioField(value: OTPType): TemplateResult {
    return html`
      <section class="radio-field" aria-labelledby="otp-type-heading">
        <h4 id="otp-type-heading">${i18n('otp:type')}</h4>
        <cv-radio-group
          .value=${value}
          orientation="vertical"
          aria-label=${i18n('otp:type')}
          @cv-change=${this.onRadioOtpTypeChange}
        >
          <cv-radio value="TOTP" aria-label=${i18n('otp:type:totp')}> ${i18n('otp:type:totp')} </cv-radio>
          <cv-radio value="HOTP" aria-label=${i18n('otp:type:hotp')}> ${i18n('otp:type:hotp')} </cv-radio>
        </cv-radio-group>
      </section>
    `
  }

  private renderPresetRadioField(value: PMEntryOtpPreset): TemplateResult {
    return html`
      <section class="radio-field" aria-labelledby="otp-preset-heading">
        <h4 id="otp-preset-heading">${i18n('otp:preset')}</h4>
        <cv-radio-group
          .value=${value}
          orientation="vertical"
          aria-label=${i18n('otp:preset')}
          @cv-change=${this.onRadioPresetChange}
        >
          <cv-radio value="googleAuth" aria-label=${i18n('otp:googleauth')}>
            ${i18n('otp:googleauth')}
          </cv-radio>
          <cv-radio value="custom" aria-label=${i18n('otp:custom')}> ${i18n('otp:custom')} </cv-radio>
        </cv-radio-group>
        <div class="otp-helper">${i18n('otp:preset:helper')}</div>
      </section>
    `
  }

  private renderCounterField(value: number, error: string): TemplateResult {
    return html`
      <cv-field ?invalid=${Boolean(error)}>
        <h4 slot="label">${i18n('otp:counter')}</h4>
        <cv-number
          .value=${value}
          placeholder=${i18n('otp:counter:placeholder')}
          size="small"
          min="0"
          ?invalid=${Boolean(error)}
          @cv-change=${this.onCounterInput}
        ></cv-number>
        ${error ? html`<div slot="error">${error}</div>` : nothing}
      </cv-field>
    `
  }

  private renderAdvancedCounterField(value: number, error: string): TemplateResult {
    return html`
      <cv-field ?invalid=${Boolean(error)}>
        <h4 slot="label">${i18n('otp:counter')}</h4>
        <cv-number
          class="advanced-number"
          .value=${value}
          placeholder=${i18n('otp:counter:placeholder')}
          size="large"
          variant="filled"
          min="0"
          step="1"
          large-step="10"
          stepper
          ?invalid=${Boolean(error)}
          @cv-change=${this.onCounterInput}
        >
          <span slot="prefix" aria-hidden="true">#</span>
        </cv-number>
        ${error ? html`<div slot="error">${error}</div>` : nothing}
      </cv-field>
    `
  }

  private renderPeriodField(value: number, error: string): TemplateResult {
    return html`
      <cv-field ?invalid=${Boolean(error)}>
        <h4 slot="label">${i18n('otp:period')}</h4>
        <cv-number
          .value=${value}
          placeholder=${i18n('otp:period.placeholder')}
          size="small"
          min="10"
          max="120"
          ?invalid=${Boolean(error)}
          @cv-change=${this.onPeriodInput}
        ></cv-number>
        ${error ? html`<div slot="error">${error}</div>` : nothing}
      </cv-field>
    `
  }

  private renderAdvancedPeriodField(value: number, error: string): TemplateResult {
    return html`
      <cv-field ?invalid=${Boolean(error)}>
        <h4 slot="label">${i18n('otp:period')}</h4>
        <cv-number
          class="advanced-number"
          .value=${value}
          placeholder=${i18n('otp:period.placeholder')}
          size="large"
          variant="filled"
          min="10"
          max="120"
          step="5"
          large-step="30"
          stepper
          ?invalid=${Boolean(error)}
          @cv-change=${this.onPeriodInput}
        >
          <span slot="suffix">${i18n('otp:period:unit' as never)}</span>
        </cv-number>
        ${error ? html`<div slot="error">${error}</div>` : nothing}
      </cv-field>
    `
  }

  private renderDigitsField(value: number, error: string): TemplateResult {
    return html`
      <cv-field ?invalid=${Boolean(error)}>
        <h4 slot="label">${i18n('otp:digits')}</h4>
        <cv-number
          .value=${value}
          placeholder=${i18n('otp:digits.placeholder')}
          size="small"
          min="4"
          max="10"
          ?invalid=${Boolean(error)}
          @cv-change=${this.onDigitsInput}
        ></cv-number>
        ${error ? html`<div slot="error">${error}</div>` : nothing}
      </cv-field>
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

  private renderAlgorithmRadioField(value: Algorithm): TemplateResult {
    return html`
      <section class="radio-field" aria-labelledby="otp-algorithm-heading">
        <h4 id="otp-algorithm-heading">${i18n('algorithm')}</h4>
        <div class="radio-scroll">
          <cv-radio-group
            .value=${value}
            orientation="horizontal"
            aria-label=${i18n('algorithm')}
            @cv-change=${this.onRadioAlgorithmChange}
          >
            ${PM_ENTRY_OTP_ALGORITHMS.map(
              (item) => html`<cv-radio value=${item} aria-label=${item}>${item}</cv-radio>`,
            )}
          </cv-radio-group>
        </div>
      </section>
    `
  }

  private renderEncodingRadioField(value: Encoding): TemplateResult {
    return html`
      <section class="radio-field radio-field-grid" aria-labelledby="otp-encoding-heading">
        <h4 id="otp-encoding-heading">${i18n('encoding')}</h4>
        <cv-radio-group
          .value=${value}
          orientation="vertical"
          aria-label=${i18n('encoding')}
          @cv-change=${this.onRadioEncodingChange}
        >
          ${PM_ENTRY_OTP_ENCODINGS.map(
            (item) => html`<cv-radio value=${item} aria-label=${item}>${item}</cv-radio>`,
          )}
        </cv-radio-group>
      </section>
    `
  }

  private renderDigitsRadioField(value: number): TemplateResult {
    return html`
      <section class="radio-field" aria-labelledby="otp-digits-heading">
        <h4 id="otp-digits-heading">${i18n('otp:digits')}</h4>
        <div class="radio-scroll">
          <cv-radio-group
            .value=${String(value)}
            orientation="horizontal"
            aria-label=${i18n('otp:digits')}
            @cv-change=${this.onDigitsRadioChange}
          >
            <cv-radio value="6" aria-label="6">6</cv-radio>
            <cv-radio value="8" aria-label="8">8</cv-radio>
          </cv-radio-group>
        </div>
      </section>
    `
  }
}
