import {createBadge, type BadgeModel, type BadgeVariant, type BadgeSize} from '@chromvoid/headless-ui'
import {css, html, nothing} from 'lit'
import type {PropertyValues} from 'lit'

import {ReatomLitElement} from '../reatom-lit/ReatomLitElement'

export class CVBadge extends ReatomLitElement {
  static elementName = 'cv-badge'

  static get properties() {
    return {
      variant: {type: String, reflect: true},
      size: {type: String, reflect: true},
      dot: {type: Boolean, reflect: true},
      pulse: {type: Boolean, reflect: true},
      pill: {type: Boolean, reflect: true},
      dynamic: {type: Boolean, reflect: true},
      decorative: {type: Boolean, reflect: true},
      _ariaLabel: {type: String, attribute: 'aria-label', reflect: false},
    }
  }

  declare variant: BadgeVariant
  declare size: BadgeSize
  declare dot: boolean
  declare pulse: boolean
  declare pill: boolean
  declare dynamic: boolean
  declare decorative: boolean
  declare _ariaLabel: string | null

  private model: BadgeModel

  constructor() {
    super()
    this.variant = 'neutral'
    this.size = 'medium'
    this.dot = false
    this.pulse = false
    this.pill = false
    this.dynamic = false
    this.decorative = false
    this._ariaLabel = null
    this.model = this.createModel()
  }

