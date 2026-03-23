import {html, nothing} from 'lit'

import {Entry, i18n} from '@project/passmanager'

import {PMEntryBase} from './entry-base'
import {entryDesktopStyles, entryDesktopResponsiveStyles} from './entry-desktop.styles'

export class PMEntry extends PMEntryBase {
  static styles = [...PMEntryBase.styles, entryDesktopStyles, entryDesktopResponsiveStyles]

  private renderPMEntryCompactOTP(card: Entry) {
    const otps = card.otps()
    if (!otps.length) {
      return html`
        <div class="empty-state" role="status">
          <cv-icon name="shield-x" size="md" aria-hidden="true"></cv-icon>
          <span>-</span>
        </div>
      `
    }

    return html`
      <div class="otp-compact" role="group" aria-label=${i18n('otp')}>
        ${otps.map((otp) => html`<pm-entry-otp-item .otp=${otp}></pm-entry-otp-item>`)}
      </div>
    `
  }

  private renderMainView(card: Entry, isReadOnly: boolean) {
    const data = this.model.getEntryData(card)

    this.style.setProperty('--entry-avatar-bg', data.avatarBg)

    return html`
      <article class="wrapper" role="main" aria-label=${data.entryTitleText}>
        <pm-card-header>
          <back-button slot="back"></back-button>
          <pm-avatar-icon
            slot="avatar"
            class="title-avatar-icon"
            .item=${card}
            .fallbackBg=${data.avatarBg}
          ></pm-avatar-icon>
          <div class="title-content">
            <h1 class="entry-title">${data.entryTitleText}</h1>
            <div class="entry-meta-badges">
              <cv-badge size="small" variant="success">
                <cv-icon name="lock" slot="prefix" size="xs"></cv-icon>
                ${i18n('entry:badge:encrypted')}
              </cv-badge>
              ${
                data.hasOtps
                  ? html`<cv-badge size="small" variant="primary">
                      <cv-icon name="shield-check" slot="prefix" size="xs"></cv-icon>
                      ${i18n('entry:badge:two_factor')}
                    </cv-badge>`
                  : nothing
              }
              ${
                card.sshKeys.length > 0
                  ? html`<cv-badge size="small" variant="warning">
                      <cv-icon name="key" slot="prefix" size="xs"></cv-icon>
                      ${i18n('ssh:short')}
                    </cv-badge>`
                  : nothing
              }
              ${
                data.hasUrls
                  ? html`<cv-badge size="small" variant="neutral">
                      <cv-icon name="globe" slot="prefix" size="xs"></cv-icon>
                      ${data.visibleUrls.length}
                    </cv-badge>`
                  : nothing
              }
            </div>
          </div>
          <div slot="actions" class="header-actions">
            <button
              class="icon-btn"
              title=${i18n('button:edit')}
              @click=${this.onStartEdit}
              ?disabled=${isReadOnly}
            >
              <cv-icon name="pencil-square"></cv-icon>
            </button>
            <button class="icon-btn" title=${i18n('button:move')} @click=${this.onMoveCurrent}>
              <cv-icon name="folder-symlink"></cv-icon>
            </button>
            <button
              class="icon-btn danger"
              title=${i18n('button:remove')}
              @click=${this.onRemoveCurrent}
              ?disabled=${isReadOnly}
            >
              <cv-icon name="trash"></cv-icon>
            </button>
          </div>
        </pm-card-header>
          <div class="fields-card">
            ${this.renderUsernameField(card)}
            ${this.renderPasswordField(card)}
            ${
              data.hasOtps
                ? html`
                    <div class="credential-field">
                      <div class="field-content">
                        <div class="otp-codes">${this.renderPMEntryCompactOTP(card)}</div>
                      </div>
                    </div>
                  `
                : nothing
            }
            ${
              data.hasUrls
                ? html`
                    <div class="credential-field">
                      <div class="field-content">
                        <span class="field-label">${i18n('website')}</span>
                        <div class="urls-list">${this.renderUrlButtons(data.visibleUrls)}</div>
                      </div>
                    </div>
                  `
                : nothing
            }
          </div>

          <section class="secondary-section">
            ${this.renderSshKeySection(card)}
            ${this.renderNoteDetails()}
          </section>

          <div class="metadata-footer">
            ${this.renderMetadata(card, data.hasOtps)}
          </div>
        </div>
      </article>
    `
  }

  render() {
    const card = this.entry
    if (!(card instanceof Entry)) {
      return html`<div role="alert">${i18n('entry:no_info')}</div>`
    }

    if (this.editing) {
      return html`
        <pm-entry-edit
          .entry=${card}
          .session=${this.model}
          @editEnd=${this.onEditEnd}
        ></pm-entry-edit>
      `
    }

    return this.renderMainView(card, window.passmanager?.isReadOnly() ?? false)
  }
}
