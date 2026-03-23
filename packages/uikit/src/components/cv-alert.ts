import {createAlert, type AlertAriaLive, type AlertModel} from '@chromvoid/headless-ui'
import {css, html} from 'lit'
import type {PropertyValues} from 'lit'

import {ReatomLitElement} from '../reatom-lit/ReatomLitElement'

export interface CVAlertEventDetail {
  visible: boolean
  message: string
}

let cvAlertNonce = 0

export class CVAlert extends ReatomLitElement {
  static elementName = 'cv-alert'

  static get properties() {
    return {
      durationMs: {type: Number, attribute: 'duration-ms', reflect: true},
      ariaLive: {type: String, attribute: 'aria-live', reflect: true},
      atomic: {type: Boolean, attribute: 'aria-atomic', reflect: true},
    }
  }

  declare durationMs: number
  declare ariaLive: AlertAriaLive
  declare atomic: boolean

  private readonly idBase = `cv-alert-${++cvAlertNonce}`
  private model: AlertModel
  private currentVisible = false
  private currentMessage = ''

  constructor() {
    super()
    this.durationMs = 0
    this.ariaLive = 'assertive'
    this.atomic = true
    this.model = this.createModel()
  }

  static styles = [
    css`
      :host {
        display: block;
      }

      [part='base'] {
        display: grid;
        gap: var(--cv-alert-gap, var(--cv-space-2, 8px));
        padding:
          var(--cv-alert-padding-block, var(--cv-space-2, 8px))
          var(--cv-alert-padding-inline, var(--cv-space-3, 12px));
        border-radius: var(--cv-alert-radius, var(--cv-radius-sm, 6px));
        border: 1px solid var(--cv-alert-border-color, var(--cv-color-border, #2a3245));
        background: var(--cv-alert-background, var(--cv-color-surface-elevated, #1d2432));
        color: var(--cv-alert-color, var(--cv-color-text, #e8ecf6));
        transition:
          opacity
          var(--cv-alert-transition-duration, var(--cv-duration-fast, 120ms))
          var(--cv-alert-transition-easing, var(--cv-easing-standard, ease)),
          transform
          var(--cv-alert-transition-duration, var(--cv-duration-fast, 120ms))
          var(--cv-alert-transition-easing, var(--cv-easing-standard, ease));
      }

      :host(:not([visible])) [part='base'] {
        opacity: 0;
        transform: translateY(var(--cv-alert-hidden-translate-y, -2px));
        pointer-events: none;
      }

      [part='message']:empty {
        display: none;
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
    this.syncFromModel(false)
  }

  override willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties)

    if (
      changedProperties.has('durationMs') ||
      changedProperties.has('ariaLive') ||
      changedProperties.has('atomic')
    ) {
      const state = this.captureState()
      this.model = this.createModel(state.message, state.visible)
      this.syncFromModel(false)
    }
  }

  override updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties)

    if (changedProperties.has('durationMs') || changedProperties.has('ariaLive') || changedProperties.has('atomic')) {
      return
    }

    this.syncFromModel(true)
  }

  show(message: string): void {
    this.model.actions.show(message)
    this.syncFromModel(true)
  }

  hide(): void {
    this.model.actions.hide()
    this.syncFromModel(true)
  }

  private createModel(initialMessage = '', initialVisible = false): AlertModel {
    return createAlert({
      idBase: this.idBase,
      ariaLive: this.ariaLive,
      ariaAtomic: this.atomic,
      durationMs: this.durationMs > 0 ? this.durationMs : undefined,
      initialMessage,
      initialVisible,
    })
  }

  private captureState(): CVAlertEventDetail {
    return {
      visible: this.model.state.isVisible(),
      message: this.model.state.message(),
    }
  }

  private dispatchInput(detail: CVAlertEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-input', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private dispatchChange(detail: CVAlertEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-change', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private syncFromModel(emitEvents: boolean): void {
    const next = this.captureState()
    const visibleChanged = this.currentVisible !== next.visible
    const messageChanged = this.currentMessage !== next.message

    this.currentVisible = next.visible
    this.currentMessage = next.message
    this.toggleAttribute('visible', next.visible)

    if (!emitEvents || (!visibleChanged && !messageChanged)) return

    this.dispatchInput(next)
    if (visibleChanged) {
      this.dispatchChange(next)
    }
  }

  protected override render() {
    const alertProps = this.model.contracts.getAlertProps()
    const isVisible = this.model.state.isVisible()
    const message = this.model.state.message()

    return html`
      <div
        id=${alertProps.id}
        role=${alertProps.role}
        aria-live=${alertProps['aria-live']}
        aria-atomic=${alertProps['aria-atomic']}
        data-visible=${isVisible ? 'true' : 'false'}
        part="base"
      >
        <div part="message">${message}</div>
        <slot></slot>
      </div>
    `
  }
}
