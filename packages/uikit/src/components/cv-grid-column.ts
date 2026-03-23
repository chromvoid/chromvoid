import {LitElement, css, html} from 'lit'

export class CVGridColumn extends LitElement {
  static elementName = 'cv-grid-column'

  static get properties() {
    return {
      value: {type: String, reflect: true},
      label: {type: String, reflect: true},
      index: {type: Number, reflect: true},
      disabled: {type: Boolean, reflect: true},
    }
  }

  declare value: string
  declare label: string
  declare index: number
  declare disabled: boolean

  constructor() {
    super()
    this.value = ''
    this.label = ''
    this.index = 0
    this.disabled = false
  }

  static styles = [
    css`
      :host {
        display: table-cell;
        padding: var(--cv-space-2, 8px) var(--cv-space-3, 12px);
        border-bottom: 1px solid var(--cv-color-border, #2a3245);
        color: var(--cv-color-text, #e8ecf6);
        font-weight: 600;
        background: color-mix(in oklab, var(--cv-color-surface, #141923) 82%, transparent);
      }

      :host([disabled]) {
        opacity: 0.55;
      }
    `,
  ]

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  protected override render() {
    return html`<slot>${this.label}</slot>`
  }
}
