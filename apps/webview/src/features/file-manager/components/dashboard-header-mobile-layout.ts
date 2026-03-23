import {XLitElement} from '@statx/lit'

import {css, html} from 'lit'

import {sharedStyles} from 'root/shared/ui/shared-styles'

export class DashboardHeaderMobileLayout extends XLitElement {
  static elementName = 'dashboard-header-mobile-layout'

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
  }

  static styles = [
    sharedStyles,
    css`
      :host {
        display: block;
        contain: style;
      }

      .header-container {
        display: flex;
        flex-direction: column;
        background: var(--cv-color-surface);
        border-block-end: none;
      }

      /* ===== ROW 1: Breadcrumbs + Status ===== */
      .breadcrumb-row {
        display: flex;
        align-items: center;
        gap: var(--app-spacing-2);
        padding-block: var(--app-spacing-2);
        padding-inline: var(--app-spacing-3);
        min-block-size: 44px;
        border-block-end: 1px solid color-mix(in oklch, var(--cv-color-border-muted) 40%, transparent);
      }

      .breadcrumbs {
        display: flex;
        align-items: center;
        min-inline-size: 0;
        flex: 1;
      }

      .status {
        display: flex;
        align-items: center;
        flex-shrink: 0;
      }

      /* ===== ROW 2: Actions + Filters (horizontal scroll) ===== */
      .toolbar-row {
        display: flex;
        align-items: center;
        gap: var(--app-spacing-2);
        padding-inline: var(--app-spacing-3);
        padding-block: var(--app-spacing-1);
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
      }

      .toolbar-row::-webkit-scrollbar {
        display: none;
      }

      .actions-section {
        display: flex;
        align-items: center;
        flex-shrink: 0;
      }

      :host([selection-mode]) .actions-section {
        flex: 1;
      }

      .divider {
        inline-size: 1px;
        block-size: 20px;
        background: var(--cv-color-border-muted);
        flex-shrink: 0;
        opacity: 0.5;
      }

      :host(:not([selection-mode])) .toolbar-row {
        display: none;
      }

      :host([selection-mode]) .divider,
      :host([selection-mode]) .filters-section {
        display: none;
      }

      .filters-section {
        display: flex;
        align-items: center;
        flex-shrink: 0;
        margin-inline-start: auto;
      }

      /* ===== Slotted content alignment ===== */
      ::slotted([slot='breadcrumbs']) {
        flex: 1;
        min-inline-size: 0;
      }

      ::slotted([slot='actions']) {
        display: flex;
        align-items: center;
      }

      ::slotted([slot='filters']) {
        min-inline-size: 0;
      }
    `,
  ]

  protected render() {
    return html`
      <div class="header-container">
        <div class="breadcrumb-row">
          <div class="breadcrumbs">
            <slot name="breadcrumbs"></slot>
          </div>
        </div>

        <div class="toolbar-row">
          <div class="actions-section">
            <slot name="actions"></slot>
          </div>
          <div class="divider"></div>
          <div class="filters-section">
            <slot name="filters"></slot>
          </div>
        </div>
      </div>
    `
  }
}
