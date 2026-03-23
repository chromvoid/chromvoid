import {LitElement, css, html, nothing} from 'lit'

interface CVAccordionItemTriggerState {
  id: string
  role: 'button'
  tabindex: '0' | '-1'
  ariaExpanded: 'true' | 'false'
  ariaControls: string
  ariaDisabled: 'true' | 'false'
}

interface CVAccordionItemPanelState {
  id: string
  role: 'region'
  ariaLabelledBy: string
  hidden: boolean
}

export interface CVAccordionItemContracts {
  headerId: string
  trigger: CVAccordionItemTriggerState
  panel: CVAccordionItemPanelState
}

export interface CVAccordionItemTriggerKeydownDetail {
  key: string
}

export type CVAccordionItemTriggerClickEvent = CustomEvent<null>
export type CVAccordionItemTriggerFocusEvent = CustomEvent<null>
export type CVAccordionItemTriggerKeydownEvent = CustomEvent<CVAccordionItemTriggerKeydownDetail>

export interface CVAccordionItemEventMap {
  'cv-accordion-item-trigger-click': CVAccordionItemTriggerClickEvent
  'cv-accordion-item-trigger-focus': CVAccordionItemTriggerFocusEvent
  'cv-accordion-item-trigger-keydown': CVAccordionItemTriggerKeydownEvent
}

export class CVAccordionItem extends LitElement {
  static elementName = 'cv-accordion-item'

  static get properties() {
    return {
      value: {type: String, reflect: true},
      disabled: {type: Boolean, reflect: true},
      expanded: {type: Boolean, reflect: true},
      active: {type: Boolean, reflect: true},
    }
  }

  declare value: string
  declare disabled: boolean
  declare expanded: boolean
  declare active: boolean

  private headerId = ''
  private triggerState: CVAccordionItemTriggerState = {
    id: '',
    role: 'button',
    tabindex: '-1',
    ariaExpanded: 'false',
    ariaControls: '',
    ariaDisabled: 'false',
  }
  private panelState: CVAccordionItemPanelState = {
    id: '',
    role: 'region',
    ariaLabelledBy: '',
    hidden: true,
  }

  constructor() {
    super()
    this.value = ''
    this.disabled = false
    this.expanded = false
    this.active = false
  }

  static styles = [
    css`
      :host {
        display: block;
      }

      [part='base'] {
        display: grid;
        gap: var(--cv-space-1, 4px);
      }

      [part='trigger'] {
        inline-size: 100%;
        min-block-size: 36px;
        display: inline-flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--cv-space-2, 8px);
        padding: 0 var(--cv-space-3, 12px);
        border-radius: var(--cv-radius-sm, 6px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        color: var(--cv-color-text, #e8ecf6);
        font: inherit;
        text-align: start;
      }

      [part='trigger']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      [part='trigger-icon'] {
        inline-size: 16px;
        block-size: 16px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--cv-color-text-muted, #9aa6bf);
        transition: transform var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease);
      }

      :host([expanded]) [part='trigger-icon'] {
        transform: rotate(90deg);
      }

      [part='panel'] {
        padding: var(--cv-space-3, 12px);
        border-radius: var(--cv-radius-sm, 6px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface-elevated, #1d2432);
        color: var(--cv-color-text, #e8ecf6);
      }

      [part='panel'][hidden] {
        display: none;
      }

      :host([active]) [part='trigger'] {
        border-color: var(--cv-color-primary, #65d7ff);
      }

      :host([disabled]) [part='trigger'] {
        opacity: 0.55;
      }
    `,
  ]

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  applyContracts(contracts: CVAccordionItemContracts): void {
    this.headerId = contracts.headerId
    this.triggerState = contracts.trigger
    this.panelState = contracts.panel
    this.expanded = contracts.trigger.ariaExpanded === 'true'
    this.active = contracts.trigger.tabindex === '0'
    this.requestUpdate()
  }

  focusTrigger(): void {
    const trigger = this.renderRoot.querySelector('[part="trigger"]') as HTMLButtonElement | null
    trigger?.focus()
  }

  private handleTriggerClick() {
    this.dispatchEvent(
      new CustomEvent<CVAccordionItemTriggerClickEvent['detail']>('cv-accordion-item-trigger-click', {
        bubbles: true,
        composed: true,
      }),
    )
  }

  private handleTriggerFocus() {
    this.dispatchEvent(
      new CustomEvent<CVAccordionItemTriggerFocusEvent['detail']>('cv-accordion-item-trigger-focus', {
        bubbles: true,
        composed: true,
      }),
    )
  }

  private handleTriggerKeyDown(event: KeyboardEvent) {
    const dispatched = this.dispatchEvent(
      new CustomEvent<CVAccordionItemTriggerKeydownEvent['detail']>('cv-accordion-item-trigger-keydown', {
        detail: {key: event.key},
        bubbles: true,
        composed: true,
        cancelable: true,
      }),
    )

    if (!dispatched) {
      event.preventDefault()
    }
  }

  protected override render() {
    return html`
      <div part="base">
        <h3 id=${this.headerId} part="header">
          <button
            id=${this.triggerState.id}
            role=${this.triggerState.role}
            tabindex=${this.triggerState.tabindex}
            aria-expanded=${this.triggerState.ariaExpanded}
            aria-controls=${this.triggerState.ariaControls}
            aria-disabled=${this.triggerState.ariaDisabled}
            ?disabled=${this.triggerState.ariaDisabled === 'true'}
            part="trigger"
            type="button"
            @click=${this.handleTriggerClick}
            @focus=${this.handleTriggerFocus}
            @keydown=${this.handleTriggerKeyDown}
          >
            <slot name="trigger"></slot>
            <span part="trigger-icon" aria-hidden="true">▶</span>
          </button>
        </h3>

        <div
          id=${this.panelState.id}
          role=${this.panelState.role}
          aria-labelledby=${this.panelState.ariaLabelledBy || nothing}
          ?hidden=${this.panelState.hidden}
          part="panel"
        >
          <slot></slot>
        </div>
      </div>
    `
  }
}
