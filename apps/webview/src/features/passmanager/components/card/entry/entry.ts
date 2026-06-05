import {nothing, type PropertyValues} from 'lit'
import {createAfterRenderScheduler, html} from '@chromvoid/uikit/reatom-lit'
import {motionPrimitiveStyles} from 'root/shared/ui/shared-styles'

import {Entry, OTP} from '@project/passmanager/core'
import {i18n} from '@project/passmanager/i18n'

import {isPassmanagerReadOnlyOrMissing} from '../../../models/pm-root.adapter'
import {PMEntryBase} from './entry-base'
import {scheduleInlineEditorFocus, scheduleSectionSnippetFocus} from './mobile/focus'
import {
  renderInlineEditAction,
  renderInlineEditSubmitButtons,
  renderInlinePasswordGeneratorPanel,
  renderInlinePasswordStrength,
  renderNoteEditAction,
  renderNoteSubmitButtons,
  renderSectionSnippetButtons,
} from './mobile/shared'
import {
  PMEntryEditModel,
  type PMEntryEditData,
  type PMEntryInlineField,
  type PMEntrySectionSnippet,
} from './entry-edit.model'
import type {PMEntryHeaderBadge} from './entry.model'
import type {PMEntrySecretResource} from './entry-session.model'
import {entryDesktopStyles, pmEntryCardStyles, pmEntryGenerateStyles} from './styles'
import {renderPaymentCardFace} from './payment-card-face'
import {renderPMCopyButton} from '../../pm-copy-button'
import type {PMEntrySshGenerateEvent} from '../entry-ssh/entry-ssh-generator'
import {pmCredentialTagsModel} from '../../../models/pm-credential-tags.model'
import {
  getSelectedTagIdsFromEvent,
  renderEntryTagsEditor,
  renderEntryTagsReadOnly,
} from '../entry-tags/entry-tags-editor'
import {pmEntryTagsStyles} from '../entry-tags/entry-tags.styles'

export class PMEntry extends PMEntryBase {
  static styles = [
    ...PMEntryBase.styles,
    pmEntryCardStyles,
    pmEntryGenerateStyles,
    pmEntryTagsStyles,
    motionPrimitiveStyles,
    entryDesktopStyles,
  ]

  protected override readonly model = new PMEntryEditModel()

  private readonly afterRenderScheduler = createAfterRenderScheduler(this)
  private renderedInlineField: PMEntryInlineField | null = null
  private renderedSectionSnippet: PMEntrySectionSnippet | null = null

