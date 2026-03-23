import {
  createSliderMultiThumb,
  type SliderMultiThumbModel,
  type SliderMultiThumbOrientation,
} from '@chromvoid/headless-ui'
import {css, html, nothing} from 'lit'
import type {PropertyValues} from 'lit'

import {ReatomLitElement} from '../reatom-lit/ReatomLitElement'

export interface CVSliderMultiThumbEventDetail {
  values: number[]
  activeThumbIndex: number | null
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

const arraysEqual = (left: readonly number[], right: readonly number[]) =>
  left.length === right.length && left.every((value, index) => value === right[index])

let cvSliderMultiThumbNonce = 0

export class CVSliderMultiThumb extends ReatomLitElement {
  static elementName = 'cv-slider-multi-thumb'

  static get properties() {
    return {
      values: {attribute: false},
      min: {type: Number, reflect: true},
      max: {type: Number, reflect: true},
      step: {type: Number, reflect: true},
      largeStep: {type: Number, attribute: 'large-step', reflect: true},
      orientation: {type: String, reflect: true},
      disabled: {type: Boolean, reflect: true},
    }
  }

  declare values: number[]
  declare min: number
  declare max: number
  declare step: number
  declare largeStep: number
  declare orientation: SliderMultiThumbOrientation
  declare disabled: boolean

  private readonly idBase = `cv-slider-multi-thumb-${++cvSliderMultiThumbNonce}`
  private model: SliderMultiThumbModel
  private draggingThumbIndex: number | null = null
  private dragValueChanged = false

