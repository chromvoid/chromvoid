import {LitElement, css, html} from 'lit'

export type CVTreegridRowSlotchangeEvent = CustomEvent<null>

export interface CVTreegridRowEventMap {
  'cv-treegrid-row-slotchange': CVTreegridRowSlotchangeEvent
}

export class CVTreegridRow extends LitElement {
  static elementName = 'cv-treegrid-row'

  static get properties() {
    return {
      value: {type: String, reflect: true},
      index: {type: Number, reflect: true},
      disabled: {type: Boolean, reflect: true},
      active: {type: Boolean, reflect: true},
      selected: {type: Boolean, reflect: true},
      expanded: {type: Boolean, reflect: true},
      branch: {type: Boolean, reflect: true},
      level: {type: Number, reflect: true},
    }
  }

  declare value: string
  declare index: number
  declare disabled: boolean
  declare active: boolean
  declare selected: boolean
  declare expanded: boolean
  declare branch: boolean
  declare level: number

  constructor() {
    super()
    this.value = ''
    this.index = 0
    this.disabled = false
    this.active = false
    this.selected = false
    this.expanded = false
    this.branch = false
    this.level = 1
  }

  static styles = [
    css`
      :host {
        display: block;
        --cv-treegrid-child-indent: var(--cv-treegrid-child-indent, 14px);
        outline: none;
      }

      :host([hidden]) {
        display: none;
      }

      :host(:focus-visible) [part='row'] {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: -2px;
      }

      :host([active]) [part='row'],
      :host([selected]) [part='row'] {
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 18%, transparent);
      }

      :host([disabled]) [part='row'],
      :host([disabled]) [part='children'] {
        opacity: 0.55;
      }

      [part='row'] {
        display: grid;
        grid-template-columns: repeat(var(--cv-treegrid-column-count, 1), minmax(0, 1fr));
        align-items: center;
        min-block-size: 32px;
        padding-inline: var(--cv-space-2, 8px);
        padding-inline-start: calc(var(--cv-treegrid-child-indent) * max(var(--cv-treegrid-level, 1) - 1, 0));
      }

      [part='children'][hidden] {
        display: none;
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
      new CustomEvent<CVTreegridRowSlotchangeEvent['detail']>('cv-treegrid-row-slotchange', {
        bubbles: true,
        composed: true,
      }),
    )
  }

  protected override render() {
    this.style.setProperty('--cv-treegrid-level', String(this.level || 1))
    return html`
      <div part="row">
        <slot @slotchange=${this.handleSlotChange}></slot>
      </div>
      <div part="children" ?hidden=${!this.expanded}>
        <slot name="children" @slotchange=${this.handleSlotChange}></slot>
      </div>
    `
  }
}
