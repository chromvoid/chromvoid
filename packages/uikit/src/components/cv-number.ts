import {createNumber, type NumberModel} from '@chromvoid/headless-ui'
import {css, html, nothing} from 'lit'
import type {PropertyValues} from 'lit'

import {FormAssociatedReatomElement} from '../form-associated/FormAssociatedReatomElement'

type CVNumberSize = 'small' | 'medium' | 'large'
type CVNumberVariant = 'outlined' | 'filled'

export interface CVNumberValueDetail {
  value: number
}

export type CVNumberChangeEvent = CustomEvent<CVNumberValueDetail>
export type CVNumberClearEvent = CustomEvent<Record<string, never>>
export type CVNumberFocusEvent = CustomEvent<Record<string, never>>
export type CVNumberBlurEvent = CustomEvent<Record<string, never>>

export interface CVNumberEventMap {
  'cv-change': CVNumberChangeEvent
  'cv-clear': CVNumberClearEvent
  'cv-focus': CVNumberFocusEvent
  'cv-blur': CVNumberBlurEvent
}

let cvNumberNonce = 0

export class CVNumber extends FormAssociatedReatomElement {
  static elementName = 'cv-number'

  static get properties() {
    return {
      value: {type: Number},
      defaultValue: {type: Number, attribute: 'default-value'},
      min: {type: Number},
      max: {type: Number},
      step: {type: Number},
      largeStep: {type: Number, attribute: 'large-step'},
      name: {type: String},
      disabled: {type: Boolean, reflect: true},
      readOnly: {type: Boolean, attribute: 'read-only', reflect: true},
      required: {type: Boolean, reflect: true},
      clearable: {type: Boolean, reflect: true},
      stepper: {type: Boolean, reflect: true},
      placeholder: {type: String},
      size: {type: String, reflect: true},
      variant: {type: String, reflect: true},
      ariaLabel: {type: String, attribute: 'aria-label'},
      ariaLabelledBy: {type: String, attribute: 'aria-labelledby'},
      ariaDescribedBy: {type: String, attribute: 'aria-describedby'},
    }
  }

  declare value: number
  declare defaultValue: number | undefined
  declare min: number | undefined
  declare max: number | undefined
  declare step: number
  declare largeStep: number
  declare name: string
  declare disabled: boolean
  declare readOnly: boolean
  declare required: boolean
  declare clearable: boolean
  declare stepper: boolean
  declare placeholder: string
  declare size: CVNumberSize
  declare variant: CVNumberVariant
  declare ariaLabel: string
  declare ariaLabelledBy: string
  declare ariaDescribedBy: string

  private readonly idBase = `cv-number-${++cvNumberNonce}`
  private model!: NumberModel
  private modelInitialized = false
  private _valueOnFocus: number | null = null

  constructor() {
    super()
    this.value = 0
    this.defaultValue = undefined
    this.min = undefined
    this.max = undefined
    this.step = 1
    this.largeStep = 10
    this.name = ''
    this.disabled = false
    this.readOnly = false
    this.required = false
    this.clearable = false
    this.stepper = false
    this.placeholder = ''
    this.size = 'medium'
    this.variant = 'outlined'
    this.ariaLabel = ''
    this.ariaLabelledBy = ''
    this.ariaDescribedBy = ''
  }

