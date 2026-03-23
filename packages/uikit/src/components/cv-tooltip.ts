import {createTooltip, type TooltipModel} from '@chromvoid/headless-ui'
import {css, html, nothing} from 'lit'
import type {PropertyValues} from 'lit'

import {ReatomLitElement} from '../reatom-lit/ReatomLitElement'

export interface CVTooltipEventDetail {
  open: boolean
}

const supportsNativePopover =
  typeof HTMLElement !== 'undefined' &&
  typeof HTMLElement.prototype.showPopover === 'function' &&
  typeof HTMLElement.prototype.hidePopover === 'function'

const supportsAnchorPositioning =
  typeof CSS !== 'undefined' &&
  typeof CSS.supports === 'function' &&
  CSS.supports('anchor-name: --cv-tooltip-anchor') &&
  CSS.supports('position-anchor: --cv-tooltip-anchor') &&
  CSS.supports('position-area: top') &&
  CSS.supports('top: anchor(bottom)')

const supportsAnchorTryFallbacks =
  typeof CSS !== 'undefined' &&
  typeof CSS.supports === 'function' &&
  CSS.supports('position-try-fallbacks: flip-block')

const supportsNativeAnchoredAutoplacement =
  supportsNativePopover && supportsAnchorPositioning && supportsAnchorTryFallbacks

let cvTooltipNonce = 0

export class CVTooltip extends ReatomLitElement {
  static elementName = 'cv-tooltip'

  static get properties() {
    return {
      open: {type: Boolean, reflect: true},
      disabled: {type: Boolean, reflect: true},
      showDelay: {type: Number, attribute: 'show-delay', reflect: true},
      hideDelay: {type: Number, attribute: 'hide-delay', reflect: true},
      trigger: {type: String, reflect: true},
      arrow: {type: Boolean, reflect: true},
    }
  }

  declare open: boolean
  declare disabled: boolean
  declare showDelay: number
  declare hideDelay: number
  declare trigger: string
  declare arrow: boolean

  private readonly idBase = `cv-tooltip-${++cvTooltipNonce}`
  private model: TooltipModel
  private triggerTargets = new Set<HTMLElement>()
  private lastEmittedOpen = false
  private hasLayoutListeners = false
  private layoutFrame = -1

  constructor() {
    super()
    this.open = false
    this.disabled = false
    this.showDelay = 120
    this.hideDelay = 80
    this.trigger = 'hover focus'
    this.arrow = false
    this.model = this.createModel()
    this.lastEmittedOpen = this.model.state.isOpen()
  }

