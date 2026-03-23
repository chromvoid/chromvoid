import {createPopover, type PopoverModel} from '@chromvoid/headless-ui'
import {css, html, nothing} from 'lit'
import type {PropertyValues} from 'lit'

import {ReatomLitElement} from '../reatom-lit/ReatomLitElement'

interface CVPopoverEventDetail {
  open: boolean
  openedBy: string | null
  dismissIntent: string | null
}

type CVPopoverPlacement =
  | 'top-start'
  | 'top'
  | 'top-end'
  | 'right-start'
  | 'right'
  | 'right-end'
  | 'bottom-start'
  | 'bottom'
  | 'bottom-end'
  | 'left-start'
  | 'left'
  | 'left-end'

type CVPopoverAnchor = 'trigger' | 'host'

const popoverTriggerKeys = new Set(['Enter', ' ', 'Spacebar', 'ArrowDown'])

const supportsNativePopover =
  typeof HTMLElement !== 'undefined' &&
  typeof HTMLElement.prototype.showPopover === 'function'

let cvPopoverNonce = 0

export class CVPopover extends ReatomLitElement {
  static elementName = 'cv-popover'

  static get properties() {
    return {
      open: {type: Boolean, reflect: true},
      ariaLabel: {type: String, attribute: 'aria-label'},
      ariaLabelledBy: {type: String, attribute: 'aria-labelledby'},
      closeOnEscape: {type: Boolean, attribute: 'close-on-escape', reflect: true},
      closeOnOutsidePointer: {type: Boolean, attribute: 'close-on-outside-pointer', reflect: true},
      closeOnOutsideFocus: {type: Boolean, attribute: 'close-on-outside-focus', reflect: true},
      placement: {type: String, reflect: true},
      anchor: {type: String, reflect: true},
      offset: {type: Number, reflect: true},
      arrow: {type: Boolean, reflect: true},
    }
  }

  declare open: boolean
  declare ariaLabel: string
  declare ariaLabelledBy: string
  declare closeOnEscape: boolean
  declare closeOnOutsidePointer: boolean
  declare closeOnOutsideFocus: boolean
  declare placement: CVPopoverPlacement
  declare anchor: CVPopoverAnchor
  declare offset: number
  declare arrow: boolean

  private readonly idBase = `cv-popover-${++cvPopoverNonce}`
  private model: PopoverModel
  private previousOpen = false

  constructor() {
    super()
    this.open = false
    this.ariaLabel = ''
    this.ariaLabelledBy = ''
    this.closeOnEscape = true
    this.closeOnOutsidePointer = true
    this.closeOnOutsideFocus = true
    this.placement = 'bottom-start'
    this.anchor = 'trigger'
    this.offset = 4
    this.arrow = false
    this.model = this.createModel()
    this.previousOpen = this.model.state.isOpen()
  }

