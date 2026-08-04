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
      z-index: auto;
      display: grid;
      flex: 0 0 auto;
      box-sizing: border-box;
      min-inline-size: 0;
      margin-block-end: var(--app-runtime-keyboard-block-end-action-offset, 0px);
      border-block-start: 1px solid var(--cv-color-border-faint);
      background: var(--cv-color-bg);
      box-shadow: 0 -16px 24px -16px var(--cv-alpha-black-35);
    }

    :host([safe-area]) {
      padding-block-end: var(
        --app-runtime-safe-area-block-end-active,
        var(--app-runtime-safe-area-block-end, env(safe-area-inset-bottom, 0px))
      );
      padding-inline-start: var(--app-runtime-safe-area-inline-start, env(safe-area-inset-left, 0px));
      padding-inline-end: var(--app-runtime-safe-area-inline-end, env(safe-area-inset-right, 0px));
    }

    /*
     * The opt-in safe-area attribute is for no-tabbar shell layouts, which
     * intentionally remove their own bottom padding. Feature spacing stays on
     * the inner container, so runtime insets compose with rather than replace it.
     *
     * The footer is a flex/grid sibling of its surface scroller. In overlay
     * keyboard mode this margin consumes the occluded part of the layout
     * viewport, which both keeps the actions visible and gives the scroller a
     * reachable bottom. runtime.css maps the document-wide keyboard state to
     * the inherited action offset. Native-resize mode publishes only the small
     * breathing gap, so the already-resized viewport is never inset a second
     * time.
     *
     * Keyboard-aware feature surfaces should use this primitive instead of
     * adding their own html[data-mobile-keyboard-*] footer margins.
     */
    :host([hidden]) {
      display: none;
    }

    .container {
      display: grid;
      box-sizing: border-box;
      min-inline-size: 0;
      padding: var(--app-mobile-block-end-action-padding, var(--cv-space-2) var(--cv-space-3));
    }

    .message {
      display: none;
      min-inline-size: 0;
      margin-block-end: var(--cv-space-2);
    }

    :host([has-message]) .message {
      display: block;
    }

    .row {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--cv-space-2);
      min-inline-size: 0;
    }

    :host([columns='2']) .row {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    :host([columns='3']) .row {
      grid-template-columns: repeat(3, minmax(0, 1fr));
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
