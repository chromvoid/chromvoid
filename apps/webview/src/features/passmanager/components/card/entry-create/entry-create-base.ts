import {XLitElement} from '@statx/lit'
import {html, nothing, type TemplateResult} from 'lit'

import Swal from 'sweetalert2'

import {i18n} from '@project/passmanager'
import type {CVInputInputEvent, CVSwitchChangeEvent, CVTextareaInputEvent} from '@chromvoid/uikit'
import {
  consumeAndroidPasswordSavePrefill,
  finishAndroidPasswordSave,
} from 'root/features/passmanager/models/android-password-save-prefill'
import {PMEntryCreateModel} from './entry-create.model'

export abstract class PMEntryCreateBase extends XLitElement {
  static properties = {
    hideBack: {type: Boolean, attribute: 'hide-back'},
  }

  declare hideBack: boolean

  private readonly model = new PMEntryCreateModel()
  private initialFocusFrame = 0

  constructor() {
    super()
    this.hideBack = false
    this.onSshGenerateRequest = this.onSshGenerateRequest.bind(this)
  }

  protected changeSwitch(e: CVSwitchChangeEvent) {
    this.model.setUseOtp(e.detail.checked)
  }

  protected onTitleInput(e: CVInputInputEvent) {
    this.model.setTitle(e.detail.value)
  }

  protected onUsernameInput(e: CVInputInputEvent) {
    this.model.setUsername(e.detail.value)
  }

  protected onPasswordInput(e: CVInputInputEvent) {
    this.model.setPassword(e.detail.value)
  }

  protected onUrlsInput(e: CVInputInputEvent) {
    this.model.setUrls(e.detail.value)
  }

  protected onNoteInput(e: CVTextareaInputEvent) {
    this.model.setNote(e.detail.value)
  }

  protected onSubmit(e: Event) {
    e.preventDefault()

    const submitResult = this.model.submit()
    if (submitResult.ok) {
      void finishAndroidPasswordSave('saved')
      return
    }

    if (submitResult.reason === 'missing_title') {
      void this.validateBeforeClose()
      return
    }

    if (submitResult.reason === 'invalid_otp') {
      void Swal.fire({
        title: i18n('error:save'),
        text: submitResult.message ?? '',
        icon: 'error',
      })
    }
  }

  public override connectedCallback(): void {
    super.connectedCallback()
    this.model.reset()
    const prefill = consumeAndroidPasswordSavePrefill()
    if (prefill) {
      this.model.applyPrefill(prefill)
    }
    this.scheduleInitialFocus()
  }

  public override disconnectedCallback(): void {
    if (this.initialFocusFrame) {
      window.cancelAnimationFrame(this.initialFocusFrame)
      this.initialFocusFrame = 0
    }
    super.disconnectedCallback()
  }

  protected generate() {
    this.model.generatePassword()
  }

  protected onSshSwitchChange(e: CVSwitchChangeEvent) {
    this.model.setUseSsh(e.detail.checked)
  }

  protected onGenerateSsh() {
    this.model.requestSshGeneration()
  }

  private onSshGenerateRequest(): void {
    this.onGenerateSsh()
  }

  private validateBeforeClose(): void {
    void Swal.fire({
      title: i18n('dialog:validation:title'),
      text: i18n('dialog:validation:title_required'),
      icon: 'error',
      confirmButtonText: i18n('button:ok'),
    }).then(() => {
      this.focusTitleInput()
    })
  }

  protected focusTitleInput(preventScroll = false) {
    const titleField = this.shadowRoot?.querySelector<HTMLElement>('[name="title"]')
    if (!titleField) return

    if (titleField.tagName.toLowerCase() === 'cv-input') {
      const nativeInput = (
        titleField as HTMLElement & {shadowRoot?: ShadowRoot}
      ).shadowRoot?.querySelector<HTMLInputElement>('input')
      if (nativeInput) {
        try {
          nativeInput.focus(preventScroll ? {preventScroll: true} : undefined)
        } catch {
          nativeInput.focus()
        }
      }
      return
    }

    try {
      titleField.focus(preventScroll ? {preventScroll: true} : undefined)
    } catch {
      titleField.focus()
    }
  }

  protected renderOtp() {
    if (!this.model.useOtp()) {
      return nothing
    }

    return html`<pm-entry-otp-create short .model=${this.model.otp}></pm-entry-otp-create>`
  }

  protected renderStrengthBar() {
    if (this.model.passwordStrengthScore() === null) return nothing

    const score = this.model.passwordStrengthScore()!
    return html`<div class="strength-bar">
      <div class="strength-track">
        <div class="strength-fill strength-${score}"></div>
      </div>
      <span class="strength-label strength-${score}">${this.model.passwordStrengthLabel()}</span>
    </div>`
  }

  protected renderHeader(): TemplateResult {
    return html`
      <div class="create-header">
        ${this.hideBack ? nothing : html`<back-button></back-button>`}
        <div class="create-header-title">
          <cv-icon name="plus-circle"></cv-icon>
          ${i18n('enrty:create')}
        </div>
      </div>
    `
  }

  protected renderTitleSection(): TemplateResult {
    return html`
      <div class="section title-section">
        <cv-input
          type="text"
          size="small"
          name="title"
          required
          autocomplete="card-title"
          ?autofocus=${this.shouldAutofocusTitleInput()}
          placeholder=${i18n('title_or_url:placeholder')}
          .value=${this.model.title()}
          @cv-input=${this.onTitleInput}
        >
          <span slot="label">${i18n('title_or_url')}</span>
        </cv-input>
        <pm-icon-picker .iconRef=${this.model.iconRef} icon="person-circle"></pm-icon-picker>
      </div>
    `
  }

