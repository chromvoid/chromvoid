import {LitElement, css, html} from 'lit'

export class CVTreegridCell extends LitElement {
  static elementName = 'cv-treegrid-cell'

  static get properties() {
    return {
      column: {type: String, reflect: true},
      disabled: {type: Boolean, reflect: true},
      active: {type: Boolean, reflect: true},
      selected: {type: Boolean, reflect: true},
    }
  }

  declare column: string
  declare disabled: boolean
  declare active: boolean
  declare selected: boolean

  constructor() {
    super()
    this.column = ''
    this.disabled = false
    this.active = false
    this.selected = false
  }

  static styles = [
    css`
      :host {
        display: block;
        padding-inline: var(--cv-space-2, 8px);
        padding-block: var(--cv-space-1, 4px);
        color: var(--cv-color-text, #e8ecf6);
        outline: none;
      }

      :host([active]) {
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 16%, transparent);
      }

      :host([selected]) {
        font-weight: 600;
      }

      :host([disabled]) {
        opacity: 0.55;
      }

      :host(:focus-visible) {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: -2px;
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
