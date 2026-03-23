import {createWindowSplitter, type WindowSplitterModel, type WindowSplitterOrientation} from '@chromvoid/headless-ui'
import {css, html, nothing} from 'lit'
import type {PropertyValues} from 'lit'

import {ReatomLitElement} from '../reatom-lit/ReatomLitElement'

export interface CVWindowSplitterEventDetail {
  position: number
}

const splitterKeysToPrevent = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter'])

let cvWindowSplitterNonce = 0

export class CVWindowSplitter extends ReatomLitElement {
  static elementName = 'cv-window-splitter'

  static get properties() {
    return {
      position: {type: Number, reflect: true},
      min: {type: Number, reflect: true},
      max: {type: Number, reflect: true},
      step: {type: Number, reflect: true},
      orientation: {type: String, reflect: true},
      fixed: {type: Boolean, reflect: true},
      snap: {type: String},
      snapThreshold: {type: Number, attribute: 'snap-threshold'},
      ariaLabel: {type: String, attribute: 'aria-label'},
      ariaLabelledBy: {type: String, attribute: 'aria-labelledby'},
    }
  }

  declare position: number
  declare min: number
  declare max: number
  declare step: number
  declare orientation: WindowSplitterOrientation
  declare fixed: boolean
  declare snap: string | undefined
  declare snapThreshold: number
  declare ariaLabel: string
  declare ariaLabelledBy: string

  private readonly idBase = `cv-window-splitter-${++cvWindowSplitterNonce}`
  private model: WindowSplitterModel
  private _dragStartPosition: number = 0

  constructor() {
    super()
    this.position = 50
    this.min = 0
    this.max = 100
    this.step = 1
    this.orientation = 'vertical'
    this.fixed = false
    this.snap = undefined
    this.snapThreshold = 12
    this.ariaLabel = ''
    this.ariaLabelledBy = ''
    this.model = this.createModel()
  }

