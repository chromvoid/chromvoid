import {html} from '@chromvoid/uikit/reatom-lit'
import {nothing} from 'lit'

import {i18n} from '@project/passmanager/i18n'
import {getPassmanagerRoot} from '../../../models/pm-root.adapter'
import {PMWorkspaceHeader} from '../../card/pm-workspace-header'
import {PMGroupCreateBase} from './group-create-base'
import {pmEntryCardStyles, pmGroupCreateDesktopStyles, pmGroupCreateSharedStyles} from './styles'

export class PMGroupCreateDesktop extends PMGroupCreateBase {
  static define() {
    if (!customElements.get('pm-group-create-desktop')) {
      customElements.define('pm-group-create-desktop', this)
    }

    PMWorkspaceHeader.define()
  }

  static styles = [pmEntryCardStyles, pmGroupCreateSharedStyles, pmGroupCreateDesktopStyles]

  private onWorkspaceHeaderTitleInput(event: CustomEvent<{value: string}>) {
    this.model.setName(event.detail.value)
  }

  private onWorkspaceHeaderNavigate(event: CustomEvent<{value: string}>) {
    this.model.navigateToPath(event.detail.value)
  }

  protected override render() {
    if (!getPassmanagerRoot()) {
      return nothing
    }

    const contextItems = this.model.getContextItems()

    return html`
      <form @submit=${this.onSubmit}>
        <section class="panel">
          <pm-workspace-header
            .hasContextBand=${contextItems.length > 0}
            .contextItems=${contextItems}
            .title=${this.model.name()}
            .titlePlaceholder=${i18n('group:name')}
            .avatarIcon=${'camera'}
            .avatarIconRef=${this.model.iconRef()}
            .editableTitle=${true}
            .avatarInteractive=${true}
            @pm-workspace-header-navigate=${this.onWorkspaceHeaderNavigate}
            @pm-workspace-header-title-input=${this.onWorkspaceHeaderTitleInput}
            @pm-icon-change=${this.onIconChange}
          >
            <cv-button slot="actions" class="submit" type="submit" variant="primary" size="large"
              >${i18n('group:create:button')}</cv-button
            >
          </pm-workspace-header>
        </section>
        <section class="section">${this.renderDescriptionField()}</section>
      </form>
    `
  }
}
