import {css, html} from 'lit'

import {ReatomLitElement} from '../reatom-lit/ReatomLitElement'

export class CVFeedArticle extends ReatomLitElement {
  static elementName = 'cv-feed-article'

  static get properties() {
    return {
      articleId: {type: String, attribute: 'article-id', reflect: true},
      active: {type: Boolean, reflect: true},
      disabled: {type: Boolean, reflect: true},
    }
  }

  declare articleId: string
  declare active: boolean
  declare disabled: boolean

  constructor() {
    super()
    this.articleId = ''
    this.active = false
    this.disabled = false
  }

  static styles = [
    css`
      :host {
        display: block;
        outline: none;
      }

      [part='base'] {
        padding: var(--cv-feed-article-padding, var(--cv-space-3, 12px));
        border-radius: var(--cv-feed-article-border-radius, var(--cv-radius-sm, 6px));
      }

      :host([active]) [part='base'] {
        outline: var(--cv-feed-article-focus-ring, 2px solid var(--cv-color-primary, #65d7ff));
        outline-offset: -2px;
      }

      :host([disabled]) {
        opacity: 0.5;
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
      <div part="base" role="article">
        <slot></slot>
      </div>
    `
  }
}
