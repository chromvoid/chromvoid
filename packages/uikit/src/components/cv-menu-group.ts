import {LitElement, css, html} from 'lit'

export class CVMenuGroup extends LitElement {
  static elementName = 'cv-menu-group'

  static get properties() {
    return {
      type: {type: String, reflect: true},
      label: {type: String, reflect: true},
    }
  }

  declare type: '' | 'checkbox' | 'radio'
  declare label: string

  constructor() {
    super()
    this.type = ''
    this.label = ''
  }

  static styles = [
    css`
      :host {
        display: grid;
        gap: var(--cv-menu-group-gap, var(--cv-space-1, 4px));
      }

      :host([hidden]) {
        display: none;
      }

      [part='label'] {
        padding: 0 var(--cv-menu-group-label-padding-inline, var(--cv-space-3, 12px));
        font-size: var(--cv-menu-group-label-font-size, 0.75em);
        color: var(--cv-color-text-muted, #8892a6);
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
      <div part="label" role="presentation">
        <slot name="label">${this.label}</slot>
      </div>
      <div part="base" role="group" aria-label=${this.label || ''}>
        <slot></slot>
      </div>
    `
  }
}
