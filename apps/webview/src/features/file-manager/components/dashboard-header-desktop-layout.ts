import {XLitElement} from '@statx/lit'

import {css, html} from 'lit'

import {hostContentContainStyles, sharedStyles} from 'root/shared/ui/shared-styles'

export class DashboardHeaderDesktopLayout extends XLitElement {
  static elementName = 'dashboard-header-desktop-layout'

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
  }

  static styles = [
    sharedStyles,
    hostContentContainStyles,
    css`
      .header-container {
        display: flex;
        flex-direction: column;
        background: var(--cv-color-surface);
        border-block-end: 1px solid var(--cv-color-border-muted);
      }

      .breadcrumb-row {
        display: flex;
        align-items: center;
        padding: var(--app-spacing-2) var(--app-spacing-3);
        border-block-end: 1px solid color-mix(in oklch, var(--cv-color-border-muted) 50%, transparent);
        min-block-size: 36px;
        background: color-mix(in oklch, var(--cv-color-surface) 95%, var(--cv-color-bg));
      }

      .toolbar-row {
        display: flex;
        align-items: center;
        gap: var(--app-spacing-3);
        padding: var(--app-spacing-2) var(--app-spacing-3);
        min-block-size: 44px;
      }

      .actions-section {
        display: flex;
        align-items: center;
        flex-shrink: 0;
      }

      .filters-section {
        display: flex;
        align-items: center;
        margin-inline-start: auto;
        flex: 1 1 auto;
        min-inline-size: 0;
        justify-content: flex-end;
      }

      ::slotted([slot='breadcrumbs']) {
        flex: 1;
        min-inline-size: 0;
      }

      ::slotted([slot='actions']) {
        display: flex;
        align-items: center;
      }

      ::slotted([slot='filters']) {
        inline-size: 100%;
        min-inline-size: 0;
      }

      @container (min-width: 1200px) {
        .breadcrumb-row {
          padding: var(--app-spacing-2) var(--app-spacing-4);
        }

        .toolbar-row {
          padding: var(--app-spacing-2) var(--app-spacing-4);
        }
      }
    `,
  ]

  protected render() {
    return html`
      <div class="header-container">
        <div class="breadcrumb-row">
          <slot name="breadcrumbs"></slot>
        </div>

        <div class="toolbar-row">
          <div class="actions-section">
            <slot name="actions"></slot>
          </div>
          <div class="filters-section">
            <slot name="filters"></slot>
          </div>
        </div>
      </div>
    `
  }
}
