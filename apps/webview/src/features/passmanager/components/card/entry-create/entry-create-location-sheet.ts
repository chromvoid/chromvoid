import {CVBottomSheet} from '@chromvoid/uikit/components/cv-bottom-sheet'
import {CVButton} from '@chromvoid/uikit/components/cv-button'
import {css} from 'lit'
import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {i18n} from '@project/passmanager/i18n'
import {PMGroupTargetPickerMobile} from '../../group-target-picker'
import {PMEntryCreateModel} from './entry-create.model'

export class PMEntryCreateLocationSheet extends ReatomLitElement {
  static elementName = 'pm-entry-create-location-sheet' as const

  static properties = {
    model: {attribute: false},
  }

  static styles = css`
    :host {
      display: contents;
    }

    cv-bottom-sheet::part(body) {
      min-block-size: 0;
      padding: 0 var(--cv-space-4) var(--cv-space-4);
      overflow: hidden;
    }

    cv-bottom-sheet::part(footer) {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--cv-space-2);
      padding: 0 var(--cv-space-4) max(var(--cv-space-4), env(safe-area-inset-bottom));
      border-block-start: 0;
      background: var(--cv-color-surface);
    }

    .sheet-action::part(base) {
      inline-size: 100%;
      min-block-size: 48px;
    }
  `

  declare model: PMEntryCreateModel

  constructor() {
    super()
    this.model = new PMEntryCreateModel()
  }

  static define() {
    CVBottomSheet.define()
    CVButton.define()
    PMGroupTargetPickerMobile.define()
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  private handleSheetChange(event: CustomEvent<{open?: boolean}>): void {
    if (event.target !== event.currentTarget || event.detail.open !== false) return
    this.model.closeLocationSheet()
  }

  private handleTargetSelected(event: CustomEvent<{id?: string}>): void {
    if (event.detail.id) this.model.selectPendingTargetGroup(event.detail.id)
  }

  private handleCancel(): void {
    this.model.closeLocationSheet()
  }

  private handleConfirm(): void {
    this.model.confirmPendingTargetGroup()
  }

  protected override render() {
    const selectedId = this.model.pendingTargetGroupId() ?? this.model.targetGroupId() ?? ''

    return html`
      <cv-bottom-sheet
        .open=${this.model.locationSheetOpen()}
        @cv-change=${this.handleSheetChange}
      >
        <span slot="title">${i18n('entry:create:location-title' as never)}</span>
        <span slot="description">${i18n('entry:create:location-description' as never)}</span>
        ${this.model.locationSheetOpen()
          ? html`
              <pm-group-target-picker-mobile
                .selectedId=${selectedId}
                .entryId=${''}
                .disabledIds=${[]}
                @pm-group-target-selected=${this.handleTargetSelected}
              ></pm-group-target-picker-mobile>
            `
          : null}
        <cv-button
          class="sheet-action"
          slot="footer"
          type="button"
          variant="default"
          size="large"
          aria-label=${i18n('button:cancel')}
          @click=${this.handleCancel}
        >
          ${i18n('button:cancel')}
        </cv-button>
        <cv-button
          class="sheet-action"
          slot="footer"
          type="button"
          variant="primary"
          size="large"
          aria-label=${i18n('entry:create:location-select' as never)}
          .disabled=${!this.model.pendingTargetGroupId()}
          @click=${this.handleConfirm}
        >
          ${i18n('entry:create:location-select' as never)}
        </cv-button>
      </cv-bottom-sheet>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pm-entry-create-location-sheet': PMEntryCreateLocationSheet
  }
}
