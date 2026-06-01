import {CVBottomSheet} from '@chromvoid/uikit/components/cv-bottom-sheet'
import {CVDialog} from '@chromvoid/uikit/components/cv-dialog'
import {CVIcon} from '@chromvoid/uikit/components/cv-icon'
import {css, type PropertyValues, type TemplateResult} from 'lit'
import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {tryGetAppContext} from 'root/shared/services/app-context'
import {
  isPasswordInputDialogDebugActive,
  readElementDebugBox,
  writeMobileDialogDebug,
} from '../services/mobile-dialog-debug'

export type AdaptiveModalPresentation = 'auto' | 'dialog' | 'bottom-sheet'

export class AdaptiveModalSurface extends ReatomLitElement {
  static elementName = 'adaptive-modal-surface'

  static get properties() {
    return {
      open: {type: Boolean, reflect: true},
      modal: {type: Boolean, reflect: true},
      type: {type: String, reflect: true},
      ariaLabel: {type: String, attribute: 'aria-label'},
      noHeader: {type: Boolean, attribute: 'no-header', reflect: true},
      closeOnEscape: {type: Boolean, attribute: 'close-on-escape', reflect: true},
      closeOnOutsidePointer: {
        type: Boolean,
        attribute: 'close-on-outside-pointer',
        reflect: true,
      },
      closeOnOutsideFocus: {type: Boolean, attribute: 'close-on-outside-focus', reflect: true},
      initialFocusId: {type: String, attribute: 'initial-focus-id'},
      closable: {type: Boolean, reflect: true},
      showHandle: {type: Boolean, attribute: 'show-handle', reflect: true},
      dragToClose: {type: Boolean, attribute: 'drag-to-close', reflect: true},
      detents: {type: String, reflect: true},
      detent: {type: String, reflect: true},
      handleLabel: {type: String, attribute: 'handle-label'},
      presentation: {type: String, reflect: true},
    }
  }

  declare open: boolean
  declare modal: boolean
  declare type: 'dialog' | 'alertdialog'
  declare ariaLabel: string
  declare noHeader: boolean
  declare closeOnEscape: boolean
  declare closeOnOutsidePointer: boolean
  declare closeOnOutsideFocus: boolean
  declare initialFocusId: string
  declare closable: boolean
  declare showHandle: boolean
  declare dragToClose: boolean
  declare detents: string
  declare detent: 'collapsed' | 'middle' | 'expanded'
  declare handleLabel: string
  declare presentation: AdaptiveModalPresentation

  constructor() {
    super()
    this.open = false
    this.modal = true
    this.type = 'dialog'
    this.ariaLabel = ''
    this.noHeader = false
    this.closeOnEscape = true
    this.closeOnOutsidePointer = true
    this.closeOnOutsideFocus = true
    this.initialFocusId = ''
    this.closable = true
    this.showHandle = true
    this.dragToClose = true
    this.detents = ''
    this.detent = 'expanded'
    this.handleLabel = 'Resize sheet'
    this.presentation = 'auto'
  }

  static styles = css`
    :host {
      display: contents;
      --adaptive-modal-z-index: calc(var(--cv-z-overlay, 300) + 20);
      --adaptive-modal-overlay-color: var(--cv-color-overlay);
      --adaptive-modal-width: min(720px, calc(100vw - 32px));
      --adaptive-modal-max-height: min(720px, calc(100dvh - 32px));
      --adaptive-modal-sheet-width: 100%;
      --adaptive-modal-sheet-max-width: 100%;
      --adaptive-modal-sheet-max-height: min(82dvh, calc(100dvh - 32px));
      --adaptive-modal-sheet-border-radius: var(--cv-radius-4) var(--cv-radius-4) 0 0;
      --adaptive-modal-sheet-grabber-color: var(--cv-color-border-strong);
    }

    cv-dialog {
      --cv-dialog-z-index: var(--adaptive-modal-z-index);
      --cv-dialog-overlay-color: var(--adaptive-modal-overlay-color);
      --cv-dialog-width: var(--adaptive-modal-width);
      --cv-dialog-max-height: var(--adaptive-modal-max-height);
    }

    cv-bottom-sheet {
      --cv-bottom-sheet-z-index: var(--adaptive-modal-z-index);
      --cv-bottom-sheet-overlay-color: var(--adaptive-modal-overlay-color);
      --cv-bottom-sheet-width: var(--adaptive-modal-sheet-width);
      --cv-bottom-sheet-max-width: var(--adaptive-modal-sheet-max-width);
      --cv-bottom-sheet-max-height: var(--adaptive-modal-sheet-max-height);
      --cv-bottom-sheet-border-radius: var(--adaptive-modal-sheet-border-radius);
      --cv-bottom-sheet-grabber-color: var(--adaptive-modal-sheet-grabber-color);
    }

    cv-dialog::part(trigger),
    cv-bottom-sheet::part(trigger) {
      display: none;
    }
  `

  static define() {
    CVBottomSheet.define()
    CVDialog.define()
    CVIcon.define()
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
  }

  private emitClose(): void {
    this.dispatchEvent(new CustomEvent('close', {bubbles: true, composed: true}))
  }

