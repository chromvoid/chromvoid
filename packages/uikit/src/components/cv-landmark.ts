import {createLandmark, type LandmarkModel, type LandmarkType} from '@chromvoid/headless-ui'
import {css, html, nothing} from 'lit'
import type {PropertyValues} from 'lit'

import {ReatomLitElement} from '../reatom-lit/ReatomLitElement'

let cvLandmarkNonce = 0

export class CVLandmark extends ReatomLitElement {
  static elementName = 'cv-landmark'

  static get properties() {
    return {
      type: {type: String, reflect: true},
      label: {type: String, reflect: true},
      labelId: {type: String, attribute: 'label-id', reflect: true},
    }
  }

  declare type: LandmarkType
  declare label: string
  declare labelId: string

  private readonly idBase = `cv-landmark-${++cvLandmarkNonce}`
  private model: LandmarkModel

  constructor() {
    super()
    this.type = 'region'
    this.label = ''
    this.labelId = ''
    this.model = this.createModel()
  }

  static styles = [
    css`
      :host {
        display: block;
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
    if (changedProperties.has('type') || changedProperties.has('label') || changedProperties.has('labelId')) {
      this.model = this.createModel()
    }
  }

  private createModel(): LandmarkModel {
    return createLandmark({
      idBase: this.idBase,
      type: this.type,
      label: this.label || undefined,
      labelId: this.labelId || undefined,
    })
  }

  protected override render() {
    const props = this.model.contracts.getLandmarkProps()

    return html`
      <section
        role=${props.role}
        aria-label=${props['aria-label'] ?? nothing}
        aria-labelledby=${props['aria-labelledby'] ?? nothing}
        part="base"
      >
        <slot></slot>
      </section>
    `
  }
}
