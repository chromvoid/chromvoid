import {css} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'

import {PMEntryOTPItem} from '../card/pm-entry-otp-item'
import {PMSummaryRail} from '../summary-rail'
import {PMOtpQuickViewBase} from './otp-quick-view-base'
import {otpQuickViewStyles} from './otp-quick-view.styles'

export class PMOtpQuickView extends PMOtpQuickViewBase {
  static styles = [
    otpQuickViewStyles,
    css`
      :host {
        padding: var(--app-surface-gutter-desktop);
      }

      .row {
        grid-template-columns: minmax(190px, 0.72fr) minmax(260px, 1fr);
        align-items: center;
        gap: var(--cv-space-2);
        padding: var(--cv-space-2);
      }

      @container (width < 760px) {
        .row {
          grid-template-columns: 1fr;
        }
      }
    `,
  ]

  static define() {
    PMEntryOTPItem.define()
    PMSummaryRail.define()
    if (!customElements.get('pm-otp-quick-view')) {
      customElements.define('pm-otp-quick-view', this)
    }
  }

  render() {
    return html`
      <section class="quick-view" data-layout="desktop">
        ${this.renderHeader()} ${this.renderSummaryRail()} ${this.renderContent()}
      </section>
    `
  }
}
