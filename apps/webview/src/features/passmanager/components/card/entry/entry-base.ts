import {html, nothing, type PropertyValues} from 'lit'
import {ifDefined} from 'lit/directives/if-defined.js'
import {XLitElement} from '@statx/lit'
import {motionPrimitiveStyles} from 'root/shared/ui/shared-styles'

import {Entry, i18n} from '@project/passmanager'
import type {CVIcon} from '@chromvoid/uikit'

import type {CopyButton} from '../../button-copy'
import type {ButtonBack} from '../../list/back-button'
import {FileViewer} from '../../viewer'
import type {PMEntryEdit} from '../entry-edit'
import {PMEntryMove} from '../pm-entry-move'
import type {PMEntryMove as PMEntryMoveType} from '../pm-entry-move'
import type {PMEntryOTP} from '../pm-entry-otp'
import {PMEntrySshKeys} from '../entry-ssh/entry-ssh-keys'
import {PMEntrySshKey} from '../entry-ssh/entry-ssh-key'
import {PMEntryModel} from './entry.model'
import {entrySharedStyles, pmEntryCardStyles, pmEntryGenerateStyles} from './styles'
import {pmSharedStyles} from '../../../styles/shared'

export class PMEntryBase extends XLitElement {
  static properties = {
    entry: {attribute: false},
    editing: {type: Boolean},
  }

  declare entry: Entry | null
  declare editing: boolean

  static define() {
    customElements.define('pm-entry', this)
    PMEntryMove.define()
    PMEntrySshKeys.define()
    PMEntrySshKey.define()
    FileViewer.define()
  }

  static styles = [
    ...pmSharedStyles,
    pmEntryCardStyles,
    pmEntryGenerateStyles,
    motionPrimitiveStyles,
    entrySharedStyles,
  ]

  protected readonly model = new PMEntryModel()

  connectedCallback() {
    super.connectedCallback()
    this.addEventListener('keydown', this.onKeyDown)
  }

