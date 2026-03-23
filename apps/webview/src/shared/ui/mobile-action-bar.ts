import {XLitElement} from '@statx/lit'
import {css, html} from 'lit'

/**
 * Horizontal action bar for mobile layouts.
 *
 * Sits in the document flow (not fixed), typically at the bottom of a flex
 * column wrapper, above the tab bar. Renders slotted content in a flex row.
 *
 * Button styling (`tb-btn`, `tb-btn-more`, etc.) is provided separately via
 * `mobileActionBarButtonStyles` — import it into the consumer's `static styles`
 * so that `::part()` selectors work on the slotted buttons.
 *
 * @slot - Action buttons (cv-button, cv-menu-button, .action-divider spans)
 */
export class MobileActionBar extends XLitElement {
  static elementName = 'mobile-action-bar'

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
  }

  static styles = css`
    :host {
      display: flex;
      align-items: center;
      justify-content: space-evenly;
      flex-shrink: 0;
      padding: 6px 12px;
      border-block-start: 1px solid
        color-mix(in oklch, var(--cv-color-border-muted, var(--cv-color-border)) 40%, transparent);
      background: var(--cv-color-bg);
    }

    :host([hidden]) {
      display: none;
    }
  `

  protected render() {
    return html`<slot></slot>`
  }
}
