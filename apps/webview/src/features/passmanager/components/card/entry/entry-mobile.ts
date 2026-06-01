import {nothing, type PropertyValues} from 'lit'
import {createAfterRenderScheduler, html} from '@chromvoid/uikit/reatom-lit'

import {CVInput} from '@chromvoid/uikit/components/cv-input'
import {CVTextarea, type CVTextareaInputEvent} from '@chromvoid/uikit/components/cv-textarea'
import {Entry, OTP} from '@project/passmanager/core'
import {i18n} from '@project/passmanager/i18n'
import {isPassmanagerReadOnlyOrMissing} from '../../../models/pm-root.adapter'

import {PMAvatarIcon} from '../../pm-avatar-icon'
import {PMIconPickerMobile} from '../../pm-icon-picker.mobile'
import {PMEntryBase} from './entry-base'
import {
  openHeaderAvatarPickerAfterUpdate,
  renderHeaderIdentity,
  renderInlineNoteEditor,
  renderMobileNoteCardActions,
  renderPaymentCardPrimarySection,
  renderMobilePasswordField,
  renderMobileUsernameField,
  renderEditEntryAction,
  renderQuickActions,
  renderEntryViewAddActions,
  renderOtpSection,
  renderTagsSection,
  renderSshSection,
  renderWebsiteSection,
  scheduleEntryEditFieldFocus,
  scheduleInlineEditorFocus,
  scheduleSectionSnippetFocus,
  type PMEntryMobileRenderContext,
  type PMEntryMobileUIAdapter,
} from './mobile'
import {
  PMEntryEditModel,
  type PMEntryCredentialEditField,
  type PMEntryEditData,
  type PMEntryInlineField,
  type PMEntrySectionSnippet,
} from './entry-edit.model'
import type {PMEntrySecretResource} from './entry-session.model'
import {entryMobileStyles, paymentCardFaceMobileStyles} from './styles'
import {PMEntryOTPCreate, PMEntryOTPCreateSheet} from '../entry-otp-create'
import {
  getSelectedTagIdsFromEvent,
  getTagInputValueFromEvent,
} from '../entry-tags/entry-tags-editor'
import {pmEntryTagsStyles} from '../entry-tags/entry-tags.styles'
import {PMEntrySshCreateSheet} from '../entry-ssh/entry-ssh-create-sheet'
import {PMEntrySshKey} from '../entry-ssh/entry-ssh-key'
import {PMEntryOTPItem} from '../pm-entry-otp-item'

export class PMEntryMobile extends PMEntryBase {
  protected override readonly model = new PMEntryEditModel()
  private readonly afterRenderScheduler = createAfterRenderScheduler(this)
  private renderedInlineField: PMEntryInlineField | null = null
  private renderedSectionSnippet: PMEntrySectionSnippet | null = null
  private renderedEntryEditFocusToken = 0
  private currentRenderContext: PMEntryMobileRenderContext | null = null

  static define() {
    if (!customElements.get('pm-entry-mobile')) {
      customElements.define('pm-entry-mobile', this)
      CVInput.define()
      CVTextarea.define()
      PMEntryOTPCreate.define()
      PMEntryOTPCreateSheet.define()
      PMEntryOTPItem.define()
      PMIconPickerMobile.define()
      PMEntrySshCreateSheet.define()
      PMEntrySshKey.define()
      PMAvatarIcon.define()
    }
  }