  constructor() {
    super()
    this.values = [25, 75]
    this.min = 0
    this.max = 100
    this.step = 1
    this.largeStep = 10
    this.orientation = 'horizontal'
    this.disabled = false
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
        --cv-range-start: 0%;
        --cv-range-size: 0%;
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
        inset-inline-start: var(--cv-range-start);
        inline-size: var(--cv-range-size);
        border-radius: inherit;
        background: linear-gradient(
          90deg,
          var(--cv-color-primary, #65d7ff) 0%,
          color-mix(in oklab, var(--cv-color-primary, #65d7ff) 70%, white) 100%
        );
      }

      [part='thumb'] {
        position: absolute;
        inset-inline-start: var(--cv-thumb-percentage);
        inset-block-start: 50%;
        inline-size: 16px;
        block-size: 16px;
        border-radius: 50%;
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface-elevated, #1d2432);
        transform: translate(-50%, -50%);
        cursor: grab;
      }

      [part='thumb'][data-active='true'] {
        border-color: var(--cv-color-primary, #65d7ff);
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
        block-size: var(--cv-range-size);
        inset-inline-start: 0;
        inset-block-end: var(--cv-range-start);
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
        inset-block-end: var(--cv-thumb-percentage);
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

    const shouldRebuildModel =
      changedProperties.has('min') ||
      changedProperties.has('max') ||
      changedProperties.has('step') ||
      changedProperties.has('largeStep') ||
      changedProperties.has('orientation') ||
      (changedProperties.has('values') && !arraysEqual(this.values, this.model.state.values()))

    if (shouldRebuildModel) {
      this.model = this.createModel()
      this.syncValuesFromModel()
      return
    }

    if (changedProperties.has('disabled')) {
      this.model.actions.setDisabled(this.disabled)
    }
  }

  private createModel(): SliderMultiThumbModel {
    return createSliderMultiThumb({
      idBase: this.idBase,
      values: this.values,
      min: this.min,
      max: this.max,
      step: this.step,
      largeStep: this.largeStep,
      orientation: this.orientation,
      isDisabled: this.disabled,
      getThumbAriaLabel: (index) => `Thumb ${index + 1}`,
      formatValueText: (value) => String(value),
    })
  }

  private getEventDetail(): CVSliderMultiThumbEventDetail {
    return {
      values: [...this.model.state.values()],
      activeThumbIndex: this.model.state.activeThumbIndex(),
    }
  }

  private dispatchInput(detail: CVSliderMultiThumbEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-input', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private dispatchChange(detail: CVSliderMultiThumbEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-change', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private syncValuesFromModel(): void {
    const nextValues = [...this.model.state.values()]
    if (!arraysEqual(this.values, nextValues)) {
      this.values = nextValues
    }
  }

  private syncFromModelAndEmit(previousValues: readonly number[], emitChange: boolean): boolean {
    const nextValues = [...this.model.state.values()]
    this.syncValuesFromModel()

    if (arraysEqual(previousValues, nextValues)) return false

    const detail = this.getEventDetail()
    this.dispatchInput(detail)
    if (emitChange) {
      this.dispatchChange(detail)
    }

    return true
  }

  private pointerValueFromPosition(clientX: number, clientY: number): number | null {
    const track = this.shadowRoot?.querySelector('[part="track"]') as HTMLElement | null
    if (!track) return null

    const rect = track.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null

    const ratioRaw =
      this.orientation === 'vertical'
        ? (rect.bottom - clientY) / rect.height
        : (clientX - rect.left) / rect.width

    const ratio = Math.max(0, Math.min(1, ratioRaw))
    const min = this.model.state.min()
    const max = this.model.state.max()
    return min + ratio * (max - min)
  }

  private pickNearestThumbIndex(pointerValue: number): number | null {
    const values = this.model.state.values()
    if (values.length === 0) return null

    let nearestIndex = 0
    let nearestDistance = Number.POSITIVE_INFINITY
    for (const [index, value] of values.entries()) {
      const distance = Math.abs(value - pointerValue)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestIndex = index
      }
    }

    return nearestIndex
  }

  private updateValueFromPointer(index: number, clientX: number, clientY: number): boolean {
    const pointerValue = this.pointerValueFromPosition(clientX, clientY)
    if (pointerValue == null) return false

    const previousValues = [...this.model.state.values()]
    this.model.actions.setValue(index, pointerValue)
    return this.syncFromModelAndEmit(previousValues, false)
  }

  private focusThumb(index: number): void {
    const thumb = this.shadowRoot?.querySelector(`[part="thumb"][data-index="${index}"]`) as HTMLElement | null
    thumb?.focus()
  }

  private handleTrackMouseDown(event: MouseEvent) {
    if (this.disabled || event.button !== 0) return

    const pointerValue = this.pointerValueFromPosition(event.clientX, event.clientY)
    if (pointerValue == null) return

    const index = this.pickNearestThumbIndex(pointerValue)
    if (index == null) return

    event.preventDefault()
    this.model.actions.setActiveThumb(index)
    this.draggingThumbIndex = index
    this.dragValueChanged = this.updateValueFromPointer(index, event.clientX, event.clientY)
    this.focusThumb(index)

    document.addEventListener('mousemove', this.handleDocumentMouseMove)
    document.addEventListener('mouseup', this.handleDocumentMouseUp)
  }

  private handleDocumentMouseMove = (event: MouseEvent) => {
    if (this.draggingThumbIndex == null) return

    const changed = this.updateValueFromPointer(this.draggingThumbIndex, event.clientX, event.clientY)
    this.dragValueChanged = this.dragValueChanged || changed
  }

  private handleDocumentMouseUp = (event: MouseEvent) => {
    if (this.draggingThumbIndex == null) return

    const changed = this.updateValueFromPointer(this.draggingThumbIndex, event.clientX, event.clientY)
    this.dragValueChanged = this.dragValueChanged || changed

    if (this.dragValueChanged) {
      this.dispatchChange(this.getEventDetail())
    }

    this.draggingThumbIndex = null
    this.dragValueChanged = false
    this.cleanupDragListeners()
  }

  private cleanupDragListeners(): void {
    document.removeEventListener('mousemove', this.handleDocumentMouseMove)
    document.removeEventListener('mouseup', this.handleDocumentMouseUp)
  }

  private handleThumbFocus = (index: number) => {
    this.model.actions.setActiveThumb(index)
    this.requestUpdate()
  }

  private handleThumbKeyDown = (index: number, event: KeyboardEvent) => {
    if (sliderKeyboardKeys.has(event.key)) {
      event.preventDefault()
    }

    const previousValues = [...this.model.state.values()]
    this.model.contracts.getThumbProps(index).onKeyDown(event)
    this.syncFromModelAndEmit(previousValues, true)
  }

  protected override render() {
    const rootProps = this.model.contracts.getRootProps()
    const trackProps = this.model.contracts.getTrackProps()
    const values = this.model.state.values()
    const min = this.model.state.min()
    const max = this.model.state.max()
    const denominator = Math.max(max - min, 1)
    const percentages = values.map((value) => Math.max(0, Math.min(100, ((value - min) / denominator) * 100)))
    const rangeStart = percentages.length === 0 ? 0 : Math.min(...percentages)
    const rangeEnd = percentages.length === 0 ? 0 : Math.max(...percentages)
    const rangeSize = Math.max(0, rangeEnd - rangeStart)

    return html`
      <div
        id=${rootProps.id}
        data-orientation=${rootProps['data-orientation']}
        aria-disabled=${rootProps['aria-disabled'] ?? nothing}
        style=${`--cv-range-start:${rangeStart}%;--cv-range-size:${rangeSize}%;`}
        part="base"
      >
        <div id=${trackProps.id} data-orientation=${trackProps['data-orientation']} part="track" @mousedown=${this.handleTrackMouseDown}>
          <div part="range"></div>
        </div>
        ${values.map((_, index) => {
          const thumbProps = this.model.contracts.getThumbProps(index)
          return html`
            <button
              id=${thumbProps.id}
              type="button"
              role=${thumbProps.role}
              tabindex=${thumbProps.tabindex}
              aria-valuenow=${thumbProps['aria-valuenow']}
              aria-valuemin=${thumbProps['aria-valuemin']}
              aria-valuemax=${thumbProps['aria-valuemax']}
              aria-valuetext=${thumbProps['aria-valuetext'] ?? nothing}
              aria-orientation=${thumbProps['aria-orientation']}
              aria-disabled=${thumbProps['aria-disabled'] ?? nothing}
              aria-label=${thumbProps['aria-label'] ?? nothing}
              data-active=${thumbProps['data-active']}
              data-index=${String(index)}
              style=${`--cv-thumb-percentage:${percentages[index] ?? 0}%;`}
              part="thumb"
              @focus=${() => this.handleThumbFocus(index)}
              @keydown=${(event: KeyboardEvent) => this.handleThumbKeyDown(index, event)}
            ></button>
          `
        })}
      </div>
    `
  }
}
