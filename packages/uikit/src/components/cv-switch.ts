import {createSwitch, type CreateSwitchOptions, type SwitchModel} from '@chromvoid/headless-ui'
import {css, html, nothing} from 'lit'
import type {PropertyValues} from 'lit'

import {FormAssociatedReatomElement} from '../form-associated/FormAssociatedReatomElement'
import type {FormAssociatedValidity} from '../form-associated/withFormAssociated'

let cvSwitchNonce = 0

type CVSwitchSize = 'small' | 'medium' | 'large'

export interface CVSwitchCheckedDetail {
  checked: boolean
}

export type CVSwitchInputEvent = CustomEvent<CVSwitchCheckedDetail>
export type CVSwitchChangeEvent = CustomEvent<CVSwitchCheckedDetail>

export interface CVSwitchEventMap {
  'cv-input': CVSwitchInputEvent
  'cv-change': CVSwitchChangeEvent
}

export class CVSwitch extends FormAssociatedReatomElement {
  static elementName = 'cv-switch'

  static get properties() {
    return {
      name: {type: String},
      value: {type: String},
      checked: {type: Boolean, reflect: true},
      disabled: {type: Boolean, reflect: true},
      required: {type: Boolean, reflect: true},
      size: {type: String, reflect: true},
      helpText: {type: String, attribute: 'help-text', reflect: true},
    }
  }

  declare name: string
  declare value: string
  declare checked: boolean
  declare disabled: boolean
  declare required: boolean
  declare size: CVSwitchSize
  declare helpText: string

  private readonly idBase = `cv-switch-${++cvSwitchNonce}`
  private readonly helpTextId = `${this.idBase}-help-text`
  private modelOptions: CreateSwitchOptions
  private model: SwitchModel
  private _hasSlottedHelpText = false
  private defaultChecked = false
  private didCaptureDefaultChecked = false

  constructor() {
    super()
    this.name = ''
    this.value = 'on'
    this.checked = false
    this.disabled = false
    this.required = false
    this.size = 'medium'
    this.helpText = ''
    this.modelOptions = {
      idBase: this.idBase,
      isOn: this.checked,
      isDisabled: this.isEffectivelyDisabled(),
    }
    this.model = createSwitch(this.modelOptions)
  }

  static styles = [
    css`
      :host {
        display: inline-block;
        --cv-switch-width: 44px;
        --cv-switch-height: 24px;
        --cv-switch-thumb-size: 18px;
        --cv-switch-gap: var(--cv-space-2, 8px);
      }

      [part='base'] {
        display: inline-flex;
        align-items: center;
        gap: var(--cv-switch-gap);
        cursor: pointer;
        flex-wrap: wrap;
      }

      [part='control'] {
        display: inline-flex;
        align-items: center;
        inline-size: var(--cv-switch-width);
        block-size: var(--cv-switch-height);
        padding: 2px;
        border-radius: 999px;
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface-elevated, #1d2432);
        flex-shrink: 0;
        position: relative;
        transition:
          background var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease),
          border-color var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease);
      }

      [part='thumb'] {
        inline-size: var(--cv-switch-thumb-size);
        block-size: var(--cv-switch-thumb-size);
        border-radius: 50%;
        background: var(--cv-color-text-muted, #9aa6bf);
        transform: translateX(0);
        transition:
          transform var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease),
          background var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease);
      }

      [part='toggled'],
      [part='untoggled'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      :host([checked]) [part='control'] {
        border-color: var(--cv-color-primary, #65d7ff);
        background: color-mix(
          in oklab,
          var(--cv-color-primary, #65d7ff) 25%,
          var(--cv-color-surface-elevated, #1d2432)
        );
      }

      :host([checked]) [part='thumb'] {
        transform: translateX(calc(var(--cv-switch-width) - var(--cv-switch-thumb-size) - 6px));
        background: var(--cv-color-primary, #65d7ff);
      }

      [part='control']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 2px;
      }

      :host([disabled]) [part='base'] {
        opacity: 0.55;
        cursor: not-allowed;
      }

      :host([size='small']) {
        --cv-switch-width: 36px;
        --cv-switch-height: 20px;
        --cv-switch-thumb-size: 14px;
      }

      :host([size='large']) {
        --cv-switch-width: 52px;
        --cv-switch-height: 28px;
        --cv-switch-thumb-size: 22px;
      }

      [part='help-text'] {
        display: block;
        inline-size: 100%;
        color: var(--cv-switch-help-text-color, var(--cv-color-text-muted, #9aa6bf));
        font-size: var(--cv-switch-help-text-font-size, 0.85em);
      }
    `,
  ]

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  private get hasHelpText(): boolean {
    return this.helpText !== '' || this._hasSlottedHelpText
  }

  override connectedCallback(): void {
    super.connectedCallback()
    if (!this.didCaptureDefaultChecked) {
      this.defaultChecked = this.checked
      this.didCaptureDefaultChecked = true
    }
  }