  static styles = [
    css`
      :host {
        display: inline-block;
        --cv-badge-height: 24px;
        --cv-badge-padding-inline: var(--cv-space-2, 8px);
        --cv-badge-border-radius: var(--cv-radius-sm, 6px);
        --cv-badge-gap: var(--cv-space-1, 4px);
        --cv-badge-font-size: 12px;
        --cv-badge-dot-size: 8px;
      }

      [part='base'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--cv-badge-gap);
        padding-inline: var(--cv-badge-padding-inline);
        height: var(--cv-badge-height);
        font-size: var(--cv-badge-font-size);
        border-radius: var(--cv-badge-border-radius);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        color: var(--cv-color-text, #e8ecf6);
        user-select: none;
        white-space: nowrap;
        line-height: 1;
        box-sizing: border-box;
        transition:
          background var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease),
          border-color var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease),
          color var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease);
      }

      [part='label'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--cv-badge-gap);
      }

      [part='prefix'],
      [part='suffix'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      /* --- variant: neutral (default) --- */
      :host([variant='neutral']) [part='base'] {
        border-color: var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
      }

      /* --- variant: primary --- */
      :host([variant='primary']) [part='base'] {
        border-color: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 52%, var(--cv-color-border, #2a3245));
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 22%, var(--cv-color-surface, #141923));
      }

      /* --- variant: success --- */
      :host([variant='success']) [part='base'] {
        border-color: color-mix(in oklab, var(--cv-color-success, #5beba0) 52%, var(--cv-color-border, #2a3245));
        background: color-mix(in oklab, var(--cv-color-success, #5beba0) 22%, var(--cv-color-surface, #141923));
      }

      /* --- variant: warning --- */
      :host([variant='warning']) [part='base'] {
        border-color: color-mix(in oklab, var(--cv-color-warning, #ffc857) 52%, var(--cv-color-border, #2a3245));
        background: color-mix(in oklab, var(--cv-color-warning, #ffc857) 22%, var(--cv-color-surface, #141923));
      }

      /* --- variant: danger --- */
      :host([variant='danger']) [part='base'] {
        border-color: color-mix(in oklab, var(--cv-color-danger, #ff7d86) 52%, var(--cv-color-border, #2a3245));
        background: color-mix(in oklab, var(--cv-color-danger, #ff7d86) 22%, var(--cv-color-surface, #141923));
      }

      /* --- pill modifier --- */
      :host([pill]) {
        --cv-badge-border-radius: 999px;
      }

      /* --- dot mode --- */
      :host([dot]) [part='base'] {
        padding: 0;
        width: var(--cv-badge-dot-size);
        height: var(--cv-badge-dot-size);
        min-width: var(--cv-badge-dot-size);
        min-height: var(--cv-badge-dot-size);
        border-radius: 999px;
      }

      :host([dot]) [part='label'],
      :host([dot]) [part='prefix'],
      :host([dot]) [part='suffix'] {
        display: none;
      }

      /* --- dot variant colors --- */
      :host([dot][variant='neutral']) [part='base'] {
        background: var(--cv-color-border, #2a3245);
        border-color: var(--cv-color-border, #2a3245);
      }

      :host([dot][variant='primary']) [part='base'] {
        background: var(--cv-color-primary, #65d7ff);
        border-color: var(--cv-color-primary, #65d7ff);
      }

      :host([dot][variant='success']) [part='base'] {
        background: var(--cv-color-success, #5beba0);
        border-color: var(--cv-color-success, #5beba0);
      }

      :host([dot][variant='warning']) [part='base'] {
        background: var(--cv-color-warning, #ffc857);
        border-color: var(--cv-color-warning, #ffc857);
      }

      :host([dot][variant='danger']) [part='base'] {
        background: var(--cv-color-danger, #ff7d86);
        border-color: var(--cv-color-danger, #ff7d86);
      }

      /* --- pulse animation --- */
      :host([pulse]) [part='base'] {
        animation: cv-badge-pulse 1.5s ease-in-out infinite;
      }

      @keyframes cv-badge-pulse {
        0%,
        100% {
          opacity: 1;
          transform: scale(1);
        }
        50% {
          opacity: 0.7;
          transform: scale(1.05);
        }
      }

      /* --- sizes --- */
      :host([size='small']) {
        --cv-badge-height: 20px;
        --cv-badge-padding-inline: var(--cv-space-1, 4px);
        --cv-badge-font-size: 11px;
        --cv-badge-dot-size: 6px;
      }

      :host([size='large']) {
        --cv-badge-height: 28px;
        --cv-badge-padding-inline: var(--cv-space-3, 12px);
        --cv-badge-font-size: 14px;
        --cv-badge-dot-size: 10px;
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
    if (changedProperties.has('size')) {
      this.model.actions.setSize(this.size)
    }
    if (changedProperties.has('dot')) {
      this.model.actions.setDot(this.dot)
    }
    if (changedProperties.has('pulse')) {
      this.model.actions.setPulse(this.pulse)
    }
    if (changedProperties.has('pill')) {
      this.model.actions.setPill(this.pill)
    }
    if (changedProperties.has('dynamic')) {
      this.model.actions.setDynamic(this.dynamic)
    }
    if (changedProperties.has('decorative')) {
      this.model.actions.setDecorative(this.decorative)
    }
  }

  private createModel(): BadgeModel {
    return createBadge({
      variant: this.variant,
      size: this.size,
      dot: this.dot,
      pulse: this.pulse,
      pill: this.pill,
      isDynamic: this.dynamic,
      isDecorative: this.decorative,
    })
  }

  protected override render() {
    const props = this.model.contracts.getBadgeProps()
    const isDot = this.dot
    const ariaLabel = this._ariaLabel ?? props['aria-label']

    return html`
      <div
        part="base"
        role=${props.role ?? nothing}
        aria-live=${props['aria-live'] ?? nothing}
        aria-atomic=${props['aria-atomic'] ?? nothing}
        aria-hidden=${props['aria-hidden'] ?? nothing}
        aria-label=${ariaLabel ?? nothing}
      >
        <span part="prefix" ?hidden=${isDot}><slot name="prefix"></slot></span>
        <span part="label" ?hidden=${isDot}><slot></slot></span>
        <span part="suffix" ?hidden=${isDot}><slot name="suffix"></slot></span>
      </div>
    `
  }
}
