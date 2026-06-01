import {css, nothing} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'
import {ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {i18n} from '@project/passmanager/i18n'
import {hostLayoutPaintContainStyles, motionPrimitiveStyles} from 'root/shared/ui/shared-styles'

import {PMEntryOTPItem} from './pm-entry-otp-item'
import {PMEntryOTPModel} from './pm-entry-otp.model'

export class PMEntryOTP extends ReatomLitElement {
  protected readonly model = new PMEntryOTPModel()

  static define() {
    if (customElements.get('pm-entry-otp')) {
      return
    }

    PMEntryOTPItem.define()
    customElements.define('pm-entry-otp', this)
  }

  static styles = [
    hostLayoutPaintContainStyles,
    motionPrimitiveStyles,
    css`
      :host {
        display: block;
        --motion-fade-up-distance: 10px;
      }

      .otp-list {
        display: grid;
        gap: var(--cv-space-2);
        width: 100%;
      }

      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--cv-space-2);
        padding: var(--cv-space-6);
        text-align: center;
        color: var(--cv-color-text-muted);
        background: var(--cv-color-surface-2);
        border: 1px solid var(--cv-color-border);
        border-radius: var(--cv-radius-3);
        font-style: italic;
      }

      .empty-state cv-icon {
        opacity: 0.5;
        color: var(--cv-color-text-muted);
      }

      .empty-state .empty-text {
        font-size: var(--cv-font-size-sm);
        margin: 0;
      }

      /*Adaptability*/
      @container (width < 480px) {
        .otp-list {
          gap: calc(var(--cv-space-2) * 0.75);
        }

        .empty-state {
          padding: var(--cv-space-3);
        }
      }
    `,
  ]

  private isCompact = false

  override connectedCallback(): void {
    super.connectedCallback()
    this.model.actions.connect()
  }

  override disconnectedCallback(): void {
    this.model.actions.disconnect()
    super.disconnectedCallback()
  }

  render() {
    const entry = this.model.state.entry()
    if (!entry) {
      return nothing
    }

    const otps = this.model.state.otps()
    if (otps.length === 0) {
      return html`
        <div class="empty-state" role="status" aria-label=${i18n('no_title')}>
          <cv-icon name="shield-x" size="lg" aria-hidden="true"></cv-icon>
          <p class="empty-text">${i18n('no_title')}</p>
        </div>
      `
    }

    return html`
      <div class="otp-list" data-compact=${this.isCompact} role="list" aria-label=${i18n('otp')}>
        ${otps.map(
          (otp) =>
            html`<pm-entry-otp-item
              .otp=${otp}
              .isIcon=${this.isCompact}
              .hasSelector=${!this.isCompact}
              role="listitem"
              aria-label=${i18n('otp')}
            ></pm-entry-otp-item>`,
        )}
      </div>
    `
  }
}
