import {XLitElement} from '@statx/lit'

import {html, nothing} from 'lit'

import {i18n} from '@project/passmanager'
import type {OTP} from '@project/passmanager'
import {PMEntryHOTPItemModel} from './pm-entry-hotp-item.model'

type PMEntryHotpCounterChangeEvent = CustomEvent<{value: number}>

/**
 * HOTP (HMAC-based One-Time Password) компонент
 *
 * Особенности:
 * - Ручное управление счётчиком
 * - Генерация кода по запросу (кнопка)
 * - Компактный визуальный стиль в тон TOTP карточкам
 */
export class PMEntryHOTPItemBase extends XLitElement {
  protected readonly model = new PMEntryHOTPItemModel()

  constructor() {
    super()
    this.copyOtpValue = this.copyOtpValue.bind(this)
  }

  get otp(): OTP | undefined {
    return this.model.otp()
  }

  set otp(value: OTP | undefined) {
    this.model.setOtp(value)
  }

  disconnectedCallback(): void {
    this.model.disconnect()
    super.disconnectedCallback()
  }

  protected onCounterInput(event: PMEntryHotpCounterChangeEvent): void {
    this.model.setCounter(event.detail.value)
  }

  protected async onGenerateCode(): Promise<void> {
    await this.model.generateCode()
  }

  protected async onCodeClick(): Promise<void> {
    await this.model.toggleCode()
  }

  protected copyOtpValue(): Promise<string> {
    return this.model.loadCodeForCopy()
  }

  render() {
    const otp = this.model.otp()
    if (!otp) {
      return nothing
    }

    const isVisible = this.model.isVisible()
    const code = this.model.code()
    const counter = this.model.counter()
    const label = this.model.label() || i18n('otp:item')

    return html`
      <div class="hotp-card" role="group" aria-label=${`${i18n('otp:hotp_short')} ${label}`}>
        <div class="hotp-header">
          <span class="hotp-label">${this.model.label()}</span>
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
                  <cv-icon name="arrow-clockwise" aria-hidden="true"></cv-icon>
                  ${i18n('button:generate')}
                </cv-button>
              </div>
            </div>
          </div>

          <div class="hotp-actions">
            <cv-tooltip arrow show-delay="150" hide-delay="0">
              <cv-copy-button
                slot="trigger"
                .value=${this.copyOtpValue}
                aria-label=${i18n('button:copy')}
              ></cv-copy-button>
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
          </div>
        </div>
      </div>
    `
  }
}
