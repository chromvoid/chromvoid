import {nothing} from 'lit'
import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import type {OTP} from '@project/passmanager/core'
import {i18n} from '@project/passmanager/i18n'
import {PMEntryHOTPItemModel} from './pm-entry-hotp-item.model'
import {renderPMCopyButton} from '../../pm-copy-button'

type PMEntryHotpCounterChangeEvent = CustomEvent<{value: number}>

/**HOTP (HMAC-based One-Time Password)
*
* Features:
Manual control of the meter
* - Generating code on request (button)
* - Compact visual style tone TOTP card n
*/
export class PMEntryHOTPItemBase extends ReatomLitElement {
  protected readonly model = new PMEntryHOTPItemModel()

  constructor() {
    super()
    this.copyOtpValue = this.copyOtpValue.bind(this)
  }

  get otp(): OTP | undefined {
    return this.model.state.otp()
  }

  set otp(value: OTP | undefined) {
    this.model.actions.setOtp(value)
  }

  disconnectedCallback(): void {
    this.model.actions.disconnect()
    super.disconnectedCallback()
  }

  protected onCounterInput(event: PMEntryHotpCounterChangeEvent): void {
    this.model.actions.setCounter(event.detail.value)
  }

  protected async onGenerateCode(): Promise<void> {
    await this.model.actions.generateCode()
  }

  protected async onCodeClick(): Promise<void> {
    await this.model.actions.toggleCode()
  }

  protected copyOtpValue(): Promise<string> {
    return this.model.actions.loadCodeForCopy()
  }

  render() {
    const otp = this.model.state.otp()
    if (!otp) {
      return nothing
    }

    const isVisible = this.model.state.isVisible()
    const code = this.model.state.code()
    const counter = this.model.state.counter()
    const label = this.model.state.label() || i18n('otp:item')

    return html`
      <div class="hotp-card" role="group" aria-label=${`${i18n('otp:hotp_short')} ${label}`}>
        <div class="hotp-header">
          <span class="hotp-label">${this.model.state.label()}</span>
          <div class="hotp-badge">
            <cv-icon name="hash" aria-hidden="true"></cv-icon>
            ${i18n('otp:hotp_short')}
          </div>
        </div>

        <div class="hotp-content">
          <div class="hotp-code-section">
            <div
              class="hotp-code"
              ?data-hidden=${!isVisible}
              @click=${this.onCodeClick}
              tabindex="-1"
              role="button"
              aria-label=${isVisible ? i18n('button:hide') : i18n('button:show')}
            >
              ${isVisible && code ? code : '• • • • • •'}
            </div>

            <div class="hotp-counter-section">
              <span class="counter-label">${i18n('otp:counter')}</span>
              <div class="counter-input-wrapper">
                <cv-number
                  id="hotp-counter"
                  placeholder="0"
                  size="small"
                  min="0"
                  .value=${counter}
                  @cv-change=${this.onCounterInput}
                ></cv-number>
                <cv-button
                  class="hotp-generate-btn"
                  size="small"
                  variant="primary"
                  @click=${this.onGenerateCode}
                  aria-label=${i18n('button:generate')}
                >
                  <cv-icon slot="prefix" name="arrow-clockwise" aria-hidden="true"></cv-icon>
                  ${i18n('button:generate')}
                </cv-button>
              </div>
            </div>
          </div>

          <div class="hotp-actions">
            <cv-tooltip arrow show-delay="150" hide-delay="0">
              ${renderPMCopyButton({
                slot: 'trigger',
                value: this.copyOtpValue,
                ariaLabel: i18n('button:copy'),
              })}
              <span slot="content">${i18n('tooltip:copy-otp')}</span>
            </cv-tooltip>
            <cv-button
              size="small"
              variant="ghost"
              @click=${this.onCodeClick}
              aria-label=${isVisible ? i18n('button:hide') : i18n('button:show')}
            >
              <cv-icon name=${isVisible ? 'eye-off' : 'eye'} aria-hidden="true"></cv-icon>
            </cv-button>
            <slot name="otp-action"></slot>
          </div>
        </div>
      </div>
    `
  }
}
