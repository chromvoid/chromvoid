import {createDisclosure, type DisclosureModel} from '@chromvoid/headless-ui'
import {css, html, nothing} from 'lit'
import type {PropertyValues} from 'lit'

import {ReatomLitElement} from '../reatom-lit/ReatomLitElement'

export interface CVDisclosureEventDetail {
  open: boolean
}

let cvDisclosureNonce = 0

export class CVDisclosure extends ReatomLitElement {
  static elementName = 'cv-disclosure'

  static get properties() {
    return {
      open: {type: Boolean, reflect: true},
      disabled: {type: Boolean, reflect: true},
      name: {type: String, reflect: true},
    }
  }

  declare open: boolean
  declare disabled: boolean
  declare name: string

  private readonly idBase = `cv-disclosure-${++cvDisclosureNonce}`
  private model: DisclosureModel

  /**
   * When true, events are suppressed. Used to distinguish programmatic
   * state changes (property sets, show/hide) from user interaction.
   */
  private suppressEvents = false

  constructor() {
    super()
    this.open = false
    this.disabled = false
    this.name = ''
    this.model = this.createModel()
  }

  static styles = [
    css`
      :host {
        display: block;
        --cv-disclosure-duration: var(--cv-duration-fast, 120ms);
        --cv-disclosure-easing: var(--cv-easing-standard, ease);
      }

      [part='base'] {
        display: grid;
        gap: var(--cv-space-2, 8px);
      }

      [part='trigger'] {
        display: inline-flex;
        align-items: center;
        justify-content: space-between;
        min-block-size: 36px;
        padding: 0 var(--cv-space-3, 12px);
        border-radius: var(--cv-radius-sm, 6px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        color: var(--cv-color-text, #e8ecf6);
        cursor: pointer;
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
        transition: transform var(--cv-disclosure-duration) var(--cv-disclosure-easing);
      }

      :host([open]) [part='trigger-icon'] {
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

      :host([disabled]) [part='trigger'] {
        cursor: not-allowed;
        opacity: 0.55;
      }
    `,
  ]

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.model.actions.destroy()
  }

  override willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties)

    if (changedProperties.has('disabled')) {
      this.model.actions.setDisabled(this.disabled)
    }

    if (changedProperties.has('name')) {
      this.model.actions.setName(this.name || null)
    }

    if (changedProperties.has('open') && this.model.state.isOpen() !== this.open) {
      this.suppressEvents = true
      // Temporarily clear disabled so the headless action is not rejected.
      // Programmatic property changes must always be honored.
      const wasDisabled = this.model.state.isDisabled()
      if (wasDisabled) this.model.actions.setDisabled(false)
      if (this.open) {
        this.model.actions.open()
      } else {
        this.model.actions.close()
      }
      if (wasDisabled) this.model.actions.setDisabled(true)
      // Sync back from headless
      this.open = this.model.state.isOpen()
      this.suppressEvents = false
    }
  }

  private createModel(): DisclosureModel {
    return createDisclosure({
      idBase: this.idBase,
      isOpen: this.open,
      isDisabled: this.disabled,
      name: this.name || undefined,
    })
  }

  private dispatchInput(detail: CVDisclosureEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-input', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private dispatchChange(detail: CVDisclosureEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-change', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  /**
   * Sync host `open` property from headless state after a user interaction.
   * Fires input/change events only when suppressEvents is false and state actually changed.
   */
  private syncFromModel(previousOpen: boolean): void {
    const nextOpen = this.model.state.isOpen()
    this.open = nextOpen
    if (this.suppressEvents) return
    if (previousOpen === nextOpen) return

    const detail = {open: nextOpen}
    this.dispatchInput(detail)
    this.dispatchChange(detail)
  }

  /**
   * Sync all grouped disclosures that may have been closed by headless group logic.
   * Scans sibling cv-disclosure elements sharing the same name and updates their open property.
   */
  private syncGroupedSiblings(): void {
    if (!this.name) return
    const siblings = document.querySelectorAll<CVDisclosure>(
      `cv-disclosure[name="${this.name}"]`,
    )
    for (const sibling of siblings) {
      if (sibling === this) continue
      const headlessOpen = sibling.model.state.isOpen()
      if (sibling.open !== headlessOpen) {
        sibling.open = headlessOpen
      }
    }
  }

  // --- Imperative API ---

  /** Opens the panel programmatically without firing events. */
  show(): void {
    this.suppressEvents = true
    this.model.actions.open()
    this.open = this.model.state.isOpen()
    this.suppressEvents = false
  }

  /** Closes the panel programmatically without firing events. */
  hide(): void {
    this.suppressEvents = true
    this.model.actions.close()
    this.open = this.model.state.isOpen()
    this.suppressEvents = false
  }

  // --- Event handlers (user interaction) ---

  private handleTriggerClick() {
    const previousOpen = this.model.state.isOpen()
    this.model.contracts.getTriggerProps().onClick()
    this.syncFromModel(previousOpen)
    this.syncGroupedSiblings()
  }

  private handleTriggerKeyDown(event: KeyboardEvent) {
    const previousOpen = this.model.state.isOpen()
    this.model.contracts.getTriggerProps().onKeyDown(event)
    this.syncFromModel(previousOpen)
    this.syncGroupedSiblings()
  }

  protected override render() {
    const triggerProps = this.model.contracts.getTriggerProps()
    const panelProps = this.model.contracts.getPanelProps()

    return html`
      <div part="base">
        <div
          id=${triggerProps.id}
          role=${triggerProps.role}
          tabindex=${triggerProps.tabindex}
          aria-expanded=${triggerProps['aria-expanded']}
          aria-controls=${triggerProps['aria-controls']}
          aria-disabled=${triggerProps['aria-disabled'] ?? nothing}
          part="trigger"
          @click=${this.handleTriggerClick}
          @keydown=${this.handleTriggerKeyDown}
        >
          <slot name="trigger"></slot>
          <span part="trigger-icon" aria-hidden="true">&#x25B6;</span>
        </div>

        <div
          id=${panelProps.id}
          aria-labelledby=${panelProps['aria-labelledby']}
          ?hidden=${panelProps.hidden}
          part="panel"
        >
          <slot></slot>
        </div>
      </div>
    `
  }
}
