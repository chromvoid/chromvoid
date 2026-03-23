import {LitElement, css, html} from 'lit'

export type CVRadioSize = 'small' | 'medium' | 'large'

export class CVRadio extends LitElement {
  static elementName = 'cv-radio'

  static get properties() {
    return {
      value: {type: String, reflect: true},
      disabled: {type: Boolean, reflect: true},
      checked: {type: Boolean, reflect: true},
      active: {type: Boolean, reflect: true},
      size: {type: String, reflect: true},
    }
  }

  declare value: string
  declare disabled: boolean
  declare checked: boolean
  declare active: boolean
  declare size: CVRadioSize

  constructor() {
    super()
    this.value = ''
    this.disabled = false
    this.checked = false
    this.active = false
    this.size = 'medium'
  }

  static styles = [
    css`
      :host {
        display: inline-block;
        outline: none;
        --cv-radio-indicator-size: 20px;
        --cv-radio-dot-size: 8px;
        --cv-radio-gap: var(--cv-space-2, 8px);
      }

      :host([size='small']) {
        --cv-radio-indicator-size: 16px;
        --cv-radio-dot-size: 6px;
      }

      :host([size='large']) {
        --cv-radio-indicator-size: 24px;
        --cv-radio-dot-size: 10px;
      }

      :host([hidden]) {
        display: none;
      }

      .radio {
        display: inline-flex;
        align-items: center;
        gap: var(--cv-radio-gap);
        min-block-size: 32px;
        padding: 0 var(--cv-space-1, 4px);
        border-radius: var(--cv-radius-sm, 6px);
        color: var(--cv-color-text, #e8ecf6);
        transition: background var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease);
      }

      .indicator {
        inline-size: var(--cv-radio-indicator-size);
        block-size: var(--cv-radio-indicator-size);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        transition:
          border-color var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease),
          background var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease);
      }

      .dot {
        inline-size: var(--cv-radio-dot-size);
        block-size: var(--cv-radio-dot-size);
        border-radius: 50%;
        background: var(--cv-color-primary, #65d7ff);
        transform: scale(0);
        transition: transform var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease);
      }

      :host([active]) .radio {
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 12%, transparent);
      }

      :host([checked]) .indicator {
        border-color: var(--cv-color-primary, #65d7ff);
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 20%, var(--cv-color-surface, #141923));
      }

      :host([checked]) .dot {
        transform: scale(1);
      }

      :host([disabled]) {
        opacity: 0.55;
        cursor: not-allowed;
      }

      :host(:focus-visible) .radio {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }
    `,
  ]

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  protected override render() {
    return html`
      <div class="radio" part="base">
        <span class="indicator" part="indicator">
          <span class="dot" part="dot"></span>
        </span>
        <span part="label"><slot></slot></span>
        <span part="description"><slot name="description"></slot></span>
      </div>
    `
  }
}
