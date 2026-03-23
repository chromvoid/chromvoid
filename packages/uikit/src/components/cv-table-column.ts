import {LitElement, css, html, nothing} from 'lit'
import type {TableSortDirection} from '@chromvoid/headless-ui'

export class CVTableColumn extends LitElement {
  static elementName = 'cv-table-column'

  static get properties() {
    return {
      value: {type: String, reflect: true},
      label: {type: String, reflect: true},
      index: {type: Number, reflect: true},
      sortable: {type: Boolean, reflect: true},
      sortDirection: {type: String, attribute: 'sort-direction', reflect: true},
    }
  }

  declare value: string
  declare label: string
  declare index: number
  declare sortable: boolean
  declare sortDirection: TableSortDirection

  constructor() {
    super()
    this.value = ''
    this.label = ''
    this.index = 0
    this.sortable = false
    this.sortDirection = 'none'
  }

  static styles = [
    css`
      :host {
        display: table-cell;
        padding: var(--cv-space-2, 8px) var(--cv-space-3, 12px);
        border-bottom: 1px solid var(--cv-color-border, #2a3245);
        font-weight: 600;
        color: var(--cv-color-text, #e8ecf6);
        background: color-mix(in oklab, var(--cv-color-surface, #141923) 82%, transparent);
        outline: none;
      }

      :host([sortable]) {
        cursor: pointer;
      }

      :host(:focus-visible) {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: -2px;
      }

      :host([sort-direction='ascending']),
      :host([sort-direction='descending']) {
        color: var(--cv-color-primary, #65d7ff);
      }

      [part='base'] {
        display: inline-flex;
        align-items: center;
        gap: var(--cv-space-1, 4px);
      }
    `,
  ]

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  protected override render() {
    const indicator =
      this.sortDirection === 'ascending' ? '▲' : this.sortDirection === 'descending' ? '▼' : nothing

    return html`<span part="base"><slot>${this.label}</slot>${indicator}</span>`
  }
}
