import {createCheckbox, type CheckboxModel, type CheckboxValue} from '@chromvoid/headless-ui'
import {css, html, nothing} from 'lit'
import type {PropertyValues} from 'lit'

import {FormAssociatedReatomElement} from '../form-associated/FormAssociatedReatomElement'
import type {FormAssociatedValidity} from '../form-associated/withFormAssociated'

let cvCheckboxNonce = 0

export interface CVCheckboxEventDetail {
  value: CheckboxValue
  checked: boolean
  indeterminate: boolean
}

export type CVCheckboxInputEvent = CustomEvent<CVCheckboxEventDetail>
export type CVCheckboxChangeEvent = CustomEvent<CVCheckboxEventDetail>

export interface CVCheckboxEventMap {
  'cv-input': CVCheckboxInputEvent
  'cv-change': CVCheckboxChangeEvent
}

export class CVCheckbox extends FormAssociatedReatomElement {
  static elementName = 'cv-checkbox'
  private static readonly forwardedHostAttributes = ['tabindex', 'aria-label', 'aria-labelledby', 'aria-describedby']

  static get properties() {
    return {
      name: {type: String},
      value: {type: String},
      checked: {type: Boolean, reflect: true},
      indeterminate: {type: Boolean, reflect: true},
      disabled: {type: Boolean, reflect: true},
      readOnly: {type: Boolean, attribute: 'read-only', reflect: true},
      required: {type: Boolean, reflect: true},
    }
  }

  static override get observedAttributes() {
    return [...new Set([...super.observedAttributes, ...this.forwardedHostAttributes])]
  }

  declare name: string
  declare value: string
  declare checked: boolean
  declare indeterminate: boolean
  declare disabled: boolean
  declare readOnly: boolean
  declare required: boolean

  private readonly idBase = `cv-checkbox-${++cvCheckboxNonce}`
  private model: CheckboxModel
  private defaultChecked = false
  private defaultIndeterminate = false
  private didCaptureDefaultState = false

  constructor() {
    super()
    this.name = ''
    this.value = 'on'
    this.checked = false
    this.indeterminate = false
    this.disabled = false
    this.readOnly = false
    this.required = false
    this.model = this.createModel()
  }

  get mixed(): boolean {
    return this.indeterminate
  }

  set mixed(value: boolean) {
    this.indeterminate = value
  }

  static styles = [
    css`
      :host {
        display: inline-block;
      }

      [part='base'] {
        display: inline-flex;
        align-items: center;
        gap: var(--cv-space-2, 8px);
        cursor: pointer;
        user-select: none;
        color: var(--cv-color-text, #e8ecf6);
      }

      [part='indicator'] {
        inline-size: 18px;
        block-size: 18px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--cv-radius-sm, 6px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        transition:
          border-color var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease),
          background var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease);
      }

      [part='checkmark'] {
        inline-size: 10px;
        block-size: 10px;
        border-radius: 2px;
        background: transparent;
        transition: background var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease);
      }

      :host([checked]) [part='indicator'] {
        border-color: var(--cv-color-primary, #65d7ff);
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 24%, var(--cv-color-surface, #141923));
      }

      :host([checked]) [part='checkmark'] {
        background: var(--cv-color-primary, #65d7ff);
      }

      :host([indeterminate]) [part='checkmark'] {
        inline-size: 10px;
        block-size: 2px;
        border-radius: 999px;
        background: var(--cv-color-primary, #65d7ff);
      }

      [part='base']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 2px;
      }

      :host([disabled]) [part='base'] {
        opacity: 0.55;
        cursor: not-allowed;
      }
    `,
  ]

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  override connectedCallback(): void {
    super.connectedCallback()
    if (!this.didCaptureDefaultState) {
      this.defaultChecked = this.checked
      this.defaultIndeterminate = this.indeterminate
      this.didCaptureDefaultState = true
    }
  }

  override attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    super.attributeChangedCallback(name, oldValue, newValue)

    if (oldValue === newValue) return
    if (!CVCheckbox.forwardedHostAttributes.includes(name)) return

