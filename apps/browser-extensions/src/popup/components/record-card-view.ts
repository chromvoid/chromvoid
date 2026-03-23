import {css} from 'lit'
import {ReatomLitElement, html} from '@chromvoid/uikit'
import type {CVSelectChangeEvent} from '@chromvoid/uikit'

import {i18n} from '../i18n'

type ExtRecordCardViewOtpOption = {
  id: string
  label: string
}

type ExtRecordCardViewCopyValue = string | (() => Promise<string>)

export type {ExtRecordCardViewOtpOption}
export type {ExtRecordCardViewCopyValue}

export const COPY_ERROR_PASSWORD_UNAVAILABLE = 'password-unavailable'
export const COPY_ERROR_OTP_UNAVAILABLE = 'otp-unavailable'

const maxString = (str: string) => {
  return str.length > 32 ? str.slice(0, 29) + '...' : str
}

export class ExtRecordCardView extends ReatomLitElement {
  static elementName = 'ext-record-card-view'

  static get properties() {
    return {
      username: {type: String},
      hasOtp: {type: Boolean, attribute: 'has-otp'},
      otpBadgeLabel: {type: String, attribute: 'otp-badge-label'},
      otpOptions: {attribute: false},
      selectedOtpId: {type: String, attribute: 'selected-otp-id'},
      fillCredentialsHint: {type: String, attribute: 'fill-credentials-hint'},
      fillOtpHint: {type: String, attribute: 'fill-otp-hint'},
      usernameCopyValue: {attribute: false},
      passwordCopyValue: {attribute: false},
      otpCopyValue: {attribute: false},
      fillOtpDisabled: {type: Boolean, attribute: 'fill-otp-disabled'},
      otpCopyDisabled: {type: Boolean, attribute: 'otp-copy-disabled'},
    }
  }

  declare username: string
  declare hasOtp: boolean
  declare otpBadgeLabel: string
  declare otpOptions: ExtRecordCardViewOtpOption[]
  declare selectedOtpId: string
  declare fillCredentialsHint: string
  declare fillOtpHint: string
  declare usernameCopyValue?: ExtRecordCardViewCopyValue
  declare passwordCopyValue: ExtRecordCardViewCopyValue
  declare otpCopyValue?: ExtRecordCardViewCopyValue
  declare fillOtpDisabled: boolean
  declare otpCopyDisabled: boolean

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  static styles = css`
    :host {
      display: block;
    }

    cv-card {
      --cv-card-border-radius: 13px;
      --cv-card-border-color: rgb(148 163 184 / 20%);
      --cv-card-background: linear-gradient(150deg, rgb(15 23 42 / 58%), rgb(2 6 23 / 62%));
      --cv-card-shadow: inset 0 1px 0 rgb(255 255 255 / 4%), 0 8px 18px rgb(2 6 23 / 24%);
      --cv-card-color: rgb(226 232 240 / 96%);
      --cv-card-padding: 10px;
    }

    .body {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .record-user {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .record-username {
      color: rgb(248 250 252);
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.01em;
    }

    .record-meta {
      color: rgb(148 163 184 / 95%);
      font-size: 12px;
      font-weight: 500;
      line-height: 1.4;
    }

    .record-state {
      display: inline-flex;
      justify-content: flex-start;
    }

    .record-state cv-badge {
      --cv-badge-font-size: 10px;
      --cv-badge-letter-spacing: 0.04em;
      --cv-badge-text-transform: uppercase;
    }

    .otp-picker {
      display: block;
      width: 100%;
    }

    .otp-picker cv-select {
      --cv-input-border-radius: 10px;
      --cv-input-background: rgb(2 6 23 / 54%);
      --cv-input-border-color: rgb(148 163 184 / 34%);
      --cv-input-color: rgb(226 232 240);
      --cv-input-placeholder-color: rgb(148 163 184 / 85%);
    }

    .record-actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .record-primary-actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .record-primary-actions cv-button {
      width: 100%;
      --cv-button-border-radius: 12px;
      --cv-button-font-weight: 700;
      --cv-button-padding-inline: 10px;
      --cv-button-padding-block: 8px;
      --cv-button-min-height: 48px;
      --cv-button-gap: 6px;
    }

    .action-body {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
      line-height: 1.15;
    }

    .action-title {
      font-size: 13px;
      font-weight: 700;
      color: rgb(248 250 252);
    }

    .action-hint {
      font-size: 11px;
      font-weight: 500;
      color: rgb(148 163 184 / 95%);
    }

    .copy-grid {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .copy-item {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border: 1px solid rgb(148 163 184 / 20%);
      border-radius: 10px;
      background: rgb(2 6 23 / 36%);
    }

    .copy-item-meta {
      display: flex;
      flex-direction: column;
      min-width: 0;
      gap: 2px;
    }

    .copy-item-label {
      color: rgb(148 163 184 / 95%);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .copy-item-value {
      color: rgb(226 232 240 / 96%);
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .copy-item cv-tooltip {
      --cv-color-surface-elevated: rgb(15 23 42);
      --cv-color-border: rgb(56 189 248 / 42%);
      --cv-color-text: rgb(226 232 240);
    }

    .copy-item cv-copy-button {
      --cv-copy-button-size: 30px;
      --cv-copy-button-border-radius: 10px;
      --cv-color-surface: rgb(2 6 23 / 54%);
      --cv-color-border: rgb(148 163 184 / 34%);
      --cv-color-text: rgb(226 232 240);
    }
  `

