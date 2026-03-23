import {XLitElement} from '@statx/lit'

import {html, nothing} from 'lit'

import {i18n} from '@project/passmanager'
import type {OTP} from '@project/passmanager'
import {PMEntryTOTPItemModel} from './pm-entry-totp-item.model'

/**
 * TOTP (Time-based One-Time Password) компонент
 *
 * Особенности:
 * - Автоматическое обновление кода каждые N секунд
 * - SVG arc timer с круговым прогрессом
 * - Сегментированные ячейки для цифр с shimmer-анимацией
 * - Цветовая индикация оставшегося времени (зелёный → жёлтый → красный)
 * - Urgency pulse при <=20% оставшегося времени
 */
export class PMEntryTOTPItemBase extends XLitElement {
  protected readonly model = new PMEntryTOTPItemModel()

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

  connectedCallback(): void {
    super.connectedCallback()
    this.model.connect()
  }

  disconnectedCallback(): void {
    this.model.disconnect()
    super.disconnectedCallback()
  }

  protected onCodeClick(): void {
    this.model.toggleCode()
  }

  protected copyOtpValue(): Promise<string> {
    return this.model.loadCodeForCopy()
  }

  render() {
    const view = this.model.getViewState()
    if (!view) {
      return nothing
    }

    this.style.setProperty('--totp-color', view.baseColor)
    this.style.setProperty('--totp-color-soft', view.lightColor)
    this.style.setProperty('--arc-offset', String(view.arcOffset))
    const label = view.label || i18n('otp:item')

    return html`
      <div
        class="totp-card"
        role="group"
        aria-label=${`${i18n('otp:totp_short')} ${label}`}
        ?data-urgent=${view.isUrgent}
      >
        <div class="totp-header">
          <span class="totp-label">
            <cv-icon name="shield-check" aria-hidden="true"></cv-icon>
            <span class="totp-label-text">${label}</span>
          </span>
        </div>

        <div class="totp-content">
          <div
            class="totp-digits"
            ?data-hidden=${!view.isVisible}
            @click=${this.onCodeClick}
            tabindex="-1"
            role="button"
            aria-label=${view.isVisible ? i18n('button:hide') : i18n('button:show')}
          >
            <div class="totp-digit-group">
              ${view.firstHalf.map((digit) => html`<span class="totp-digit">${digit}</span>`)}
            </div>
            <div class="totp-digit-group">
              ${view.secondHalf.map((digit) => html`<span class="totp-digit">${digit}</span>`)}
            </div>
          </div>

          <div class="totp-arc-timer">
            <svg viewBox="0 0 44 44" aria-hidden="true">
              <circle class="arc-track" cx="22" cy="22" r="16" />
              <circle class="arc-indicator" cx="22" cy="22" r="16" />
            </svg>
            <span class="arc-value">${view.leftSeconds}</span>
          </div>

          <div class="totp-actions">
            <cv-copy-button .value=${this.copyOtpValue} aria-label=${i18n('button:copy')}></cv-copy-button>
            <cv-button
              size="small"
              variant="ghost"
              @click=${this.onCodeClick}
              aria-label=${view.isVisible ? i18n('button:hide') : i18n('button:show')}
            >
              <cv-icon name=${view.isVisible ? 'eye-off' : 'eye'} aria-hidden="true"></cv-icon>
            </cv-button>
          </div>
        </div>
      </div>
    `
  }
}
