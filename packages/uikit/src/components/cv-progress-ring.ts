import {createProgress, type ProgressModel} from '@chromvoid/headless-ui'
import {css, html, nothing} from 'lit'
import type {PropertyValues} from 'lit'

import {ReatomLitElement} from '../reatom-lit/ReatomLitElement'

let cvProgressRingNonce = 0

const RADIUS = 45
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export class CVProgressRing extends ReatomLitElement {
  static elementName = 'cv-progress-ring'

  static get properties() {
    return {
      value: {type: Number, reflect: true},
      min: {type: Number, reflect: true},
      max: {type: Number, reflect: true},
      indeterminate: {type: Boolean, reflect: true},
      valueText: {type: String, attribute: 'value-text'},
      ariaLabel: {type: String, attribute: 'aria-label'},
    }
  }

  declare value: number
  declare min: number
  declare max: number
  declare indeterminate: boolean
  declare valueText: string
  declare ariaLabel: string

  private readonly idBase = `cv-progress-ring-${++cvProgressRingNonce}`
  private model: ProgressModel

  constructor() {
    super()
    this.value = 0
    this.min = 0
    this.max = 100
    this.indeterminate = false
    this.valueText = ''
    this.ariaLabel = ''
    this.model = this.createModel()
  }

  static styles = [
    css`
      :host {
        display: inline-block;
        position: relative;
        inline-size: var(--cv-progress-ring-size, 80px);
        block-size: var(--cv-progress-ring-size, 80px);
      }

      [part='base'] {
        position: relative;
        inline-size: 100%;
        block-size: 100%;
      }

      [part='svg'] {
        inline-size: 100%;
        block-size: 100%;
        transform: rotate(-90deg);
      }

      [part='track'] {
        fill: none;
        stroke: var(--cv-progress-ring-track-color, var(--cv-color-surface, #141923));
        stroke-width: var(--cv-progress-ring-track-width, 4px);
      }

      [part='indicator'] {
        fill: none;
        stroke: var(--cv-progress-ring-indicator-color, var(--cv-color-primary, #65d7ff));
        stroke-width: var(--cv-progress-ring-indicator-width, 4px);
        stroke-linecap: round;
        transition: stroke-dashoffset var(--cv-duration-normal, 220ms) var(--cv-easing-standard, ease);
      }

      [part='label'] {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--cv-progress-ring-label-color, var(--cv-color-text, #e8ecf6));
      }

      :host([indeterminate]) [part='svg'] {
        animation: cv-progress-ring-spin 1.15s linear infinite;
      }

      :host([indeterminate]) [part='indicator'] {
        transition: none;
      }

      :host([data-complete]) [part='indicator'] {
        stroke: var(--cv-color-success, #6ef7c8);
      }

      @keyframes cv-progress-ring-spin {
        0% {
          transform: rotate(-90deg);
        }
        100% {
          transform: rotate(270deg);
        }
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

    if (
      changedProperties.has('min') ||
      changedProperties.has('max') ||
      changedProperties.has('valueText') ||
      changedProperties.has('ariaLabel')
    ) {
      this.model = this.createModel()
      return
    }

    if (changedProperties.has('value') && this.model.state.value() !== this.value) {
      this.model.actions.setValue(this.value)
    }

    if (changedProperties.has('indeterminate')) {
      this.model.actions.setIndeterminate(this.indeterminate)
    }
  }

  private createModel(): ProgressModel {
    return createProgress({
      idBase: this.idBase,
      value: this.value,
      min: this.min,
      max: this.max,
      isIndeterminate: this.indeterminate,
      valueText: this.valueText || undefined,
      ariaLabel: this.ariaLabel || undefined,
    })
  }

  protected override render() {
    const props = this.model.contracts.getProgressProps()
    const percentage = Math.max(0, Math.min(100, this.model.state.percentage()))
    const isComplete = this.model.state.isComplete()
    const isIndeterminate = this.model.state.isIndeterminate()

    this.toggleAttribute('data-complete', isComplete)

    const dashoffset = isIndeterminate
      ? CIRCUMFERENCE * 0.75
      : CIRCUMFERENCE * (1 - percentage / 100)

    return html`
      <div
        id=${props.id}
        role=${props.role}
        aria-valuenow=${props['aria-valuenow'] ?? nothing}
        aria-valuemin=${props['aria-valuemin'] ?? nothing}
        aria-valuemax=${props['aria-valuemax'] ?? nothing}
        aria-valuetext=${props['aria-valuetext'] ?? nothing}
        aria-label=${props['aria-label'] ?? nothing}
        aria-labelledby=${props['aria-labelledby'] ?? nothing}
        aria-describedby=${props['aria-describedby'] ?? nothing}
        part="base"
      >
        <svg part="svg" viewBox="0 0 100 100">
          <circle
            part="track"
            cx="50"
            cy="50"
            r="${RADIUS}"
          ></circle>
          <circle
            part="indicator"
            cx="50"
            cy="50"
            r="${RADIUS}"
            stroke-dasharray="${CIRCUMFERENCE}"
            style="stroke-dashoffset: ${dashoffset};"
          ></circle>
        </svg>
        <span part="label"><slot></slot></span>
      </div>
    `
  }
}
