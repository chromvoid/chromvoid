import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {CVBottomSheet} from '@chromvoid/uikit/components/cv-bottom-sheet'
import {CVDialog} from '@chromvoid/uikit/components/cv-dialog'
import {atom} from '@reatom/core'
import {css, type TemplateResult} from 'lit'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {i18n} from 'root/i18n'
import {tryGetAppContext} from 'root/shared/services/app-context'
import type {InputDialogOptions} from './dialog-types.js'
import {
  disablePasswordInputDialogKeyboardStabilization,
  enablePasswordInputDialogKeyboardStabilization,
  PASSWORD_INPUT_DIALOG_PROVISIONAL_KEYBOARD_OFFSET,
} from './mobile-dialog-keyboard-stabilization'

let inputDialogId = 0

export class CvInputDialog extends ReatomLitElement {
  static define() {
    CVBottomSheet.define()
    CVDialog.define()
    if (!customElements.get('cv-input-dialog')) {
      customElements.define('cv-input-dialog', this)
    }
  }

  static styles = [
    css`
      :host {
        display: contents;
      }

      :is(cv-dialog, cv-bottom-sheet) {
        --cv-dialog-width: var(--cv-dialog-width-m);
      }

      :is(cv-dialog, cv-bottom-sheet).size-s {
        --cv-dialog-width: var(--cv-dialog-width-s);
      }

      :is(cv-dialog, cv-bottom-sheet).size-l {
        --cv-dialog-width: var(--cv-dialog-width-l);
      }

      :is(cv-dialog, cv-bottom-sheet).size-xl {
        --cv-dialog-width: var(--cv-dialog-width-xl);
      }

      :is(cv-dialog, cv-bottom-sheet)::part(trigger) {
        display: none;
      }

      :is(cv-dialog, cv-bottom-sheet)::part(content) {
        gap: 0;
        padding: 0;
        overflow: hidden;
      }

      cv-bottom-sheet.password-input-dialog {
        --cv-bottom-sheet-keyboard-inset: var(
          --password-input-dialog-keyboard-offset,
          var(--mobile-keyboard-overlay-offset, 0px)
        );
      }

      :is(cv-dialog, cv-bottom-sheet)::part(body) {
        padding: 0;
      }

      :is(cv-dialog, cv-bottom-sheet)::part(footer) {
        display: block;
        padding: 0;
      }

      :is(cv-dialog, cv-bottom-sheet)::part(header) {
        padding: var(--app-spacing-4, 1rem) var(--app-spacing-5, 1.25rem) 0;
      }

      :is(cv-dialog, cv-bottom-sheet)::part(title) {
        margin: 0;
        color: var(--cv-color-text);
      }

      :is(cv-dialog, cv-bottom-sheet)::part(description) {
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
        background: var(--cv-color-surface-2);
      }

      .help-text {
        font-size: var(--cv-font-size-sm, 0.875rem);
        color: var(--cv-color-text-muted);
        margin-top: var(--app-spacing-2, 0.5rem);
        line-height: var(--line-height-normal, 1.5);
      }

      .error-text {
        font-size: var(--cv-font-size-sm, 0.875rem);
        color: var(--cv-color-danger);
        background: var(--cv-color-danger-surface);
        border: 1px solid var(--cv-color-danger-border);
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
        color: var(--cv-color-text-muted);
        text-align: right;
        margin-top: var(--app-spacing-1, 0.25rem);
        padding: var(--app-spacing-1, 0.25rem) var(--app-spacing-2, 0.5rem);
        border-radius: var(--cv-radius-1, 4px);
        background: var(--cv-color-surface-2);
      }

      .character-count.warning {
        color: var(--cv-color-warning);
        background: var(--cv-color-warning-surface);
      }

      .character-count.error {
        color: var(--cv-color-danger);
        background: var(--cv-color-danger-surface);
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
  private inputValue = atom('')
  private error = atom<string | null>(null)
  private isOpen = atom(false)

  private _resolve?: (value: string | null) => void
  private _result: string | null = null
  private shown = false
  private closing = false
  private closeTimer: number | null = null
  private focusTimer: number | null = null
  private focusRaf: number | null = null
  private inputFocusAttemptedForOpen = false

  private get isPasswordDialog() {
    return this.opts.type === 'password'
  }

  configure(options: InputDialogOptions) {
    this.opts = options
    this.inputValue.set(options.value || '')
  }

  show(): Promise<string | null> {
    return new Promise((resolve) => {
      this.shown = false
      this.closing = false
      this._result = null
      this._resolve = resolve
      this.inputFocusAttemptedForOpen = false
      if (this.isPasswordDialog) {
        enablePasswordInputDialogKeyboardStabilization({
          initialKeyboardOffset: this.shouldUsePasswordInputProvisionalKeyboardOffset()
            ? PASSWORD_INPUT_DIALOG_PROVISIONAL_KEYBOARD_OFFSET
            : undefined,
        })
      }
      this.updateComplete.then(() => {
        this.isOpen.set(true)
      })
    })
  }

  close(result: string | null = null) {
    this.clearPendingInputFocus()
    this.inputFocusAttemptedForOpen = false
    const nextResult = result === null && this._result !== null ? this._result : result
    this._result = nextResult
    this.closing = true
    if (!this.isOpen() && !this.shown) {
      this.isOpen.set(false)
      this.closing = false
      this._resolve?.(this._result)
      this._resolve = undefined
      if (this.isPasswordDialog) {
        disablePasswordInputDialogKeyboardStabilization()
      }
      return
    }

    if (this.closeTimer !== null) {
      window.clearTimeout(this.closeTimer)
    }

    const active = this.getDeepActiveElement()
    if (active && this.renderRoot.contains(active) && typeof active.blur === 'function') {
      active.blur()
    }

    // Give Android WebView/IME one turn to detach from the focused password field
    // before the dialog subtree is removed. Closing synchronously can crash Chromium.
    this.closeTimer = window.setTimeout(() => {
      this.closeTimer = null
      this.isOpen.set(false)
    }, 32)
  }

  disconnectedCallback(): void {
    this.clearPendingInputFocus()
    if (this.closeTimer !== null) {
      window.clearTimeout(this.closeTimer)
      this.closeTimer = null
    }
    if (this.isPasswordDialog) {
      disablePasswordInputDialogKeyboardStabilization()
    }
    super.disconnectedCallback()
  }

  private getDeepActiveElement(): HTMLElement | null {
    let active: Element | null = document.activeElement
    while (active instanceof HTMLElement && active.shadowRoot?.activeElement) {
      active = active.shadowRoot.activeElement
    }
    return active instanceof HTMLElement ? active : null
  }

  private clearPendingInputFocus(): void {
    if (this.focusRaf !== null) {
      window.cancelAnimationFrame(this.focusRaf)
      this.focusRaf = null
    }

    if (this.focusTimer !== null) {
      window.clearTimeout(this.focusTimer)
      this.focusTimer = null
    }
  }

  private scheduleInputFocus(input: HTMLElement, options: {requireShown?: boolean} = {}): void {
    const requireShown = options.requireShown ?? true
    this.clearPendingInputFocus()
    this.focusRaf = window.requestAnimationFrame(() => {
      this.focusRaf = null
      this.focusTimer = window.setTimeout(() => {
        this.focusTimer = null
        if ((requireShown && !this.shown) || !this.isOpen() || !input.isConnected) return

        this.inputFocusAttemptedForOpen = true
        try {
          input.focus({preventScroll: true})
        } catch {
          input.focus()
        }
      }, 50)
    })
  }

  private validate(value: string): string | null {
    if (this.opts.required && value.trim().length === 0) {
      return i18n('dialogs:field-required' as any)
    }
    if (this.opts.validator) {
      const result = this.opts.validator(value)
      if (typeof result === 'string') return result
      if (result !== null && typeof result === 'object' && !result.valid) {
        return result.message || i18n('dialogs:validation-error' as any)
      }
    }
    return null
  }

  private handleConfirm() {
    const err = this.validate(this.inputValue())
    if (err) {
      this.error.set(err)
      return
    }
    this.close(this.inputValue().trim())
  }

  private handleCancel() {
    this.close(null)
  }

  private handleInput(e: Event) {
    const event = e as CustomEvent<{value?: string}>
    const target = e.target as {value?: string} | null
    const val = event.detail?.value ?? target?.value ?? ''
    this.inputValue.set(val)
    // Do not validate prior to dialog display – cv-input can fire an event upon initialization
    if (this.shown) {
      this.error.set(this.validate(val))
    }
  }

  private handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      this.handleConfirm()
    }
  }

  private isMobileLayout(): boolean {
    return tryGetAppContext()?.store.layoutMode?.() === 'mobile'
  }

  private shouldFocusPasswordInputDuringShow(): boolean {
    return this.opts.type === 'password' && this.isMobileLayout()
  }

  private shouldProgrammaticallyFocusInputDuringShow(): boolean {
    return !this.shouldFocusPasswordInputDuringShow() || !this.inputFocusAttemptedForOpen
  }

  private shouldUsePasswordInputProvisionalKeyboardOffset(): boolean {
    if (!this.shouldFocusPasswordInputDuringShow()) return false
    const capabilities = getRuntimeCapabilities()
    return !(capabilities.platform === 'android' && capabilities.mobile)
  }

  private handleShow() {
    if (this.closing || !this.isOpen()) return

    const input = this.renderRoot.querySelector('cv-input') as HTMLElement | null
    if (input && this.shouldProgrammaticallyFocusInputDuringShow()) {
      this.scheduleInputFocus(input, {requireShown: false})
    }
  }

  private handleAfterShow() {
    if (this.closing || !this.isOpen()) return
    this.shown = true
    const input = this.renderRoot.querySelector('cv-input') as HTMLElement | null
    if (
      input &&
      this.shouldProgrammaticallyFocusInputDuringShow() &&
      (!this.shouldFocusPasswordInputDuringShow() || !this.inputFocusAttemptedForOpen)
    ) {
      this.scheduleInputFocus(input)
    }
    this.dispatchEvent(new Event('cv-after-show', {bubbles: true}))
  }

  private handleAfterHide() {
    if (!this.shown && !this.closing) return
    this.shown = false
    this.closing = false
    this.inputFocusAttemptedForOpen = false
    this._resolve?.(this._result)
    this._resolve = undefined
    this.dispatchEvent(new Event('cv-after-hide', {bubbles: true}))
    if (this.isPasswordDialog) {
      disablePasswordInputDialogKeyboardStabilization()
    }
  }

  private handleDialogChange(e: CustomEvent<{open?: boolean}>) {
    if (e.target !== e.currentTarget) return
    if (typeof e.detail?.open !== 'boolean') return
    if (e.detail.open || !this.isOpen()) return
    if (this._result !== null) return
    this.close(null)
  }

  private renderSurfaceContent(
    opts: InputDialogOptions,
    value: string,
    error: string | null,
    maxLength: number | undefined,
    isNearLimit: boolean,
    isOverLimit: boolean,
  ): TemplateResult {
    return html`
      <span slot="title">${opts.title || i18n('dialogs:input-title' as any)}</span>
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
        <cv-button variant="default" @click=${this.handleCancel}
          >${opts.cancelText || i18n('button:cancel' as any)}</cv-button
        >
        <cv-button variant="primary" @click=${this.handleConfirm}
          >${opts.confirmText || i18n('button:ok' as any)}</cv-button
        >
      </div>
    `
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
    const className = `size-${size}${opts.type === 'password' ? ' password-input-dialog' : ''}`
    const content = this.renderSurfaceContent(opts, value, error, maxLength, isNearLimit, isOverLimit)

    if (this.isMobileLayout()) {
      return html`
        <cv-bottom-sheet
          class=${className}
          .open=${this.isOpen()}
          .noHeader=${opts.noHeader ?? false}
          .closable=${closable}
          .closeOnEscape=${closable}
          .closeOnOutsidePointer=${closable}
          .closeOnOutsideFocus=${false}
          .showHandle=${false}
          .dragToClose=${false}
          @cv-change=${this.handleDialogChange}
          @cv-show=${this.handleShow}
          @cv-after-hide=${this.handleAfterHide}
          @cv-after-show=${this.handleAfterShow}
        >
          ${content}
        </cv-bottom-sheet>
      `
    }

    return html`
      <cv-dialog
        class=${className}
        .open=${this.isOpen()}
        .noHeader=${opts.noHeader ?? false}
        .closable=${closable}
        .closeOnEscape=${closable}
        .closeOnOutsidePointer=${closable}
        .closeOnOutsideFocus=${false}
        @cv-change=${this.handleDialogChange}
        @cv-show=${this.handleShow}
        @cv-after-hide=${this.handleAfterHide}
        @cv-after-show=${this.handleAfterShow}
      >
        ${content}
      </cv-dialog>
    `
  }
}
