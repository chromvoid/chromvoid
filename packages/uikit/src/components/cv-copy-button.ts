import {createCopyButton, type CopyButtonModel, type CopyButtonValue} from '@chromvoid/headless-ui'
import {css, html, nothing} from 'lit'
import type {PropertyValues} from 'lit'

import {ReatomLitElement} from '../reatom-lit/ReatomLitElement'

type CVCopyButtonSize = 'small' | 'medium' | 'large'

export interface CVCopyButtonCopyDetail {
  value: string
}

export interface CVCopyButtonErrorDetail {
  error: unknown
}

export type CVCopyButtonCopyEvent = CustomEvent<CVCopyButtonCopyDetail>
export type CVCopyButtonErrorEvent = CustomEvent<CVCopyButtonErrorDetail>

export interface CVCopyButtonEventMap {
  'cv-copy': CVCopyButtonCopyEvent
  'cv-error': CVCopyButtonErrorEvent
}

// Default SVG icons
const copyIcon = html`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`
const successIcon = html`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
const errorIcon = html`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`

export class CVCopyButton extends ReatomLitElement {
  static elementName = 'cv-copy-button'

  static get properties() {
    return {
      value: {attribute: false},
      disabled: {type: Boolean, reflect: true},
      feedbackDuration: {type: Number, reflect: true, attribute: 'feedback-duration'},
      size: {type: String, reflect: true},
    }
  }

  declare value: CopyButtonValue
  declare disabled: boolean
  declare feedbackDuration: number
  declare size: CVCopyButtonSize

  private __clipboard?: {writeText(text: string): Promise<void>}
  private model!: CopyButtonModel

  /** @internal Overridable clipboard adapter for testing */
  get _clipboard() {
    return this.__clipboard
  }

  set _clipboard(clip: {writeText(text: string): Promise<void>} | undefined) {
    this.__clipboard = clip
    this.model = this._createModel()
    this.requestUpdate()
  }

  constructor() {
    super()
    this.value = ''
    this.disabled = false
    this.feedbackDuration = 1500
    this.size = 'medium'
    this.model = this._createModel()
  }

  static styles = [
    css`
      :host {
        display: inline-block;
        --cv-copy-button-size: 36px;
        --cv-copy-button-border-radius: var(--cv-radius-sm, 6px);
        --cv-copy-button-success-color: var(--cv-color-success, #4ade80);
        --cv-copy-button-error-color: var(--cv-color-danger, #ff7d86);
      }

      [part='base'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--cv-copy-button-size);
        height: var(--cv-copy-button-size);
        border-radius: var(--cv-copy-button-border-radius);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        color: var(--cv-color-text, #e8ecf6);
        cursor: pointer;
        user-select: none;
        padding: 0;
        position: relative;
        transition:
          background var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease),
          border-color var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease),
          color var(--cv-duration-fast, 120ms) var(--cv-easing-standard, ease);
      }

      [part='base']:hover {
        border-color: var(--cv-color-primary, #65d7ff);
      }

      [part='base']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 2px;
      }

      [part='copy-icon'],
      [part='success-icon'],
      [part='error-icon'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        position: absolute;
        top: 0;
        left: 0;
      }

      [part='copy-icon'] svg,
      [part='success-icon'] svg,
      [part='error-icon'] svg,
      [part='copy-icon'] ::slotted(svg),
      [part='success-icon'] ::slotted(svg),
      [part='error-icon'] ::slotted(svg) {
        width: 50%;
        height: 50%;
      }

      [part='status'] {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border-width: 0;
      }

      /* --- disabled --- */
      :host([disabled]) {
        opacity: 0.55;
        cursor: not-allowed;
      }

      :host([disabled]) [part='base'] {
        cursor: not-allowed;
        pointer-events: none;
      }

      /* --- status: idle --- */
      :host([status='idle']) [part='success-icon'],
      :host([status='idle']) [part='error-icon'] {
        display: none;
      }

      /* --- status: success --- */
      :host([status='success']) [part='base'] {
        color: var(--cv-copy-button-success-color);
        border-color: var(--cv-copy-button-success-color);
      }

      :host([status='success']) [part='copy-icon'],
      :host([status='success']) [part='error-icon'] {
        display: none;
      }

      /* --- status: error --- */
      :host([status='error']) [part='base'] {
        color: var(--cv-copy-button-error-color);
        border-color: var(--cv-copy-button-error-color);
      }

      :host([status='error']) [part='copy-icon'],
      :host([status='error']) [part='success-icon'] {
        display: none;
      }

      /* --- copying --- */
      :host([copying]) {
        cursor: progress;
      }

      :host([copying]) [part='base'] {
        cursor: progress;
      }

      /* --- sizes --- */
      :host([size='small']) {
        --cv-copy-button-size: 30px;
      }

      :host([size='large']) {
        --cv-copy-button-size: 42px;
      }
    `,
  ]

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  private _createModel(): CopyButtonModel {
    return createCopyButton({
      value: this.value,
      isDisabled: this.disabled,
      feedbackDuration: this.feedbackDuration,
      clipboard: this.__clipboard,
      onCopy: (value: string) => {
        this.dispatchEvent(
          new CustomEvent<CVCopyButtonCopyEvent['detail']>('cv-copy', {
            detail: {value},
            bubbles: true,
            composed: true,
          }),
        )
      },
      onError: (error: unknown) => {
        this.dispatchEvent(
          new CustomEvent<CVCopyButtonErrorEvent['detail']>('cv-error', {
            detail: {error},
            bubbles: true,
            composed: true,
          }),
        )
      },
    })
  }

  override willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties)

    if (changedProperties.has('disabled')) {
      this.model.actions.setDisabled(this.disabled)
    }

    if (changedProperties.has('feedbackDuration')) {
      this.model.actions.setFeedbackDuration(this.feedbackDuration)
    }

    if (changedProperties.has('value')) {
      this.model.actions.setValue(this.value)
    }
  }

  private _syncHostAttributes(): void {
    const status = this.model.state.status()
    const isCopying = this.model.state.isCopying()

    // Reflect status attribute
    this.setAttribute('status', status)

    // Reflect copying attribute
    if (isCopying) {
      this.setAttribute('copying', '')
    } else {
      this.removeAttribute('copying')
    }
  }

  private handleClick(e: Event) {
    this.model.contracts.getButtonProps().onClick(e)
  }

  private handleKeyDown(e: KeyboardEvent) {
    this.model.contracts.getButtonProps().onKeyDown(e)
  }

  private handleKeyUp(e: KeyboardEvent) {
    this.model.contracts.getButtonProps().onKeyUp(e)
  }

  protected override render() {
    this._syncHostAttributes()

    const buttonProps = this.model.contracts.getButtonProps()
    const statusProps = this.model.contracts.getStatusProps()
    const copyIconProps = this.model.contracts.getIconContainerProps('copy')
    const successIconProps = this.model.contracts.getIconContainerProps('success')
    const errorIconProps = this.model.contracts.getIconContainerProps('error')

    const statusText = this.model.state.status()
    const statusAnnouncement =
      statusText === 'success' ? 'Copied' : statusText === 'error' ? 'Copy failed' : nothing

    return html`
      <div
        part="base"
        role=${buttonProps.role}
        tabindex=${buttonProps.tabindex}
        aria-disabled=${buttonProps['aria-disabled']}
        aria-label=${buttonProps['aria-label'] ?? nothing}
        @click=${this.handleClick}
        @keydown=${this.handleKeyDown}
        @keyup=${this.handleKeyUp}
      >
        <span
          part="copy-icon"
          aria-hidden=${copyIconProps['aria-hidden']}
          .hidden=${copyIconProps.hidden ?? false}
        >
          <slot name="copy-icon">${copyIcon}</slot>
        </span>
        <span
          part="success-icon"
          aria-hidden=${successIconProps['aria-hidden']}
          .hidden=${successIconProps.hidden ?? false}
        >
          <slot name="success-icon">${successIcon}</slot>
        </span>
        <span
          part="error-icon"
          aria-hidden=${errorIconProps['aria-hidden']}
          .hidden=${errorIconProps.hidden ?? false}
        >
          <slot name="error-icon">${errorIcon}</slot>
        </span>
        <span
          part="status"
          role=${statusProps.role}
          aria-live=${statusProps['aria-live']}
          aria-atomic=${statusProps['aria-atomic']}
        >${statusAnnouncement}</span>
      </div>
    `
  }
}
