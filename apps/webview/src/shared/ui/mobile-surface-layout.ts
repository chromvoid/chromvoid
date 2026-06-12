import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {mobileSurfaceLayoutStyles} from './mobile-surface-layout.styles'

export type MobileSurfaceLayoutVariant = 'standard' | 'flush' | 'nested'
export type MobileSurfaceLayoutScroll = 'owned' | 'external'

export class MobileSurfaceLayout extends ReatomLitElement {
  static elementName = 'mobile-surface-layout'

  static properties = {
    variant: {type: String, reflect: true},
    scrollMode: {attribute: 'scroll', type: String, reflect: true},
  }

  declare variant: MobileSurfaceLayoutVariant
  declare scrollMode: MobileSurfaceLayoutScroll

  constructor() {
    super()
    this.variant = 'standard'
    this.scrollMode = 'owned'
  }

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
  }

  static styles = mobileSurfaceLayoutStyles

  protected render() {
    const content = this.scrollMode === 'external'
      ? html`<div class="content" part="content"><slot></slot></div>`
      : html`<div class="scroll" part="scroll"><slot></slot></div>`

    return html`
      <div class="header" part="header"><slot name="header"></slot></div>
      ${content}
      <div class="footer" part="footer"><slot name="footer"></slot></div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'mobile-surface-layout': MobileSurfaceLayout
  }
}
