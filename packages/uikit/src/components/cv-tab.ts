import {LitElement, css, html} from 'lit'

export interface CVTabCloseDetail {
  value: string
}

export type CVTabCloseEvent = CustomEvent<CVTabCloseDetail>

export class CVTab extends LitElement {
  static elementName = 'cv-tab'

  static get properties() {
    return {
      value: {type: String, reflect: true},
      disabled: {type: Boolean, reflect: true},
      active: {type: Boolean, reflect: true},
      selected: {type: Boolean, reflect: true},
      closable: {type: Boolean, reflect: true},
    }
  }

  declare value: string
  declare disabled: boolean
  declare active: boolean
  declare selected: boolean
  declare closable: boolean

  constructor() {
    super()
    this.value = ''
    this.disabled = false
    this.active = false
    this.selected = false
    this.closable = false
  }

  static styles = [
    css`
      :host {
        display: inline-block;
        outline: none;
      }

      :host([hidden]) {
        display: none;
      }

      .tab {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-block-size: 34px;
        padding: 0 var(--cv-space-3, 12px);
        border-radius: var(--cv-radius-sm, 6px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        color: var(--cv-color-text, #e8ecf6);
        transition:
          background var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease),
          border-color var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease);
      }

      :host([active]) .tab {
        border-color: var(--cv-color-primary, #65d7ff);
      }

      :host([selected]) .tab {
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 28%, var(--cv-color-surface, #141923));
        border-color: var(--cv-color-primary, #65d7ff);
      }

      :host([disabled]) .tab {
        opacity: 0.5;
      }

      :host(:focus-visible) .tab {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      .close-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        inline-size: 20px;
        block-size: 20px;
        margin-inline-start: var(--cv-space-1, 4px);
        border: 0;
        border-radius: var(--cv-radius-sm, 6px);
        background: transparent;
        color: inherit;
        cursor: pointer;
      }

      .close-button:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      .close-button:disabled {
        cursor: not-allowed;
        opacity: 0.5;
      }
    `,
  ]

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  private handleCloseClick(event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()

    if (this.disabled) {
      return
    }

    this.dispatchEvent(
      new CustomEvent<CVTabCloseEvent['detail']>('cv-close', {
        detail: {value: this.value},
        bubbles: true,
        composed: true,
      }),
    )
  }

  protected override render() {
    return html`
      <div class="tab" part="base">
        <slot></slot>
        ${this.closable
          ? html`
              <button
                class="close-button"
                part="close-button"
                type="button"
                aria-label="Close tab"
                ?disabled=${this.disabled}
                @click=${this.handleCloseClick}
              >
                &times;
              </button>
            `
          : null}
      </div>
    `
  }
}
