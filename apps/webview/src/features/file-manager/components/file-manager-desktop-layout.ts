import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {css} from 'lit'

import {hostLayoutPaintContainStyles, sharedStyles} from 'root/shared/ui/shared-styles'

export class FileManagerDesktopLayout extends ReatomLitElement {
  static elementName = 'file-manager-desktop-layout'

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
  }

  static styles = [
    sharedStyles,
    hostLayoutPaintContainStyles,
    css`
      :host {
        height: 100%;
        min-height: 100%;
      }

      .dashboard-wrapper {
        display: flex;
        flex-direction: column;
        height: 100%;
        padding: var(--app-spacing-2);
      }

      :host([data-pm-open]) .dashboard-wrapper {
        filter: blur(2px);
        pointer-events: none;
      }

      .catalog {
        flex: 1;
        display: flex;
        flex-direction: column;
        background: transparent;
        overflow: hidden;
        contain: layout style paint;
      }

      .catalog-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-height: 0;
      }

      .file-list-area {
        flex: 1;
        padding: 0;
        min-height: 0;
        display: flex;
        contain: layout style;
      }

      ::slotted([slot='header']) {
        display: block;
      }

      ::slotted([slot='dropzone']) {
        flex: 1;
        min-height: 0;
        min-inline-size: 0;
        inline-size: 100%;
        display: block;
      }

      ::slotted([slot='context-menu']),
      ::slotted([slot='upload-progress']) {
        display: block;
      }
    `,
  ]

  protected render() {
    return html`
      <div class="dashboard-wrapper">
        <div class="catalog">
          <div class="catalog-content">
            <slot name="header"></slot>
            <div class="file-list-area">
              <slot name="dropzone"></slot>
            </div>
          </div>
        </div>

        <slot name="context-menu"></slot>
        <slot name="upload-progress"></slot>
      </div>
    `
  }
}