  static styles = [
    css`
      :host {
        display: inline-block;
        --cv-number-height: 36px;
        --cv-number-padding-inline: var(--cv-space-3, 12px);
        --cv-number-font-size: var(--cv-font-size-base, 14px);
        --cv-number-border-radius: var(--cv-radius-sm, 6px);
        --cv-number-border-color: var(--cv-color-border, #2a3245);
        --cv-number-background: transparent;
        --cv-number-color: var(--cv-color-text, #e8ecf6);
        --cv-number-placeholder-color: var(--cv-color-text-muted, #6b7a99);
        --cv-number-focus-ring: 0 0 0 2px var(--cv-color-primary, #65d7ff);
        --cv-number-icon-size: 1em;
        --cv-number-gap: var(--cv-space-2, 8px);
        --cv-number-transition-duration: var(--cv-duration-fast, 120ms);
        --cv-number-stepper-width: 24px;
      }

      [part='base'] {
        display: inline-flex;
        align-items: center;
        gap: var(--cv-number-gap);
        padding-inline: var(--cv-number-padding-inline);
        height: var(--cv-number-height);
        font-size: var(--cv-number-font-size);
        border-radius: var(--cv-number-border-radius);
        border: 1px solid var(--cv-number-border-color);
        background: var(--cv-number-background);
        color: var(--cv-number-color);
        cursor: text;
        transition:
          border-color var(--cv-number-transition-duration) var(--cv-easing-standard, ease),
          background var(--cv-number-transition-duration) var(--cv-easing-standard, ease),
          box-shadow var(--cv-number-transition-duration) var(--cv-easing-standard, ease);
        box-sizing: border-box;
        width: 100%;
      }

      [part='input'] {
        flex: 1;
        min-width: 0;
        border: none;
        outline: none;
        background: transparent;
        color: inherit;
        font: inherit;
        padding: 0;
        margin: 0;
        font-variant-numeric: tabular-nums;
      }

      [part='input']::placeholder {
        color: var(--cv-number-placeholder-color);
      }

      [part='prefix'],
      [part='suffix'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: var(--cv-number-icon-size);
      }

      [part='clear-button'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: var(--cv-number-icon-size);
        user-select: none;
      }

      [part='clear-button'][hidden] {
        display: none;
      }

      [part='stepper'] {
        display: inline-flex;
        flex-direction: column;
        gap: 1px;
      }

      [part='stepper'][hidden] {
        display: none;
      }

      [part='increment'],
      [part='decrement'] {
        width: var(--cv-number-stepper-width);
        border-radius: 4px;
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface-elevated, #1d2432);
        color: var(--cv-color-text, #e8ecf6);
        padding: 0;
        line-height: 1;
        cursor: pointer;
      }

      [part='form-control-label'] {
        display: block;
      }

      [part='form-control-help-text'] {
        display: block;
      }

      /* --- variant: outlined (default) --- */
      :host([variant='outlined']) [part='base'] {
        border-color: var(--cv-number-border-color);
        background: var(--cv-number-background);
      }

      /* --- variant: filled --- */
      :host([variant='filled']) [part='base'] {
        background: var(--cv-color-surface, #141923);
        border-color: transparent;
      }

      /* --- focused --- */
      :host([focused]) [part='base'] {
        box-shadow: var(--cv-number-focus-ring);
      }

      /* --- sizes --- */
      :host([size='small']) {
        --cv-number-height: 30px;
        --cv-number-padding-inline: var(--cv-space-2, 8px);
        --cv-number-font-size: var(--cv-font-size-sm, 13px);
      }

      :host([size='large']) {
        --cv-number-height: 42px;
        --cv-number-padding-inline: var(--cv-space-4, 16px);
        --cv-number-font-size: var(--cv-font-size-md, 16px);
      }

      /* --- disabled --- */
      :host([disabled]) {
        pointer-events: none;
      }

      :host([disabled]) [part='base'] {
        opacity: 0.55;
        cursor: not-allowed;
      }

      :host([disabled]) [part='input'] {
        cursor: not-allowed;
      }

      /* --- read-only --- */
      :host([read-only]) [part='base'] {
        cursor: default;
      }

      :host([read-only]) [part='input'] {
        cursor: default;
      }

      /* --- required --- */
      :host([required]) {
        /* No default visual change; stylable via part selectors */
      }

      /* --- clearable --- */
      :host([clearable]) {
        /* Clear button space reserved in layout */
      }

      /* --- stepper --- */
      :host([stepper]) {
        /* Stepper buttons rendered and visible */
      }
    `,
  ]

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  private isEffectivelyDisabled(): boolean {
    return this.disabled || this.formDisabled
  }

