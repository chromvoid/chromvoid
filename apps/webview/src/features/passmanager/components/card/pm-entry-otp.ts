import {XLitElement} from '@statx/lit'

import {css, html, nothing} from 'lit'

import {i18n} from '@project/passmanager'
import {Entry} from '@project/passmanager'
import {hostLayoutPaintContainStyles, motionPrimitiveStyles} from 'root/shared/ui/shared-styles'
import {PMEntryOTPItem} from './pm-entry-otp-item'

export class PMEntryOTP extends XLitElement {
  static define() {
    customElements.define('pm-entry-otp', this)
    PMEntryOTPItem.define()
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

      /* Адаптивность */
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

  render() {
    const card = window.passmanager?.showElement()
    if (!(card instanceof Entry)) {
      return nothing
    }
    const codes = card?.otps()

    if (!codes || codes.length === 0) {
      return html`
        <div class="empty-state" role="status" aria-label=${i18n('no_title')}>
          <cv-icon name="shield-x" size="lg" aria-hidden="true"></cv-icon>
          <p class="empty-text">${i18n('no_title')}</p>
        </div>
      `
    }

    return html`
      <div class="otp-list" data-compact=${this.isCompact} role="list" aria-label=${i18n('otp')}>
        ${codes.map(
          (otp, _i) =>
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
