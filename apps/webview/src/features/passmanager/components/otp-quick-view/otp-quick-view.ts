import {css} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'

import {CvEmptyState} from 'root/shared/ui/empty-state'
import {PMEntryOTPItem} from '../card/pm-entry-otp-item'
import {PMOtpQuickViewBase} from './otp-quick-view-base'
import {PMOtpQuickViewSearch} from './otp-quick-view-search'
import {otpQuickViewStyles} from './otp-quick-view.styles'

export class PMOtpQuickView extends PMOtpQuickViewBase {
  static styles = [
    otpQuickViewStyles,
    css`
      :host {
        padding: var(--app-surface-gutter-desktop);
      }

      .rows {
        gap: var(--cv-space-3) var(--cv-space-4);
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 360px), 1fr));
      }
    `,
  ]

  static define() {
    CvEmptyState.define()
    PMEntryOTPItem.define()
    PMOtpQuickViewSearch.define()
    if (!customElements.get('pm-otp-quick-view')) {
      customElements.define('pm-otp-quick-view', this)
    }
  }

  render() {
    return html`
      <section class="quick-view" data-layout="desktop">
        <div class="quick-view__content">${this.renderContent()}</div>
      </section>
    `
  }
}
