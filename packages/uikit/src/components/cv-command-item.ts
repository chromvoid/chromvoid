import {LitElement, css, html} from 'lit'

export class CVCommandItem extends LitElement {
  static elementName = 'cv-command-item'

  static get properties() {
    return {
      value: {type: String, reflect: true},
      disabled: {type: Boolean, reflect: true},
      active: {type: Boolean, reflect: true},
      selected: {type: Boolean, reflect: true},
    }
  }

  declare value: string
  declare disabled: boolean
  declare active: boolean
  declare selected: boolean

  constructor() {
    super()
    this.value = ''
    this.disabled = false
    this.active = false
    this.selected = false
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

      [part='base'] {
        display: block;
        padding: var(--cv-space-2, 8px) var(--cv-space-3, 12px);
        border-radius: var(--cv-radius-sm, 6px);
        color: var(--cv-color-text, #e8ecf6);
        transition:
          background var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease),
          color var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease);
      }

      :host([active]) [part='base'] {
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 24%, transparent);
      }

      :host([selected]) [part='base'] {
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 32%, transparent);
      }

      :host([disabled]) [part='base'] {
        opacity: 0.5;
      }

      :host(:focus-visible) [part='base'] {
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
    return html`<div part="base"><slot></slot></div>`
  }
}
