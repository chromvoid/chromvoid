import {LitElement, css, html} from 'lit'

export class CVToolbarItem extends LitElement {
  static elementName = 'cv-toolbar-item'

  static get properties() {
    return {
      value: {type: String, reflect: true},
      disabled: {type: Boolean, reflect: true},
      active: {type: Boolean, reflect: true},
    }
  }

  declare value: string
  declare disabled: boolean
  declare active: boolean

  constructor() {
    super()
    this.value = ''
    this.disabled = false
    this.active = false
  }

  static styles = [
    css`
      :host {
        display: inline-block;
        outline: none;
      }

      :host([hidden]) {
        display: none;
      }

      .item {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-block-size: var(--cv-toolbar-item-min-height, 32px);
        padding: 0 var(--cv-toolbar-item-padding-inline, var(--cv-space-3, 12px));
        border-radius: var(--cv-toolbar-item-border-radius, var(--cv-radius-sm, 6px));
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        color: var(--cv-color-text, #e8ecf6);
        transition:
          border-color var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease),
          background var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease);
      }

      :host([active]) .item {
        border-color: var(--cv-color-primary, #65d7ff);
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 22%, var(--cv-color-surface, #141923));
      }

      :host([disabled]) .item {
        opacity: 0.55;
      }

      :host(:focus-visible) .item {
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
    return html`<div class="item" part="base"><slot></slot></div>`
  }
}