  constructor() {
    super()
    this.username = ''
    this.hasOtp = false
    this.otpBadgeLabel = ''
    this.otpOptions = []
    this.selectedOtpId = ''
    this.fillCredentialsHint = ''
    this.fillOtpHint = ''
    this.usernameCopyValue = undefined
    this.passwordCopyValue = ''
    this.otpCopyValue = undefined
    this.fillOtpDisabled = false
    this.otpCopyDisabled = false
  }

  private dispatch(type: string, detail: Record<string, unknown> = {}) {
    this.dispatchEvent(
      new CustomEvent(type, {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private handleOtpChange(event: CVSelectChangeEvent) {
    if (event.detail.value) {
      this.dispatch('ext-otp-change', {otpId: event.detail.value})
    }
  }

  private resolveCopyError(error: unknown): string | undefined {
    return error instanceof Error ? error.message : undefined
  }

  private handleFillClick() {
    this.dispatch('ext-fill')
  }

  private handleFillOtpClick() {
    this.dispatch('ext-fill-otp')
  }

  private handleUsernameCopySuccess() {
    this.dispatch('ext-copy-feedback', {message: i18n('record.feedback.usernameCopied')})
  }

  private handleUsernameCopyError() {
    this.dispatch('ext-copy-feedback', {message: i18n('record.feedback.clipboardBlocked')})
  }

  private handlePasswordCopySuccess() {
    this.dispatch('ext-copy-feedback', {message: i18n('record.feedback.passwordCopied')})
  }

  private handlePasswordCopyError(event: CustomEvent<{error: unknown}>) {
    const reason = this.resolveCopyError(event.detail.error)
    this.dispatch('ext-copy-feedback', {
      message:
        reason === COPY_ERROR_PASSWORD_UNAVAILABLE
          ? i18n('record.feedback.passwordUnavailable')
          : i18n('record.feedback.clipboardBlocked'),
    })
  }

  private handleOtpCopySuccess() {
    this.dispatch('ext-copy-feedback', {message: i18n('record.feedback.otpCopied')})
  }

  private handleOtpCopyError(event: CustomEvent<{error: unknown}>) {
    const reason = this.resolveCopyError(event.detail.error)
    this.dispatch('ext-copy-feedback', {
      message:
        reason === COPY_ERROR_OTP_UNAVAILABLE
          ? i18n('record.otpUnavailable')
          : i18n('record.feedback.clipboardBlocked'),
    })
  }

  protected override render() {
    const hasMultipleOtp = this.otpOptions.length > 1
    const resolvedBadgeLabel =
      this.otpBadgeLabel ||
      (this.hasOtp
        ? hasMultipleOtp
          ? i18n('record.otpProfiles', {count: this.otpOptions.length})
          : i18n('record.otpReady')
        : i18n('record.otpMissing'))
    const resolvedFillCredentialsHint = this.fillCredentialsHint || i18n('record.fillCredentialsHint')
    const resolvedFillOtpHint = this.fillOtpHint || i18n('record.otpNotAvailable')
    const resolvedUsernameCopyValue = this.usernameCopyValue ?? this.username
    const resolvedOtpCopyDisabled = this.otpCopyDisabled || !this.hasOtp
    const resolvedFillOtpDisabled = this.fillOtpDisabled || !this.hasOtp
    const otpVariant = this.hasOtp ? 'success' : 'warning'

    return html`<cv-card variant="outlined">
      <div slot="header" class="record-user">
        <div class="record-username">${maxString(this.username)}</div>
      </div>
      <div class="body">
        <div class="record-meta">${i18n('record.credentialsForSite')}</div>
        <div class="record-state">
          <cv-badge pill variant=${otpVariant}>${resolvedBadgeLabel}</cv-badge>
        </div>
        ${hasMultipleOtp
          ? html`<div class="otp-picker">
              <cv-select size="small" .value=${this.selectedOtpId} @cv-change=${this.handleOtpChange}>
                ${this.otpOptions.map(
                  (otp) => html`<cv-select-option value=${otp.id}>${otp.label}</cv-select-option>`,
                )}
              </cv-select>
            </div>`
          : null}
        <div class="record-actions">
          <div class="record-primary-actions">
            <cv-button size="small" variant="primary" @click=${this.handleFillClick}
              ><span class="action-body"
                ><span class="action-title">${i18n('record.fillCredentials')}</span
                ><span class="action-hint">${resolvedFillCredentialsHint}</span></span
              ></cv-button
            >
            <cv-button size="small" variant="default" @click=${this.handleFillOtpClick} ?disabled=${resolvedFillOtpDisabled}
              ><span class="action-body"
                ><span class="action-title">${i18n('record.fillOtpField')}</span
                ><span class="action-hint">${resolvedFillOtpHint}</span></span
              ></cv-button
            >
          </div>
          <div class="copy-grid">
            <div class="copy-item">
              <div class="copy-item-meta">
                <span class="copy-item-label">${i18n('record.username')}</span>
                <span class="copy-item-value">${maxString(this.username)}</span>
              </div>
              <cv-tooltip arrow>
                <cv-copy-button
                  slot="trigger"
                  size="small"
                  aria-label=${i18n('record.copyUsername')}
                  .value=${resolvedUsernameCopyValue}
                  @cv-copy=${this.handleUsernameCopySuccess}
                  @cv-error=${this.handleUsernameCopyError}
                ></cv-copy-button>
                <span slot="content">${i18n('record.copyUsername')}</span>
              </cv-tooltip>
            </div>

            <div class="copy-item">
              <div class="copy-item-meta">
                <span class="copy-item-label">${i18n('record.password')}</span>
                <span class="copy-item-value">${i18n('record.hiddenValue')}</span>
              </div>
              <cv-tooltip arrow>
                <cv-copy-button
                  slot="trigger"
                  size="small"
                  aria-label=${i18n('record.copyPassword')}
                  .value=${this.passwordCopyValue}
                  @cv-copy=${this.handlePasswordCopySuccess}
                  @cv-error=${this.handlePasswordCopyError}
                ></cv-copy-button>
                <span slot="content">${i18n('record.copyPassword')}</span>
              </cv-tooltip>
            </div>

            <div class="copy-item">
              <div class="copy-item-meta">
                <span class="copy-item-label">${i18n('record.otpCode')}</span>
                <span class="copy-item-value">${resolvedFillOtpHint}</span>
              </div>
              <cv-tooltip arrow>
                <cv-copy-button
                  slot="trigger"
                  size="small"
                  aria-label=${i18n('record.copyCurrentOtp')}
                  .value=${this.otpCopyValue ?? ''}
                  @cv-copy=${this.handleOtpCopySuccess}
                  @cv-error=${this.handleOtpCopyError}
                  ?disabled=${resolvedOtpCopyDisabled}
                ></cv-copy-button>
                <span slot="content"
                  >${this.hasOtp ? i18n('record.copyCurrentOtp') : i18n('record.otpUnavailable')}</span
                >
              </cv-tooltip>
            </div>
          </div>
        </div>
      </div>
    </cv-card>`
  }
}
