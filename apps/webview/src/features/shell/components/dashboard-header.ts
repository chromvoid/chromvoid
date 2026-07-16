import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {css} from 'lit'

import {sharedStyles} from 'root/shared/ui/shared-styles'

import {DesktopShellToolbar} from './desktop-shell-toolbar'

function hasNamedSlotContent(host: HTMLElement, slotName: string): boolean {
  return Array.from(host.childNodes).some((node) => {
    if (!(node instanceof HTMLElement)) return false
    if (node.slot !== slotName) return false
    if (node.hidden) return false

    return true
  })
}

export class DashboardHeader extends ReatomLitElement {
  static elementName = 'dashboard-header'

  static get properties() {
    return {
      twoRow: {type: Boolean, reflect: true, attribute: 'two-row'},
      surface: {type: String, reflect: true},
    }
  }

  declare twoRow: boolean
  declare surface: string

  constructor() {
    super()
    this.twoRow = false
    this.surface = ''
  }

  static define() {
    DesktopShellToolbar.define()
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
  }

  static styles = [
    sharedStyles,
    css`
      :host {
        display: block;
        min-inline-size: 0;
        contain: style;
        container-type: inline-size;
        --pm-toolbar-control-block-size: var(--app-dashboard-header-control-block-size);
        --pm-toolbar-control-radius: var(--app-dashboard-header-control-radius);
        --pm-toolbar-control-padding-inline: var(--app-dashboard-header-control-padding-inline);
        --pm-toolbar-control-font-size: var(--app-dashboard-header-control-font-size);
        --pm-toolbar-control-font-weight: var(--app-dashboard-header-control-font-weight);
        --pm-toolbar-control-gap: var(--app-dashboard-header-control-gap);
      }

      cv-button,
      ::slotted(cv-button) {
        --cv-button-min-height: var(--app-dashboard-header-control-block-size);
        --cv-button-border-radius: var(--app-dashboard-header-control-radius);
        --cv-button-padding-block: 0;
        --cv-button-padding-inline: var(--app-dashboard-header-control-padding-inline);
        --cv-button-font-size: var(--app-dashboard-header-control-font-size);
        --cv-button-font-weight: var(--app-dashboard-header-control-font-weight);
        --cv-button-gap: var(--app-dashboard-header-control-gap);
      }

      cv-menu-button,
      ::slotted(cv-menu-button) {
        --cv-menu-button-min-height: var(--app-dashboard-header-control-block-size);
        --cv-menu-button-border-radius: var(--app-dashboard-header-control-radius);
        --cv-menu-button-menu-align: end;
        --cv-menu-button-menu-min-inline-size: 240px;
        --cv-menu-button-menu-offset: var(--app-spacing-2);
        --cv-menu-button-menu-z-index: var(--cv-z-overlay, 300);
      }

      .slot-forwarder {
        display: contents;
        min-inline-size: 0;
      }

      .slot-forwarder[hidden] {
        display: none !important;
      }

      ::slotted(*) {
        min-inline-size: 0;
      }

      ::slotted(.toolbar-side) {
        display: flex;
        align-items: center;
        gap: var(--app-dashboard-header-control-gap);
        min-inline-size: 0;
        min-width: 0;
        flex-wrap: nowrap;
      }

      ::slotted(.toolbar-side-end) {
        margin-inline-start: auto;
        justify-content: flex-end;
        overflow: visible;
      }

      ::slotted(.toolbar-primary-row) {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        align-items: center;
        gap: var(--app-desktop-shell-toolbar-two-row-column-gap);
        inline-size: 100%;
        min-inline-size: 0;
      }

      ::slotted(.toolbar-controls-row) {
        display: flex;
        flex-wrap: nowrap;
        align-items: center;
        justify-content: space-between;
        gap: var(--app-desktop-shell-toolbar-two-row-column-gap);
        inline-size: 100%;
        min-inline-size: 0;
      }

      ::slotted(.toolbar-search) {
        inline-size: 100%;
        min-inline-size: 0;
      }

      ::slotted(.toolbar-otp-search) {
        inline-size: min(100%, 720px);
        margin-inline-start: auto;
      }

      @container (width < 760px) {
        ::slotted(.toolbar-side) {
          --cv-menu-button-menu-min-inline-size: 220px;
        }

        ::slotted(.toolbar-primary-row),
        ::slotted(.toolbar-controls-row) {
          display: flex;
          flex-wrap: wrap;
          justify-content: stretch;
        }
      }
    `,
  ]

  private handleSlotChange() {
    this.requestUpdate()
  }

  protected render() {
    const hasLeadingSlot = hasNamedSlotContent(this, 'leading')
    const hasTitleSlot = hasNamedSlotContent(this, 'title')
    const hasSubtitleSlot = hasNamedSlotContent(this, 'subtitle')
    const hasStartSlot = hasNamedSlotContent(this, 'start')
    const hasCenterSlot = hasNamedSlotContent(this, 'center')
    const hasActionsSlot = hasNamedSlotContent(this, 'actions')
    const hasEndSlot = hasNamedSlotContent(this, 'end')

    return html`
      <desktop-shell-toolbar ?two-row=${this.twoRow}>
        <div slot="leading" class="slot-forwarder" data-slot-forwarder ?hidden=${!hasLeadingSlot}>
          <slot name="leading" @slotchange=${this.handleSlotChange}></slot>
        </div>
        <div slot="title" class="slot-forwarder" data-slot-forwarder ?hidden=${!hasTitleSlot}>
          <slot name="title" @slotchange=${this.handleSlotChange}></slot>
        </div>
        <div slot="subtitle" class="slot-forwarder" data-slot-forwarder ?hidden=${!hasSubtitleSlot}>
          <slot name="subtitle" @slotchange=${this.handleSlotChange}></slot>
        </div>
        <div slot="start" class="slot-forwarder" data-slot-forwarder ?hidden=${!hasStartSlot}>
          <slot name="start" @slotchange=${this.handleSlotChange}></slot>
        </div>
        <div slot="center" class="slot-forwarder" data-slot-forwarder ?hidden=${!hasCenterSlot}>
          <slot name="center" @slotchange=${this.handleSlotChange}></slot>
        </div>
        <div slot="actions" class="slot-forwarder" data-slot-forwarder ?hidden=${!hasActionsSlot}>
          <slot name="actions" @slotchange=${this.handleSlotChange}></slot>
        </div>
        <div slot="end" class="slot-forwarder" data-slot-forwarder ?hidden=${!hasEndSlot}>
          <slot name="end" @slotchange=${this.handleSlotChange}></slot>
        </div>
      </desktop-shell-toolbar>
    `
  }
}
