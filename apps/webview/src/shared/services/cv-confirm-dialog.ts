import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {CVDialog} from '@chromvoid/uikit/components/cv-dialog'
import {atom, wrap} from '@reatom/core'
import {css, type TemplateResult} from 'lit'
import {i18n} from 'root/i18n'
import type {ConfirmDialogOptions} from './dialog-types.js'
import {writeAndroidUnlockDebug} from './android-unlock-debug'

type CvConfirmDialogOptions = ConfirmDialogOptions & {
  mode?: 'confirm' | 'alert'
}

const variantIcons: Record<string, TemplateResult> = {
  success: html`<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path
      d="M6 12.5l4 4 8-9"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>`,
  warning: html`<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path
      d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>`,
  danger: html`<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path
      d="M12 8v4m0 4h.01"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
    />
    <circle cx="12" cy="12" r="9.5" stroke="currentColor" stroke-width="1.5" />
  </svg>`,
  info: html`<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="9.5" stroke="currentColor" stroke-width="1.5" />
    <path
      d="M12 16v-4m0-4h.01"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
    />
  </svg>`,
  default: html`<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="9.5" stroke="currentColor" stroke-width="1.5" />
    <path
      d="M9.09 9a3 3 0 015.83 1c0 1.5-2 2.25-2.75 2.75-.3.2-.17.75-.17 1.25"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <circle cx="12" cy="17.5" r="0.75" fill="currentColor" />
  </svg>`,
}

