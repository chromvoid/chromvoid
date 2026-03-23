import {LitElement, css, html} from 'lit'

export class CVToolbarSeparator extends LitElement {
  static elementName = 'cv-toolbar-separator'

  static get properties() {
    return {
      value: {type: String, reflect: true},
      separatorRole: {type: String, attribute: false},
      separatorOrientation: {type: String, attribute: false},
    }
  }

  declare value: string
  declare separatorRole: string
  declare separatorOrientation: string

  constructor() {
    super()
    this.value = ''
    this.separatorRole = 'separator'
    this.separatorOrientation = 'vertical'
  }

  static styles = [
    css`
      :host {
        display: block;
        pointer-events: none;
      }

      [part='base'] {
        background: var(--cv-toolbar-separator-color, var(--cv-color-border, #2a3245));
        margin: var(--cv-toolbar-separator-margin, var(--cv-space-1, 4px));
        width: var(--cv-toolbar-separator-size, 1px);
        align-self: stretch;
      }

      [part='base'][aria-orientation='horizontal'] {
        width: auto;
        height: var(--cv-toolbar-separator-size, 1px);
      }
    `,
  ]

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  protected override render() {
    return html`<div part="base" role=${this.separatorRole} aria-orientation=${this.separatorOrientation}></div>`
  }
}
