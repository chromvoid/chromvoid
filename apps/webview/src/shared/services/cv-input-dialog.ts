import {XLitElement} from '@statx/lit'
import {state} from '@statx/core'
import {css, html} from 'lit'
import type {InputDialogOptions} from './dialog-types.js'

export class CvInputDialog extends XLitElement {
  static define() {
    if (!customElements.get('cv-input-dialog')) {
      customElements.define('cv-input-dialog', this)
    }
  }

  static styles = [
    css`
      :host {
        display: contents;
      }

      cv-dialog {
        --cv-color-surface-elevated: var(--cv-color-surface, #ffffff);
        --cv-color-border: var(--cv-color-border, var(--cv-alpha-black-10));
        --cv-color-text: var(--cv-color-text, #1f2937);
        --cv-color-text-muted: var(--cv-color-text-muted, #64748b);
        --cv-color-primary: var(--cv-color-primary, #6366f1);
        --cv-dialog-border-radius: var(--cv-radius-2, 12px);
        --cv-dialog-max-height: calc(100dvh - 32px);
        --cv-dialog-width: min(480px, calc(100vw - 32px));
        --cv-dialog-title-font-size: var(--cv-font-size-lg, 1.125rem);
      }

      cv-dialog.size-s {
        --cv-dialog-width: min(320px, calc(100vw - 32px));
      }

      cv-dialog.size-l {
        --cv-dialog-width: min(640px, calc(100vw - 32px));
      }

      cv-dialog.size-xl {
        --cv-dialog-width: min(800px, calc(100vw - 32px));
      }

      cv-dialog::part(trigger) {
        display: none;
      }

      cv-dialog::part(content) {
        gap: 0;
        padding: 0;
        overflow: hidden;
      }

      cv-dialog::part(body) {
        padding: 0;
      }

      cv-dialog::part(footer) {
        display: block;
        padding: 0;
      }

      cv-dialog::part(header) {
        padding: var(--app-spacing-4, 1rem) var(--app-spacing-5, 1.25rem) 0;
      }

      cv-dialog::part(title) {
        margin: 0;
        font-size: var(--cv-font-size-lg, 1.125rem);
        color: var(--cv-color-text, #1f2937);
      }

      cv-dialog::part(description) {
        display: none;
      }

      .dialog-body {
        padding: var(--app-spacing-5, 1.25rem);
        line-height: var(--line-height-relaxed, 1.625);
      }

      .dialog-body cv-input {
        display: block;
        inline-size: 100%;
      }

      .dialog-footer {
        box-sizing: border-box;
        display: flex;
        gap: var(--app-spacing-3, 0.75rem);
        justify-content: flex-end;
        padding: var(--app-spacing-4, 1rem) var(--app-spacing-5, 1.25rem);
        border-top: 1px solid var(--cv-color-border, var(--cv-alpha-black-10));
        background: var(--cv-color-surface-2, #f8fafc);
      }

      .help-text {
        font-size: var(--cv-font-size-sm, 0.875rem);
        color: var(--cv-color-text-muted, #64748b);
        margin-top: var(--app-spacing-2, 0.5rem);
        line-height: var(--line-height-normal, 1.5);
      }

      .error-text {
        font-size: var(--cv-font-size-sm, 0.875rem);
        color: var(--cv-color-danger, #ef4444);
        background: color-mix(in oklch, var(--cv-color-danger, #ef4444), transparent 92%);
        border: 1px solid color-mix(in oklch, var(--cv-color-danger, #ef4444), transparent 80%);
        border-radius: var(--cv-radius-1, 4px);
        padding: var(--app-spacing-2, 0.5rem) var(--app-spacing-3, 0.75rem);
        margin-top: var(--app-spacing-2, 0.5rem);
        display: flex;
        align-items: center;
        gap: var(--app-spacing-2, 0.5rem);
        animation: shake 0.3s ease-in-out;
      }

      .character-count {
        font-size: var(--cv-font-size-xs, 0.75rem);
        color: var(--cv-color-text-muted, #64748b);
        text-align: right;
        margin-top: var(--app-spacing-1, 0.25rem);
        padding: var(--app-spacing-1, 0.25rem) var(--app-spacing-2, 0.5rem);
        border-radius: var(--cv-radius-1, 4px);
        background: var(--cv-color-surface-2, #f8fafc);
      }

      .character-count.warning {
        color: var(--cv-color-warning, #f59e0b);
        background: color-mix(in oklch, var(--cv-color-warning, #f59e0b), transparent 92%);
      }

      .character-count.error {
        color: var(--cv-color-danger, #ef4444);
        background: color-mix(in oklch, var(--cv-color-danger, #ef4444), transparent 92%);
      }

      @keyframes shake {
        0%,
        100% {
          transform: translateX(0);
        }
        25% {
          transform: translateX(-4px);
        }
        75% {
          transform: translateX(4px);
        }
      }

      @media (max-width: 640px) {
        .dialog-footer {
          flex-direction: row;
          gap: var(--app-spacing-2, 0.5rem);
          width: 100%;
        }
        .dialog-footer cv-button {
          width: 100%;
        }
      }
    `,
  ]