    this.requestUpdate()
  }

  override willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties)

    if (changedProperties.has('disabled')) {
      this.model.actions.setDisabled(this.isEffectivelyDisabled())
    }

    if (changedProperties.has('readOnly')) {
      this.model.actions.setReadOnly(this.readOnly)
    }

    if (changedProperties.has('checked') || changedProperties.has('indeterminate')) {
      const nextValue: CheckboxValue = this.indeterminate ? 'mixed' : this.checked
      if (this.model.state.checked() !== nextValue) {
        this.model.actions.setChecked(nextValue)
      }
    }

    if (
      changedProperties.has('checked') ||
      changedProperties.has('indeterminate') ||
      changedProperties.has('disabled') ||
      changedProperties.has('required') ||
      changedProperties.has('name') ||
      changedProperties.has('value')
    ) {
      this.syncFormAssociatedState()
    }
  }

  private createModel(): CheckboxModel {
    return createCheckbox({
      idBase: this.idBase,
      allowMixed: true,
      checked: this.indeterminate ? 'mixed' : this.checked,
      isDisabled: this.isEffectivelyDisabled(),
      isReadOnly: this.readOnly,
    })
  }

  protected override onFormDisabledChanged(_disabled: boolean): void {
    this.model.actions.setDisabled(this.isEffectivelyDisabled())
  }

  protected override onFormReset(): void {
    const nextValue: CheckboxValue = this.defaultIndeterminate ? 'mixed' : this.defaultChecked
    this.checked = this.defaultChecked
    this.indeterminate = this.defaultIndeterminate
    this.model.actions.setChecked(nextValue)
  }

  protected override onFormStateRestore(state: string | File | FormData | null): void {
    const isChecked = typeof state === 'string'
    this.checked = isChecked
    this.indeterminate = false
    this.model.actions.setChecked(isChecked)
  }

  protected override isFormAssociatedDisabled(): boolean {
    return this.isEffectivelyDisabled()
  }

  protected override getFormAssociatedValue(): string | File | FormData | null {
    if (!this.checked || this.indeterminate) {
      return null
    }

    return this.value || 'on'
  }

  protected override getFormAssociatedValidity(): FormAssociatedValidity {
    if (this.required && (!this.checked || this.indeterminate)) {
      return {
        flags: {valueMissing: true},
        message: 'Please check this box.',
      }
    }

    return {flags: {}}
  }

  private isEffectivelyDisabled(): boolean {
    return this.disabled || this.formDisabled
  }

  private dispatchCheckboxEvent(name: keyof CVCheckboxEventMap, detail: CVCheckboxEventDetail): void {
    this.dispatchEvent(
      new CustomEvent(name, {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private dispatchInput(detail: CVCheckboxEventDetail): void {
    this.dispatchCheckboxEvent('cv-input', detail)
  }

  private dispatchChange(detail: CVCheckboxEventDetail): void {
    this.dispatchCheckboxEvent('cv-change', detail)
  }

  private syncFromModelAndEmit(previousValue: CheckboxValue): void {
    const nextValue = this.model.state.checked()

    this.checked = nextValue === true
    this.indeterminate = nextValue === 'mixed'
    this.syncFormAssociatedState()

    if (previousValue === nextValue) return

    const detail: CVCheckboxEventDetail = {
      value: nextValue,
      checked: nextValue === true,
      indeterminate: nextValue === 'mixed',
    }

    this.dispatchInput(detail)
    this.dispatchChange(detail)
  }

  private handleClick() {
    const previousValue = this.model.state.checked()
    this.model.contracts.getCheckboxProps().onClick()
    this.syncFromModelAndEmit(previousValue)
  }

  private handleKeyDown(event: KeyboardEvent) {
    const previousValue = this.model.state.checked()
    this.model.contracts.getCheckboxProps().onKeyDown(event)
    this.syncFromModelAndEmit(previousValue)
  }

  protected override render() {
    const props = this.model.contracts.getCheckboxProps()
    const hostTabIndex = this.getAttribute('tabindex')
    const hostAriaLabel = this.getAttribute('aria-label')
    const hostAriaLabelledBy = this.getAttribute('aria-labelledby')
    const hostAriaDescribedBy = this.getAttribute('aria-describedby')
    const tabIndex = this.isEffectivelyDisabled() ? '-1' : (hostTabIndex ?? props.tabindex)

    return html`
      <div
        id=${props.id}
        role=${props.role}
        tabindex=${tabIndex}
        aria-checked=${props['aria-checked']}
        aria-label=${hostAriaLabel ?? nothing}
        aria-disabled=${props['aria-disabled'] ?? nothing}
        aria-readonly=${props['aria-readonly'] ?? nothing}
        aria-required=${this.required ? 'true' : nothing}
        aria-labelledby=${hostAriaLabelledBy ?? props['aria-labelledby'] ?? nothing}
        aria-describedby=${hostAriaDescribedBy ?? props['aria-describedby'] ?? nothing}
        part="base"
        @click=${this.handleClick}
        @keydown=${this.handleKeyDown}
      >
        <span part="indicator">
          <span part="checkmark"></span>
        </span>
        <slot></slot>
      </div>
    `
  }
}
