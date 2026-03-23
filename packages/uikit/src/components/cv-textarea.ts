import {createTextarea, type TextareaModel, type TextareaResize} from '@chromvoid/headless-ui'
import {css, html, nothing} from 'lit'
import type {PropertyValues} from 'lit'

import {FormAssociatedReatomElement} from '../form-associated/FormAssociatedReatomElement'
import type {FormAssociatedValidity} from '../form-associated/withFormAssociated'

let cvTextareaNonce = 0

type CVTextareaSize = 'small' | 'medium' | 'large'
type CVTextareaVariant = 'outlined' | 'filled'

export interface CVTextareaValueDetail {
  value: string
}

export type CVTextareaInputEvent = CustomEvent<CVTextareaValueDetail>
export type CVTextareaChangeEvent = CustomEvent<CVTextareaValueDetail>
export type CVTextareaFocusEvent = CustomEvent<Record<string, never>>
export type CVTextareaBlurEvent = CustomEvent<Record<string, never>>

export interface CVTextareaEventMap {
  'cv-input': CVTextareaInputEvent
  'cv-change': CVTextareaChangeEvent
  'cv-focus': CVTextareaFocusEvent
  'cv-blur': CVTextareaBlurEvent
}

export class CVTextarea extends FormAssociatedReatomElement {
  static elementName = 'cv-textarea'

  static get properties() {
    return {
      value: {type: String},
      placeholder: {type: String},
      disabled: {type: Boolean, reflect: true},
      readonly: {type: Boolean, reflect: true},
      required: {type: Boolean, reflect: true},
      rows: {type: Number},
      cols: {type: Number},
      minLength: {type: Number, attribute: 'minlength'},
      maxLength: {type: Number, attribute: 'maxlength'},
      resize: {type: String, reflect: true},
      size: {type: String, reflect: true},
      variant: {type: String, reflect: true},
      name: {type: String},
    }
  }

  declare value: string
  declare placeholder: string
  declare disabled: boolean
  declare readonly: boolean
  declare required: boolean
  declare rows: number
  declare cols: number
  declare minLength: number | undefined
  declare maxLength: number | undefined
  declare resize: TextareaResize
  declare size: CVTextareaSize
  declare variant: CVTextareaVariant
  declare name: string

  private model: TextareaModel
  private valueOnFocus = ''
  private defaultValue = ''
  private didCaptureDefaultValue = false

  constructor() {
    super()
    this.value = ''
    this.placeholder = ''
    this.disabled = false
    this.readonly = false
    this.required = false
    this.rows = 4
    this.cols = 20
    this.minLength = undefined
    this.maxLength = undefined
    this.resize = 'vertical'
    this.size = 'medium'
    this.variant = 'outlined'
    this.name = ''
    this.model = this.createModel()
  }

