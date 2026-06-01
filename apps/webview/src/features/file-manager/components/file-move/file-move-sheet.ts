import {CVButton} from '@chromvoid/uikit/components/cv-button'
import {css} from 'lit'
import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {i18n} from 'root/i18n'
import {AdaptiveModalSurface} from 'root/shared/ui/adaptive-modal-surface'
import {FileMoveMobile} from './file-move-mobile'

export type FileMoveSheetConfirmDetail = {
  targetPath: string
}

export class FileMoveSheet extends ReatomLitElement {
  static elementName = 'file-move-sheet'

  static properties = {
    disabledPaths: {attribute: false},
    itemId: {type: Number, attribute: 'item-id'},
    open: {type: Boolean, reflect: true},
    confirming: {type: Boolean, reflect: true},
    selectedPath: {type: String, attribute: 'selected-path'},
  }

  static styles = css`
    :host {
      display: contents;
    }

    adaptive-modal-surface {
      --adaptive-modal-width: min(520px, calc(100vw - 24px));
      --adaptive-modal-max-height: min(680px, calc(100dvh - 24px));
      --adaptive-modal-sheet-max-height: 100dvh;
      --cv-bottom-sheet-safe-top: var(--safe-area-top, env(safe-area-inset-top, 0px));
      --cv-bottom-sheet-expanded-height: 100dvh;
      --cv-bottom-sheet-middle-height: min(72dvh, 560px);
      --adaptive-modal-sheet-border-radius: var(--cv-radius-4) var(--cv-radius-4) 0 0;
      --adaptive-modal-sheet-grabber-color: color-mix(
        in srgb,
        var(--cv-color-primary) 45%,
        var(--cv-color-border-strong)
      );
    }

    adaptive-modal-surface::part(content) {
      grid-template-rows: auto auto minmax(0, 1fr) auto;
      block-size: min(var(--adaptive-modal-sheet-max-height), calc(100dvh - var(--cv-bottom-sheet-safe-top)));
      overflow: hidden;
      background: var(--cv-color-surface);
    }

    adaptive-modal-surface::part(header) {
      padding: var(--cv-space-5) var(--cv-space-5) var(--cv-space-2);
    }

    adaptive-modal-surface::part(title) {
      font-size: 1.125rem;
      font-weight: var(--cv-font-weight-bold);
      line-height: 1.2;
    }

    adaptive-modal-surface::part(header-close) {
      inline-size: 36px;
      block-size: 36px;
      border-radius: var(--cv-radius-2);
      color: var(--cv-color-text-muted);
    }

    adaptive-modal-surface::part(body) {
      display: grid;
      min-block-size: 0;
      padding: 0;
      overflow: hidden;
    }

    adaptive-modal-surface::part(footer) {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: var(--cv-space-3);
      padding: var(--cv-space-2) var(--cv-space-5) max(var(--cv-space-5), env(safe-area-inset-bottom));
      background: var(--cv-color-surface);
    }

    .sheet-body {
      display: grid;
      min-block-size: 0;
      block-size: 100%;
      overflow: hidden;
      padding: var(--cv-space-2) var(--cv-space-5) var(--cv-space-4);
    }

    file-move-mobile {
      display: grid;
      min-block-size: 0;
      block-size: 100%;
    }

    .footer-action::part(base) {
      inline-size: 100%;
      min-block-size: 44px;
      border-radius: var(--cv-radius-2);
      font-size: 1rem;
      font-weight: var(--cv-font-weight-semibold);
    }
  `

  declare disabledPaths: string[]
  declare itemId: number | null
  declare open: boolean
  declare confirming: boolean
  declare selectedPath: string

  constructor() {
    super()
    this.disabledPaths = []
    this.itemId = null
    this.open = false
    this.confirming = false
    this.selectedPath = '/'
  }

  static define() {
    AdaptiveModalSurface.define()
    CVButton.define()
    FileMoveMobile.define()
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  private emitClose() {
    this.dispatchEvent(
      new CustomEvent('file-move-sheet-close', {
        bubbles: true,
        composed: true,
      }),
    )
  }

  private emitCancel() {
    this.dispatchEvent(
      new CustomEvent('file-move-sheet-cancel', {
        bubbles: true,
        composed: true,
      }),
    )
  }

  private emitConfirm() {
    if (this.confirming || !this.selectedPath) return

    this.dispatchEvent(
      new CustomEvent<FileMoveSheetConfirmDetail>('file-move-sheet-confirm', {
        detail: {targetPath: this.selectedPath},
        bubbles: true,
        composed: true,
      }),
    )
  }

  private handlePickerSelected(event: Event) {
    const targetPath = (event as CustomEvent<{path?: string}>).detail?.path
    if (!targetPath) return
    this.selectedPath = targetPath
  }

  private handleKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Enter' || event.shiftKey) return
    const target = event.target as HTMLElement | null
    const tagName = target?.tagName.toLowerCase()
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
    if (tagName === 'cv-input' || tagName === 'cv-textarea') return

    event.preventDefault()
    this.emitConfirm()
  }

  protected override render() {
    return html`
      <adaptive-modal-surface
        .open=${this.open}
        .ariaLabel=${i18n('file-manager:move:title')}
        @close=${this.emitClose}
        @keydown=${this.handleKeyDown}
      >
        <span slot="title">${i18n('file-manager:move:title')}</span>
        <div class="sheet-body">
          <file-move-mobile
            .itemId=${this.itemId}
            .selectedPath=${this.selectedPath}
            .disabledPaths=${this.disabledPaths}
            @move-selected=${this.handlePickerSelected}
          ></file-move-mobile>
        </div>
        <cv-button
          class="footer-action"
          slot="footer"
          type="button"
          variant="default"
          size="large"
          @click=${this.emitCancel}
        >
          ${i18n('button:cancel')}
        </cv-button>
        <cv-button
          class="footer-action"
          slot="footer"
          type="button"
          variant="primary"
          size="large"
          .disabled=${this.confirming || !this.selectedPath}
          .loading=${this.confirming}
          @click=${this.emitConfirm}
        >
          ${i18n('file-manager:move:action')}
        </cv-button>
      </adaptive-modal-surface>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'file-move-sheet': FileMoveSheet
  }
}
