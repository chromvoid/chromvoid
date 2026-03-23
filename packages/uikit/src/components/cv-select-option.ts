import {LitElement, css, html} from 'lit'

export class CVSelectOption extends LitElement {
  static elementName = 'cv-select-option'

  static get properties() {
    return {
      value: {type: String, reflect: true},
      disabled: {type: Boolean, reflect: true},
      selected: {type: Boolean, reflect: true},
      active: {type: Boolean, reflect: true},
    }
  }

  declare value: string
  declare disabled: boolean
  declare selected: boolean
  declare active: boolean

  constructor() {
    super()
    this.value = ''
    this.disabled = false
    this.selected = false
    this.active = false
  }

  static styles = [
    css`
      :host {
        display: block;
        outline: none;
      }

      :host([hidden]) {
        display: none;
      }

      .option {
        display: block;
        padding: var(--cv-space-2, 8px) var(--cv-space-3, 12px);
        border-radius: var(--cv-radius-sm, 6px);
        color: var(--cv-color-text, #e8ecf6);
        background: transparent;
        transition:
          background var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease),
          color var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease);
      }

      :host([active]) .option {
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 24%, transparent);
      }

      :host([selected]) .option {
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 32%, transparent);
      }

      :host([disabled]) .option {
        opacity: 0.5;
      }

      :host(:focus-visible) .option {
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
    return html`<div class="option" part="base"><slot></slot></div>`
  }
}
