import {LitElement, css, html} from 'lit'

export class CVTabPanel extends LitElement {
  static elementName = 'cv-tab-panel'

  static get properties() {
    return {
      tab: {type: String, reflect: true},
      selected: {type: Boolean, reflect: true},
    }
  }

  declare tab: string
  declare selected: boolean

  constructor() {
    super()
    this.tab = ''
    this.selected = false
  }

  static styles = [
    css`
      :host {
        display: block;
        color: var(--cv-color-text, #e8ecf6);
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
    return html`<div part="base"><slot></slot></div>`
  }
}
