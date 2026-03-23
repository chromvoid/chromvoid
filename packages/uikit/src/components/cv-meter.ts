import {createMeter, type MeterModel} from '@chromvoid/headless-ui'
import {css, html, nothing} from 'lit'
import type {PropertyValues} from 'lit'

import {ReatomLitElement} from '../reatom-lit/ReatomLitElement'

let cvMeterNonce = 0

export class CVMeter extends ReatomLitElement {
  static elementName = 'cv-meter'

  static get properties() {
    return {
      value: {type: Number, reflect: true},
      min: {type: Number, reflect: true},
      max: {type: Number, reflect: true},
      low: {type: Number, reflect: true},
      high: {type: Number, reflect: true},
      optimum: {type: Number, reflect: true},
      valueText: {type: String, attribute: 'value-text'},
      ariaLabel: {type: String, attribute: 'aria-label'},
      ariaLabelledBy: {type: String, attribute: 'aria-labelledby'},
      ariaDescribedBy: {type: String, attribute: 'aria-describedby'},
    }
  }

  declare value: number
  declare min: number
  declare max: number
  declare low: number | null
  declare high: number | null
  declare optimum: number | null
  declare valueText: string
  declare ariaLabel: string
  declare ariaLabelledBy: string
  declare ariaDescribedBy: string

  private readonly idBase = `cv-meter-${++cvMeterNonce}`
  private model: MeterModel

  constructor() {
    super()
    this.value = 0
    this.min = 0
    this.max = 100
    this.low = null
    this.high = null
    this.optimum = null
    this.valueText = ''
    this.ariaLabel = ''
    this.ariaLabelledBy = ''
    this.ariaDescribedBy = ''
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
        block-size: var(--cv-meter-height, 10px);
        border-radius: var(--cv-meter-border-radius, 999px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        overflow: hidden;
      }

      [part='indicator'] {
        block-size: 100%;
        inline-size: var(--cv-meter-width, 0%);
        border-radius: inherit;
        background: linear-gradient(
          90deg,
          var(--cv-color-primary, #65d7ff) 0%,
          color-mix(in oklab, var(--cv-color-primary, #65d7ff) 70%, white) 100%
        );
        transition: inline-size var(--cv-meter-transition-duration, var(--cv-duration-normal, 220ms)) var(--cv-easing-standard, ease);
      }

      [part='indicator'][data-status='low'] {
        background: linear-gradient(
          90deg,
          var(--cv-meter-suboptimum-color, var(--cv-color-warning, #ffbe65)) 0%,
          color-mix(in oklab, var(--cv-meter-suboptimum-color, var(--cv-color-warning, #ffbe65)) 72%, white) 100%
        );
      }

      [part='indicator'][data-status='high'] {
        background: linear-gradient(
          90deg,
          var(--cv-meter-danger-color, var(--cv-color-danger, #ff7a8a)) 0%,
          color-mix(in oklab, var(--cv-meter-danger-color, var(--cv-color-danger, #ff7a8a)) 72%, white) 100%
        );
      }

      [part='indicator'][data-status='optimum'] {
        background: linear-gradient(
          90deg,
          var(--cv-meter-optimum-color, var(--cv-color-success, #6ef7c8)) 0%,
          color-mix(in oklab, var(--cv-meter-optimum-color, var(--cv-color-success, #6ef7c8)) 72%, white) 100%
        );
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
      changedProperties.has('low') ||
      changedProperties.has('high') ||
      changedProperties.has('optimum') ||
      changedProperties.has('valueText') ||
      changedProperties.has('ariaLabel') ||
      changedProperties.has('ariaLabelledBy') ||
      changedProperties.has('ariaDescribedBy')
    ) {
      this.model = this.createModel()
      return
    }

    if (changedProperties.has('value') && this.model.state.value() !== this.value) {
      this.model.actions.setValue(this.value)
    }
  }

  private createModel(): MeterModel {
    return createMeter({
      idBase: this.idBase,
      value: this.value,
      min: this.min,
      max: this.max,
      low: this.toFiniteOrUndefined(this.low),
      high: this.toFiniteOrUndefined(this.high),
      optimum: this.toFiniteOrUndefined(this.optimum),
      ariaLabel: this.ariaLabel || undefined,
      ariaLabelledBy: this.ariaLabelledBy || undefined,
      ariaDescribedBy: this.ariaDescribedBy || undefined,
      formatValueText: this.valueText ? () => this.valueText : undefined,
    })
  }

  private toFiniteOrUndefined(value: number | null): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
  }

  protected override render() {
    const props = this.model.contracts.getMeterProps()
    const percentage = Math.max(0, Math.min(100, this.model.state.percentage()))
    const status = this.model.state.status()

    return html`
      <div
        id=${props.id}
        role=${props.role}
        aria-valuenow=${props['aria-valuenow']}
        aria-valuemin=${props['aria-valuemin']}
        aria-valuemax=${props['aria-valuemax']}
        aria-valuetext=${props['aria-valuetext'] ?? nothing}
        aria-label=${props['aria-label'] ?? nothing}
        aria-labelledby=${props['aria-labelledby'] ?? nothing}
        aria-describedby=${props['aria-describedby'] ?? nothing}
        part="base"
      >
        <div part="indicator" data-status=${status} style=${`--cv-meter-width:${percentage}%;`}><span part="label"><slot></slot></span></div>
      </div>
    `
  }
}
