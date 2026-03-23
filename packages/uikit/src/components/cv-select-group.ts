import {LitElement, css, html} from 'lit'

export class CVSelectGroup extends LitElement {
  static elementName = 'cv-select-group'

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
        display: grid;
        gap: var(--cv-space-1, 4px);
      }

      :host([hidden]) {
        display: none;
      }

      .label {
        padding: 0 var(--cv-space-2, 8px);
        font-size: 0.75rem;
        letter-spacing: 0.02em;
        color: var(--cv-color-text-muted, #9aa6bf);
      }
    `,
  ]

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  protected override render() {
    const content = this.label || this.getAttribute('label') || ''
    return html`
      <div class="label" part="label">${content}</div>
      <slot></slot>
    `
  }
}
