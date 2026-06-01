import {nothing} from 'lit'
import {keyed} from 'lit/directives/keyed.js'
import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import type {OTP} from '@project/passmanager/core'
import {i18n} from '@project/passmanager/i18n'
import {PMEntryTOTPItemModel} from './pm-entry-totp-item.model'

/**TOTP (Time-based One-Time Password)
*
* Features:
Automatically update the code every N seconds
SVG arc timer with circular progression
Segmented cells for numbers with shimmer animation
* - Color indication of the remaining time (green → yellow → red)
* - Urgency pulse at <=20% of remaining time
*/
export class PMEntryTOTPItemBase extends ReatomLitElement {
  protected readonly model = new PMEntryTOTPItemModel()

  get otp(): OTP | undefined {
    return this.model.state.otp()
  }

  set otp(value: OTP | undefined) {
    this.model.actions.setOtp(value)
  }

  connectedCallback(): void {
    super.connectedCallback()
    this.model.actions.connect()
  }

  disconnectedCallback(): void {
    this.model.actions.disconnect()
    super.disconnectedCallback()
  }

  protected onCopyCode(event: Event): void {
    if (this.isOtpActionEvent(event)) {
      return
    }

    void this.model.actions.copyCode()
  }

  protected onCopyKeyDown(event: KeyboardEvent): void {
    if (this.isOtpActionEvent(event)) {
      return
    }

    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') {
      return
    }

    event.preventDefault()
    void this.model.actions.copyCode()
  }

  protected renderDigitGroups(groups: readonly (readonly string[])[], codeText: string) {
    return groups.map(
      (group, index) => html`
        <span class="totp-digit-group" data-group=${index}>
          ${group.map((digit, digitIndex) =>
            keyed(
              `${codeText}:${index}:${digitIndex}:${digit}`,
              html`<span class="totp-digit motion-number-pop__digit">${digit}</span>`,
            ),
          )}
        </span>
      `,
    )
  }

  private isOtpActionEvent(event: Event): boolean {
    return event.composedPath().some((target) => {
      if (target instanceof HTMLSlotElement) {
        return target.name === 'otp-action'
      }

      return target instanceof Element && target.getAttribute('slot') === 'otp-action'
    })
  }

  render() {
    const view = this.model.state.view()
    if (!view) {
      return nothing
    }

    this.style.setProperty('--totp-color', view.baseColor)
    this.style.setProperty('--totp-color-soft', view.lightColor)
    this.style.setProperty('--arc-offset', String(view.arcOffset))
    const label = view.label || i18n('otp:item')
    const feedbackLabel = view.copyFeedback === 'copied' ? i18n('button:copied') : i18n('otp:tap_to_copy')

    return html`
      <div
        class="totp-card"
        role="button"
        tabindex="0"
        aria-label=${i18n('button:copy-otp')}
        @click=${this.onCopyCode}
        @keydown=${this.onCopyKeyDown}
        ?data-urgent=${view.isUrgent}
      >
        <div class="totp-main">
          <span class="totp-label">${label}</span>
          <div class="totp-code" aria-live="polite">
            ${view.digitGroups.length > 0
              ? this.renderDigitGroups(view.digitGroups, view.codeText)
              : html`<span class="totp-code-placeholder">${i18n('loading')}</span>`}
          </div>
          <span class="totp-feedback" aria-live="polite">
            ${keyed(view.copyFeedback, html`<span class="motion-text-swap">${feedbackLabel}</span>`)}
          </span>
        </div>
        <div class="totp-arc-timer" aria-label=${`${view.leftSeconds} ${i18n('otp:seconds_short')}`}>
          <svg viewBox="0 0 44 44" aria-hidden="true">
            <circle class="arc-track" cx="22" cy="22" r="17.5" />
            <circle class="arc-indicator" cx="22" cy="22" r="17.5" />
          </svg>
          <span class="arc-value">
            <span class="arc-seconds">${view.leftSeconds}</span>
            <span class="arc-unit">${i18n('otp:seconds_short')}</span>
          </span>
        </div>
        <div class="totp-actions">
          <slot name="otp-action"></slot>
        </div>
      </div>
    `
  }
}