  private handleSurfaceChange(
    event: CustomEvent<{open?: boolean; detent?: 'collapsed' | 'middle' | 'expanded'}>,
  ): void {
    this.writeDebug('surface change', {
      detailOpen: event.detail.open,
      detailDetent: 'detent' in event.detail ? event.detail.detent : null,
      targetTag: event.target instanceof HTMLElement ? event.target.tagName.toLowerCase() : null,
    })
    if (this.isSheetDetent(event.detail.detent)) {
      this.detent = event.detail.detent
    }
    if (typeof event.detail.open !== 'boolean') return
    if (event.detail.open) return
    this.emitClose()
  }

  private isSheetDetent(value: unknown): value is 'collapsed' | 'middle' | 'expanded' {
    return value === 'collapsed' || value === 'middle' || value === 'expanded'
  }

  private handleSurfaceLifecycle(event: Event): void {
    this.writeDebug(event.type, {
      targetTag: event.target instanceof HTMLElement ? event.target.tagName.toLowerCase() : null,
    })
  }

  protected override updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties)
    if (!changedProperties.has('open')) return

    this.writeDebug('updated open', {
      previousOpen: changedProperties.get('open'),
      nextOpen: this.open,
    })
  }

  private getSurfaceDebugSnapshot(): Record<string, unknown> {
    const isMobile = tryGetAppContext()?.store.layoutMode?.() === 'mobile'
    const sheet = this.shadowRoot?.querySelector('cv-bottom-sheet') as (HTMLElement & {open?: boolean}) | null
    const directDialog = this.shadowRoot?.querySelector('cv-dialog') as (HTMLElement & {open?: boolean}) | null
    const dialog =
      (sheet?.shadowRoot?.querySelector('cv-dialog') as (HTMLElement & {open?: boolean}) | null) ?? directDialog
    const overlay = dialog?.shadowRoot?.querySelector('[part="overlay"]')
    const content = dialog?.shadowRoot?.querySelector('[part="content"]')
    const body = dialog?.shadowRoot?.querySelector('[part="body"]')

    return {
      layoutMode: isMobile ? 'mobile' : 'desktop',
      presentation: this.presentation,
      hostOpen: this.open,
      hostClass: this.className,
      sheetOpen: sheet?.open ?? null,
      sheetDetent: this.detent,
      dialogOpen: dialog?.open ?? null,
      sheetBox: readElementDebugBox(sheet),
      dialogBox: readElementDebugBox(dialog),
      overlayBox: readElementDebugBox(overlay),
      contentBox: readElementDebugBox(content),
      bodyBox: readElementDebugBox(body),
    }
  }

  private writeDebug(event: string, meta?: Record<string, unknown>): void {
    if (!isPasswordInputDialogDebugActive()) return

    writeMobileDialogDebug('adaptive-modal-surface', event, {
      snapshot: this.getSurfaceDebugSnapshot(),
      ...meta,
    })
  }

  private renderForwardedSlots(): TemplateResult {
    return html`
      <slot name="title" slot="title">${this.ariaLabel}</slot>
      <slot name="description" slot="description"></slot>
      <slot name="header-close" slot="header-close">
        <cv-icon name="x" size="s" aria-hidden="true"></cv-icon>
      </slot>
      <slot></slot>
      <slot name="footer" slot="footer"></slot>
    `
  }

  protected override render() {
    const isMobile = tryGetAppContext()?.store.layoutMode?.() === 'mobile'
    const presentation =
      this.presentation === 'dialog' || this.presentation === 'bottom-sheet' ? this.presentation : 'auto'
    const useBottomSheet = presentation === 'bottom-sheet' || (presentation === 'auto' && isMobile)

    if (useBottomSheet) {
      return html`
        <cv-bottom-sheet
          exportparts="trigger, overlay, content, header, title, description, header-close, body, footer, handle, grabber"
          .open=${this.open}
          .modal=${this.modal}
          .type=${this.type}
          .closeOnEscape=${this.closeOnEscape}
          .closeOnOutsidePointer=${this.closeOnOutsidePointer}
          .closeOnOutsideFocus=${this.closeOnOutsideFocus}
          .initialFocusId=${this.initialFocusId}
          .closable=${this.closable}
          .noHeader=${this.noHeader}
          .showHandle=${this.showHandle}
          .dragToClose=${this.dragToClose}
          .detents=${this.detents}
          .detent=${this.detent}
          .handleLabel=${this.handleLabel}
          @cv-change=${this.handleSurfaceChange}
          @cv-show=${this.handleSurfaceLifecycle}
          @cv-after-show=${this.handleSurfaceLifecycle}
          @cv-hide=${this.handleSurfaceLifecycle}
          @cv-after-hide=${this.handleSurfaceLifecycle}
        >
          ${this.renderForwardedSlots()}
        </cv-bottom-sheet>
      `
    }

    return html`
      <cv-dialog
        exportparts="trigger, overlay, content, header, title, description, header-close, body, footer"
        .open=${this.open}
        .modal=${this.modal}
        .type=${this.type}
        .closeOnEscape=${this.closeOnEscape}
        .closeOnOutsidePointer=${this.closeOnOutsidePointer}
        .closeOnOutsideFocus=${this.closeOnOutsideFocus}
        .initialFocusId=${this.initialFocusId}
        .closable=${this.closable}
        .noHeader=${this.noHeader}
        @cv-change=${this.handleSurfaceChange}
        @cv-show=${this.handleSurfaceLifecycle}
        @cv-after-show=${this.handleSurfaceLifecycle}
        @cv-hide=${this.handleSurfaceLifecycle}
        @cv-after-hide=${this.handleSurfaceLifecycle}
      >
        ${this.renderForwardedSlots()}
      </cv-dialog>
    `
  }
}