  static styles = [
    css`
      :host {
        display: inline-block;
      }

      [part='base'] {
        position: relative;
        display: inline-block;
      }

      [part='trigger'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        anchor-name: --cv-tooltip-anchor;
      }

      [part='content'] {
        position: absolute;
        inset-inline-start: 50%;
        inset-block-end: calc(100% + var(--cv-space-1, 4px));
        transform: translateX(-50%);
        z-index: 30;
        max-inline-size: min(320px, calc(100vw - 32px));
        padding: var(--cv-space-1, 4px) var(--cv-space-2, 8px);
        border-radius: var(--cv-radius-sm, 6px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface-elevated, #1d2432);
        color: var(--cv-color-text, #e8ecf6);
        font-size: 0.85rem;
        white-space: nowrap;
        box-shadow: var(--cv-shadow-1, 0 2px 8px rgba(0, 0, 0, 0.24));
      }

      [part='content'][data-anchor-positioning='true'] {
        position: fixed;
        inset: auto;
        margin: 0;
        position-anchor: --cv-tooltip-anchor;
        position-area: top;
        position-try-fallbacks: flip-block, flip-inline, bottom, right, left;
        position-visibility: anchors-visible;
        transform: none;
        translate: none;
      }

      [part='content'][hidden] {
        display: none;
      }

      [part='arrow'] {
        position: absolute;
        inset-inline-start: 50%;
        inset-block-start: 100%;
        transform: translateX(-50%);
        width: 0;
        height: 0;
        border-inline: 6px solid transparent;
        border-block-start: 6px solid var(--cv-color-surface-elevated, #1d2432);
      }

      [part='content'][data-placement='bottom'] [part='arrow'] {
        inset-block-start: auto;
        inset-block-end: 100%;
        border-block-start: none;
        border-block-end: 6px solid var(--cv-color-surface-elevated, #1d2432);
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
    this.syncTriggerAria()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.toggleLayoutListeners(false)
    this.cancelLayoutFrame()

    if (supportsNativePopover) {
      const content = this.getContentElement()
      if (content?.matches(':popover-open')) {
        content.hidePopover()
      }
    }
  }

  override willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties)

    if (
      changedProperties.has('showDelay') ||
      changedProperties.has('hideDelay') ||
      changedProperties.has('trigger')
    ) {
      // Preserve whichever is "more open": model state OR the declared property value.
      // On first update all properties appear changed; use this.open so an initialOpen
      // value set before connection is not discarded.
      const wasOpen = this.model.state.isOpen() || this.open
      this.model = this.createModel(wasOpen)
      return
    }

    if (changedProperties.has('disabled')) {
      this.model.actions.setDisabled(this.disabled)
    }

    if (changedProperties.has('open') && this.model.state.isOpen() !== this.open) {
      const previousOpen = this.model.state.isOpen()
      if (this.open) {
        this.model.actions.open()
      } else {
        this.model.actions.close()
      }
      this.applyInteractionResult(previousOpen)
    }
  }

  override updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties)
    this.syncTriggerAria()

    const modelOpen = this.model.state.isOpen()
    if (this.open !== modelOpen) {
      this.open = modelOpen
    }

    if (this.lastEmittedOpen !== modelOpen) {
      this.emitOpenChange(modelOpen)
    }

    this.syncNativePopover()

    const shouldTrackLayout = modelOpen && !supportsNativeAnchoredAutoplacement
    this.toggleLayoutListeners(shouldTrackLayout)

    if (modelOpen) {
      this.scheduleLayout()
    } else {
      this.cancelLayoutFrame()
      const content = this.getContentElement()
      if (content) {
        this.clearInlineLayout(content)
        content.dataset['placement'] = 'top'
      }
    }
  }

  private getContentElement(): HTMLElement | null {
    return this.shadowRoot?.querySelector('[part="content"]') as HTMLElement | null
  }

  private getTriggerElement(): HTMLElement | null {
    return this.shadowRoot?.querySelector('[part="trigger"]') as HTMLElement | null
  }

  private clearInlineLayout(content: HTMLElement): void {
    content.style.position = ''
    content.style.top = ''
    content.style.left = ''
    content.style.bottom = ''
    content.style.insetInlineStart = ''
    content.style.insetBlockEnd = ''
    content.style.transform = ''
    content.style.translate = ''
  }

  private syncNativePopover(): void {
    if (!supportsNativePopover) return

    const content = this.getContentElement()
    if (!content) return

    const isOpen = this.model.state.isOpen()
    const isPopoverOpen = content.matches(':popover-open')

    if (isOpen && !isPopoverOpen) {
      content.showPopover()
      return
    }

    if (!isOpen && isPopoverOpen) {
      content.hidePopover()
    }
  }

  private applyFallbackLayout(content: HTMLElement, trigger: HTMLElement): void {
    const triggerRect = trigger.getBoundingClientRect()
    const contentRect = content.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const gap = 6
    const viewportPadding = 8

    const spaceAbove = triggerRect.top
    const spaceBelow = viewportHeight - triggerRect.bottom
    const placeAbove =
      spaceAbove >= contentRect.height + gap ||
      (spaceAbove >= spaceBelow && spaceAbove >= contentRect.height / 2)

    let top = placeAbove ? triggerRect.top - contentRect.height - gap : triggerRect.bottom + gap
    let left = triggerRect.left + triggerRect.width / 2 - contentRect.width / 2

    const maxLeft = Math.max(viewportPadding, viewportWidth - contentRect.width - viewportPadding)
    const maxTop = Math.max(viewportPadding, viewportHeight - contentRect.height - viewportPadding)

    left = Math.min(Math.max(left, viewportPadding), maxLeft)
    top = Math.min(Math.max(top, viewportPadding), maxTop)

    content.dataset['placement'] = placeAbove ? 'top' : 'bottom'
    content.style.position = 'fixed'
    content.style.top = `${top}px`
    content.style.left = `${left}px`
    content.style.bottom = 'auto'
    content.style.insetInlineStart = 'auto'
    content.style.insetBlockEnd = 'auto'
    content.style.transform = 'none'
    content.style.translate = 'none'
  }

  private syncTooltipLayout(): void {
    const content = this.getContentElement()
    const trigger = this.getTriggerElement()
    if (!content || !trigger) return

    if (supportsNativeAnchoredAutoplacement) {
      this.clearInlineLayout(content)
      content.dataset['placement'] = 'top'
      return
    }

    this.applyFallbackLayout(content, trigger)
  }

  private cancelLayoutFrame(): void {
    if (this.layoutFrame === -1) return
    cancelAnimationFrame(this.layoutFrame)
    this.layoutFrame = -1
  }

  private scheduleLayout(): void {
    this.cancelLayoutFrame()
    this.layoutFrame = requestAnimationFrame(() => {
      this.layoutFrame = -1
      this.syncTooltipLayout()
    })
  }

  private toggleLayoutListeners(nextState: boolean): void {
    if (this.hasLayoutListeners === nextState) return

    this.hasLayoutListeners = nextState
    if (nextState) {
      window.addEventListener('resize', this.handleViewportChange)
      window.addEventListener('scroll', this.handleViewportChange, true)
      return
    }

    window.removeEventListener('resize', this.handleViewportChange)
    window.removeEventListener('scroll', this.handleViewportChange, true)
  }

  private handleViewportChange = () => {
    if (!this.model.state.isOpen()) return
    this.scheduleLayout()
  }

  private createModel(initialOpen = this.open): TooltipModel {
    return createTooltip({
      idBase: this.idBase,
      initialOpen,
      isDisabled: this.disabled,
      showDelay: this.showDelay,
      hideDelay: this.hideDelay,
      trigger: this.trigger,
    })
  }

  private dispatchInput(detail: CVTooltipEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-input', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private dispatchChange(detail: CVTooltipEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-change', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private emitOpenChange(open: boolean): void {
    this.lastEmittedOpen = open
    const detail = {open}
    this.dispatchInput(detail)
    this.dispatchChange(detail)
  }

  private applyInteractionResult(previousOpen: boolean): void {
    const nextOpen = this.model.state.isOpen()
    this.open = nextOpen
    this.disabled = this.model.state.isDisabled()
    this.syncTriggerAria()

    if (previousOpen !== nextOpen) {
      this.emitOpenChange(nextOpen)
    }
  }

  private syncTriggerAria(): void {
    const triggerProps = this.model.contracts.getTriggerProps()
    const describedBy = triggerProps['aria-describedby']

    const slot = this.shadowRoot?.querySelector('slot[name="trigger"]') as HTMLSlotElement | null
    const assigned = (slot?.assignedElements({flatten: true}) ?? []).filter(
      (element): element is HTMLElement => element instanceof HTMLElement,
    )

    for (const element of this.triggerTargets) {
      if (!assigned.includes(element)) {
        element.removeAttribute('aria-describedby')
      }
    }

    this.triggerTargets = new Set(assigned)

    for (const element of assigned) {
      if (describedBy) {
        element.setAttribute('aria-describedby', describedBy)
      } else {
        element.removeAttribute('aria-describedby')
      }
    }

    const wrapper = this.shadowRoot?.querySelector('[part="trigger"]') as HTMLElement | null
    if (wrapper) {
      if (describedBy) {
        wrapper.setAttribute('aria-describedby', describedBy)
      } else {
        wrapper.removeAttribute('aria-describedby')
      }
    }
  }

  private handlePointerEnter() {
    const triggerProps = this.model.contracts.getTriggerProps()
    if (!triggerProps.onPointerEnter) return
    const previousOpen = this.model.state.isOpen()
    triggerProps.onPointerEnter()
    this.applyInteractionResult(previousOpen)
  }

  private handlePointerLeave() {
    const triggerProps = this.model.contracts.getTriggerProps()
    if (!triggerProps.onPointerLeave) return
    const previousOpen = this.model.state.isOpen()
    triggerProps.onPointerLeave()
    this.applyInteractionResult(previousOpen)
  }

  private handleFocusIn() {
    const triggerProps = this.model.contracts.getTriggerProps()
    if (!triggerProps.onFocus) return
    const previousOpen = this.model.state.isOpen()
    triggerProps.onFocus()
    this.applyInteractionResult(previousOpen)
  }

  private handleFocusOut() {
    const triggerProps = this.model.contracts.getTriggerProps()
    if (!triggerProps.onBlur) return
    const previousOpen = this.model.state.isOpen()
    triggerProps.onBlur()
    this.applyInteractionResult(previousOpen)
  }

  private handleClick() {
    const triggerProps = this.model.contracts.getTriggerProps()
    if (!triggerProps.onClick) return
    const previousOpen = this.model.state.isOpen()
    triggerProps.onClick()
    this.applyInteractionResult(previousOpen)
  }

  private handleKeyDown(event: KeyboardEvent) {
    const previousOpen = this.model.state.isOpen()
    this.model.contracts.getTriggerProps().onKeyDown({key: event.key})
    this.applyInteractionResult(previousOpen)
  }

  private handleTriggerSlotChange() {
    this.syncTriggerAria()
  }

  /** Programmatically opens the tooltip (intended for manual trigger mode). */
  show(): void {
    const previousOpen = this.model.state.isOpen()
    this.model.actions.show()
    this.applyInteractionResult(previousOpen)
  }

  /** Programmatically closes the tooltip (intended for manual trigger mode). */
  hide(): void {
    const previousOpen = this.model.state.isOpen()
    this.model.actions.hide()
    this.applyInteractionResult(previousOpen)
  }

  protected override render() {
    const triggerProps = this.model.contracts.getTriggerProps()
    const tooltipProps = this.model.contracts.getTooltipProps()

    return html`
      <span part="base">
        <span
          id=${triggerProps.id}
          part="trigger"
          @pointerenter=${this.handlePointerEnter}
          @pointerleave=${this.handlePointerLeave}
          @focusin=${this.handleFocusIn}
          @focusout=${this.handleFocusOut}
          @click=${this.handleClick}
          @keydown=${this.handleKeyDown}
        >
          <slot name="trigger" @slotchange=${this.handleTriggerSlotChange}>?</slot>
        </span>

        <span
          id=${tooltipProps.id}
          role=${tooltipProps.role}
          tabindex=${tooltipProps.tabindex}
          popover=${supportsNativePopover ? 'manual' : nothing}
          data-placement="top"
          data-anchor-positioning=${supportsNativeAnchoredAutoplacement ? 'true' : 'false'}
          ?hidden=${supportsNativePopover ? false : tooltipProps.hidden}
          part="content"
        >
          <slot name="content"></slot>
          ${this.arrow ? html`<span part="arrow"></span>` : ''}
        </span>
      </span>
    `
  }
}