  static styles = [
    css`
      :host {
        display: block;
        --cv-textarea-min-height: 96px;
        --cv-textarea-padding-inline: var(--cv-space-3, 12px);
        --cv-textarea-padding-block: var(--cv-space-2, 8px);
        --cv-textarea-font-size: var(--cv-font-size-base, 14px);
        --cv-textarea-border-radius: var(--cv-radius-sm, 6px);
        --cv-textarea-border-color: var(--cv-color-border, #2a3245);
        --cv-textarea-background: transparent;
        --cv-textarea-color: var(--cv-color-text, #e8ecf6);
        --cv-textarea-placeholder-color: var(--cv-color-text-muted, #6b7a99);
        --cv-textarea-focus-ring: 0 0 0 2px var(--cv-color-primary, #65d7ff);
        --cv-textarea-transition-duration: var(--cv-duration-fast, 120ms);
      }

      [part='base'] {
        display: block;
        border: 1px solid var(--cv-textarea-border-color);
        border-radius: var(--cv-textarea-border-radius);
        background: var(--cv-textarea-background);
        color: var(--cv-textarea-color);
        transition:
          border-color var(--cv-textarea-transition-duration) var(--cv-easing-standard, ease),
          background var(--cv-textarea-transition-duration) var(--cv-easing-standard, ease),
          box-shadow var(--cv-textarea-transition-duration) var(--cv-easing-standard, ease);
        box-sizing: border-box;
        width: 100%;
      }

      [part='textarea'] {
        display: block;
        box-sizing: border-box;
        width: 100%;
        min-height: var(--cv-textarea-min-height);
        border: 0;
        outline: none;
        margin: 0;
        resize: vertical;
        border-radius: inherit;
        background: transparent;
        color: inherit;
        font: inherit;
        font-size: var(--cv-textarea-font-size);
        line-height: 1.5;
        padding-inline: var(--cv-textarea-padding-inline);
        padding-block: var(--cv-textarea-padding-block);
      }

      [part='textarea']::placeholder {
        color: var(--cv-textarea-placeholder-color);
      }

      [part='form-control-label'] {
        display: block;
      }

      [part='form-control-help-text'] {
        display: block;
      }

      :host([variant='outlined']) [part='base'] {
        border-color: var(--cv-textarea-border-color);
        background: var(--cv-textarea-background);
      }

      :host([variant='filled']) [part='base'] {
        background: var(--cv-color-surface, #141923);
        border-color: transparent;
      }

      :host([focused]) [part='base'] {
        box-shadow: var(--cv-textarea-focus-ring);
      }

      :host([size='small']) {
        --cv-textarea-min-height: 72px;
        --cv-textarea-padding-inline: var(--cv-space-2, 8px);
        --cv-textarea-font-size: var(--cv-font-size-sm, 13px);
      }

      :host([size='large']) {
        --cv-textarea-min-height: 120px;
        --cv-textarea-padding-inline: var(--cv-space-4, 16px);
        --cv-textarea-font-size: var(--cv-font-size-md, 16px);
      }

      :host([disabled]) {
        pointer-events: none;
      }

      :host([disabled]) [part='base'] {
        opacity: 0.55;
      }

      :host([readonly]) [part='textarea'] {
        cursor: default;
      }

      :host([resize='none']) [part='textarea'] {
        resize: none;
      }

      :host([resize='vertical']) [part='textarea'] {
        resize: vertical;
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
    if (!this.didCaptureDefaultValue) {
      this.defaultValue = this.value
      this.didCaptureDefaultValue = true
    }
  }

  override willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties)

    if (changedProperties.has('value') && this.model.state.value() !== this.value) {
      this.model.actions.setValue(this.value)
    }

    if (changedProperties.has('placeholder')) {
      this.model.actions.setPlaceholder(this.placeholder)
    }

    if (changedProperties.has('disabled')) {
      this.model.actions.setDisabled(this.isEffectivelyDisabled())
    }

    if (changedProperties.has('readonly')) {
      this.model.actions.setReadonly(this.readonly)
    }

    if (changedProperties.has('required')) {
      this.model.actions.setRequired(this.required)
    }

    if (changedProperties.has('rows')) {
      this.model.actions.setRows(this.rows)
    }

    if (changedProperties.has('cols')) {
      this.model.actions.setCols(this.cols)
    }

    if (changedProperties.has('minLength')) {
      this.model.actions.setMinLength(this.toNonNegativeIntegerOrUndefined(this.minLength))
    }

    if (changedProperties.has('maxLength')) {
      this.model.actions.setMaxLength(this.toNonNegativeIntegerOrUndefined(this.maxLength))
    }

    if (changedProperties.has('resize')) {
      this.model.actions.setResize(this.normalizeResize(this.resize))
    }

    this.toggleAttribute('focused', this.model.state.focused())
    this.toggleAttribute('filled', this.model.state.filled())
    this.syncFormAssociatedState()
  }

  private createModel(): TextareaModel {
    return createTextarea({
      idBase: `cv-textarea-${++cvTextareaNonce}`,
      value: this.value,
      disabled: this.isEffectivelyDisabled(),
      readonly: this.readonly,
      required: this.required,
      placeholder: this.placeholder,
      rows: this.rows,
      cols: this.cols,
      minLength: this.toNonNegativeIntegerOrUndefined(this.minLength),
      maxLength: this.toNonNegativeIntegerOrUndefined(this.maxLength),
      resize: this.normalizeResize(this.resize),
      onInput: (value: string) => {
        this.value = value
        this.dispatchEvent(
          new CustomEvent<CVTextareaInputEvent['detail']>('cv-input', {
            detail: {value},
            bubbles: true,
            composed: true,
          }),
        )
      },
    })
  }

  protected override onFormDisabledChanged(_disabled: boolean): void {
    this.model.actions.setDisabled(this.isEffectivelyDisabled())
  }

  protected override onFormReset(): void {
    this.value = this.defaultValue
    this.model.actions.setValue(this.defaultValue)
  }

  protected override onFormStateRestore(state: string | File | FormData | null): void {
    if (typeof state !== 'string') return
    this.value = state
    this.model.actions.setValue(state)
  }

  protected override isFormAssociatedDisabled(): boolean {
    return this.isEffectivelyDisabled()
  }

  protected override getFormAssociatedValue(): string | File | FormData | null {
    return this.model.state.value()
  }

  protected override getFormAssociatedValidity(): FormAssociatedValidity {
    if (this.required && this.model.state.value().length === 0) {
      return {
        flags: {valueMissing: true},
        message: 'Please fill out this field.',
      }
    }

    return {flags: {}}
  }

  private isEffectivelyDisabled(): boolean {
    return this.disabled || this.formDisabled
  }

  private normalizeResize(resize: string): TextareaResize {
    return resize === 'none' ? 'none' : 'vertical'
  }

  private toNonNegativeIntegerOrUndefined(value: number | undefined): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      return undefined
    }

    return Math.floor(value)
  }

  private handleNativeInput(event: Event) {
    const target = event.target as HTMLTextAreaElement
    this.model.actions.handleInput(target.value)
    this.syncFormAssociatedState()
  }

  private handleNativeFocus() {
    this.valueOnFocus = this.model.state.value()
    this.model.actions.setFocused(true)
    this.requestUpdate()
    this.dispatchEvent(
      new CustomEvent<CVTextareaFocusEvent['detail']>('cv-focus', {
        detail: {},
        bubbles: true,
        composed: true,
      }),
    )
  }

  private handleNativeBlur() {
    this.model.actions.setFocused(false)
    this.requestUpdate()

    const currentValue = this.model.state.value()

    this.dispatchEvent(
      new CustomEvent<CVTextareaBlurEvent['detail']>('cv-blur', {
        detail: {},
        bubbles: true,
        composed: true,
      }),
    )

    if (currentValue !== this.valueOnFocus) {
      this.dispatchEvent(
        new CustomEvent<CVTextareaChangeEvent['detail']>('cv-change', {
          detail: {value: currentValue},
          bubbles: true,
          composed: true,
        }),
      )
    }

    this.syncFormAssociatedState()
  }

  protected override render() {
    const textareaProps = this.model.contracts.getTextareaProps()

    return html`
      <span part="form-control-label"><slot name="label"></slot></span>
      <div part="base">
        <textarea
          part="textarea"
          id=${textareaProps.id}
          .value=${this.model.state.value()}
          name=${this.name || nothing}
          tabindex=${textareaProps.tabindex}
          rows=${textareaProps.rows}
          cols=${textareaProps.cols}
          aria-disabled=${textareaProps['aria-disabled'] ?? nothing}
          aria-readonly=${textareaProps['aria-readonly'] ?? nothing}
          aria-required=${textareaProps['aria-required'] ?? nothing}
          placeholder=${textareaProps.placeholder ?? nothing}
          ?disabled=${textareaProps.disabled}
          ?readonly=${textareaProps.readonly}
          ?required=${textareaProps.required}
          minlength=${textareaProps.minlength ?? nothing}
          maxlength=${textareaProps.maxlength ?? nothing}
          @input=${this.handleNativeInput}
          @focus=${this.handleNativeFocus}
          @blur=${this.handleNativeBlur}
        ></textarea>
      </div>
      <span part="form-control-help-text"><slot name="help-text"></slot></span>
    `
  }
}
