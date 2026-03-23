import {XLitElement} from '@statx/lit'

import {html, nothing} from 'lit'

import {i18n} from '@project/passmanager'
import {Entry} from '@project/passmanager'
import {PMEntryListItemModel} from './entry-list-item.model'

export class PMEntryListItemBase extends XLitElement {
  protected readonly model = new PMEntryListItemModel()

  viewMode: 'default' | 'compact' | 'dense' = 'default'

  set entry(entry: Entry) {
    this.model.setEntry(entry)
  }

  get isSelected() {
    return this.model.isSelected()
  }

  protected onClick(event: Event) {
    this.model.openEntry(event)
  }

  protected onCopyUsername(event: Event) {
    this.model.copyUsername(event)
  }

  protected async onCopyPassword(event: Event) {
    await this.model.copyPassword(event)
  }

  protected onDragStart(event: DragEvent) {
    this.model.startDrag(event)
  }

  protected onDragEnd() {
    this.model.endDrag()
  }

  protected onKeyDown(event: KeyboardEvent) {
    this.model.handleKeyDown(event)
  }

  protected isDragEnabled(entry: Entry): boolean {
    return this.model.isDragEnabled(entry)
  }

  protected renderIcon(entry: Entry) {
    return html`<pm-avatar-icon class="entry-favicon" .item=${entry}></pm-avatar-icon>`
  }

  protected renderStatusIndicators(entry: Entry) {
    const indicators = []

    if (entry.otps().length > 0) {
      indicators.push(html`<div class="status-indicator has-otp" title=${i18n('tooltip:has-otp')}></div>`)
    }

    return indicators
  }

  protected renderActions(entry: Entry) {
    return html`
      <div class="item-actions">
        <cv-tooltip arrow show-delay="150" hide-delay="0">
          <button slot="trigger" class="action-button" @click=${this.onCopyUsername} ?disabled=${!entry.username}>
            <cv-icon name="person-circle"></cv-icon>
          </button>
          <span slot="content">${i18n('tooltip:copy-username')}</span>
        </cv-tooltip>
        <cv-tooltip arrow show-delay="150" hide-delay="0">
          <button slot="trigger" class="action-button" @click=${this.onCopyPassword}>
            <cv-icon name="key"></cv-icon>
          </button>
          <span slot="content">${i18n('tooltip:copy-password')}</span>
        </cv-tooltip>
        ${entry.otps().length > 0
          ? html`
              <cv-tooltip arrow show-delay="150" hide-delay="0">
                <button slot="trigger" class="action-button">
                  <cv-icon name="shield-check"></cv-icon>
                </button>
                <span slot="content">${i18n('tooltip:copy-otp')}</span>
              </cv-tooltip>
            `
          : nothing}
      </div>
    `
  }

  focusRow() {
    const row = this.renderRoot.querySelector('.list-item') as HTMLElement | null
    row?.focus()
  }

  connectedCallback() {
    super.connectedCallback()
    this.setAttribute('view-mode', this.viewMode)
  }

  render() {
    if (!window.passmanager) {
      return nothing
    }

    const entry = this.model.entry()
    if (!(entry instanceof Entry)) {
      return nothing
    }

    const dragEnabled = this.isDragEnabled(entry)
    const hasUsername = this.model.hasUsername()
    const hasOtp = this.model.hasOtp()
    const hasSshKeys = this.model.hasSshKeys()

    return html`
      <div
        class="list-item ${this.isSelected ? 'selected' : ''}"
        @click=${this.onClick}
        @keydown=${this.onKeyDown}
        .draggable=${dragEnabled}
        @dragstart=${this.onDragStart}
        @dragend=${this.onDragEnd}
        role="button"
        tabindex="0"
      >
        ${this.renderIcon(entry)}

        <div class="item-content">
          <div class="item-title">
            ${entry.title || i18n('no_title')} ${hasOtp ? html`<span class="otp-indicator"></span>` : nothing}
            ${hasSshKeys ? html`<span class="ssh-indicator" title=${i18n('tooltip:has-ssh')}></span>` : nothing}
          </div>
          ${hasUsername ? html`<div class="item-subtitle">${entry.username}</div>` : nothing}
        </div>

        <cv-tooltip arrow show-delay="150" hide-delay="0">
          <button slot="trigger" class="action-button primary-action" @click=${this.onCopyPassword}>
            <cv-icon name="key"></cv-icon>
          </button>
          <span slot="content">${i18n('tooltip:copy-password')}</span>
        </cv-tooltip>

        ${this.renderActions(entry)} ${this.renderStatusIndicators(entry)}
      </div>
    `
  }
}
