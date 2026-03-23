import {LitElement, css, html} from 'lit'

export class CVOption extends LitElement {
  static elementName = 'cv-option'

  static get properties() {
    return {
      value: {type: String, reflect: true},
      disabled: {type: Boolean, reflect: true},
      selected: {type: Boolean, reflect: true},
      active: {type: Boolean, reflect: true},
    }
  }

  declare value: string
  declare disabled: boolean
  declare selected: boolean
  declare active: boolean

  constructor() {
    super()
    this.value = ''
    this.disabled = false
    this.selected = false
    this.active = false
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
        display: flex;
        align-items: center;
        padding-block: var(--cv-option-padding-block, var(--cv-space-2, 8px));
        padding-inline: var(--cv-option-padding-inline, var(--cv-space-3, 12px));
        border-radius: var(--cv-option-border-radius, var(--cv-radius-sm, 6px));
        color: var(--cv-color-text, #e8ecf6);
        background: transparent;
        transition:
          background var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease),
          color var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease);
      }

      [part='prefix'],
      [part='label'],
      [part='suffix'] {
        display: contents;
      }

      :host([active]) [part='base'] {
        background: var(
          --cv-option-active-background,
          color-mix(in oklab, var(--cv-color-primary, #65d7ff) 22%, transparent)
        );
      }

      :host([selected]) [part='base'] {
        background: var(
          --cv-option-selected-background,
          color-mix(in oklab, var(--cv-color-primary, #65d7ff) 34%, transparent)
        );
        color: var(--cv-color-text, #e8ecf6);
      }

      :host([disabled]) [part='base'] {
        opacity: var(--cv-option-disabled-opacity, 0.55);
      }

      :host(:focus-visible) [part='base'] {
        outline: 2px solid var(--cv-option-focus-outline-color, var(--cv-color-primary, #65d7ff));
        outline-offset: 1px;
      }
    `,
  ]

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  protected override render() {
    return html`
      <div part="base">
        <span part="prefix"><slot name="prefix"></slot></span>
        <span part="label"><slot></slot></span>
        <span part="suffix"><slot name="suffix"></slot></span>
      </div>
    `
  }
}
