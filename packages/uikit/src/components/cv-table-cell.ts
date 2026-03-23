import {LitElement, css, html} from 'lit'

export class CVTableCell extends LitElement {
  static elementName = 'cv-table-cell'

  static get properties() {
    return {
      column: {type: String, reflect: true},
      rowHeader: {type: Boolean, attribute: 'row-header', reflect: true},
      colspan: {type: Number, reflect: true},
      rowspan: {type: Number, reflect: true},
    }
  }

  declare column: string
  declare rowHeader: boolean
  declare colspan: number
  declare rowspan: number

  constructor() {
    super()
    this.column = ''
    this.rowHeader = false
    this.colspan = 0
    this.rowspan = 0
  }

  static styles = [
    css`
      :host {
        display: table-cell;
        padding: var(--cv-table-cell-padding-block, var(--cv-space-2, 8px)) var(--cv-table-cell-padding-inline, var(--cv-space-3, 12px));
        border-bottom: 1px solid color-mix(in oklab, var(--cv-color-border, #2a3245) 70%, transparent);
        color: var(--cv-color-text, #e8ecf6);
      }

      :host([row-header]) {
        font-weight: 600;
      }

      :host([data-active="true"]) {
        outline: 2px solid var(--cv-table-focus-outline-color, var(--cv-color-primary, #65d7ff));
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
