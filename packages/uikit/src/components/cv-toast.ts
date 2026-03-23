import type {ToastAction, ToastLevel} from '@chromvoid/headless-ui'
import {css, html, nothing} from 'lit'

import {ReatomLitElement} from '../reatom-lit/ReatomLitElement'
import {CVIcon} from './cv-icon'
import {CVSpinner} from './cv-spinner'

export interface CVToastCloseDetail {
  id: string
}

export type CVToastCloseEvent = CustomEvent<CVToastCloseDetail>

export class CVToast extends ReatomLitElement {
  static elementName = 'cv-toast'

  static get properties() {
    return {
      level: {type: String, reflect: true},
      closable: {type: Boolean, reflect: true},
      toastId: {type: String, attribute: 'toast-id'},
      title: {type: String},
      message: {type: String},
      iconName: {type: String, attribute: 'icon'},
      progress: {type: Boolean, reflect: true},
      paused: {type: Boolean, reflect: true},
      durationMs: {type: Number, attribute: false},
      actions: {attribute: false},
    }
  }

  declare level: ToastLevel
  declare closable: boolean
  declare toastId: string
  declare title: string
  declare message: string
  declare iconName: string
  declare progress: boolean
  declare paused: boolean
  declare durationMs: number
  declare actions: readonly ToastAction[]

  constructor() {
    super()
    this.level = 'info'
    this.closable = true
    this.toastId = ''
    this.title = ''
    this.message = ''
    this.iconName = ''
    this.progress = false
    this.paused = false
    this.durationMs = 5000
    this.actions = []
  }

  static styles = [
    css`
      :host {
        display: block;
      }

      [part='base'] {
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: start;
        gap: var(--cv-toast-gap, var(--cv-space-2, 8px));
        padding: var(--cv-toast-padding-block, var(--cv-space-3, 12px))
          var(--cv-toast-padding-inline, var(--cv-space-4, 16px));
        border-radius: var(--cv-toast-border-radius, var(--cv-radius-md, 10px));
        border: 1px solid var(--cv-toast-border-color, var(--cv-color-border, #2a3245));
        background: var(--cv-toast-background, var(--cv-color-surface-elevated, #1d2432));
        box-shadow: var(--cv-toast-shadow, var(--cv-shadow-1, 0 2px 8px rgba(0, 0, 0, 0.24)));
        color: var(--cv-toast-color, var(--cv-color-text, #e8ecf6));
        position: relative;
        overflow: hidden;
      }

      [part='base'][data-level='success'] {
        border-color: color-mix(
          in oklab,
          var(--cv-color-success, #6ef7c8) 45%,
          var(--cv-color-border, #2a3245)
        );
      }

      [part='base'][data-level='warning'] {
        border-color: color-mix(
          in oklab,
          var(--cv-color-warning, #ffd36e) 45%,
          var(--cv-color-border, #2a3245)
        );
      }

      [part='base'][data-level='error'] {
        border-color: color-mix(
          in oklab,
          var(--cv-color-danger, #ff7d86) 45%,
          var(--cv-color-border, #2a3245)
        );
      }

      [part='base'][data-level='loading'] {
        border-color: color-mix(
          in oklab,
          var(--cv-color-primary, #65d7ff) 40%,
          var(--cv-color-border, #2a3245)
        );
      }

      [part='icon-wrap'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--cv-toast-accent, var(--cv-color-primary, #65d7ff));
        margin-top: 1px;
      }

      [part='base'][data-level='success'] [part='icon-wrap'] {
        --cv-toast-accent: var(--cv-color-success, #6ef7c8);
      }

      [part='base'][data-level='warning'] [part='icon-wrap'] {
        --cv-toast-accent: var(--cv-color-warning, #ffd36e);
      }

      [part='base'][data-level='error'] [part='icon-wrap'] {
        --cv-toast-accent: var(--cv-color-danger, #ff7d86);
      }

      [part='content'] {
        display: grid;
        gap: var(--cv-space-1, 4px);
        min-inline-size: 0;
      }

      [part='title'] {
        font-size: var(--cv-font-size-sm, 0.875rem);
        font-weight: var(--cv-font-weight-semibold, 600);
        color: var(--cv-color-text, #e8ecf6);
      }

      [part='dismiss'] {
        border: 1px solid transparent;
        border-radius: var(--cv-radius-sm, 6px);
        background: transparent;
        color: var(--cv-color-text-muted, #9aa6bf);
        cursor: pointer;
        padding: 0 var(--cv-space-2, 8px);
      }

      [part='dismiss']:hover {
        color: var(--cv-color-text, #e8ecf6);
        border-color: var(--cv-color-border, #2a3245);
      }

      [part='dismiss']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      [part='label'] {
        color: var(--cv-color-text-muted, #9aa6bf);
        line-height: 1.45;
        word-break: break-word;
      }

      [part='actions'] {
        display: flex;
        flex-wrap: wrap;
        gap: var(--cv-space-2, 8px);
        margin-top: var(--cv-space-1, 4px);
      }

      [part='action'] {
        border: 1px solid var(--cv-color-border, #2a3245);
        background: color-mix(in oklab, var(--cv-color-surface-elevated, #1d2432) 88%, white 4%);
        color: var(--cv-color-text, #e8ecf6);
        font: inherit;
        font-size: var(--cv-font-size-xs, 0.75rem);
        font-weight: var(--cv-font-weight-semibold, 600);
        padding: 4px 10px;
        border-radius: var(--cv-radius-sm, 6px);
        cursor: pointer;
      }

      [part='action']:hover {
        border-color: var(--cv-color-primary, #65d7ff);
        color: var(--cv-color-primary, #65d7ff);
      }

      [part='action']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 2px;
      }

      [part='progress'] {
        position: absolute;
        inset-inline: 0;
        inset-block-end: 0;
        block-size: var(--cv-toast-progress-height, 3px);
        background: linear-gradient(
          90deg,
          var(--cv-toast-accent, var(--cv-color-primary, #65d7ff)) 0%,
          color-mix(in oklab, var(--cv-toast-accent, var(--cv-color-primary, #65d7ff)) 70%, white) 100%
        );
        transform-origin: left center;
      }

      :host([progress]) [part='progress'] {
        animation: cv-toast-progress var(--cv-toast-progress-duration, 5000ms) linear forwards;
        animation-play-state: var(--cv-toast-progress-play-state, running);
        opacity: 0.85;
      }

      :host([paused]) {
        --cv-toast-progress-play-state: paused;
      }

      cv-spinner {
        --cv-spinner-size: 18px;
        --cv-spinner-track-width: 2px;
        color: currentColor;
      }

      cv-icon,
      ::slotted([slot='icon']) {
        inline-size: 18px;
        block-size: 18px;
      }

      @keyframes cv-toast-progress {
        from {
          transform: scaleX(1);
        }
        to {
          transform: scaleX(0);
        }
      }
    `,
  ]

