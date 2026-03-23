import {createSpinbutton, type SpinbuttonModel} from '@chromvoid/headless-ui'
import {css, html, nothing} from 'lit'
import type {PropertyValues} from 'lit'

import {FormAssociatedReatomElement} from '../form-associated/FormAssociatedReatomElement'
import type {FormAssociatedValidity} from '../form-associated/withFormAssociated'

export interface CVSpinbuttonEventDetail {
  value: number
}

const spinbuttonKeysToPrevent = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'])
const EPSILON = 1e-9

let cvSpinbuttonNonce = 0

export class CVSpinbutton extends FormAssociatedReatomElement {
  static elementName = 'cv-spinbutton'

  static get properties() {
    return {
      name: {type: String, reflect: true},
      value: {type: Number, reflect: true},
      min: {type: Number, reflect: true},
      max: {type: Number, reflect: true},
      step: {type: Number, reflect: true},
      largeStep: {type: Number, attribute: 'large-step', reflect: true},
      disabled: {type: Boolean, reflect: true},
      readOnly: {type: Boolean, attribute: 'read-only', reflect: true},
      required: {type: Boolean, reflect: true},
      ariaLabel: {type: String, attribute: 'aria-label'},
      ariaLabelledBy: {type: String, attribute: 'aria-labelledby'},
      ariaDescribedBy: {type: String, attribute: 'aria-describedby'},
    }
  }

  declare name: string
  declare value: number
  declare min: number | null
  declare max: number | null
  declare step: number
  declare largeStep: number
  declare disabled: boolean
  declare readOnly: boolean
  declare required: boolean
  declare ariaLabel: string
  declare ariaLabelledBy: string
  declare ariaDescribedBy: string

  private readonly idBase = `cv-spinbutton-${++cvSpinbuttonNonce}`
  private model: SpinbuttonModel
  private customValidityMessage = ''
  private draftValue: string | null = null
  private initialValueSnapshot = 0
  private hasInitialValueSnapshot = false

  constructor() {
    super()
    this.name = ''
    this.value = 0
    this.min = null
    this.max = null
    this.step = 1
    this.largeStep = 10
    this.disabled = false
    this.readOnly = false
    this.required = false
    this.ariaLabel = ''
    this.ariaLabelledBy = ''
    this.ariaDescribedBy = ''
    this.model = this.createModel()
  }

