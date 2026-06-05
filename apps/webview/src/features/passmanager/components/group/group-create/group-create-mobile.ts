import {html} from '@chromvoid/uikit/reatom-lit'
import {nothing} from 'lit'

import {i18n} from '@project/passmanager/i18n'
import {getPassmanagerRoot} from '../../../models/pm-root.adapter'
import {ButtonBack} from '../../list/back-button'
import {PMIconPickerMobile} from '../../pm-icon-picker.mobile'
import {PMGroupCreateBase} from './group-create-base'
import {pmEntryCardStyles, pmGroupCreateMobileStyles, pmGroupCreateSharedStyles} from './styles'

export class PMGroupCreateMobile extends PMGroupCreateBase {
  static define() {
    if (!customElements.get('pm-group-create-mobile')) {
      customElements.define('pm-group-create-mobile', this)
    }
    ButtonBack.define()
    PMIconPickerMobile.define()
  }

  static styles = [
    pmEntryCardStyles,
    pmGroupCreateSharedStyles,
    pmGroupCreateMobileStyles,
  ]

  protected override shouldAutofocusNameField(): boolean {
    return false
  }

  protected override render() {
    if (!getPassmanagerRoot()) {
      return nothing
    }

    return html`
      <form @submit=${this.onSubmit}>
        <section class="form-card">
          <div class="field-group">
            ${this.renderNameField({
              label: i18n('group:name:label'),
              placeholder: i18n('group:name:placeholder:example'),
              required: true,
              counterLabel: this.model.nameCounterLabel(),
            })}
          </div>

          <div class="field-group">
            ${this.renderDescriptionField({
              placeholder: i18n('group:description:placeholder:short'),
              counterLabel: this.model.descriptionCounterLabel(),
            })}
          </div>

          <div class="icon-field">
            <div class="icon-field-copy">
              <h2>${i18n('icon:title')}</h2>
              <p>${i18n('group:icon:hint')}</p>
            </div>
            <pm-icon-picker-mobile
              class="icon-picker"
              .iconRef=${this.model.iconRef}
              icon="camera"
              trigger-label=${i18n('icon:choose-image')}
              @pm-icon-change=${this.onIconChange}
            ></pm-icon-picker-mobile>
          </div>

          <p class="access-hint">${i18n('group:access:hint')}</p>
        </section>

        <mobile-bottom-action-footer class="submit-bar">
          <cv-button
            class="submit"
            type="submit"
            variant="primary"
            size="large"
            ?disabled=${!this.model.canSubmit()}
            >${i18n('group:create:button')}</cv-button
          >
        </mobile-bottom-action-footer>
      </form>
    `
  }
}
