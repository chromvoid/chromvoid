import {CVIcon} from '@chromvoid/uikit/components/cv-icon'
import type {CVInputInputEvent} from '@chromvoid/uikit/components/cv-input'
import type {CVTextareaInputEvent} from '@chromvoid/uikit/components/cv-textarea'
import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {nothing, type TemplateResult} from 'lit'

import {i18n} from '@project/passmanager/i18n'
import {i18n as appI18n} from 'root/i18n'
import {MobileBottomActionFooter} from 'root/shared/ui/mobile-bottom-action-footer'
import {PMAvatarIcon} from '../../pm-avatar-icon'
import {PMIconPickerMobile} from '../../pm-icon-picker.mobile'
import {GROUP_DESCRIPTION_MAX_LENGTH, GROUP_NAME_MAX_LENGTH} from '../group-form.constants'
import {pmGroupEditModel} from './group-edit.model'
import {pmGroupEditMobileStyles} from './group-edit-mobile.styles'

export class PMGroupEditMobile extends ReatomLitElement {
  static styles = [pmGroupEditMobileStyles]

  static define(): void {
    CVIcon.define()
    PMAvatarIcon.define()
    PMIconPickerMobile.define()
    MobileBottomActionFooter.define()
    if (!customElements.get('pm-group-edit-mobile')) {
      customElements.define('pm-group-edit-mobile', this)
    }
  }

  private onNameInput(event: CVInputInputEvent): void {
    pmGroupEditModel.setName(event.detail.value)
  }

  private onDescriptionInput(event: CVTextareaInputEvent): void {
    pmGroupEditModel.setDescription(event.detail.value)
  }

  private onIconChange(event: CustomEvent<{iconRef: string | undefined}>): void {
    pmGroupEditModel.setIconRef(event.detail.iconRef)
  }

  private onOpenIconPicker(): void {
    this.renderRoot.querySelector<PMIconPickerMobile>('.icon-picker-dialog')?.openChooser()
  }

  private onCancel(): void {
    void pmGroupEditModel.requestClose()
  }

  private async onSubmit(event: Event): Promise<void> {
    event.preventDefault()
    if (await pmGroupEditModel.submit()) return
    this.focusFirstInvalidField()
  }

  private focusFirstInvalidField(): void {
    const fieldName = pmGroupEditModel.nameError()
      ? 'name'
      : pmGroupEditModel.descriptionError()
        ? 'description'
        : null
    if (!fieldName) return

    const field = this.shadowRoot?.querySelector<HTMLElement>(`[name="${fieldName}"]`)
    const selector = fieldName === 'name' ? 'input' : 'textarea'
    const nativeControl = field?.shadowRoot?.querySelector<HTMLElement>(selector)
    ;(nativeControl ?? field)?.focus()
  }

  private renderLocation(): TemplateResult {
    const segments = pmGroupEditModel.locationSegments()
    const label = segments.join(' / ')

    return html`
      <section class="location-summary" aria-labelledby="group-edit-location-label">
        <div class="location-label" id="group-edit-location-label">
          <cv-icon name="map-pin" aria-hidden="true"></cv-icon>
          <span>${appI18n('details:location')}</span>
        </div>
        <div class="location-path" aria-label=${label} title=${label}>
          ${segments.map(
            (segment, index) => html`
              ${index > 0
                ? html`<cv-icon class="path-separator" name="chevron-right" aria-hidden="true"></cv-icon>`
                : html`<cv-icon class="path-separator" name="home" aria-hidden="true"></cv-icon>`}
              <span class="path-segment ${index === segments.length - 1 ? 'current' : ''}">${segment}</span>
            `,
          )}
        </div>
      </section>
    `
  }

  private renderNameField(): TemplateResult {
    const error = pmGroupEditModel.nameError()
    const hint = pmGroupEditModel.nameLegacyLimitHint()
    const readOnly = pmGroupEditModel.isReadOnly()

    return html`
      <cv-field required ?invalid=${Boolean(error)}>
        <span slot="label" class="field-label">
          <span class="field-label-text">
            ${i18n('group:name:label')}<span class="required-marker" aria-hidden="true">*</span>
          </span>
          <span class="field-counter" aria-live="polite">${pmGroupEditModel.nameCounterLabel()}</span>
        </span>
        <cv-input
          type="text"
          size="large"
          name="name"
          autocomplete="off"
          maxlength=${GROUP_NAME_MAX_LENGTH}
          placeholder=${i18n('group:name:placeholder')}
          .value=${pmGroupEditModel.name()}
          ?required=${true}
          ?invalid=${Boolean(error)}
          ?disabled=${readOnly}
          @cv-input=${this.onNameInput}
        ></cv-input>
        ${error ? html`<span slot="error" class="field-error">${error}</span>` : nothing}
        ${hint && !error ? html`<span slot="description" class="field-hint">${hint}</span>` : nothing}
      </cv-field>
    `
  }

