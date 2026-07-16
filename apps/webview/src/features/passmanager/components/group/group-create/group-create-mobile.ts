import {CVIcon} from '@chromvoid/uikit/components/cv-icon'
import {html} from '@chromvoid/uikit/reatom-lit'
import {nothing, type TemplateResult} from 'lit'

import {i18n} from '@project/passmanager/i18n'
import {getPassmanagerRoot} from '../../../models/pm-root.adapter'
import {MobileBottomActionFooter} from '../../../../../shared/ui/mobile-bottom-action-footer'
import {PMGroupCreateBase} from './group-create-base'
import {PMGroupCreateModel} from './group-create.model'
import {
  DEFAULT_GROUP_ICON_PRESET,
  GROUP_ICON_COLOR_OPTIONS,
  GROUP_ICON_PRESET_OPTIONS,
  type GroupIconColorName,
  type GroupIconPresetName,
} from './group-icon-presets'
import {pmGroupCreateMobileStyles, pmGroupCreateSharedStyles} from './styles'

export class PMGroupCreateMobile extends PMGroupCreateBase {
  constructor() {
    super(new PMGroupCreateModel({defaultPreset: DEFAULT_GROUP_ICON_PRESET}))
  }

  static define() {
    if (!customElements.get('pm-group-create-mobile')) {
      customElements.define('pm-group-create-mobile', this)
    }
    CVIcon.define()
    MobileBottomActionFooter.define()
  }

  static styles = [pmGroupCreateSharedStyles, pmGroupCreateMobileStyles]

  protected override shouldAutofocusNameField(): boolean {
    return false
  }

  private onPresetIconClick(event: Event): void {
    const icon = (event.currentTarget as HTMLElement).dataset['icon'] as GroupIconPresetName | undefined
    if (icon && GROUP_ICON_PRESET_OPTIONS.some((option) => option.id === icon)) {
      this.model.setPresetIcon(icon)
    }
  }

  private onPresetColorClick(event: Event): void {
    const color = (event.currentTarget as HTMLElement).dataset['color'] as GroupIconColorName | undefined
    if (color && GROUP_ICON_COLOR_OPTIONS.some((option) => option.id === color)) {
      this.model.setPresetColor(color)
    }
  }

  private renderLocation(): TemplateResult {
    const contextItems = this.model.getContextItems()
    const previewName = this.model.trimmedName() || i18n('group:create:new-group' as never)

    return html`
      <section class="location-card" aria-labelledby="group-create-location-title">
        <header class="location-heading">
          <cv-icon name="map-pin" aria-hidden="true"></cv-icon>
          <span id="group-create-location-title">${i18n('group:create:location' as never)}</span>
        </header>
        <ol class="location-path">
          ${contextItems.map(
            (item, index) => html`
              ${index > 0
                ? html`<li class="path-separator" aria-hidden="true">
                    <cv-icon name="chevron-right"></cv-icon>
                  </li>`
                : nothing}
              <li class="path-chip ${index === contextItems.length - 1 ? 'current' : ''}">
                ${index === 0 ? html`<cv-icon name="home" aria-hidden="true"></cv-icon>` : nothing}
                <span>${item.label}</span>
              </li>
            `,
          )}
          <li class="path-separator preview-separator" aria-hidden="true">
            <cv-icon name="chevron-right"></cv-icon>
          </li>
          <li class="path-chip preview" title=${previewName}>${previewName}</li>
        </ol>
      </section>
    `
  }

