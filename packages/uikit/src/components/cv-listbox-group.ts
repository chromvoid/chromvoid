import {LitElement, css, html} from 'lit'

export class CVListboxGroup extends LitElement {
  static elementName = 'cv-listbox-group'

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
        gap: var(--cv-listbox-group-gap, var(--cv-space-1, 4px));
      }

      :host([hidden]) {
        display: none;
      }

      [part='label'] {
        padding: 0 var(--cv-space-2, 8px);
        font-size: var(--cv-listbox-group-label-font-size, 0.85em);
        color: var(--cv-listbox-group-label-color, var(--cv-color-text-muted, #8892a6));
      }
    `,
  ]

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  protected override render() {
    return html`
      <div part="label">${this.label}</div>
      <slot></slot>
    `
  }
}
