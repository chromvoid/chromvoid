import {css, nothing} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'

import {i18n} from '@project/passmanager/i18n'
import {PMEntryHOTPItem} from '../pm-entry-hotp-item'
import {PMEntryTOTPItem} from '../pm-entry-totp-item'
import {PMEntryOTPItemBase} from './pm-entry-otp-item-base'

export class PMEntryOTPItem extends PMEntryOTPItemBase {
  static styles = [
    css`
      :host {
        display: block;
        min-inline-size: 0;
      }

      pm-entry-totp-item,
      pm-entry-hotp-item {
        display: block;
        min-inline-size: 0;
      }

      cv-button[slot='otp-action'] {
        flex-shrink: 0;
      }

      cv-button[slot='otp-action']::part(base) {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        inline-size: var(--pm-otp-action-size, 32px);
        block-size: var(--pm-otp-action-size, 32px);
        min-inline-size: var(--pm-otp-action-size, 32px);
        padding: 0;
        border: 1px solid var(--cv-color-border-strong);
        border-radius: var(--cv-radius-2);
        background: var(--cv-color-surface-2);
        color: var(--cv-color-text);
        transition:
          border-color 0.2s ease,
          background 0.2s ease,
          color 0.2s ease;
      }

      cv-button[slot='otp-action']:hover::part(base) {
        border-color: var(--cv-color-danger-border, var(--cv-color-danger));
        background: var(--cv-color-danger-surface, var(--cv-color-surface-highlight));
        color: var(--cv-color-danger);
      }

      cv-button[slot='otp-action']:focus-visible::part(base) {
        outline: 2px solid var(--cv-color-danger);
        outline-offset: 2px;
      }

      cv-button[slot='otp-action'] cv-icon {
        font-size: 18px;
      }
    `,
  ]

  static define() {
    PMEntryTOTPItem.define()
    PMEntryHOTPItem.define()
    if (!customElements.get('pm-entry-otp-item')) {
      customElements.define('pm-entry-otp-item', this)
    }
  }

  render() {
    const otp = this.model.state.otp()
    if (!otp) {
      return nothing
    }

    const removeAction = this.removable
      ? html`
          <cv-button
            class="otp-remove-action"
            slot="otp-action"
            size="small"
            variant="ghost"
            @click=${this.handleRemoveClick}
            aria-label=${i18n('otp:remove')}
          >
            <cv-icon name="trash" aria-hidden="true"></cv-icon>
          </cv-button>
        `
      : nothing

    return this.model.isHotp()
      ? html`<pm-entry-hotp-item .otp=${otp}>${removeAction}</pm-entry-hotp-item>`
      : html`<pm-entry-totp-item .otp=${otp}>${removeAction}</pm-entry-totp-item>`
  }

  private handleRemoveClick(event: Event) {
    event.preventDefault()
    event.stopPropagation()

    const otp = this.model.state.otp()
    if (!otp) {
      return
    }

    this.dispatchEvent(
      new CustomEvent('pm-entry-otp-remove', {
        detail: {
          otpId: otp.id,
        },
        bubbles: true,
        composed: true,
      }),
    )
  }
}
