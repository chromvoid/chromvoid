import {LitElement, css, html} from 'lit'

export type CVGridRowSlotchangeEvent = CustomEvent<null>

export interface CVGridRowEventMap {
  'cv-grid-row-slotchange': CVGridRowSlotchangeEvent
}

export class CVGridRow extends LitElement {
  static elementName = 'cv-grid-row'

  static get properties() {
    return {
      value: {type: String, reflect: true},
      index: {type: Number, reflect: true},
      disabled: {type: Boolean, reflect: true},
    }
  }

  declare value: string
  declare index: number
  declare disabled: boolean

  constructor() {
    super()
    this.value = ''
    this.index = 0
    this.disabled = false
  }

  static styles = [
    css`
      :host {
        display: table-row;
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

  private handleSlotChange() {
    this.dispatchEvent(
      new CustomEvent<CVGridRowSlotchangeEvent['detail']>('cv-grid-row-slotchange', {
        bubbles: true,
        composed: true,
      }),
    )
  }

  protected override render() {
    return html`<slot @slotchange=${this.handleSlotChange}></slot>`
  }
}