export class CvConfirmDialog extends ReatomLitElement {
  static define() {
    CVDialog.define()
    if (!customElements.get('cv-confirm-dialog')) {
      customElements.define('cv-confirm-dialog', this)
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
        --cv-dialog-width: var(--cv-dialog-width-m);
      }

      cv-dialog.size-s {
        --cv-dialog-width: var(--cv-dialog-width-s);
      }

      cv-dialog.size-l {
        --cv-dialog-width: var(--cv-dialog-width-l);
      }

      cv-dialog.size-xl {
        --cv-dialog-width: var(--cv-dialog-width-xl);
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
        color: var(--cv-color-text, #1f2937);
      }

      cv-dialog::part(description) {
        display: none;
      }

      .dialog-body {
        padding: var(--app-spacing-5, 1.25rem);
        line-height: var(--line-height-relaxed, 1.625);
        min-inline-size: 0;
      }

      .dialog-footer {
        display: flex;
        box-sizing: border-box;
        flex-wrap: wrap;
        gap: var(--app-spacing-3, 0.75rem);
        justify-content: flex-end;
        padding: var(--app-spacing-4, 1rem) var(--app-spacing-5, 1.25rem);
        border-top: 1px solid var(--cv-color-border, var(--cv-alpha-black-10));
        background: var(--cv-color-surface-2, #f8fafc);
      }

      .message-container {
        text-align: center;
        padding: var(--app-spacing-4, 1rem) 0;
        min-inline-size: 0;
      }

      .message-icon {
        width: 48px;
        height: 48px;
        margin: 0 auto var(--app-spacing-4, 1rem);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: iconPop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      .message-icon.success {
        background: var(--cv-color-success-surface);
        color: var(--cv-color-success, #22c55e);
        box-shadow: 0 0 0 1px var(--cv-color-success-surface-strong);
      }
      .message-icon.warning {
        background: var(--cv-color-warning-surface);
        color: var(--cv-color-warning, #f59e0b);
        box-shadow: 0 0 0 1px var(--cv-color-warning-surface-strong);
      }
      .message-icon.danger {
        background: var(--cv-color-danger-surface);
        color: var(--cv-color-danger, #ef4444);
        box-shadow: 0 0 0 1px var(--cv-color-danger-surface-strong);
      }
      .message-icon.info {
        background: var(--cv-color-info-surface);
        color: var(--cv-color-info, #3b82f6);
        box-shadow: 0 0 0 1px var(--cv-color-info-surface-strong);
      }
      .message-icon.default {
        background: var(--cv-color-primary-surface);
        color: var(--cv-color-primary, #6366f1);
        box-shadow: 0 0 0 1px var(--cv-color-primary-surface-strong);
      }

      .message-text {
        display: inline-block;
        max-inline-size: 100%;
        font-size: var(--cv-font-size-md, 1rem);
        line-height: var(--line-height-relaxed, 1.625);
        color: var(--cv-color-text-muted, #9aa6bf);
        margin: 0;
        text-align: left;
        white-space: pre-line;
        overflow-wrap: anywhere;
        word-break: break-word;
      }

      @keyframes iconPop {
        0% {
          transform: scale(0);
          opacity: 0;
        }
        100% {
          transform: scale(1);
          opacity: 1;
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

  private opts: CvConfirmDialogOptions = {}
  private isOpen = atom(false)

  private _resolve?: (value: boolean | null) => void
  private _result: boolean | null = null
  private shown = false
  private closing = false
  private showStartedAt = 0
  private showToken = 0

  configure(options: CvConfirmDialogOptions) {
    this.opts = options
  }

  show(): Promise<boolean | null> {
    return new Promise((resolve) => {
      const token = ++this.showToken
      this.showStartedAt = performance.now()
      this.shown = false
      this.closing = false
      this._result = null
      this._resolve = resolve
      this.trace('show:requested')
      void this.openAfterUpdate(token, resolve)
    })
  }

  close(result: boolean | null = null) {
    this.showToken += 1
    this._result = result
    this.closing = true
    this.trace('close:requested', {result})
    if (!this.isOpen() && !this.shown) {
      this.resolveResult()
      return
    }
    this.isOpen.set(false)
    this.trace('close:open-state-set', {result})
  }

  private async openAfterUpdate(token: number, resolve: (value: boolean | null) => void): Promise<void> {
    await wrap(this.updateComplete)
    if (token !== this.showToken || this.closing || this._resolve !== resolve) {
      this.trace('show:skipped-stale', {token})
      return
    }
    this.isOpen.set(true)
  }

  private handleConfirm() {
    this.close(true)
  }

  private handleCancel() {
    this.close(false)
  }

  private handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      this.close(true)
    }
  }

  private handleAfterShow() {
    if (this.closing || !this.isOpen()) return
    this.shown = true
    this.trace('after-show')
    this.dispatchEvent(new Event('cv-after-show', {bubbles: true}))
  }

  private handleAfterHide() {
    if (!this.shown && !this.closing) return
    this.shown = false
    this.closing = false
    this.trace('after-hide')
    this.resolveResult()
    this.dispatchEvent(new Event('cv-after-hide', {bubbles: true}))
  }

  private resolveResult() {
    if (!this._resolve) return
    this.trace('resolve', {result: this._result})
    const resolve = this._resolve
    this._resolve = undefined
    resolve(this._result)
  }

  private trace(event: string, meta: Record<string, unknown> = {}) {
    const dtMs = this.showStartedAt > 0 ? Math.round(performance.now() - this.showStartedAt) : null
    const payload = {
      title: this.opts.title ?? null,
      dt_ms: dtMs,
      open: this.isOpen(),
      shown: this.shown,
      closing: this.closing,
      ...meta,
    }
    console.info('[confirm-dialog]', event, payload)
    writeAndroidUnlockDebug('confirm-dialog', event, payload)
  }

  private handleDialogChange(e: CustomEvent<{open?: boolean}>) {
    if (e.target !== e.currentTarget) return
    if (typeof e.detail?.open !== 'boolean') return
    if (e.detail.open || !this.isOpen()) return
    this.close(null)
  }

  protected render() {
    const opts = this.opts
    const variant = opts.variant || 'default'
    const confirmVariant = opts.confirmVariant === 'danger' ? 'danger' : 'primary'
    const size = opts.size || 'm'
    const closable = opts.closable !== false
    const isAlert = opts.mode === 'alert'

    return html`
      <cv-dialog
        class=${`size-${size}`}
        .open=${this.isOpen()}
        .noHeader=${opts.noHeader ?? false}
        .closable=${closable}
        .closeOnEscape=${closable}
        .closeOnOutsidePointer=${closable}
        .closeOnOutsideFocus=${false}
        @cv-change=${this.handleDialogChange}
        @cv-after-hide=${this.handleAfterHide}
        @cv-after-show=${this.handleAfterShow}
        @keydown=${this.handleKeydown}
      >
        <span slot="title">${opts.title || i18n('dialogs:confirm-title' as any)}</span>
        <div class="dialog-body">
          <div class="message-container">
            <div class="message-icon ${variant}">${variantIcons[variant] || variantIcons['default']}</div>
            <p class="message-text">${opts.message || ''}</p>
          </div>
        </div>

        <div class="dialog-footer" slot="footer">
          ${isAlert
            ? null
            : html`
                <cv-button variant="default" @click=${this.handleCancel}
                  >${opts.cancelText || i18n('button:cancel' as any)}</cv-button
                >
              `}
          <cv-button variant=${confirmVariant} @click=${this.handleConfirm}
            >${opts.confirmText || i18n('button:ok' as any)}</cv-button
          >
        </div>
      </cv-dialog>
    `
  }
}
