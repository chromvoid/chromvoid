import {LitElement, css, html, nothing} from 'lit'

export class CVSidebarItem extends LitElement {
  static elementName = 'cv-sidebar-item'

  static get properties() {
    return {
      href: {type: String, reflect: true},
      active: {type: Boolean, reflect: true},
      disabled: {type: Boolean, reflect: true},
    }
  }

  declare href: string
  declare active: boolean
  declare disabled: boolean

  constructor() {
    super()
    this.href = ''
    this.active = false
    this.disabled = false
  }

  static styles = [
    css`
      :host {
        display: block;
        outline: none;
      }

      :host([hidden]) {
        display: none;
      }

      [part='base'] {
        position: relative;
        display: flex;
        align-items: center;
        gap: var(--cv-sidebar-item-gap, var(--cv-space-2, 8px));
        min-block-size: var(--cv-sidebar-item-min-block-size, 32px);
        padding-block: var(--cv-sidebar-item-padding-block, var(--cv-space-2, 8px));
        padding-inline: var(--cv-sidebar-item-padding-inline, var(--cv-space-3, 12px));
        border-radius: var(--cv-sidebar-item-border-radius, var(--cv-radius-sm, 6px));
        border-inline-start: var(--cv-sidebar-item-indicator-width, 2px) solid transparent;
        background: var(--cv-sidebar-item-background, transparent);
        color: var(--cv-sidebar-item-color, var(--cv-color-text-muted, #9aa6bf));
        font-family: var(--cv-sidebar-item-font-family, inherit);
        font-size: var(--cv-sidebar-item-font-size, inherit);
        font-weight: var(--cv-sidebar-item-font-weight, inherit);
        letter-spacing: var(--cv-sidebar-item-letter-spacing, normal);
        text-decoration: none;
        transition:
          background var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease),
          border-color var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease),
          color var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease);
        overflow: hidden;
      }

      [part='base']:focus-visible {
        outline: 2px solid var(--cv-sidebar-item-outline-color, var(--cv-color-primary, #65d7ff));
        outline-offset: 1px;
      }

      :host(:hover) [part='base'] {
        background: var(
          --cv-sidebar-item-background-hover,
          color-mix(in oklab, var(--cv-color-surface, #141923) 82%, white 18%)
        );
        color: var(--cv-sidebar-item-color-hover, var(--cv-color-text, #e8ecf6));
      }

      :host([active]) [part='base'] {
        background: var(--cv-sidebar-item-background-active, transparent);
        color: var(--cv-sidebar-item-color-active, var(--cv-color-primary, #65d7ff));
        border-inline-start-color: var(
          --cv-sidebar-item-indicator-color,
          var(--cv-color-primary, #65d7ff)
        );
      }

      :host([disabled]) [part='base'] {
        opacity: 0.55;
        cursor: not-allowed;
      }

      [part='prefix'],
      [part='suffix'] {
        position: relative;
        z-index: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      [part='label'] {
        position: relative;
        z-index: 1;
        flex: 1;
        min-inline-size: 0;
      }

      :host([data-sidebar-collapsed]:not([data-sidebar-mobile])) [part='base'] {
        justify-content: center;
        padding-inline: var(--cv-sidebar-item-collapsed-padding-inline, var(--cv-space-2, 8px));
      }

      :host([data-sidebar-collapsed]:not([data-sidebar-mobile])) [part='label'] {
        position: absolute;
        inline-size: 1px;
        block-size: 1px;
        margin: -1px;
        padding: 0;
        border: 0;
        clip: rect(0 0 0 0);
        overflow: hidden;
        white-space: nowrap;
      }

      :host([data-sidebar-collapsed]:not([data-sidebar-mobile])) [part='suffix'] {
        display: none;
      }

    `,
  ]

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  private handleClick(event: MouseEvent) {
    if (!this.disabled) return
    event.preventDefault()
    event.stopPropagation()
  }

  protected override render() {
    return html`
      <a
        part="base"
        href=${!this.disabled && this.href ? this.href : nothing}
        aria-current=${this.active ? 'location' : nothing}
        aria-disabled=${this.disabled ? 'true' : nothing}
        tabindex=${this.disabled ? '-1' : nothing}
        @click=${this.handleClick}
      >
        <span part="prefix"><slot name="prefix"></slot></span>
        <span part="label"><slot></slot></span>
        <span part="suffix"><slot name="suffix"></slot></span>
      </a>
    `
  }
}
