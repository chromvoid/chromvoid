import {CVButton} from '@chromvoid/uikit/components/cv-button'
import {CVDialog} from '@chromvoid/uikit/components/cv-dialog'
import {CVEmptyState} from '@chromvoid/uikit/components/cv-empty-state'
import {CVField} from '@chromvoid/uikit/components/cv-field'
import {CVIcon} from '@chromvoid/uikit/components/cv-icon'
import {CVInput} from '@chromvoid/uikit/components/cv-input'
import {CVSelect} from '@chromvoid/uikit/components/cv-select'
import {CVSelectOption} from '@chromvoid/uikit/components/cv-select-option'
import {CVSpinner} from '@chromvoid/uikit/components/cv-spinner'
import {CVTab} from '@chromvoid/uikit/components/cv-tab'
import {CVTabPanel} from '@chromvoid/uikit/components/cv-tab-panel'
import {CVTabs} from '@chromvoid/uikit/components/cv-tabs'
import {CVTextarea} from '@chromvoid/uikit/components/cv-textarea'
import {html} from '@chromvoid/uikit/reatom-lit'
import type {TemplateResult} from 'lit'

import {envRuntimeI18n as t} from './env-runtime.i18n'
import {envRuntimeModel} from './env-runtime.model'
import {EnvRuntimePageReviews} from './env-runtime-page.reviews'
import {envRuntimeReviewStyles} from './env-runtime-review.styles'
import {envRuntimeStyles} from './env-runtime.styles'

export class PMEnvRuntimePage extends EnvRuntimePageReviews {
  static elementName = 'pm-env-runtime-page'

  static styles = [envRuntimeStyles, envRuntimeReviewStyles]

  static define(): void {
    CVButton.define()
    CVDialog.define()
    CVEmptyState.define()
    CVField.define()
    CVIcon.define()
    CVInput.define()
    CVSelect.define()
    CVSelectOption.define()
    CVSpinner.define()
    CVTab.define()
    CVTabPanel.define()
    CVTabs.define()
    CVTextarea.define()
    if (!customElements.get(this.elementName)) customElements.define(this.elementName, this)
  }

  protected override render(): TemplateResult {
    if (envRuntimeModel.loading() && !envRuntimeModel.desktopSnapshot()) return this.renderLoadingState()

    return html`
      <main class="runtime-page" aria-label=${t('title')}>
        ${this.renderStatusBand()}
        <cv-tabs
          .value=${envRuntimeModel.section()}
          aria-label=${t('title')}
          @cv-change=${this.handleTabChange}
        >
          <cv-tab slot="nav" value="secrets">${t('tabSecrets')}</cv-tab>
          <cv-tab slot="nav" value="profiles">${t('tabProfiles')}</cv-tab>
          <cv-tab slot="nav" value="presets">${t('tabPresets')}</cv-tab>
          <cv-tab slot="nav" value="activity">${t('tabActivity')}</cv-tab>
          <cv-tab slot="nav" value="cli">${t('tabCli')}</cv-tab>

          <cv-tab-panel tab="secrets">${this.renderSecretsSection()}</cv-tab-panel>
          <cv-tab-panel tab="profiles">${this.renderProfilesSection()}</cv-tab-panel>
          <cv-tab-panel tab="presets">${this.renderPresetsSection()}</cv-tab-panel>
          <cv-tab-panel tab="activity">${this.renderActivitySection()}</cv-tab-panel>
          <cv-tab-panel tab="cli">${this.renderCliSection()}</cv-tab-panel>
        </cv-tabs>

        ${this.renderSecretDialog()} ${this.renderProfileDialog()} ${this.renderPresetDialog()}
        ${this.renderProposalDialog()} ${this.renderRunApprovalDialog()}
      </main>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pm-env-runtime-page': PMEnvRuntimePage
  }
}