  override willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties)

    if (changedProperties.has('helpText')) {
      this.modelOptions.ariaDescribedBy = this.hasHelpText ? this.helpTextId : undefined
    }

    if (changedProperties.has('disabled')) {
      this.model.actions.setDisabled(this.isEffectivelyDisabled())
    }

    if (changedProperties.has('checked') && this.model.state.isOn() !== this.checked) {
      this.model.actions.setOn(this.checked)
    }

    if (
      changedProperties.has('checked') ||
      changedProperties.has('disabled') ||
      changedProperties.has('required') ||
      changedProperties.has('name') ||
      changedProperties.has('value')
    ) {
      this.syncFormAssociatedState()
    }
  }

  private handleHelpTextSlotChange(event: Event) {
    const slot = event.target as HTMLSlotElement
    const assignedNodes = slot.assignedNodes({flatten: true})
    const hadSlottedHelpText = this._hasSlottedHelpText
    this._hasSlottedHelpText = assignedNodes.length > 0
    if (hadSlottedHelpText !== this._hasSlottedHelpText) {
      this.modelOptions.ariaDescribedBy = this.hasHelpText ? this.helpTextId : undefined
      this.requestUpdate()
    }
  }

  private dispatchSwitchEvent(name: keyof CVSwitchEventMap, detail: CVSwitchCheckedDetail): void {
    this.dispatchEvent(
      new CustomEvent(name, {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private dispatchInput(detail: CVSwitchCheckedDetail): void {
    this.dispatchSwitchEvent('cv-input', detail)
  }

  private dispatchChange(detail: CVSwitchCheckedDetail): void {
    this.dispatchSwitchEvent('cv-change', detail)
  }

  private syncFromModelAndEmit(previousValue: boolean): void {
    const nextValue = this.model.state.isOn()
    this.checked = nextValue
    this.syncFormAssociatedState()

    if (previousValue === nextValue) return

    const detail = {checked: nextValue}
    this.dispatchInput(detail)
    this.dispatchChange(detail)
  }

  protected override onFormDisabledChanged(_disabled: boolean): void {
    this.model.actions.setDisabled(this.isEffectivelyDisabled())
  }

  protected override onFormReset(): void {
    this.checked = this.defaultChecked
    this.model.actions.setOn(this.defaultChecked)
  }

  protected override onFormStateRestore(state: string | File | FormData | null): void {
    const isChecked = typeof state === 'string'
    this.checked = isChecked
    this.model.actions.setOn(isChecked)
  }

  protected override isFormAssociatedDisabled(): boolean {
    return this.isEffectivelyDisabled()
  }

  protected override getFormAssociatedValue(): string | File | FormData | null {
    return this.checked ? (this.value || 'on') : null
  }

  protected override getFormAssociatedValidity(): FormAssociatedValidity {
    if (this.required && !this.checked) {
      return {
        flags: {valueMissing: true},
        message: 'Please turn this switch on.',
      }
    }

    return {flags: {}}
  }

  private isEffectivelyDisabled(): boolean {
    return this.disabled || this.formDisabled
  }

  private handleClick() {
    const previousValue = this.model.state.isOn()
    this.model.contracts.getSwitchProps().onClick()
    this.syncFromModelAndEmit(previousValue)
  }

  private handleKeyDown(event: KeyboardEvent) {
    const previousValue = this.model.state.isOn()
    this.model.contracts.getSwitchProps().onKeyDown(event)
    this.syncFromModelAndEmit(previousValue)
  }

  protected override render() {
    const props = this.model.contracts.getSwitchProps()
    const isChecked = this.model.state.isOn()

    return html`
      <div part="base" @click=${this.handleClick}>
        <div
          id=${props.id}
          role=${props.role}
          tabindex=${props.tabindex}
          aria-checked=${props['aria-checked']}
          aria-disabled=${props['aria-disabled']}
          aria-required=${this.required ? 'true' : nothing}
          aria-labelledby=${props['aria-labelledby'] ?? nothing}
          aria-describedby=${props['aria-describedby'] ?? nothing}
          part="control"
          @keydown=${this.handleKeyDown}
        >
          <span part="toggled" ?hidden=${!isChecked}><slot name="toggled"></slot></span>
          <span part="untoggled" ?hidden=${isChecked}><slot name="untoggled"></slot></span>
          <span part="thumb"></span>
        </div>
        <span part="label"><slot></slot></span>
        ${this.hasHelpText
          ? html`<span part="help-text" id=${this.helpTextId}>
              <slot name="help-text" @slotchange=${this.handleHelpTextSlotChange}>${this.helpText}</slot>
            </span>`
          : html`<slot
              name="help-text"
              @slotchange=${this.handleHelpTextSlotChange}
              style="display:none"
            ></slot>`}
      </div>
    `
  }
}
