import {LitElement, css, html} from 'lit'

export class CVComboboxGroup extends LitElement {
  static elementName = 'cv-combobox-group'

  static get properties() {
    return {
      label: {type: String, reflect: true},
    }
  }

  declare label: string

  constructor() {
    super()
    this.label = ''
  }

  static styles = [
    css`
      :host {
        display: block;
      }

      :host([hidden]) {
        display: none;
      }
    `,
  ]

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  protected override render() {
    return html`<slot></slot>`
  }
}
