import {nothing, type TemplateResult} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'

import {i18n} from '@project/passmanager/i18n'

import {pmCredentialTagsModel} from '../../../../models/pm-credential-tags.model'
import {
  renderEntryTagsEditor,
  renderEntryTagsReadOnly,
} from '../../entry-tags/entry-tags-editor'
import type {PMEntryMobileRenderContext} from './context'
import {
  renderNoteSubmitButtons,
  renderSectionSnippetButtons,
} from './shared'

export function renderWebsiteSection(context: PMEntryMobileRenderContext) {
  if (context.card.entryType === 'payment_card') {
    return nothing
  }

  const {data, model, ui} = context
  const inlineError = model.inlineError()

  if (data.canEditWebsite && data.isEditingEntry) {
    return html`
      <section class="section-block secondary-block" aria-label=${i18n('website')}>
        <div class="section-head">
          <div class="section-title">
            <cv-icon name="globe"></cv-icon>
            <span>${i18n('website')}</span>
          </div>
        </div>
        <cv-input
          class="inline-field-input"
          name="inline-website"
          data-inline-field="website"
          .value=${model.inlineWebsite()}
          @cv-input=${ui.handleInlineEditInput}
          @keydown=${ui.handleInlineEditorKeyDown}
          size="small"
          ?data-has-error=${!!inlineError}
        >
          <span slot="label">${i18n('website:title')}</span>
        </cv-input>
      </section>
    `
  }

  if (!data.hasUrls && !data.canEditWebsite) return nothing

  return html`
    <section class="section-block secondary-block" aria-label=${i18n('website')}>
      <div class="section-head">
        <div class="section-title">
          <cv-icon name="globe"></cv-icon>
          <span>${i18n('website')}</span>
          ${data.websiteCount > 1
            ? html`<cv-badge class="section-count" size="small" variant="neutral">${data.websiteCount}</cv-badge>`
            : nothing}
        </div>
      </div>
      <div class="website-list">
        ${data.hasUrls
          ? data.visibleUrls.map(
              (url) => html`
                <div class="website-row">
                  <div class="website-content">
                    <span class="website-name">${url.value}</span>
                  </div>
                  <div class="website-actions">
                    ${url.openable
                      ? html`
                          <a
                            class="website-open"
                            href=${url.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label=${i18n('website')}
                            @click=${ui.handleOpenUrlClick}
                          >
                            <cv-icon name="box-arrow-up-right" aria-hidden="true"></cv-icon>
                            <span>${i18n('button:openSite')}</span>
                          </a>
                        `
                      : nothing}
                  </div>
                </div>
              `,
            )
          : html`<span class="website-name website-name-empty">—</span>`}
      </div>
    </section>
  `
}

export function renderTagsSection(context: PMEntryMobileRenderContext) {
  const {card, data, model, ui} = context
  const isEditing = model.sectionSnippet() === 'tags'

  if (!isEditing && !data.hasTags && !data.canEditTags) {
    return nothing
  }

  if (isEditing) {
    return html`
      <section
        class="section-block secondary-block"
        aria-label=${i18n('tags:title')}
        @keydown=${ui.handleSectionSnippetKeyDown}
      >
        <div class="section-head">
          <div class="section-title">
            <cv-icon name="tag"></cv-icon>
            <span>${i18n('tags:title')}</span>
          </div>
        </div>
        ${renderEntryTagsEditor(
          {
            tags: model.tagDraft(),
            options: pmCredentialTagsModel.availableTags(),
            comboboxType: 'select-only',
            disabled: !data.canEditTags,
            placeholder: i18n('tags:select_placeholder' as never),
          },
          {
            onSelectExistingTagIds: ui.handleTagSelect,
            onManageTags: ui.handleManageTags,
          },
        )}
        ${model.tagError() ? html`<div class="error-text">${model.tagError()}</div>` : nothing}
        ${renderSectionSnippetButtons({
          onCancel: () => model.cancelTagEdit(),
          onSave: ui.handleSaveTags,
          saving: model.tagSaving(),
        })}
      </section>
    `
  }

  return html`
    <section class="section-block secondary-block" aria-label=${i18n('tags:title')}>
      <div class="section-head">
        <div class="section-title">
          <cv-icon name="tag"></cv-icon>
          <span>${i18n('tags:title')}</span>
          ${data.tags.length > 0
            ? html`<cv-badge class="section-count" size="small" variant="neutral">${data.tags.length}</cv-badge>`
            : nothing}
        </div>
        ${data.canEditTags && data.isEditingEntry
          ? html`
              <cv-button
                class=${data.hasTags ? 'section-action edit-icon-action' : 'section-action'}
                type="button"
                ?unstyled=${data.hasTags}
                variant="default"
                size="small"
                data-snippet-section="tags"
                @click=${() => model.startTagEdit(card)}
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
        : html`<div class="empty-state" role="status"><span>${i18n('tags:empty')}</span></div>`}
    </section>
  `
}

export function renderOtpSection(context: PMEntryMobileRenderContext) {
  if (context.card.entryType === 'payment_card') {
    return nothing
  }

  const {card, data, model, ui} = context
  const isEditing = model.sectionSnippet() === 'otp'
  const otpList = card.otps()

  if (isEditing) {
    return html`
      <section
        class="section-block section-block-primary"
        aria-label=${i18n('otp')}
        @keydown=${ui.handleSectionSnippetKeyDown}
      >
        <div class="section-head">
          <div class="section-title">
            <cv-icon name="shield-check"></cv-icon>
            <span>${i18n('otp')}</span>
            ${data.otpCount > 0
              ? html`<cv-badge class="section-count" size="small" variant="neutral">${data.otpCount}</cv-badge>`
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
                    @pm-entry-otp-remove=${ui.handleOtpRemove}
                  ></pm-entry-otp-item>
                `,
              )
            : html`<span class="website-name website-name-empty">—</span>`}
        </div>
        ${model.otpError() ? html`<div class="error-text">${model.otpError()}</div>` : nothing}
      </section>
    `
  }

  if (!otpList.length) {
    return nothing
  }

  return html`
    <section class="section-block section-block-primary" aria-label=${i18n('otp')}>
      <div class="section-head">
        <div class="section-title">
          <cv-icon name="shield-check"></cv-icon>
          <span>${i18n('otp')}</span>
          ${data.otpCount > 1
            ? html`<cv-badge class="section-count" size="small" variant="neutral">${data.otpCount}</cv-badge>`
          : nothing}
        </div>
        ${data.canStartOtpSnippet
          ? html`
              <cv-button
                class="section-action"
                type="button"
                variant="default"
                size="small"
                data-snippet-section="otp"
                @click=${() => model.beginOtpSnippet(card)}
                aria-label=${i18n('otp:add')}
              >
                <cv-icon slot="prefix" name="plus" aria-hidden="true"></cv-icon>
                <span>${i18n('otp:add')}</span>
              </cv-button>
            `
          : nothing}
      </div>
      <div class="otp-codes">
        ${otpList.map(
          (otp) => html`
            <pm-entry-otp-item
              .otp=${otp}
              .removable=${false}
              @pm-entry-otp-remove=${ui.handleOtpRemove}
            ></pm-entry-otp-item>
          `,
        )}
      </div>
    </section>
  `
}