  static styles = [
    css`
      :host {
        display: block;
        inline-size: 100%;
        min-block-size: 140px;
      }

      [part='base'] {
        inline-size: 100%;
        block-size: 100%;
        display: grid;
        gap: 0;
      }

      [part='base'][data-orientation='vertical'] {
        grid-template-columns: var(--cv-window-splitter-primary-size, 50%) var(--cv-window-splitter-divider-size, 8px) 1fr;
      }

      [part='base'][data-orientation='horizontal'] {
        grid-template-rows: var(--cv-window-splitter-primary-size, 50%) var(--cv-window-splitter-divider-size, 8px) 1fr;
      }

      [part='pane'] {
        min-inline-size: 0;
        min-block-size: 0;
        overflow: auto;
      }

      [part='pane'][data-pane='primary'] {
        border-inline-end: 1px solid transparent;
      }

      [part='separator'] {
        display: flex;
        align-items: center;
        justify-content: center;
        background: color-mix(in oklab, var(--cv-color-surface, #141923) 82%, black);
        border: 1px solid var(--cv-color-border, #2a3245);
        color: var(--cv-color-text-muted, #9aa6bf);
        user-select: none;
        touch-action: none;
      }

      [part='separator']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      [part='separator'][data-orientation='vertical'] {
        cursor: col-resize;
      }

      [part='separator'][data-orientation='horizontal'] {
        cursor: row-resize;
      }

      [part='separator-handle'] {
        opacity: 0.8;
        font-size: 11px;
        line-height: 1;
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
  }

  override willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties)

    if (
      changedProperties.has('min') ||
      changedProperties.has('max') ||
      changedProperties.has('step') ||
      changedProperties.has('orientation') ||
      changedProperties.has('fixed') ||
      changedProperties.has('snap') ||
      changedProperties.has('snapThreshold') ||
      changedProperties.has('ariaLabel') ||
      changedProperties.has('ariaLabelledBy')
    ) {
      this.model = this.createModel()
      return
    }

    if (changedProperties.has('position') && this.model.state.position() !== this.position) {
      this.model.actions.setPosition(this.position)
    }
  }

  private createModel(): WindowSplitterModel {
    return createWindowSplitter({
      idBase: this.idBase,
      min: this.min,
      max: this.max,
      position: this.position,
      step: this.step,
      orientation: this.orientation,
      isFixed: this.fixed,
      snap: this.snap,
      snapThreshold: this.snapThreshold,
      ariaLabel: this.ariaLabel || undefined,
      ariaLabelledBy: this.ariaLabelledBy || undefined,
    })
  }

  private getPercentage(): number {
    const min = this.model.state.min()
    const max = this.model.state.max()
    if (max <= min) return 0
    return Math.max(0, Math.min(100, ((this.model.state.position() - min) / (max - min)) * 100))
  }

  private dispatchInput(detail: CVWindowSplitterEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-input', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private dispatchChange(detail: CVWindowSplitterEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-change', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private syncFromModelAndEmit(previousPosition: number, emitChange: boolean): boolean {
    const nextPosition = this.model.state.position()
    this.position = nextPosition
    if (nextPosition === previousPosition) return false

    const detail = {position: nextPosition}
    this.dispatchInput(detail)
    if (emitChange) {
      this.dispatchChange(detail)
    }
    return true
  }

  private handleSeparatorKeyDown(event: KeyboardEvent) {
    if (splitterKeysToPrevent.has(event.key)) {
      event.preventDefault()
    }

    const previousPosition = this.model.state.position()
    this.model.actions.handleKeyDown({key: event.key})
    // Re-apply setPosition to trigger snap resolution if snap is configured
    if (this.snap) {
      this.model.actions.setPosition(this.model.state.position())
    }
    this.syncFromModelAndEmit(previousPosition, true)
  }

  private _onPointerDown = (e: PointerEvent): void => {
    if ((e as PointerEvent & {button?: number}).button !== undefined && (e as PointerEvent & {button: number}).button !== 0) return
    e.preventDefault()
    const sep = e.currentTarget as HTMLElement
    sep.setPointerCapture(e.pointerId)
    this.model.actions.startDragging()
    this._dragStartPosition = this.position
    sep.setAttribute('data-dragging', '')
    sep.addEventListener('pointermove', this._onPointerMove)
    sep.addEventListener('pointerup', this._onPointerUp)
    sep.addEventListener('pointercancel', this._onPointerUp)
    sep.addEventListener('lostpointercapture', this._onLostPointerCapture)
  }

  private _onPointerMove = (e: PointerEvent): void => {
    const base = this.shadowRoot?.querySelector('[part="base"]') as HTMLElement | null
    if (!base) return

    const rect = base.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return

    const ratioRaw =
      this.orientation === 'vertical'
        ? (e.clientX - rect.left) / rect.width
        : (e.clientY - rect.top) / rect.height

    const ratio = Math.max(0, Math.min(1, ratioRaw))
    const min = this.model.state.min()
    const max = this.model.state.max()
    const newPos = min + ratio * (max - min)
    this.model.actions.setPosition(newPos)
    const pos = this.model.state.position()
    this.position = pos
    this.dispatchEvent(new CustomEvent('cv-input', {detail: {position: pos}, bubbles: true, composed: true}))
  }

  private _onPointerUp = (e: PointerEvent): void => {
    const sep = e.currentTarget as HTMLElement
    sep.removeEventListener('pointermove', this._onPointerMove)
    sep.removeEventListener('pointerup', this._onPointerUp)
    sep.removeEventListener('pointercancel', this._onPointerUp)
    sep.removeEventListener('lostpointercapture', this._onLostPointerCapture)
    sep.removeAttribute('data-dragging')
    this.model.actions.stopDragging()
    const pos = this.model.state.position()
    if (pos !== this._dragStartPosition) {
      this.dispatchEvent(new CustomEvent('cv-change', {detail: {position: pos}, bubbles: true, composed: true}))
    }
  }

  private _onLostPointerCapture = (e: PointerEvent): void => {
    const sep = e.currentTarget as HTMLElement
    sep.removeEventListener('pointermove', this._onPointerMove)
    sep.removeEventListener('pointerup', this._onPointerUp)
    sep.removeEventListener('pointercancel', this._onPointerUp)
    sep.removeEventListener('lostpointercapture', this._onLostPointerCapture)
    sep.removeAttribute('data-dragging')
    this.model.actions.stopDragging()
    const pos = this.model.state.position()
    if (pos !== this._dragStartPosition) {
      this.dispatchEvent(new CustomEvent('cv-change', {detail: {position: pos}, bubbles: true, composed: true}))
    }
  }

  protected override render() {
    const splitterProps = this.model.contracts.getSplitterProps()
    const primaryPaneProps = this.model.contracts.getPrimaryPaneProps()
    const secondaryPaneProps = this.model.contracts.getSecondaryPaneProps()
    const percentage = this.getPercentage()
    const isDragging = this.model.state.isDragging()

    return html`
      <div
        part="base"
        data-orientation=${this.orientation}
        style=${`--cv-window-splitter-primary-size:${percentage}%;`}
      >
        <div
          id=${primaryPaneProps.id}
          data-pane=${primaryPaneProps['data-pane']}
          data-orientation=${primaryPaneProps['data-orientation']}
          part="pane"
        >
          <slot name="primary"></slot>
        </div>

        <div
          id=${splitterProps.id}
          role=${splitterProps.role}
          tabindex=${splitterProps.tabindex}
          aria-valuenow=${splitterProps['aria-valuenow']}
          aria-valuemin=${splitterProps['aria-valuemin']}
          aria-valuemax=${splitterProps['aria-valuemax']}
          aria-valuetext=${splitterProps['aria-valuetext'] ?? nothing}
          aria-orientation=${splitterProps['aria-orientation']}
          aria-controls=${splitterProps['aria-controls']}
          aria-label=${splitterProps['aria-label'] ?? nothing}
          aria-labelledby=${splitterProps['aria-labelledby'] ?? nothing}
          data-orientation=${this.orientation}
          ?data-dragging=${isDragging}
          part="separator"
          @keydown=${this.handleSeparatorKeyDown}
          @pointerdown=${this._onPointerDown}
        >
          <span part="separator-handle">
            <slot name="separator">${this.orientation === 'vertical' ? '⋮' : '⋯'}</slot>
          </span>
        </div>

        <div
          id=${secondaryPaneProps.id}
          data-pane=${secondaryPaneProps['data-pane']}
          data-orientation=${secondaryPaneProps['data-orientation']}
          part="pane"
        >
          <slot name="secondary"></slot>
        </div>
      </div>
    `
  }
}
