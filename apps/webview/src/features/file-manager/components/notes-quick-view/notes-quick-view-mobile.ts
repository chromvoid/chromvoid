import {css, nothing} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'

import {CvEmptyState} from 'root/shared/ui/empty-state'
import {mobileQuickViewShellStyles} from 'root/shared/ui/mobile-quick-view.styles'
import {MobileSurfaceLayout} from 'root/shared/ui/mobile-surface-layout'
import {mobileSurfaceLayoutBlockFillStyles} from 'root/shared/ui/mobile-surface-layout.styles'
import {PMSummaryRail} from '../../../passmanager/components/summary-rail'
import {NotesQuickViewBase} from './notes-quick-view-base'
import {notesQuickViewStyles} from './notes-quick-view.styles'

export class NotesQuickViewMobile extends NotesQuickViewBase {
  static styles = [
    notesQuickViewStyles,
    mobileSurfaceLayoutBlockFillStyles,
    mobileQuickViewShellStyles,
    css`
      .quick-view__header {
        gap: var(--cv-space-2);
        padding-inline: 0;
      }

      .search {
        flex: 1 1 auto;
      }

      .row {
        gap: var(--cv-space-2);
      }

      .quick-view__summary-rail {
        z-index: 1;
        max-inline-size: 100%;
        margin: 0;
      }
    `,
  ]

  static define() {
    CvEmptyState.define()
    MobileSurfaceLayout.define()
    PMSummaryRail.define()
    if (!customElements.get('notes-quick-view-mobile')) {
      customElements.define('notes-quick-view-mobile', this)
    }
  }

  protected renderHeaderSummary(): typeof nothing {
    return nothing
  }

  render() {
    return html`
      <mobile-surface-layout variant="standard" scroll="owned" data-layout="mobile">
        ${this.renderHeader('header')}
        <div class="quick-view__content">${this.renderContent()}</div>
        ${this.renderSummary('footer')}
      </mobile-surface-layout>
    `
  }
}
