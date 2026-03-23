import {createSpinner, type SpinnerModel} from '@chromvoid/headless-ui'
import {css, svg} from 'lit'
import type {PropertyValues} from 'lit'

import {ReatomLitElement} from '../reatom-lit/ReatomLitElement'

const RADIUS = 45
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export class CVSpinner extends ReatomLitElement {
  static elementName = 'cv-spinner'

  static get properties() {
    return {
      label: {type: String, reflect: true},
    }
  }

  declare label: string

  private model: SpinnerModel

  constructor() {
    super()
    this.label = 'Loading'
    this.model = createSpinner({label: this.label})
  }

  static styles = [
    css`
      :host {
        display: inline-block;
        inline-size: 1em;
        block-size: 1em;
        line-height: 0;
      }

      [part='base'] {
        inline-size: 100%;
        block-size: 100%;
      }

      [part='track'] {
        fill: none;
        stroke: var(--cv-spinner-track-color, var(--cv-color-border, #2a3245));
        stroke-width: var(--cv-spinner-track-width, 4px);
      }

      [part='indicator'] {
        fill: none;
        stroke: var(--cv-spinner-indicator-color, var(--cv-color-primary, #65d7ff));
        stroke-width: var(--cv-spinner-track-width, 4px);
        stroke-linecap: round;
        stroke-dasharray: ${CIRCUMFERENCE};
        stroke-dashoffset: ${CIRCUMFERENCE * 0.75};
        transform-origin: 50% 50%;
        animation: cv-spinner-rotate var(--cv-spinner-speed, 600ms) linear infinite;
      }

      @keyframes cv-spinner-rotate {
        0% {
          transform: rotate(0deg);
        }
        100% {
          transform: rotate(360deg);
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

    if (changedProperties.has('label')) {
      this.model.actions.setLabel(this.label)
    }
  }

  protected override render() {
    const props = this.model.contracts.getSpinnerProps()

    return svg`
      <svg
        part="base"
        viewBox="0 0 100 100"
        role=${props.role}
        aria-label=${props['aria-label']}
      >
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
        ></circle>
      </svg>
    `
  }
}
