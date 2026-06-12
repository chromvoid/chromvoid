import {css} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'

import {CvEmptyState} from 'root/shared/ui/empty-state'
import {mobileQuickViewShellStyles} from 'root/shared/ui/mobile-quick-view.styles'
import {MobileSurfaceLayout} from 'root/shared/ui/mobile-surface-layout'
import {mobileSurfaceLayoutBlockFillStyles} from 'root/shared/ui/mobile-surface-layout.styles'
import {PMEntryOTPItem} from '../card/pm-entry-otp-item'
import {PMSummaryRail} from '../summary-rail'
import {PMOtpQuickViewBase} from './otp-quick-view-base'
import {PMOtpQuickViewSearch} from './otp-quick-view-search'
import {otpQuickViewStyles} from './otp-quick-view.styles'

export class PMOtpQuickViewMobile extends PMOtpQuickViewBase {
  static styles = [
    otpQuickViewStyles,
    mobileSurfaceLayoutBlockFillStyles,
    mobileQuickViewShellStyles,
    css`
      :host {
        padding: 0;
      }

      .quick-view__header {
        gap: var(--app-mobile-surface-gap);
      }

      .quick-view__summary-rail {
        z-index: 1;
        max-inline-size: none;
        margin-block-end: 1px;
        background: var(--cv-color-bg);
      }

      pm-otp-quick-view-search {
        --pm-otp-search-padding-block: 0;
        --pm-otp-search-mobile-shadow:
          inset 0 1px 2px var(--cv-alpha-black-10),
          0 1px 0 var(--cv-alpha-white-4);
      }
    `,
  ]

  static define() {
    CvEmptyState.define()
    MobileSurfaceLayout.define()
    PMEntryOTPItem.define()
    PMOtpQuickViewSearch.define()
    PMSummaryRail.define()
    if (!customElements.get('pm-otp-quick-view-mobile')) {
      customElements.define('pm-otp-quick-view-mobile', this)
    }
  }

  protected override getSearchInputPreset(): string {
    return 'search-mobile'
  }

  render() {
    return html`
      <mobile-surface-layout variant="nested" scroll="owned" data-layout="mobile">
        ${this.renderHeader('header')}
        <div class="quick-view__content">${this.renderContent()}</div>
        ${this.renderSummaryRail('footer')}
      </mobile-surface-layout>
    `
  }
}
