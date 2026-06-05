import {CVButton} from '@chromvoid/uikit/components/cv-button'
import {CVBottomSheet} from '@chromvoid/uikit/components/cv-bottom-sheet'
import {css} from 'lit'
import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {i18n} from '@project/passmanager/i18n'
import {PMEntryMoveMobile} from './pm-entry-move-mobile'

export type PMEntryMoveSheetConfirmDetail = {
  targetId: string
}

export class PMEntryMoveSheet extends ReatomLitElement {
  static elementName = 'pm-entry-move-sheet'

  static properties = {
    disabledIds: {attribute: false},
    entryId: {type: String, attribute: 'entry-id'},
    open: {type: Boolean, reflect: true},
    confirming: {type: Boolean, reflect: true},
    selectedId: {type: String, attribute: 'selected-id'},
  }

  static styles = css`
    :host {
      display: contents;
    }

    cv-bottom-sheet::part(content) {
      overflow: hidden;
      border-color: var(--cv-color-primary-border);
      background: var(--cv-color-surface);
    }

    cv-bottom-sheet::part(header) {
      padding: var(--cv-space-4) var(--cv-space-4) var(--cv-space-3);
      border-block-end: 1px solid var(--cv-color-border);
    }

    cv-bottom-sheet::part(title) {
      font-size: 1.125rem;
      font-weight: var(--cv-font-weight-bold);
      line-height: 1.2;
    }

    cv-bottom-sheet::part(header-close) {
      inline-size: 36px;
      block-size: 36px;
      border-radius: var(--cv-radius-2);
      color: var(--cv-color-text-muted);
    }

    cv-bottom-sheet::part(body) {
      min-block-size: 0;
      padding: 0;
      overflow: hidden;
    }

    cv-bottom-sheet::part(footer) {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: var(--cv-space-2);
      padding: var(--cv-space-3) var(--cv-space-4) max(var(--cv-space-4), env(safe-area-inset-bottom));
      border-block-start: 1px solid var(--cv-color-border);
      background: var(--cv-color-surface);
    }

    .sheet-body {
      min-block-size: 0;
      padding: var(--cv-space-3) var(--cv-space-4) 0;
    }

    pm-entry-move-mobile {
      display: block;
    }

    .footer-action::part(base) {
      inline-size: 100%;
      min-block-size: 44px;
      border-radius: var(--cv-radius-2);
      font-size: 1rem;
      font-weight: var(--cv-font-weight-semibold);
    }
  `

  declare disabledIds: string[]
  declare entryId: string
  declare open: boolean
  declare confirming: boolean
  declare selectedId: string

  constructor() {
    super()
    this.disabledIds = []
    this.entryId = ''
    this.open = false
    this.confirming = false
    this.selectedId = ''
  }

  static define() {
    CVBottomSheet.define()
    CVButton.define()
    PMEntryMoveMobile.define()
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  private emitClose() {
    this.dispatchEvent(
      new CustomEvent('pm-entry-move-sheet-close', {
        bubbles: true,
        composed: true,
      }),
    )
  }

  private handleSheetChange(event: CustomEvent<{open?: boolean}>) {
    if (event.target !== event.currentTarget) return
    if (event.detail.open !== false) return
    this.emitClose()
  }

  private emitCancel() {
    this.dispatchEvent(
      new CustomEvent('pm-entry-move-sheet-cancel', {
        bubbles: true,
        composed: true,
      }),
    )
  }

  private emitConfirm() {
    if (this.confirming || !this.selectedId) return

    this.dispatchEvent(
      new CustomEvent<PMEntryMoveSheetConfirmDetail>('pm-entry-move-sheet-confirm', {
        detail: {targetId: this.selectedId},
        bubbles: true,
        composed: true,
      }),
    )
  }

  private handlePickerSelected(event: Event) {
    const targetId = (event as CustomEvent<{id?: string}>).detail?.id
    if (!targetId) return
    this.selectedId = targetId
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
      <cv-bottom-sheet
        .open=${this.open}
        @cv-change=${this.handleSheetChange}
        @keydown=${this.handleKeyDown}
      >
        <span slot="title">${i18n('dialog:move:title')}</span>
        <div class="sheet-body">
          <pm-entry-move-mobile
            .entryId=${this.entryId}
            .selectedId=${this.selectedId}
            .disabledIds=${this.disabledIds}
            @move-selected=${this.handlePickerSelected}
          ></pm-entry-move-mobile>
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
          .disabled=${this.confirming || !this.selectedId}
          .loading=${this.confirming}
          @click=${this.emitConfirm}
        >
          ${i18n('button:move')}
        </cv-button>
      </cv-bottom-sheet>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pm-entry-move-sheet': PMEntryMoveSheet
  }
}
