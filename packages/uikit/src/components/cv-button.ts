import {createButton, type ButtonModel} from '@chromvoid/headless-ui'
import {css, html, nothing} from 'lit'
import type {PropertyValues} from 'lit'

import {FormAssociatedReatomElement} from '../form-associated/FormAssociatedReatomElement'

let cvButtonNonce = 0

type CVButtonVariant = 'default' | 'primary' | 'danger' | 'ghost'
type CVButtonSize = 'small' | 'medium' | 'large'
type CVButtonType = 'button' | 'submit' | 'reset'

export interface CVButtonInputDetail {
  pressed: boolean
  toggle: boolean
}

export interface CVButtonChangeDetail {
  pressed: boolean
}

export class CVButton extends FormAssociatedReatomElement {
  static elementName = 'cv-button'

  static get properties() {
    return {
      disabled: {type: Boolean, reflect: true},
      toggle: {type: Boolean, reflect: true},
      pressed: {type: Boolean, reflect: true},
      loading: {type: Boolean, reflect: true},
      variant: {type: String, reflect: true},
      outline: {type: Boolean, reflect: true},
      pill: {type: Boolean, reflect: true},
      size: {type: String, reflect: true},
      type: {type: String, reflect: true},
    }
  }

  declare disabled: boolean
  declare toggle: boolean
  declare pressed: boolean
  declare loading: boolean
  declare variant: CVButtonVariant
  declare outline: boolean
  declare pill: boolean
  declare size: CVButtonSize
  declare type: CVButtonType

  private model: ButtonModel
  private suppressKeyboardClick = false

  constructor() {
    super()
    this.disabled = false
    this.toggle = false
    this.pressed = false
    this.loading = false
    this.variant = 'default'
    this.outline = false
    this.pill = false
    this.size = 'medium'
    this.type = 'button'
    this.model = this.createModel()
  }

