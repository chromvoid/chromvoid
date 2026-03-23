import {createProgress, type ProgressModel} from '@chromvoid/headless-ui'
import {css, html, nothing} from 'lit'
import type {PropertyValues} from 'lit'

import {ReatomLitElement} from '../reatom-lit/ReatomLitElement'

let cvProgressNonce = 0

export class CVProgress extends ReatomLitElement {
  static elementName = 'cv-progress'

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

  private readonly idBase = `cv-progress-${++cvProgressNonce}`
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
        display: block;
      }

      [part='base'] {
        position: relative;
        inline-size: 100%;
        block-size: var(--cv-progress-height, 10px);
        border-radius: 999px;
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-progress-track-color, var(--cv-color-surface, #141923));
        overflow: hidden;
      }

      [part='indicator'] {
        block-size: 100%;
        inline-size: var(--cv-progress-width, 0%);
        border-radius: inherit;
        background: linear-gradient(
          90deg,
          var(--cv-progress-indicator-color, var(--cv-color-primary, #65d7ff)) 0%,
          color-mix(in oklab, var(--cv-progress-indicator-color, var(--cv-color-primary, #65d7ff)) 70%, white) 100%
        );
        transition: inline-size var(--cv-duration-normal, 220ms) var(--cv-easing-standard, ease);
        position: relative;
      }

      [part='label'] {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--cv-progress-label-color, var(--cv-color-text, #e8ecf6));
      }

      :host([indeterminate]) [part='indicator'] {
        inline-size: 35%;
        animation: cv-progress-indeterminate 1.15s linear infinite;
      }

      :host([data-complete]) [part='indicator'] {
        background: linear-gradient(
          90deg,
          var(--cv-color-success, #6ef7c8) 0%,
          color-mix(in oklab, var(--cv-color-success, #6ef7c8) 70%, white) 100%
        );
      }

      @keyframes cv-progress-indeterminate {
        0% {
          transform: translateX(-120%);
        }
        100% {
          transform: translateX(320%);
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
    this.toggleAttribute('data-complete', isComplete)

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
        <div
          part="indicator"
          style=${this.indeterminate ? nothing : `--cv-progress-width:${percentage}%;`}
        ><span part="label"><slot></slot></span></div>
      </div>
    `
  }
}