  private opts: InputDialogOptions = {}
  private inputValue = state('')
  private error = state<string | null>(null)
  private isOpen = state(false)

  private _resolve?: (value: string | null) => void
  private _result: string | null = null
  private shown = false

  configure(options: InputDialogOptions) {
    this.opts = options
    this.inputValue.set(options.value || '')
  }

  show(): Promise<string | null> {
    return new Promise((resolve) => {
      this.shown = false
      this._result = null
      this._resolve = resolve
      this.updateComplete.then(() => this.isOpen.set(true))
    })
  }

  close(result: string | null = null) {
    this._result = result
    this.isOpen.set(false)
  }

  private validate(value: string): string | null {
    if (this.opts.required && value.trim().length === 0) {
      return 'Это поле обязательно для заполнения'
    }
    if (this.opts.validator) {
      const result = this.opts.validator(value)
      if (typeof result === 'string') return result
      if (result !== null && typeof result === 'object' && !result.valid) {
        return result.message || 'Ошибка валидации'
      }
    }
    return null
  }

  private handleConfirm = () => {
    // Синхронизируем с актуальным значением cv-input перед валидацией
    const input = this.renderRoot.querySelector('cv-input') as (HTMLElement & {value: string}) | null
    if (input) this.inputValue.set(input.value || '')

    const err = this.validate(this.inputValue())
    if (err) {
      this.error.set(err)
      return
    }
    this.close(this.inputValue().trim())
  }

  private handleCancel = () => this.close(null)

  private handleInput = (e: Event) => {
    const event = e as CustomEvent<{value?: string}>
    const target = e.target as {value?: string} | null
    const val = event.detail?.value ?? target?.value ?? ''
    this.inputValue.set(val)
    // Не валидируем до показа диалога — cv-input может стрелять событием при инициализации
    if (this.shown) {
      this.error.set(this.validate(val))
    }
  }

  private handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      this.handleConfirm()
    }
  }

  private handleAfterShow = () => {
    this.shown = true
    const input = this.renderRoot.querySelector('cv-input') as HTMLElement | null
    if (input) setTimeout(() => input.focus(), 50)
    this.dispatchEvent(new Event('cv-after-show', {bubbles: true}))
  }

  private handleAfterHide = () => {
    if (!this.shown) return
    this.shown = false
    this._resolve?.(this._result)
    this._resolve = undefined
    this.dispatchEvent(new Event('cv-after-hide', {bubbles: true}))
  }

  private handleDialogChange(e: CustomEvent<{open?: boolean}>) {
    if (e.target !== e.currentTarget) return
    if (typeof e.detail?.open !== 'boolean') return
    if (e.detail.open || !this.isOpen()) return
    this.close(null)
  }

  protected render() {
    const opts = this.opts
    const value = this.inputValue()
    const error = this.error()
    const maxLength = opts.maxLength
    const isNearLimit = maxLength ? value.length > maxLength * 0.8 : false
    const isOverLimit = maxLength ? value.length > maxLength : false
    const size = opts.size || 'm'
    const closable = opts.closable !== false

    return html`
      <cv-dialog
        class=${`size-${size}`}
        .open=${this.isOpen()}
        .noHeader=${opts.noHeader ?? false}
        .closable=${closable}
        .closeOnEscape=${closable}
        .closeOnOutsidePointer=${closable}
        .closeOnOutsideFocus=${closable}
        @cv-change=${this.handleDialogChange}
        @cv-after-hide=${this.handleAfterHide}
        @cv-after-show=${this.handleAfterShow}
      >
        <span slot="title">${opts.title || 'Ввод данных'}</span>
        <div class="dialog-body">
          <cv-input
            placeholder=${opts.placeholder || ''}
            .value=${value}
            type=${opts.type || 'text'}
            .passwordToggle=${opts.type === 'password'}
            ?required=${opts.required}
            maxlength=${maxLength || 255}
            @cv-input=${this.handleInput}
            @keydown=${this.handleKeydown}
          >
            ${opts.label ? html`<span slot="label">${opts.label}</span>` : ''}
          </cv-input>

          ${opts.helpText && !error ? html`<div class="help-text">${opts.helpText}</div>` : ''}
          ${error ? html`<div class="error-text">${error}</div>` : ''}
          ${maxLength
            ? html`
                <div class="character-count ${isNearLimit ? 'warning' : ''} ${isOverLimit ? 'error' : ''}">
                  ${value.length} / ${maxLength}
                </div>
              `
            : ''}
        </div>

        <div class="dialog-footer" slot="footer">
          <cv-button variant="default" @click=${this.handleCancel}>${opts.cancelText || 'Отмена'}</cv-button>
          <cv-button variant="primary" @click=${this.handleConfirm}>${opts.confirmText || 'ОК'}</cv-button>
        </div>
      </cv-dialog>
    `
  }
}