  static styles = [
    css`
      :host {
        display: inline-block;
      }

      [part='base'] {
        position: relative;
        display: inline-grid;
        gap: var(--cv-space-1, 4px);
      }

      [part='trigger'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-block-size: 36px;
        padding: 0 var(--cv-space-3, 12px);
        border-radius: var(--cv-radius-sm, 6px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        color: var(--cv-color-text, #e8ecf6);
      }

      [part='trigger']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      [part='content'] {
        position: absolute;
        inset-inline-start: 0;
        inset-block-start: calc(100% + var(--cv-popover-offset, var(--cv-space-1, 4px)));
        z-index: var(--cv-popover-z-index, 20);
        min-inline-size: var(--cv-popover-min-inline-size, max(220px, 100%));
        max-inline-size: var(--cv-popover-max-inline-size, min(560px, calc(100vw - 32px)));
        display: grid;
        gap: var(--cv-space-2, 8px);
        padding: var(--cv-popover-padding, var(--cv-space-3, 12px));
        border-radius: var(--cv-popover-border-radius, var(--cv-radius-md, 10px));
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface-elevated, #1d2432);
        box-shadow: var(--cv-shadow-1, 0 2px 8px rgba(0, 0, 0, 0.24));
        color: var(--cv-color-text, #e8ecf6);
      }

      [part='content'][hidden] {
        display: none;
      }

      [part='content']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      [part='content'][data-placement='bottom'] {
        inset-inline-start: 50%;
        transform: translateX(-50%);
      }

      [part='content'][data-placement='bottom-end'] {
        inset-inline-start: auto;
        inset-inline-end: 0;
      }

      [part='content'][data-placement='top-start'] {
        inset-block-start: auto;
        inset-block-end: calc(100% + var(--cv-popover-offset, var(--cv-space-1, 4px)));
      }

      [part='content'][data-placement='top'] {
        inset-inline-start: 50%;
        inset-block-start: auto;
        inset-block-end: calc(100% + var(--cv-popover-offset, var(--cv-space-1, 4px)));
        transform: translateX(-50%);
      }

      [part='content'][data-placement='top-end'] {
        inset-inline-start: auto;
        inset-inline-end: 0;
        inset-block-start: auto;
        inset-block-end: calc(100% + var(--cv-popover-offset, var(--cv-space-1, 4px)));
      }

      [part='content'][data-placement='right-start'] {
        inset-inline-start: calc(100% + var(--cv-popover-offset, var(--cv-space-1, 4px)));
        inset-block-start: 0;
      }

      [part='content'][data-placement='right'] {
        inset-inline-start: calc(100% + var(--cv-popover-offset, var(--cv-space-1, 4px)));
        inset-block-start: 50%;
        transform: translateY(-50%);
      }

      [part='content'][data-placement='right-end'] {
        inset-inline-start: calc(100% + var(--cv-popover-offset, var(--cv-space-1, 4px)));
        inset-block-start: auto;
        inset-block-end: 0;
      }

      [part='content'][data-placement='left-start'] {
        inset-inline-start: auto;
        inset-inline-end: calc(100% + var(--cv-popover-offset, var(--cv-space-1, 4px)));
        inset-block-start: 0;
      }

      [part='content'][data-placement='left'] {
        inset-inline-start: auto;
        inset-inline-end: calc(100% + var(--cv-popover-offset, var(--cv-space-1, 4px)));
        inset-block-start: 50%;
        transform: translateY(-50%);
      }

      [part='content'][data-placement='left-end'] {
        inset-inline-start: auto;
        inset-inline-end: calc(100% + var(--cv-popover-offset, var(--cv-space-1, 4px)));
        inset-block-start: auto;
        inset-block-end: 0;
      }

      [part='content'][data-anchor='host'] {
        min-inline-size: min(560px, calc(100vw - 32px));
      }

      [part='arrow'] {
        position: absolute;
        display: block;
        inline-size: var(--cv-popover-arrow-size, 8px);
        block-size: var(--cv-popover-arrow-size, 8px);
      }
    `,
  ]

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.syncOutsideListeners()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.syncOutsideListeners(true)
  }

  override willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties)

    if (
      changedProperties.has('ariaLabel') ||
      changedProperties.has('ariaLabelledBy') ||
      changedProperties.has('closeOnEscape') ||
      changedProperties.has('closeOnOutsidePointer') ||
      changedProperties.has('closeOnOutsideFocus')
    ) {
      const wasOpen = this.model.state.isOpen()
      this.model = this.createModel(wasOpen)
      this.previousOpen = wasOpen
    }

    if (changedProperties.has('open') && this.model.state.isOpen() !== this.open) {
      if (this.open) {
        this.model.actions.open('programmatic')
      } else {
        this.model.actions.close('programmatic')
      }
      this.open = this.model.state.isOpen()
      this.previousOpen = this.open
    }
  }

  override updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties)
    this.syncOutsideListeners()
  }

  private createModel(initialOpen = this.open): PopoverModel {
    return createPopover({
      idBase: this.idBase,
      initialOpen,
      ariaLabel: this.ariaLabel || undefined,
      ariaLabelledBy: this.ariaLabelledBy || undefined,
      closeOnEscape: this.closeOnEscape,
      closeOnOutsidePointer: this.closeOnOutsidePointer,
      closeOnOutsideFocus: this.closeOnOutsideFocus,
      useNativePopover: supportsNativePopover,
    })
  }

  private buildEventDetail(): CVPopoverEventDetail {
    return {
      open: this.model.state.isOpen(),
      openedBy: this.model.state.openedBy(),
      dismissIntent: this.model.state.lastDismissIntent(),
    }
  }

  /**
   * Dispatches beforetoggle and toggle events and syncs open state from headless.
   * If beforetoggle is canceled on open, reverts headless state.
   */
  private emitToggleEvents(): void {
    const isOpen = this.model.state.isOpen()

    // Only emit if state actually changed
    if (isOpen === this.previousOpen) return

    const detail = this.buildEventDetail()

    // Dispatch beforetoggle (cancelable only on open)
    const cancelable = detail.open
    const beforeToggleEvent = new CustomEvent('beforetoggle', {
      detail,
      bubbles: true,
      composed: true,
      cancelable,
    })
    this.dispatchEvent(beforeToggleEvent)

    // If opening was prevented, revert headless state
    if (cancelable && beforeToggleEvent.defaultPrevented) {
      this.model.actions.close('programmatic')
      this.open = false
      this.previousOpen = false
      return
    }

    // Sync host attribute
    this.open = isOpen
    this.previousOpen = isOpen

    // Dispatch toggle (not cancelable)
    this.dispatchEvent(
      new CustomEvent('toggle', {
        detail,
        bubbles: false,
        composed: true,
        cancelable: false,
      }),
    )

    // Restore focus if needed
    if (!isOpen) {
      const restoreId = this.model.state.restoreTargetId()
      if (restoreId) {
        const trigger = this.shadowRoot?.querySelector(`[id="${restoreId}"]`) as HTMLElement | null
        trigger?.focus()
      }
    }
  }

  private syncOutsideListeners(forceOff = false): void {
    const shouldListen = !forceOff && this.model.state.isOpen()
    if (shouldListen) {
      document.addEventListener('pointerdown', this.handleDocumentPointerDown)
      document.addEventListener('focusin', this.handleDocumentFocusIn)
    } else {
      document.removeEventListener('pointerdown', this.handleDocumentPointerDown)
      document.removeEventListener('focusin', this.handleDocumentFocusIn)
    }
  }

  private handleDocumentPointerDown = (event: Event) => {
    if (!this.model || !this.model.state.isOpen()) return

    const path = event.composedPath()
    if (path.includes(this)) return

    this.model.contracts.getContentProps().onPointerDownOutside()
    this.emitToggleEvents()
    this.syncOutsideListeners()
  }

  private handleDocumentFocusIn = (event: FocusEvent) => {
    if (!this.model || !this.model.state.isOpen()) return

    const path = event.composedPath()
    if (path.includes(this)) return

    this.model.contracts.getContentProps().onFocusOutside()
    this.emitToggleEvents()
    this.syncOutsideListeners()
  }

  private handleTriggerClick() {
    this.model.contracts.getTriggerProps().onClick()
    this.emitToggleEvents()
    this.syncOutsideListeners()
  }

  private handleTriggerKeyDown(event: KeyboardEvent) {
    if (popoverTriggerKeys.has(event.key)) {
      event.preventDefault()
    }

    this.model.contracts.getTriggerProps().onKeyDown({key: event.key})
    this.emitToggleEvents()
    this.syncOutsideListeners()
  }

  private handleContentKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
    }

    this.model.contracts.getContentProps().onKeyDown({key: event.key})
    this.emitToggleEvents()
    this.syncOutsideListeners()
  }

  protected override render() {
    const triggerProps = this.model.contracts.getTriggerProps()
    const contentProps = this.model.contracts.getContentProps()

    return html`
      <div part="base">
        <button
          id=${triggerProps.id}
          role=${triggerProps.role}
          tabindex=${triggerProps.tabindex}
          aria-haspopup=${triggerProps['aria-haspopup']}
          aria-expanded=${triggerProps['aria-expanded']}
          aria-controls=${triggerProps['aria-controls']}
          part="trigger"
          type="button"
          @click=${this.handleTriggerClick}
          @keydown=${this.handleTriggerKeyDown}
        >
          <slot name="trigger">Open popover</slot>
        </button>

        <div
          id=${contentProps.id}
          role=${contentProps.role}
          tabindex=${contentProps.tabindex}
          aria-modal=${contentProps['aria-modal']}
          aria-label=${contentProps['aria-label'] ?? nothing}
          aria-labelledby=${contentProps['aria-labelledby'] ?? nothing}
          ?hidden=${contentProps.hidden}
          data-placement=${this.placement}
          data-anchor=${this.anchor}
          style=${`--cv-popover-offset:${this.offset}px;`}
          part="content"
          @keydown=${this.handleContentKeyDown}
        >
          <slot></slot>
          ${this.arrow
            ? html`<span part="arrow"><slot name="arrow"></slot></span>`
            : nothing}
        </div>
      </div>
    `
  }
}
