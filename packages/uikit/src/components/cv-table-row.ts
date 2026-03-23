import {LitElement, css, html} from 'lit'

export type CVTableRowSlotchangeEvent = CustomEvent<null>

export interface CVTableRowEventMap {
  'cv-table-row-slotchange': CVTableRowSlotchangeEvent
}

export class CVTableRow extends LitElement {
  static elementName = 'cv-table-row'

  static get properties() {
    return {
      value: {type: String, reflect: true},
      index: {type: Number, reflect: true},
      selected: {type: Boolean, reflect: true},
    }
  }

  declare value: string
  declare index: number
  declare selected: boolean

  constructor() {
    super()
    this.value = ''
    this.index = 0
    this.selected = false
  }

  static styles = [
    css`
      :host {
        display: table-row;
      }

      :host([selected]) {
        background: var(
          --cv-table-row-selected-background,
          color-mix(in oklab, var(--cv-color-primary, #65d7ff) 12%, transparent)
        );
      }
    `,
  ]

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  private handleSlotChange() {
    this.dispatchEvent(
      new CustomEvent<CVTableRowSlotchangeEvent['detail']>('cv-table-row-slotchange', {
        bubbles: true,
        composed: true,
      }),
    )
  }

  protected override render() {
    return html`<slot @slotchange=${this.handleSlotChange}></slot>`
  }
}
