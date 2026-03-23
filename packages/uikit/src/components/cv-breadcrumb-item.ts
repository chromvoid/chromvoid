import {LitElement, css, html, nothing} from 'lit'

export class CVBreadcrumbItem extends LitElement {
  static elementName = 'cv-breadcrumb-item'

  static get properties() {
    return {
      value: {type: String, reflect: true},
      href: {type: String, reflect: true},
      current: {type: Boolean, reflect: true},
      showSeparator: {type: Boolean, attribute: 'show-separator', reflect: true},
      linkId: {attribute: false},
    }
  }

  declare value: string
  declare href: string
  declare current: boolean
  declare showSeparator: boolean
  declare linkId: string

  constructor() {
    super()
    this.value = ''
    this.href = ''
    this.current = false
    this.showSeparator = true
    this.linkId = ''
  }

  static styles = [
    css`
      :host {
        display: inline-flex;
        align-items: center;
        gap: var(--cv-space-2, 8px);
      }

      [part='link'] {
        color: var(--cv-color-text, #e8ecf6);
        text-decoration: none;
      }

      :host([current]) [part='link'] {
        font-weight: 600;
      }

      [part='separator'] {
        color: color-mix(in oklab, var(--cv-color-text, #e8ecf6) 60%, transparent);
      }

      [part='separator'][hidden] {
        display: none;
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
      <span part="prefix"><slot name="prefix"></slot></span>
      <a id=${this.linkId || nothing} role="link" href=${this.href} aria-current=${this.current ? 'page' : nothing} part="link">
        <slot></slot>
      </a>
      <span part="suffix"><slot name="suffix"></slot></span>
      <span aria-hidden="true" ?hidden=${!this.showSeparator} part="separator">
        <slot name="separator">/</slot>
      </span>
    `
  }
}
