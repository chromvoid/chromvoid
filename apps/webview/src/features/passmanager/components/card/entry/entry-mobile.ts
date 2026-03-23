import {html, nothing} from 'lit'

import {Entry, i18n} from '@project/passmanager'
import {pmSharedStyles} from '../../../styles/shared'
import {PMEntryBase} from './entry-base'
import {PMEntryMobileModel} from './entry-mobile.model'
import {entrySharedStyles} from './styles'
import {entryMobileStyles} from './entry-mobile.styles'
import {PMCardHeaderMobile} from '../pm-card-header'
import {PMEntryOTPItemMobile} from '../pm-entry-otp-item'

export class PMEntryMobile extends PMEntryBase {
  protected override readonly model = new PMEntryMobileModel()

  static define() {
    if (!customElements.get('pm-entry-mobile')) {
      customElements.define('pm-entry-mobile', this)
      PMCardHeaderMobile.define()
      PMEntryOTPItemMobile.define()
    }
  }

  static styles = [
    ...pmSharedStyles,
    entrySharedStyles,
    entryMobileStyles,
  ]

  private renderMobileContent(card: Entry) {
    const data = this.model.getEntryData(card)

    this.style.setProperty('--entry-avatar-bg', data.avatarBg)

    return html`
      <article class="wrapper" role="main" aria-label=${data.title}>
        <pm-card-header-mobile>
          <div class="title-content">
            <h1 class="entry-title">${data.title}</h1>
            <div class="entry-meta-row">
              <div class="entry-meta-badges">
                <cv-badge size="small" variant="neutral">
                  <cv-icon name="lock" slot="prefix" size="xs"></cv-icon>
                  ${i18n('entry:badge:encrypted')}
                </cv-badge>
                ${data.hasOtps
                  ? html`
                      <cv-badge size="small" variant="success">
                        <cv-icon name="shield-check" slot="prefix" size="xs"></cv-icon>
                        ${i18n('entry:badge:two_factor')}
                      </cv-badge>
                    `
                  : nothing}
                ${data.hasSshKeys
                  ? html`
                      <cv-badge size="small" variant="warning">
                        <cv-icon name="key" slot="prefix" size="xs"></cv-icon>
                        ${i18n('ssh:short')}
                      </cv-badge>
                    `
                  : nothing}
                ${data.websiteCount > 1
                  ? html`
                      <cv-badge size="small" variant="neutral">
                        <cv-icon name="globe" slot="prefix" size="xs"></cv-icon>
                        ${data.websiteCount}
                      </cv-badge>
                    `
                  : nothing}
              </div>
            </div>
          </div>
        </pm-card-header-mobile>

        <div class="content-grid">
          <section class="section-group" style="--stagger: 0">
            <div class="section-group-inner">
              ${this.renderUsernameField(card)}
              <div class="field-divider"></div>
              ${this.renderPasswordField(card)}
            </div>
          </section>

          ${data.hasOtps
            ? html`
                <section class="section-group section-group-accent" style="--stagger: 1">
                  <div class="section-label">
                    <cv-icon name="shield-check"></cv-icon>
                    <span>${i18n('otp')}</span>
                    ${data.otpCount > 1
                      ? html`<cv-badge class="section-count" size="small" variant="neutral">${data.otpCount}</cv-badge>`
                      : nothing}
                  </div>
                  <div class="section-group-inner">
                    <div class="otp-codes">
                      ${card
                        .otps()
                        .map(
                          (otp) => html`<pm-entry-otp-item-mobile .otp=${otp}></pm-entry-otp-item-mobile>`,
                        )}
                    </div>
                  </div>
                </section>
              `
            : nothing}

          ${data.hasUrls
            ? html`
                <section class="section-group" style="--stagger: 2">
                  <div class="section-label">
                    <cv-icon name="globe"></cv-icon>
                    <span>${i18n('website')}</span>
                    ${data.websiteCount > 1
                      ? html`<cv-badge class="section-count" size="small" variant="neutral">${data.websiteCount}</cv-badge>`
                      : nothing}
                  </div>
                  <div class="section-group-inner">
                    <div class="urls-list">${this.renderUrlButtons(data.visibleUrls)}</div>
                  </div>
                </section>
              `
            : nothing}

          <section class="secondary-section" style="--stagger: 3">
            ${this.renderSshKeySection(card)}
            ${this.renderNoteDetails()}
            <div class="section-group metadata-card metadata-compact">${this.renderMetadata(card, data.hasOtps)}</div>
          </section>
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
        <pm-entry-edit-mobile
          .entry=${card}
          .session=${this.model}
          @editEnd=${this.onEditEnd}
        ></pm-entry-edit-mobile>
      `
    }

    return this.renderMobileContent(card)
  }
}