  static styles = [...PMEntryBase.styles, pmEntryTagsStyles, paymentCardFaceMobileStyles, entryMobileStyles]

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
      scheduleEntryEditFieldFocus(this.afterRenderScheduler, () => this.shadowRoot, entryEditFocusRequest.field)
    }
  }

  override disconnectedCallback(): void {
    this.afterRenderScheduler.cancel()
    this.currentRenderContext = null
    this.model.resetRequestedSurface()
    this.model.clearEntryEditTap()
    super.disconnectedCallback()
  }

  override onEditEnd() {
    this.model.clearEditIntent()
    this.currentRenderContext = null
    this.model.clearEntryEditTap()
    super.onEditEnd()
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

  private getEntryEditTapPoint(event: PointerEvent): {x: number; y: number; pointerId: number} | null {
    if (event.pointerType !== 'touch') {
      return null
    }

    return {x: event.clientX, y: event.clientY, pointerId: event.pointerId}
  }

  private handleCredentialTapStart(event: PointerEvent, field: PMEntryCredentialEditField) {
    if (!(this.entry instanceof Entry)) return

    const point = this.getEntryEditTapPoint(event)
    if (!point) return

    this.model.startCredentialEditTap(this.entry, field, point, point.pointerId)
  }

  private handleEntryEditTapMove(event: PointerEvent) {
    const point = this.getEntryEditTapPoint(event)
    if (!point) return

    this.model.moveEntryEditTap(point, point.pointerId)
  }

  private handleCredentialTapEnd(event: PointerEvent) {
    if (!(this.entry instanceof Entry)) return

    const point = this.getEntryEditTapPoint(event)
    if (!point) return

    if (this.model.endCredentialEditTap(point, point.pointerId, this.entry)) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  private handleEntryEditTapCancel() {
    this.model.cancelEntryEditTap()
  }

  private handleCredentialDoubleTap(event: Event, field: PMEntryCredentialEditField) {
    if (!(this.entry instanceof Entry)) return

    event.preventDefault()
    event.stopPropagation()
    this.model.beginCredentialEntryEdit(this.entry, field)
  }

  private handleTitleEntryTapStart(event: PointerEvent) {
    if (!(this.entry instanceof Entry)) return

    const point = this.getEntryEditTapPoint(event)
    if (!point) return

    this.model.startTitleEntryEditTap(this.entry, point, point.pointerId)
  }

  private handleTitleEntryTapEnd(event: PointerEvent) {
    if (!(this.entry instanceof Entry)) return

    const point = this.getEntryEditTapPoint(event)
    if (!point) return

    if (this.model.endTitleEntryEditTap(point, point.pointerId, this.entry)) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  private handleTitleEntryDoubleTap(event: Event) {
    if (!(this.entry instanceof Entry)) return

    event.preventDefault()
    event.stopPropagation()
    this.model.beginTitleEntryEdit(this.entry)
  }

  private handleNoteEntryTapStart(event: PointerEvent) {
    if (!(this.entry instanceof Entry)) return

    const point = this.getEntryEditTapPoint(event)
    if (!point) return

    this.model.startNoteEntryEditTap(this.entry, point, point.pointerId)
  }

  private handleNoteEntryTapEnd(event: PointerEvent) {
    if (!(this.entry instanceof Entry)) return

    const point = this.getEntryEditTapPoint(event)
    if (!point) return

    if (this.model.endNoteEntryEditTap(point, point.pointerId, this.entry)) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  private handleNoteEntryDoubleTap(event: Event) {
    if (!(this.entry instanceof Entry)) return

    event.preventDefault()
    event.stopPropagation()
    this.model.beginNoteEntryEdit(this.entry)
  }

  private handleInlineIconChange(event: CustomEvent<{iconRef: string | undefined}>) {
    if (!(this.entry instanceof Entry)) return
    if (this.currentRenderContext?.data.isEditingEntry) {
      this.model.setInlineIconRef(event.detail.iconRef)
      return
    }

    void this.model.saveInlineIcon(this.entry, event.detail.iconRef)
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
    if (this.currentRenderContext?.data.isEditingEntry) {
      this.handleCancelEntryEdit()
      return
    }

    this.model.cancelInlineEdit()
  }

  private handleNoteEditorKeyDown(event: KeyboardEvent) {
    if (!this.isPlainEscapeKey(event)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    this.model.closeSectionSnippet()
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

  private handleCancelEntryEdit() {
    if (!(this.entry instanceof Entry)) return
    this.model.cancelEntryEdit(this.entry)
  }

  private handleSaveEntryEdit() {
    if (!(this.entry instanceof Entry)) return
    void this.model.saveEntryEdit(this.entry)
  }

  private handleAddMissingOtpInEntryView() {
    if (!(this.entry instanceof Entry)) return
    this.model.beginOtpSnippet(this.entry)
  }

  private handleAddMissingSshInEntryView() {
    if (!(this.entry instanceof Entry)) return
    this.model.openSshGenerator(this.entry)
  }

  private handleNoteSubmit(event: Event) {
    event.preventDefault()
    this.handleSaveNote()
  }

  private handleNoteInput(event: CVTextareaInputEvent) {
    this.model.setNoteDraft(event.detail.value)
  }

  private handleSaveNote() {
    if (!(this.entry instanceof Entry)) return
    void this.model.saveNoteEdit(this.entry)
  }

  private handleStartNoteEntryEdit() {
    if (!(this.entry instanceof Entry)) return
    this.model.beginEntryEdit(this.entry, 'note')
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

  private handleTagInput(event: Event) {
    this.model.setTagInput(getTagInputValueFromEvent(event))
  }

  private handleTagAdd(event: Event) {
    event.preventDefault()
    this.model.addTagDraft()
  }

  private handleSaveTags() {
    if (!(this.entry instanceof Entry)) return
    void this.model.saveTagEdit(this.entry)
  }

  private handleToggleCardCvv() {
    this.model.actions.toggleCardCvvRevealed()
  }

  private handleHeaderAvatarAction() {
    if (!(this.entry instanceof Entry)) return

    this.model.beginInlineIconEdit(this.entry)
    openHeaderAvatarPickerAfterUpdate(this)
  }

  private handleOtpSave() {
    if (!(this.entry instanceof Entry)) return

    void this.model.saveOtpSnippet(this.entry)
  }

  private handleOtpSheetClose() {
    this.model.closeSectionSnippet()
  }

  private handleOtpRemove(event: CustomEvent<{otpId: string}>) {
    if (!(this.entry instanceof Entry)) return

    const otp = this.entry.otps().find((candidate) => candidate.id === event.detail.otpId)
    if (!(otp instanceof OTP)) return

    void this.model.removeOtp(otp)
  }

  private handleGenerateSshKeyRequest(_event?: Event) {
    if (!(this.entry instanceof Entry)) return
    void this.model.generateSshKey(this.entry)
  }

  private handleSshSheetClose() {
    this.model.cancelSshGenerator()
  }

  private handleSshSheetPrimary() {
    const result = this.model.sshResult()
    if (result && !result.pending) {
      void this.model.copyGeneratedSshPublicKey()
      return
    }

    this.handleGenerateSshKeyRequest()
  }

  private handleSshSheetDone() {
    this.model.closeSectionSnippet()
  }

  private async handleSshKeyRemove(event: CustomEvent<{keyId: string}>) {
    if (!(this.entry instanceof Entry)) return

    await this.model.removeSshKey(this.entry, event.detail.keyId)
  }

  private createRenderContext(card: Entry): PMEntryMobileRenderContext {
    const data = this.model.contracts.getEntryData(card) as PMEntryEditData
    const ui: PMEntryMobileUIAdapter = {
      handleQuickCopyUsername: () => this.onQuickCopyUsername(),
      handleQuickCopyPassword: () => void this.onQuickCopyPassword(),
      handleOpenFirstUrl: () => this.onOpenFirstUrl(),
      handleOpenUrlClick: (event) => this.onUrlClick(event),
      handleStartEdit: () => this.onStartEdit(),
      handleCancelEntryEdit: () => this.handleCancelEntryEdit(),
      handleSaveEntryEdit: () => this.handleSaveEntryEdit(),
      handleAddMissingOtpInEntryView: () => this.handleAddMissingOtpInEntryView(),
      handleAddMissingSshInEntryView: () => this.handleAddMissingSshInEntryView(),
      handleHeaderAvatarAction: () => this.handleHeaderAvatarAction(),
      handleInlineIconChange: (event) => this.handleInlineIconChange(event),
      handleInlineEditInput: (event) => this.handleInlineEditInput(event),
      handleInlineEditSubmit: (event) => this.handleInlineEditSubmit(event),
      handleSaveInlineEdit: () => this.handleSaveInlineEdit(),
      handleInlineEditorKeyDown: (event) => this.handleInlineEditorKeyDown(event),
      handleInlinePasswordLengthInput: (event) => this.handleInlinePasswordLengthInput(event),
      handleCredentialTapStart: (event, field) => this.handleCredentialTapStart(event, field),
      handleCredentialTapMove: (event) => this.handleEntryEditTapMove(event),
      handleCredentialTapEnd: (event) => this.handleCredentialTapEnd(event),
      handleCredentialTapCancel: () => this.handleEntryEditTapCancel(),
      handleCredentialDoubleTap: (event, field) => this.handleCredentialDoubleTap(event, field),
      handleTitleEntryTapStart: (event) => this.handleTitleEntryTapStart(event),
      handleTitleEntryTapMove: (event) => this.handleEntryEditTapMove(event),
      handleTitleEntryTapEnd: (event) => this.handleTitleEntryTapEnd(event),
      handleTitleEntryTapCancel: () => this.handleEntryEditTapCancel(),
      handleTitleEntryDoubleTap: (event) => this.handleTitleEntryDoubleTap(event),
      handleNoteSubmit: (event) => this.handleNoteSubmit(event),
      handleNoteInput: (event) => this.handleNoteInput(event),
      handleSaveNote: () => this.handleSaveNote(),
      handleNoteEditorKeyDown: (event) => this.handleNoteEditorKeyDown(event),
      handlePaymentCardInput: (event) => this.handlePaymentCardInput(event),
      handleSavePaymentCard: () => this.handleSavePaymentCard(),
      handleToggleCardCvv: () => this.handleToggleCardCvv(),
      handleTagSelect: (event) => this.handleTagSelect(event),
      handleTagInput: (event) => this.handleTagInput(event),
      handleTagAdd: (event) => this.handleTagAdd(event),
      handleSaveTags: () => this.handleSaveTags(),
      handleOtpSave: () => this.handleOtpSave(),
      handleOtpRemove: (event) => this.handleOtpRemove(event),
      handleSectionSnippetKeyDown: (event) => this.handleSectionSnippetKeyDown(event),
      handleGenerateSshKeyRequest: (event) => this.handleGenerateSshKeyRequest(event),
      handleSshKeyRemove: (event) => this.handleSshKeyRemove(event),
    }

    return {
      card,
      data,
      model: this.model,
      ui,
    }
  }

  protected override renderNoteCardActions(noteResource: PMEntrySecretResource, noteContent: string) {
    const card = this.entry
    if (!(card instanceof Entry)) {
      return super.renderNoteCardActions(noteResource, noteContent)
    }

    return renderMobileNoteCardActions({
      card,
      model: this.model,
      isReadOnly: isPassmanagerReadOnlyOrMissing(),
      isEditingEntry: this.currentRenderContext?.data.isEditingEntry ?? false,
      baseActions: super.renderNoteCardActions(noteResource, noteContent),
    })
  }

  protected override onStartNoteEdit() {
    if (!(this.entry instanceof Entry)) return
    this.model.beginNoteEdit(this.entry)
  }

  protected override renderNote() {
    if (this.model.sectionSnippet() !== 'note') {
      const noteResource = this.model.state.noteResource()
      const noteContent = this.model.state.note()
      const isEditingEntry = this.currentRenderContext?.data.isEditingEntry ?? false
      if (isEditingEntry) {
        return html`
          <cv-textarea
            class="note-inline-input entry-edit-note-input"
            name="inline-note"
            .value=${this.model.noteDraft()}
            rows="4"
            size="small"
            @cv-input=${this.handleNoteInput}
            @keydown=${this.handleInlineEditorKeyDown}
          ></cv-textarea>
        `
      }
      const isEmptyNoteReady = noteResource.status === 'ready' || noteResource.status === 'missing'
      if (isEmptyNoteReady && !noteContent && !isEditingEntry) {
        return html`
          <cv-button
            unstyled
            class="empty-state empty-state-action"
            type="button"
            @click=${this.handleStartNoteEntryEdit}
            ?disabled=${isPassmanagerReadOnlyOrMissing()}
            aria-label=${i18n('button:edit')}
          >
            <span>${i18n('entry:note:empty_hint')}</span>
          </cv-button>
        `
      }
      if (noteContent && !isEditingEntry) {
        const isReadOnly = isPassmanagerReadOnlyOrMissing()
        return html`
          <div
            class="note-content"
            role="textbox"
            aria-readonly="true"
            tabindex="-1"
            data-note-entry-edit=${isReadOnly ? nothing : 'note'}
            @pointerdown=${isReadOnly ? undefined : this.handleNoteEntryTapStart}
            @pointermove=${isReadOnly ? undefined : this.handleEntryEditTapMove}
            @pointerup=${isReadOnly ? undefined : this.handleNoteEntryTapEnd}
            @pointercancel=${isReadOnly ? undefined : this.handleEntryEditTapCancel}
            @dblclick=${isReadOnly ? undefined : this.handleNoteEntryDoubleTap}
          >${noteContent}</div>
        `
      }
      return super.renderNote()
    }

    const card = this.entry
    if (!(card instanceof Entry)) {
      return super.renderNote()
    }

    return renderInlineNoteEditor(this.currentRenderContext ?? this.createRenderContext(card))
  }

  private renderMobileContent(card: Entry) {
    const context = this.createRenderContext(card)
    this.currentRenderContext = context

    this.style.setProperty('--entry-avatar-bg', context.data.avatarBg)

    return html`
      <div class="entry-shell">
        <div class="entry-scroll">
          <article class="wrapper" role="main" aria-label=${context.data.title}>
            <header class="entry-header">
              ${renderHeaderIdentity(context)}
            </header>
            ${renderEntryViewAddActions(context)}
            ${card.entryType === 'payment_card' ? null : renderQuickActions(context)}

            ${card.entryType === 'payment_card'
              ? html`
                  ${renderPaymentCardPrimarySection(context)}
                  <section class="secondary-stack">
                    ${renderTagsSection(context)}
                    <div class="secondary-card note-card note-card-demoted">${this.renderNoteDetails()}</div>
                  </section>
                `
              : html`
                  <section class="primary-card">
                    ${renderMobileUsernameField(context)}
                    <div class="field-divider"></div>
                    ${renderMobilePasswordField(context)}
                  </section>

                  ${renderOtpSection(context)} ${renderWebsiteSection(context)}

                  <section class="secondary-stack">
                    ${renderTagsSection(context)}
                    <div class="secondary-card note-card note-card-demoted">${this.renderNoteDetails()}</div>
                    ${renderSshSection(context)}
                  </section>
                `}
          </article>
        </div>
        ${renderEditEntryAction(context)}
        <pm-entry-otp-create-sheet
          .model=${this.model.otpDraft}
          .open=${this.model.sectionSnippet() === 'otp'}
          .saving=${this.model.otpSaving()}
          .title=${i18n('otp:add')}
          .description=${i18n('otp:sheet:description', {title: context.data.title})}
          .primaryLabel=${i18n('otp:save')}
          @pm-entry-otp-create-sheet-close=${this.handleOtpSheetClose}
          @pm-entry-otp-create-sheet-primary=${this.handleOtpSave}
        ></pm-entry-otp-create-sheet>
        <pm-entry-ssh-create-sheet
          .model=${this.model.sshDraft}
          .open=${this.model.sectionSnippet() === 'ssh' && this.model.sshGeneratorOpen()}
          .saving=${this.model.sshGenerating()}
          .title=${this.model.sshResult() && !this.model.sshResult()?.pending
            ? i18n('ssh:result:title')
            : i18n('ssh:add')}
          .description=${this.model.sshResult() && !this.model.sshResult()?.pending
            ? i18n('ssh:result:description')
            : i18n('ssh:sheet:description:entry', {title: context.data.title})}
          .primaryLabel=${this.model.sshResult() && !this.model.sshResult()?.pending
            ? i18n('ssh:copy_public_key')
            : i18n('ssh:generate')}
          .doneLabel=${i18n('button:done')}
          @pm-entry-ssh-create-sheet-close=${this.handleSshSheetClose}
          @pm-entry-ssh-create-sheet-primary=${this.handleSshSheetPrimary}
          @pm-entry-ssh-create-sheet-done=${this.handleSshSheetDone}
        ></pm-entry-ssh-create-sheet>
      </div>
    `
  }

  render() {
    const card = this.entry
    this.currentRenderContext = null

    if (!(card instanceof Entry)) {
      return html`<div role="alert">${i18n('entry:no_info')}</div>`
    }

    this.model.getRequestedSurfaceFromEditor(card)
    return this.renderMobileContent(card)
  }

  protected override onStartEdit() {
    if (!(this.entry instanceof Entry)) return
    this.model.beginEntryEdit(this.entry)
  }
}
