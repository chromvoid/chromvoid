import {css} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'
import {CVButton} from '@chromvoid/uikit/components/cv-button'

import {WorkspaceDashboardHeader} from 'root/features/file-manager/components/workspace-dashboard-header'
import {CvEmptyState} from 'root/shared/ui/empty-state'
import {PMEntrySshCreate} from '../card/entry-ssh/entry-ssh-create'
import {PMEntrySshKey} from '../card/entry-ssh/entry-ssh-key'
import {PMSummaryRail} from '../summary-rail'
import {PMSshKeysViewBase} from './ssh-keys-view-base'
import {sshKeysViewStyles} from './ssh-keys-view.styles'

export class PMSshKeysView extends PMSshKeysViewBase {
  static styles = [
    sshKeysViewStyles,
    css`
      :host {
        padding: var(--app-surface-gutter-desktop);
        overflow: hidden;
      }
    `,
  ]

  static define() {
    CVButton.define()
    WorkspaceDashboardHeader.define()
    CvEmptyState.define()
    PMEntrySshCreate.define()
    PMEntrySshKey.define()
    PMSummaryRail.define()
    if (!customElements.get('pm-ssh-keys-view')) customElements.define('pm-ssh-keys-view', this)
  }

  render() {
    return html`
      <section class="ssh-view" data-layout="desktop" data-create-open=${String(this.model.createOpen())}>
        ${this.renderHeader()} ${this.renderControls()}
        <div class="ssh-view__workspace">${this.renderCreate()} ${this.renderContent()}</div>
        ${this.renderSummaryRail()}
      </section>
    `
  }
}
