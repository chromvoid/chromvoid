import {createAfterRenderScheduler, html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import type {CVInputInputEvent} from '@chromvoid/uikit/components/cv-input'
import type {CVTextareaInputEvent} from '@chromvoid/uikit/components/cv-textarea'

import {nothing, type TemplateResult} from 'lit'

import {i18n} from '@project/passmanager/i18n'
import {
  GROUP_CREATE_DESCRIPTION_MAX_LENGTH,
  GROUP_CREATE_NAME_MAX_LENGTH,
  PMGroupCreateModel,
} from './group-create.model'

type FieldRenderOptions = {
  label?: string
  placeholder?: string
  required?: boolean
  counterLabel?: string
}

export abstract class PMGroupCreateBase extends ReatomLitElement {
  static properties = {
    hideBack: {type: Boolean, attribute: 'hide-back'},
  }

  declare hideBack: boolean

  protected readonly model = new PMGroupCreateModel()
  private readonly afterRenderScheduler = createAfterRenderScheduler(this)

  constructor() {
    super()
    this.hideBack = false
  }

  public override connectedCallback(): void {
    super.connectedCallback()
    if (!this.shouldAutofocusNameField()) {
      return
    }

    this.afterRenderScheduler.schedule(() => {
      this.focusNameField()
    })
  }

  public override disconnectedCallback(): void {
    this.afterRenderScheduler.cancel()
    super.disconnectedCallback()
  }

  protected shouldAutofocusNameField(): boolean {
    return true
  }

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault()
    await this.model.submit()
  }

  protected onIconChange(event: CustomEvent<{iconRef: string | undefined}>): void {
    this.model.setIconRef(event.detail.iconRef)
  }

  protected onNameInput(event: CVInputInputEvent): void {
    this.model.setName(event.detail.value)
  }

  protected onDescriptionInput(event: CVTextareaInputEvent): void {
    this.model.setDescription(event.detail.value)
  }

  protected renderNameField(options: FieldRenderOptions = {}): TemplateResult {
    const label = options.label ?? i18n('group:name')
    const placeholder = options.placeholder ?? i18n('group:name:placeholder')

    return html`
      <cv-input
        type="text"
        size="small"
        name="name"
        autocomplete="card-title"
        maxlength=${GROUP_CREATE_NAME_MAX_LENGTH}
        ?autofocus=${this.shouldAutofocusNameField()}
        placeholder=${placeholder}
        .value=${this.model.name()}
        @cv-input=${this.onNameInput}
      >
        <span slot="label" class="field-label">
          <span class="field-label-text">
            ${label}${options.required
              ? html`<span class="required-marker" aria-hidden="true">*</span>`
              : nothing}
          </span>
          ${options.counterLabel
            ? html`<span class="field-counter" aria-live="polite">${options.counterLabel}</span>`
            : nothing}
        </span>
      </cv-input>
    `
  }

  protected renderDescriptionField(options: FieldRenderOptions = {}): TemplateResult {
    const label = options.label ?? i18n('group:description')
    const placeholder = options.placeholder ?? i18n('group:description:placeholder')

    return html`
      <cv-textarea
        name="description"
        size="small"
        rows="3"
        maxlength=${GROUP_CREATE_DESCRIPTION_MAX_LENGTH}
        placeholder=${placeholder}
        .value=${this.model.description()}
        @cv-input=${this.onDescriptionInput}
      >
        <span slot="label" class="field-label">
          <span class="field-label-text">${label}</span>
          ${options.counterLabel
            ? html`<span class="field-counter" aria-live="polite">${options.counterLabel}</span>`
            : nothing}
        </span>
      </cv-textarea>
    `
  }

  protected renderIconField(): TemplateResult {
    return html`
      <pm-icon-picker
        .iconRef=${this.model.iconRef}
        icon="camera"
        @pm-icon-change=${this.onIconChange}
      ></pm-icon-picker>
    `
  }

  private focusNameField(): void {
    const workspaceHeader = this.shadowRoot?.querySelector<HTMLElement & {focusTitleInput?: () => void}>(
      'pm-workspace-header',
    )
    if (workspaceHeader?.focusTitleInput) {
      workspaceHeader.focusTitleInput()
      return
    }

    const nameField = this.shadowRoot?.querySelector<HTMLElement>('[name="name"]')
    if (!nameField) {
      return
    }

    if (nameField.tagName.toLowerCase() === 'cv-input') {
      const nativeInput = (
        nameField as HTMLElement & {shadowRoot?: ShadowRoot}
      ).shadowRoot?.querySelector<HTMLInputElement>('input')
      if (nativeInput) {
        nativeInput.focus()
        return
      }
    }

    nameField.focus()
  }
}
