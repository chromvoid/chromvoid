import {createCallout, type CalloutModel, type CalloutVariant} from '@chromvoid/headless-ui'
import {css, html, nothing} from 'lit'
import type {PropertyValues} from 'lit'

import {ReatomLitElement} from '../reatom-lit/ReatomLitElement'

let cvCalloutNonce = 0

export class CVCallout extends ReatomLitElement {
  static elementName = 'cv-callout'

  static get properties() {
    return {
      variant: {type: String, reflect: true},
      closable: {type: Boolean, reflect: true},
      open: {type: Boolean, reflect: true},
    }
  }

  declare variant: CalloutVariant
  declare closable: boolean
  declare open: boolean

  private readonly idBase = `cv-callout-${++cvCalloutNonce}`
  private model: CalloutModel

  constructor() {
    super()
    this.variant = 'info'
    this.closable = false
    this.open = true
    this.model = createCallout({
      idBase: this.idBase,
      variant: this.variant,
      closable: this.closable,
      open: this.open,
    })
  }

  static styles = [
    css`
      :host {
        display: block;
      }

      :host(:not([open])) {
        display: none;
      }

      [part='base'] {
        display: flex;
        align-items: flex-start;
        gap: var(--cv-callout-gap, var(--cv-space-2, 8px));
        padding:
          var(--cv-callout-padding-block, var(--cv-space-3, 12px))
          var(--cv-callout-padding-inline, var(--cv-space-3, 12px));
        border-radius: var(--cv-callout-border-radius, var(--cv-radius-sm, 6px));
        border: 1px solid var(--cv-callout-border-color, var(--cv-color-border, #2a3245));
        background: var(--cv-callout-background, var(--cv-color-surface-elevated, #1d2432));
        color: var(--cv-callout-color, var(--cv-color-text, #e8ecf6));
        font-size: var(--cv-callout-font-size, var(--cv-font-size-base, 14px));
        transition:
          opacity
          var(--cv-callout-transition-duration, var(--cv-duration-fast, 120ms))
          var(--cv-callout-transition-easing, var(--cv-easing-standard, ease)),
          transform
          var(--cv-callout-transition-duration, var(--cv-duration-fast, 120ms))
          var(--cv-callout-transition-easing, var(--cv-easing-standard, ease));
      }

      [part='icon'] {
        display: inline-flex;
        align-items: center;
        color: var(--cv-callout-icon-color, currentColor);
      }

      [part='message'] {
        flex: 1;
      }

      [part='close-button'] {
        appearance: none;
        background: none;
        border: none;
        padding: 0;
        margin: 0;
        cursor: pointer;
        color: inherit;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      /* --- variant: info (default) --- */
      :host([variant='info']) [part='base'] {
        border-color: color-mix(in oklab, var(--cv-color-info, #65d7ff) 52%, var(--cv-color-border, #2a3245));
        background: color-mix(in oklab, var(--cv-color-info, #65d7ff) 12%, var(--cv-color-surface-elevated, #1d2432));
      }

      :host([variant='info']) [part='icon'] {
        color: var(--cv-color-info, #65d7ff);
      }

      /* --- variant: success --- */
      :host([variant='success']) [part='base'] {
        border-color: color-mix(in oklab, var(--cv-color-success, #5beba0) 52%, var(--cv-color-border, #2a3245));
        background: color-mix(in oklab, var(--cv-color-success, #5beba0) 12%, var(--cv-color-surface-elevated, #1d2432));
      }

      :host([variant='success']) [part='icon'] {
        color: var(--cv-color-success, #5beba0);
      }

      /* --- variant: warning --- */
      :host([variant='warning']) [part='base'] {
        border-color: color-mix(in oklab, var(--cv-color-warning, #ffc857) 52%, var(--cv-color-border, #2a3245));
        background: color-mix(in oklab, var(--cv-color-warning, #ffc857) 12%, var(--cv-color-surface-elevated, #1d2432));
      }

      :host([variant='warning']) [part='icon'] {
        color: var(--cv-color-warning, #ffc857);
      }

      /* --- variant: danger --- */
      :host([variant='danger']) [part='base'] {
        border-color: color-mix(in oklab, var(--cv-color-danger, #ff7d86) 52%, var(--cv-color-border, #2a3245));
        background: color-mix(in oklab, var(--cv-color-danger, #ff7d86) 12%, var(--cv-color-surface-elevated, #1d2432));
      }

      :host([variant='danger']) [part='icon'] {
        color: var(--cv-color-danger, #ff7d86);
      }

      /* --- variant: neutral --- */
      :host([variant='neutral']) [part='base'] {
        border-color: var(--cv-callout-border-color, var(--cv-color-border, #2a3245));
        background: var(--cv-callout-background, var(--cv-color-surface-elevated, #1d2432));
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

    if (changedProperties.has('variant')) {
      this.model.actions.setVariant(this.variant)
    }
    if (changedProperties.has('closable')) {
      this.model.actions.setClosable(this.closable)
    }
    if (changedProperties.has('open')) {
      if (this.open) {
        this.model.actions.show()
      } else {
        // Only close via headless if closable, otherwise directly set state
        if (this.model.state.closable()) {
          this.model.actions.close()
        }
      }
    }
  }

  private handleClose(): void {
    this.model.actions.close()
    const isOpen = this.model.state.open()
    if (!isOpen && this.open) {
      this.open = false
      this.dispatchEvent(
        new CustomEvent('cv-close', {
          bubbles: true,
          composed: true,
        }),
      )
    }
  }

  protected override render() {
    const calloutProps = this.model.contracts.getCalloutProps()
    const closable = this.model.state.closable()

    return html`
      <div
        id=${calloutProps.id}
        role=${calloutProps.role}
        data-variant=${calloutProps['data-variant']}
        part="base"
      >
        <span part="icon"><slot name="icon"></slot></span>
        <span part="message"><slot></slot></span>
        ${closable ? this.renderCloseButton() : nothing}
      </div>
    `
  }

  private renderCloseButton() {
    const closeProps = this.model.contracts.getCloseButtonProps()
    return html`
      <button
        id=${closeProps.id}
        part="close-button"
        role=${closeProps.role}
        tabindex=${closeProps.tabindex}
        aria-label=${closeProps['aria-label']}
        @click=${() => this.handleClose()}
      >
        &#x2715;
      </button>
    `
  }
}
