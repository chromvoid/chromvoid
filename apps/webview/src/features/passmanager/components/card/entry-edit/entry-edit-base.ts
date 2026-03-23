import {XLitElement} from '@statx/lit'

import {html, nothing, type PropertyValues, type TemplateResult} from 'lit'

import Swal from 'sweetalert2'

import type {CVTextareaInputEvent} from '@chromvoid/uikit'
import {Entry, i18n} from '@project/passmanager'
import type {OTPOptions} from '@project/passmanager'
import type {
  PMEntrySshCancelEvent,
  PMEntrySshCommentInputEvent,
  PMEntrySshGenerateEvent,
  PMEntrySshKeyTypeChangeEvent,
} from '../entry-ssh/entry-ssh-generator'
import '../entry-ssh/entry-ssh-key'
import type {PMEntrySessionModel} from '../entry/entry-session.model'
import {PMEntryEditModel} from './entry-edit.model'

interface PMEntryEditLayoutOptions {
  headerActions?: TemplateResult
  footerActions?: TemplateResult
}

export abstract class PMEntryEditBase extends XLitElement {
  static properties = {
    entry: {attribute: false},
    session: {attribute: false},
  }

  declare entry: Entry | null
  declare session: PMEntrySessionModel | null

  private readonly model = new PMEntryEditModel()

