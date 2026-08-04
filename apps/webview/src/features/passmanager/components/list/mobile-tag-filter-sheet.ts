import {CVBottomSheet} from '@chromvoid/uikit/components/cv-bottom-sheet'
import {CVButton} from '@chromvoid/uikit/components/cv-button'
import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {css, type TemplateResult} from 'lit'

import {i18n} from '@project/passmanager/i18n'
import {pmCredentialTagsModel, type PMCredentialTagSheetMode} from '../../models/pm-credential-tags.model'
import {PMMobileTagPicker} from '../tags/mobile-tag-picker'

export class PMMobileTagFilterSheet extends ReatomLitElement {
  static elementName = 'pm-mobile-tag-filter-sheet'

  static styles = css`
    :host {
      display: contents;
    }

    cv-bottom-sheet {
      --cv-bottom-sheet-max-height: min(80dvh, calc(100dvh - 28px));
      --cv-bottom-sheet-border-radius: 28px 28px 0 0;
      --cv-bottom-sheet-grabber-width: 38px;
      --cv-bottom-sheet-grabber-height: 5px;
      --cv-bottom-sheet-grabber-color: var(--cv-color-border-strong);
    }

    cv-bottom-sheet::part(content) {
      border-color: var(--cv-color-border-glass);
      background: var(--cv-color-surface-elevated);
      box-shadow: var(--cv-shadow-4);
    }

    cv-bottom-sheet::part(body) {
      padding: 0;
      overflow: hidden;
    }

    cv-bottom-sheet::part(footer) {
      display: flex;
      gap: var(--cv-space-2);
      padding: var(--cv-space-2) var(--cv-space-4) max(26px, env(safe-area-inset-bottom, 0px));
      border-block-start: 1px solid var(--cv-color-border-glass);
      background: var(--cv-color-surface-elevated);
    }

    .footer-action {
      flex: 1 1 0;
      min-block-size: 50px;
      --cv-button-border-radius: 15px;
      --cv-button-font-weight: 800;
    }

    .footer-action::part(base) {
      min-block-size: inherit;
    }

    @media (max-width: 360px) {
      cv-bottom-sheet::part(footer) {
        padding-inline: var(--cv-space-3);
      }
    }
  `

  static define(): void {
    CVBottomSheet.define()
    CVButton.define()
    PMMobileTagPicker.define()
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
  }

  private handleSheetChange(event: CustomEvent<{open?: boolean}>): void {
    if (event.target !== event.currentTarget || event.detail.open !== false) return
    pmCredentialTagsModel.closeSheet()
  }

  private handleDone(): void {
    void pmCredentialTagsModel.confirmSheetSelection()
  }

  private getInitialFocusId(mode: PMCredentialTagSheetMode): string {
    if (mode === 'delete-confirm') return 'pm-tag-delete-cancel'
    if (mode === 'create' || mode === 'rename') return ''
    return 'pm-tag-done'
  }

  protected render(): TemplateResult {
    const mode = pmCredentialTagsModel.sheetMode()
    const entrySelectionSaving = pmCredentialTagsModel.entrySelectionSaving()

    return html`
      <cv-bottom-sheet
        .open=${pmCredentialTagsModel.filterSheetOpen()}
        .closeOnOutsideFocus=${false}
        no-header
        show-handle
        drag-to-close
        .initialFocusId=${this.getInitialFocusId(mode)}
        @cv-change=${this.handleSheetChange}
      >
        <pm-mobile-tag-picker></pm-mobile-tag-picker>
        <cv-button
          id="pm-tag-done"
          slot="footer"
          type="button"
          class="footer-action"
          variant="primary"
          .loading=${entrySelectionSaving}
          ?disabled=${entrySelectionSaving}
          @click=${this.handleDone}
        >
          ${i18n('button:done')}
        </cv-button>
      </cv-bottom-sheet>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pm-mobile-tag-filter-sheet': PMMobileTagFilterSheet
  }
}