  static define() {
    CVIcon.define()
    CVSpinner.define()
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  private getRole(): 'status' | 'alert' {
    return this.level === 'warning' || this.level === 'error' ? 'alert' : 'status'
  }

  private handleDismiss() {
    this.dispatchEvent(
      new CustomEvent<CVToastCloseEvent['detail']>('cv-close', {
        detail: {id: this.toastId},
        bubbles: true,
        composed: true,
      }),
    )
  }

  private handleActionClick(event: Event) {
    const button = event.currentTarget as HTMLButtonElement | null
    if (!button) return

    const index = Number(button.dataset['actionIndex'])
    const action = this.actions[index]
    action?.onClick?.()
  }

  override updated(changedProperties: Map<string, unknown>): void {
    super.updated(changedProperties)

    if (changedProperties.has('durationMs')) {
      this.style.setProperty('--cv-toast-progress-duration', `${Math.max(this.durationMs, 0)}ms`)
    }
  }

  private renderFallbackIcon() {
    if (this.level === 'loading') {
      return html`<cv-spinner label="Loading"></cv-spinner>`
    }

    if (this.iconName) {
      return html`<cv-icon name=${this.iconName} aria-hidden="true"></cv-icon>`
    }

    return nothing
  }

  protected override render() {
    const role = this.getRole()
    const hasActions = this.actions.length > 0
    const hasTitle = this.title.length > 0
    const hasMessage = this.message.length > 0

    return html`
      <div part="base" role=${role} data-level=${this.level}>
        <span part="icon-wrap"><slot name="icon">${this.renderFallbackIcon()}</slot></span>
        <div part="content">
          ${hasTitle ? html`<span part="title">${this.title}</span>` : nothing}
          <span part="label">${hasMessage ? this.message : html`<slot></slot>`}</span>
          ${hasActions
            ? html`
                <div part="actions">
                  ${this.actions.map(
                    (action, index) => html`
                      <button
                        part="action"
                        type="button"
                        data-action-index=${String(index)}
                        @click=${this.handleActionClick}
                      >
                        ${action.label}
                      </button>
                    `,
                  )}
                </div>
              `
            : nothing}
        </div>
        ${this.closable
          ? html`
              <button
                part="dismiss"
                type="button"
                role="button"
                tabindex="0"
                aria-label="Dismiss notification"
                @click=${this.handleDismiss}
              >
                ×
              </button>
            `
          : nothing}
        ${this.progress && this.durationMs > 0 ? html`<span part="progress"></span>` : nothing}
      </div>
    `
  }
}