  protected override willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties)

    if (
      (changedProperties.has('entry') || changedProperties.has('session')) &&
      this.entry instanceof Entry &&
      this.session
    ) {
      this.model.loadFromEntry(this.entry, this.session)
    }
  }

  private renderEditHeader(options: PMEntryEditLayoutOptions): TemplateResult {
    return html`
      <header class="edit-header">
        <h1 class="edit-title">
          <cv-icon name="pencil-square"></cv-icon>
          <span>${i18n('enrty:edit')}</span>
        </h1>
        ${options.headerActions
          ? html`<div class="edit-actions-row">${options.headerActions}</div>`
          : nothing}
      </header>
    `
  }

  private renderIconField(): TemplateResult {
    return html`
      <div class="field-group">
        <label>${i18n('icon:title')}</label>
        <pm-icon-picker
          .iconRef=${this.model.editedIconRef}
          icon="person-circle"
          @pm-icon-change=${this.onIconChange}
        ></pm-icon-picker>
      </div>
    `
  }

  private renderTitleField(): TemplateResult {
    return html`
      <div class="field-group title-field">
        <cv-input
          name="title"
          .value=${this.model.editedTitle()}
          @cv-input=${this.changeTitle}
          ?data-has-error=${!!this.model.titleError()}
          autofocus
          placeholder=${i18n('title_or_url:placeholder')}
          size="small"
        >
          <cv-icon slot="prefix" name="tag"></cv-icon>
          <span slot="label">${i18n('title')}</span>
          ${this.model.titleError()
            ? html`<div slot="help-text" class="error-text">${this.model.titleError()}</div>`
            : nothing}
        </cv-input>
      </div>
    `
  }

  private renderUsernameField(): TemplateResult {
    return html`
      <div class="field-group">
        <cv-input
          type="text"
          .value=${this.model.editedUsername()}
          name="username"
          @cv-input=${this.changeUsername}
          placeholder=${i18n('username:placeholder')}
          ?data-has-error=${!!this.model.usernameError()}
          size="small"
        >
          <cv-icon slot="prefix" name="user"></cv-icon>
          <span slot="label">${i18n('username')}</span>
          ${this.model.usernameError()
            ? html`<div slot="help-text" class="error-text">${this.model.usernameError()}</div>`
            : nothing}
        </cv-input>
      </div>
    `
  }

  private renderPasswordField(): TemplateResult {
    const strengthScore = this.model.strengthScore()
    const strengthLabel = this.model.strengthLabel()

    return html`
      <div class="field-group password-group">
        <cv-input
          id="password"
          type="password"
          name="password"
          .value=${this.model.editedPassword()}
          @cv-input=${this.changePassword}
          placeholder=${i18n('password:placeholder')}
          ?data-has-error=${!!this.model.passwordError()}
          size="small"
          password-toggle
        >
          <cv-icon slot="prefix" name="lock"></cv-icon>
          <span slot="label">${i18n('password')}</span>
        </cv-input>
        <div class="password-actions">
          <cv-copy-button .value=${this.model.editedPassword()}></cv-copy-button>
          <cv-button
            size="small"
            variant="ghost"
            @click=${this.toggleGenerator}
            class="gen-toggle-btn"
            title=${i18n('password:generator_settings')}
          >
            <cv-icon name="gear"></cv-icon>
          </cv-button>
          <cv-button
            size="small"
            variant="ghost"
            @click=${this.generate}
            class="gen-btn"
            title=${i18n('password:generate')}
          >
            <cv-icon name="arrow-clockwise"></cv-icon>
          </cv-button>
        </div>
        ${this.model.editedPassword()
          ? html`
              <div class="strength-row strength-${strengthScore}">
                ${strengthLabel
                  ? html`
                      <div class="strength-meta">
                        <span class="strength-text strength-${strengthScore}">${strengthLabel}</span>
                      </div>
                    `
                  : nothing}
                <cv-progress
                  .value=${strengthScore * 25}
                  aria-label=${i18n('password:strength_indicator')}
                  class="strength-bar"
                ></cv-progress>
              </div>
            `
          : nothing}
        ${this.model.passwordError()
          ? html`<div class="error-text">${this.model.passwordError()}</div>`
          : nothing}
      </div>
    `
  }

  private renderGeneratorPanel(): TemplateResult | typeof nothing {
    if (!this.model.showGenerator()) {
      return nothing
    }

    return html`
      <div class="generator-panel">
        <div class="gen-row">
          <label class="gen-label">${i18n('password:length')}</label>
          <cv-input
            type="number"
            .value=${String(this.model.genLength())}
            @cv-input=${this.onGenLengthChange}
            size="small"
            class="gen-length-input"
          ></cv-input>
          <div class="gen-charsets">
            <ui-checkbox
              ?checked=${this.model.genLowercase()}
              @change=${this.onGenLowercaseChange}
              class="gen-opt"
            >
              a-z
            </ui-checkbox>
            <ui-checkbox
              ?checked=${this.model.genUppercase()}
              @change=${this.onGenUppercaseChange}
              class="gen-opt"
            >
              A-Z
            </ui-checkbox>
            <ui-checkbox ?checked=${this.model.genDigits()} @change=${this.onGenDigitsChange} class="gen-opt">
              0-9
            </ui-checkbox>
            <ui-checkbox
              ?checked=${this.model.genSymbols()}
              @change=${this.onGenSymbolsChange}
              class="gen-opt"
            >
              !@#
            </ui-checkbox>
          </div>
          <cv-button
            variant="primary"
            size="small"
            @click=${this.generate}
            class="gen-btn-main"
            title=${i18n('button:generate')}
          >
            <cv-icon name="arrow-clockwise"></cv-icon>
          </cv-button>
        </div>
      </div>
    `
  }

  private renderUrlsField(): TemplateResult {
    return html`
      <div class="field-group">
        <cv-input
          name="urls"
          .value=${this.model.editedUrls()}
          placeholder=${i18n('website:placeholder')}
          @cv-input=${this.changeUrls}
          ?data-has-error=${!!this.model.urlsError()}
          size="small"
        >
          <cv-icon slot="prefix" name="globe"></cv-icon>
          <span slot="label">${i18n('website:title')}</span>
          ${this.model.urlsError()
            ? html`<div slot="help-text" class="error-text">${this.model.urlsError()}</div>`
            : this.model.urlsPreview()
              ? html`<div slot="help-text" class="preview-text">${this.model.urlsPreview()}</div>`
              : nothing}
        </cv-input>
      </div>
    `
  }

  private renderNoteField(): TemplateResult {
    return html`
      <div class="field-group note-group">
        <cv-textarea
          name="note"
          size="small"
          .value=${this.model.editedNote()}
          placeholder=${i18n('note:placeholder')}
          rows="2"
          @cv-input=${this.changeNote}
        >
          <span slot="label">${i18n('note:title')}</span>
        </cv-textarea>
      </div>
    `
  }

  private renderSshGeneratorPanel(): TemplateResult | typeof nothing {
    if (!this.model.showSshGenerator()) return nothing

    return html`
      <pm-entry-ssh-generator
        radio-group="ssh-key-type"
        show-cancel
        allow-copy
        .keyType=${this.model.sshGenKeyType()}
        .comment=${this.model.sshGenComment()}
        .generating=${this.model.sshGenerating()}
        .result=${this.model.sshGenResult()}
        @pm-entry-ssh-key-type-change=${this.onSshKeyTypeChange}
        @pm-entry-ssh-comment-input=${this.onSshGenCommentInput}
        @pm-entry-ssh-generate=${this.onGenerateSshKeyRequest}
        @pm-entry-ssh-cancel=${this.onCancelSshGenerator}
      ></pm-entry-ssh-generator>
    `
  }

  private renderSshSection(entry: Entry): TemplateResult {
    const sshKeys = entry.sshKeys
    const hasSsh = sshKeys.length > 0

    return html`
      <cv-accordion-item value="ssh">
        <span slot="trigger" class="otp-summary">
          <cv-icon name="key"></cv-icon>
          <span>${i18n('ssh:title')}</span>
          ${hasSsh ? html`<span class="otp-badge">${sshKeys.length}</span>` : nothing}
        </span>
        <div class="otp-content">
          ${hasSsh
            ? html`
                <div class="ssh-key-list">
                  ${sshKeys.map(
                    (key) => html`
                      <pm-entry-ssh-key
                        .mode=${'edit'}
                        .keyId=${key.id}
                        .keyType=${key.type}
                        .fingerprint=${key.fingerprint}
                        .comment=${key.comment}
                        .publicKeyProvider=${async () => (await entry.sshPublicKey(key.id)) ?? ''}
                        @pm-entry-ssh-key-remove=${this.onSshKeyRemove}
                      ></pm-entry-ssh-key>
                    `,
                  )}
                </div>
              `
            : nothing}
          ${!this.model.showSshGenerator()
            ? html`
                <cv-button
                  variant="default"
                  size="small"
                  @click=${this.onOpenSshGenerator}
                  class="otp-add-btn"
                >
                  <cv-icon slot="prefix" name="plus"></cv-icon>
                  ${i18n('ssh:generate')}
                </cv-button>
              `
            : nothing}
          ${this.renderSshGeneratorPanel()}
        </div>
      </cv-accordion-item>
    `
  }

  private async onGenerateSshKey(entry: Entry): Promise<void> {
    const result = await this.model.generateSshKey(entry)
    if (result.ok) {
      return
    }

    void Swal.fire({
      title: i18n('error:save'),
      text: result.message,
      icon: 'error',
    })
  }

  private async onRemoveSshKey(entry: Entry, keyId: string): Promise<void> {
    const res = await Swal.fire({
      title: i18n('ssh:remove:confirm:title'),
      text: i18n('ssh:remove:confirm:text'),
      icon: 'warning',
      showCancelButton: true,
      showConfirmButton: true,
    })
    if (!res.isConfirmed) return

    await this.model.removeSshKey(entry, keyId)
  }

  private onSshKeyRemove(event: CustomEvent<{keyId: string}>): void {
    const entry = this.getCurrentEntry()
    if (!entry) return
    void this.onRemoveSshKey(entry, event.detail.keyId)
  }

  private renderFieldsGrid(entry: Entry): TemplateResult {
    return html`
      <div class="fields-grid">
        ${this.renderIconField()} ${this.renderTitleField()} ${this.renderUsernameField()}
        ${this.renderPasswordField()} ${this.renderGeneratorPanel()} ${this.renderUrlsField()}
        ${this.renderNoteField()}
      </div>
    `
  }

  private showOtpCreateScreen(): boolean {
    return this.model.showOtpCreateScreen(this.shouldUseOtpSubScreen())
  }

  private shouldOpenOtpDetails(entry: Entry): boolean {
    return this.model.shouldOpenOtpDetails(entry, this.shouldUseOtpSubScreen())
  }

  private renderOtpDetails(entry: Entry): TemplateResult {
    const hasOtps = this.model.hasOtps(entry)
    const showOtpCreateScreen = this.showOtpCreateScreen()

    return html`
      <cv-accordion-item value="otp">
        <span slot="trigger" class="otp-summary">
          <cv-icon name="shield-check"></cv-icon>
          <span>${i18n('entry:badge:two_factor')}</span>
          ${hasOtps ? html`<span class="otp-badge">${entry.otps().length}</span>` : nothing}
        </span>
        <div class="otp-content">
          ${this.renderOtpList(entry)}
          ${this.model.isAddNewOtp() && !showOtpCreateScreen
            ? html`
                <div class="otp-create-panel">
                  <pm-entry-otp-create></pm-entry-otp-create>
                </div>
                <div class="otp-btns">
                  <cv-button variant="default" size="small" @click=${this.onCancelAddOtp}>
                    ${i18n('button:cancel')}
                  </cv-button>
                  <cv-button variant="primary" size="small" @click=${this.onSaveOtp}>
                    <cv-icon slot="prefix" name="check"></cv-icon>
                    ${i18n('otp:save')}
                  </cv-button>
                </div>
              `
            : !this.model.isAddNewOtp()
              ? html`
                  <cv-button variant="default" size="small" @click=${this.onAddOtp} class="otp-add-btn">
                    <cv-icon slot="prefix" name="plus"></cv-icon>
                    ${i18n('otp:add')}
                  </cv-button>
                `
              : nothing}
        </div>
      </cv-accordion-item>
    `
  }

  private getExpandedSectionValues(entry: Entry): string[] {
    const expandedValues: string[] = []

    if (this.shouldOpenOtpDetails(entry)) {
      expandedValues.push('otp')
    }

    if (entry.sshKeys.length > 0 || this.model.showSshGenerator()) {
      expandedValues.push('ssh')
    }

    return expandedValues
  }

  private renderEditSections(entry: Entry): TemplateResult {
    return html`
      <cv-accordion
        class="edit-sections-accordion"
        allow-multiple
        reveal-expanded
        .expandedValues=${this.getExpandedSectionValues(entry)}
      >
        ${this.renderOtpDetails(entry)} ${this.renderSshSection(entry)}
      </cv-accordion>
    `
  }

  private renderOtpCreateScreen(): TemplateResult | typeof nothing {
    if (!this.showOtpCreateScreen()) {
      return nothing
    }

    const headerActions = this.renderOtpCreateHeaderActions()
    const footerActions = this.renderOtpCreateFooterActions()

    return html`
      <section class="otp-create-screen" role="dialog" aria-modal="true" aria-label=${i18n('otp:add')}>
        <header class="otp-create-screen-header">
          <h2 class="otp-create-screen-title">${i18n('otp:add')}</h2>
          ${headerActions ? html`<div class="otp-create-screen-actions">${headerActions}</div>` : nothing}
        </header>
        <div class="otp-create-screen-body">
          <pm-entry-otp-create></pm-entry-otp-create>
        </div>
        ${footerActions ? html`<footer class="otp-create-screen-footer">${footerActions}</footer>` : nothing}
      </section>
    `
  }

  protected renderPMEntryEditLayout(entry: Entry, options: PMEntryEditLayoutOptions = {}): TemplateResult {
    if (this.showOtpCreateScreen()) {
      return html`${this.renderOtpCreateScreen()}`
    }

    return html`
      <form id="edit-form" @submit=${this.onSubmitEdit} class="edit-wrapper">
        ${this.renderEditHeader(options)} ${this.renderFieldsGrid(entry)} ${this.renderEditSections(entry)}
        ${this.renderOtpCreateScreen()} ${options.footerActions ?? nothing}
      </form>
    `
  }

  protected changeTitle(e: Event): void {
    const element = e.target as HTMLInputElement
    this.model.setTitle(element.value)
  }

  protected changePassword(e: Event): void {
    const element = e.target as HTMLInputElement
    this.model.setPassword(element.value)
  }

  protected changeUsername(e: Event): void {
    const element = e.target as HTMLInputElement
    this.model.setUsername(element.value)
  }

  protected changeUrls(e: Event): void {
    const element = e.target as HTMLInputElement
    const raw = element.value ?? ''
    this.model.setUrls(raw)
  }

  protected changeNote(e: CVTextareaInputEvent): void {
    this.model.setNote(e.detail.value)
  }

  protected async submitEdit(entry: Entry): Promise<void> {
    if (!this.session) return

    const result = await this.model.submitEdit(entry, this.session)
    if (result.ok) {
      this.editEnd()
      return
    }

    if (result.reason === 'secrets_loading') {
      void Swal.fire({
        title: i18n('error:save'),
        text: i18n('dialog:validation:secrets_loading'),
        icon: 'warning',
        confirmButtonText: i18n('button:ok'),
      })
      return
    }

    if (result.reason === 'validation_error') {
      void Swal.fire({
        title: i18n('dialog:validation:title'),
        text: i18n('dialog:validation:fix_errors'),
        icon: 'error',
        confirmButtonText: i18n('button:ok'),
      })
      return
    }

    void Swal.fire({
      title: i18n('error:save'),
      text: result.message ?? '',
      icon: 'error',
    })
  }

  protected editEnd(): void {
    this.dispatchEvent(new CustomEvent('editEnd'))
  }

  protected async saveOtp(entry: Entry): Promise<void> {
    const data = this.shadowRoot?.querySelector('pm-entry-otp-create')?.getFormData() as
      | OTPOptions
      | undefined
    await this.model.saveOtp(entry, data)
  }

  protected renderOtpList(card: Entry): TemplateResult {
    const data = card.otps()

    if (!data.length) {
      return html`
        <div class="otp-list-header">
          <label>${i18n('otp:list')}</label>
        </div>
        <p class="otp-empty">-</p>
      `
    }

    const otpRows = data.map((item, i) => {
      const otpType = item.type.peek()
      return html`
        <div class="otp-item">
          <div class="otp-item-main">
            <span class="otp-item-label"
              >${item.data.label || i18n('otp:item_fallback', {index: String(i + 1)})}</span
            >
            <span class="otp-item-type">${otpType}</span>
          </div>
          <cv-button
            class="otp-item-remove"
            size="small"
            variant="danger"
            @click=${item.remove}
            aria-label=${i18n('otp:remove')}
          >
            <cv-icon name="trash"></cv-icon>
          </cv-button>
        </div>
      `
    })

    return html`
      <div class="otp-list-header">
        <label>${i18n('otp:list')}</label>
        <span class="otp-list-count">${data.length}</span>
      </div>
      <div class="otp-list">${otpRows}</div>
    `
  }

  protected generate(): void {
    this.model.generatePassword()
  }

  protected onGenLengthChange(e: Event): void {
    this.model.setGenLength(Number((e.target as HTMLInputElement).value))
  }

  protected onGenLowercaseChange(e: Event): void {
    this.model.setGenLowercase(Boolean((e.target as HTMLInputElement).checked))
  }

  protected onGenUppercaseChange(e: Event): void {
    this.model.setGenUppercase(Boolean((e.target as HTMLInputElement).checked))
  }

  protected onGenDigitsChange(e: Event): void {
    this.model.setGenDigits(Boolean((e.target as HTMLInputElement).checked))
  }

  protected onGenSymbolsChange(e: Event): void {
    this.model.setGenSymbols(Boolean((e.target as HTMLInputElement).checked))
  }

  private onSshGenCommentInput(e: PMEntrySshCommentInputEvent): void {
    this.model.setSshComment(e.detail.value)
  }

  protected onSshKeyTypeChange(e: PMEntrySshKeyTypeChangeEvent): void {
    this.model.setSshKeyType(e.detail.keyType)
  }

  protected onOpenSshGenerator(): void {
    const entry = this.getCurrentEntry()
    if (!entry) return
    this.model.openSshGenerator(entry)
  }

  protected onGenerateSshKeyRequest(_event: PMEntrySshGenerateEvent): void {
    const entry = this.getCurrentEntry()
    if (!entry) return
    void this.onGenerateSshKey(entry)
  }

  protected onCancelSshGenerator(_event: PMEntrySshCancelEvent): void {
    this.model.cancelSshGenerator()
  }

  protected onCancelAddOtp(): void {
    this.model.cancelAddOtp()
  }

  protected onSaveOtp(): void {
    const entry = this.getCurrentEntry()
    if (!entry) return
    void this.saveOtp(entry)
  }

  protected onAddOtp(): void {
    this.model.beginAddOtp()
  }

  protected onIconChange(e: CustomEvent<{iconRef: string | undefined}>): void {
    this.model.setIconRef(e.detail.iconRef)
  }

  protected shouldUseOtpSubScreen(): boolean {
    return (
      window.matchMedia('(hover: none) and (pointer: coarse)').matches ||
      window.matchMedia('(max-width: 720px)').matches
    )
  }

  protected onSubmitEdit(e: Event): void {
    e.preventDefault()
    const entry = this.getCurrentEntry()
    if (!entry) return
    void this.submitEdit(entry)
  }

  protected toggleGenerator(): void {
    this.model.toggleGenerator()
  }

  private getCurrentEntry(): Entry | null {
    return this.entry instanceof Entry ? this.entry : null
  }

  protected renderHeaderActions(): TemplateResult | undefined {
    return html`
      <cv-button class="edit-cancel-btn" variant="default" size="small" @click=${this.editEnd}>
        <cv-icon slot="prefix" name="x"></cv-icon>
        ${i18n('button:cancel')}
      </cv-button>
      <cv-button class="edit-save-btn" variant="primary" size="small" type="submit">
        <cv-icon slot="prefix" name="check"></cv-icon>
        ${i18n('button:save')}
      </cv-button>
    `
  }

  protected renderFooterActions(): TemplateResult | undefined {
    return undefined
  }

  protected renderOtpCreateActionButtons(): TemplateResult {
    return html`
      <cv-button variant="default" size="small" @click=${this.onCancelAddOtp}>${i18n('button:cancel')}</cv-button>
      <cv-button variant="primary" size="small" @click=${this.onSaveOtp}>
        <cv-icon slot="prefix" name="check"></cv-icon>
        ${i18n('otp:save')}
      </cv-button>
    `
  }

  protected renderOtpCreateHeaderActions(): TemplateResult | undefined {
    return this.renderOtpCreateActionButtons()
  }

  protected renderOtpCreateFooterActions(): TemplateResult | undefined {
    return undefined
  }

  protected renderEntryEdit(entry: Entry): TemplateResult {
    return this.renderPMEntryEditLayout(entry, {
      headerActions: this.renderHeaderActions(),
      footerActions: this.renderFooterActions(),
    })
  }

  render() {
    const entry = this.entry
    if (!(entry instanceof Entry)) {
      return i18n('entry:no_info')
    }

    return this.renderEntryEdit(entry)
  }
}
