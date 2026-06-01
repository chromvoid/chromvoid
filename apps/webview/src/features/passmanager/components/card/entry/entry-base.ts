import {nothing, type PropertyValues} from 'lit'
import {ifDefined} from 'lit/directives/if-defined.js'
import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {Entry} from '@project/passmanager/core'
import {i18n} from '@project/passmanager/i18n'
import type {CVIcon} from '@chromvoid/uikit/components/cv-icon'
import type {CVCopyButton} from '@chromvoid/uikit/components/cv-copy-button'
import {CVInput} from '@chromvoid/uikit/components/cv-input'
import {CVTextarea} from '@chromvoid/uikit/components/cv-textarea'
import {CVToolbar} from '@chromvoid/uikit/components/cv-toolbar'
import {CVToolbarItem} from '@chromvoid/uikit/components/cv-toolbar-item'

import {getPMDesktopToolbarKey, renderPMDesktopToolbarItems} from '../../desktop-toolbar'
import type {ButtonBack} from '../../list/back-button'
import {FileViewer} from '../../viewer'
import {renderPMCopyButton} from '../../pm-copy-button'
import {pmEntryEditorModel} from '../../../models/pm-entry-editor.model'
import {isPassmanagerReadOnly} from '../../../models/pm-root.adapter'
import {passmanagerNavigationController} from '../../../passmanager-navigation.controller'
import {PMEntryOTPCreate} from '../entry-otp-create'
import {PMEntryMove} from '../pm-entry-move'
import type {PMEntryMove as PMEntryMoveType} from '../pm-entry-move'
import type {PMEntryOTP} from '../pm-entry-otp'
import {PMEntryOTPItem} from '../pm-entry-otp-item'
import {PMWorkspaceHeader} from '../pm-workspace-header'
import {PMEntrySshGenerator} from '../entry-ssh/entry-ssh-generator'
import {PMEntrySshKeys} from '../entry-ssh/entry-ssh-keys'
import {PMEntrySshKey} from '../entry-ssh/entry-ssh-key'
import {PMEntryModel, type PMEntryActionUrl} from './entry.model'
import type {PMEntrySecretResource} from './entry-session.model'
import {entrySharedStyles, paymentCardFaceStyles} from './styles'
import {pmSharedStyles} from '../../../styles/shared'

export class PMEntryBase extends ReatomLitElement {
  static properties = {
    entry: {attribute: false},
    editing: {type: Boolean},
    showBackButton: {type: Boolean, attribute: 'show-back-button'},
    showHeaderActions: {type: Boolean, attribute: 'show-header-actions'},
  }

  declare entry: Entry | null
  declare editing: boolean
  declare showBackButton: boolean
  declare showHeaderActions: boolean

  static define() {
    if (!customElements.get('pm-entry')) {
      customElements.define('pm-entry', this)
    }
    CVToolbarItem.define()
    CVToolbar.define()
    CVInput.define()
    CVTextarea.define()
    PMEntryMove.define()
    PMEntryOTPCreate.define()
    PMEntryOTPItem.define()
    PMEntrySshGenerator.define()
    PMEntrySshKeys.define()
    PMEntrySshKey.define()
    PMWorkspaceHeader.define()
    FileViewer.define()
  }

  static styles = [
    ...pmSharedStyles,
    entrySharedStyles,
    paymentCardFaceStyles,
  ]

  protected readonly model = new PMEntryModel()

  constructor() {
    super()
    this.showBackButton = true
    this.showHeaderActions = true
  }

  connectedCallback() {
    super.connectedCallback()
    this.addEventListener('keydown', this.onKeyDown)
  }