  private renderIconPicker(): TemplateResult {
    const selection = this.model.presetSelection() ?? DEFAULT_GROUP_ICON_PRESET

    return html`
      <section class="icon-field" aria-labelledby="group-create-icon-title">
        <header class="section-heading">
          <span id="group-create-icon-title">${i18n('group:icon-and-color' as never)}</span>
          <span class="optional-badge">${i18n('optional:title')}</span>
        </header>
        <div class="icon-picker-layout">
          <div class="icon-preview icon-color-${selection.color}" aria-hidden="true">
            <cv-icon name=${selection.icon}></cv-icon>
          </div>
          <div class="icon-controls">
            <div class="icon-options" role="group" aria-label=${i18n('group:icon:presets' as never)}>
              ${GROUP_ICON_PRESET_OPTIONS.map(
                (option) => html`
                  <button
                    class="icon-option"
                    type="button"
                    data-icon=${option.id}
                    aria-label=${i18n(option.labelKey as never)}
                    aria-pressed=${String(selection.icon === option.id)}
                    title=${i18n(option.labelKey as never)}
                    @click=${this.onPresetIconClick}
                  >
                    <cv-icon name=${option.icon} aria-hidden="true"></cv-icon>
                  </button>
                `,
              )}
            </div>
            <div class="color-options" role="group" aria-label=${i18n('group:icon:colors' as never)}>
              ${GROUP_ICON_COLOR_OPTIONS.map(
                (option) => html`
                  <button
                    class="color-option icon-color-${option.id}"
                    type="button"
                    data-color=${option.id}
                    aria-label=${i18n(option.labelKey as never)}
                    aria-pressed=${String(selection.color === option.id)}
                    title=${i18n(option.labelKey as never)}
                    @click=${this.onPresetColorClick}
                  ></button>
                `,
              )}
            </div>
          </div>
        </div>
      </section>
    `
  }

  private renderAccessHint(): TemplateResult {
    return html`
      <aside class="access-hint">
        <span class="access-hint-icon" aria-hidden="true"><cv-icon name="lock"></cv-icon></span>
        <span class="access-hint-copy">
          <strong>${i18n('group:access:title' as never)}</strong>
          <span>${i18n('group:access:description' as never)}</span>
        </span>
      </aside>
    `
  }

  private renderReadOnly(): TemplateResult {
    return html`
      <section class="readonly-state">
        ${this.renderLocation()}
        <div class="readonly-copy">
          <span class="readonly-icon" aria-hidden="true"><cv-icon name="lock"></cv-icon></span>
          <h1>${i18n('group:create:readonly-title' as never)}</h1>
          <p>${i18n('group:create:readonly-description' as never)}</p>
        </div>
      </section>
    `
  }

  protected override render() {
    if (!getPassmanagerRoot()) {
      return nothing
    }

    if (this.model.isReadOnly()) {
      return this.renderReadOnly()
    }

    const submitError = this.model.submitError()

    return html`
      <form @submit=${this.onSubmit}>
        <div class="create-scroll">
          ${this.renderLocation()}

          <div class="name-field">
            ${this.renderNameField({
              label: i18n('group:name:label'),
              placeholder: i18n('group:name:placeholder:example'),
              required: true,
              counterLabel: this.model.nameCounterLabel(),
              error: this.model.nameError(),
              size: 'large',
            })}
          </div>

          ${this.renderIconPicker()}

          <div class="description-field">
            ${this.renderDescriptionField({
              placeholder: i18n('group:description:placeholder:short'),
              optional: true,
              counterLabel: this.model.descriptionCounterLabel(),
              size: 'medium',
            })}
          </div>

          ${this.renderAccessHint()}
        </div>

        <mobile-bottom-action-footer class="submit-bar" ?has-message=${Boolean(submitError)}>
          ${submitError
            ? html`<span slot="message" class="submit-error" role="alert">${submitError}</span>`
            : nothing}
          <cv-button
            class="submit"
            type="submit"
            variant="primary"
            size="large"
            .loading=${this.model.isSubmitting()}
            ?disabled=${this.model.isSubmitting() || this.model.isReadOnly()}
          >
            <cv-icon slot="prefix" name="plus" aria-hidden="true"></cv-icon>
            ${this.model.isSubmitting() ? i18n('group:create:pending' as never) : i18n('group:create:title')}
          </cv-button>
        </mobile-bottom-action-footer>
      </form>
    `
  }
}
