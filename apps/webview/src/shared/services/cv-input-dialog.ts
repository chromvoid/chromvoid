import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {atom} from '@reatom/core'
import {css} from 'lit'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {i18n} from 'root/i18n'
import {tryGetAppContext} from 'root/shared/services/app-context'
import type {InputDialogOptions} from './dialog-types.js'
import {
  disablePasswordInputDialogDebug,
  enablePasswordInputDialogDebug,
  isPasswordInputDialogDebugActive,
  readElementDebugBox,
  readVisualViewportDebugSnapshot,
  writeMobileDialogDebug,
} from './mobile-dialog-debug'
import {
  disablePasswordInputDialogKeyboardStabilization,
  enablePasswordInputDialogKeyboardStabilization,
  PASSWORD_INPUT_DIALOG_PROVISIONAL_KEYBOARD_OFFSET,
} from './mobile-dialog-keyboard-stabilization'
import {AdaptiveModalSurface} from '../ui/adaptive-modal-surface.js'

export class CvInputDialog extends ReatomLitElement {
  static define() {
    AdaptiveModalSurface.define()
    if (!customElements.get('cv-input-dialog')) {
      customElements.define('cv-input-dialog', this)
    }
  }

  static styles = [
    css`
      :host {
        display: contents;
      }

      adaptive-modal-surface {
        --cv-dialog-border-radius: var(--cv-radius-2, 12px);
        --cv-dialog-max-height: calc(100dvh - 32px);
        --cv-dialog-width: min(480px, calc(100vw - 32px));
        --adaptive-modal-width: min(480px, calc(100vw - 32px));
        --adaptive-modal-max-height: calc(100dvh - 32px);
        --cv-dialog-title-font-size: var(--cv-font-size-lg, 1.125rem);
      }

      adaptive-modal-surface.size-s {
        --cv-dialog-width: min(320px, calc(100vw - 32px));
        --adaptive-modal-width: min(320px, calc(100vw - 32px));
      }

      adaptive-modal-surface.size-l {
        --cv-dialog-width: min(640px, calc(100vw - 32px));
        --adaptive-modal-width: min(640px, calc(100vw - 32px));
      }

      adaptive-modal-surface.size-xl {
        --cv-dialog-width: min(800px, calc(100vw - 32px));
        --adaptive-modal-width: min(800px, calc(100vw - 32px));
      }

      adaptive-modal-surface::part(trigger) {
        display: none;
      }

      adaptive-modal-surface::part(content) {
        gap: 0;
        padding: 0;
        overflow: hidden;
      }

      adaptive-modal-surface.password-input-dialog {
        --cv-bottom-sheet-keyboard-inset: var(
          --password-input-dialog-keyboard-offset,
          var(--visual-viewport-bottom-inset, 0px)
        );
      }

      adaptive-modal-surface::part(body) {
        padding: 0;
      }

      adaptive-modal-surface::part(footer) {
        display: block;
        padding: 0;
      }

      adaptive-modal-surface::part(header) {
        padding: var(--app-spacing-4, 1rem) var(--app-spacing-5, 1.25rem) 0;
      }

      adaptive-modal-surface::part(title) {
        margin: 0;
        font-size: var(--cv-font-size-lg, 1.125rem);
        color: var(--cv-color-text);
      }

      adaptive-modal-surface::part(description) {
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
  private geometryObserver: ResizeObserver | null = null

  private get shouldDebugPasswordDialog() {
    return this.opts.type === 'password'
  }

  private get shouldWritePasswordDialogDebug() {
    return this.shouldDebugPasswordDialog && isPasswordInputDialogDebugActive()
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
      if (this.shouldDebugPasswordDialog) {
        enablePasswordInputDialogKeyboardStabilization({
          initialKeyboardOffset: this.shouldUsePasswordInputProvisionalKeyboardOffset()
            ? PASSWORD_INPUT_DIALOG_PROVISIONAL_KEYBOARD_OFFSET
            : undefined,
        })
        enablePasswordInputDialogDebug()
        this.writeDebug('show requested', {
          title: this.opts.title ?? null,
        })
      }
      this.updateComplete.then(() => {
        this.writeDebug('set open true before')
        this.isOpen.set(true)
        this.writeDebug('set open true after')
      })
    })
  }

  close(result: string | null = null) {
    this.clearPendingInputFocus()
    this.inputFocusAttemptedForOpen = false
    this.writeDebug('close called', {
      hasIncomingResult: result !== null,
      shown: this.shown,
      isOpen: this.isOpen(),
    })
    const nextResult = result === null && this._result !== null ? this._result : result
    this._result = nextResult
    this.closing = true
    if (!this.isOpen() && !this.shown) {
      this.isOpen.set(false)
      this.closing = false
      this._resolve?.(this._result)
      this._resolve = undefined
      if (this.shouldDebugPasswordDialog) {
        disablePasswordInputDialogKeyboardStabilization()
        disablePasswordInputDialogDebug()
      }
      return
    }

    if (this.closeTimer !== null) {
      window.clearTimeout(this.closeTimer)
    }

    const active = this.getDeepActiveElement()
    if (this.shouldDebugPasswordDialog) {
      this.writeDebug('close requested', {
        hasResult: nextResult !== null,
        activeTag: active?.tagName ?? null,
        activeInsideDialog: Boolean(active && this.renderRoot.contains(active)),
      })
    }
    if (active && this.renderRoot.contains(active) && typeof active.blur === 'function') {
      active.blur()
      if (this.shouldDebugPasswordDialog) {
        this.writeDebug('active element blurred', {
          activeTag: active.tagName,
        })
      }
    }

    // Give Android WebView/IME one turn to detach from the focused password field
    // before the dialog subtree is removed. Closing synchronously can crash Chromium.
    this.closeTimer = window.setTimeout(() => {
      this.closeTimer = null
      if (this.shouldDebugPasswordDialog) {
        this.writeDebug('deferred close fired', {
          hasResult: nextResult !== null,
        })
      }
      this.isOpen.set(false)
    }, 32)
  }

  disconnectedCallback(): void {
    this.clearPendingInputFocus()
    this.stopGeometryObserver()
    if (this.closeTimer !== null) {
      window.clearTimeout(this.closeTimer)
      this.closeTimer = null
    }
    if (this.shouldDebugPasswordDialog) {
      this.writeDebug('disconnected')
      disablePasswordInputDialogKeyboardStabilization()
      disablePasswordInputDialogDebug()
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
    if (this.shouldWritePasswordDialogDebug) {
      this.writeDebug('focus scheduled', {
        input: readElementDebugBox(input),
        requireShown,
      })
    }
    this.focusRaf = window.requestAnimationFrame(() => {
      this.focusRaf = null
      this.writeDebug('focus raf fired', {
        inputConnected: input.isConnected,
      })
      this.focusTimer = window.setTimeout(() => {
        this.focusTimer = null
        this.writeDebug('focus timer fired', {
          shown: this.shown,
          isOpen: this.isOpen(),
          inputConnected: input.isConnected,
        })
        if ((requireShown && !this.shown) || !this.isOpen() || !input.isConnected) return

        this.inputFocusAttemptedForOpen = true
        try {
          input.focus({preventScroll: true})
        } catch {
          input.focus()
        }
        if (this.shouldWritePasswordDialogDebug) {
          this.writeDebug('focus applied', {
            active: this.describeDeepActiveElement(),
            input: readElementDebugBox(input),
          })
        }
        if (this.shouldWritePasswordDialogDebug) {
          window.setTimeout(() => {
            this.writeDebug('post-focus geometry', {
              active: this.describeDeepActiveElement(),
            })
          }, 120)
        }
      }, 50)
    })
  }

  private describeDeepActiveElement(): Record<string, unknown> | null {
    const active = this.getDeepActiveElement()
    if (!active) return null

    return {
      tag: active.tagName.toLowerCase(),
      className: active.className,
      id: active.id || null,
      name: active.getAttribute('name'),
      type: active.getAttribute('type'),
      insideDialog: this.renderRoot.contains(active),
    }
  }

  private getModalSurface(): HTMLElement | null {
    return this.renderRoot.querySelector('adaptive-modal-surface') as HTMLElement | null
  }

  private getSurfaceInternals(): Record<string, unknown> {
    const surface = this.getModalSurface()
    const sheet = surface?.shadowRoot?.querySelector('cv-bottom-sheet') as (HTMLElement & {open?: boolean}) | null
    const surfaceDialog = surface?.shadowRoot?.querySelector('cv-dialog') as (HTMLElement & {open?: boolean}) | null
    const innerDialog =
      (sheet?.shadowRoot?.querySelector('cv-dialog') as (HTMLElement & {open?: boolean}) | null) ?? surfaceDialog
    const overlay = innerDialog?.shadowRoot?.querySelector('[part="overlay"]')
    const content = innerDialog?.shadowRoot?.querySelector('[part="content"]')
    const body = innerDialog?.shadowRoot?.querySelector('[part="body"]')
    const input = this.renderRoot.querySelector('cv-input')

    return {
      surfaceClass: surface?.className ?? null,
      surfaceOpen: (surface as (HTMLElement & {open?: boolean}) | null)?.open ?? null,
      sheetOpen: sheet?.open ?? null,
      dialogOpen: innerDialog?.open ?? null,
      sheetBox: readElementDebugBox(sheet),
      dialogBox: readElementDebugBox(innerDialog),
      overlayBox: readElementDebugBox(overlay),
      contentBox: readElementDebugBox(content),
      bodyBox: readElementDebugBox(body),
      inputBox: readElementDebugBox(input),
    }
  }

  private writeDebug(event: string, meta?: Record<string, unknown>): void {
    if (!this.shouldWritePasswordDialogDebug) return

    writeMobileDialogDebug('input-dialog', event, {
      shown: this.shown,
      open: this.isOpen(),
      active: this.describeDeepActiveElement(),
      geometry: this.getSurfaceInternals(),
      ...meta,
    })
  }

  private startGeometryObserver(): void {
    this.stopGeometryObserver()
    if (!this.shouldWritePasswordDialogDebug) return
    if (typeof ResizeObserver === 'undefined') return

    const surface = this.getModalSurface()
    const sheet = surface?.shadowRoot?.querySelector('cv-bottom-sheet')
    const dialog =
      sheet?.shadowRoot?.querySelector('cv-dialog') ?? surface?.shadowRoot?.querySelector('cv-dialog')
    const targets = [
      surface,
      sheet,
      dialog,
      dialog?.shadowRoot?.querySelector('[part="overlay"]'),
      dialog?.shadowRoot?.querySelector('[part="content"]'),
      dialog?.shadowRoot?.querySelector('[part="body"]'),
      this.renderRoot.querySelector('cv-input'),
    ].filter((element): element is Element => element instanceof Element)

    if (!targets.length) return

    this.geometryObserver = new ResizeObserver((entries) => {
      this.writeDebug('resize observer', {
        entries: entries.map((entry) => ({
          target: (entry.target as HTMLElement).tagName.toLowerCase(),
          className: (entry.target as HTMLElement).className,
          contentRect: {
            width: Math.round(entry.contentRect.width * 100) / 100,
            height: Math.round(entry.contentRect.height * 100) / 100,
          },
        })),
      })
    })

    for (const target of targets) {
      this.geometryObserver.observe(target)
    }

    this.writeDebug('resize observer started', {
      targetCount: targets.length,
    })
  }

  private stopGeometryObserver(): void {
    this.geometryObserver?.disconnect()
    this.geometryObserver = null
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

  private handleConfirm = () => {
    const err = this.validate(this.inputValue())
    if (err) {
      this.error.set(err)
      this.writeDebug('confirm blocked by validation')
      return
    }
    this.writeDebug('confirm accepted')
    this.close(this.inputValue().trim())
  }

  private handleCancel = () => {
    this.writeDebug('cancel')
    this.close(null)
  }

  private handleInput = (e: Event) => {
    const event = e as CustomEvent<{value?: string}>
    const target = e.target as {value?: string} | null
    const val = event.detail?.value ?? target?.value ?? ''
    this.inputValue.set(val)
    // Do not validate prior to dialog display – cv-input can fire an event upon initialization
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

  private shouldFocusPasswordInputDuringShow(): boolean {
    return this.opts.type === 'password' && tryGetAppContext()?.store.layoutMode?.() === 'mobile'
  }

  private shouldUsePasswordInputProvisionalKeyboardOffset(): boolean {
    if (!this.shouldFocusPasswordInputDuringShow()) return false
    const capabilities = getRuntimeCapabilities()
    return !(capabilities.platform === 'android' && capabilities.mobile)
  }

  private handleShow() {
    if (this.closing || !this.isOpen()) return

    const input = this.renderRoot.querySelector('cv-input') as HTMLElement | null
    if (input) this.scheduleInputFocus(input, {requireShown: false})
  }

  private handleAfterShow = () => {
    if (this.closing || !this.isOpen()) return
    this.shown = true
    this.writeDebug('after-show')
    this.startGeometryObserver()
    const input = this.renderRoot.querySelector('cv-input') as HTMLElement | null
    if (input && (!this.shouldFocusPasswordInputDuringShow() || !this.inputFocusAttemptedForOpen)) {
      this.scheduleInputFocus(input)
    }
    this.dispatchEvent(new Event('cv-after-show', {bubbles: true}))
  }

  private handleAfterHide = () => {
    if (!this.shown && !this.closing) return
    this.writeDebug('after-hide')
    this.stopGeometryObserver()
    this.shown = false
    this.closing = false
    this.inputFocusAttemptedForOpen = false
    this._resolve?.(this._result)
    this._resolve = undefined
    this.dispatchEvent(new Event('cv-after-hide', {bubbles: true}))
    if (this.shouldDebugPasswordDialog) {
      disablePasswordInputDialogKeyboardStabilization()
      disablePasswordInputDialogDebug()
    }
  }

  private handleDialogChange(e: CustomEvent<{open?: boolean}>) {
    if (e.target !== e.currentTarget) return
    if (typeof e.detail?.open !== 'boolean') return
    if (this.shouldWritePasswordDialogDebug) {
      this.writeDebug('surface cv-change', {
        detailOpen: e.detail.open,
        targetTag: e.target instanceof HTMLElement ? e.target.tagName.toLowerCase() : null,
        currentTargetTag: e.currentTarget instanceof HTMLElement ? e.currentTarget.tagName.toLowerCase() : null,
        viewportAtChange: readVisualViewportDebugSnapshot(),
      })
    }
    if (e.detail.open || !this.isOpen()) return
    if (this._result !== null) return
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
    const className = `size-${size}${opts.type === 'password' ? ' password-input-dialog' : ''}`

    return html`
      <adaptive-modal-surface
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
      </adaptive-modal-surface>
    `
  }
}
