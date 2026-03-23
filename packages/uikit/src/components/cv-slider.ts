import {createSlider, type SliderModel, type SliderOrientation} from '@chromvoid/headless-ui'
import {css, html, nothing} from 'lit'
import type {PropertyValues} from 'lit'

import {ReatomLitElement} from '../reatom-lit/ReatomLitElement'

export interface CVSliderEventDetail {
  value: number
  percentage: number
}

const sliderKeyboardKeys = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End',
])

let cvSliderNonce = 0

export class CVSlider extends ReatomLitElement {
  static elementName = 'cv-slider'

  static get properties() {
    return {
      value: {type: Number, reflect: true},
      min: {type: Number, reflect: true},
      max: {type: Number, reflect: true},
      step: {type: Number, reflect: true},
      largeStep: {type: Number, attribute: 'large-step', reflect: true},
      orientation: {type: String, reflect: true},
      disabled: {type: Boolean, reflect: true},
      ariaLabel: {type: String, attribute: 'aria-label'},
      ariaLabelledBy: {type: String, attribute: 'aria-labelledby'},
      ariaDescribedBy: {type: String, attribute: 'aria-describedby'},
    }
  }

  declare value: number
  declare min: number
  declare max: number
  declare step: number
  declare largeStep: number
  declare orientation: SliderOrientation
  declare disabled: boolean
  declare ariaLabel: string
  declare ariaLabelledBy: string
  declare ariaDescribedBy: string

  private readonly idBase = `cv-slider-${++cvSliderNonce}`
  private model: SliderModel
  private dragging = false
  private dragValueChanged = false

  constructor() {
    super()
    this.value = 0
    this.min = 0
    this.max = 100
    this.step = 1
    this.largeStep = 10
    this.orientation = 'horizontal'
    this.disabled = false
    this.ariaLabel = ''
    this.ariaLabelledBy = ''
    this.ariaDescribedBy = ''
    this.model = this.createModel()
  }

