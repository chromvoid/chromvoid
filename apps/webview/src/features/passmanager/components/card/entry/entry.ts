import {nothing, type PropertyValues} from 'lit'
import {createAfterRenderScheduler, html} from '@chromvoid/uikit/reatom-lit'
import {CVButton} from '@chromvoid/uikit/components/cv-button'
import {CVMenuButton, type CVMenuButtonInputEvent} from '@chromvoid/uikit/components/cv-menu-button'
import {CVMenuItem} from '@chromvoid/uikit/components/cv-menu-item'
import {motionPrimitiveStyles} from 'root/shared/ui/shared-styles'
import {i18n as appI18n} from 'root/i18n'

import {Entry, OTP} from '@project/passmanager/core'
import {i18n} from '@project/passmanager/i18n'

import {isPassmanagerReadOnlyOrMissing} from '../../../models/pm-root.adapter'
import {PMEntryBase} from './entry-base'
import {
  scheduleEntryEditFieldFocus,
  scheduleInlineEditorFocus,
  scheduleSectionSnippetFocus,
} from './mobile/focus'
import {renderInlinePasswordGeneratorPanel, renderSectionSnippetButtons} from './mobile/shared'
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
import {pmCredentialTagsModel} from '../../../models/pm-credential-tags.model'
import {
  getSelectedTagIdsFromEvent,
  renderEntryTagsEditor,
  renderEntryTagsReadOnly,
} from '../entry-tags/entry-tags-editor'
import {pmEntryTagsStyles} from '../entry-tags/entry-tags.styles'
import type {PMEntryWebsiteEditor} from '../entry-website-editor'

export class PMEntry extends PMEntryBase {
  static styles = [
    ...PMEntryBase.styles,
    pmEntryCardStyles,
    pmEntryGenerateStyles,
    pmEntryTagsStyles,
    motionPrimitiveStyles,
    entryDesktopStyles,
  ]

  protected override readonly model = new PMEntryEditModel({tagSelectionPresentation: 'inline'})

  static override define(): void {
    super.define()
    CVButton.define()
    CVMenuButton.define()
    CVMenuItem.define()
  }

  private readonly afterRenderScheduler = createAfterRenderScheduler(this)
  private renderedInlineField: PMEntryInlineField | null = null
  private renderedSectionSnippet: PMEntrySectionSnippet | null = null
  private renderedEntryEditFocusToken = 0