  protected override willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties)
    if (this.entry instanceof Entry) {
      this.model.actions.attach(this.entry)
      return
    }

    if (changedProperties.has('entry')) {
      this.model.actions.detach()
    }
  }

  disconnectedCallback() {
    this.removeEventListener('keydown', this.onKeyDown)
    const currentEntry = this.getCurrentEntry()
    if (currentEntry && pmEntryEditorModel.isActiveForEntry(currentEntry.id)) {
      pmEntryEditorModel.closeSurface(currentEntry.id)
    }
    this.model.actions.disconnect()
    super.disconnectedCallback()
  }

  onEditEnd() {
    this.model.actions.onEditEnd()
  }

  async moveCard(entry: Entry) {
    await this.model.actions.moveCard(entry)
  }

  protected renderNote() {
    const noteResource = this.model.state.noteResource()
    const noteContent = this.model.state.note()
    const isLoading = noteResource.status === 'idle' || noteResource.status === 'loading'
    const isReadOnly = isPassmanagerReadOnly()
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
        <cv-button unstyled
          class="empty-state empty-state-action"
          type="button"
          @click=${this.onStartNoteEdit}
          ?disabled=${isReadOnly}
          aria-label=${i18n('button:edit')}
        >
          <cv-icon slot="prefix" name="pencil" aria-hidden="true"></cv-icon>
          <span>${i18n('entry:note:empty_hint')}</span>
        </cv-button>
      `
    }

    return html`
      <div
        class="note-content"
        role="textbox"
        aria-readonly="true"
        tabindex="-1"
        @dblclick=${isReadOnly ? undefined : this.onStartNoteEdit}
      >${noteContent}</div>
    `
  }

  protected renderNoteCardActions(noteResource: PMEntrySecretResource, noteContent: string) {
    const isLoading = noteResource.status === 'idle' || noteResource.status === 'loading'
    if (isLoading) {
      return html`<span class="note-spinner" aria-label=${i18n('loading')}></span>`
    }

    if (noteResource.status === 'ready') {
      return renderPMCopyButton({
        className: 'note-cv-copy-button',
        size: 'small',
        value: noteContent,
        ariaLabel: i18n('button:copy'),
      })
    }

    return nothing
  }

  protected renderUsernameField(card: Entry) {
    return html`
      <div class="credential-field">
        <div class="field-content">
          <span class="field-label">${i18n('username')}</span>
          <span class="field-value ${card.username ? '' : 'empty'}">${card.username || '—'}</span>
        </div>
        <div class="field-actions">
          ${card.username ? renderPMCopyButton({value: card.username, size: 'small'}) : nothing}
        </div>
      </div>
    `
  }

  protected renderPasswordField(card: Entry) {
    const passwordResource = this.model.state.passwordResource()
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
          ${isReady ? renderPMCopyButton({value: passwordResource.value, size: 'small'}) : nothing}
        </div>
      </div>
    `
  }

  protected renderUrlButtons(urls: PMEntryActionUrl[]) {
    return urls.map((url) => {
      return html`
        <cv-link
          class="url-link"
          href=${ifDefined(url.openable ? url.href : undefined)}
          target=${ifDefined(url.openable ? '_blank' : undefined)}
          rel=${ifDefined(url.openable ? 'noopener noreferrer' : undefined)}
          aria-label=${i18n('website')}
          @click=${url.openable ? this.onUrlClick : undefined}
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
      <pm-entry-ssh-keys .keys=${card.sshKeys} .publicKeys=${this.model.state.sshPublicKeys()}></pm-entry-ssh-keys>
    `
  }

  protected renderNoteDetails() {
    const noteResource = this.model.state.noteResource()
    const noteContent = this.model.state.note()

    return html`
      <div class="note-card">
        <div class="card-header">
          <div class="card-title">
            <cv-icon name="sticky-note"></cv-icon>
            ${i18n('note:title')}
          </div>
          ${this.renderNoteCardActions(noteResource, noteContent)}
        </div>
        <div class="card-content">${this.renderNote()}</div>
      </div>
    `
  }

  protected renderHeaderActions() {
    if (!this.showHeaderActions) return nothing

    const actions = this.model.getDesktopToolbarActions()
    if (!actions.length) return nothing

    return html`
      <cv-toolbar
        slot="actions"
        class="header-actions"
        data-toolbar-key=${getPMDesktopToolbarKey('entry-header', actions)}
        @click=${this.onHeaderToolbarClick}
        @keydown=${this.onHeaderToolbarKeydown}
      >
        ${renderPMDesktopToolbarItems(actions, {
          itemClass: 'entry-header-action',
          contentClass: 'entry-header-action-content',
          dangerClass: 'danger',
        })}
      </cv-toolbar>
    `
  }

  protected onOpenFirstUrl() {
    const entry = this.getCurrentEntry()
    if (!entry) return
    this.model.actions.openFirstUrl(entry)
  }

  protected onUrlClick(event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()

    const href = (event.currentTarget as HTMLElement | null)?.getAttribute('href')
    if (!href) return
    this.model.actions.openUrl(href)
  }

  protected onQuickCopyUsername() {
    const entry = this.getCurrentEntry()
    if (!entry) return
    this.model.actions.copyUsername(entry)
  }

  protected async onQuickCopyPassword() {
    const entry = this.getCurrentEntry()
    if (!entry) return
    await this.model.actions.copyPassword(entry)
  }

  protected async onQuickCopyOTP() {
    const entry = this.getCurrentEntry()
    if (!entry) return
    await this.model.actions.copyOTP(entry)
  }

  protected onStartEdit() {
    this.model.actions.startEdit()
  }

  protected onStartNoteEdit() {
    this.onStartEdit()
  }

  protected onMoveCurrent() {
    const entry = this.getCurrentEntry()
    if (!entry) return
    void this.model.actions.moveCard(entry)
  }

  protected onRemoveCurrent() {
    const entry = this.getCurrentEntry()
    if (!entry) return
    this.model.actions.removeEntry(entry)
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
    this.model.actions.onNoteToggle(event)
  }

  protected onHeaderToolbarClick(event: MouseEvent) {
    const item = this.getHeaderToolbarActionTarget(event)
    const entry = this.getCurrentEntry()
    if (!item || !entry || item.hasAttribute('disabled')) return

    const action = item.dataset['action']
    if (!this.model.isDesktopToolbarAction(action)) return

    this.model.executeDesktopToolbarAction(action, entry)
  }

  protected onHeaderToolbarKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' && event.key !== ' ') return

    const item = this.getHeaderToolbarActionTarget(event)
    const entry = this.getCurrentEntry()
    if (!item || !entry || item.hasAttribute('disabled')) return

    const action = item.dataset['action']
    if (!this.model.isDesktopToolbarAction(action)) return

    if (event.key === ' ') {
      event.preventDefault()
    }

    this.model.executeDesktopToolbarAction(action, entry)
  }

  protected onWorkspaceHeaderNavigate(event: CustomEvent<{value: string}>) {
    const path = event.detail.value
    passmanagerNavigationController.applyRoute(path ? {kind: 'group', groupPath: path} : {kind: 'root'})
  }

  protected onKeyDown(event: KeyboardEvent) {
    const entry = this.getCurrentEntry()
    if (!entry) return
    this.model.actions.onKeyDown(entry, event)
  }

  protected getCurrentEntry(): Entry | null {
    return this.entry instanceof Entry ? this.entry : null
  }

  private getHeaderToolbarActionTarget(event: Event): HTMLElement | null {
    for (const node of event.composedPath()) {
      if (node instanceof HTMLElement && node.tagName.toLowerCase() === 'cv-toolbar-item') {
        return node
      }
    }

    return null
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'cv-icon': CVIcon
    'cv-copy-button': CVCopyButton

    'pm-entry-move': PMEntryMoveType
    'pm-entry-otp': PMEntryOTP
    'pm-entry-ssh-keys': PMEntrySshKeys
    'back-button': ButtonBack
  }
}