  static styles = [
    css`
      :host {
        display: inline-block;
      }

      [part='base'] {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: var(--cv-space-1, 4px);
        align-items: center;
        min-inline-size: 130px;
        padding: var(--cv-space-1, 4px);
        border-radius: var(--cv-radius-sm, 6px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        color: var(--cv-color-text, #e8ecf6);
      }

      [part='input'] {
        inline-size: 100%;
        min-inline-size: 0;
        border: 0;
        outline: none;
        background: transparent;
        color: inherit;
        font: inherit;
        line-height: 1.2;
        font-variant-numeric: tabular-nums;
        padding: 0;
      }

      [part='input']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      [part='actions'] {
        display: grid;
        grid-template-rows: 1fr 1fr;
        gap: 1px;
      }

      [part='increment'],
      [part='decrement'] {
        min-inline-size: 26px;
        min-block-size: 16px;
        border-radius: 4px;
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface-elevated, #1d2432);
        color: var(--cv-color-text, #e8ecf6);
        padding: 0;
        line-height: 1;
      }

      :host([disabled]) [part='base'],
      :host([read-only]) [part='base'] {
        opacity: 0.6;
      }

      :host([disabled]) [part='increment'],
      :host([disabled]) [part='decrement'],
      :host([read-only]) [part='increment'],
      :host([read-only]) [part='decrement'] {
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
    if (!this.hasInitialValueSnapshot) {
      this.initialValueSnapshot = this.value
      this.hasInitialValueSnapshot = true
    }
  }

  override willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties)

    if (
      changedProperties.has('min') ||
      changedProperties.has('max') ||
      changedProperties.has('step') ||
      changedProperties.has('largeStep') ||
      changedProperties.has('ariaLabel') ||
      changedProperties.has('ariaLabelledBy') ||
      changedProperties.has('ariaDescribedBy')
    ) {
      this.model = this.createModel()
      this.draftValue = null
      this.syncValueFromModel()
      return
    }

    if (changedProperties.has('disabled')) {
      this.model.actions.setDisabled(this.isEffectivelyDisabled())
    }

    if (changedProperties.has('readOnly')) {
      this.model.actions.setReadOnly(this.readOnly)
    }

    if (changedProperties.has('value') && this.model.state.value() !== this.value) {
      const previousValue = this.model.state.value()
      this.model.actions.setValue(this.value)
      this.syncFromModelAndMaybeEmit(previousValue, false)
    }
  }

  override updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties)
    if (
      changedProperties.has('value') ||
      changedProperties.has('disabled') ||
      changedProperties.has('readOnly') ||
      changedProperties.has('required') ||
      changedProperties.has('name') ||
      changedProperties.has('min') ||
      changedProperties.has('max') ||
      changedProperties.has('step') ||
      changedProperties.has('largeStep')
    ) {
      this.syncFormAssociatedState()
    }
  }

  protected override onFormDisabledChanged(_disabled: boolean): void {
    this.model.actions.setDisabled(this.isEffectivelyDisabled())
  }

  protected override onFormReset(): void {
    this.customValidityMessage = ''
    this.draftValue = null
    this.setValue(this.initialValueSnapshot)
  }

  protected override onFormStateRestore(state: string | File | FormData | null): void {
    if (typeof state !== 'string') return
    const parsed = Number(state)
    if (!Number.isFinite(parsed)) return
    this.setValue(parsed)
  }

  get type(): string {
    return 'cv-spinbutton'
  }

  setCustomValidity(message: string): void {
    this.customValidityMessage = message
    this.syncFormAssociatedState()
  }

  stepUp(times = 1): void {
    this.applyProgrammaticMutation(() => {
      for (let i = 0; i < this.normalizeTimes(times); i++) {
        this.model.actions.increment()
      }
    })
  }

  stepDown(times = 1): void {
    this.applyProgrammaticMutation(() => {
      for (let i = 0; i < this.normalizeTimes(times); i++) {
        this.model.actions.decrement()
      }
    })
  }

  pageUp(times = 1): void {
    this.applyProgrammaticMutation(() => {
      for (let i = 0; i < this.normalizeTimes(times); i++) {
        this.model.actions.incrementLarge()
      }
    })
  }

  pageDown(times = 1): void {
    this.applyProgrammaticMutation(() => {
      for (let i = 0; i < this.normalizeTimes(times); i++) {
        this.model.actions.decrementLarge()
      }
    })
  }

  setValue(value: number): void {
    this.applyProgrammaticMutation(() => {
      this.model.actions.setValue(value)
    })
  }

  getValue(): number {
    return this.model.state.value()
  }

  setRange(min: number | null, max: number | null): void {
    this.min = min
    this.max = max
  }

  override focus(options?: FocusOptions): void {
    if (this.inputElement) {
      this.inputElement.focus(options)
      return
    }

    super.focus(options)
  }

  select(): void {
    this.inputElement?.select()
  }

  private get inputElement(): HTMLInputElement | null {
    return this.shadowRoot?.querySelector('[part="input"]') as HTMLInputElement | null
  }

  private isEffectivelyDisabled(): boolean {
    return this.disabled || this.formDisabled
  }

  protected override isFormAssociatedDisabled(): boolean {
    return this.isEffectivelyDisabled()
  }

  protected override getFormAssociatedValue(): string | File | FormData | null {
    return String(this.model.state.value())
  }

  protected override getFormAssociatedValidity(): FormAssociatedValidity {
    const validity = this.getValidityState()
    if (!this.hasValidityErrors(validity.flags)) {
      return {flags: {}}
    }

    return {
      flags: validity.flags,
      message: validity.message,
      anchor: this.inputElement ?? undefined,
    }
  }

  private toFiniteOrUndefined(value: number | null): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
  }

  private createModel(): SpinbuttonModel {
    return createSpinbutton({
      idBase: this.idBase,
      value: this.value,
      min: this.toFiniteOrUndefined(this.min),
      max: this.toFiniteOrUndefined(this.max),
      step: this.step,
      largeStep: this.largeStep,
      isDisabled: this.isEffectivelyDisabled(),
      isReadOnly: this.readOnly,
      ariaLabel: this.ariaLabel || undefined,
      ariaLabelledBy: this.ariaLabelledBy || undefined,
      ariaDescribedBy: this.ariaDescribedBy || undefined,
    })
  }

  private dispatchInput(detail: CVSpinbuttonEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-input', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private dispatchChange(detail: CVSpinbuttonEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-change', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private syncValueFromModel(): void {
    const nextValue = this.model.state.value()
    if (this.value !== nextValue) {
      this.value = nextValue
    }
  }

  private syncFromModelAndMaybeEmit(previousValue: number, emitEvents: boolean): void {
    const nextValue = this.model.state.value()
    this.value = nextValue
    this.syncFormAssociatedState()
    if (!emitEvents || nextValue === previousValue) return

    const detail = {value: nextValue}
    this.dispatchInput(detail)
    this.dispatchChange(detail)
  }

  private applyProgrammaticMutation(mutate: () => void): void {
    const previousValue = this.model.state.value()
    mutate()
    this.draftValue = null
    this.syncFromModelAndMaybeEmit(previousValue, false)
  }

  private normalizeTimes(value: number): number {
    if (!Number.isFinite(value)) return 1
    const normalized = Math.floor(Math.abs(value))
    return Math.max(normalized, 1)
  }

  private commitDraftFromInput(emitEvents: boolean): void {
    const source = this.draftValue ?? this.inputElement?.value ?? String(this.model.state.value())
    const trimmed = source.trim()
    if (trimmed === '') {
      this.draftValue = null
      this.syncValueFromModel()
      this.syncFormAssociatedState()
      return
    }

    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed)) {
      this.draftValue = null
      this.syncValueFromModel()
      this.syncFormAssociatedState()
      return
    }

    const previousValue = this.model.state.value()
    this.model.actions.setValue(parsed)
    this.draftValue = null
    this.syncFromModelAndMaybeEmit(previousValue, emitEvents)
  }

  private hasValidityErrors(flags: ValidityStateFlags): boolean {
    return (
      flags.customError === true ||
      flags.valueMissing === true ||
      flags.rangeUnderflow === true ||
      flags.rangeOverflow === true ||
      flags.stepMismatch === true
    )
  }

  private getValidityState(): {flags: ValidityStateFlags; message: string} {
    const value = this.model.state.value()
    const min = this.toFiniteOrUndefined(this.min)
    const max = this.toFiniteOrUndefined(this.max)
    const step = Number.isFinite(this.step) && this.step > 0 ? this.step : 1
    const anchor = min ?? 0

    const flags: ValidityStateFlags = {}

    if (this.customValidityMessage) {
      flags.customError = true
    }

    if (this.required && !Number.isFinite(value)) {
      flags.valueMissing = true
    }

    if (min != null && value < min - EPSILON) {
      flags.rangeUnderflow = true
    }

    if (max != null && value > max + EPSILON) {
      flags.rangeOverflow = true
    }

    const offset = (value - anchor) / step
    if (Math.abs(offset - Math.round(offset)) > EPSILON) {
      flags.stepMismatch = true
    }

    let message = ''
    if (flags.customError) {
      message = this.customValidityMessage
    } else if (flags.valueMissing) {
      message = 'Please fill out this field.'
    } else if (flags.rangeUnderflow) {
      message = `Value must be greater than or equal to ${min}.`
    } else if (flags.rangeOverflow) {
      message = `Value must be less than or equal to ${max}.`
    } else if (flags.stepMismatch) {
      message = `Value must align with step ${step}.`
    }

    return {flags, message}
  }

  private handleInput(event: Event) {
    if (this.readOnly || this.isEffectivelyDisabled()) return
    const target = event.currentTarget as HTMLInputElement | null
    this.draftValue = target?.value ?? ''
    this.syncFormAssociatedState()
  }

  private handleInputBlur() {
    this.commitDraftFromInput(true)
  }

  private handleSpinbuttonKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault()
      this.commitDraftFromInput(true)
      return
    }

    if (!spinbuttonKeysToPrevent.has(event.key)) return

    event.preventDefault()
    const previousValue = this.model.state.value()
    this.model.contracts.getSpinbuttonProps().onKeyDown(event)
    this.draftValue = null
    this.syncFromModelAndMaybeEmit(previousValue, true)
  }

  private handleIncrementClick() {
    const previousValue = this.model.state.value()
    this.model.contracts.getIncrementButtonProps().onClick()
    this.draftValue = null
    this.syncFromModelAndMaybeEmit(previousValue, true)
  }

  private handleDecrementClick() {
    const previousValue = this.model.state.value()
    this.model.contracts.getDecrementButtonProps().onClick()
    this.draftValue = null
    this.syncFromModelAndMaybeEmit(previousValue, true)
  }

  protected override render() {
    const spinbuttonProps = this.model.contracts.getSpinbuttonProps()
    const incrementProps = this.model.contracts.getIncrementButtonProps()
    const decrementProps = this.model.contracts.getDecrementButtonProps()
    const displayValue = this.draftValue ?? String(this.model.state.value())

    return html`
      <div part="base">
        <input
          id=${spinbuttonProps.id}
          role=${spinbuttonProps.role}
          tabindex=${spinbuttonProps.tabindex}
          aria-valuenow=${spinbuttonProps['aria-valuenow']}
          aria-valuemin=${spinbuttonProps['aria-valuemin'] ?? nothing}
          aria-valuemax=${spinbuttonProps['aria-valuemax'] ?? nothing}
          aria-valuetext=${spinbuttonProps['aria-valuetext'] ?? nothing}
          aria-disabled=${spinbuttonProps['aria-disabled'] ?? nothing}
          aria-readonly=${spinbuttonProps['aria-readonly'] ?? nothing}
          aria-label=${spinbuttonProps['aria-label'] ?? nothing}
          aria-labelledby=${spinbuttonProps['aria-labelledby'] ?? nothing}
          aria-describedby=${spinbuttonProps['aria-describedby'] ?? nothing}
          ?disabled=${this.isEffectivelyDisabled()}
          ?readonly=${this.readOnly}
          inputmode="decimal"
          part="input"
          .value=${displayValue}
          @input=${this.handleInput}
          @blur=${this.handleInputBlur}
          @keydown=${this.handleSpinbuttonKeyDown}
        />
        <div part="actions">
          <button
            id=${incrementProps.id}
            tabindex=${incrementProps.tabindex}
            aria-label=${incrementProps['aria-label']}
            aria-disabled=${incrementProps['aria-disabled'] ?? nothing}
            ?disabled=${incrementProps['aria-disabled'] === 'true'}
            part="increment"
            type="button"
            @click=${this.handleIncrementClick}
          >
            +
          </button>
          <button
            id=${decrementProps.id}
            tabindex=${decrementProps.tabindex}
            aria-label=${decrementProps['aria-label']}
            aria-disabled=${decrementProps['aria-disabled'] ?? nothing}
            ?disabled=${decrementProps['aria-disabled'] === 'true'}
            part="decrement"
            type="button"
            @click=${this.handleDecrementClick}
          >
            -
          </button>
        </div>
      </div>
    `
  }
}