  static styles = [
    css`
      :host {
        display: block;
        width: 100%;
        cursor: pointer;
        user-select: none;
        --cv-button-min-height: 36px;
        --cv-button-padding-inline: var(--cv-space-3, 12px);
        --cv-button-padding-block: var(--cv-space-2, 8px);
        --cv-button-border-radius: var(--cv-radius-sm, 6px);
        --cv-button-gap: var(--cv-space-2, 8px);
        --cv-button-font-size: var(--cv-button-font-size-medium, var(--cv-font-size-base, 14px));
        --cv-button-font-weight: var(--cv-button-font-weight-medium, inherit);
      }

      [part='base'] {
        display: flex;
        width: 100%;
        align-items: center;
        justify-content: center;
        appearance: none;
        font: inherit;
        gap: var(--cv-button-gap);
        padding: var(--cv-button-padding-block) var(--cv-button-padding-inline);
        min-height: var(--cv-button-min-height);
        font-size: var(--cv-button-font-size);
        font-weight: var(--cv-button-font-weight);
        border-radius: var(--cv-button-border-radius);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        color: var(--cv-color-text, #e8ecf6);
        cursor: pointer;
        user-select: none;
        transition:
          background var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease),
          border-color var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease),
          color var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease);
      }

      [part='label'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--cv-button-gap);
      }

      [part='prefix'],
      [part='suffix'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      [part='prefix'][hidden],
      [part='suffix'][hidden] {
        display: none;
      }

      /* --- variant: primary --- */
      :host([variant='primary']) [part='base'] {
        border-color: color-mix(
          in oklab,
          var(--cv-color-primary, #65d7ff) 52%,
          var(--cv-color-border, #2a3245)
        );
        background: color-mix(
          in oklab,
          var(--cv-color-primary, #65d7ff) 22%,
          var(--cv-color-surface, #141923)
        );
      }

      /* --- variant: danger --- */
      :host([variant='danger']) [part='base'] {
        border-color: color-mix(
          in oklab,
          var(--cv-color-danger, #ff7d86) 52%,
          var(--cv-color-border, #2a3245)
        );
        background: color-mix(
          in oklab,
          var(--cv-color-danger, #ff7d86) 22%,
          var(--cv-color-surface, #141923)
        );
      }

      /* --- variant: ghost --- */
      :host([variant='ghost']) [part='base'] {
        background: transparent;
        border-color: transparent;
      }

      /* --- outline modifier --- */
      :host([outline]) [part='base'] {
        background: transparent;
        border-color: var(--cv-color-border, #2a3245);
      }

      :host([outline][variant='primary']) [part='base'] {
        border-color: color-mix(
          in oklab,
          var(--cv-color-primary, #65d7ff) 52%,
          var(--cv-color-border, #2a3245)
        );
      }

      :host([outline][variant='danger']) [part='base'] {
        border-color: color-mix(
          in oklab,
          var(--cv-color-danger, #ff7d86) 52%,
          var(--cv-color-border, #2a3245)
        );
      }

      /* --- pill modifier --- */
      :host([pill]) {
        --cv-button-border-radius: 999px;
      }

      /* --- hover --- */
      [part='base']:hover {
        border-color: var(--cv-color-primary, #65d7ff);
      }

      [part='base']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 2px;
      }

      /* --- pressed states --- */
      :host([pressed]) [part='base'] {
        background: color-mix(
          in oklab,
          var(--cv-color-primary, #65d7ff) 30%,
          var(--cv-color-surface, #141923)
        );
      }

      :host([pressed][outline]) [part='base'] {
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 16%, transparent);
      }

      :host([pressed][variant='ghost']) [part='base'] {
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 14%, transparent);
      }

      :host([pressed][variant='danger']) [part='base'] {
        background: color-mix(
          in oklab,
          var(--cv-color-danger, #ff7d86) 32%,
          var(--cv-color-surface, #141923)
        );
      }

      :host([pressed][outline][variant='danger']) [part='base'] {
        background: color-mix(in oklab, var(--cv-color-danger, #ff7d86) 16%, transparent);
      }

      :host([pressed][variant='primary']) [part='base'] {
        background: color-mix(
          in oklab,
          var(--cv-color-primary, #65d7ff) 38%,
          var(--cv-color-surface, #141923)
        );
      }

      :host([pressed][outline][variant='primary']) [part='base'] {
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 20%, transparent);
      }

      /* --- sizes --- */
      :host([size='small']) {
        --cv-button-min-height: 30px;
        --cv-button-padding-inline: var(--cv-space-2, 8px);
        --cv-button-padding-block: var(--cv-space-1, 4px);
        --cv-button-font-size: var(
          --cv-button-font-size-small,
          var(--cv-font-size-sm, 13px)
        );
      }

      :host([size='large']) {
        --cv-button-min-height: 42px;
        --cv-button-padding-inline: var(--cv-space-4, 16px);
        --cv-button-padding-block: var(--cv-space-2, 8px);
        --cv-button-font-size: var(--cv-button-font-size-large, var(--cv-font-size-md, 16px));
      }

      /* --- spinner --- */
      [part='spinner'] {
        inline-size: 14px;
        block-size: 14px;
        border-radius: 999px;
        border: 2px solid color-mix(in oklab, var(--cv-color-primary, #65d7ff) 32%, transparent);
        border-top-color: var(--cv-color-primary, #65d7ff);
        animation: cv-button-spin 800ms linear infinite;
      }

      :host([loading]) [part='base'] {
        cursor: progress;
      }

      :host([loading]) {
        cursor: progress;
      }

      :host([loading]) [part='label'] {
        opacity: 0.72;
      }

      /* --- disabled --- */
      :host([disabled]) {
        cursor: not-allowed;
      }

      :host([disabled]) [part='base'] {
        opacity: 0.55;
        cursor: not-allowed;
      }

      @keyframes cv-button-spin {
        to {
          transform: rotate(360deg);
        }
      }
    `,
  ]

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  override willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties)
    if (changedProperties.has('toggle')) {
      this.model = this.createModel()
      return
    }

    if (changedProperties.has('disabled')) {
      this.model.actions.setDisabled(this.disabled)
    }

    if (changedProperties.has('loading')) {
      this.model.actions.setLoading(this.loading)
    }

    if (this.toggle && changedProperties.has('pressed')) {
      this.model.actions.setPressed(this.pressed)
    }
  }

  private createModel(): ButtonModel {
    const initialPressed = this.toggle ? this.pressed : undefined

    return createButton({
      idBase: `cv-button-${++cvButtonNonce}`,
      isDisabled: this.disabled,
      isLoading: this.loading,
      isPressed: initialPressed,
      onPress: this.handlePress.bind(this),
    })
  }

  private dispatchInput(detail: CVButtonInputDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-input', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private dispatchChange(detail: CVButtonChangeDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-change', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private handlePress() {
    const nextPressed = this.model.state.isPressed()
    const wasPressed = this.pressed

    if (this.toggle) {
      this.pressed = nextPressed

      this.dispatchInput({
        pressed: nextPressed,
        toggle: this.toggle,
      })

      if (wasPressed !== nextPressed) {
        this.dispatchChange({pressed: nextPressed})
      }
    }

    this.triggerFormAction()
  }

  private getButtonType(): CVButtonType {
    if (this.type === 'submit' || this.type === 'reset') {
      return this.type
    }

    return 'button'
  }

  protected override isFormAssociatedDisabled(): boolean {
    return this.disabled || this.loading || this.formDisabled
  }

  protected override getFormAssociatedValue(): string | File | FormData | null {
    return null
  }

  private triggerFormAction() {
    const actionType = this.getButtonType()
    if (actionType === 'button') return
    if (this.isFormAssociatedDisabled()) return

    const form = this.form
    if (!form) return

    if (actionType === 'reset') {
      form.reset()
      return
    }

    form.requestSubmit()
  }

  private handleClick(event: MouseEvent) {
    if (this.suppressKeyboardClick && event.detail === 0) {
      this.suppressKeyboardClick = false
      event.preventDefault()
      return
    }

    this.suppressKeyboardClick = false
    this.model.contracts.getButtonProps().onClick()
  }

  private handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      this.suppressKeyboardClick = true
    }

    this.model.contracts.getButtonProps().onKeyDown(event)
  }

  private handleKeyUp(event: KeyboardEvent) {
    if (event.key === ' ' || event.key === 'Spacebar') {
      this.suppressKeyboardClick = true
    }

    this.model.contracts.getButtonProps().onKeyUp(event)
  }

  private handleContentSlotChange() {
    this.requestUpdate()
  }

  private hasSlotContent(name: 'prefix' | 'suffix'): boolean {
    return Array.from(this.children ?? []).some((child) => child.getAttribute('slot') === name)
  }

  protected override render() {
    const props = this.model.contracts.getButtonProps()
    const isUnavailable = this.disabled || this.loading
    const hasPrefixContent = this.hasSlotContent('prefix')
    const hasSuffixContent = this.hasSlotContent('suffix')

    return html`
      <button
        id=${props.id}
        type="button"
        role=${props.role}
        tabindex=${props.tabindex}
        ?disabled=${isUnavailable}
        aria-disabled=${props['aria-disabled'] ?? nothing}
        aria-busy=${props['aria-busy'] ?? nothing}
        aria-pressed=${props['aria-pressed'] ?? nothing}
        part="base"
        @click=${this.handleClick}
        @keydown=${this.handleKeyDown}
        @keyup=${this.handleKeyUp}
      >
        ${this.loading ? html`<span part="spinner" aria-hidden="true"></span>` : nothing}
        <span part="prefix" ?hidden=${!hasPrefixContent}
          ><slot name="prefix" @slotchange=${this.handleContentSlotChange}></slot
        ></span>
        <span part="label"><slot></slot></span>
        <span part="suffix" ?hidden=${!hasSuffixContent}
          ><slot name="suffix" @slotchange=${this.handleContentSlotChange}></slot
        ></span>
      </button>
    `
  }
}