  static styles = [
    css`
      :host {
        display: inline-block;
        inline-size: 240px;
        min-block-size: 24px;
      }

      [part='base'] {
        position: relative;
        display: grid;
        place-items: center;
        inline-size: 100%;
        block-size: 24px;
        --cv-slider-percentage: 0%;
      }

      [part='track'] {
        position: relative;
        inline-size: 100%;
        block-size: 6px;
        border-radius: 999px;
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
      }

      [part='range'] {
        position: absolute;
        inset-block: 0;
        inset-inline-start: 0;
        inline-size: var(--cv-slider-percentage);
        border-radius: inherit;
        background: linear-gradient(
          90deg,
          var(--cv-color-primary, #65d7ff) 0%,
          color-mix(in oklab, var(--cv-color-primary, #65d7ff) 70%, white) 100%
        );
      }

      [part='thumb'] {
        position: absolute;
        inset-inline-start: var(--cv-slider-percentage);
        inset-block-start: 50%;
        inline-size: 16px;
        block-size: 16px;
        border-radius: 50%;
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface-elevated, #1d2432);
        transform: translate(-50%, -50%);
        cursor: grab;
      }

      [part='thumb']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 2px;
      }

      [part='thumb']:active {
        cursor: grabbing;
      }

      :host([orientation='vertical']) {
        inline-size: 24px;
        block-size: 180px;
      }

      :host([orientation='vertical']) [part='base'] {
        inline-size: 24px;
        block-size: 100%;
      }

      :host([orientation='vertical']) [part='track'] {
        inline-size: 6px;
        block-size: 100%;
      }

      :host([orientation='vertical']) [part='range'] {
        inline-size: 100%;
        block-size: var(--cv-slider-percentage);
        inset-inline-start: 0;
        inset-block-end: 0;
        inset-block-start: auto;
        background: linear-gradient(
          180deg,
          color-mix(in oklab, var(--cv-color-primary, #65d7ff) 70%, white) 0%,
          var(--cv-color-primary, #65d7ff) 100%
        );
      }

      :host([orientation='vertical']) [part='thumb'] {
        inset-inline-start: 50%;
        inset-block-start: auto;
        inset-block-end: var(--cv-slider-percentage);
        transform: translate(-50%, 50%);
      }

      :host([disabled]) [part='base'] {
        opacity: 0.55;
      }

      :host([disabled]) [part='thumb'] {
        cursor: not-allowed;
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
    this.cleanupDragListeners()
  }

  override willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties)

    if (
      changedProperties.has('min') ||
      changedProperties.has('max') ||
      changedProperties.has('step') ||
      changedProperties.has('largeStep') ||
      changedProperties.has('orientation') ||
      changedProperties.has('ariaLabel') ||
      changedProperties.has('ariaLabelledBy') ||
      changedProperties.has('ariaDescribedBy')
    ) {
      this.model = this.createModel()
      return
    }

    if (changedProperties.has('disabled')) {
      this.model.actions.setDisabled(this.disabled)
    }

    if (changedProperties.has('value') && this.model.state.value() !== this.value) {
      this.model.actions.setValue(this.value)
    }
  }

  private createModel(): SliderModel {
    return createSlider({
      idBase: this.idBase,
      value: this.value,
      min: this.min,
      max: this.max,
      step: this.step,
      largeStep: this.largeStep,
      orientation: this.orientation,
      isDisabled: this.disabled,
      ariaLabel: this.ariaLabel || undefined,
      ariaLabelledBy: this.ariaLabelledBy || undefined,
      ariaDescribedBy: this.ariaDescribedBy || undefined,
    })
  }

  private getEventDetail(): CVSliderEventDetail {
    return {
      value: this.model.state.value(),
      percentage: this.model.state.percentage(),
    }
  }

  private dispatchInput(detail: CVSliderEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-input', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private dispatchChange(detail: CVSliderEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-change', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private syncFromModelAndEmit(previousValue: number, emitChange: boolean): boolean {
    const nextValue = this.model.state.value()
    this.value = nextValue

    if (previousValue === nextValue) return false

    const detail = this.getEventDetail()
    this.dispatchInput(detail)
    if (emitChange) {
      this.dispatchChange(detail)
    }

    return true
  }

  private updateValueFromPointer(clientX: number, clientY: number): boolean {
    const track = this.shadowRoot?.querySelector('[part="track"]') as HTMLElement | null
    if (!track) return false

    const rect = track.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return false

    const ratioRaw =
      this.orientation === 'vertical'
        ? (rect.bottom - clientY) / rect.height
        : (clientX - rect.left) / rect.width

    const ratio = Math.max(0, Math.min(1, ratioRaw))
    const min = this.model.state.min()
    const max = this.model.state.max()
    const nextValue = min + ratio * (max - min)
    const previousValue = this.model.state.value()

    this.model.actions.setValue(nextValue)
    return this.syncFromModelAndEmit(previousValue, false)
  }

  private handleThumbKeyDown(event: KeyboardEvent) {
    if (sliderKeyboardKeys.has(event.key)) {
      event.preventDefault()
    }

    const previousValue = this.model.state.value()
    this.model.contracts.getThumbProps().onKeyDown(event)
    this.syncFromModelAndEmit(previousValue, true)
  }

  private handleTrackMouseDown(event: MouseEvent) {
    if (this.disabled || event.button !== 0) return

    event.preventDefault()
    ;(this.shadowRoot?.querySelector('[part="thumb"]') as HTMLElement | null)?.focus()
    this.dragging = true
    this.dragValueChanged = this.updateValueFromPointer(event.clientX, event.clientY)

    document.addEventListener('mousemove', this.handleDocumentMouseMove)
    document.addEventListener('mouseup', this.handleDocumentMouseUp)
  }

  private handleDocumentMouseMove = (event: MouseEvent) => {
    if (!this.dragging) return
    const changed = this.updateValueFromPointer(event.clientX, event.clientY)
    this.dragValueChanged = this.dragValueChanged || changed
  }

  private handleDocumentMouseUp = (event: MouseEvent) => {
    if (!this.dragging) return

    const changed = this.updateValueFromPointer(event.clientX, event.clientY)
    this.dragValueChanged = this.dragValueChanged || changed

    if (this.dragValueChanged) {
      this.dispatchChange(this.getEventDetail())
    }

    this.dragging = false
    this.dragValueChanged = false
    this.cleanupDragListeners()
  }

  private cleanupDragListeners(): void {
    document.removeEventListener('mousemove', this.handleDocumentMouseMove)
    document.removeEventListener('mouseup', this.handleDocumentMouseUp)
  }

  protected override render() {
    const rootProps = this.model.contracts.getRootProps()
    const trackProps = this.model.contracts.getTrackProps()
    const thumbProps = this.model.contracts.getThumbProps()
    const percentage = Math.max(0, Math.min(100, this.model.state.percentage()))

    return html`
      <div
        id=${rootProps.id}
        data-orientation=${rootProps['data-orientation']}
        aria-disabled=${rootProps['aria-disabled'] ?? nothing}
        style=${`--cv-slider-percentage:${percentage}%;`}
        part="base"
      >
        <div
          id=${trackProps.id}
          data-orientation=${trackProps['data-orientation']}
          part="track"
          @mousedown=${this.handleTrackMouseDown}
        >
          <div part="range"></div>
          <div
            id=${thumbProps.id}
            role=${thumbProps.role}
            tabindex=${thumbProps.tabindex}
            aria-valuenow=${thumbProps['aria-valuenow']}
            aria-valuemin=${thumbProps['aria-valuemin']}
            aria-valuemax=${thumbProps['aria-valuemax']}
            aria-valuetext=${thumbProps['aria-valuetext'] ?? nothing}
            aria-orientation=${thumbProps['aria-orientation']}
            aria-disabled=${thumbProps['aria-disabled'] ?? nothing}
            aria-label=${thumbProps['aria-label'] ?? nothing}
            aria-labelledby=${thumbProps['aria-labelledby'] ?? nothing}
            aria-describedby=${thumbProps['aria-describedby'] ?? nothing}
            part="thumb"
            @keydown=${this.handleThumbKeyDown}
          ></div>
        </div>
      </div>
    `
  }
}
