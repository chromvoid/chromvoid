import {createLink, type LinkModel} from '@chromvoid/headless-ui'
import {css, html, nothing} from 'lit'
import type {PropertyValues} from 'lit'

import {ReatomLitElement} from '../reatom-lit/ReatomLitElement'

interface CVLinkPressDetail {
  href: string
}

let cvLinkNonce = 0

export class CVLink extends ReatomLitElement {
  static elementName = 'cv-link'

  static get properties() {
    return {
      href: {type: String, reflect: true},
    }
  }

  declare href: string

  private readonly idBase = `cv-link-${++cvLinkNonce}`
  private model: LinkModel

  constructor() {
    super()
    this.href = ''
    this.model = this.createModel()
  }

  static styles = [
    css`
      :host {
        display: inline-block;
      }

      [part='base'] {
        display: inline-flex;
        align-items: center;
        gap: var(--cv-link-gap, var(--cv-space-1, 4px));
        color: var(--cv-link-color, var(--cv-color-primary, #65d7ff));
        text-decoration: var(--cv-link-text-decoration, underline);
        text-underline-offset: 3px;
        text-decoration-thickness: 1px;
        transition: color var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease);
      }

      :host(:hover) [part='base'] {
        color: var(
          --cv-link-color-hover,
          color-mix(in oklab, var(--cv-color-primary, #65d7ff) 78%, white)
        );
        text-decoration: var(--cv-link-text-decoration-hover, none);
      }

      :host(:active) [part='base'] {
        color: var(
          --cv-link-color-active,
          color-mix(in oklab, var(--cv-color-primary, #65d7ff) 60%, white)
        );
      }

      [part='base']:focus-visible {
        outline: 2px solid var(--cv-link-outline-color, var(--cv-color-primary, #65d7ff));
        outline-offset: var(--cv-link-outline-offset, 2px);
        border-radius: 4px;
      }
    `,
  ]

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  override willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties)

    if (changedProperties.has('href')) {
      this.model = this.createModel()
    }
  }

  private createModel(): LinkModel {
    return createLink({
      idBase: this.idBase,
      href: this.href || undefined,
      isSemanticHost: true,
      onPress: () => {
        this.dispatchEvent(
          new CustomEvent<CVLinkPressDetail>('press', {
            detail: {href: this.href},
            bubbles: true,
            composed: true,
          }),
        )
      },
    })
  }

  private handleClick(event: MouseEvent) {
    this.model.contracts.getLinkProps().onClick(event)
  }

  private handleKeyDown(event: KeyboardEvent) {
    this.model.contracts.getLinkProps().onKeyDown(event)
  }

  protected override render() {
    const props = this.model.contracts.getLinkProps()

    return html`
      <a
        id=${props.id}
        href=${props.href ?? nothing}
        part="base"
        @click=${this.handleClick}
        @keydown=${this.handleKeyDown}
      >
        <span part="prefix"><slot name="prefix"></slot></span>
        <span part="label"><slot></slot></span>
        <span part="suffix"><slot name="suffix"></slot></span>
      </a>
    `
  }
}
