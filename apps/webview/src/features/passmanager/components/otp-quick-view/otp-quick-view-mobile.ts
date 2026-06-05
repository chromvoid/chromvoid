import {css} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'

import {CvEmptyState} from 'root/shared/ui/empty-state'
import {PMEntryOTPItem} from '../card/pm-entry-otp-item'
import {PMSummaryRail} from '../summary-rail'
import {PMOtpQuickViewBase} from './otp-quick-view-base'
import {otpQuickViewStyles} from './otp-quick-view.styles'

export class PMOtpQuickViewMobile extends PMOtpQuickViewBase {
  static styles = [
    otpQuickViewStyles,
    css`
      :host {
        box-sizing: border-box;
        block-size: 100%;
        min-block-size: 0;
        padding: 0;
        overflow: hidden;
      }

      .quick-view {
        display: flex;
        flex-direction: column;
        block-size: 100%;
        min-block-size: 0;
        overflow: hidden;
        gap: 6px;
      }

      .quick-view__header {
        flex: 0 0 auto;
        gap: 6px;
      }

      .quick-view__content {
        flex: 1 1 auto;
        min-block-size: 0;
        min-inline-size: 0;
        overflow: auto;
        -webkit-overflow-scrolling: touch;
      }

      .quick-view__summary-rail {
        z-index: 1;
        flex: 0 0 auto;
        max-inline-size: none;
        border-block-start: 1px solid var(--cv-color-border-soft);
        background: var(--cv-color-bg);
        --pm-summary-rail-inline-size: 100%;
      }

      .controls {
        position: sticky;
        z-index: 2;
        inset-block-start: 0;
        padding-block: 0;
        background: var(--cv-color-surface-1);
      }

      cv-input.search {
        flex: 1 1 auto;
        --cv-input-search-mobile-shadow:
          inset 0 1px 2px var(--cv-alpha-black-10),
          0 1px 0 var(--cv-alpha-white-4);
      }

      .clear-filters--compact {
        flex: 0 0 auto;
      }

      .row {
        gap: var(--cv-space-2);
        padding: var(--cv-space-2);
      }
    `,
  ]

  static define() {
    CvEmptyState.define()
    PMEntryOTPItem.define()
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
      <section class="quick-view" data-layout="mobile">
        ${this.renderHeader()}
        <div class="quick-view__content">${this.renderContent()}</div>
        ${this.renderSummaryRail()}
      </section>
    `
  }
}