  protected override updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties)

    const card = this.entry
    if (card instanceof Entry) {
      this.model.syncRequestedSurfaceFromEditor(card)
    } else {
      this.model.resetRequestedSurface()
    }

    const inlineField = this.model.inlineField()
    if (inlineField !== this.renderedInlineField) {
      this.renderedInlineField = inlineField
      scheduleInlineEditorFocus(this.afterRenderScheduler, () => this.shadowRoot, inlineField)
    }

    const sectionSnippet = this.model.sectionSnippet()
    if (sectionSnippet !== this.renderedSectionSnippet) {
      this.renderedSectionSnippet = sectionSnippet
      scheduleSectionSnippetFocus(this.afterRenderScheduler, () => this.shadowRoot, sectionSnippet)
    }
  }

  override disconnectedCallback(): void {
    this.afterRenderScheduler.cancel()
    this.model.resetRequestedSurface()
    super.disconnectedCallback()
  }

  private renderHeaderBadges(badges: readonly PMEntryHeaderBadge[]) {
    if (!badges.length) return nothing

    return html`
      <div slot="context-end" class="entry-meta-badges entry-header-summary">
        ${badges.map(
          (badge) => html`
            <cv-badge size="small" variant=${badge.variant}>
              <cv-icon name=${badge.icon} slot="prefix" size="xs"></cv-icon>
              ${badge.text}
            </cv-badge>
          `,
        )}
      </div>
    `
  }

  private handleInlineEditInput(event: Event) {
    const field = (event.currentTarget as HTMLElement | null)?.dataset['inlineField'] as
      | PMEntryInlineField
      | undefined
    if (!field) return

    const target = event.target as (HTMLInputElement & {value?: string}) | null
    const detailValue = (event as CustomEvent<{value?: string}>).detail?.value
    const value = typeof detailValue === 'string' ? detailValue : (target?.value ?? '')

    this.model.setInlineDraft(field, value)
  }

  private handleInlinePasswordLengthInput(event: Event) {
    const target = event.target as (HTMLInputElement & {value?: string}) | null
    const detailValue = (event as CustomEvent<{value?: string}>).detail?.value
    const value = Number.parseInt(typeof detailValue === 'string' ? detailValue : (target?.value ?? ''), 10)
    if (Number.isFinite(value)) {
      this.model.setInlinePasswordGenLength(value)
    }
  }

  private isPlainEscapeKey(event: KeyboardEvent) {
    return (
      event.key === 'Escape' &&
      !event.defaultPrevented &&
      !event.shiftKey &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey
    )
  }

  private handleInlineEditorKeyDown(event: KeyboardEvent) {
    if (!this.isPlainEscapeKey(event)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    this.model.cancelInlineEdit()
  }

  private handleSectionSnippetKeyDown(event: KeyboardEvent) {
    if (!this.isPlainEscapeKey(event)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    this.model.closeSectionSnippet()
  }

  private handleInlineEditSubmit(event: Event) {
    event.preventDefault()
    this.handleSaveInlineEdit()
  }

  private handleSaveInlineEdit() {
    if (!(this.entry instanceof Entry)) return
    void this.model.saveInlineEdit(this.entry)
  }

  private handleNoteSubmit(event: Event) {
    event.preventDefault()
    this.handleSaveNote()
  }

  private handleSaveNote() {
    if (!(this.entry instanceof Entry)) return
    void this.model.saveNoteEdit(this.entry)
  }

  private handlePaymentCardInput(event: Event) {
    const field = (event.currentTarget as HTMLElement | null)?.dataset['paymentCardField'] as
      | 'title'
      | 'cardholderName'
      | 'cardNumber'
      | 'expMonth'
      | 'expYear'
      | 'cardCvv'
      | undefined
    if (!field) return

    const target = event.target as (HTMLInputElement & {value?: string}) | null
    const detailValue = (event as CustomEvent<{value?: string}>).detail?.value
    const value = typeof detailValue === 'string' ? detailValue : (target?.value ?? '')

    this.model.setPaymentCardDraft(field, value)
  }

  private handleSavePaymentCard() {
    if (!(this.entry instanceof Entry)) return
    void this.model.savePaymentCardEdit(this.entry)
  }

  private handleTagSelect(event: Event) {
    this.model.setTagDraftFromKeys(getSelectedTagIdsFromEvent(event))
  }

  private handleManageTags(event: Event) {
    event.preventDefault()
    pmCredentialTagsModel.openManageSheet()
  }

  private handleSaveTags() {
    if (!(this.entry instanceof Entry)) return
    void this.model.saveTagEdit(this.entry)
  }

  private handleToggleCardCvv() {
    this.model.actions.toggleCardCvvRevealed()
  }

  private handleOtpSave() {
    if (!(this.entry instanceof Entry)) return

    void this.model.saveOtpSnippet(this.entry)
  }

  private handleOtpRemove(event: CustomEvent<{otpId: string}>) {
    if (!(this.entry instanceof Entry)) return

    const otp = this.entry.otps().find((candidate) => candidate.id === event.detail.otpId)
    if (!(otp instanceof OTP)) return

    void this.model.removeOtp(otp)
  }

  private handleGenerateSshKeyRequest(_event: PMEntrySshGenerateEvent) {
    if (!(this.entry instanceof Entry)) return
    void this.model.generateSshKey(this.entry)
  }

  private handleSshKeyRemove(event: CustomEvent<{keyId: string}>) {
    if (!(this.entry instanceof Entry)) return

    void this.model.removeSshKey(this.entry, event.detail.keyId)
  }

  private renderTitleField(card: Entry, data: PMEntryEditData) {
    const isEditing = this.model.inlineField() === 'title'
    const inlineError = this.model.inlineError()

    return html`
      <div class="credential-field ${isEditing ? 'credential-field-editing' : ''}">
        ${isEditing
          ? html`
              <div class="field-editor">
                <form class="inline-edit-form" @submit=${this.handleInlineEditSubmit}>
                  <cv-input
                    class="inline-field-input"
                    name="inline-title"
                    data-inline-field="title"
                    .value=${this.model.inlineTitle()}
                    @cv-input=${this.handleInlineEditInput}
                    @keydown=${this.handleInlineEditorKeyDown}
                    ?data-has-error=${!!inlineError}
                    size="small"
                  >
                    <span slot="label">${i18n('title')}</span>
                    ${inlineError ? html`<div slot="help-text" class="error-text">${inlineError}</div>` : nothing}
                  </cv-input>
                  ${renderInlineEditSubmitButtons(() => this.model.cancelInlineEdit())}
                </form>
              </div>
            `
          : html`
              <div class="field-content">
                <span class="field-label">${i18n('title')}</span>
                <span class="field-value ${card.title ? '' : 'empty'}">${data.title}</span>
              </div>
              <div class="field-actions">
                ${data.canEditFields
                  ? renderInlineEditAction('title', i18n('button:edit'), () => this.model.beginInlineEdit(card, 'title'))
                  : nothing}
              </div>
            `}
      </div>
    `
  }

  protected override renderUsernameField(card: Entry) {
    const data = this.model.contracts.getEntryData(card) as PMEntryEditData
    const isEditing = this.model.inlineField() === 'username'
    const inlineError = this.model.inlineError()

    return html`
      <div class="credential-field ${isEditing ? 'credential-field-editing' : ''}">
        ${isEditing
          ? html`
              <div class="field-editor">
                <form class="inline-edit-form" @submit=${this.handleInlineEditSubmit}>
                  <cv-input
                    class="inline-field-input"
                    name="inline-username"
                    data-inline-field="username"
                    .value=${this.model.inlineUsername()}
                    @cv-input=${this.handleInlineEditInput}
                    @keydown=${this.handleInlineEditorKeyDown}
                    ?data-has-error=${!!inlineError}
                    size="small"
                  >
                    <span slot="label">${i18n('username')}</span>
                    ${inlineError ? html`<div slot="help-text" class="error-text">${inlineError}</div>` : nothing}
                  </cv-input>
                  ${renderInlineEditSubmitButtons(() => this.model.cancelInlineEdit())}
                </form>
              </div>
            `
          : html`
              <div class="field-content">
                <span class="field-label">${i18n('username')}</span>
                <span class="field-value ${card.username ? '' : 'empty'}">${data.username}</span>
              </div>
              <div class="field-actions">
                ${card.username ? renderPMCopyButton({value: card.username, size: 'small'}) : nothing}
                ${data.canEditFields
                  ? renderInlineEditAction('username', i18n('button:edit'), () =>
                      this.model.beginInlineEdit(card, 'username'))
                  : nothing}
              </div>
            `}
      </div>
    `
  }

  protected override renderPasswordField(card: Entry) {
    const data = this.model.contracts.getEntryData(card) as PMEntryEditData
    const passwordResource = this.model.state.passwordResource()
    const isLoading = passwordResource.status === 'idle' || passwordResource.status === 'loading'
    const isReady = passwordResource.status === 'ready'
    const isEditing = this.model.inlineField() === 'password'
    const inlineError = this.model.inlineError()

    return html`
      <div class="credential-field ${isEditing ? 'credential-field-editing' : ''}">
        ${isEditing
          ? html`
              <div class="field-editor">
                <form class="inline-edit-form" @submit=${this.handleInlineEditSubmit}>
                  <div class="password-inline-stack">
                    <cv-input
                      class="inline-field-input"
                      type="password"
                      password-toggle
                      name="inline-password"
                      data-inline-field="password"
                      .value=${this.model.inlinePassword()}
                      @cv-input=${this.handleInlineEditInput}
                      @keydown=${this.handleInlineEditorKeyDown}
                      ?data-has-error=${!!inlineError}
                      size="small"
                    >
                      <span slot="label">${i18n('password')}</span>
                      ${inlineError ? html`<div slot="help-text" class="error-text">${inlineError}</div>` : nothing}
                    </cv-input>
                    <div class="password-inline-tools">
                      <cv-button unstyled
                        class="generator-toggle-button"
                        type="button"
                        aria-label=${i18n('password:generator_settings')}
                        aria-pressed=${String(this.model.inlinePasswordGeneratorOpen())}
                        title=${i18n('password:generator_settings')}
                        @click=${() => this.model.toggleInlinePasswordGenerator()}
                      >
                        <cv-icon name="gear" aria-hidden="true"></cv-icon>
                      </cv-button>
                      <cv-button
                        class="generate-action-button"
                        type="button"
                        variant="primary"
                        size="small"
                        @click=${() => this.model.generateInlinePassword()}
                      >
                        <cv-icon slot="prefix" name="arrow-clockwise" aria-hidden="true"></cv-icon>
                        <span>${i18n('button:generate')}</span>
                      </cv-button>
                    </div>
                    ${renderInlinePasswordStrength(this.model)}
                    ${renderInlinePasswordGeneratorPanel(this.model, (event) => this.handleInlinePasswordLengthInput(event))}
                  </div>
                  ${renderInlineEditSubmitButtons(() => this.model.cancelInlineEdit())}
                </form>
              </div>
            `
          : html`
              <div class="field-content">
                <span class="field-label">${i18n('password')}</span>
                ${isLoading
                  ? html`
                      <div class="note-skeleton secret-skeleton" role="status" aria-label=${i18n('loading')}>
                        <div class="skeleton-line"></div>
                      </div>
                    `
                  : isReady
                    ? html`
                        <cv-input
                          class="password-input"
                          type="password"
                          password-toggle
                          readonly
                          .value=${passwordResource.value}
                          size="small"
                        ></cv-input>
                      `
                    : html`
                        <span class="field-value ${passwordResource.status === 'error' ? 'error' : 'empty'}">
                          ${passwordResource.status === 'error' ? i18n('entry:secret:unavailable') : '—'}
                        </span>
                      `}
              </div>
              <div class="field-actions">
                ${isReady ? renderPMCopyButton({value: passwordResource.value, size: 'small'}) : nothing}
                ${data.canEditFields
                  ? renderInlineEditAction('password', i18n('button:edit'), () =>
                      this.model.beginInlineEdit(card, 'password'))
                  : nothing}
              </div>
            `}
      </div>
    `
  }

  private renderWebsiteField(card: Entry, data: PMEntryEditData) {
    const isEditing = this.model.inlineField() === 'website'
    const inlineError = this.model.inlineError()

    return html`
      <div class="credential-field ${isEditing ? 'credential-field-editing' : ''}">
        ${isEditing
          ? html`
              <div class="field-editor">
                <form class="inline-edit-form" @submit=${this.handleInlineEditSubmit}>
                  <cv-input
                    class="inline-field-input"
                    name="inline-website"
                    data-inline-field="website"
                    .value=${this.model.inlineWebsite()}
                    @cv-input=${this.handleInlineEditInput}
                    @keydown=${this.handleInlineEditorKeyDown}
                    ?data-has-error=${!!inlineError}
                    size="small"
                  >
                    <span slot="label">${i18n('website:title')}</span>
                    ${inlineError ? html`<div slot="help-text" class="error-text">${inlineError}</div>` : nothing}
                  </cv-input>
                  ${renderInlineEditSubmitButtons(() => this.model.cancelInlineEdit())}
                </form>
              </div>
            `
          : html`
              <div class="field-content">
                <span class="field-label">${i18n('website')}</span>
                <div class="urls-list">${data.visibleUrls.length ? this.renderUrlButtons(data.visibleUrls) : html`<span class="field-value empty">—</span>`}</div>
              </div>
              <div class="field-actions">
                ${data.canEditWebsite
                  ? renderInlineEditAction('website', i18n('button:edit'), () =>
                      this.model.beginInlineEdit(card, 'website'))
                  : nothing}
              </div>
            `}
      </div>
    `
  }

  protected override renderNoteCardActions(noteResource: PMEntrySecretResource, noteContent: string) {
    const card = this.entry
    if (!(card instanceof Entry)) {
      return super.renderNoteCardActions(noteResource, noteContent)
    }

    if (this.model.sectionSnippet() === 'note') {
      return nothing
    }

    const isReadOnly = isPassmanagerReadOnlyOrMissing()
    const baseActions = super.renderNoteCardActions(noteResource, noteContent)
    if (isReadOnly) {
      return baseActions
    }

    return html`<div class="card-actions">${baseActions}${renderNoteEditAction(() => this.model.beginNoteEdit(card))}</div>`
  }

  protected override onStartNoteEdit() {
    if (!(this.entry instanceof Entry)) return
    this.model.beginNoteEdit(this.entry)
  }

  protected override renderNote() {
    if (this.model.sectionSnippet() !== 'note') {
      return super.renderNote()
    }

    const noteError = this.model.noteError()

    return html`
      <div class="note-inline-editor">
        <form class="note-inline-form" @submit=${this.handleNoteSubmit}>
          <cv-textarea
            class="note-inline-input"
            name="inline-note"
            .value=${this.model.noteDraft()}
            rows="6"
            size="small"
            enter-behavior="submit"
            @cv-input=${(event: CustomEvent<{value: string}>) => this.model.setNoteDraft(event.detail.value)}
            @keydown=${this.handleSectionSnippetKeyDown}
          >
            ${noteError ? html`<div slot="help-text" class="error-text">${noteError}</div>` : nothing}
          </cv-textarea>
          ${renderNoteSubmitButtons({onCancel: () => this.model.closeSectionSnippet(), saving: this.model.noteSaving()})}
        </form>
      </div>
    `
  }

  private renderOtpSection(card: Entry, data: PMEntryEditData) {
    const isEditing = this.model.sectionSnippet() === 'otp'
    const otpList = card.otps()
    const canShowOtpAdd = data.canStartOtpSnippet

    if (!isEditing && !data.hasOtps && !canShowOtpAdd) {
      return nothing
    }

    if (isEditing) {
      return html`
        <section class="inline-section-card" aria-label=${i18n('otp')} @keydown=${this.handleSectionSnippetKeyDown}>
          <div class="section-head">
            <div class="section-title">
              <cv-icon name="shield-check"></cv-icon>
              <span>${i18n('otp')}</span>
              ${data.otpCount > 0 ? html`<cv-badge class="section-count" size="small" variant="neutral">${data.otpCount}</cv-badge>` : nothing}
            </div>
          </div>
          <div class="otp-manage-list">
            ${otpList.length
              ? otpList.map(
                  (otp) => html`
                    <pm-entry-otp-item
                      .otp=${otp}
                      .removable=${data.canManageOtp}
                      @pm-entry-otp-remove=${this.handleOtpRemove}
                    ></pm-entry-otp-item>
                  `,
                )
              : nothing}
          </div>
          <div class="otp-inline-create">
            <pm-entry-otp-create data-snippet="otp" .model=${this.model.otpDraft}></pm-entry-otp-create>
          </div>
          ${this.model.otpError() ? html`<div class="error-text">${this.model.otpError()}</div>` : nothing}
          ${renderSectionSnippetButtons({
            onCancel: () => this.model.closeSectionSnippet(),
            onSave: () => this.handleOtpSave(),
            saving: this.model.otpSaving(),
          })}
        </section>
      `
    }

    return html`
      <section class="inline-section-card" aria-label=${i18n('otp')}>
          <div class="section-head">
            <div class="section-title">
              <cv-icon name="shield-check"></cv-icon>
              <span>${i18n('otp')}</span>
              ${data.otpCount > 0 ? html`<cv-badge class="section-count" size="small" variant="neutral">${data.otpCount}</cv-badge>` : nothing}
            </div>
          ${canShowOtpAdd
            ? html`
                <cv-button
                  class="section-action-button"
                  type="button"
                  variant="default"
                  size="small"
                  data-snippet-section="otp"
                  @click=${() => this.model.beginOtpSnippet(card)}
                  aria-label=${i18n('otp:add')}
                >
                  <cv-icon slot="prefix" name="plus" aria-hidden="true"></cv-icon>
                  <span>${i18n('otp:add')}</span>
                </cv-button>
              `
            : nothing}
        </div>
        ${otpList.length
          ? html`
              <div class="otp-codes">
                ${otpList.map(
                  (otp) => html`
                    <pm-entry-otp-item
                      .otp=${otp}
                      .removable=${false}
                      @pm-entry-otp-remove=${this.handleOtpRemove}
                    ></pm-entry-otp-item>
                  `,
                )}
              </div>
            `
          : nothing}
      </section>
    `
  }

  private renderSshSection(card: Entry, data: PMEntryEditData) {
    const showGenerator = this.model.sshGeneratorOpen()

    if (!data.hasSshKeys && !data.canStartSshSnippet) {
      return nothing
    }

    return html`
      <section
        class="inline-section-card"
        aria-label=${i18n('ssh:title')}
        @keydown=${showGenerator ? this.handleSectionSnippetKeyDown : undefined}
      >
        <div class="section-head">
          <div class="section-title">
            <cv-icon name="key"></cv-icon>
            <span>${i18n('ssh:title')}</span>
            ${data.hasSshKeys ? html`<cv-badge class="section-count" size="small" variant="neutral">${card.sshKeys.length}</cv-badge>` : nothing}
          </div>
          ${data.canStartSshSnippet && !showGenerator
            ? html`
                <cv-button
                  class=${data.hasSshKeys ? 'icon-btn' : 'section-action-button'}
                  type="button"
                  ?unstyled=${data.hasSshKeys}
                  variant="default"
                  size="small"
                  @click=${() => this.model.openSshGenerator(card)}
                  aria-label=${i18n('ssh:add')}
                >
                  <cv-icon slot=${data.hasSshKeys ? nothing : 'prefix'} name="plus" aria-hidden="true"></cv-icon>
                  ${data.hasSshKeys ? nothing : html`<span>${i18n('ssh:add')}</span>`}
                </cv-button>
              `
            : nothing}
        </div>
        ${data.hasSshKeys
          ? html`
              <div class="ssh-readonly-list">
                  ${card.sshKeys.map(
                    (key) => html`
                      <pm-entry-ssh-key
                        .keyId=${key.id}
                        .keyType=${key.type}
                        .fingerprint=${key.fingerprint}
                        .name=${key.name}
                        .comment=${key.comment}
                        .publicKey=${this.model.state.sshPublicKeys()[key.id] ?? ''}
                        .publicKeyProvider=${async () => (await card.sshPublicKey(key.id)) ?? ''}
                        .removable=${data.canManageSsh && !data.isEditingEntry}
                        @pm-entry-ssh-key-remove=${this.handleSshKeyRemove}
                      ></pm-entry-ssh-key>
                    `,
                  )}
                </div>
            `
          : nothing}
        ${showGenerator
          ? html`
              <pm-entry-ssh-generator
                radio-group="ssh-key-type-desktop"
                show-cancel
                allow-copy
                .keyType=${this.model.sshKeyType()}
                .comment=${this.model.sshComment()}
                .generating=${this.model.sshGenerating()}
                .result=${this.model.sshResult()}
                @pm-entry-ssh-key-type-change=${(event: CustomEvent<{keyType: string}>) =>
                  this.model.setSshKeyType(event.detail.keyType as any)}
                @pm-entry-ssh-comment-input=${(event: CustomEvent<{value: string}>) =>
                  this.model.setSshComment(event.detail.value)}
                @pm-entry-ssh-generate=${this.handleGenerateSshKeyRequest}
                @pm-entry-ssh-cancel=${() => this.model.cancelSshGenerator()}
              ></pm-entry-ssh-generator>
            `
          : nothing}
        ${this.model.sshError() ? html`<div class="error-text">${this.model.sshError()}</div>` : nothing}
      </section>
    `
  }

  private renderTagsSection(card: Entry, data: PMEntryEditData) {
    const isEditing = this.model.sectionSnippet() === 'tags'
    if (!isEditing && !data.hasTags && !data.canEditTags) {
      return nothing
    }

    if (isEditing) {
      return html`
        <section class="inline-section-card" aria-label=${i18n('tags:title')} @keydown=${this.handleSectionSnippetKeyDown}>
          <div class="section-head">
            <div class="section-title">
              <cv-icon name="tag"></cv-icon>
              <span>${i18n('tags:title')}</span>
            </div>
          </div>
          ${renderEntryTagsEditor(
            {
              tags: this.model.tagDraft(),
              options: pmCredentialTagsModel.availableTags(),
              disabled: !data.canEditTags,
            },
            {
              onSelectExistingTagIds: this.handleTagSelect,
              onManageTags: this.handleManageTags,
            },
          )}
          ${this.model.tagError() ? html`<div class="error-text">${this.model.tagError()}</div>` : nothing}
          ${renderSectionSnippetButtons({
            onCancel: () => this.model.cancelTagEdit(),
            onSave: () => this.handleSaveTags(),
            saving: this.model.tagSaving(),
          })}
        </section>
      `
    }

    return html`
      <section class="inline-section-card" aria-label=${i18n('tags:title')}>
        <div class="section-head">
          <div class="section-title">
            <cv-icon name="tag"></cv-icon>
            <span>${i18n('tags:title')}</span>
            ${data.tags.length > 0 ? html`<cv-badge class="section-count" size="small" variant="neutral">${data.tags.length}</cv-badge>` : nothing}
          </div>
          ${data.canEditTags && data.isEditingEntry
            ? html`
                <cv-button
                  class=${data.hasTags ? 'icon-btn' : 'section-action-button'}
                  type="button"
                  ?unstyled=${data.hasTags}
                  variant="default"
                  size="small"
                  data-snippet-section="tags"
                  @click=${() => this.model.startTagEdit(card)}
                  aria-label=${i18n('tags:add')}
                >
                  <cv-icon slot=${data.hasTags ? nothing : 'prefix'} name=${data.hasTags ? 'pencil' : 'plus'} aria-hidden="true"></cv-icon>
                  ${data.hasTags ? nothing : html`<span>${i18n('tags:add')}</span>`}
                </cv-button>
              `
            : nothing}
        </div>
        ${data.hasTags
          ? renderEntryTagsReadOnly(data.tags)
          : html`<span class="entry-tags-empty">${i18n('tags:empty')}</span>`}
      </section>
    `
  }

  private renderPaymentCardSection(card: Entry, data: PMEntryEditData) {
    const isEditing = this.model.sectionSnippet() === 'payment-card'
    const cardPanResource = this.model.state.cardPanResource()
    const cardCvvResource = this.model.state.cardCvvResource()
    const draftExpiryLabel =
      this.model.paymentCardExpMonthDraft() && this.model.paymentCardExpYearDraft()
        ? `${this.model.paymentCardExpMonthDraft().padStart(2, '0')}/${this.model.paymentCardExpYearDraft().slice(-2)}`
        : data.paymentCardExpiryLabel

    if (isEditing) {
      return html`
        <form
          class="payment-card-form-stack"
          @submit=${(event: Event) => {
            event.preventDefault()
            this.handleSavePaymentCard()
          }}
        >
          <section
            class="inline-section-card payment-card-surface"
            aria-label=${i18n('entry:type:payment_card')}
            @keydown=${this.handleSectionSnippetKeyDown}
          >
            ${renderPaymentCardFace({
              title: card.title,
              brandLabel: data.paymentCardBrandLabel,
              cardholderName: this.model.paymentCardholderNameDraft(),
              expiryLabel: draftExpiryLabel,
              cardNumberResource: {
                status: this.model.paymentCardNumberDraft().trim() ? 'ready' : 'missing',
                value: this.model.paymentCardNumberDraft(),
              },
              cardCvvResource: {
                status: this.model.paymentCardCvvDraft().trim() ? 'ready' : 'missing',
                value: this.model.paymentCardCvvDraft(),
              },
              isCvvRevealed: this.model.state.isCardCvvRevealed(),
              edit: {
                title: this.model.paymentCardTitleDraft(),
                cardholderName: this.model.paymentCardholderNameDraft(),
                cardNumber: this.model.paymentCardNumberDraft(),
                expMonth: this.model.paymentCardExpMonthDraft(),
                expYear: this.model.paymentCardExpYearDraft(),
                cardCvv: this.model.paymentCardCvvDraft(),
                onInput: this.handlePaymentCardInput,
                onKeyDown: this.handleSectionSnippetKeyDown,
              },
              onToggleCvv: () => this.handleToggleCardCvv(),
            })}
          </section>
          ${this.model.paymentCardError() ? html`<div class="error-text">${this.model.paymentCardError()}</div>` : nothing}
          ${renderSectionSnippetButtons({
            onCancel: () => this.model.closeSectionSnippet(),
            onSave: () => this.handleSavePaymentCard(),
            saving: this.model.paymentCardSaving(),
          })}
        </form>
      `
    }

    return html`
      <section class="inline-section-card payment-card-surface" aria-label=${i18n('entry:type:payment_card')}>
        ${renderPaymentCardFace({
          title: card.title,
          brandLabel: data.paymentCardBrandLabel,
          cardholderName: data.paymentCardholderName,
          expiryLabel: data.paymentCardExpiryLabel,
          cardNumberResource: cardPanResource,
          cardCvvResource,
          isCvvRevealed: this.model.state.isCardCvvRevealed(),
          onEdit: data.canEditPaymentCard ? () => this.model.beginPaymentCardEdit(card) : undefined,
          copyCardNumberValue: cardPanResource.status === 'ready' ? cardPanResource.value : undefined,
          copyCardCvvValue:
            cardCvvResource.status === 'ready' && cardCvvResource.value ? cardCvvResource.value : undefined,
          onToggleCvv: () => this.handleToggleCardCvv(),
        })}
      </section>
    `
  }

  private renderMainView(card: Entry) {
    const data = this.model.contracts.getEntryData(card) as PMEntryEditData

    this.style.setProperty('--entry-avatar-bg', data.avatarBg)

    return html`
      <article class="wrapper" role="main" aria-label=${data.entryTitleText}>
        <pm-workspace-header
          .item=${card}
          .contextLabel=${data.contextLabel}
          .contextItems=${data.contextItems}
          .title=${data.entryTitleText}
          .avatarLetter=${data.entryAvatarLetter}
          .avatarFallbackBg=${data.avatarBg}
          .updatedFormatted=${card.updatedFormatted}
          .createdFormatted=${card.createdFormatted}
          @pm-workspace-header-navigate=${this.onWorkspaceHeaderNavigate}
        >
          ${this.renderHeaderBadges(data.headerBadges)}
          ${this.renderHeaderActions()}
        </pm-workspace-header>
        ${card.entryType === 'payment_card'
          ? html`
              <div class="fields-card">${this.renderPaymentCardSection(card, data)}</div>
              <section class="secondary-section">
                ${this.renderTagsSection(card, data)}
                ${this.renderNoteDetails()}
              </section>
            `
          : html`
              <div class="fields-card">
                ${this.renderTitleField(card, data)}
                ${this.renderUsernameField(card)}
                ${this.renderPasswordField(card)}
                ${this.renderWebsiteField(card, data)}
              </div>

              <section class="secondary-section">
                ${this.renderTagsSection(card, data)}
                ${this.renderOtpSection(card, data)}
                ${this.renderSshSection(card, data)}
                ${this.renderNoteDetails()}
              </section>
            `}
      </article>
    `
  }

  render() {
    const card = this.entry
    if (!(card instanceof Entry)) {
      return html`<div role="alert">${i18n('entry:no_info')}</div>`
    }

    this.model.getRequestedSurfaceFromEditor(card)
    return this.renderMainView(card)
  }
}
