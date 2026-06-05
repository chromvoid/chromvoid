import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {css} from 'lit'

export class MobileBottomActionFooter extends ReatomLitElement {
  static elementName = 'mobile-bottom-action-footer'

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
  }

  static styles = css`
    :host {
      position: relative;
      z-index: var(--cv-mobile-bottom-action-z-index, auto);
      display: grid;
      flex: 0 0 auto;
      box-sizing: border-box;
      min-inline-size: 0;
      padding: var(--cv-mobile-bottom-action-padding, var(--cv-space-2) var(--cv-space-3));
      border-block-start: 1px solid var(--cv-color-border-faint);
      background: var(--cv-color-bg);
      box-shadow: 0 -16px 24px -16px var(--cv-alpha-black-35);
    }

    :host([hidden]) {
      display: none;
    }

    :host([columns='2']) {
      --cv-mobile-bottom-action-columns: 2;
    }

    :host([columns='3']) {
      --cv-mobile-bottom-action-columns: 3;
    }

    .container {
      display: grid;
      min-inline-size: 0;
    }

    .message {
      display: none;
      min-inline-size: 0;
      margin-block-end: var(--cv-mobile-bottom-action-message-gap, var(--cv-space-2));
    }

    :host([has-message]) .message {
      display: block;
    }

    .row {
      display: grid;
      grid-template-columns: repeat(var(--cv-mobile-bottom-action-columns, 1), minmax(0, 1fr));
      gap: var(--cv-space-2);
      min-inline-size: 0;
    }

    slot:not([name])::slotted(*) {
      inline-size: 100%;
      min-inline-size: 0;
    }
  `

  protected render() {
    return html`
      <footer class="container" part="container">
        <div class="message" part="message">
          <slot name="message"></slot>
        </div>
        <div class="row" part="row">
          <slot></slot>
        </div>
      </footer>
    `
  }
}