  protected override updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties)

    const card = this.entry
    if (card instanceof Entry) {
      this.model.syncRequestedSurfaceFromEditor(card)
      this.model.syncEntryEditSecretsFromResources(card)
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

    const entryEditFocusRequest = this.model.entryEditFocusRequest()
    if (entryEditFocusRequest && entryEditFocusRequest.token !== this.renderedEntryEditFocusToken) {
      this.renderedEntryEditFocusToken = entryEditFocusRequest.token
      scheduleEntryEditFieldFocus(
        this.afterRenderScheduler,
        () => this.shadowRoot,
        entryEditFocusRequest.field,
      )
    }
  }

  override disconnectedCallback(): void {
    this.afterRenderScheduler.cancel()
    this.model.resetRequestedSurface()
    super.disconnectedCallback()
  }

  private renderSecuritySummary(badges: readonly PMEntryHeaderBadge[]) {
    if (!badges.length) return nothing

    return html`
      <section
        class="entry-inspector-section entry-security-section"
        aria-labelledby="entry-security-heading"
      >
        <h2 class="entry-inspector-heading" id="entry-security-heading">${i18n('group:security-short')}</h2>
        <div class="entry-status-list">
          ${badges.map(
            (badge) => html`
              <div class="entry-status" data-variant=${badge.variant}>
                <cv-icon name=${badge.icon} size="xs" aria-hidden="true"></cv-icon>
                <span>${badge.text}</span>
              </div>
            `,
          )}
        </div>
      </section>
    `
  }

  protected override renderHeaderActions() {
    if (!this.showHeaderActions) return nothing

    const card = this.entry
    if (!(card instanceof Entry)) {
      return super.renderHeaderActions()
    }

    const data = this.model.contracts.getEntryData(card) as PMEntryEditData
    if (data.isEditingEntry) {
      const saving =
        card.entryType === 'payment_card' ? this.model.paymentCardSaving() : this.model.inlineSaving()
      const error =
        card.entryType === 'payment_card' ? this.model.paymentCardError() : this.model.inlineError()

      return html`
        <div slot="actions" class="entry-edit-actions-shell">
          ${error ? html`<div class="entry-edit-error" role="alert">${error}</div>` : nothing}
          <div class="entry-edit-actions">
            <cv-button
              class="entry-edit-cancel-action"
              type="button"
              variant="default"
              size="small"
              @click=${this.handleCancelEntryEdit}
            >
              ${i18n('button:cancel')}
            </cv-button>
            <cv-button
              class="entry-edit-save-action"
              type="button"
              variant="primary"
              size="small"
              ?disabled=${saving}
              .loading=${saving}
              @click=${this.handleSaveEntryEdit}
            >
              ${i18n('button:save')}
            </cv-button>
          </div>
        </div>
      `
    }

    if (data.hasActiveEditorSurface) {
      return nothing
    }

    const actions = this.model.getDesktopToolbarActions()
    const editAction = actions.find((action) => action.id === 'edit-entry')
    const overflowActions = actions.filter((action) => action.id !== 'edit-entry')
    const overflowDisabled = overflowActions.every((action) => action.disabled)

    return html`
      <div
        slot="actions"
        class="header-actions entry-view-actions"
        role="toolbar"
        aria-label=${i18n('button:more_actions')}
      >
        ${editAction
          ? html`
              <cv-button
                class="entry-primary-action"
                type="button"
                variant="default"
                size="small"
                data-action=${editAction.id}
                ?disabled=${editAction.disabled ?? false}
                @click=${this.handleHeaderPrimaryAction}
              >
                <cv-icon slot="prefix" name=${editAction.icon} aria-hidden="true"></cv-icon>
                <span>${editAction.label}</span>
              </cv-button>
            `
          : nothing}
        ${overflowActions.length
          ? html`
              <cv-menu-button
                class="entry-actions-menu"
                variant="ghost"
                preset="icon-overflow"
                aria-label=${i18n('button:more_actions')}
                ?disabled=${overflowDisabled}
                close-on-select
                @cv-input=${this.handleHeaderActionsMenuInput}
              >
                <cv-icon slot="prefix" name="three-dots" aria-hidden="true"></cv-icon>
                ${overflowActions.map(
                  (action) => html`
                    <cv-menu-item
                      slot="menu"
                      value=${action.id}
                      data-action=${action.id}
                      data-danger=${action.danger ? 'true' : 'false'}
                      ?disabled=${action.disabled ?? false}
                    >
                      <cv-icon slot="prefix" name=${action.icon} aria-hidden="true"></cv-icon>
                      ${action.label}
                    </cv-menu-item>
                  `,
                )}
              </cv-menu-button>
            `
          : nothing}
      </div>
    `
  }

  private handleHeaderPrimaryAction(event: Event): void {
    const action = (event.currentTarget as HTMLElement | null)?.dataset['action']
    const card = this.entry
    if (!(card instanceof Entry) || !this.model.isDesktopToolbarAction(action)) return

    this.model.executeDesktopToolbarAction(action, card)
  }

  private handleHeaderActionsMenuInput(event: CVMenuButtonInputEvent): void {
    const menu = event.currentTarget as HTMLElementTagNameMap['cv-menu-button']
    if (event.detail.open) return

    const action = event.detail.value ?? undefined
    menu.value = ''
    for (const item of menu.querySelectorAll<HTMLElementTagNameMap['cv-menu-item']>('cv-menu-item')) {
      item.selected = false
      item.active = false
    }

    const card = this.entry
    if (!(card instanceof Entry) || !this.model.isDesktopToolbarAction(action)) return
    this.model.executeDesktopToolbarAction(action, card)
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

  private handleInlinePasswordGenerate() {
    this.model.generateInlinePassword()
  }

  private handleInlinePasswordGeneratorToggle() {
    this.model.toggleInlinePasswordGenerator()
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
    if (this.entry instanceof Entry) {
      const data = this.model.contracts.getEntryData(this.entry) as PMEntryEditData
      if (data.isEditingEntry) {
        this.model.cancelEntryEdit(this.entry)
        return
      }
    }

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

  private handlePaymentCardSubmit(event: Event) {
    event.preventDefault()
    this.handleSavePaymentCard()
  }

  private handleTagSelect(event: Event) {
    this.model.setTagDraftFromKeys(getSelectedTagIdsFromEvent(event))
  }

  private handleManageTags(event: Event) {
    event.preventDefault()
    this.model.openTagCatalogManager()
  }

  private handleStartTagEdit() {
    if (!(this.entry instanceof Entry)) return
    this.model.startTagEdit(this.entry)
  }

  private handleSaveTags() {
    if (!(this.entry instanceof Entry)) return
    void this.model.saveTagEdit(this.entry)
  }

  private handleToggleCardCvv() {
    this.model.actions.toggleCardCvvRevealed()
  }

  private handleHeaderTitleInput(event: CustomEvent<{value: string}>) {
    this.model.setInlineDraft('title', event.detail.value)
  }

  private handleInlineIconChange(event: CustomEvent<{iconRef: string | undefined}>) {
    this.model.setInlineIconRef(event.detail.iconRef)
  }

  private handleNoteInput(event: CustomEvent<{value: string}>) {
    this.model.setNoteDraft(event.detail.value)
  }

  private handleCancelEntryEdit() {
    if (!(this.entry instanceof Entry)) return
    this.model.cancelEntryEdit(this.entry)
  }

  private handleSaveEntryEdit() {
    if (!(this.entry instanceof Entry)) return
    void this.model.saveEntryEdit(this.entry).then((saved) => {
      if (!saved) {
        this.afterRenderScheduler.schedule(() => this.focusFirstInvalidEntryField())
      }
    })
  }

  private focusFirstInvalidEntryField() {
    if (this.model.inlineTitleError()) {
      this.shadowRoot
        ?.querySelector<HTMLElement & {focusTitleInput(): void}>('pm-workspace-header')
        ?.focusTitleInput()
      return
    }

    if (
      this.shadowRoot?.querySelector<PMEntryWebsiteEditor>('pm-entry-website-editor')?.focusFirstInvalid()
    ) {
      return
    }

    const firstOtpId = Object.keys(this.model.otpLabelErrors())[0]
    if (!firstOtpId) return

    const input = Array.from(
      this.shadowRoot?.querySelectorAll<HTMLElement>('cv-input[data-otp-label-input]') ?? [],
    ).find((candidate) => candidate.dataset['otpLabelInput'] === firstOtpId)
    input?.focus()
  }

  private handleStartNoteEntryEdit(event: Event) {
    if (!(this.entry instanceof Entry)) return

    event.preventDefault()
    event.stopPropagation()
    this.model.beginEntryEdit(this.entry, 'note')
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

  protected override renderUsernameField(card: Entry) {
    const data = this.model.contracts.getEntryData(card) as PMEntryEditData

    return html`
      <div
        class="credential-field ${data.isEditingEntry ? 'credential-field-editing' : ''}"
        data-field="username"
      >
        ${data.canEditFields && data.isEditingEntry
          ? html`
              <div class="field-editor">
                <span class="field-label">${i18n('username')}</span>
                <cv-input
                  class="inline-field-input entry-workbench-control-full"
                  aria-label=${i18n('username')}
                  dir="ltr"
                  name="inline-username"
                  data-inline-field="username"
                  .value=${this.model.inlineUsername()}
                  @cv-input=${this.handleInlineEditInput}
                  @keydown=${this.handleInlineEditorKeyDown}
                  size="medium"
                ></cv-input>
              </div>
            `
          : html`
              <div class="field-content">
                <span class="field-label">${i18n('username')}</span>
                <span class="field-value ${card.username ? '' : 'empty'}" dir="ltr">${data.username}</span>
              </div>
              <div class="field-actions">
                ${card.username ? renderPMCopyButton({value: card.username, size: 'small'}) : nothing}
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

    return html`
      <div
        class="credential-field ${data.isEditingEntry ? 'credential-field-editing' : ''}"
        data-field="password"
      >
        ${data.canEditFields && data.isEditingEntry
          ? html`
              <div class="field-editor">
                <span class="field-label">${i18n('password')}</span>
                <div class="password-workbench-value">
                  <cv-input
                    class="inline-field-input"
                    aria-label=${i18n('password')}
                    dir="ltr"
                    type="password"
                    password-toggle
                    name="inline-password"
                    data-inline-field="password"
                    .value=${this.model.inlinePassword()}
                    @cv-input=${this.handleInlineEditInput}
                    @keydown=${this.handleInlineEditorKeyDown}
                    size="medium"
                  ></cv-input>
                  ${this.renderDesktopPasswordStrength()}
                </div>
                <div
                  class="password-inline-tools"
                  role="group"
                  aria-label=${i18n('password:generator_settings')}
                >
                  <cv-button
                    class="generate-action-button"
                    type="button"
                    preset="action-primary-subtle"
                    size="medium"
                    @click=${this.handleInlinePasswordGenerate}
                  >
                    <cv-icon slot="prefix" name="arrow-clockwise" aria-hidden="true"></cv-icon>
                    <span>${i18n('button:generate')}</span>
                  </cv-button>
                  <cv-button
                    class="generator-toggle-button"
                    type="button"
                    variant="default"
                    size="medium"
                    outline
                    aria-label=${i18n('password:generator_settings')}
                    aria-expanded=${String(this.model.inlinePasswordGeneratorOpen())}
                    title=${i18n('password:generator_settings')}
                    @click=${this.handleInlinePasswordGeneratorToggle}
                  >
                    <cv-icon name="gear" aria-hidden="true"></cv-icon>
                  </cv-button>
                </div>
                ${this.model.inlinePasswordGeneratorOpen()
                  ? html`
                      <div class="password-generator-panel-shell">
                        ${renderInlinePasswordGeneratorPanel(
                          this.model,
                          this.handleInlinePasswordLengthInput,
                        )}
                      </div>
                    `
                  : nothing}
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
                          dir="ltr"
                          type="password"
                          password-toggle
                          readonly
                          readonly-scrollable
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
              </div>
            `}
      </div>
    `
  }

  private renderWebsiteField(_card: Entry, data: PMEntryEditData) {
    return html`
      <div
        class="credential-field ${data.isEditingEntry ? 'credential-field-editing' : ''}"
        data-field="website"
      >
        ${data.canEditWebsite && data.isEditingEntry
          ? html`
              <div class="field-editor">
                <pm-entry-website-editor
                  .model=${this.model.websiteEditor}
                  .presentation=${'workbench'}
                  @keydown=${this.handleInlineEditorKeyDown}
                ></pm-entry-website-editor>
              </div>
            `
          : html`
              <div class="field-content">
                <span class="field-label">${i18n('website')}</span>
                <div class="urls-list">
                  ${data.visibleUrls.length
                    ? this.renderUrlButtons(data.visibleUrls)
                    : html`<span class="field-value empty">—</span>`}
                </div>
              </div>
              <div class="field-actions"></div>
            `}
      </div>
    `
  }

  private renderDesktopPasswordStrength() {
    const score = this.model.inlinePasswordStrengthScore()
    if (score === null) return nothing

    const label = this.model.inlinePasswordStrengthLabel()
    const description = i18n('password:strength', {label})

    return html`
      <div
        class="entry-password-strength"
        role="meter"
        aria-label=${i18n('password:strength_indicator')}
        aria-valuemin="0"
        aria-valuemax="4"
        aria-valuenow=${score}
        aria-valuetext=${description}
      >
        <span class="entry-password-strength-segments" aria-hidden="true">
          ${[0, 1, 2, 3, 4].map((index) => html`<span data-active=${String(index <= score)}></span>`)}
        </span>
        <span class="entry-password-strength-label">${description}</span>
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

    const data = this.model.contracts.getEntryData(card) as PMEntryEditData
    if (data.isEditingEntry) {
      return nothing
    }

    const isReadOnly = isPassmanagerReadOnlyOrMissing()
    const baseActions = super.renderNoteCardActions(noteResource, noteContent)
    if (isReadOnly) {
      return baseActions
    }

    return html`<div class="card-actions">${baseActions}</div>`
  }

  protected override onStartNoteEdit() {
    if (!(this.entry instanceof Entry)) return
    this.model.beginEntryEdit(this.entry, 'note')
  }

  protected override renderNote() {
    const card = this.entry
    if (card instanceof Entry) {
      const data = this.model.contracts.getEntryData(card) as PMEntryEditData
      if (data.isEditingEntry && card.entryType !== 'payment_card') {
        return html`
          <cv-textarea
            class="note-inline-input entry-edit-note-input"
            dir="auto"
            name="inline-note"
            .value=${this.model.noteDraft()}
            rows="6"
            size="small"
            @cv-input=${this.handleNoteInput}
            @keydown=${this.handleInlineEditorKeyDown}
          ></cv-textarea>
        `
      }
    }

    if (this.model.sectionSnippet() !== 'note') {
      const noteResource = this.model.state.noteResource()
      const noteContent = this.model.state.note()
      const isLoading = noteResource.status === 'idle' || noteResource.status === 'loading'
      const isReadOnly = isPassmanagerReadOnlyOrMissing()

      if (isLoading) {
        return html`
          <div class="note-skeleton secret-skeleton" role="status" aria-label=${i18n('loading')}>
            <div class="skeleton-line"></div>
            <div class="skeleton-line short"></div>
          </div>
        `
      }

      if (noteResource.status === 'error') {
        return html`
          <div class="note-content note-content-error" role="status">${i18n('entry:secret:unavailable')}</div>
        `
      }

      if (!noteContent) {
        return html`<div class="empty-state" role="status">
          <span>${i18n('entry:note:empty_hint')}</span>
        </div>`
      }

      return html`
        <div
          class="note-content"
          role="textbox"
          aria-readonly="true"
          tabindex="-1"
          @dblclick=${isReadOnly ? undefined : this.handleStartNoteEntryEdit}
        ><bdi dir="auto">${noteContent}</bdi></div>
      `
    }

    const noteError = this.model.noteError()

    return html`
      <div class="note-inline-editor">
        <form class="note-inline-form" @submit=${this.handleNoteSubmit}>
          <cv-field ?invalid=${Boolean(noteError)}>
            <cv-textarea
              class="note-inline-input"
              dir="auto"
              name="inline-note"
              .value=${this.model.noteDraft()}
              rows="6"
              size="small"
              enter-behavior="submit"
              ?invalid=${Boolean(noteError)}
              @cv-input=${this.handleNoteInput}
              @keydown=${this.handleSectionSnippetKeyDown}
            ></cv-textarea>
            ${noteError ? html`<div slot="error" class="error-text">${noteError}</div>` : nothing}
          </cv-field>
          ${renderSectionSnippetButtons({
            onCancel: () => this.model.closeSectionSnippet(),
            onSave: () => this.handleSaveNote(),
            saving: this.model.noteSaving(),
          })}
        </form>
      </div>
    `
  }

  private handleOtpLabelInput(event: Event) {
    const otpId = (event.currentTarget as HTMLElement | null)?.dataset['otpId']
    if (!otpId) return

    const target = event.target as (HTMLInputElement & {value?: string}) | null
    const detailValue = (event as CustomEvent<{value?: string}>).detail?.value
    const value = typeof detailValue === 'string' ? detailValue : (target?.value ?? '')

    this.model.setOtpLabelDraft(otpId, value)
  }

  private renderOtpLabelEditor(otp: OTP) {
    const labelError = this.model.getOtpLabelError(otp.id)

    return html`
      <div class="otp-label-edit-row">
        <pm-entry-otp-item
          .otp=${otp}
          .removable=${false}
          @pm-entry-otp-remove=${this.handleOtpRemove}
        ></pm-entry-otp-item>
        <cv-field ?invalid=${Boolean(labelError)}>
          <span slot="label">${i18n('otp:label')}</span>
          <cv-input
            class="otp-label-input"
            name=${`otp-label-${otp.id}`}
            data-otp-id=${otp.id}
            data-otp-label-input=${otp.id}
            .value=${this.model.getOtpLabelDraft(otp)}
            autocomplete="off"
            size="small"
            ?data-has-error=${!!labelError}
            ?invalid=${Boolean(labelError)}
            @cv-input=${this.handleOtpLabelInput}
            @keydown=${this.handleInlineEditorKeyDown}
          ></cv-input>
          ${labelError ? html`<div slot="error" class="error-text">${labelError}</div>` : nothing}
        </cv-field>
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
        <section
          class="inline-section-card"
          aria-label=${i18n('otp')}
          @keydown=${this.handleSectionSnippetKeyDown}
        >
          <div class="section-head">
            <div class="section-title">
              <cv-icon name="shield-check"></cv-icon>
              <span>${i18n('otp')}</span>
              ${data.otpCount > 0
                ? html`<cv-badge class="section-count" size="small" variant="neutral"
                    >${data.otpCount}</cv-badge
                  >`
                : nothing}
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

    if (data.isEditingEntry) {
      if (!otpList.length) {
        return nothing
      }

      return html`
        <section class="inline-section-card" aria-label=${i18n('otp')}>
          <div class="section-head">
            <div class="section-title">
              <cv-icon name="shield-check"></cv-icon>
              <span>${i18n('otp')}</span>
              ${data.otpCount > 0
                ? html`<cv-badge class="section-count" size="small" variant="neutral"
                    >${data.otpCount}</cv-badge
                  >`
                : nothing}
            </div>
          </div>
          <div class="otp-codes">${otpList.map((otp) => this.renderOtpLabelEditor(otp))}</div>
        </section>
      `
    }

    return html`
      <section class="inline-section-card" aria-label=${i18n('otp')}>
        <div class="section-head">
          <div class="section-title">
            <cv-icon name="shield-check"></cv-icon>
            <span>${i18n('otp')}</span>
            ${data.otpCount > 0
              ? html`<cv-badge class="section-count" size="small" variant="neutral"
                  >${data.otpCount}</cv-badge
                >`
              : nothing}
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
    if (!data.hasSshKeys) return nothing

    return html`
      <section class="inline-section-card" aria-label=${i18n('ssh:title')}>
        <div class="section-head">
          <div class="section-title">
            <cv-icon name="key"></cv-icon>
            <span>${i18n('ssh:title')}</span>
            <cv-badge class="section-count" size="small" variant="neutral">${card.sshKeys.length}</cv-badge>
          </div>
        </div>
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
        <section
          class="inline-section-card entry-tags-section"
          aria-label=${i18n('tags:title')}
          @keydown=${this.handleSectionSnippetKeyDown}
        >
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
      <section class="inline-section-card entry-tags-section" aria-label=${i18n('tags:title')}>
        <div class="section-head">
          <div class="section-title">
            <cv-icon name="tag"></cv-icon>
            <span>${i18n('tags:title')}</span>
            ${data.tags.length > 0
              ? html`<cv-badge class="section-count" size="small" variant="neutral"
                  >${data.tags.length}</cv-badge
                >`
              : nothing}
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
                  @click=${this.handleStartTagEdit}
                  aria-label=${i18n('tags:add')}
                >
                  <cv-icon
                    slot=${data.hasTags ? nothing : 'prefix'}
                    name=${data.hasTags ? 'pencil' : 'plus'}
                    aria-hidden="true"
                  ></cv-icon>
                  ${data.hasTags ? nothing : html`<span>${i18n('tags:add')}</span>`}
                </cv-button>
              `
            : nothing}
        </div>
        ${data.hasTags
          ? renderEntryTagsReadOnly(data.tags, pmCredentialTagsModel.availableTags())
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
        <form class="payment-card-form-stack" @submit=${this.handlePaymentCardSubmit}>
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
          ${this.model.paymentCardError()
            ? html`<div class="error-text">${this.model.paymentCardError()}</div>`
            : nothing}
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

  private getEntryTypeLabel(entryType: PMEntryEditData['entryType']): string {
    return entryType === 'payment_card' ? i18n('entry:type:payment_card') : i18n('entry:type:login')
  }

  private getHeaderSupportText(data: PMEntryEditData): string {
    const primaryWebsite = data.entryType === 'login' ? data.visibleUrls[0]?.value : undefined

    return [this.getEntryTypeLabel(data.entryType), primaryWebsite].filter(Boolean).join(' • ')
  }

  private renderInspectorDetails(card: Entry, data: PMEntryEditData) {
    return html`
      <section class="entry-inspector-section entry-details-section" aria-labelledby="entry-details-heading">
        <h2 class="entry-inspector-heading" id="entry-details-heading">${i18n('entry:details')}</h2>
        <dl class="entry-details-list">
          <div class="entry-detail-row">
            <dt>${appI18n('details:location')}</dt>
            <dd><bdi dir="auto">${data.contextLabel}</bdi></dd>
          </div>
          <div class="entry-detail-row">
            <dt>${i18n('entry:type')}</dt>
            <dd>${this.getEntryTypeLabel(data.entryType)}</dd>
          </div>
          <div class="entry-detail-row">
            <dt>${i18n('ts:modified')}</dt>
            <dd>${card.updatedFormatted}</dd>
          </div>
          <div class="entry-detail-row">
            <dt>${i18n('ts:created')}</dt>
            <dd>${card.createdFormatted}</dd>
          </div>
        </dl>
      </section>
    `
  }

  private renderInspector(card: Entry, data: PMEntryEditData) {
    return html`
      <aside class="entry-inspector" aria-label=${i18n('entry:details')}>
        ${this.renderInspectorDetails(card, data)} ${this.renderTagsSection(card, data)}
        ${this.renderSecuritySummary(data.securityBadges)}
      </aside>
    `
  }

  private renderLoginPrimary(card: Entry, data: PMEntryEditData) {
    return html`
      <section class="entry-primary-section" aria-labelledby="entry-credentials-heading">
        <div class="entry-section-heading">
          <h2 id="entry-credentials-heading">${i18n('entry:credentials')}</h2>
        </div>
        <div class="fields-card ${data.isEditingEntry ? 'entry-edit-workbench' : ''}">
          ${this.renderUsernameField(card)} ${this.renderPasswordField(card)}
          ${this.renderWebsiteField(card, data)}
        </div>
      </section>
      <section class="secondary-section">
        ${this.renderOtpSection(card, data)} ${this.renderSshSection(card, data)} ${this.renderNoteDetails()}
      </section>
    `
  }

  private renderPaymentCardPrimary(card: Entry, data: PMEntryEditData) {
    return html`
      <section class="entry-primary-section" aria-labelledby="entry-payment-card-heading">
        <div class="entry-section-heading">
          <h2 id="entry-payment-card-heading">${i18n('entry:type:payment_card')}</h2>
        </div>
        <div class="fields-card">${this.renderPaymentCardSection(card, data)}</div>
      </section>
      <section class="secondary-section">${this.renderNoteDetails()}</section>
    `
  }

  private renderMainView(card: Entry) {
    const data = this.model.contracts.getEntryData(card) as PMEntryEditData
    const editLoginIdentity = data.canEditFields && data.isEditingEntry && card.entryType !== 'payment_card'

    this.style.setProperty('--pm-entry-avatar-background', data.avatarBg)

    return html`
      <article class="wrapper" role="main" aria-label=${data.entryTitleText}>
        <pm-workspace-header
          .density=${'compact'}
          .item=${card}
          .contextLabel=${data.contextLabel}
          .contextItems=${data.contextItems}
          .title=${editLoginIdentity ? this.model.inlineTitle() : data.entryTitleText}
          .titleLabel=${i18n('title')}
          .supportText=${this.getHeaderSupportText(data)}
          .avatarLetter=${data.entryAvatarLetter}
          .avatarFallbackBg=${data.avatarBg}
          .avatarIconRef=${data.isEditingEntry ? this.model.inlineIconRef() : card.iconRef}
          .avatarInteractive=${data.canEditFields && data.isEditingEntry}
          .editableTitle=${editLoginIdentity}
          .titleError=${editLoginIdentity ? this.model.inlineTitleError() : ''}
          .titlePlaceholder=${i18n('title_or_url:placeholder')}
          @pm-workspace-header-navigate=${this.onWorkspaceHeaderNavigate}
          @pm-workspace-header-title-input=${this.handleHeaderTitleInput}
          @pm-icon-change=${this.handleInlineIconChange}
          @keydown=${this.handleInlineEditorKeyDown}
        >
          ${this.renderHeaderActions()}
        </pm-workspace-header>
        <div class="entry-workspace">
          <div class="entry-main">
            ${card.entryType === 'payment_card'
              ? this.renderPaymentCardPrimary(card, data)
              : this.renderLoginPrimary(card, data)}
          </div>
          ${this.renderInspector(card, data)}
        </div>
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