  protected override willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties)
    if (this.entry instanceof Entry) {
      this.model.attach(this.entry)
      return
    }

    if (changedProperties.has('entry')) {
      this.model.detach()
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this.removeEventListener('keydown', this.onKeyDown)
    this.model.disconnect()
  }

  protected password() {
    return this.model.password()
  }

  protected note() {
    return this.model.note()
  }

  protected isNoteDetailsOpen() {
    return this.model.isNoteDetailsOpen()
  }

  onEditEnd() {
    this.model.onEditEnd()
  }

  async moveCard(entry: Entry) {
    await this.model.moveCard(entry)
  }

  protected isNoteLoading() {
    return this.model.isNoteLoading()
  }

  protected renderNote() {
    const noteResource = this.model.noteResource()
    const noteContent = this.note()
    const isLoading = noteResource.status === 'idle' || noteResource.status === 'loading'
    const isReadOnly = window.passmanager?.isReadOnly() ?? false
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
      return html`
        <button
          class="empty-state empty-state-action"
          type="button"
          @click=${this.onStartEdit}
          ?disabled=${isReadOnly}
          aria-label=${i18n('button:edit')}
        >
          <cv-icon name="pencil" aria-hidden="true"></cv-icon>
          <span>${i18n('entry:note:empty_hint')}</span>
        </button>
      `
    }

    return html`
      <div class="note-content" role="textbox" aria-readonly="true" tabindex="-1">${noteContent}</div>
    `
  }

  protected renderUsernameField(card: Entry) {
    return html`
      <div class="credential-field">
        <div class="field-content">
          <span class="field-label">${i18n('username')}</span>
          <span class="field-value ${card.username ? '' : 'empty'}">${card.username || '—'}</span>
        </div>
        <div class="field-actions">
          ${card.username ? html`<cv-copy-button .value=${card.username} size="small"></cv-copy-button>` : nothing}
        </div>
      </div>
    `
  }

  protected renderPasswordField(card: Entry) {
    const passwordResource = this.model.passwordResource()
    const isLoading = passwordResource.status === 'idle' || passwordResource.status === 'loading'
    const isReady = passwordResource.status === 'ready'

    return html`
      <div class="credential-field">
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
                  >
                  </cv-input>
                `
              : html`
                  <span class="field-value ${passwordResource.status === 'error' ? 'error' : 'empty'}">
                    ${passwordResource.status === 'error' ? i18n('entry:secret:unavailable') : '—'}
                  </span>
                `}
        </div>
        <div class="field-actions">
          ${isReady
            ? html`<cv-copy-button size="small" .value=${this.model.getPasswordValueProvider(card)}></cv-copy-button>`
            : nothing}
        </div>
      </div>
    `
  }

  protected renderUrlButtons(urls: ReturnType<PMEntryModel['getEntryData']>['visibleUrls']) {
    return urls.map((url) => {
      return html`
        <cv-link
          class="url-link"
          href=${ifDefined(url.openable ? url.href : undefined)}
          aria-label=${i18n('website')}
        >
          <span class="website-name">${url.value}</span>
          ${url.openable ? html`<cv-icon name="box-arrow-up-right" slot="suffix" aria-hidden="true"></cv-icon>` : nothing}
        </cv-link>
      `
    })
  }

  protected renderSshKeySection(card: Entry) {
    if (card.sshKeys.length === 0) return nothing

    return html`
      <pm-entry-ssh-keys .keys=${card.sshKeys} .publicKeys=${this.model.sshPublicKeys()}></pm-entry-ssh-keys>
    `
  }

  protected renderNoteDetails() {
    const noteResource = this.model.noteResource()
    const noteContent = this.note()
    const isLoading = noteResource.status === 'idle' || noteResource.status === 'loading'

    return html`
      <div class="note-card">
        <div class="card-header">
          <div class="card-title">
            <cv-icon name="sticky-note"></cv-icon>
            ${i18n('note:title')}
          </div>
          ${isLoading
            ? html`<span class="note-spinner" aria-label=${i18n('loading')}></span>`
            : noteResource.status === 'ready'
              ? html`<cv-copy-button class="note-cv-copy-button" size="small" .value=${noteContent} aria-label=${i18n('button:copy')}></cv-copy-button>`
              : nothing}
        </div>
        <div class="card-content">${this.renderNote()}</div>
      </div>
    `
  }

  protected renderMetadata(card: Entry, hasOtps: boolean) {
    return html`
      <div class="meta-footer-items">
        <span class="meta-item">
          <cv-icon name="pencil-square"></cv-icon>
          <time datetime=${card.updatedTs}>${card.updatedFormatted}</time>
        </span>
        <span class="meta-divider">&bull;</span>
        <span class="meta-item">
          <cv-icon name="calendar-plus"></cv-icon>
          <time datetime=${card.createdTs}>${card.createdFormatted}</time>
        </span>
      </div>
    `
  }

  protected onOpenFirstUrl() {
    const entry = this.getCurrentEntry()
    if (!entry) return
    this.model.openFirstUrl(entry)
  }

  protected onQuickCopyUsername() {
    const entry = this.getCurrentEntry()
    if (!entry) return
    this.model.copyUsername(entry)
  }

  protected async onQuickCopyPassword() {
    const entry = this.getCurrentEntry()
    if (!entry) return
    await this.model.copyPassword(entry)
  }

  protected async onQuickCopyOTP() {
    const entry = this.getCurrentEntry()
    if (!entry) return
    await this.model.copyOTP(entry)
  }

  protected onStartEdit() {
    this.model.startEdit()
  }

  protected onMoveCurrent() {
    const entry = this.getCurrentEntry()
    if (!entry) return
    void this.model.moveCard(entry)
  }

  protected onRemoveCurrent() {
    const entry = this.getCurrentEntry()
    if (!entry) return
    this.model.removeEntry(entry)
  }

  triggerEditAction(): void {
    this.onStartEdit()
  }

  triggerMoveAction(): void {
    this.onMoveCurrent()
  }

  triggerDeleteAction(): void {
    this.onRemoveCurrent()
  }

  protected onNoteToggle(event: Event) {
    this.model.onNoteToggle(event)
  }

  protected onKeyDown(event: KeyboardEvent) {
    const entry = this.getCurrentEntry()
    if (!entry) return
    this.model.onKeyDown(entry, event)
  }

  protected getCurrentEntry(): Entry | null {
    return this.entry instanceof Entry ? this.entry : null
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'cv-icon': CVIcon
    'cv-copy-button': CopyButton

    'pm-entry-move': PMEntryMoveType
    'pm-entry-edit': PMEntryEdit
    'pm-entry-otp': PMEntryOTP
    'pm-entry-ssh-keys': PMEntrySshKeys
    'back-button': ButtonBack
  }
}
