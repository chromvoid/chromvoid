import {createCard, type CardModel} from '@chromvoid/headless-ui'
import {css, html, nothing} from 'lit'
import type {PropertyValues} from 'lit'

import {ReatomLitElement} from '../reatom-lit/ReatomLitElement'

type CVCardVariant = 'elevated' | 'outlined' | 'filled'

export interface CVCardEventDetail {
  expanded: boolean
}

let cvCardNonce = 0

export class CVCard extends ReatomLitElement {
  static elementName = 'cv-card'

  static get properties() {
    return {
      variant: {type: String, reflect: true},
      expandable: {type: Boolean, reflect: true},
      expanded: {type: Boolean, reflect: true},
      disabled: {type: Boolean, reflect: true},
    }
  }

  declare variant: CVCardVariant
  declare expandable: boolean
  declare expanded: boolean
  declare disabled: boolean

  private readonly idBase = `cv-card-${++cvCardNonce}`
  private model: CardModel

  /**
   * When true, events are suppressed. Used to distinguish programmatic
   * state changes from user interaction.
   */
  private suppressEvents = false

  constructor() {
    super()
    this.variant = 'elevated'
    this.expandable = false
    this.expanded = false
    this.disabled = false
    this.model = this.createModel()
  }

  static styles = [
    css`
      :host {
        display: block;
        --cv-card-padding: var(--cv-space-4, 16px);
        --cv-card-border-radius: var(--cv-radius-md, 8px);
        --cv-card-border-color: var(--cv-color-border, #2a3245);
        --cv-card-background: var(--cv-color-surface, #141923);
        --cv-card-shadow: 0 1px 3px rgba(0, 0, 0, 0.24);
        --cv-card-gap: var(--cv-space-0, 0px);
        --cv-card-indicator-size: var(--cv-space-4, 16px);
        --cv-card-indicator-transition: var(--cv-duration-fast, 120ms)
          var(--cv-easing-standard, ease);
      }

      [part='base'] {
        display: flex;
        flex-direction: column;
        gap: var(--cv-card-gap);
        border-radius: var(--cv-card-border-radius);
        background: var(--cv-card-background);
        color: var(--cv-color-text, #e8ecf6);
        overflow: hidden;
      }

      [part='image'] {
        display: block;
      }

      [part='image'] ::slotted(*) {
        display: block;
        width: 100%;
      }

      [part='header'] {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--cv-card-padding);
      }

      [part='body'] {
        padding: 0 var(--cv-card-padding) var(--cv-card-padding);
      }

      [part='body'][hidden] {
        display: none;
      }

      [part='footer'] {
        padding: 0 var(--cv-card-padding) var(--cv-card-padding);
      }

      [part='indicator'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        inline-size: var(--cv-card-indicator-size);
        block-size: var(--cv-card-indicator-size);
        transition: transform var(--cv-card-indicator-transition);
      }

      :host([expanded]) [part='indicator'] {
        transform: rotate(90deg);
      }

      /* --- variant: elevated (default) --- */
      :host([variant='elevated']) [part='base'] {
        box-shadow: var(--cv-card-shadow);
      }

      /* --- variant: outlined --- */
      :host([variant='outlined']) [part='base'] {
        border: 1px solid var(--cv-card-border-color);
        box-shadow: none;
      }

      /* --- variant: filled --- */
      :host([variant='filled']) [part='base'] {
        box-shadow: none;
      }

      /* --- expandable header as trigger --- */
      :host([expandable]) [part='header'] {
        cursor: pointer;
        user-select: none;
      }

      :host([expandable]) [part='header']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: -2px;
      }

      /* --- disabled --- */
      :host([disabled]) {
        opacity: 0.55;
      }

      :host([disabled]) [part='header'] {
        cursor: not-allowed;
      }
    `,
  ]

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  override willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties)

    if (changedProperties.has('expandable')) {
      // Recreate model when expandable changes to reset headless state
      this.model = this.createModel()
      return
    }

    if (changedProperties.has('disabled')) {
      this.model.actions.setDisabled(this.disabled)
    }

    if (changedProperties.has('expanded') && this.model.state.isExpanded() !== this.expanded) {
      this.suppressEvents = true
      // Temporarily clear disabled so headless action is not rejected.
      // Programmatic property changes must always be honored.
      const wasDisabled = this.model.state.isDisabled()
      if (wasDisabled) this.model.actions.setDisabled(false)
      // Temporarily ensure expandable so the action is not rejected
      const wasExpandable = this.model.state.isExpandable()
      if (!wasExpandable) {
        // If not expandable, just set the atom directly - no action needed
        this.suppressEvents = false
        return
      }
      if (this.expanded) {
        this.model.actions.expand()
      } else {
        this.model.actions.collapse()
      }
      if (wasDisabled) this.model.actions.setDisabled(true)
      this.expanded = this.model.state.isExpanded()
      this.suppressEvents = false
    }
  }

  private createModel(): CardModel {
    return createCard({
      idBase: this.idBase,
      isExpandable: this.expandable,
      isExpanded: this.expanded,
      isDisabled: this.disabled,
      onExpandedChange: this.handleExpandedChange.bind(this),
    })
  }

  private handleExpandedChange(isExpanded: boolean): void {
    this.expanded = isExpanded
    if (this.suppressEvents) return

    const detail: CVCardEventDetail = {expanded: isExpanded}
    this.dispatchEvent(
      new CustomEvent('cv-input', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
    this.dispatchEvent(
      new CustomEvent('cv-change', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  // --- Event handlers (user interaction) ---

  private handleHeaderClick() {
    const triggerProps = this.model.contracts.getTriggerProps()
    if ('onClick' in triggerProps && typeof triggerProps.onClick === 'function') {
      triggerProps.onClick()
    }
  }

  private handleHeaderKeyDown(event: KeyboardEvent) {
    const triggerProps = this.model.contracts.getTriggerProps()
    if ('onKeyDown' in triggerProps && typeof triggerProps.onKeyDown === 'function') {
      triggerProps.onKeyDown(event)
    }
  }

  protected override render() {
    const cardProps = this.model.contracts.getCardProps()
    const triggerProps = this.model.contracts.getTriggerProps()
    const contentProps = this.model.contracts.getContentProps()

    const isExpandable = this.model.state.isExpandable()

    // Spread trigger props onto header only when expandable
    const headerId = isExpandable ? (triggerProps as any).id : undefined
    const headerRole = isExpandable ? (triggerProps as any).role : undefined
    const headerTabindex = isExpandable ? (triggerProps as any).tabindex : undefined
    const headerAriaExpanded = isExpandable ? (triggerProps as any)['aria-expanded'] : undefined
    const headerAriaControls = isExpandable ? (triggerProps as any)['aria-controls'] : undefined
    const headerAriaDisabled = isExpandable ? (triggerProps as any)['aria-disabled'] : undefined

    // Spread content props onto body only when expandable
    const bodyId = isExpandable ? (contentProps as any).id : undefined
    const bodyRole = isExpandable ? (contentProps as any).role : undefined
    const bodyAriaLabelledby = isExpandable ? (contentProps as any)['aria-labelledby'] : undefined
    const bodyHidden = isExpandable ? (contentProps as any).hidden : false

    return html`
      <div part="base" class="flex flex-col overflow-hidden">
        <div part="image">
          <slot name="image"></slot>
        </div>

        <div
          id=${headerId ?? nothing}
          role=${headerRole ?? nothing}
          tabindex=${headerTabindex ?? nothing}
          aria-expanded=${headerAriaExpanded ?? nothing}
          aria-controls=${headerAriaControls ?? nothing}
          aria-disabled=${headerAriaDisabled ?? nothing}
          part="header"
          class="flex items-center justify-between p-4"
          @click=${this.handleHeaderClick}
          @keydown=${this.handleHeaderKeyDown}
        >
          <slot name="header"></slot>
          ${isExpandable
            ? html`<span part="indicator" aria-hidden="true">&#x25B6;</span>`
            : nothing}
        </div>

        <div
          id=${bodyId ?? nothing}
          role=${bodyRole ?? nothing}
          aria-labelledby=${bodyAriaLabelledby ?? nothing}
          ?hidden=${bodyHidden}
          part="body"
        >
          <slot></slot>
        </div>

        <div part="footer">
          <slot name="footer"></slot>
        </div>
      </div>
    `
  }
}
