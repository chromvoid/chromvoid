import {LitElement, css, html} from 'lit'
import type {TreegridCellRole} from '@chromvoid/headless-ui'

export class CVTreegridColumn extends LitElement {
  static elementName = 'cv-treegrid-column'

  static get properties() {
    return {
      value: {type: String, reflect: true},
      label: {type: String, reflect: true},
      index: {type: Number, reflect: true},
      disabled: {type: Boolean, reflect: true},
      cellRole: {type: String, attribute: 'cell-role', reflect: true},
    }
  }

  declare value: string
  declare label: string
  declare index: number
  declare disabled: boolean
  declare cellRole: TreegridCellRole

  constructor() {
    super()
    this.value = ''
    this.label = ''
    this.index = 0
    this.disabled = false
    this.cellRole = 'gridcell'
  }

  static styles = [
    css`
      :host {
        display: flex;
        align-items: center;
        min-block-size: 36px;
        padding-inline: var(--cv-space-2, 8px);
        border-bottom: 1px solid var(--cv-color-border, #2a3245);
        font-weight: 600;
        color: var(--cv-color-text, #e8ecf6);
        background: color-mix(in oklab, var(--cv-color-surface, #141923) 82%, transparent);
        outline: none;
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
    return html`<span><slot>${this.label}</slot></span>`
  }
}