  private renderIconField(): TemplateResult {
    const readOnly = pmGroupEditModel.isReadOnly()
    const hasIcon = Boolean(pmGroupEditModel.iconRef())

    return html`
      <section class="icon-field" aria-labelledby="group-edit-icon-label">
        <div class="section-heading">
          <span class="section-heading-text" id="group-edit-icon-label">${i18n('icon:title')}</span>
          <span class="optional-badge">${i18n('optional:title')}</span>
        </div>
        <button
          class="icon-selector"
          type="button"
          aria-labelledby="group-edit-icon-label group-edit-icon-action"
          ?disabled=${readOnly}
          @click=${this.onOpenIconPicker}
        >
          <span class="icon-selector-preview" aria-hidden="true">
            <pm-avatar-icon .iconRef=${pmGroupEditModel.iconRef()} icon="folder"></pm-avatar-icon>
          </span>
          <span class="icon-selector-action" id="group-edit-icon-action">
            ${i18n(hasIcon ? 'button:edit' : 'icon:choose')}
          </span>
          <cv-icon class="icon-selector-chevron" name="chevron-right" aria-hidden="true"></cv-icon>
        </button>
        <pm-icon-picker-mobile
          class="icon-picker-dialog"
          dialog-only
          .iconRef=${pmGroupEditModel.iconRef()}
          icon="folder"
          @pm-icon-change=${this.onIconChange}
        ></pm-icon-picker-mobile>
      </section>
    `
  }

  private renderDescriptionField(): TemplateResult {
    const error = pmGroupEditModel.descriptionError()
    const hint = pmGroupEditModel.descriptionLegacyLimitHint()
    const readOnly = pmGroupEditModel.isReadOnly()

    return html`
      <cv-field ?invalid=${Boolean(error)}>
        <span slot="label" class="field-label">
          <span class="field-label-text">
            ${i18n('group:description')}<span class="optional-badge">${i18n('optional:title')}</span>
          </span>
          <span class="field-counter" aria-live="polite">${pmGroupEditModel.descriptionCounterLabel()}</span>
        </span>
        <cv-textarea
          name="description"
          size="medium"
          rows="3"
          maxlength=${GROUP_DESCRIPTION_MAX_LENGTH}
          placeholder=${i18n('group:description:placeholder:short')}
          .value=${pmGroupEditModel.description()}
          ?invalid=${Boolean(error)}
          ?disabled=${readOnly}
          @cv-input=${this.onDescriptionInput}
        ></cv-textarea>
        ${error ? html`<span slot="error" class="field-error">${error}</span>` : nothing}
        ${hint && !error ? html`<span slot="description" class="field-hint">${hint}</span>` : nothing}
      </cv-field>
    `
  }

  protected override render(): TemplateResult {
    const pending = pmGroupEditModel.submit.pending()
    const readOnly = pmGroupEditModel.isReadOnly()
    const submitError = pmGroupEditModel.submitError()
    const footerMessage = submitError || (readOnly ? i18n('group:edit:readonly-description') : '')

    return html`
      <form novalidate @submit=${this.onSubmit}>
        <div class="edit-scroll">
          ${this.renderLocation()} ${this.renderNameField()} ${this.renderIconField()}
          ${this.renderDescriptionField()}
        </div>

        <mobile-bottom-action-footer
          class="submit-bar"
          columns="2"
          safe-area
          ?has-message=${Boolean(footerMessage)}
        >
          ${footerMessage
            ? html`<span
                slot="message"
                class="submit-message ${submitError ? 'error' : ''}"
                role=${submitError ? 'alert' : 'status'}
                >${footerMessage}</span
              >`
            : nothing}
          <cv-button
            unstyled
            type="button"
            variant="default"
            size="large"
            ?disabled=${pending}
            @click=${this.onCancel}
          >
            ${i18n('button:cancel')}
          </cv-button>
          <cv-button
            type="submit"
            variant="default"
            size="large"
            preset="action-primary"
            .loading=${pending}
            ?disabled=${pending || readOnly}
          >
            ${i18n('button:save')}
          </cv-button>
        </mobile-bottom-action-footer>
      </form>
    `
  }
}