  protected renderCredentialsSection(): TemplateResult {
    return html`
      <div class="section">
        <div class="section-label">
          <cv-icon name="shield-lock"></cv-icon>
          ${i18n('entry:credentials')}
        </div>
        <div class="credentials-grid">
          <div class="field-cell">
            <cv-input
              type="text"
              size="small"
              name="username"
              autocomplete="username"
              placeholder=${i18n('username:placeholder')}
              .value=${this.model.username()}
              @cv-input=${this.onUsernameInput}
            >
              <span slot="label">${i18n('username')}</span>
            </cv-input>
          </div>
          <div class="field-cell password-cell">
            <cv-input
              id="password"
              type="password"
              size="small"
              name="password"
              autocomplete="password"
              placeholder=${i18n('password:placeholder')}
              password-toggle
              .value=${this.model.password()}
              @cv-input=${this.onPasswordInput}
              ?editing=${this.model.isEditingPassword()}
            >
              <span slot="label">${i18n('password')}</span>
              <button
                class="generate-btn"
                slot="suffix"
                @click=${this.generate}
                type="button"
                title=${i18n('button:generate')}
              >
                <cv-icon name="arrow-repeat"></cv-icon>
              </button>
            </cv-input>
            ${this.renderStrengthBar()}
          </div>
        </div>
      </div>
    `
  }

  protected renderDetailsSection(): TemplateResult {
    return html`
      <div class="section">
        <div class="section-label">
          <cv-icon name="globe"></cv-icon>
          ${i18n('entry:additional_information')}
        </div>
        <div class="details-grid">
          <div class="field-cell">
            <cv-input
              id="urls"
              type="text"
              size="small"
              name="urls"
              placeholder=${i18n('website:placeholder')}
              .value=${this.model.urls()}
              @cv-input=${this.onUrlsInput}
            >
              <span slot="label">${i18n('website:title')}</span>
            </cv-input>
          </div>
          <div class="field-cell note-cell">
            <cv-textarea
              size="small"
              name="note"
              placeholder=${i18n('note:placeholder')}
              rows="3"
              .value=${this.model.note()}
              @cv-input=${this.onNoteInput}
            >
              <span slot="label">${i18n('note:title')}</span>
            </cv-textarea>
          </div>
        </div>
      </div>
    `
  }

  protected renderAdvancedSection(): TemplateResult {
    return html`
      <div class="section advanced-section">
        <cv-switch
          size="small"
          @cv-change=${this.changeSwitch}
          class="switch-otp"
          ?checked=${this.model.useOtp()}
        >
          <div class="otp-switch-label">
            <cv-icon name="shield-check"></cv-icon>
            <span>${i18n('otp:use')}</span>
          </div>
        </cv-switch>
        ${this.renderOtp()}
      </div>
    `
  }

  protected renderSshSection(): TemplateResult {
    return html`
      <div class="section advanced-section">
        <cv-switch
          size="small"
          @cv-change=${this.onSshSwitchChange}
          class="switch-otp"
          ?checked=${this.model.useSsh()}
        >
          <div class="otp-switch-label">
            <cv-icon name="key"></cv-icon>
            <span>${i18n('ssh:title')}</span>
          </div>
        </cv-switch>
        ${this.model.showSshGenerator()
          ? html`
              <pm-entry-ssh-generator
                radio-group="ssh-key-type-create"
                hide-generate-when-result
                .keyType=${this.model.sshGenKeyType}
                .comment=${this.model.sshGenComment}
                .generating=${this.model.sshGenerating}
                .result=${this.model.sshGenResult}
                .onGenerate=${this.onSshGenerateRequest}
              ></pm-entry-ssh-generator>
            `
          : nothing}
      </div>
    `
  }

  protected renderSubmitSection(): TemplateResult | typeof nothing {
    return html`
      <cv-button
        .disabled=${window.passmanager.isReadOnly()}
        size="small"
        variant="primary"
        class="submit"
        type="submit"
        >${i18n('button:createNew')}</cv-button
      >
    `
  }

  protected renderFormFooter(): TemplateResult | typeof nothing {
    return nothing
  }

  protected renderFormBody(): TemplateResult {
    return html`
      ${this.renderHeader()} ${this.renderTitleSection()} ${this.renderCredentialsSection()}
      ${this.renderDetailsSection()} ${this.renderAdvancedSection()} ${this.renderSshSection()}
      ${this.renderSubmitSection()} ${this.renderFormFooter()}
    `
  }

  render() {
    if (!window.passmanager) {
      return nothing
    }

    return html`<form @submit=${this.onSubmit}>${this.renderFormBody()}</form>`
  }

  protected shouldAutofocusTitleInput(): boolean {
    return true
  }

  protected shouldPreventScrollOnInitialFocus(): boolean {
    return false
  }

  protected prepareInitialViewport(): void {}

  private scheduleInitialFocus(): void {
    void this.updateComplete.then(() => {
      if (!this.isConnected) {
        return
      }

      this.initialFocusFrame = window.requestAnimationFrame(() => {
        this.initialFocusFrame = 0
        this.prepareInitialViewport()
        this.focusTitleInput(this.shouldPreventScrollOnInitialFocus())
      })
    })
  }
}
