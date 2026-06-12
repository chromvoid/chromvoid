import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {css} from 'lit'

import {sharedStyles} from 'root/shared/ui/shared-styles'
import {MobileSurfaceLayout} from 'root/shared/ui/mobile-surface-layout'
import {mobileSurfaceLayoutFlexFillStyles} from 'root/shared/ui/mobile-surface-layout.styles'

export class FileManagerMobileLayout extends ReatomLitElement {
  static elementName = 'file-manager-mobile-layout'

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
    MobileSurfaceLayout.define()
  }

  static styles = [
    sharedStyles,
    mobileSurfaceLayoutFlexFillStyles,
    css`
      :host {
        height: 100%;
        min-height: 100%;
        /*
         * Nested mobile drawers render with fixed positioning.
         * Layout containment here turns this layout into their containing block in
         * WebViews, which makes sheets appear clipped or not open at all.
         */
        contain: style;
      }

      .dashboard-wrapper {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        padding: 0;
        gap: 0;
        overflow: hidden;
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
        border-radius: 0;
        border-inline: none;
        border-block-start: none;
        border-block-end: none;
        overflow: hidden;
        contain: style;
      }

      .catalog-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-height: 0;
      }

      .file-list-area {
        flex: 1;
        min-height: 0;
        display: flex;
        padding: 0;
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
        <mobile-surface-layout variant="flush" scroll="external">
          <div class="catalog">
            <div class="catalog-content">
              <slot name="header"></slot>
              <div class="file-list-area">
                <slot name="dropzone"></slot>
              </div>
            </div>
          </div>
        </mobile-surface-layout>

        <slot name="context-menu"></slot>
        <slot name="upload-progress"></slot>
      </div>
    `
  }
}