export function renderMobileNoteCardActions(options: {
  card: PMEntryMobileRenderContext['card']
  model: PMEntryMobileRenderContext['model']
  isReadOnly: boolean
  isEditingEntry: boolean
  baseActions: TemplateResult | typeof nothing
}) {
  const {model, isEditingEntry, baseActions} = options

  if (model.sectionSnippet() === 'note') {
    return nothing
  }

  if (isEditingEntry) {
    return nothing
  }

  return baseActions
}

export function renderSshSection(context: PMEntryMobileRenderContext) {
  if (context.card.entryType === 'payment_card') {
    return nothing
  }

  const {card, data, model, ui} = context
  if (!data.hasSshKeys) return nothing

  return html`
    <section
      class="section-block secondary-block"
      aria-label=${i18n('ssh:title')}
    >
      <div class="section-head">
        <div class="section-title">
          <cv-icon name="key"></cv-icon>
          <span>${i18n('ssh:title')}</span>
          ${data.hasSshKeys
            ? html`<cv-badge class="section-count" size="small" variant="neutral">${card.sshKeys.length}</cv-badge>`
            : nothing}
        </div>
        ${data.canStartSshSnippet
          ? html`
              <cv-button
                class=${data.hasSshKeys ? 'section-action edit-icon-action' : 'section-action'}
                type="button"
                ?unstyled=${data.hasSshKeys}
                variant="default"
                size="small"
                data-snippet-section="ssh"
                data-ssh-mode="add"
                @click=${() => model.openSshGenerator(card)}
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
                    .publicKey=${model.state.sshPublicKeys()[key.id] ?? ''}
                    .publicKeyProvider=${async () => (await card.sshPublicKey(key.id)) ?? ''}
                    .removable=${data.canManageSsh && !data.isEditingEntry}
                    @pm-entry-ssh-key-remove=${ui.handleSshKeyRemove}
                  ></pm-entry-ssh-key>
                `,
              )}
            </div>
          `
        : nothing}
      ${model.sshError() ? html`<div class="error-text">${model.sshError()}</div>` : nothing}
    </section>
  `
}

export function renderInlineNoteEditor(context: PMEntryMobileRenderContext) {
  const {model, ui} = context
  const noteError = model.noteError()

  return html`
    <div class="note-inline-editor">
      <form class="note-inline-form" @submit=${ui.handleNoteSubmit}>
        <cv-textarea
          class="note-inline-input"
          name="inline-note"
          .value=${model.noteDraft()}
          rows="4"
          size="small"
          enter-behavior="submit"
          @cv-input=${ui.handleNoteInput}
          @keydown=${ui.handleNoteEditorKeyDown}
        >
          ${noteError ? html`<div slot="help-text" class="error-text">${noteError}</div>` : nothing}
        </cv-textarea>
        ${renderNoteSubmitButtons({onCancel: () => model.closeSectionSnippet(), saving: model.noteSaving()})}
      </form>
    </div>
  `
}