  protected override isFormAssociatedDisabled(): boolean {
    return this.isEffectivelyDisabled()
  }

  protected override getFormAssociatedValue(): string | File | FormData | null {
    if (!this.modelInitialized) return String(this.value)
    return String(this.model.state.value())
  }

  private toFiniteOrUndefined(value: number | undefined | null): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
  }

  private createModel(): NumberModel {
    return createNumber({
      idBase: this.idBase,
      value: this.value,
      defaultValue: this.toFiniteOrUndefined(this.defaultValue),
      min: this.toFiniteOrUndefined(this.min),
      max: this.toFiniteOrUndefined(this.max),
      step: this.step,
      largeStep: this.largeStep,
      disabled: this.isEffectivelyDisabled(),
      readonly: this.readOnly,
      required: this.required,
      clearable: this.clearable,
      stepper: this.stepper,
      placeholder: this.placeholder,
      ariaLabel: this.ariaLabel || undefined,
      ariaLabelledBy: this.ariaLabelledBy || undefined,
      ariaDescribedBy: this.ariaDescribedBy || undefined,
      onClear: () => {
        this.syncValueFromModel()
        this.dispatchEvent(
          new CustomEvent<CVNumberClearEvent['detail']>('cv-clear', {
            detail: {},
            bubbles: true,
            composed: true,
          }),
        )
      },
    })
  }

  private ensureModel(): void {
    if (!this.modelInitialized) {
      this.model = this.createModel()
      this.modelInitialized = true
    }
  }

  override willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties)

    // First render: create the model with all finalized properties
    if (!this.modelInitialized) {
      this.ensureModel()
      this.syncValueFromModel()
      this.reflectHostAttributes()
      this.syncFormAssociatedState()
      return
    }

    // Recreate model when immutable spinbutton options change after initialization
    if (
      changedProperties.has('min') ||
      changedProperties.has('max') ||
      changedProperties.has('step') ||
      changedProperties.has('largeStep') ||
      changedProperties.has('defaultValue') ||
      changedProperties.has('ariaLabel') ||
      changedProperties.has('ariaLabelledBy') ||
      changedProperties.has('ariaDescribedBy')
    ) {
      this.model = this.createModel()
      this.syncValueFromModel()
      this.syncFormAssociatedState()
      this.reflectHostAttributes()
      return
    }

    // Sync mutable state to headless
    if (changedProperties.has('value') && this.model.state.value() !== this.value) {
      this.model.actions.setValue(this.value)
      this.syncValueFromModel()
    }

    if (changedProperties.has('disabled')) {
      this.model.actions.setDisabled(this.isEffectivelyDisabled())
    }

    if (changedProperties.has('readOnly')) {
      this.model.actions.setReadOnly(this.readOnly)
    }

    if (changedProperties.has('required')) {
      this.model.actions.setRequired(this.required)
    }

    if (changedProperties.has('clearable')) {
      this.model.actions.setClearable(this.clearable)
    }

    if (changedProperties.has('stepper')) {
      this.model.actions.setStepper(this.stepper)
    }

    if (changedProperties.has('placeholder')) {
      this.model.actions.setPlaceholder(this.placeholder)
    }

    this.reflectHostAttributes()
    this.syncFormAssociatedState()
  }

  private reflectHostAttributes(): void {
    this.toggleAttribute('focused', this.model.state.focused())
    this.toggleAttribute('filled', this.model.state.filled())
  }

  private syncValueFromModel(): void {
    const nextValue = this.model.state.value()
    if (this.value !== nextValue) {
      this.value = nextValue
    }
  }

  // --- Form association ---

  protected override onFormDisabledChanged(_disabled: boolean): void {
    if (!this.modelInitialized) return
    this.model.actions.setDisabled(this.isEffectivelyDisabled())
  }

  protected override onFormReset(): void {
    if (!this.modelInitialized) return
    const defaultVal = this.model.state.defaultValue()
    this.model.actions.setValue(defaultVal)
    this.syncValueFromModel()
  }

  protected override onFormStateRestore(state: string | File | FormData | null): void {
    if (typeof state !== 'string') return
    if (!this.modelInitialized) return
    const parsed = Number(state)
    if (!Number.isFinite(parsed)) return
    this.model.actions.setValue(parsed)
    this.syncValueFromModel()
  }

  get type(): string {
    return 'cv-number'
  }

  override focus(options?: FocusOptions): void {
    const input = this.shadowRoot?.querySelector('[part="input"]') as HTMLInputElement | null
    if (input) {
      input.focus(options)
      return
    }
    super.focus(options)
  }

  select(): void {
    const input = this.shadowRoot?.querySelector('[part="input"]') as HTMLInputElement | null
    input?.select()
  }

  // --- Event handlers ---

  private handleNativeInput(event: Event) {
    const target = event.target as HTMLInputElement
    this.model.actions.handleInput(target.value)
    this.requestUpdate()
  }

  private handleNativeFocus() {
    this._valueOnFocus = this.model.state.value()
    this.model.actions.setFocused(true)
    this.requestUpdate()
    this.dispatchEvent(
      new CustomEvent<CVNumberFocusEvent['detail']>('cv-focus', {
        detail: {},
        bubbles: true,
        composed: true,
      }),
    )
  }

  private handleNativeBlur() {
    this.model.actions.setFocused(false)
    this.syncValueFromModel()
    this.requestUpdate()

    this.dispatchEvent(
      new CustomEvent<CVNumberBlurEvent['detail']>('cv-blur', {
        detail: {},
        bubbles: true,
        composed: true,
      }),
    )

    const valueAfterCommit = this.model.state.value()
    if (this._valueOnFocus !== null && valueAfterCommit !== this._valueOnFocus) {
      this.dispatchEvent(
        new CustomEvent<CVNumberChangeEvent['detail']>('cv-change', {
          detail: {value: valueAfterCommit},
          bubbles: true,
          composed: true,
        }),
      )
    }

    this._valueOnFocus = null
  }

  private handleNativeKeyDown(event: KeyboardEvent) {
    const previousValue = this.model.state.value()
    this.model.actions.handleKeyDown(event)
    this.syncValueFromModel()
    this.requestUpdate()

    const newValue = this.model.state.value()

    if (event.key === 'Enter') {
      if (newValue !== previousValue) {
        this.dispatchEvent(
          new CustomEvent<CVNumberChangeEvent['detail']>('cv-change', {
            detail: {value: newValue},
            bubbles: true,
            composed: true,
          }),
        )
      }
    } else if (
      event.key === 'ArrowUp' ||
      event.key === 'ArrowDown' ||
      event.key === 'PageUp' ||
      event.key === 'PageDown' ||
      event.key === 'Home' ||
      event.key === 'End'
    ) {
      if (newValue !== previousValue) {
        this.dispatchEvent(
          new CustomEvent<CVNumberChangeEvent['detail']>('cv-change', {
            detail: {value: newValue},
            bubbles: true,
            composed: true,
          }),
        )
      }
    }
    // Escape is handled by the onClear callback in the model
  }

  private handleIncrementClick() {
    const previousValue = this.model.state.value()
    this.model.actions.increment()
    this.syncValueFromModel()
    this.requestUpdate()

    const newValue = this.model.state.value()
    if (newValue !== previousValue) {
      this.dispatchEvent(
        new CustomEvent<CVNumberChangeEvent['detail']>('cv-change', {
          detail: {value: newValue},
          bubbles: true,
          composed: true,
        }),
      )
    }
  }

  private handleDecrementClick() {
    const previousValue = this.model.state.value()
    this.model.actions.decrement()
    this.syncValueFromModel()
    this.requestUpdate()

    const newValue = this.model.state.value()
    if (newValue !== previousValue) {
      this.dispatchEvent(
        new CustomEvent<CVNumberChangeEvent['detail']>('cv-change', {
          detail: {value: newValue},
          bubbles: true,
          composed: true,
        }),
      )
    }
  }

  private handleClearClick() {
    this.model.actions.clear()
    this.syncValueFromModel()
    this.requestUpdate()
    // cv-clear event is dispatched by the onClear callback in createModel
  }

  // --- Render ---

  protected override render() {
    this.ensureModel()

    const inputProps = this.model.contracts.getInputProps()
    const incrementProps = this.model.contracts.getIncrementButtonProps()
    const decrementProps = this.model.contracts.getDecrementButtonProps()
    const clearButtonProps = this.model.contracts.getClearButtonProps()

    // Draft text management: display draftText when non-null, otherwise String(value)
    const draftText = this.model.state.draftText()
    const displayValue = draftText !== null ? draftText : String(this.model.state.value())

    return html`
      <span part="form-control-label"><slot name="label"></slot></span>
      <div part="base">
        <span part="prefix"><slot name="prefix"></slot></span>
        <input
          part="input"
          id=${inputProps.id}
          role=${inputProps.role}
          tabindex=${inputProps.tabindex}
          inputmode=${inputProps.inputmode}
          aria-valuenow=${inputProps['aria-valuenow']}
          aria-valuemin=${inputProps['aria-valuemin'] ?? nothing}
          aria-valuemax=${inputProps['aria-valuemax'] ?? nothing}
          aria-valuetext=${inputProps['aria-valuetext'] ?? nothing}
          aria-disabled=${inputProps['aria-disabled'] ?? nothing}
          aria-readonly=${inputProps['aria-readonly'] ?? nothing}
          aria-required=${inputProps['aria-required'] ?? nothing}
          aria-label=${inputProps['aria-label'] ?? nothing}
          aria-labelledby=${inputProps['aria-labelledby'] ?? nothing}
          aria-describedby=${inputProps['aria-describedby'] ?? nothing}
          placeholder=${inputProps.placeholder ?? nothing}
          autocomplete=${inputProps.autocomplete}
          .value=${displayValue}
          @input=${this.handleNativeInput}
          @focus=${this.handleNativeFocus}
          @blur=${this.handleNativeBlur}
          @keydown=${this.handleNativeKeyDown}
        />
        <span
          part="clear-button"
          role=${clearButtonProps.role}
          aria-label=${clearButtonProps['aria-label']}
          tabindex=${clearButtonProps.tabindex}
          ?hidden=${clearButtonProps.hidden}
          aria-hidden=${clearButtonProps['aria-hidden'] ?? nothing}
          @click=${this.handleClearClick}
        >
          <slot name="clear-icon">&times;</slot>
        </span>
        <span
          part="stepper"
          ?hidden=${incrementProps.hidden}
          aria-hidden=${incrementProps['aria-hidden'] ?? nothing}
        >
          <button
            part="increment"
            type="button"
            id=${incrementProps.id}
            tabindex=${incrementProps.tabindex}
            aria-label=${incrementProps['aria-label']}
            aria-disabled=${incrementProps['aria-disabled'] ?? nothing}
            ?hidden=${incrementProps.hidden}
            aria-hidden=${incrementProps['aria-hidden'] ?? nothing}
            @click=${this.handleIncrementClick}
          >
            +
          </button>
          <button
            part="decrement"
            type="button"
            id=${decrementProps.id}
            tabindex=${decrementProps.tabindex}
            aria-label=${decrementProps['aria-label']}
            aria-disabled=${decrementProps['aria-disabled'] ?? nothing}
            ?hidden=${decrementProps.hidden}
            aria-hidden=${decrementProps['aria-hidden'] ?? nothing}
            @click=${this.handleDecrementClick}
          >
            -
          </button>
        </span>
        <span part="suffix"><slot name="suffix"></slot></span>
      </div>
      <span part="form-control-help-text"><slot name="help-text"></slot></span>
    `
  }
}
